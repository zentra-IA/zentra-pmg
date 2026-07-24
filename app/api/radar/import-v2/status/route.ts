import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/server-company";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeStatus(value: string | null | undefined): string {
  return String(value || "").trim().toUpperCase();
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined) {
    return 0;
  }

  const numeric = Number(value);

  return Number.isFinite(numeric) ? numeric : 0;
}

function errorResponse(
  message: string,
  status: number
): NextResponse {
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

export async function GET(req: NextRequest) {
  try {
    const access = await requireCompanyAccess(req);

    const role = String(access.userRole || "")
      .trim()
      .toUpperCase();

    /*
     * Acompanhamento de importação é administrativo.
     * Mantém a mesma regra da rota POST /api/radar/import-v2.
     */
    if (role !== "GERAL") {
      return errorResponse(
        "O acompanhamento da importação do Radar é exclusivo do usuário Geral.",
        403
      );
    }

    if (!access.companyId || !access.userId) {
      return errorResponse(
        "Empresa ou usuário não identificado.",
        401
      );
    }

    const { searchParams } = new URL(req.url);
    const jobId = String(
      searchParams.get("jobId") || ""
    ).trim();

    if (!jobId) {
      return errorResponse(
        "O parâmetro jobId é obrigatório.",
        400
      );
    }

    const job =
      await prisma.prospectImportJob.findFirst({
        where: {
          id: jobId,
          company_id: access.companyId,
        },

        select: {
          id: true,
          company_id: true,
          branch_id: true,
          fileName: true,
          snapshot_id: true,
          storage_path: true,

          status: true,
          error: true,

          totalRows: true,
          processed_rows: true,
          valid_rows: true,

          created: true,
          updated: true,
          duplicated: true,
          invalidPhone: true,
          invalid_count: true,
          error_count: true,
          removed_count: true,

          progress_percent: true,
          attempts: true,
          max_attempts: true,

          locked_by: true,
          locked_at: true,
          heartbeat_at: true,
          started_at: true,
          finished_at: true,

          requires_confirmation: true,
          confirmation_reason: true,
          confirmed_at: true,

          createdAt: true,
          updatedAt: true,
        },
      });

    if (!job) {
      return errorResponse(
        "Importação não encontrada para esta empresa.",
        404
      );
    }

    const snapshot = job.snapshot_id
      ? await prisma.radar_snapshots.findFirst({
          where: {
            id: job.snapshot_id,
            company_id: access.companyId,
          },

          select: {
            id: true,
            file_name: true,
            storage_path: true,

            status: true,
            is_current: true,

            total_rows: true,
            processed_rows: true,
            valid_rows: true,

            created_count: true,
            updated_count: true,
            removed_count: true,
            duplicated_count: true,
            invalid_phone_count: true,
            invalid_count: true,
            error_count: true,

            progress_percent: true,

            requires_confirmation: true,
            confirmation_reason: true,
            confirmed_at: true,

            started_at: true,
            finished_at: true,
            created_at: true,
            updated_at: true,

            error: true,
            error_message: true,
          },
        })
      : null;

    const jobStatus = normalizeStatus(job.status);
    const snapshotStatus = normalizeStatus(
      snapshot?.status
    );

    const isCompleted =
      jobStatus === "COMPLETED" &&
      snapshotStatus === "COMPLETED";

    const isFailed =
      jobStatus === "FAILED" ||
      snapshotStatus === "FAILED";

    const isWaitingConfirmation =
      Boolean(
        job.requires_confirmation ||
        snapshot?.requires_confirmation
      );

    const progressPercent = Math.max(
      0,
      Math.min(
        100,
        Math.max(
          toNumber(job.progress_percent),
          toNumber(snapshot?.progress_percent)
        )
      )
    );

    return NextResponse.json({
      success: true,

      job: {
        id: job.id,
        fileName: job.fileName,
        snapshotId: job.snapshot_id,
        storagePath: job.storage_path,

        status: job.status,
        normalizedStatus: jobStatus,

        totalRows: job.totalRows,
        processedRows: job.processed_rows,
        validRows: job.valid_rows,

        created: job.created,
        updated: job.updated,
        removed: job.removed_count,
        duplicated: job.duplicated,
        invalidPhone: job.invalidPhone,
        invalid: job.invalid_count,
        errorCount: job.error_count,

        progressPercent,

        attempts: job.attempts,
        maxAttempts: job.max_attempts,

        lockedBy: job.locked_by,
        lockedAt: job.locked_at,
        heartbeatAt: job.heartbeat_at,
        startedAt: job.started_at,
        finishedAt: job.finished_at,

        requiresConfirmation:
          job.requires_confirmation,

        confirmationReason:
          job.confirmation_reason,

        confirmedAt: job.confirmed_at,

        error: job.error,

        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      },

      snapshot: snapshot
        ? {
            id: snapshot.id,
            fileName: snapshot.file_name,
            storagePath: snapshot.storage_path,

            status: snapshot.status,
            normalizedStatus: snapshotStatus,
            isCurrent: snapshot.is_current,

            totalRows: snapshot.total_rows,
            processedRows:
              snapshot.processed_rows,
            validRows: snapshot.valid_rows,

            created: snapshot.created_count,
            updated: snapshot.updated_count,
            removed: snapshot.removed_count,
            duplicated:
              snapshot.duplicated_count,
            invalidPhone:
              snapshot.invalid_phone_count,
            invalid: snapshot.invalid_count,
            errorCount:
              snapshot.error_count,

            progressPercent: toNumber(
              snapshot.progress_percent
            ),

            requiresConfirmation:
              snapshot.requires_confirmation,

            confirmationReason:
              snapshot.confirmation_reason,

            confirmedAt:
              snapshot.confirmed_at,

            startedAt: snapshot.started_at,
            finishedAt: snapshot.finished_at,
            createdAt: snapshot.created_at,
            updatedAt: snapshot.updated_at,

            error:
              snapshot.error_message ||
              snapshot.error,
          }
        : null,

      state: {
        isCompleted,
        isFailed,
        isProcessing:
          !isCompleted &&
          !isFailed &&
          !isWaitingConfirmation,

        isWaitingConfirmation,
        progressPercent,

        canPoll:
          !isCompleted &&
          !isFailed &&
          !isWaitingConfirmation,
      },
    });
  } catch (error) {
    console.error(
      "[RADAR_IMPORT_V2_STATUS_ERROR]",
      error
    );

    const message =
      error instanceof Error
        ? error.message
        : "Erro ao consultar o andamento da importação.";

    const normalized = message.toLowerCase();

    const status =
      normalized.includes("não identificado") ||
      normalized.includes("nao identificado")
        ? 401
        : normalized.includes("sem acesso")
          ? 403
          : 500;

    return errorResponse(message, status);
  }
}
