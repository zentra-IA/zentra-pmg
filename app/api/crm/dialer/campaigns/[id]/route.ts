import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/server-company";

export const dynamic = "force-dynamic";

export async function GET(
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

    const campaign = await prisma.dialerCampaign.findFirst({
      where: {
        id,
        company_id: companyId,
        user_id: userId,
      },
      select: {
        id: true,
        name: true,
        status: true,
        total: true,
        processed: true,
        answered: true,
        sales: true,
        createdAt: true,
        startedAt: true,
        finishedAt: true,
      },
    });

    if (!campaign) {
      return NextResponse.json(
        { success: false, error: "Campanha não encontrada." },
        { status: 404 }
      );
    }

    const now = new Date();

    // Primeiro prioriza retornos que já venceram; depois segue a fila normal.
    let current = await prisma.dialerCampaignContact.findFirst({
      where: {
        campaignId: id,
        status: "CALLBACK",
        nextCallAt: { lte: now },
        campaign: {
          company_id: companyId,
          user_id: userId,
        },
      },
      orderBy: [{ nextCallAt: "asc" }, { position: "asc" }],
      include: {
        prospect: true,
      },
    });

    if (!current) {
      current = await prisma.dialerCampaignContact.findFirst({
        where: {
          campaignId: id,
          status: "PENDING",
          campaign: {
            company_id: companyId,
            user_id: userId,
          },
        },
        orderBy: {
          position: "asc",
        },
        include: {
          prospect: true,
        },
      });
    }

    const nextCallback = await prisma.dialerCampaignContact.findFirst({
      where: {
        campaignId: id,
        status: "CALLBACK",
        nextCallAt: { gt: now },
        campaign: {
          company_id: companyId,
          user_id: userId,
        },
      },
      orderBy: {
        nextCallAt: "asc",
      },
      select: {
        nextCallAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      campaign,
      current: current
        ? {
            id: current.id,
            position: current.position,
            status: current.status,
            attempts: current.attempts,
            nextCallAt: current.nextCallAt,
            prospect: {
              id: current.prospect.id,
              externalId: current.prospect.externalId || null,
              name: current.prospect.name,
              city: current.prospect.city || null,
              state: current.prospect.state || null,
              segment: current.prospect.segment || null,
              category: current.prospect.category || null,
              productInterest: current.prospect.productInterest || null,
              phone1: current.prospect.phone1 || null,
              phone2: current.prospect.phone2 || null,
              lastOrderAt: current.prospect.lastOrderAt || null,
              creditLimit: current.prospect.creditLimit ?? null,
              paymentMethod: current.prospect.paymentMethod || null,
            },
          }
        : null,
      nextCallbackAt: nextCallback?.nextCallAt || null,
    });
  } catch (error: any) {
    console.error("[DIALER_CAMPAIGN_GET_ERROR]", error);

    return NextResponse.json(
      { success: false, error: error?.message || "Erro ao carregar campanha." },
      { status: 500 }
    );
  }
}
