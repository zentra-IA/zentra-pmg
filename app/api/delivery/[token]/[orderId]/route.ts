import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWebPush } from "@/lib/push";

export const dynamic = "force-dynamic";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function getContext(token: string, orderId: string) {
  const access = await prisma.webPromotionAccess.findFirst({
    where: {
      token_hash: hashToken(token),
      token_value: token,
      active: true,
    },
    select: {
      company_id: true,
      customer_id: true,
      seller_id: true,
    },
  });

  if (!access) return null;

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT
       odt.*,
       odt.seller_id,
       so.order_number,
       so.customer_name,
       so.delivery_date,
       so.payment_terms,
       so.boleto_due_date,
       so.total
     FROM order_delivery_tracking odt
     JOIN "SalesOrder" so ON so.id = odt.order_id
     WHERE odt.order_id = $1::uuid
       AND odt.company_id = $2::uuid
       AND odt.customer_id = $3::uuid
     LIMIT 1`,
    orderId,
    access.company_id,
    access.customer_id
  );

  return rows[0] ? { access, tracking: rows[0] } : null;
}


async function notifySellerNotReady(args: {
  companyId: string;
  sellerId: string | null;
  orderId: string;
  customerName: string;
  origin: string;
}) {
  if (!args.sellerId) return;

  const subscriptions = await prisma.$queryRawUnsafe<any[]>(
    `SELECT id, endpoint, p256dh, auth_key
     FROM seller_push_subscriptions
     WHERE company_id = $1::uuid
       AND seller_id = $2::uuid
       AND active = true
       AND permission = 'granted'`,
    args.companyId,
    args.sellerId
  );

  const url = new URL(
    `/crm/dashboard/orders?deliveryAlert=${encodeURIComponent(args.orderId)}`,
    args.origin
  ).toString();

  for (const subscription of subscriptions) {
    try {
      await sendWebPush(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth_key,
          },
        },
        {
          title: "🚨 CLIENTE NÃO PODE RECEBER",
          body: `${args.customerName} informou que não está preparado para receber a entrega. Entre em contato agora.`,
          url,
          tag: `seller-not-ready-${args.orderId}`,
          type: "SELLER_DELIVERY_ALERT",
          requireInteraction: true,
          renotify: true,
          vibrate: [1000, 200, 1000, 200, 1600],
        }
      );
    } catch {
      // A resposta do cliente não deve falhar só porque o Push do vendedor falhou.
    }
  }
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ token: string; orderId: string }> }
) {
  try {
    const { token, orderId } = await context.params;
    const ctx = await getContext(token, orderId);

    if (!ctx) {
      return NextResponse.json(
        { error: "Entrega não encontrada." },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, delivery: ctx.tracking });
  } catch (error) {
    console.error("[PUBLIC_DELIVERY_GET]", error);
    return NextResponse.json(
      { error: "Erro ao carregar entrega." },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ token: string; orderId: string }> }
) {
  try {
    const { token, orderId } = await context.params;
    const body = await req.json().catch(() => ({}));
    const answer = String(body?.answer || "").toUpperCase();

    if (!["READY", "NOT_READY"].includes(answer)) {
      return NextResponse.json({ error: "Resposta inválida." }, { status: 400 });
    }

    const ctx = await getContext(token, orderId);
    if (!ctx) {
      return NextResponse.json(
        { error: "Entrega não encontrada." },
        { status: 404 }
      );
    }

    const rows = await prisma.$queryRawUnsafe<any[]>(
      `UPDATE order_delivery_tracking
       SET status = $1,
           customer_confirmed_at = now(),
           next_alert_at = NULL,
           updated_at = now()
       WHERE id = $2::uuid
       RETURNING *`,
      answer,
      ctx.tracking.id
    );

    await prisma.$executeRawUnsafe(
      `INSERT INTO order_delivery_events (
         tracking_id, company_id, order_id, event_type, metadata
       )
       VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5::jsonb)`,
      ctx.tracking.id,
      ctx.access.company_id,
      orderId,
      answer === "READY" ? "CUSTOMER_READY" : "CUSTOMER_NOT_READY",
      JSON.stringify({ source: "portal" })
    );

    if (answer === "NOT_READY") {
      await notifySellerNotReady({
        companyId: ctx.access.company_id,
        sellerId: ctx.tracking.seller_id || ctx.access.seller_id || null,
        orderId,
        customerName: ctx.tracking.customer_name || "Cliente",
        origin: new URL(req.url).origin,
      });
    }

    return NextResponse.json({ success: true, delivery: rows[0] });
  } catch (error) {
    console.error("[PUBLIC_DELIVERY_POST]", error);
    return NextResponse.json(
      { error: "Erro ao registrar resposta." },
      { status: 500 }
    );
  }
}
