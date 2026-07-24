import path from "node:path";

import { prisma } from "../lib/prisma";
import { parseRadarExcelFile } from "../lib/radar/excel-parser";
import {
  clearRadarStaging,
  insertRadarStagingRows,
} from "../lib/radar/staging-repository";

function formatDate(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function formatDecimal(
  value: { toString(): string } | null
): string | null {
  return value === null ? null : value.toString();
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
      "Nenhum ProspectImportJob encontrado para localizar a empresa."
    );
  }

  return {
    companyId: job.company_id,
    branchId: job.branch_id,
  };
}

async function main(): Promise<void> {
  const filePath = process.argv[2];

  if (!filePath) {
    throw new Error(
      'Use: npx tsx scripts/audit-radar-differences.ts "C:\\caminho\\planilha.xlsx"'
    );
  }

  const parsed = parseRadarExcelFile(
    path.resolve(filePath)
  );

  const context = await findCompanyContext();

  let snapshotId: string | null = null;

  try {
    const snapshot =
      await prisma.radar_snapshots.create({
        data: {
          company_id: context.companyId,
          branch_id: context.branchId,
          file_name: `[AUDITORIA] ${parsed.fileName}`,
          status: "audit_test",
          total_rows: parsed.summary.totalRows,
          valid_rows: parsed.summary.validRows,
          is_current: false,
          metadata: {
            temporaryTest: true,
            purpose: "difference-audit",
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

    const stagingRows =
      await prisma.radar_import_staging.findMany({
        where: {
          snapshot_id: snapshotId,
          validation_status: "valid",
          external_customer_id: {
            not: null,
          },
        },
        orderBy: {
          id: "asc",
        },
        take: 10,
      });

    for (const staging of stagingRows) {
      if (!staging.external_customer_id) {
        continue;
      }

      const prospect =
        await prisma.prospect.findFirst({
          where: {
            company_id: context.companyId,
            externalId:
              staging.external_customer_id,
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

      if (!prospect) {
        console.log(
          `\nID ${staging.external_customer_id}: NOVO`
        );

        continue;
      }

      console.log(
        `\n================ ID ${staging.external_customer_id} ================`
      );

      console.table({
        name: {
          staging: staging.name,
          prospect: prospect.name,
        },

        city: {
          staging: staging.zone,
          prospect: prospect.city,
        },

        phone: {
          staging: staging.normalized_phone,
          prospect: prospect.phone1,
        },

        creditLimit: {
          staging: formatDecimal(
            staging.credit_limit
          ),
          prospect:
            prospect.creditLimit === null
              ? null
              : String(prospect.creditLimit),
        },

        lastTransferAt: {
          staging: formatDate(
            staging.last_transfer_at
          ),
          prospect: formatDate(
            prospect.lastTransferAt
          ),
        },

        lastActivationAt: {
          staging: formatDate(
            staging.last_activation_at
          ),
          prospect: formatDate(
            prospect.lastActivationAt
          ),
        },

        lastOrderAt: {
          staging: formatDate(
            staging.last_order_at
          ),
          prospect: formatDate(
            prospect.lastOrderAt
          ),
        },

        paymentMethod: {
          staging: staging.payment_methods,
          prospect: prospect.paymentMethod,
        },
      });
    }

    console.log(
      "\nAuditoria concluída sem atualizar Prospect."
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
        "\nLinhas temporárias removidas:",
        removed
      );

      console.log(
        "Snapshot de auditoria removido."
      );
    }

    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error("\nFalha na auditoria:");

  console.error(
    error instanceof Error
      ? error.stack
      : error
  );

  await prisma.$disconnect();
  process.exit(1);
});