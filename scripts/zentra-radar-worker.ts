import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { Prisma } from "@prisma/client";

import { prisma } from "../lib/prisma";
import { getSupabaseAdmin } from "../lib/supabase-admin";

import { parseRadarExcelFile } from "../lib/radar/excel-parser";
import { executeRadarSync } from "../lib/radar/sync-engine";
import { finalizeRadarSnapshot } from "../lib/radar/snapshot-finalizer";

const RUN_ONCE = process.argv.includes("--once");
const WATCH_MODE = process.argv.includes("--watch");
const DRY_RUN = process.argv.includes("--dry-run");
const COMMIT_MODE = process.argv.includes("--commit");

const STORAGE_BUCKET = "radar-imports";

const WATCH_INTERVAL_MS = Math.max(
  1_000,
  Number(process.env.RADAR_WORKER_INTERVAL_MS || 5_000)
);

const WORKER_ID =
  process.env.RADAR_WORKER_ID ||
  `${os.hostname()}-${process.pid}`;

let stopRequested = false;

class RadarDryRunRollback extends Error {
  constructor() {
    super("RADAR_WORKER_DRY_RUN_ROLLBACK");
    this.name = "RadarDryRunRollback";
  }
}

function log(
  message: string,
  extra?: unknown
): void {
  if (extra === undefined) {
    console.log(`[Radar Worker] ${message}`);
    return;
  }

  console.log(
    `[Radar Worker] ${message}`,
    extra
  );
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function requestGracefulShutdown(signal: string): void {
  if (stopRequested) {
    return;
  }

  stopRequested = true;

  log(
    `Sinal ${signal} recebido. O worker será encerrado após o ciclo atual.`
  );
}

process.on("SIGINT", () => {
  requestGracefulShutdown("SIGINT");
});

process.on("SIGTERM", () => {
  requestGracefulShutdown("SIGTERM");
});

function validateEnvironment(): void {
  const requiredVariables = [
    "DATABASE_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
  ];

  const missing = requiredVariables.filter(
    (variable) => !process.env[variable]
  );

  if (missing.length > 0) {
    throw new Error(
      `Variáveis ausentes: ${missing.join(", ")}`
    );
  }
}

async function findPendingJob() {
  return prisma.prospectImportJob.findFirst({
    where: {
      status: {
        in: ["PENDING", "pending"],
      },

      snapshot_id: {
        not: null,
      },

      storage_path: {
        not: null,
      },
    },

    orderBy: {
      createdAt: "asc",
    },

    select: {
      id: true,
      company_id: true,
      branch_id: true,
      fileName: true,
      snapshot_id: true,
      storage_path: true,
      attempts: true,
      max_attempts: true,
    },
  });
}

async function claimPendingJob() {
  /*
   * Faz uma reserva otimista do job.
   *
   * Dois workers podem enxergar o mesmo candidato, mas somente um deles
   * conseguirá mudar o status de PENDING para PROCESSING.
   */
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = await findPendingJob();

    if (!candidate) {
      return null;
    }

    if (candidate.attempts >= candidate.max_attempts) {
      await prisma.prospectImportJob.updateMany({
        where: {
          id: candidate.id,
          status: {
            in: ["PENDING", "pending"],
          },
        },
        data: {
          status: "FAILED",
          error:
            "Número máximo de tentativas de processamento atingido.",
          finished_at: new Date(),
          heartbeat_at: new Date(),
          locked_by: null,
          locked_at: null,
        },
      });

      log(
        "Job marcado como FAILED por exceder o limite de tentativas.",
        {
          jobId: candidate.id,
          attempts: candidate.attempts,
          maxAttempts: candidate.max_attempts,
        }
      );

      continue;
    }

    const claimed =
      await prisma.prospectImportJob.updateMany({
        where: {
          id: candidate.id,
          status: {
            in: ["PENDING", "pending"],
          },
        },

        data: {
          status: "PROCESSING",
          locked_by: WORKER_ID,
          locked_at: new Date(),
          heartbeat_at: new Date(),
          started_at: new Date(),
          error: null,
        },
      });

    if (claimed.count === 1) {
      return candidate;
    }
  }

  return null;
}

