import { Prisma } from "@prisma/client";

import { prisma } from "../prisma";
import type { RadarNormalizedRow } from "./types";

const DEFAULT_BATCH_SIZE = 500;

export interface InsertRadarStagingParams {
  snapshotId: string;
  companyId: string;
  branchId?: string | null;
  rows: RadarNormalizedRow[];
  batchSize?: number;
  onProgress?: (processedRows: number, totalRows: number) => void;
}

function toStagingData(
  snapshotId: string,
  companyId: string,
  branchId: string | null,
  row: RadarNormalizedRow
): Prisma.radar_import_stagingCreateManyInput {
  return {
    snapshot_id: snapshotId,
    company_id: companyId,
    branch_id: branchId,

    external_customer_id: row.externalCustomerId,
    name: row.name,
    zone: row.zone,

    registration_date: row.registrationDate,
    last_transfer_at: row.lastTransferAt,
    last_activation_at: row.lastActivationAt,
    last_order_at: row.lastOrderAt,

    phone: row.phone,
    normalized_phone: row.normalizedPhone,

    credit_limit:
      row.creditLimit === null
        ? null
        : new Prisma.Decimal(row.creditLimit),

    payment_methods: row.paymentMethods,

    row_number: row.rowNumber,
    validation_status: row.validationStatus,
    validation_error:
      row.validationErrors.length > 0
        ? row.validationErrors.join(" | ")
        : null,

    source_payload:
      row.sourcePayload as Prisma.InputJsonValue,
  };
}

export async function insertRadarStagingRows({
  snapshotId,
  companyId,
  branchId = null,
  rows,
  batchSize = DEFAULT_BATCH_SIZE,
  onProgress,
}: InsertRadarStagingParams): Promise<number> {
  if (!snapshotId) {
    throw new Error("snapshotId é obrigatório.");
  }

  if (!companyId) {
    throw new Error("companyId é obrigatório.");
  }

  if (batchSize < 1 || batchSize > 2_000) {
    throw new Error(
      "batchSize deve estar entre 1 e 2.000."
    );
  }

  let insertedRows = 0;

  for (
    let startIndex = 0;
    startIndex < rows.length;
    startIndex += batchSize
  ) {
    const batch = rows.slice(
      startIndex,
      startIndex + batchSize
    );

    const data = batch.map((row) =>
      toStagingData(
        snapshotId,
        companyId,
        branchId,
        row
      )
    );

    const result =
      await prisma.radar_import_staging.createMany({
        data,
        // Não usar skipDuplicates neste teste.
        // Uma duplicidade deve causar erro para encontrarmos o problema.
      });

    insertedRows += result.count;

    onProgress?.(insertedRows, rows.length);
  }

  return insertedRows;
}

export async function countRadarStagingRows(
  snapshotId: string
): Promise<number> {
  return prisma.radar_import_staging.count({
    where: {
      snapshot_id: snapshotId,
    },
  });
}

export async function countRadarStagingByStatus(
  snapshotId: string
): Promise<Record<string, number>> {
  const result =
    await prisma.radar_import_staging.groupBy({
      by: ["validation_status"],
      where: {
        snapshot_id: snapshotId,
      },
      _count: {
        _all: true,
      },
    });

  return Object.fromEntries(
    result.map((item) => [
      item.validation_status,
      item._count._all,
    ])
  );
}

export async function clearRadarStaging(
  snapshotId: string
): Promise<number> {
  const result =
    await prisma.radar_import_staging.deleteMany({
      where: {
        snapshot_id: snapshotId,
      },
    });

  return result.count;
}