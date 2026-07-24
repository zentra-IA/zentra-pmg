import path from "node:path";

import { prisma } from "../lib/prisma";
import { parseRadarExcelFile } from "../lib/radar/excel-parser";
import {
  clearRadarStaging,
  insertRadarStagingRows,
} from "../lib/radar/staging-repository";
import { buildRadarSyncPlan } from "../lib/radar/sync-planner";

async function findCompanyContext(): Promise<{
  companyId: string;
  branchId: string | null;
}> {
  const importJob =
    await prisma.prospectImportJob.findFirst({
      orderBy: {
        createdAt: "desc",
      },
      select: {
        company_id: true,
        branch_id: true,
      },
    });

  if (importJob) {
    return {
      companyId: importJob.company_id,
      branchId: importJob.branch_id,
    };
  }

  const prospect = await prisma.prospect.findFirst({
    select: {
      company_id: true,
      branch_id: true,
    },
  });

  if (!prospect) {
    throw new Error(
      "Nenhuma empresa encontrada para o teste."
    );
  }

  return {
    companyId: prospect.company_id,
    branchId: prospect.branch_id,
  };
}

async function main(): Promise<void> {
  const filePath = process.argv[2];

  if (!filePath) {
    throw new Error(
      'Use: npx tsx scripts/test-radar-sync-plan.ts "C:\\caminho\\planilha.xlsx"'
    );
  }

  const parsed = parseRadarExcelFile(
    path.resolve(filePath)
  );

  const context = await findCompanyContext();

  const prospectsBefore =
    await prisma.prospect.count({
      where: {
        company_id: context.companyId,
      },
    });

  let snapshotId: string | null = null;

  try {
    const snapshot =
      await prisma.radar_snapshots.create({
        data: {
          company_id: context.companyId,
          branch_id: context.branchId,
          file_name: `[TESTE PLANO] ${parsed.fileName}`,
          status: "planning_test",
          total_rows: parsed.summary.totalRows,
          valid_rows: parsed.summary.validRows,
          invalid_count:
            parsed.summary.invalidRows,
          duplicated_count:
            parsed.summary.duplicatedRows,
          invalid_phone_count:
            parsed.summary.invalidPhoneRows,
          is_current: false,
          metadata: {
            temporaryTest: true,
            purpose: "sync-plan",
          },
        },
      });

    snapshotId = snapshot.id;

    await insertRadarStagingRows({
      snapshotId,
      companyId: context.companyId,
      branchId: context.branchId,
      rows: parsed.rows,
      batchSize: 500,
    });

    const plan = await prisma.$transaction(
      async (tx) =>
        buildRadarSyncPlan({
          tx,
          snapshotId: snapshot.id,
          companyId: context.companyId,
          sampleLimit: 20,
        }),
      {
        timeout: 60_000,
      }
    );

    console.log("\n=== PLANO DE SINCRONIZAÇÃO ===");
    console.table(plan.metrics);

    console.log(
      "\nSnapshot atual:",
      plan.currentSnapshotId ?? "nenhum"
    );

    console.log("\n=== AMOSTRA ===");

    console.table(
      plan.items.map((item) => ({
        externalId:
          item.externalCustomerId,
        action: item.action,
        prospectId:
          item.prospectId ?? "-",
        changedFields:
          item.changedFields.join(", ") || "-",
      }))
    );

    const prospectsAfterPlanning =
      await prisma.prospect.count({
        where: {
          company_id: context.companyId,
        },
      });

    if (
      prospectsAfterPlanning !== prospectsBefore
    ) {
      throw new Error(
        [
          "O planejador alterou a quantidade de Prospects.",
          `Antes: ${prospectsBefore}.`,
          `Depois: ${prospectsAfterPlanning}.`,
        ].join(" ")
      );
    }

    console.log(
      "\nPlanejamento concluído sem alterar Prospect."
    );

    console.log(
      "Prospects antes:",
      prospectsBefore
    );

    console.log(
      "Prospects depois:",
      prospectsAfterPlanning
    );
  } finally {
    if (snapshotId) {
      const removed =
        await clearRadarStaging(snapshotId);

      await prisma.radar_snapshots.delete({
        where: {
          id: snapshotId,
        },
      });

      console.log(
        "\nStaging temporária removida:",
        removed
      );

      console.log(
        "Snapshot temporário removido."
      );
    }

    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error(
    "\nFalha no planejamento da sincronização:"
  );

  console.error(
    error instanceof Error
      ? error.stack
      : error
  );

  await prisma.$disconnect();
  process.exit(1);
});