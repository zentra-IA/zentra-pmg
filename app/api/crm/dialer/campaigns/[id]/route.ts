import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/server-company";

export const dynamic = "force-dynamic";

async function getOwnedCampaign(
  req: NextRequest,
  id: string
) {
  const access = await requireCompanyAccess(req);
  const { companyId, userId } = access;

  if (!companyId || !userId) {
    return {
      access,
      campaign: null,
      error: NextResponse.json(
        { success: false, error: "Empresa ou usuário não identificado." },
        { status: 401 }
      ),
    };
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
    return {
      access,
      campaign: null,
      error: NextResponse.json(
        { success: false, error: "Campanha não encontrada." },
        { status: 404 }
      ),
    };
  }

  return {
    access,
    campaign,
    error: null,
  };
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { searchParams } = new URL(req.url);
    const requestedContactId = String(
      searchParams.get("contactId") || ""
    ).trim();

    const owned = await getOwnedCampaign(req, id);

    if (owned.error) {
      return owned.error;
    }

    const { campaign } = owned;
    const now = new Date();

    let current: any = null;

    // Quando contactId é informado, permite revisar um cliente anterior
    // sem alterar a fila nem o status dele.
    if (requestedContactId) {
      current = await prisma.dialerCampaignContact.findFirst({
        where: {
          id: requestedContactId,
          campaignId: id,
          campaign: {
            company_id: owned.access.companyId,
            user_id: owned.access.userId,
          },
        },
        include: {
          prospect: true,
        },
      });
    }

    // Operação normal: callback vencido tem prioridade.
    if (!current && !requestedContactId) {
      current = await prisma.dialerCampaignContact.findFirst({
        where: {
          campaignId: id,
          status: "CALLBACK",
          nextCallAt: { lte: now },
          campaign: {
            company_id: owned.access.companyId,
            user_id: owned.access.userId,
          },
        },
        orderBy: [{ nextCallAt: "asc" }, { position: "asc" }],
        include: {
          prospect: true,
        },
      });
    }

    // Depois segue a fila normal.
    if (!current && !requestedContactId) {
      current = await prisma.dialerCampaignContact.findFirst({
        where: {
          campaignId: id,
          status: "PENDING",
          campaign: {
            company_id: owned.access.companyId,
            user_id: owned.access.userId,
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
          company_id: owned.access.companyId,
          user_id: owned.access.userId,
        },
      },
      orderBy: {
        nextCallAt: "asc",
      },
      select: {
        nextCallAt: true,
      },
    });

    let navigation = {
      previousContactId: null as string | null,
      nextContactId: null as string | null,
      isReviewing: false,
    };

    let history: any[] = [];

    if (current) {
      const [previous, next, callHistory] = await Promise.all([
        prisma.dialerCampaignContact.findFirst({
          where: {
            campaignId: id,
            position: { lt: current.position },
            campaign: {
              company_id: owned.access.companyId,
              user_id: owned.access.userId,
            },
          },
          orderBy: {
            position: "desc",
          },
          select: {
            id: true,
          },
        }),
        prisma.dialerCampaignContact.findFirst({
          where: {
            campaignId: id,
            position: { gt: current.position },
            campaign: {
              company_id: owned.access.companyId,
              user_id: owned.access.userId,
            },
          },
          orderBy: {
            position: "asc",
          },
          select: {
            id: true,
          },
        }),
        prisma.dialerCall.findMany({
          where: {
            campaignId: id,
            campaignContactId: current.id,
            company_id: owned.access.companyId,
            user_id: owned.access.userId,
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 20,
          select: {
            id: true,
            result: true,
            notes: true,
            phone: true,
            startedAt: true,
            finishedAt: true,
            createdAt: true,
          },
        }),
      ]);

      navigation = {
        previousContactId: previous?.id || null,
        nextContactId: next?.id || null,
        isReviewing: !["PENDING", "CALLBACK"].includes(current.status),
      };

      history = callHistory;
    }

    return NextResponse.json({
      success: true,
      campaign,
      current: current
        ? {
            id: current.id,
            position: current.position,
            status: current.status,
            attempts: current.attempts,
            lastCallAt: current.lastCallAt,
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
      navigation,
      history,
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

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const owned = await getOwnedCampaign(req, id);

    if (owned.error) {
      return owned.error;
    }

    const body = await req.json().catch(() => ({}));
    const name = String(body?.name || "").trim();

    if (!name) {
      return NextResponse.json(
        { success: false, error: "Informe o nome da campanha." },
        { status: 400 }
      );
    }

    if (name.length > 120) {
      return NextResponse.json(
        { success: false, error: "O nome pode ter no máximo 120 caracteres." },
        { status: 400 }
      );
    }

    const updated = await prisma.dialerCampaign.update({
      where: {
        id,
      },
      data: {
        name,
      },
      select: {
        id: true,
        name: true,
        status: true,
        total: true,
        processed: true,
        answered: true,
        sales: true,
      },
    });

    return NextResponse.json({
      success: true,
      campaign: updated,
    });
  } catch (error: any) {
    console.error("[DIALER_CAMPAIGN_PATCH_ERROR]", error);

    return NextResponse.json(
      { success: false, error: error?.message || "Erro ao editar campanha." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const owned = await getOwnedCampaign(req, id);

    if (owned.error) {
      return owned.error;
    }

    // Remove somente registros do Discador.
    // Prospect/cliente permanece intacto.
    await prisma.dialerCampaign.delete({
      where: {
        id,
      },
    });

    return NextResponse.json({
      success: true,
      deleted: true,
      id,
    });
  } catch (error: any) {
    console.error("[DIALER_CAMPAIGN_DELETE_ERROR]", error);

    return NextResponse.json(
      { success: false, error: error?.message || "Erro ao excluir campanha." },
      { status: 500 }
    );
  }
}
