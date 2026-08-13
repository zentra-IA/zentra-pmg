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

    const campaigns = await prisma.dialerCampaign.findMany({
      where: {
        company_id: companyId,
        user_id: userId,
      },
      orderBy: {
        createdAt: "desc",
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
      take: 100,
    });

    return NextResponse.json({
      success: true,
      campaigns,
    });
  } catch (error: any) {
    console.error("[DIALER_CAMPAIGNS_GET_ERROR]", error);

    return NextResponse.json(
      { success: false, error: error?.message || "Erro ao listar campanhas." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const access = await requireCompanyAccess(req);
    const { companyId, branchId, userId } = access;
    const role = String(access.userRole || "").toUpperCase();

    // Mantém o mesmo comportamento de acesso do Radar reveal-v2.
    if (role === "SUPERVISOR") {
      return NextResponse.json(
        { success: false, error: "Acesso negado." },
        { status: 403 }
      );
    }

    if (!companyId || !userId) {
      return NextResponse.json(
        { success: false, error: "Empresa ou usuário não identificado." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const name = String(body?.name || "").trim();

    const prospectIds: string[] = Array.isArray(body?.prospectIds)
      ? Array.from(
          new Set(
            body.prospectIds
              .map((id: unknown) => String(id).trim())
              .filter(Boolean)
          )
        )
      : [];

    if (!name) {
      return NextResponse.json(
        { success: false, error: "Informe o nome da campanha." },
        { status: 400 }
      );
    }

    if (!prospectIds.length) {
      return NextResponse.json(
        { success: false, error: "Nenhum contato selecionado." },
        { status: 400 }
      );
    }

    // Segurança adicional:
    // o contato precisa ser da empresa E já ter sido revelado para este usuário.
    const prospects = await prisma.prospect.findMany({
      where: {
        company_id: companyId,
        id: { in: prospectIds },
        active: true,
        exports: {
          some: {
            company_id: companyId,
            clientId: userId,
          },
        },
      },
      select: {
        id: true,
        phone1: true,
      },
    });

    const validProspects = prospects.filter((item) => Boolean(item.phone1));

    if (!validProspects.length) {
      return NextResponse.json(
        {
          success: false,
          error: "Nenhum contato revelado com telefone foi encontrado para este usuário.",
        },
        { status: 400 }
      );
    }

    const campaign = await prisma.$transaction(async (tx) => {
      const created = await tx.dialerCampaign.create({
        data: {
          company_id: companyId,
          branch_id: branchId || null,
          user_id: userId,
          name,
          status: "READY",
          total: validProspects.length,
        },
      });

      await tx.dialerCampaignContact.createMany({
        data: validProspects.map((prospect, index) => ({
          campaignId: created.id,
          prospectId: prospect.id,
          position: index + 1,
          status: "PENDING",
        })),
      });

      return created;
    });

    return NextResponse.json({
      success: true,
      campaign: {
        id: campaign.id,
        name: campaign.name,
        total: campaign.total,
        status: campaign.status,
      },
    });
  } catch (error: any) {
    console.error("[DIALER_CAMPAIGNS_POST_ERROR]", error);

    return NextResponse.json(
      { success: false, error: error?.message || "Erro ao criar campanha." },
      { status: 500 }
    );
  }
}
