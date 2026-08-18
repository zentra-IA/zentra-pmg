import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/server-company";

export const dynamic = "force-dynamic";

function clean(value: unknown, max = 180) {
  return String(value ?? "").trim().slice(0, max);
}

function normalizePhone(value: unknown) {
  let digits = clean(value, 40).replace(/\D/g, "");

  if (digits.startsWith("55") && digits.length >= 12) {
    digits = digits.slice(2);
  }

  if (digits.length !== 10 && digits.length !== 11) {
    return "";
  }

  return digits;
}

function sourceObject(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, any>;
  }

  return {};
}

export async function PATCH(
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
    const campaignId = clean(body?.campaignId, 120);

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
      include: {
        prospect: true,
      },
    });

    if (!contact) {
      return NextResponse.json(
        { success: false, error: "Contato da campanha não encontrado." },
        { status: 404 }
      );
    }

    const payload = sourceObject(contact.prospect.sourcePayload);

    if (
      String(payload.source || "") !== "DIALER_MANUAL" ||
      String(payload.ownerUserId || "") !== userId
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Somente contatos de campanhas manuais podem ser editados nesta tela.",
        },
        { status: 403 }
      );
    }

    const name = clean(body?.name, 180);
    const phone1 = normalizePhone(body?.phone1);
    const whatsappRaw = clean(body?.whatsapp, 40);
    const whatsapp = whatsappRaw ? normalizePhone(whatsappRaw) : "";

    if (!name) {
      return NextResponse.json(
        { success: false, error: "Informe o nome/empresa." },
        { status: 400 }
      );
    }

    if (!phone1) {
      return NextResponse.json(
        { success: false, error: "Informe um telefone válido com DDD." },
        { status: 400 }
      );
    }

    if (whatsappRaw && !whatsapp) {
      return NextResponse.json(
        { success: false, error: "O WhatsApp informado é inválido." },
        { status: 400 }
      );
    }

    const responsibleName = clean(body?.responsibleName, 140);
    const responsibleRole = clean(body?.responsibleRole, 120);
    const city = clean(body?.city, 120);
    const segment = clean(body?.segment, 120);
    const manualNotes = clean(body?.manualNotes, 1500);

    const updated = await prisma.prospect.update({
      where: {
        id: contact.prospectId,
      },
      data: {
        name,
        phone1,
        phone2: whatsapp || null,
        city: city || null,
        segment: segment || null,
        sourcePayload: {
          ...payload,
          source: "DIALER_MANUAL",
          ownerUserId: userId,
          responsibleName: responsibleName || null,
          responsibleRole: responsibleRole || null,
          whatsapp: whatsapp || null,
          manualNotes: manualNotes || null,
          updatedAt: new Date().toISOString(),
        },
      },
      select: {
        id: true,
        externalId: true,
        name: true,
        phone1: true,
        phone2: true,
        city: true,
        state: true,
        segment: true,
        sourcePayload: true,
      },
    });

    return NextResponse.json({
      success: true,
      prospect: updated,
    });
  } catch (error: any) {
    console.error("[DIALER_MANUAL_CONTACT_PATCH_ERROR]", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Erro ao atualizar contato manual.",
      },
      { status: 500 }
    );
  }
}
