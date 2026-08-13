import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/server-company";

export const dynamic = "force-dynamic";

const ALLOWED_RESULTS = new Set([
  "ANSWERED",
  "NO_ANSWER",
  "BUSY",
  "VOICEMAIL",
  "CALLBACK",
  "SALE",
  "INVALID_NUMBER",
]);

export async function POST(req: NextRequest) {
  try {
    const access = await requireCompanyAccess(req);
    const { companyId, userId } = access;

    if (!companyId || !userId) {
      return NextResponse.json(
        { success: false, error: "Empresa ou usuário não identificado." },
        { status: 401 }
      );
    }

    const body = await req.json();

    const campaignId = String(body?.campaignId || "").trim();
    const campaignContactId = String(body?.campaignContactId || "").trim();
    const result = String(body?.result || "").trim().toUpperCase();
    const notes = String(body?.notes || "").trim() || null;

    if (!campaignId || !campaignContactId || !ALLOWED_RESULTS.has(result)) {
      return NextResponse.json(
        { success: false, error: "Dados da ligação inválidos." },
        { status: 400 }
      );
    }

    const campaignContact = await prisma.dialerCampaignContact.findFirst({
      where: {
        id: campaignContactId,
        campaignId,
        campaign: {
          company_id: companyId,
          user_id: userId,
        },
      },
      include: {
        campaign: true,
        prospect: true,
      },
    });

    if (!campaignContact) {
      return NextResponse.json(
        { success: false, error: "Contato da campanha não encontrado." },
        { status: 404 }
      );
    }

    const phone = String(campaignContact.prospect.phone1 || "").trim();

    if (!phone) {
      return NextResponse.json(
        { success: false, error: "Contato sem telefone disponível." },
        { status: 400 }
      );
    }

    let nextCallAt: Date | null = null;

    if (result === "CALLBACK") {
      if (!body?.nextCallAt) {
        return NextResponse.json(
          { success: false, error: "Informe a data e hora do retorno." },
          { status: 400 }
        );
      }

      nextCallAt = new Date(body.nextCallAt);

      if (Number.isNaN(nextCallAt.getTime())) {
        return NextResponse.json(
          { success: false, error: "Data de retorno inválida." },
          { status: 400 }
        );
      }
    }

    const startedAt = body?.startedAt ? new Date(body.startedAt) : null;
    const safeStartedAt =
      startedAt && !Number.isNaN(startedAt.getTime()) ? startedAt : null;

    const wasProcessed = !["PENDING", "CALLBACK"].includes(campaignContact.status);
    const isAnswered = result === "ANSWERED" || result === "SALE";
    const isSale = result === "SALE";
    const finalStatus = result === "CALLBACK" ? "CALLBACK" : "DONE";

    await prisma.$transaction(async (tx) => {
      await tx.dialerCall.create({
        data: {
          company_id: companyId,
          campaignId,
          campaignContactId,
          user_id: userId,
          phone,
          result,
          notes,
          startedAt: safeStartedAt,
          finishedAt: new Date(),
        },
      });

      await tx.dialerCampaignContact.update({
        where: {
          id: campaignContactId,
        },
        data: {
          status: finalStatus,
          attempts: {
            increment: 1,
          },
          lastCallAt: new Date(),
          nextCallAt,
        },
      });

      const campaignUpdate: Record<string, any> = {
        status: "IN_PROGRESS",
      };

      if (!campaignContact.campaign.startedAt) {
        campaignUpdate.startedAt = new Date();
      }

      if (!wasProcessed && result !== "CALLBACK") {
        campaignUpdate.processed = { increment: 1 };
      }

      if (isAnswered) {
        campaignUpdate.answered = { increment: 1 };
      }

      if (isSale) {
        campaignUpdate.sales = { increment: 1 };
      }

      await tx.dialerCampaign.update({
        where: {
          id: campaignId,
        },
        data: campaignUpdate,
      });
    });

    const remaining = await prisma.dialerCampaignContact.count({
      where: {
        campaignId,
        status: {
          in: ["PENDING", "CALLBACK"],
        },
        campaign: {
          company_id: companyId,
          user_id: userId,
        },
      },
    });

    if (remaining === 0) {
      await prisma.dialerCampaign.updateMany({
        where: {
          id: campaignId,
          company_id: companyId,
          user_id: userId,
        },
        data: {
          status: "COMPLETED",
          finishedAt: new Date(),
        },
      });
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error: any) {
    console.error("[DIALER_CALL_POST_ERROR]", error);

    return NextResponse.json(
      { success: false, error: error?.message || "Erro ao salvar ligação." },
      { status: 500 }
    );
  }
}
