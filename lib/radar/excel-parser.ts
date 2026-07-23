import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

import {
  normalizeAndValidateRadarRow,
  summarizeRadarRows,
} from "./validate-row";

import { validateRadarHeaders } from "./validate-headers";

import type {
  RadarNormalizedRow,
  RadarRawRow,
  RadarValidationSummary,
} from "./types";

export interface RadarExcelParseResult {
  fileName: string;
  sheetName: string;

  headerValidation: ReturnType<
    typeof validateRadarHeaders
  >;

  rows: RadarNormalizedRow[];
  summary: RadarValidationSummary;
}

export function parseRadarExcelFile(
  filePath: string
): RadarExcelParseResult {
  const absolutePath = path.resolve(filePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(
      `Arquivo não encontrado: ${absolutePath}`
    );
  }

  const workbook = XLSX.readFile(absolutePath, {
    cellDates: true,
    raw: true,
  });

  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    throw new Error(
      "A planilha não possui nenhuma aba."
    );
  }

  const sheet = workbook.Sheets[sheetName];

  if (!sheet) {
    throw new Error(
      `Não foi possível acessar a aba ${sheetName}.`
    );
  }

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(
    sheet,
    {
      header: 1,
      defval: null,
      raw: true,
      blankrows: false,
    }
  );

  if (matrix.length === 0) {
    throw new Error("A planilha está vazia.");
  }

  const firstRow = matrix[0] ?? [];
  const headerValidation =
    validateRadarHeaders(firstRow);

  if (!headerValidation.valid) {
    throw new Error(
      [
        "Cabeçalhos obrigatórios ausentes:",
        headerValidation.missingRequired.join(", "),
      ].join(" ")
    );
  }

  const rawRows =
    XLSX.utils.sheet_to_json<RadarRawRow>(
      sheet,
      {
        defval: null,
        raw: true,
        blankrows: false,
      }
    );

  const context = {
    seenExternalIds: new Set<string>(),
  };

  const rows: RadarNormalizedRow[] =
    rawRows.map((rawRow, index) =>
      normalizeAndValidateRadarRow(
        rawRow,
        index + 2,
        context
      )
    );

  return {
    fileName: path.basename(absolutePath),
    sheetName,
    headerValidation,
    rows,
    summary: summarizeRadarRows(rows),
  };
}