import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/server-company";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parsePositiveInteger(
  value: string | null,
  fallback: number,
  maximum: number
): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(Math.floor(parsed), maximum);
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

    if (role !== "GERAL") {
      return errorResponse(
        "O histórico de importações do Radar é exclusivo do usuário Geral.",
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

    const page = parsePositiveInteger(
      searchParams.get("page"),
      1,
      100000
    );

    const limit = parsePositiveInteger(
      searchParams.get("limit"),
      20,
      100
    );

    const status = String(
      searchParams.get("status") || ""
    )
      .trim()
      .toLowerCase();

    const allowedStatuses = new Set([
      "pending",
      "processing",
      "completed",
      "failed",
    ]);

    const statusFilter =
      status && allowedStatuses.has(status)
        ? status
        : undefined;

    const where = {
      company_id: access.companyId,
      ...(statusFilter
        ? {
            status: statusFilter,
          }
        : {}),
    };

    const [snapshots, total, currentSnapshot] =
      await Promise.all([
        prisma.radar_snapshots.findMany({
          where,
          orderBy: [
            {
              is_current: "desc",
            },
            {
              created_at: "desc",
            },
          ],
          skip: (page - 1) * limit,
          take: limit,
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
            previous_snapshot_id: true,
            started_at: true,
            finished_at: true,
            created_at: true,
            updated_at: true,
            error: true,
            error_message: true,
            _count: {
              select: {
                radar_snapshot_prospects: true,
              },
            },
          },
        }),

        prisma.radar_snapshots.count({
          where,
        }),

        prisma.radar_snapshots.findFirst({
          where: {
            company_id: access.companyId,
            is_current: true,
            status: "completed",
          },
          orderBy: {
            created_at: "desc",
          },
          select: {
            id: true,
            file_name: true,
            created_at: true,
            processed_rows: true,
            valid_rows: true,
          },
        }),
      ]);

    return NextResponse.json({
      success: true,

      currentSnapshot: currentSnapshot
        ? {
            id: currentSnapshot.id,
            fileName: currentSnapshot.file_name,
            createdAt: currentSnapshot.created_at,
            processedRows:
              currentSnapshot.processed_rows,
            validRows: currentSnapshot.valid_rows,
          }
        : null,

      snapshots: snapshots.map((snapshot) => ({
        id: snapshot.id,
        fileName: snapshot.file_name,
        storagePath: snapshot.storage_path,
        status: snapshot.status,
        normalizedStatus: String(
          snapshot.status || ""
        ).toUpperCase(),
        isCurrent: snapshot.is_current,
        totalRows: snapshot.total_rows,
        processedRows: snapshot.processed_rows,
        validRows: snapshot.valid_rows,
        created: snapshot.created_count,
        updated: snapshot.updated_count,
        removed: snapshot.removed_count,
        duplicated: snapshot.duplicated_count,
        invalidPhone:
          snapshot.invalid_phone_count,
        invalid: snapshot.invalid_count,
        errorCount: snapshot.error_count,
        progressPercent: Number(
          snapshot.progress_percent || 0
        ),
        linkedProspects:
          snapshot._count.radar_snapshot_prospects,
        requiresConfirmation:
          snapshot.requires_confirmation,
        confirmationReason:
          snapshot.confirmation_reason,
        confirmedAt: snapshot.confirmed_at,
        previousSnapshotId:
          snapshot.previous_snapshot_id,
        startedAt: snapshot.started_at,
        finishedAt: snapshot.finished_at,
        createdAt: snapshot.created_at,
        updatedAt: snapshot.updated_at,
        error:
          snapshot.error_message ||
          snapshot.error,
      })),

      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(
          1,
          Math.ceil(total / limit)
        ),
      },
    });
  } catch (error) {
    console.error(
      "[RADAR_SNAPSHOTS_ERROR]",
      error
    );

    const message =
      error instanceof Error
        ? error.message
        : "Erro ao carregar o histórico do Radar.";

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