async function downloadFile(params: {
  storagePath: string;
  fileName: string;
}): Promise<string> {
  const supabase = getSupabaseAdmin();

  const { data, error } =
    await supabase.storage
      .from(STORAGE_BUCKET)
      .download(params.storagePath);

  if (error || !data) {
    throw new Error(
      `Não foi possível baixar a planilha: ${
        error?.message || "arquivo não retornado"
      }`
    );
  }

  const extension =
    path.extname(params.fileName) ||
    ".xlsx";

  const tempDirectory =
    await fs.mkdtemp(
      path.join(
        os.tmpdir(),
        "zentra-radar-"
      )
    );

  const tempFile = path.join(
    tempDirectory,
    `import${extension}`
  );

  const buffer = Buffer.from(
    await data.arrayBuffer()
  );

  await fs.writeFile(tempFile, buffer);

  return tempFile;
}

async function removeTempFile(
  tempFile: string | null
): Promise<void> {
  if (!tempFile) {
    return;
  }

  try {
    await fs.rm(
      path.dirname(tempFile),
      {
        recursive: true,
        force: true,
      }
    );
  } catch (error) {
    log(
      "Não foi possível remover o arquivo temporário.",
      error
    );
  }
}

async function processJob(
  options: {
    quietWhenEmpty?: boolean;
  } = {}
): Promise<boolean> {
  const job = COMMIT_MODE
    ? await claimPendingJob()
    : await findPendingJob();

  if (!job) {
    if (!options.quietWhenEmpty) {
      log("Nenhum job V2 pendente encontrado.");
    }

    return false;
  }

  if (
    !job.snapshot_id ||
    !job.storage_path
  ) {
    throw new Error(
      `Job ${job.id} sem snapshot ou storage_path.`
    );
  }

  log("Job localizado.", {
    jobId: job.id,
    snapshotId: job.snapshot_id,
    fileName: job.fileName,
    storagePath: job.storage_path,
  });

  let tempFile: string | null = null;

  const before = {
    prospects:
      await prisma.prospect.count({
        where: {
          company_id: job.company_id,
        },
      }),

    snapshots:
      await prisma.radar_snapshots.count({
        where: {
          company_id: job.company_id,
        },
      }),

    staging:
      await prisma.radar_import_staging.count({
        where: {
          company_id: job.company_id,
        },
      }),

    links:
      await prisma.radar_snapshot_prospects.count({
        where: {
          company_id: job.company_id,
        },
      }),
  };

  try {
    tempFile = await downloadFile({
      storagePath: job.storage_path,
      fileName:
        job.fileName || "radar.xlsx",
    });

    log(
      "Planilha baixada para arquivo temporário."
    );

    const parsed =
      parseRadarExcelFile(tempFile);

    log("Planilha validada.", {
      totalRows:
        parsed.summary.totalRows,
      validRows:
        parsed.summary.validRows,
      invalidRows:
        parsed.summary.invalidRows,
      duplicatedRows:
        parsed.summary.duplicatedRows,
    });

    try {
      await prisma.$transaction(
        async (tx) => {
          const snapshot =
            await tx.radar_snapshots.findUnique({
              where: {
                id: job.snapshot_id!,
              },
            });

          if (!snapshot) {
            throw new Error(
              `Snapshot não encontrado: ${job.snapshot_id}`
            );
          }

          if (
            snapshot.company_id !==
            job.company_id
          ) {
            throw new Error(
              "O job e o snapshot pertencem a empresas diferentes."
            );
          }

          if (snapshot.is_current) {
            throw new Error(
              "O snapshot pendente não pode estar ativo."
            );
          }

          await tx.prospectImportJob.update({
            where: {
              id: job.id,
            },

            data: {
              status: "PROCESSING",
              attempts: {
                increment: 1,
              },
              locked_by:
                DRY_RUN ? "local-dry-run" : WORKER_ID,
              locked_at: new Date(),
              heartbeat_at: new Date(),
              started_at: new Date(),
              error: null,
            },
          });

          await tx.radar_snapshots.update({
            where: {
              id: snapshot.id,
            },

            data: {
              status: "processing",
              started_at: new Date(),

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

              error: null,
              error_message: null,
            },
          });

          const stagingData:
            Prisma.radar_import_stagingCreateManyInput[] =
            parsed.rows.map((row) => ({
              snapshot_id: snapshot.id,
              company_id: job.company_id,
              branch_id:
                job.branch_id,

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
                  ? row.validationErrors.join(
                      " | "
                    )
                  : null,

              source_payload:
                row.sourcePayload as
                  Prisma.InputJsonValue,
            }));

          /*
           * Para a planilha pequena de teste.
           * O worker definitivo de 300 mil linhas
           * usará inserção por lotes.
           */
          await tx.radar_import_staging.createMany({
            data: stagingData,
          });

          const metrics =
            await executeRadarSync({
              tx,
              snapshotId: snapshot.id,
              companyId: job.company_id,
              batchSize: 500,

              onProgress: (
                processed,
                total
              ) => {
                log(
                  `Sincronização ${processed}/${total}`
                );
              },
            });

          log(
            "Métricas dentro da transação.",
            metrics
          );

          const finalized =
            await finalizeRadarSnapshot({
              tx,
              snapshotId: snapshot.id,
              companyId: job.company_id,
              metrics,
              removedCount: 0,
            });

          await tx.prospectImportJob.update({
            where: {
              id: job.id,
            },

            data: {
              status: "COMPLETED",
              totalRows:
                parsed.summary.totalRows,

              processed_rows:
                metrics.processed,

              valid_rows:
                parsed.summary.validRows,

              created:
                metrics.created,

              updated:
                metrics.updated,

              duplicated:
                parsed.summary
                  .duplicatedRows,

              invalidPhone:
                parsed.summary
                  .invalidPhoneRows,

              invalid_count:
                parsed.summary.invalidRows,

              progress_percent: 100,
              finished_at: new Date(),
              heartbeat_at: new Date(),
              locked_by: null,
              locked_at: null,
              error: null,
            },
          });

          log(
            "Snapshot ativado dentro da transação.",
            {
              snapshotId:
                finalized.id,
              isCurrent:
                finalized.isCurrent,
              status:
                finalized.status,
            }
          );

          if (DRY_RUN) {
            log(
              "Forçando rollback do teste."
            );

            throw new RadarDryRunRollback();
          }

          const removedStaging =
            await tx.radar_import_staging.deleteMany({
              where: {
                snapshot_id: snapshot.id,
              },
            });

          log(
            "Staging limpa após conclusão.",
            {
              removed: removedStaging.count,
            }
          );
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
          RadarDryRunRollback
        )
      ) {
        throw error;
      }

      log(
        "Rollback proposital executado."
      );
    }

    const after = {
      prospects:
        await prisma.prospect.count({
          where: {
            company_id:
              job.company_id,
          },
        }),

      snapshots:
        await prisma.radar_snapshots.count({
          where: {
            company_id:
              job.company_id,
          },
        }),

      staging:
        await prisma.radar_import_staging.count({
          where: {
            company_id:
              job.company_id,
          },
        }),

      links:
        await prisma.radar_snapshot_prospects.count({
          where: {
            company_id:
              job.company_id,
          },
        }),
    };

    log("Estado antes.", before);
    log("Estado depois.", after);

    const persistedJob =
      await prisma.prospectImportJob.findUnique({
        where: {
          id: job.id,
        },

        select: {
          status: true,
          processed_rows: true,
          progress_percent: true,
          created: true,
          updated: true,
        },
      });

    if (DRY_RUN) {
      if (
        JSON.stringify(before) !==
        JSON.stringify(after)
      ) {
        throw new Error(
          "O rollback não restaurou completamente o estado."
        );
      }

      if (
        persistedJob?.status !== "PENDING"
      ) {
        throw new Error(
          `O job deveria continuar PENDING, mas está ${persistedJob?.status}.`
        );
      }

      log(
        "Dry-run concluído. Nenhuma alteração permaneceu."
      );

      return true;
    }

    const persistedSnapshot =
      await prisma.radar_snapshots.findUnique({
        where: {
          id: job.snapshot_id,
        },
        select: {
          status: true,
          is_current: true,
          valid_rows: true,
          processed_rows: true,
        },
      });

    if (
      persistedJob?.status !== "COMPLETED"
    ) {
      throw new Error(
        `O job deveria estar COMPLETED, mas está ${persistedJob?.status}.`
      );
    }

    if (
      !persistedSnapshot ||
      persistedSnapshot.status !== "completed" ||
      !persistedSnapshot.is_current
    ) {
      throw new Error(
        "O snapshot não foi concluído e ativado corretamente."
      );
    }

    if (after.staging !== 0) {
      throw new Error(
        `A staging deveria estar vazia, mas contém ${after.staging} linha(s).`
      );
    }

    log(
      "Commit concluído com sucesso.",
      {
        jobId: job.id,
        snapshotId: job.snapshot_id,
        prospects: after.prospects,
        links: after.links,
        created: persistedJob.created,
        updated: persistedJob.updated,
        processedRows:
          persistedJob.processed_rows,
        progressPercent:
          persistedJob.progress_percent,
      }
    );

    return true;
  } catch (error) {
    if (COMMIT_MODE) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      await prisma.$transaction(async (tx) => {
        await tx.prospectImportJob.updateMany({
          where: {
            id: job.id,
            status: {
              not: "COMPLETED",
            },
          },
          data: {
            status: "FAILED",
            error: message,
            error_count: {
              increment: 1,
            },
            finished_at: new Date(),
            heartbeat_at: new Date(),
            locked_by: null,
            locked_at: null,
          },
        });

        await tx.radar_snapshots.updateMany({
          where: {
            id: job.snapshot_id,
            is_current: false,
          },
          data: {
            status: "failed",
            error: message,
            error_message: message,
            finished_at: new Date(),
            updated_at: new Date(),
          },
        });

        await tx.radar_import_staging.deleteMany({
          where: {
            snapshot_id: job.snapshot_id,
          },
        });
      });

      log(
        "Falha registrada sem alterar o snapshot atual.",
        {
          jobId: job.id,
          snapshotId: job.snapshot_id,
          error: message,
        }
      );
    }

    throw error;
  } finally {
    await removeTempFile(tempFile);
  }
}

