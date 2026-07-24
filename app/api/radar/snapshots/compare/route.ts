import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/server-company";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

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
    { success: false, error: message },
    { status }
  );
}

function normalizeText(value: string | null): string | null {
  const normalized = String(value || "").trim();
  return normalized.length > 0 ? normalized : null;
}

export async function GET(req: NextRequest) {
  try {
    const access = await requireCompanyAccess(req);

    const role = String(access.userRole || "")
      .trim()
      .toUpperCase();

    if (role !== "GERAL") {
      return errorResponse(
        "A comparação de snapshots do Radar é exclusiva do usuário Geral.",
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

    const requestedCurrentSnapshotId = normalizeText(
      searchParams.get("currentSnapshotId")
    );

    const requestedPreviousSnapshotId = normalizeText(
      searchParams.get("previousSnapshotId")
    );

    const page = parsePositiveInteger(
      searchParams.get("page"),
      1,
      100000
    );

    const limit = parsePositiveInteger(
      searchParams.get("limit"),
      DEFAULT_LIMIT,
      MAX_LIMIT
    );

    const currentSnapshot = requestedCurrentSnapshotId
      ? await prisma.radar_snapshots.findFirst({
          where: {
            id: requestedCurrentSnapshotId,
            company_id: access.companyId,
            status: "completed",
          },
        })
      : await prisma.radar_snapshots.findFirst({
          where: {
            company_id: access.companyId,
            status: "completed",
            is_current: true,
          },
          orderBy: {
            created_at: "desc",
          },
        });

    if (!currentSnapshot) {
      return errorResponse(
        "Snapshot atual não encontrado para esta empresa.",
        404
      );
    }

    let previousSnapshot = requestedPreviousSnapshotId
      ? await prisma.radar_snapshots.findFirst({
          where: {
            id: requestedPreviousSnapshotId,
            company_id: access.companyId,
            status: "completed",
          },
        })
      : null;

    if (!previousSnapshot && currentSnapshot.previous_snapshot_id) {
      previousSnapshot =
        await prisma.radar_snapshots.findFirst({
          where: {
            id: currentSnapshot.previous_snapshot_id,
            company_id: access.companyId,
            status: "completed",
          },
        });
    }

    if (!previousSnapshot) {
      previousSnapshot =
        await prisma.radar_snapshots.findFirst({
          where: {
            company_id: access.companyId,
            status: "completed",
            id: {
              not: currentSnapshot.id,
            },
            created_at: {
              lt: currentSnapshot.created_at,
            },
          },
          orderBy: {
            created_at: "desc",
          },
        });
    }

    if (!previousSnapshot) {
      return errorResponse(
        "Não existe snapshot anterior concluído para comparação.",
        404
      );
    }

    if (previousSnapshot.id === currentSnapshot.id) {
      return errorResponse(
        "O snapshot atual e o anterior precisam ser diferentes.",
        400
      );
    }

    const [currentLinks, previousLinks] =
      await Promise.all([
        prisma.radar_snapshot_prospects.findMany({
          where: {
            company_id: access.companyId,
            snapshot_id: currentSnapshot.id,
          },
          select: {
            prospect_id: true,
          },
        }),
        prisma.radar_snapshot_prospects.findMany({
          where: {
            company_id: access.companyId,
            snapshot_id: previousSnapshot.id,
          },
          select: {
            prospect_id: true,
          },
        }),
      ]);

    const currentIds = new Set(
      currentLinks.map((item) => item.prospect_id)
    );

    const previousIds = new Set(
      previousLinks.map((item) => item.prospect_id)
    );

    const addedIds = [...currentIds].filter(
      (id) => !previousIds.has(id)
    );

    const removedIds = [...previousIds].filter(
      (id) => !currentIds.has(id)
    );

    const unchangedIds = [...currentIds].filter(
      (id) => previousIds.has(id)
    );

    const skip = (page - 1) * limit;

    const [addedProspects, removedProspects] =
      await Promise.all([
        addedIds.length > 0
          ? prisma.prospect.findMany({
              where: {
                company_id: access.companyId,
                id: {
                  in: addedIds,
                },
              },
              orderBy: {
                name: "asc",
              },
              skip,
              take: limit,
            })
          : [],
        removedIds.length > 0
          ? prisma.prospect.findMany({
              where: {
                company_id: access.companyId,
                id: {
                  in: removedIds,
                },
              },
              orderBy: {
                name: "asc",
              },
              skip,
              take: limit,
            })
          : [],
      ]);

    return NextResponse.json({
      success: true,

      currentSnapshot: {
        id: currentSnapshot.id,
        fileName: currentSnapshot.file_name,
        status: currentSnapshot.status,
        isCurrent: currentSnapshot.is_current,
        createdAt: currentSnapshot.created_at,
        finishedAt: currentSnapshot.finished_at,
        processedRows: currentSnapshot.processed_rows,
        validRows: currentSnapshot.valid_rows,
      },

      previousSnapshot: {
        id: previousSnapshot.id,
        fileName: previousSnapshot.file_name,
        status: previousSnapshot.status,
        isCurrent: previousSnapshot.is_current,
        createdAt: previousSnapshot.created_at,
        finishedAt: previousSnapshot.finished_at,
        processedRows: previousSnapshot.processed_rows,
        validRows: previousSnapshot.valid_rows,
      },

      summary: {
        currentTotal: currentIds.size,
        previousTotal: previousIds.size,
        added: addedIds.length,
        removed: removedIds.length,
        unchanged: unchangedIds.length,
        netChange: currentIds.size - previousIds.size,
      },

      addedProspects,
      removedProspects,

      pagination: {
        page,
        limit,
        added: {
          total: addedIds.length,
          totalPages: Math.max(
            1,
            Math.ceil(addedIds.length / limit)
          ),
        },
        removed: {
          total: removedIds.length,
          totalPages: Math.max(
            1,
            Math.ceil(removedIds.length / limit)
          ),
        },
      },

      capabilities: {
        membershipComparison: true,
        fieldHistoryComparison: false,
        note:
          "Esta comparação identifica entradas, saídas e permanências. " +
          "A comparação histórica de campos exige valores congelados por snapshot.",
      },
    });
  } catch (error) {
    console.error(
      "[RADAR_SNAPSHOT_COMPARE_ERROR]",
      error
    );

    const message =
      error instanceof Error
        ? error.message
        : "Erro ao comparar os snapshots do Radar.";

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
