import { Prisma } from "@prisma/client";

export type RadarSyncAction =
  | "create"
  | "update"
  | "unchanged";

export interface RadarSyncPlanItem {
  externalCustomerId: string;
  prospectId: string | null;
  action: RadarSyncAction;
  changedFields: string[];
}

export interface RadarSyncPlanMetrics {
  stagingRows: number;
  validRows: number;
  existingCustomers: number;
  newCustomers: number;
  changedCustomers: number;
  unchangedCustomers: number;
  absentFromNewSnapshot: number;
}

export interface RadarSyncPlan {
  metrics: RadarSyncPlanMetrics;

  /**
   * Apenas uma amostra para inspeção.
   * O worker definitivo não carregará 300 mil itens na memória.
   */
  items: RadarSyncPlanItem[];

  currentSnapshotId: string | null;
}

interface BuildRadarSyncPlanParams {
  tx: Prisma.TransactionClient;
  snapshotId: string;
  companyId: string;
  sampleLimit?: number;
}

interface CountResult {
  count: bigint | number | string;
}

function countToNumber(
  value: bigint | number | string | null | undefined
): number {
  if (value === null || value === undefined) {
    return 0;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(
      `Não foi possível converter a contagem: ${String(value)}`
    );
  }

  return parsed;
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

function normalizeDate(
  value: Date | null | undefined
): string | null {
  if (!value) {
    return null;
  }

  const year = value.getUTCFullYear();

  // Datas de 1900 normalmente representam campo vazio
  // ou valor sentinela da planilha.
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

function findChangedFields(
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
  prospect: {
    name: string;
    city: string | null;
    phone1: string | null;
    creditLimit: number | null;
    paymentMethod: string | null;
    lastTransferAt: Date | null;
    lastActivationAt: Date | null;
    lastOrderAt: Date | null;
  }
): string[] {
  const changedFields: string[] = [];

  if (
    normalizeText(staging.name) !==
    normalizeText(prospect.name)
  ) {
    changedFields.push("name");
  }

  if (
    normalizeText(staging.zone) !==
    normalizeText(prospect.city)
  ) {
    changedFields.push("city");
  }

  if (
    normalizeText(staging.normalized_phone) !==
    normalizeText(prospect.phone1)
  ) {
    changedFields.push("phone1");
  }

  if (
    normalizeMoney(staging.credit_limit) !==
    normalizeMoney(prospect.creditLimit)
  ) {
    changedFields.push("creditLimit");
  }

  if (
    normalizeText(staging.payment_methods) !==
    normalizeText(prospect.paymentMethod)
  ) {
    changedFields.push("paymentMethod");
  }

  if (
    normalizeDate(staging.last_transfer_at) !==
    normalizeDate(prospect.lastTransferAt)
  ) {
    changedFields.push("lastTransferAt");
  }

  if (
    normalizeDate(staging.last_activation_at) !==
    normalizeDate(prospect.lastActivationAt)
  ) {
    changedFields.push("lastActivationAt");
  }

  if (
    normalizeDate(staging.last_order_at) !==
    normalizeDate(prospect.lastOrderAt)
  ) {
    changedFields.push("lastOrderAt");
  }

  return changedFields;
}

export async function buildRadarSyncPlan({
  tx,
  snapshotId,
  companyId,
  sampleLimit = 100,
}: BuildRadarSyncPlanParams): Promise<RadarSyncPlan> {
  if (!snapshotId) {
    throw new Error("snapshotId é obrigatório.");
  }

  if (!companyId) {
    throw new Error("companyId é obrigatório.");
  }

  if (sampleLimit < 0 || sampleLimit > 1_000) {
    throw new Error(
      "sampleLimit deve estar entre 0 e 1.000."
    );
  }

  const snapshot = await tx.radar_snapshots.findUnique({
    where: {
      id: snapshotId,
    },
    select: {
      id: true,
      company_id: true,
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
      "O snapshot não pertence à empresa informada."
    );
  }

  const currentSnapshot =
    await tx.radar_snapshots.findFirst({
      where: {
        company_id: companyId,
        is_current: true,
      },
      select: {
        id: true,
      },
    });

  const stagingRows =
    await tx.radar_import_staging.count({
      where: {
        snapshot_id: snapshotId,
      },
    });

  const validRows =
    await tx.radar_import_staging.count({
      where: {
        snapshot_id: snapshotId,
        validation_status: "valid",
        external_customer_id: {
          not: null,
        },
      },
    });

  /*
   * As métricas abaixo são calculadas diretamente no PostgreSQL.
   * Isso evita carregar centenas de milhares de linhas na memória.
   */

  const existingResult =
    await tx.$queryRaw<CountResult[]>(Prisma.sql`
      select count(*) as count
      from public.radar_import_staging s
      inner join public."Prospect" p
        on p.company_id = s.company_id
       and p.external_id = s.external_customer_id
      where s.snapshot_id = ${snapshotId}::uuid
        and s.company_id = ${companyId}::uuid
        and s.validation_status = 'valid'
        and s.external_customer_id is not null
        and btrim(s.external_customer_id) <> ''
    `);

  const existingCustomers = countToNumber(
    existingResult[0]?.count
  );

  const changedResult =
    await tx.$queryRaw<CountResult[]>(Prisma.sql`
      select count(*) as count
      from public.radar_import_staging s
      inner join public."Prospect" p
        on p.company_id = s.company_id
       and p.external_id = s.external_customer_id
      where s.snapshot_id = ${snapshotId}::uuid
        and s.company_id = ${companyId}::uuid
        and s.validation_status = 'valid'
        and s.external_customer_id is not null
        and (
          p.name is distinct from s.name
          or p.city is distinct from s.zone
          or p.phone1 is distinct from s.normalized_phone
          or p.credit_limit is distinct from
             cast(s.credit_limit as double precision)
          or p.payment_method is distinct from
             s.payment_methods
          or (
  case
    when p.last_transfer_at is null
      or extract(year from p.last_transfer_at) <= 1900
    then null
    else p.last_transfer_at::date
  end
) is distinct from (
  case
    when s.last_transfer_at is null
      or extract(year from s.last_transfer_at) <= 1900
    then null
    else s.last_transfer_at::date
  end
)

or (
  case
    when p.last_activation_at is null
      or extract(year from p.last_activation_at) <= 1900
    then null
    else p.last_activation_at::date
  end
) is distinct from (
  case
    when s.last_activation_at is null
      or extract(year from s.last_activation_at) <= 1900
    then null
    else s.last_activation_at::date
  end
)

or (
  case
    when p.last_order_at is null
      or extract(year from p.last_order_at) <= 1900
    then null
    else p.last_order_at::date
  end
) is distinct from (
  case
    when s.last_order_at is null
      or extract(year from s.last_order_at) <= 1900
    then null
    else s.last_order_at::date
  end
)
        )
    `);

  const changedCustomers = countToNumber(
    changedResult[0]?.count
  );

  let absentFromNewSnapshot = 0;

  /*
   * "Ausentes" são comparados somente com o snapshot atual.
   * Não usamos todos os Prospects da empresa, pois Prospect também
   * pode ser utilizado por CRM, campanhas e outros módulos.
   */
  if (
    currentSnapshot &&
    currentSnapshot.id !== snapshotId
  ) {
    const absentResult =
      await tx.$queryRaw<CountResult[]>(Prisma.sql`
        select count(*) as count
        from public.radar_snapshot_prospects rsp
        inner join public."Prospect" p
          on p.id = rsp.prospect_id
        where rsp.snapshot_id =
          ${currentSnapshot.id}::uuid
          and rsp.company_id =
          ${companyId}::uuid
          and not exists (
            select 1
            from public.radar_import_staging s
            where s.snapshot_id =
              ${snapshotId}::uuid
              and s.company_id =
              ${companyId}::uuid
              and s.validation_status = 'valid'
              and s.external_customer_id =
                p.external_id
          )
      `);

    absentFromNewSnapshot = countToNumber(
      absentResult[0]?.count
    );
  }

  const newCustomers = Math.max(
    validRows - existingCustomers,
    0
  );

  const unchangedCustomers = Math.max(
    existingCustomers - changedCustomers,
    0
  );

  const items: RadarSyncPlanItem[] = [];

  if (sampleLimit > 0) {
    const stagingSample =
      await tx.radar_import_staging.findMany({
        where: {
          snapshot_id: snapshotId,
          company_id: companyId,
          validation_status: "valid",
          external_customer_id: {
            not: null,
          },
        },
        orderBy: {
          id: "asc",
        },
        take: sampleLimit,
        select: {
          external_customer_id: true,
          name: true,
          zone: true,
          normalized_phone: true,
          credit_limit: true,
          payment_methods: true,
          last_transfer_at: true,
          last_activation_at: true,
          last_order_at: true,
        },
      });

    const externalIds = stagingSample
      .map((row) => row.external_customer_id)
      .filter(
        (value): value is string =>
          Boolean(value)
      );

    const existingProspects =
      externalIds.length === 0
        ? []
        : await tx.prospect.findMany({
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

    for (const stagingRow of stagingSample) {
      const externalCustomerId =
        stagingRow.external_customer_id;

      if (!externalCustomerId) {
        continue;
      }

      const prospect =
        prospectByExternalId.get(
          externalCustomerId
        );

      if (!prospect) {
        items.push({
          externalCustomerId,
          prospectId: null,
          action: "create",
          changedFields: [],
        });

        continue;
      }

      const changedFields = findChangedFields(
        stagingRow,
        prospect
      );

      items.push({
        externalCustomerId,
        prospectId: prospect.id,
        action:
          changedFields.length > 0
            ? "update"
            : "unchanged",
        changedFields,
      });
    }
  }

  return {
    currentSnapshotId:
      currentSnapshot?.id ?? null,

    metrics: {
      stagingRows,
      validRows,
      existingCustomers,
      newCustomers,
      changedCustomers,
      unchangedCustomers,
      absentFromNewSnapshot,
    },

    items,
  };
}