import path from "node:path";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { parseRadarExcelFile } from "../lib/radar/excel-parser";
import { executeRadarSync } from "../lib/radar/sync-engine";

class IntentionalRollbackError extends Error {
  constructor() {
    super("RADAR_SYNC_TEST_ROLLBACK");
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

async function getDatabaseCounts(
  companyId: string
): Promise<{
  prospects: number;
  snapshots: number;
  staging: number;
  links: number;
}> {
  const [
    prospects,
    snapshots,
    staging,
    links,
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
  ]);

  return {
    prospects,
    snapshots,
    staging,
    links,
  };
}

async function main(): Promise<void> {
  const filePath = process.argv[2];

  if (!filePath) {
    throw new Error(
      'Use: npx tsx scripts/test-radar-sync-rollback.ts "C:\\caminho\\planilha.xlsx"'
    );
  }

  const parsed = parseRadarExcelFile(
    path.resolve(filePath)
  );

  const context =
    await findCompanyContext();

  const before =
    await getDatabaseCounts(
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
              company_id:
                context.companyId,

              branch_id:
                context.branchId,

              file_name:
                `[ROLLBACK TEST] ${parsed.fileName}`,

              status:
                "rollback_test",

              total_rows:
                parsed.summary.totalRows,

              valid_rows:
                parsed.summary.validRows,

              duplicated_count:
                parsed.summary
                  .duplicatedRows,

              invalid_count:
                parsed.summary.invalidRows,

              invalid_phone_count:
                parsed.summary
                  .invalidPhoneRows,

              is_current: false,

              metadata: {
                temporaryTest: true,
                rollbackRequired: true,
              },
            },
          });

        const stagingData =
          parsed.rows.map((row) => ({
            snapshot_id:
              snapshot.id,

            company_id:
              context.companyId,

            branch_id:
              context.branchId,

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
              row.creditLimit === null
                ? null
                : row.creditLimit,

            payment_methods:
              row.paymentMethods,

            row_number:
              row.rowNumber,

            validation_status:
              row.validationStatus,

            validation_error:
              row.validationErrors.length
                ? row.validationErrors.join(
                    " | "
                  )
                : null,

            source_payload:
  row.sourcePayload as Prisma.InputJsonValue,
          }));

        await tx.radar_import_staging.createMany({
          data: stagingData,
        });

        const metrics =
          await executeRadarSync({
            tx,
            snapshotId: snapshot.id,
            companyId:
              context.companyId,
            batchSize: 500,

            onProgress: (
              processed,
              total
            ) => {
              console.log(
                `Progresso: ${processed}/${total}`
              );
            },
          });

        const links =
          await tx.radar_snapshot_prospects.count({
            where: {
              snapshot_id:
                snapshot.id,
            },
          });

        const prospectsDuring =
          await tx.prospect.count({
            where: {
              company_id:
                context.companyId,
            },
          });

        console.log(
          "\n=== RESULTADO DENTRO DA TRANSAÇÃO ==="
        );

        console.table(metrics);

        console.log(
          "Prospects durante o teste:",
          prospectsDuring
        );

        console.log(
          "Vínculos durante o teste:",
          links
        );

        if (metrics.created !== 18) {
          throw new Error(
            `Esperado 18 criados, recebido ${metrics.created}.`
          );
        }

        if (metrics.updated !== 233) {
          throw new Error(
            `Esperado 233 atualizados, recebido ${metrics.updated}.`
          );
        }

        if (metrics.unchanged !== 3) {
          throw new Error(
            `Esperado 3 inalterados, recebido ${metrics.unchanged}.`
          );
        }

        if (metrics.linked !== 254) {
          throw new Error(
            `Esperado 254 vínculos, recebido ${metrics.linked}.`
          );
        }

        if (
          prospectsDuring !==
          before.prospects + 18
        ) {
          throw new Error(
            "Quantidade de Prospects durante a transação está incorreta."
          );
        }

        console.log(
          "\nValidações internas aprovadas."
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
      "\nRollback proposital executado com sucesso."
    );
  }

  const after =
    await getDatabaseCounts(
      context.companyId
    );

  console.log("\n=== ESTADO DEPOIS ===");
  console.table(after);

  if (
    before.prospects !== after.prospects ||
    before.snapshots !== after.snapshots ||
    before.staging !== after.staging ||
    before.links !== after.links
  ) {
    throw new Error(
      "O rollback não restaurou completamente o estado do banco."
    );
  }

  console.log(
    "\nTeste concluído: nenhuma alteração permaneceu no banco."
  );
}

main()
  .catch((error) => {
    console.error(
      "\nFalha no teste de rollback:"
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