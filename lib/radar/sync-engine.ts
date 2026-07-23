import { Prisma } from "@prisma/client";

export interface RadarSyncExecutionMetrics {
  processed: number;
  created: number;
  updated: number;
  unchanged: number;
  linked: number;
}

interface ExecuteRadarSyncParams {
  tx: Prisma.TransactionClient;
  snapshotId: string;
  companyId: string;
  batchSize?: number;
  onProgress?: (
    processed: number,
    total: number
  ) => void;
}

interface ComparableProspect {
  id: string;
  name: string;
  city: string | null;
  phone1: string | null;
  creditLimit: number | null;
  paymentMethod: string | null;
  lastTransferAt: Date | null;
  lastActivationAt: Date | null;
  lastOrderAt: Date | null;
}

function normalizeText(
  value: string | null | undefined
): string | null {
  const normalized = String(value ?? "").trim();

  return normalized || null;
}

function normalizeMoney(
  value:
    | Prisma.Decimal
    | number
    | null
    | undefined
): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function normalizeBusinessDate(
  value: Date | null | undefined
): string | null {
  if (!value) {
    return null;
  }

  const year = value.getUTCFullYear();

  // Datas de 1900 são sentinelas da planilha.
  if (year <= 1900) {
    return null;
  }

  const month = String(
    value.getUTCMonth() + 1
  ).padStart(2, "0");

  const day = String(
    value.getUTCDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function sanitizeDateForDatabase(
  value: Date | null
): Date | null {
  if (!value) {
    return null;
  }

  if (value.getUTCFullYear() <= 1900) {
    return null;
  }

  return value;
}

function detectChangedFields(
  staging: {
    name: string | null;
    zone: string | null;
    normalized_phone: string | null;
    credit_limit: Prisma.Decimal | null;
    payment_methods: string | null;
    last_transfer_at: Date | null;
    last_activation_at: Date | null;
    last_order_at: Date | null;
  },
  prospect: ComparableProspect
): string[] {
  const fields: string[] = [];

  if (
    normalizeText(staging.name) !==
    normalizeText(prospect.name)
  ) {
    fields.push("name");
  }

  if (
    normalizeText(staging.zone) !==
    normalizeText(prospect.city)
  ) {
    fields.push("city");
  }

  if (
    normalizeText(staging.normalized_phone) !==
    normalizeText(prospect.phone1)
  ) {
    fields.push("phone1");
  }

  if (
    normalizeMoney(staging.credit_limit) !==
    normalizeMoney(prospect.creditLimit)
  ) {
    fields.push("creditLimit");
  }

  if (
    normalizeText(staging.payment_methods) !==
    normalizeText(prospect.paymentMethod)
  ) {
    fields.push("paymentMethod");
  }

  if (
    normalizeBusinessDate(
      staging.last_transfer_at
    ) !==
    normalizeBusinessDate(
      prospect.lastTransferAt
    )
  ) {
    fields.push("lastTransferAt");
  }

  if (
    normalizeBusinessDate(
      staging.last_activation_at
    ) !==
    normalizeBusinessDate(
      prospect.lastActivationAt
    )
  ) {
    fields.push("lastActivationAt");
  }

  if (
    normalizeBusinessDate(
      staging.last_order_at
    ) !==
    normalizeBusinessDate(
      prospect.lastOrderAt
    )
  ) {
    fields.push("lastOrderAt");
  }

  return fields;
}

export async function executeRadarSync({
  tx,
  snapshotId,
  companyId,
  batchSize = 500,
  onProgress,
}: ExecuteRadarSyncParams): Promise<RadarSyncExecutionMetrics> {
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

  const snapshot =
    await tx.radar_snapshots.findUnique({
      where: {
        id: snapshotId,
      },
      select: {
        company_id: true,
        branch_id: true,
        is_current: true,
      },
    });

  if (!snapshot) {
    throw new Error(
      `Snapshot não encontrado: ${snapshotId}`
    );
  }

  if (snapshot.company_id !== companyId) {
    throw new Error(
      "O snapshot não pertence à empresa."
    );
  }

  if (snapshot.is_current) {
    throw new Error(
      "A sincronização não pode executar sobre o snapshot atual."
    );
  }

  const total =
    await tx.radar_import_staging.count({
      where: {
        snapshot_id: snapshotId,
        company_id: companyId,
        validation_status: "valid",
        external_customer_id: {
          not: null,
        },
      },
    });

  const metrics: RadarSyncExecutionMetrics = {
    processed: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    linked: 0,
  };

  let lastId: bigint | null = null;

  while (metrics.processed < total) {
    const rows =
      await tx.radar_import_staging.findMany({
        where: {
          snapshot_id: snapshotId,
          company_id: companyId,
          validation_status: "valid",
          external_customer_id: {
            not: null,
          },

          ...(lastId !== null
            ? {
                id: {
                  gt: lastId,
                },
              }
            : {}),
        },

        orderBy: {
          id: "asc",
        },

        take: batchSize,

        select: {
          id: true,
          branch_id: true,
          external_customer_id: true,
          name: true,
          zone: true,
          normalized_phone: true,
          credit_limit: true,
          payment_methods: true,
          last_transfer_at: true,
          last_activation_at: true,
          last_order_at: true,
          source_payload: true,
        },
      });

    if (rows.length === 0) {
      break;
    }

    lastId = rows[rows.length - 1].id;

    const externalIds = rows
      .map((row) => row.external_customer_id)
      .filter(
        (value): value is string =>
          Boolean(value)
      );

    const existingProspects =
      await tx.prospect.findMany({
        where: {
          company_id: companyId,
          externalId: {
            in: externalIds,
          },
        },

        select: {
          id: true,
          externalId: true,
          name: true,
          city: true,
          phone1: true,
          creditLimit: true,
          paymentMethod: true,
          lastTransferAt: true,
          lastActivationAt: true,
          lastOrderAt: true,
        },
      });

    const prospectByExternalId = new Map(
      existingProspects
        .filter(
          (
            prospect
          ): prospect is typeof prospect & {
            externalId: string;
          } => Boolean(prospect.externalId)
        )
        .map((prospect) => [
          prospect.externalId,
          prospect,
        ])
    );

    const links: Array<{
      snapshot_id: string;
      prospect_id: string;
      company_id: string;
    }> = [];

    for (const row of rows) {
      const externalId =
        row.external_customer_id;

      if (!externalId) {
        throw new Error(
          `Linha de staging ${row.id} sem external_customer_id.`
        );
      }

      const existing =
        prospectByExternalId.get(externalId);

      let prospectId: string;

      if (!existing) {
        if (!row.name) {
          throw new Error(
            `Cliente ${externalId} sem nome obrigatório.`
          );
        }

        const created =
          await tx.prospect.create({
            data: {
              company_id: companyId,
              branch_id:
                row.branch_id ??
                snapshot.branch_id,

              externalId,
              name: row.name,
              city: row.zone,
              phone1: row.normalized_phone,

              creditLimit:
                normalizeMoney(
                  row.credit_limit
                ),

              paymentMethod:
                row.payment_methods,

              lastTransferAt:
                sanitizeDateForDatabase(
                  row.last_transfer_at
                ),

              lastActivationAt:
                sanitizeDateForDatabase(
                  row.last_activation_at
                ),

              lastOrderAt:
                sanitizeDateForDatabase(
                  row.last_order_at
                ),

              sourcePayload:
                row.source_payload === null
                  ? undefined
                  : (row.source_payload as Prisma.InputJsonValue),
            },

            select: {
              id: true,
            },
          });

        prospectId = created.id;
        metrics.created++;
      } else {
        prospectId = existing.id;

        const changedFields =
          detectChangedFields(
            row,
            existing
          );

        if (changedFields.length === 0) {
          metrics.unchanged++;
        } else {
          await tx.prospect.update({
            where: {
              id: existing.id,
            },

            data: {
              name:
                row.name ??
                existing.name,

              city: row.zone,

              phone1:
                row.normalized_phone,

              creditLimit:
                normalizeMoney(
                  row.credit_limit
                ),

              paymentMethod:
                row.payment_methods,

              lastTransferAt:
                sanitizeDateForDatabase(
                  row.last_transfer_at
                ),

              lastActivationAt:
                sanitizeDateForDatabase(
                  row.last_activation_at
                ),

              lastOrderAt:
                sanitizeDateForDatabase(
                  row.last_order_at
                ),

              sourcePayload:
                row.source_payload === null
                  ? undefined
                  : (row.source_payload as Prisma.InputJsonValue),
            },
          });

          metrics.updated++;
        }
      }

      links.push({
        snapshot_id: snapshotId,
        prospect_id: prospectId,
        company_id: companyId,
      });

      metrics.processed++;
    }

    const linkResult =
      await tx.radar_snapshot_prospects.createMany({
        data: links,
      });

    metrics.linked += linkResult.count;

    onProgress?.(
      metrics.processed,
      total
    );
  }

  if (metrics.processed !== total) {
    throw new Error(
      `Processamento incompleto. Esperado ${total}, processado ${metrics.processed}.`
    );
  }

  if (metrics.linked !== total) {
    throw new Error(
      `Vínculos incompletos. Esperado ${total}, criado ${metrics.linked}.`
    );
  }

  return metrics;
}