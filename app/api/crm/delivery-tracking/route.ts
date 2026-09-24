import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/server-company";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function combineDeliveryDate(dateValue: Date | string, hhmm: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(hhmm || "").trim());
  if (!match) return null;

  let year: string;
  let month: string;
  let day: string;

  if (typeof dateValue === "string") {
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateValue.trim());

    if (iso) {
      [, year, month, day] = iso;
    } else {
      const date = new Date(dateValue);
      if (Number.isNaN(date.getTime())) return null;

      year = String(date.getUTCFullYear());
      month = String(date.getUTCMonth() + 1).padStart(2, "0");
      day = String(date.getUTCDate()).padStart(2, "0");
    }
  } else {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return null;

    year = String(date.getUTCFullYear());
    month = String(date.getUTCMonth() + 1).padStart(2, "0");
    day = String(date.getUTCDate()).padStart(2, "0");
  }

  const result = new Date(
    `${year}-${month}-${day}T${match[1]}:${match[2]}:00-03:00`
  );

  return Number.isNaN(result.getTime()) ? null : result;
}

export async function POST(req: NextRequest) {
  try {
    const access = await requireCompanyAccess(req);
    const role = String(access.userRole || "").toUpperCase();
    const body = await req.json().catch(() => ({}));

    const orderId = String(body?.orderId || "").trim();
    const startTime = String(body?.startTime || "").trim();
    const endTime = String(body?.endTime || "").trim();

    if (!orderId || !startTime || !endTime) {
      return NextResponse.json(
        { error: "Pedido, horário inicial e final são obrigatórios." },
        { status: 400 }
      );
    }

    const order = await prisma.salesOrder.findFirst({
      where: {
        id: orderId,
        company_id: access.companyId,
        ...(role === "VENDEDOR" ? { seller_id: access.userId } : {}),
      },
      select: {
        id: true,
        company_id: true,
        seller_id: true,
        customer_id: true,
        delivery_date: true,
      },
    });

    if (!order) {
      return NextResponse.json(
        { error: "Pedido não encontrado ou sem permissão." },
        { status: 404 }
      );
    }

    if (!order.delivery_date) {
      return NextResponse.json(
        { error: "O pedido não possui data de entrega." },
        { status: 409 }
      );
    }

    const deliveryStart = combineDeliveryDate(order.delivery_date, startTime);
    const deliveryEnd = combineDeliveryDate(order.delivery_date, endTime);

    if (!deliveryStart || !deliveryEnd || deliveryEnd <= deliveryStart) {
      return NextResponse.json(
        { error: "Janela de entrega inválida." },
        { status: 400 }
      );
    }

    const firstAlert = new Date(deliveryStart.getTime() - 30 * 60 * 1000);

    const rows = await prisma.$queryRawUnsafe<any[]>(
      `INSERT INTO order_delivery_tracking (
         company_id,
         order_id,
         customer_id,
         seller_id,
         delivery_start,
         delivery_end,
         status,
         first_alert_at,
         next_alert_at,
         alert_count,
         created_at,
         updated_at
       )
       VALUES (
         $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6,'PENDING',$7,$7,0,now(),now()
       )
       ON CONFLICT (order_id)
       DO UPDATE SET
         customer_id = EXCLUDED.customer_id,
         seller_id = EXCLUDED.seller_id,
         delivery_start = EXCLUDED.delivery_start,
         delivery_end = EXCLUDED.delivery_end,
         status = CASE
           WHEN order_delivery_tracking.status IN ('READY','NOT_READY','DELIVERED')
             THEN order_delivery_tracking.status
           ELSE 'PENDING'
         END,
         first_alert_at = EXCLUDED.first_alert_at,
         next_alert_at = CASE
           WHEN order_delivery_tracking.status = 'PENDING' THEN EXCLUDED.first_alert_at
           ELSE order_delivery_tracking.next_alert_at
         END,
         updated_at = now()
       RETURNING *`,
      order.company_id,
      order.id,
      order.customer_id,
      order.seller_id,
      deliveryStart,
      deliveryEnd,
      firstAlert
    );

    await prisma.$executeRawUnsafe(
      `INSERT INTO order_delivery_events (
         tracking_id, company_id, order_id, event_type, metadata
       )
       VALUES ($1::uuid,$2::uuid,$3::uuid,'TRACKING_CONFIGURED',$4::jsonb)`,
      rows[0].id,
      order.company_id,
      order.id,
      JSON.stringify({ startTime, endTime })
    );

    return NextResponse.json({ success: true, tracking: rows[0] });
  } catch (error) {
    console.error("[DELIVERY_TRACKING_POST]", error);
    return NextResponse.json(
      { error: "Erro ao configurar acompanhamento da entrega." },
      { status: 500 }
    );
  }
}