async function runWatchLoop(): Promise<void> {
  log("Executando em modo WATCH + COMMIT.", {
    workerId: WORKER_ID,
    intervalMs: WATCH_INTERVAL_MS,
  });

  let emptyCycles = 0;

  while (!stopRequested) {
    try {
      const processed = await processJob({
        quietWhenEmpty: true,
      });

      if (processed) {
        emptyCycles = 0;
      } else {
        emptyCycles += 1;

        /*
         * Evita poluir o log a cada 5 segundos.
         * Com intervalo padrão, registra espera aproximadamente a cada minuto.
         */
        if (emptyCycles === 1 || emptyCycles % 12 === 0) {
          log("Aguardando novo job V2 pendente.");
        }
      }
    } catch (error) {
      console.error(
        "[Radar Worker] Falha ao processar job no modo contínuo:"
      );

      console.error(
        error instanceof Error
          ? error.stack
          : error
      );
    }

    if (!stopRequested) {
      await sleep(WATCH_INTERVAL_MS);
    }
  }

  log("Loop contínuo encerrado com segurança.");
}

async function main(): Promise<void> {
  validateEnvironment();

  const selectedExecutionModes =
    Number(RUN_ONCE) + Number(WATCH_MODE);

  const selectedDataModes =
    Number(DRY_RUN) + Number(COMMIT_MODE);

  const validOnceMode =
    RUN_ONCE &&
    !WATCH_MODE &&
    selectedExecutionModes === 1 &&
    selectedDataModes === 1;

  const validWatchMode =
    WATCH_MODE &&
    !RUN_ONCE &&
    COMMIT_MODE &&
    !DRY_RUN &&
    selectedExecutionModes === 1 &&
    selectedDataModes === 1;

  if (!validOnceMode && !validWatchMode) {
    throw new Error(
      [
        "Modo de segurança ativo.",
        "Use exatamente um dos comandos:",
        "npx tsx scripts/zentra-radar-worker.ts --once --dry-run",
        "npx tsx scripts/zentra-radar-worker.ts --once --commit",
        "npx tsx scripts/zentra-radar-worker.ts --watch --commit",
      ].join(" ")
    );
  }

  if (validWatchMode) {
    await runWatchLoop();
    return;
  }

  log(
    DRY_RUN
      ? "Executando em modo DRY-RUN."
      : "Executando em modo COMMIT.",
    {
      workerId: WORKER_ID,
    }
  );

  await processJob();
}

main()
  .catch((error) => {
    console.error(
      "[Radar Worker] Falha:"
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