import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/server-company";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const access = await requireCompanyAccess(req);
    const { companyId, userId } = access;
    const { id } = await context.params;

    if (!companyId || !userId) {
      return NextResponse.json(
        { success: false, error: "Empresa ou usuário não identificado." },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const campaignId = String(body?.campaignId || "").trim();
    const nextCallAtRaw = body?.nextCallAt || null;

    if (!campaignId) {
      return NextResponse.json(
        { success: false, error: "Campanha não identificada." },
        { status: 400 }
      );
    }

    const contact = await prisma.dialerCampaignContact.findFirst({
      where: {
        id,
        campaignId,
        campaign: {
          company_id: companyId,
          user_id: userId,
        },
      },
      select: {
        id: true,
        campaignId: true,
      },
    });

    if (!contact) {
      return NextResponse.json(
        { success: false, error: "Contato da campanha não encontrado." },
        { status: 404 }
      );
    }

    let nextCallAt: Date | null = null;
    let status = "PENDING";

    if (nextCallAtRaw) {
      nextCallAt = new Date(nextCallAtRaw);

      if (Number.isNaN(nextCallAt.getTime())) {
        return NextResponse.json(
          { success: false, error: "Data de nova tentativa inválida." },
          { status: 400 }
        );
      }

      status = "CALLBACK";
    }

    await prisma.$transaction(async (tx) => {
      await tx.dialerCampaignContact.update({
        where: {
          id,
        },
        data: {
          status,
          nextCallAt,
        },
      });

      await tx.dialerCampaign.update({
        where: {
          id: campaignId,
        },
        data: {
          status: "IN_PROGRESS",
          finishedAt: null,
        },
      });
    });

    return NextResponse.json({
      success: true,
      status,
      nextCallAt,
    });
  } catch (error: any) {
    console.error("[DIALER_RETRY_POST_ERROR]", error);

    return NextResponse.json(
      { success: false, error: error?.message || "Erro ao recolocar contato na fila." },
      { status: 500 }
    );
  }
}
