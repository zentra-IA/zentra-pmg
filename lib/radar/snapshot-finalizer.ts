import { Prisma } from "@prisma/client";

import type {
  RadarSyncExecutionMetrics,
} from "./sync-engine";

export interface FinalizeRadarSnapshotParams {
  tx: Prisma.TransactionClient;
  snapshotId: string;
  companyId: string;
  metrics: RadarSyncExecutionMetrics;
  removedCount?: number;
}

export interface FinalizedRadarSnapshot {
  id: string;
  companyId: string;
  isCurrent: boolean;
  status: string;
  processedRows: number;
  validRows: number;
  createdCount: number;
  updatedCount: number;
  removedCount: number;
  finishedAt: Date | null;
}

interface ActivatedSnapshotRow {
  id: string;
  company_id: string;
  is_current: boolean;
  status: string;
  processed_rows: number;
  valid_rows: number;
  created_count: number;
  updated_count: number;
  removed_count: number;
  finished_at: Date | null;
}

export async function finalizeRadarSnapshot({
  tx,
  snapshotId,
  companyId,
  metrics,
  removedCount = 0,
}: FinalizeRadarSnapshotParams): Promise<FinalizedRadarSnapshot> {
  if (!snapshotId) {
    throw new Error("snapshotId é obrigatório.");
  }

  if (!companyId) {
    throw new Error("companyId é obrigatório.");
  }

  if (removedCount < 0) {
    throw new Error(
      "removedCount não pode ser negativo."
    );
  }

  const snapshot =
    await tx.radar_snapshots.findUnique({
      where: {
        id: snapshotId,
      },
      select: {
        id: true,
        company_id: true,
        status: true,
        is_current: true,
        valid_rows: true,
        requires_confirmation: true,
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

  if (snapshot.is_current) {
    throw new Error(
      "O snapshot já está ativo."
    );
  }

  if (snapshot.requires_confirmation) {
    throw new Error(
      "O snapshot exige confirmação administrativa."
    );
  }

  const linkCount =
    await tx.radar_snapshot_prospects.count({
      where: {
        snapshot_id: snapshotId,
        company_id: companyId,
      },
    });

  if (metrics.processed !== snapshot.valid_rows) {
    throw new Error(
      [
        "Quantidade processada inconsistente.",
        `valid_rows=${snapshot.valid_rows}.`,
        `processed=${metrics.processed}.`,
      ].join(" ")
    );
  }

  if (metrics.linked !== snapshot.valid_rows) {
    throw new Error(
      [
        "Quantidade de vínculos informada é inconsistente.",
        `valid_rows=${snapshot.valid_rows}.`,
        `linked=${metrics.linked}.`,
      ].join(" ")
    );
  }

  if (linkCount !== snapshot.valid_rows) {
    throw new Error(
      [
        "Quantidade de vínculos no banco é inconsistente.",
        `valid_rows=${snapshot.valid_rows}.`,
        `links=${linkCount}.`,
      ].join(" ")
    );
  }

  const metricTotal =
    metrics.created +
    metrics.updated +
    metrics.unchanged;

  if (metricTotal !== metrics.processed) {
    throw new Error(
      [
        "Soma das métricas inconsistente.",
        `created=${metrics.created}.`,
        `updated=${metrics.updated}.`,
        `unchanged=${metrics.unchanged}.`,
        `processed=${metrics.processed}.`,
      ].join(" ")
    );
  }

  /*
   * Primeiro registra todas as métricas.
   *
   * A função SQL activate_radar_snapshot exige que o status
   * esteja como "completed".
   */
  await tx.radar_snapshots.update({
    where: {
      id: snapshotId,
    },
    data: {
      status: "completed",

      processed_rows: metrics.processed,
      created_count: metrics.created,
      updated_count: metrics.updated,
      removed_count: removedCount,

      progress_percent: 100,
      finished_at: new Date(),
      error: null,
      error_message: null,

      metadata: {
        syncMetrics: {
          processed: metrics.processed,
          created: metrics.created,
          updated: metrics.updated,
          unchanged: metrics.unchanged,
          linked: metrics.linked,
          removed: removedCount,
        },
      },
    },
  });

  /*
   * A função SQL:
   *
   * - valida a integridade;
   * - desativa o snapshot anterior;
   * - ativa este snapshot;
   * - executa tudo atomicamente.
   */
  const activatedRows =
    await tx.$queryRaw<ActivatedSnapshotRow[]>(
      Prisma.sql`
        select *
        from public.activate_radar_snapshot(
          ${snapshotId}::uuid
        )
      `
    );

  const activated = activatedRows[0];

  if (!activated) {
    throw new Error(
      "A função de ativação não retornou o snapshot."
    );
  }

  if (!activated.is_current) {
    throw new Error(
      "O snapshot não foi marcado como atual."
    );
  }

  return {
    id: activated.id,
    companyId: activated.company_id,
    isCurrent: activated.is_current,
    status: activated.status,
    processedRows: activated.processed_rows,
    validRows: activated.valid_rows,
    createdCount: activated.created_count,
    updatedCount: activated.updated_count,
    removedCount: activated.removed_count,
    finishedAt: activated.finished_at,
  };
}