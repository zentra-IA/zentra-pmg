import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/server-company";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const access = await requireCompanyAccess(req);
    const { companyId, userId } = access;

    if (!companyId || !userId) {
      return NextResponse.json(
        { success: false, error: "Empresa ou usuário não identificado." },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const campaignId = String(searchParams.get("campaignId") || "").trim();
    const now = new Date();

    const commonWhere: any = {
      status: "CALLBACK",
      nextCallAt: { not: null },
      campaign: {
        company_id: companyId,
        user_id: userId,
        ...(campaignId ? { id: campaignId } : {}),
      },
    };

    const due = await prisma.dialerCampaignContact.findMany({
      where: {
        ...commonWhere,
        nextCallAt: { lte: now },
      },
      orderBy: [{ nextCallAt: "asc" }, { position: "asc" }],
      take: 20,
      select: {
        id: true,
        campaignId: true,
        position: true,
        nextCallAt: true,
        prospect: {
          select: {
            id: true,
            name: true,
            phone1: true,
            city: true,
            state: true,
          },
        },
        campaign: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    const upcoming = await prisma.dialerCampaignContact.findMany({
      where: {
        ...commonWhere,
        nextCallAt: { gt: now },
      },
      orderBy: [{ nextCallAt: "asc" }, { position: "asc" }],
      take: 5,
      select: {
        id: true,
        campaignId: true,
        position: true,
        nextCallAt: true,
        prospect: {
          select: {
            id: true,
            name: true,
            phone1: true,
            city: true,
            state: true,
          },
        },
        campaign: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      serverNow: now.toISOString(),
      due,
      dueCount: due.length,
      upcoming,
    });
  } catch (error: any) {
    console.error("[DIALER_CALLBACKS_GET_ERROR]", error);

    return NextResponse.json(
      { success: false, error: error?.message || "Erro ao carregar retornos." },
      { status: 500 }
    );
  }
}
