import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/server-company";
import { portalChatClean } from "@/lib/portal-chat";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MATCH_TYPES = new Set(["contains", "exact", "starts_with"]);

async function requireSeller(req: NextRequest) {
  const access = await requireCompanyAccess(req);
  const companyId = portalChatClean(access?.companyId);
  const sellerId = portalChatClean(access?.userId);
  const role = portalChatClean(access?.userRole).toUpperCase();

  if (!companyId || !sellerId) throw new Error("AUTH_NOT_FOUND");
  if (role === "SUPERVISOR") throw new Error("ACCESS_DENIED");

  return { companyId, sellerId };
}

function stringList(value: unknown) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => portalChatClean(item)).filter(Boolean))].slice(0, 80);
  }

  return [
    ...new Set(
      portalChatClean(value)
        .split(/\r?\n|,|;/)
        .map((item) => item.trim())
        .filter(Boolean)
    ),
  ].slice(0, 80);
}


function variationList(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((item) => portalChatClean(item))
      .filter(Boolean)
      .slice(0, 30);
  }

  return portalChatClean(value)
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 30);
}

function intValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function payload(body: any) {
  const name = portalChatClean(body?.name).slice(0, 120);
  const responseText = portalChatClean(
    body?.responseText || body?.response_text
  ).slice(0, 10000);
  const intent =
    portalChatClean(body?.intent).toUpperCase().slice(0, 80) || null;
  const matchTypeRaw = portalChatClean(
    body?.matchType || body?.match_type
  ).toLowerCase();
  const matchType = MATCH_TYPES.has(matchTypeRaw)
    ? matchTypeRaw
    : "contains";
  const triggerKeywords = stringList(
    body?.triggerKeywords || body?.trigger_keywords
  );
  const responseVariations = variationList(
    body?.responseVariations || body?.response_variations
  ).map((item) => item.slice(0, 10000));
  const isFallback =
    body?.isFallback !== undefined
      ? body.isFallback === true
      : body?.is_fallback === true;
  const priority = Math.max(-1000, Math.min(1000, intValue(body?.priority, 0)));
  const active = body?.active !== false;

  if (!name) throw new Error("NAME_REQUIRED");
  if (!responseText) throw new Error("RESPONSE_REQUIRED");
  if (!isFallback && !triggerKeywords.length && !intent) {
    throw new Error("TRIGGER_REQUIRED");
  }

  return {
    name,
    intent,
    trigger_keywords: triggerKeywords,
    match_type: matchType,
    response_text: responseText,
    response_variations: responseVariations,
    is_fallback: isFallback,
    priority,
    active,
  };
}

function errorResponse(error: any) {
  const message = error?.message || "Erro no chatbot do Portal.";

  if (message === "AUTH_NOT_FOUND") {
    return NextResponse.json({ success: false, error: "Usuário não identificado." }, { status: 401 });
  }
  if (message === "ACCESS_DENIED") {
    return NextResponse.json({ success: false, error: "Acesso negado." }, { status: 403 });
  }
  if (message === "NAME_REQUIRED") {
    return NextResponse.json({ success: false, error: "Informe um nome para a automação." }, { status: 400 });
  }
  if (message === "RESPONSE_REQUIRED") {
    return NextResponse.json({ success: false, error: "Informe a resposta automática." }, { status: 400 });
  }
  if (message === "TRIGGER_REQUIRED") {
    return NextResponse.json(
      { success: false, error: "Informe palavras-chave, uma intenção ou marque como resposta padrão." },
      { status: 400 }
    );
  }

  console.error("[PORTAL_CHAT_AUTOMATIONS]", error);
  return NextResponse.json(
    { success: false, error: "Erro ao processar chatbot do Portal." },
    { status: 500 }
  );
}

export async function GET(req: NextRequest) {
  try {
    const access = await requireSeller(req);
    const automations = await prisma.portalChatAutomation.findMany({
      where: {
        company_id: access.companyId,
        seller_id: access.sellerId,
      },
      orderBy: [
        { active: "desc" },
        { priority: "desc" },
        { updated_at: "desc" },
      ],
      take: 300,
    });

    return NextResponse.json({ success: true, automations });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const access = await requireSeller(req);
    const body = await req.json().catch(() => ({}));
    const data = payload(body);

    if (data.is_fallback) {
      await prisma.portalChatAutomation.updateMany({
        where: {
          company_id: access.companyId,
          seller_id: access.sellerId,
          is_fallback: true,
        },
        data: { is_fallback: false },
      });
    }

    const automation = await prisma.portalChatAutomation.create({
      data: {
        company_id: access.companyId,
        seller_id: access.sellerId,
        ...data,
      },
    });

    return NextResponse.json({ success: true, automation });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const access = await requireSeller(req);
    const body = await req.json().catch(() => ({}));
    const id = portalChatClean(body?.id);

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Automação não informada." },
        { status: 400 }
      );
    }

    const existing = await prisma.portalChatAutomation.findFirst({
      where: {
        id,
        company_id: access.companyId,
        seller_id: access.sellerId,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Automação não encontrada." },
        { status: 404 }
      );
    }

    if (body?.toggleOnly === true || body?.toggle_only === true) {
      const automation = await prisma.portalChatAutomation.update({
        where: { id },
        data: { active: body?.active === true },
      });

      return NextResponse.json({ success: true, automation });
    }

    const data = payload({ ...existing, ...body });

    if (data.is_fallback) {
      await prisma.portalChatAutomation.updateMany({
        where: {
          company_id: access.companyId,
          seller_id: access.sellerId,
          is_fallback: true,
          id: { not: id },
        },
        data: { is_fallback: false },
      });
    }

    const automation = await prisma.portalChatAutomation.update({
      where: { id },
      data,
    });

    return NextResponse.json({ success: true, automation });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const access = await requireSeller(req);
    const id = portalChatClean(req.nextUrl.searchParams.get("id"));

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Automação não informada." },
        { status: 400 }
      );
    }

    const result = await prisma.portalChatAutomation.deleteMany({
      where: {
        id,
        company_id: access.companyId,
        seller_id: access.sellerId,
      },
    });

    if (!result.count) {
      return NextResponse.json(
        { success: false, error: "Automação não encontrada." },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
