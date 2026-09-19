import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function getAccess(portalToken: string) {
  return prisma.webPromotionAccess.findFirst({
    where: {
      token_hash: hashToken(portalToken),
      token_value: portalToken,
      active: true,
    },
    select: {
      company_id: true,
      customer_id: true,
      seller_id: true,
    },
  });
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const portalToken = String(url.searchParams.get("portalToken") || "").trim();
    const endpoint = String(url.searchParams.get("endpoint") || "").trim();

    if (!portalToken || !endpoint) {
      return NextResponse.json(
        { error: "portalToken e endpoint são obrigatórios." },
        { status: 400 }
      );
    }

    const access = await getAccess(portalToken);
    if (!access) {
      return NextResponse.json({ error: "Portal inválido." }, { status: 404 });
    }

    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT
         ps.id AS subscription_id,
         COALESCE(pp.promotions_enabled, true) AS promotions_enabled,
         COALESCE(pp.deliveries_enabled, false) AS deliveries_enabled,
         COALESCE(pp.finance_enabled, false) AS finance_enabled
       FROM push_subscriptions ps
       LEFT JOIN push_preferences pp ON pp.subscription_id = ps.id
       WHERE ps.endpoint = $1
         AND ps.company_id = $2::uuid
         AND ps.customer_id = $3::uuid
       LIMIT 1`,
      endpoint,
      access.company_id,
      access.customer_id
    );

    return NextResponse.json({
      success: true,
      preferences: rows[0] || {
        promotions_enabled: true,
        deliveries_enabled: false,
        finance_enabled: false,
      },
    });
  } catch (error) {
    console.error("[PUSH_PREFERENCES_GET]", error);
    return NextResponse.json(
      { error: "Erro ao carregar preferências Push." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const portalToken = String(body?.portalToken || "").trim();
    const endpoint = String(body?.endpoint || "").trim();

    if (!portalToken || !endpoint) {
      return NextResponse.json(
        { error: "portalToken e endpoint são obrigatórios." },
        { status: 400 }
      );
    }

    const access = await getAccess(portalToken);
    if (!access) {
      return NextResponse.json({ error: "Portal inválido." }, { status: 404 });
    }

    const subscriptions = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id
       FROM push_subscriptions
       WHERE endpoint = $1
         AND company_id = $2::uuid
         AND customer_id = $3::uuid
       LIMIT 1`,
      endpoint,
      access.company_id,
      access.customer_id
    );

    const subscriptionId = subscriptions[0]?.id;
    if (!subscriptionId) {
      return NextResponse.json(
        { error: "Ative as notificações neste aparelho primeiro." },
        { status: 409 }
      );
    }

    const promotions =
      typeof body?.promotions_enabled === "boolean"
        ? body.promotions_enabled
        : true;
    const deliveries =
      typeof body?.deliveries_enabled === "boolean"
        ? body.deliveries_enabled
        : false;
    const finance =
      typeof body?.finance_enabled === "boolean"
        ? body.finance_enabled
        : false;

    await prisma.$executeRawUnsafe(
      `INSERT INTO push_preferences (
         subscription_id,
         company_id,
         customer_id,
         promotions_enabled,
         deliveries_enabled,
         finance_enabled,
         created_at,
         updated_at
       )
       VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,now(),now())
       ON CONFLICT (subscription_id)
       DO UPDATE SET
         promotions_enabled = EXCLUDED.promotions_enabled,
         deliveries_enabled = EXCLUDED.deliveries_enabled,
         finance_enabled = EXCLUDED.finance_enabled,
         updated_at = now()`,
      subscriptionId,
      access.company_id,
      access.customer_id,
      promotions,
      deliveries,
      finance
    );

    return NextResponse.json({
      success: true,
      preferences: {
        promotions_enabled: promotions,
        deliveries_enabled: deliveries,
        finance_enabled: finance,
      },
    });
  } catch (error) {
    console.error("[PUSH_PREFERENCES_POST]", error);
    return NextResponse.json(
      { error: "Erro ao salvar preferências Push." },
      { status: 500 }
    );
  }
}
