import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/server-company";

export const dynamic = "force-dynamic";

const RESULT_LABELS: Record<string, string> = {
  ANSWERED: "Atendeu",
  NO_ANSWER: "Não atendeu",
  BUSY: "Ocupado",
  VOICEMAIL: "Caixa postal",
  CALLBACK: "Retornar",
  SALE: "Venda",
  INVALID_NUMBER: "Número inválido",
  HAS_PMG_SELLER: "Já tem vendedor PMG",
  NO_INTEREST: "Sem interesse / desligou",
  BUSINESS_CLOSED: "Comércio encerrado",
  WHATSAPP_REQUEST: "Pediu WhatsApp",
};

async function getOwnedCampaign(req: NextRequest, id: string) {
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

  return { access, campaign, error: null };
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const owned = await getOwnedCampaign(req, id);

    if (owned.error) return owned.error;

    const calls = await prisma.dialerCall.findMany({
      where: {
        campaignId: id,
        company_id: owned.access.companyId,
        user_id: owned.access.userId,
      },
      orderBy: {
        createdAt: "asc",
      },
      select: {
        id: true,
        campaignContactId: true,
        result: true,
        notes: true,
        phone: true,
        createdAt: true,
        finishedAt: true,
        campaignContact: {
          select: {
            id: true,
            position: true,
            attempts: true,
            prospect: {
              select: {
                id: true,
                externalId: true,
                name: true,
                phone1: true,
                city: true,
                state: true,
              },
            },
          },
        },
      },
    });

    // Último resultado por contato
    const latestByContact = new Map<string, (typeof calls)[number]>();

    for (const call of calls) {
      latestByContact.set(call.campaignContactId, call);
    }

    const latest = Array.from(latestByContact.values()).sort(
      (a, b) =>
        (a.campaignContact?.position || 0) -
        (b.campaignContact?.position || 0)
    );

    const byResult: Record<string, number> = {};

    for (const call of latest) {
      byResult[call.result] = (byResult[call.result] || 0) + 1;
    }

    const noAnswer = latest
      .filter((call) => call.result === "NO_ANSWER")
      .map((call) => ({
        campaignContactId: call.campaignContactId,
        position: call.campaignContact?.position || null,
        attempts: call.campaignContact?.attempts || 0,
        result: call.result,
        resultLabel: RESULT_LABELS[call.result] || call.result,
        notes: call.notes,
        lastCallAt: call.finishedAt || call.createdAt,
        prospect: call.campaignContact?.prospect || null,
      }));

    const items = latest.map((call) => ({
      campaignContactId: call.campaignContactId,
      position: call.campaignContact?.position || null,
      attempts: call.campaignContact?.attempts || 0,
      result: call.result,
      resultLabel: RESULT_LABELS[call.result] || call.result,
      notes: call.notes,
      lastCallAt: call.finishedAt || call.createdAt,
      prospect: call.campaignContact?.prospect || null,
    }));

    return NextResponse.json({
      success: true,
      campaign: owned.campaign,
      summary: {
        total: owned.campaign?.total || 0,
        called: latest.length,
        answered:
          (byResult.ANSWERED || 0) +
          (byResult.SALE || 0) +
          (byResult.HAS_PMG_SELLER || 0) +
          (byResult.NO_INTEREST || 0) +
          (byResult.BUSINESS_CLOSED || 0) +
          (byResult.WHATSAPP_REQUEST || 0),
        sales: byResult.SALE || 0,
        noAnswer: byResult.NO_ANSWER || 0,
        busy: byResult.BUSY || 0,
        voicemail: byResult.VOICEMAIL || 0,
        callback: byResult.CALLBACK || 0,
        invalid: byResult.INVALID_NUMBER || 0,
      },
      byResult,
      noAnswer,
      items,
    });
  } catch (error: any) {
    console.error("[DIALER_REPORT_GET_ERROR]", error);

    return NextResponse.json(
      { success: false, error: error?.message || "Erro ao gerar relatório." },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const owned = await getOwnedCampaign(req, id);

    if (owned.error) return owned.error;

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "").trim();

    if (action !== "REQUEUE_NO_ANSWER") {
      return NextResponse.json(
        { success: false, error: "Ação inválida." },
        { status: 400 }
      );
    }

    const calls = await prisma.dialerCall.findMany({
      where: {
        campaignId: id,
        company_id: owned.access.companyId,
        user_id: owned.access.userId,
      },
      orderBy: {
        createdAt: "asc",
      },
      select: {
        campaignContactId: true,
        result: true,
        createdAt: true,
      },
    });

    const latestResult = new Map<string, string>();

    for (const call of calls) {
      latestResult.set(call.campaignContactId, call.result);
    }

    const contactIds = Array.from(latestResult.entries())
      .filter(([, result]) => result === "NO_ANSWER")
      .map(([contactId]) => contactId);

    if (!contactIds.length) {
      return NextResponse.json(
        {
          success: false,
          error: "Não existem contatos com último resultado 'Não atendeu'.",
        },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.dialerCampaignContact.updateMany({
        where: {
          id: { in: contactIds },
          campaignId: id,
        },
        data: {
          status: "PENDING",
          nextCallAt: null,
        },
      });

      await tx.dialerCampaign.update({
        where: {
          id,
        },
        data: {
          status: "IN_PROGRESS",
          finishedAt: null,
        },
      });
    });

    return NextResponse.json({
      success: true,
      requeued: contactIds.length,
    });
  } catch (error: any) {
    console.error("[DIALER_REPORT_REQUEUE_ERROR]", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Erro ao recolocar não atendidos na fila.",
      },
      { status: 500 }
    );
  }
}
