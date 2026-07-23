import { getRowValue, RADAR_HEADERS } from "./headers";
import {
  normalizeExternalCustomerId,
  normalizeOptionalText,
  normalizePhone,
  parseRadarDate,
  parseRadarMoney,
} from "./normalizers";

import type {
  RadarNormalizedRow,
  RadarRawRow,
  RadarRowValidationContext,
  RadarValidationSummary,
} from "./types";

export function normalizeAndValidateRadarRow(
  rawRow: RadarRawRow,
  rowNumber: number,
  context: RadarRowValidationContext
): RadarNormalizedRow {
  const errors: string[] = [];

  const externalCustomerId =
    normalizeExternalCustomerId(
      getRowValue(
        rawRow,
        RADAR_HEADERS.externalCustomerId
      )
    );

  const name = normalizeOptionalText(
    getRowValue(rawRow, RADAR_HEADERS.name)
  );

  const zone = normalizeOptionalText(
    getRowValue(rawRow, RADAR_HEADERS.zone)
  );

  const rawPhone = getRowValue(
    rawRow,
    RADAR_HEADERS.phone
  );

  const phone = normalizeOptionalText(rawPhone);
  const normalizedPhone = normalizePhone(rawPhone);

  const registrationDate = parseRadarDate(
    getRowValue(
      rawRow,
      RADAR_HEADERS.registrationDate
    )
  );

  const lastTransferAt = parseRadarDate(
    getRowValue(
      rawRow,
      RADAR_HEADERS.lastTransferAt
    )
  );

  const lastActivationAt = parseRadarDate(
    getRowValue(
      rawRow,
      RADAR_HEADERS.lastActivationAt
    )
  );

  const lastOrderAt = parseRadarDate(
    getRowValue(
      rawRow,
      RADAR_HEADERS.lastOrderAt
    )
  );

  const creditLimit = parseRadarMoney(
    getRowValue(
      rawRow,
      RADAR_HEADERS.creditLimit
    )
  );

  const paymentMethods = normalizeOptionalText(
    getRowValue(
      rawRow,
      RADAR_HEADERS.paymentMethods
    )
  );

  if (!externalCustomerId) {
    errors.push("ID do cliente não informado.");
  }

  if (!name) {
    errors.push("Nome do cliente não informado.");
  }

  if (phone && !normalizedPhone) {
    errors.push("Telefone inválido.");
  }

  let validationStatus: RadarNormalizedRow["validationStatus"] =
    errors.length > 0 ? "invalid" : "valid";

  if (externalCustomerId) {
    if (context.seenExternalIds.has(externalCustomerId)) {
      validationStatus = "duplicated";
      errors.push(
        `ID ${externalCustomerId} duplicado na planilha.`
      );
    } else {
      context.seenExternalIds.add(externalCustomerId);
    }
  }

  return {
    rowNumber,

    externalCustomerId,
    name,
    zone,

    registrationDate,
    lastTransferAt,
    lastActivationAt,
    lastOrderAt,

    phone,
    normalizedPhone,

    creditLimit,
    paymentMethods,

    validationStatus,
    validationErrors: errors,

    sourcePayload: rawRow,
  };
}

export function summarizeRadarRows(
  rows: RadarNormalizedRow[]
): RadarValidationSummary {
  return rows.reduce<RadarValidationSummary>(
    (summary, row) => {
      summary.totalRows++;

      if (row.validationStatus === "valid") {
        summary.validRows++;
      }

      if (row.validationStatus === "invalid") {
        summary.invalidRows++;
      }

      if (row.validationStatus === "duplicated") {
        summary.duplicatedRows++;
      }

      if (
        row.phone &&
        !row.normalizedPhone
      ) {
        summary.invalidPhoneRows++;
      }

      return summary;
    },
    {
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
      duplicatedRows: 0,
      invalidPhoneRows: 0,
    }
  );
}