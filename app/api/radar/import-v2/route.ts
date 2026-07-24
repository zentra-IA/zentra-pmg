import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/server-company";

import {
  attachFileAndCreateJob,
  createPendingRadarImport,
  deletePendingRadarSnapshot,
} from "@/lib/radar/create-import-job";

import {
  buildRadarStoragePath,
  removeRadarFile,
  uploadRadarFile,
} from "@/lib/radar/upload-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([".xlsx", ".xls"]);

function getFileExtension(fileName: string): string {
  const match = fileName
    .trim()
    .toLowerCase()
    .match(/\.(xlsx|xls)$/);

  return match?.[0] ?? "";
}

function isAuthenticationError(message: string): boolean {
  const normalized = message.toLowerCase();

  return (
    normalized.includes("usuário não identificado") ||
    normalized.includes("usuario não identificado") ||
    normalized.includes("empresa não identificada")
  );
}

function isAccessError(message: string): boolean {
  const normalized = message.toLowerCase();

  return (
    normalized.includes("sem acesso ativo") ||
    normalized.includes("perfil do usuário não identificado") ||
    normalized.includes("perfil do usuario não identificado")
  );
}

function errorResponse(error: unknown): NextResponse {
  const message =
    error instanceof Error
      ? error.message
      : "Erro inesperado ao enviar a planilha.";

  let status = 500;

  if (isAuthenticationError(message)) {
    status = 401;
  } else if (isAccessError(message)) {
    status = 403;
  }

  return NextResponse.json(
    {
      success: false,
      error: message,
    },
    {
      status,
    }
  );
}

export async function POST(req: NextRequest) {
  let snapshotId: string | null = null;
  let storagePath: string | null = null;

  try {
    const access = await requireCompanyAccess(req);

    /*
     * Regra exclusiva do fluxo V2:
     * somente o perfil GERAL pode importar.
     */
    const userRole = String(access.userRole || "")
      .trim()
      .toUpperCase();

    if (userRole !== "GERAL") {
      return NextResponse.json(
        {
          success: false,
          error:
            "A importação do Radar é exclusiva do usuário Geral.",
        },
        {
          status: 403,
        }
      );
    }

    if (!access.companyId || !access.userId) {
      return NextResponse.json(
        {
          success: false,
          error: "Empresa ou usuário não identificado.",
        },
        {
          status: 401,
        }
      );
    }

    /*
     * Proteção contra importações duplicadas.
     *
     * Se já houver um job pendente ou em processamento para a empresa,
     * nenhuma planilha nova, snapshot ou job será criado.
     *
     * As variações em maiúsculas e minúsculas são verificadas porque
     * existem registros históricos com padrões diferentes de status.
     */
    const runningJob =
      await prisma.prospectImportJob.findFirst({
        where: {
          company_id: access.companyId,
          status: {
            in: [
              "PENDING",
              "PROCESSING",
              "pending",
              "processing",
            ],
          },
        },

        orderBy: {
          createdAt: "desc",
        },

        select: {
          id: true,
          snapshot_id: true,
          storage_path: true,
          fileName: true,
          status: true,
          processed_rows: true,
          progress_percent: true,
          createdAt: true,
        },
      });

    if (runningJob) {
      return NextResponse.json(
        {
          success: false,
          conflict: true,
          error:
            "Já existe uma importação do Radar em andamento para esta empresa.",
          jobId: runningJob.id,
          snapshotId: runningJob.snapshot_id,
          storagePath: runningJob.storage_path,
          fileName: runningJob.fileName,
          status: runningJob.status,
          processedRows: runningJob.processed_rows,
          progressPercent: Number(
            runningJob.progress_percent || 0
          ),
          createdAt: runningJob.createdAt,
          statusUrl:
            `/api/radar/import-v2/status?jobId=${encodeURIComponent(
              runningJob.id
            )}`,
        },
        {
          status: 409,
        }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          success: false,
          error: "Arquivo não enviado.",
        },
        {
          status: 400,
        }
      );
    }

    const extension = getFileExtension(file.name);

    if (!ALLOWED_EXTENSIONS.has(extension)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Formato inválido. Envie um arquivo .xlsx ou .xls.",
        },
        {
          status: 400,
        }
      );
    }

    if (file.size <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: "O arquivo está vazio.",
        },
        {
          status: 400,
        }
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        {
          success: false,
          error:
            "O arquivo ultrapassa o limite de 100 MB.",
        },
        {
          status: 413,
        }
      );
    }

    /*
     * O snapshot nasce pendente e nunca atual.
     * Esta rota não cria nem atualiza Prospect.
     */
    const snapshot = await createPendingRadarImport({
      companyId: access.companyId,
      branchId: access.branchId ?? null,
      userId: access.userId,
      fileName: file.name,
    });

    snapshotId = snapshot.id;

    storagePath = buildRadarStoragePath({
      companyId: access.companyId,
      snapshotId,
      fileName: file.name,
    });

    /*
     * O arquivo é salvo no bucket privado radar-imports.
     */
    await uploadRadarFile({
      storagePath,
      file,
    });

    /*
     * Depois do upload:
     * - registra o storage_path no snapshot;
     * - cria o ProspectImportJob como PENDING.
     */
    const job = await attachFileAndCreateJob({
      snapshotId,
      companyId: access.companyId,
      branchId: access.branchId ?? null,
      fileName: file.name,
      storagePath,
    });

    return NextResponse.json(
      {
        success: true,
        jobId: job.id,
        snapshotId,
        status: job.status,
        fileName: file.name,
        statusUrl:
          `/api/radar/import-v2/status?jobId=${encodeURIComponent(
            job.id
          )}`,
        message:
          "Arquivo recebido e aguardando processamento.",
      },
      {
        status: 202,
      }
    );
  } catch (error) {
    /*
     * Compensação segura:
     * se alguma etapa falhar após a criação do snapshot, remove o arquivo
     * enviado e o snapshot pendente. Um snapshot atual nunca é removido
     * por esta rotina.
     */
    if (storagePath) {
      await removeRadarFile(storagePath);
    }

    if (snapshotId) {
      await deletePendingRadarSnapshot(snapshotId);
    }

    console.error("[Radar Import V2]", error);

    return errorResponse(error);
  }
}
