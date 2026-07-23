import path from "node:path";

import { prisma } from "../lib/prisma";
import { parseRadarExcelFile } from "../lib/radar/excel-parser";

import {
  clearRadarStaging,
  countRadarStagingByStatus,
  countRadarStagingRows,
  insertRadarStagingRows,
} from "../lib/radar/staging-repository";

async function findSafeCompanyContext(): Promise<{
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
      "Não foi possível localizar uma empresa para o teste."
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
      [
        "Informe o caminho da planilha.",
        "",
        "Exemplo:",
        'npx tsx scripts/test-radar-staging.ts "C:\\caminho\\teste.xlsx"',
      ].join("\n")
    );
  }

  const absolutePath = path.resolve(filePath);
  const parsed = parseRadarExcelFile(absolutePath);

  const context = await findSafeCompanyContext();

  console.log("\n=== CONTEXTO DO TESTE ===");
  console.log("Empresa:", context.companyId);
  console.log("Filial:", context.branchId ?? "sem filial");
  console.log("Arquivo:", parsed.fileName);
  console.log("Linhas:", parsed.summary.totalRows);

  let snapshotId: string | null = null;

  try {
    const snapshot =
      await prisma.radar_snapshots.create({
        data: {
          company_id: context.companyId,
          branch_id: context.branchId,
          file_name: `[TESTE] ${parsed.fileName}`,

          status: "testing",
          total_rows: parsed.summary.totalRows,
          valid_rows: parsed.summary.validRows,
          duplicated_count:
            parsed.summary.duplicatedRows,
          invalid_count:
            parsed.summary.invalidRows,
          invalid_phone_count:
            parsed.summary.invalidPhoneRows,

          processed_rows: 0,
          progress_percent: 0,

          is_current: false,

          metadata: {
            temporaryTest: true,
            source: "scripts/test-radar-staging.ts",
          },
        },
      });

    snapshotId = snapshot.id;

    console.log("\nSnapshot temporário criado:");
    console.log(snapshotId);
    console.log(
      "is_current:",
      snapshot.is_current
    );

    const insertedRows =
      await insertRadarStagingRows({
        snapshotId,
        companyId: context.companyId,
        branchId: context.branchId,
        rows: parsed.rows,
        batchSize: 500,

        onProgress: (processed, total) => {
          const percent =
            total === 0
              ? 100
              : Number(
                  (
                    (processed / total) *
                    100
                  ).toFixed(2)
                );

          console.log(
            `Progresso: ${processed}/${total} (${percent}%)`
          );
        },
      });

    await prisma.radar_snapshots.update({
      where: {
        id: snapshotId,
      },
      data: {
        processed_rows: insertedRows,
        progress_percent: 100,
        status: "testing_completed",
        finished_at: new Date(),
      },
    });

    const databaseCount =
      await countRadarStagingRows(snapshotId);

    const statusCounts =
      await countRadarStagingByStatus(
        snapshotId
      );

    console.log("\n=== RESULTADO ===");
    console.log(
      "Linhas preparadas:",
      parsed.rows.length
    );
    console.log(
      "Linhas inseridas:",
      insertedRows
    );
    console.log(
      "Linhas encontradas no banco:",
      databaseCount
    );
    console.log(
      "Contagem por status:",
      statusCounts
    );

    if (insertedRows !== parsed.rows.length) {
      throw new Error(
        `Quantidade inserida inconsistente: esperado ${parsed.rows.length}, inserido ${insertedRows}.`
      );
    }

    if (databaseCount !== parsed.rows.length) {
      throw new Error(
        `Contagem no banco inconsistente: esperado ${parsed.rows.length}, encontrado ${databaseCount}.`
      );
    }

    console.log(
      "\nTeste de staging concluído com sucesso."
    );
  } finally {
    if (snapshotId) {
      console.log(
        "\nLimpando os dados temporários..."
      );

      const removedStagingRows =
        await clearRadarStaging(snapshotId);

      await prisma.radar_snapshots.delete({
        where: {
          id: snapshotId,
        },
      });

      console.log(
        "Linhas removidas da staging:",
        removedStagingRows
      );

      console.log(
        "Snapshot temporário removido."
      );
    }

    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error("\nFalha no teste de staging:");

  if (error instanceof Error) {
    console.error(error.message);
    console.error(error.stack);
  } else {
    console.error(error);
  }

  await prisma.$disconnect();
  process.exit(1);
});