export async function PATCH(req: NextRequest) {
  try {
    const access = await requireCompanyAccess(req);
    const role = String(access.userRole || "").toUpperCase();
    const body = await req.json().catch(() => ({}));

    const trackingId = String(body?.trackingId || "").trim();
    const status = String(body?.status || "").trim().toUpperCase();

    if (!trackingId || !["READY", "NOT_READY"].includes(status)) {
      return NextResponse.json(
        { error: "Entrega ou status inválido." },
        { status: 400 }
      );
    }

    const rows = await prisma.$queryRawUnsafe<any[]>(
      `UPDATE order_delivery_tracking
       SET
         status = $4,
         next_alert_at = NULL,
         seller_alerted_at = CASE
           WHEN $4 = 'NOT_READY' THEN COALESCE(seller_alerted_at, now())
           ELSE seller_alerted_at
         END,
         updated_at = now()
       WHERE id = $1::uuid
         AND company_id = $2::uuid
         AND ($3 <> 'VENDEDOR' OR seller_id = $5::uuid)
       RETURNING *`,
      trackingId,
      access.companyId,
      role,
      status,
      access.userId
    );

    const tracking = rows[0];

    if (!tracking) {
      return NextResponse.json(
        { error: "Entrega não encontrada ou sem permissão." },
        { status: 404 }
      );
    }

    await prisma.$executeRawUnsafe(
      `INSERT INTO order_delivery_events (
         tracking_id,
         company_id,
         order_id,
         event_type,
         metadata,
         created_at
       )
       VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5::jsonb,now())`,
      tracking.id,
      access.companyId,
      tracking.order_id,
      status === "READY"
        ? "SELLER_MARKED_READY"
        : "SELLER_MARKED_NOT_READY",
      JSON.stringify({
        source: "crm_seller",
        seller_id: access.userId,
        status,
      })
    );

    return NextResponse.json({
      success: true,
      tracking,
    });
  } catch (error) {
    console.error("[DELIVERY_TRACKING_PATCH]", error);
    return NextResponse.json(
      { error: "Erro ao atualizar confirmação da entrega." },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const access = await requireCompanyAccess(req);
    const role = String(access.userRole || "").toUpperCase();

    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT
         odt.*,
         so.order_number,
         so.customer_name,
         sc.trade_name,
         sc.legal_name,
         sc.whatsapp,
         sc.phone,
         EXISTS (
           SELECT 1
           FROM push_subscriptions ps
           JOIN push_preferences pp ON pp.subscription_id = ps.id
           WHERE ps.customer_id = odt.customer_id
             AND ps.active = true
             AND ps.permission = 'granted'
             AND pp.deliveries_enabled = true
         ) AS delivery_push_active
       FROM order_delivery_tracking odt
       JOIN "SalesOrder" so ON so.id = odt.order_id
       LEFT JOIN "SalesCustomer" sc ON sc.id = odt.customer_id
       WHERE odt.company_id = $1::uuid
         AND ($2 <> 'VENDEDOR' OR odt.seller_id = $3::uuid)
         AND odt.delivery_start >= now() - interval '12 hours'
         AND odt.delivery_start < now() + interval '36 hours'
       ORDER BY odt.delivery_start ASC`,
      access.companyId,
      role,
      access.userId
    );

    return NextResponse.json({ success: true, deliveries: rows });
  } catch (error) {
    console.error("[DELIVERY_TRACKING_GET]", error);
    return NextResponse.json(
      { error: "Erro ao carregar entregas acompanhadas." },
      { status: 500 }
    );
  }
}
