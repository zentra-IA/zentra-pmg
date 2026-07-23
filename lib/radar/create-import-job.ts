import { prisma } from "@/lib/prisma";

interface CreateRadarImportJobParams {
  companyId: string;
  branchId: string | null;
  userId: string;
  fileName: string;
}

export async function createPendingRadarImport(
  params: CreateRadarImportJobParams
) {
  const snapshot =
    await prisma.radar_snapshots.create({
      data: {
        company_id: params.companyId,
        branch_id: params.branchId,
        uploaded_by_user_id: params.userId,
        file_name: params.fileName,

        status: "pending",
        is_current: false,

        total_rows: 0,
        valid_rows: 0,
        processed_rows: 0,
        progress_percent: 0,

        metadata: {
          source: "radar-import-v2",
        },
      },
    });

  return snapshot;
}

export async function attachFileAndCreateJob(params: {
  snapshotId: string;
  companyId: string;
  branchId: string | null;
  fileName: string;
  storagePath: string;
}) {
  return prisma.$transaction(async (tx) => {
    await tx.radar_snapshots.update({
      where: {
        id: params.snapshotId,
      },
      data: {
        storage_path: params.storagePath,
      },
    });

    const job =
      await tx.prospectImportJob.create({
        data: {
          company_id: params.companyId,
          branch_id: params.branchId,
          fileName: params.fileName,

          snapshot_id: params.snapshotId,
          storage_path: params.storagePath,

          status: "PENDING",

          totalRows: 0,
          processed_rows: 0,
          valid_rows: 0,
          progress_percent: 0,
          attempts: 0,

          metadata: {
            source: "radar-import-v2",
          },
        },
      });

    return job;
  });
}

export async function deletePendingRadarSnapshot(
  snapshotId: string
): Promise<void> {
  await prisma.radar_snapshots.deleteMany({
    where: {
      id: snapshotId,
      is_current: false,
      status: "pending",
    },
  });
}