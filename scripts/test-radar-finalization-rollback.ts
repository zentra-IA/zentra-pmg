import path from "node:path";
import { Prisma } from "@prisma/client";

import { prisma } from "../lib/prisma";
import { parseRadarExcelFile } from "../lib/radar/excel-parser";
import { executeRadarSync } from "../lib/radar/sync-engine";
import {
  finalizeRadarSnapshot,
} from "../lib/radar/snapshot-finalizer";

class IntentionalRollbackError extends Error {
  constructor() {
    super("RADAR_FINALIZATION_TEST_ROLLBACK");
    this.name = "IntentionalRollbackError";
  }
}

async function findCompanyContext(): Promise<{
  companyId: string;
  branchId: string | null;
}> {
  const job =
    await prisma.prospectImportJob.findFirst({
      orderBy: {
        createdAt: "desc",
      },
      select: {
        company_id: true,
        branch_id: true,
      },
    });

  if (!job) {
    throw new Error(
      "Nenhum contexto de empresa encontrado."
    );
  }

  return {
    companyId: job.company_id,
    branchId: job.branch_id,
  };
}

async function getCounts(companyId: string) {
  const [
    prospects,
    snapshots,
    staging,
    links,
    currentSnapshots,
  ] = await Promise.all([
    prisma.prospect.count({
      where: {
        company_id: companyId,
      },
    }),

    prisma.radar_snapshots.count({
      where: {
        company_id: companyId,
      },
    }),

    prisma.radar_import_staging.count({
      where: {
        company_id: companyId,
      },
    }),

    prisma.radar_snapshot_prospects.count({
      where: {
        company_id: companyId,
      },
    }),

    prisma.radar_snapshots.count({
      where: {
        company_id: companyId,
        is_current: true,
      },
    }),
  ]);

  return {
    prospects,
    snapshots,
    staging,
    links,
    currentSnapshots,
  };
}

async function main(): Promise<void> {
  const filePath = process.argv[2];

  if (!filePath) {
    throw new Error(
      'Use: npx tsx scripts/test-radar-finalization-rollback.ts "C:\\caminho\\planilha.xlsx"'
    );
  }

  const parsed = parseRadarExcelFile(
    path.resolve(filePath)
  );

  const context = await findCompanyContext();

  const before = await getCounts(
    context.companyId
  );

  console.log("\n=== ESTADO ANTES ===");
  console.table(before);

  try {
    await prisma.$transaction(
      async (tx) => {
        const snapshot =
          await tx.radar_snapshots.create({
            data: {
              company_id: context.companyId,
              branch_id: context.branchId,

              file_name:
                `[FINALIZATION TEST] ${parsed.fileName}`,

              status: "processing",
              total_rows:
                parsed.summary.totalRows,

              valid_rows:
                parsed.summary.validRows,

              invalid_count:
                parsed.summary.invalidRows,

              duplicated_count:
                parsed.summary.duplicatedRows,

              invalid_phone_count:
                parsed.summary.invalidPhoneRows,

              is_current: false,
              started_at: new Date(),

              metadata: {
                temporaryTest: true,
                rollbackRequired: true,
                purpose: "atomic-finalization",
              },
            },
          });

        const stagingData:
          Prisma.radar_import_stagingCreateManyInput[] =
          parsed.rows.map((row) => ({
            snapshot_id: snapshot.id,
            company_id: context.companyId,
            branch_id: context.branchId,

            external_customer_id:
              row.externalCustomerId,

            name: row.name,
            zone: row.zone,

            registration_date:
              row.registrationDate,

            last_transfer_at:
              row.lastTransferAt,

            last_activation_at:
              row.lastActivationAt,

            last_order_at:
              row.lastOrderAt,

            phone: row.phone,
            normalized_phone:
              row.normalizedPhone,

            credit_limit:
              row.creditLimit,

            payment_methods:
              row.paymentMethods,

            row_number:
              row.rowNumber,

            validation_status:
              row.validationStatus,

            validation_error:
              row.validationErrors.length > 0
                ? row.validationErrors.join(" | ")
                : null,

            source_payload:
              row.sourcePayload as
                Prisma.InputJsonValue,
          }));

        await tx.radar_import_staging.createMany({
          data: stagingData,
        });

        const metrics = await executeRadarSync({
          tx,
          snapshotId: snapshot.id,
          companyId: context.companyId,
          batchSize: 500,

          onProgress: (processed, total) => {
            console.log(
              `Sincronização: ${processed}/${total}`
            );
          },
        });

        console.log(
          "\n=== MÉTRICAS DA SINCRONIZAÇÃO ==="
        );

        console.table(metrics);

        const finalized =
          await finalizeRadarSnapshot({
            tx,
            snapshotId: snapshot.id,
            companyId: context.companyId,
            metrics,
            removedCount: 0,
          });

        console.log(
          "\n=== SNAPSHOT FINALIZADO ==="
        );

        console.table({
          id: finalized.id,
          status: finalized.status,
          isCurrent: finalized.isCurrent,
          processedRows:
            finalized.processedRows,
          validRows: finalized.validRows,
          createdCount:
            finalized.createdCount,
          updatedCount:
            finalized.updatedCount,
          removedCount:
            finalized.removedCount,
        });

        const currentSnapshots =
          await tx.radar_snapshots.count({
            where: {
              company_id: context.companyId,
              is_current: true,
            },
          });

        if (currentSnapshots !== 1) {
          throw new Error(
            `Esperado 1 snapshot atual, encontrado ${currentSnapshots}.`
          );
        }

        if (!finalized.isCurrent) {
          throw new Error(
            "O snapshot não foi ativado."
          );
        }

        if (finalized.status !== "completed") {
          throw new Error(
            `Status inesperado: ${finalized.status}`
          );
        }

        console.log(
          "\nFinalização e ativação aprovadas."
        );

        console.log(
          "Forçando rollback proposital..."
        );

        throw new IntentionalRollbackError();
      },
      {
        maxWait: 30_000,
        timeout: 120_000,
      }
    );
  } catch (error) {
    if (
      !(
        error instanceof
        IntentionalRollbackError
      )
    ) {
      throw error;
    }

    console.log(
      "\nRollback proposital executado."
    );
  }

  const after = await getCounts(
    context.companyId
  );

  console.log("\n=== ESTADO DEPOIS ===");
  console.table(after);

  if (
    JSON.stringify(before) !==
    JSON.stringify(after)
  ) {
    throw new Error(
      "O rollback não restaurou o estado original."
    );
  }

  console.log(
    "\nTeste concluído: ativação atômica validada e nenhuma alteração permaneceu."
  );
}

main()
  .catch((error) => {
    console.error(
      "\nFalha no teste de finalização:"
    );

    console.error(
      error instanceof Error
        ? error.stack
        : error
    );

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });