import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWebPush } from "@/lib/push";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

function normalizePhone(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}

async function sendSellerAlert(args: {
  companyId: string;
  sellerId: string | null;
  orderId: string;
  customerName: string;
  customerPhone?: string | null;
  alertCount: number;
  level: "WARNING" | "CRITICAL";
  origin: string;
}) {
  if (!args.sellerId) return { sent: 0, failed: 0 };

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

  if (!subscriptions.length) return { sent: 0, failed: 0 };

  const phone = normalizePhone(args.customerPhone);
  const crmUrl = new URL(
    `/crm/dashboard/orders?deliveryAlert=${encodeURIComponent(args.orderId)}`,
    args.origin
  ).toString();

  const whatsappUrl = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(
        `Olá, tudo bem? Sua entrega está prevista para hoje e ainda não recebemos sua confirmação de disponibilidade. Você está no estabelecimento para receber o pedido?`
      )}`
    : "";

  const title =
    args.level === "CRITICAL"
      ? "🚨 ENTREGA EM RISCO — AÇÃO AGORA"
      : "⚠️ Cliente ainda não confirmou";

  const body =
    args.level === "CRITICAL"
      ? `${args.customerName} não respondeu após ${args.alertCount} alertas. Ligue ou chame no WhatsApp.`
      : `${args.customerName} ainda não confirmou a entrega após ${args.alertCount} alertas.`;

  let sent = 0;
  let failed = 0;

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
          title,
          body,
          url: crmUrl,
          tag: `seller-delivery-${args.orderId}-${args.level}`,
          type: "SELLER_DELIVERY_ALERT",
          requireInteraction: true,
          renotify: true,
          vibrate:
            args.level === "CRITICAL"
              ? [1000, 200, 1000, 200, 1600]
              : [500, 150, 500, 150, 900],
          actions: [
            ...(phone ? [{ action: "call", title: "📞 Ligar" }] : []),
            ...(phone ? [{ action: "whatsapp", title: "💬 WhatsApp" }] : []),
          ],
        }
      );
      sent += 1;
    } catch (error: any) {
      failed += 1;

      if ([404, 410].includes(Number(error?.statusCode))) {
        await prisma.$executeRawUnsafe(
          `UPDATE seller_push_subscriptions
           SET active = false,
               revoked_at = now(),
               updated_at = now()
           WHERE id = $1::uuid`,
          subscription.id
        );
      }
    }
  }

  return { sent, failed };
}

async function eventExists(trackingId: string, eventType: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ found: boolean }>>(
    `SELECT EXISTS (
       SELECT 1
       FROM order_delivery_events
       WHERE tracking_id = $1::uuid
         AND event_type = $2
     ) AS found`,
    trackingId,
    eventType
  );

  return Boolean(rows[0]?.found);
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const origin =
      process.env.NEXT_PUBLIC_APP_URL ||
      new URL(req.url).origin;

    const due = await prisma.$queryRawUnsafe<any[]>(
      `SELECT
         odt.id,
         odt.company_id,
         odt.order_id,
         odt.customer_id,
         odt.seller_id,
         odt.delivery_start,
         odt.delivery_end,
         odt.alert_count,
         so.customer_name,
         sc.whatsapp,
         sc.phone,
         wpa.token_value
       FROM order_delivery_tracking odt
       JOIN "SalesOrder" so ON so.id = odt.order_id
       LEFT JOIN "SalesCustomer" sc ON sc.id = odt.customer_id
       LEFT JOIN web_promotion_access wpa
         ON wpa.customer_id = odt.customer_id
        AND wpa.active = true
       WHERE odt.status = 'PENDING'
         AND odt.next_alert_at IS NOT NULL
         AND odt.next_alert_at <= now()
         AND odt.delivery_end > now()
       ORDER BY odt.next_alert_at ASC
       LIMIT 100`
    );

    let sent = 0;
    let withoutPush = 0;
    let failed = 0;
    let sellerSent = 0;
    let sellerFailed = 0;

    for (const item of due) {
      const phone = item.whatsapp || item.phone || null;
      const nextAttempt = Number(item.alert_count || 0) + 1;

      if (!item.customer_id || !item.token_value) {
        withoutPush += 1;

        await prisma.$executeRawUnsafe(
          `UPDATE order_delivery_tracking
           SET next_alert_at = now() + interval '3 minutes',
               alert_count = alert_count + 1,
               last_alert_at = now(),
               updated_at = now()
           WHERE id = $1::uuid
             AND status = 'PENDING'`,
          item.id
        );
      } else {
        const subscriptions = await prisma.$queryRawUnsafe<any[]>(
          `SELECT ps.id, ps.endpoint, ps.p256dh, ps.auth_key
           FROM push_subscriptions ps
           JOIN push_preferences pp ON pp.subscription_id = ps.id
           WHERE ps.company_id = $1::uuid
             AND ps.customer_id = $2::uuid
             AND ps.active = true
             AND ps.permission = 'granted'
             AND pp.deliveries_enabled = true`,
          item.company_id,
          item.customer_id
        );

        if (!subscriptions.length) {
          withoutPush += 1;
        }

        const start = new Date(item.delivery_start).toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "America/Sao_Paulo",
        });
        const end = new Date(item.delivery_end).toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "America/Sao_Paulo",
        });

        const url = new URL(
          `/ofertas/${encodeURIComponent(item.token_value)}/entrega/${encodeURIComponent(item.order_id)}`,
          origin
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
                title: "🚨🚚 ENTREGA HOJE — CONFIRME AGORA",
                body: `Sua entrega está prevista entre ${start} e ${end}. Toque para confirmar se está preparado para receber.`,
                url,
                tag: `delivery-${item.order_id}`,
                type: "DELIVERY",
                requireInteraction: true,
                renotify: true,
                vibrate: [800, 200, 800, 200, 1200],
              }
            );
            sent += 1;
          } catch (error: any) {
            failed += 1;

            if ([404, 410].includes(Number(error?.statusCode))) {
              await prisma.$executeRawUnsafe(
                `UPDATE push_subscriptions
                 SET active = false,
                     revoked_at = now(),
                     updated_at = now()
                 WHERE id = $1::uuid`,
                subscription.id
              );
            }
          }
        }

        await prisma.$executeRawUnsafe(
          `UPDATE order_delivery_tracking
           SET last_alert_at = now(),
               next_alert_at = now() + interval '3 minutes',
               alert_count = alert_count + 1,
               updated_at = now()
           WHERE id = $1::uuid
             AND status = 'PENDING'`,
          item.id
        );

        await prisma.$executeRawUnsafe(
          `INSERT INTO order_delivery_events (
             tracking_id, company_id, order_id, event_type, metadata
           )
           VALUES ($1::uuid,$2::uuid,$3::uuid,'DELIVERY_PUSH_SENT',$4::jsonb)`,
          item.id,
          item.company_id,
          item.order_id,
          JSON.stringify({
            subscriptions: subscriptions.length,
            attempt: nextAttempt,
          })
        );
      }

      if (nextAttempt >= 3) {
        const warningExists = await eventExists(
          item.id,
          "SELLER_WARNING_PUSH"
        );

        if (!warningExists) {
          const result = await sendSellerAlert({
            companyId: item.company_id,
            sellerId: item.seller_id,
            orderId: item.order_id,
            customerName: item.customer_name || "Cliente",
            customerPhone: phone,
            alertCount: nextAttempt,
            level: "WARNING",
            origin,
          });

          sellerSent += result.sent;
          sellerFailed += result.failed;

          await prisma.$executeRawUnsafe(
            `INSERT INTO order_delivery_events (
               tracking_id, company_id, order_id, event_type, metadata
             )
             VALUES ($1::uuid,$2::uuid,$3::uuid,'SELLER_WARNING_PUSH',$4::jsonb)`,
            item.id,
            item.company_id,
            item.order_id,
            JSON.stringify({ attempt: nextAttempt, sent: result.sent })
          );
        }
      }

      if (nextAttempt >= 5) {
        const criticalExists = await eventExists(
          item.id,
          "SELLER_CRITICAL_PUSH"
        );

        if (!criticalExists) {
          const result = await sendSellerAlert({
            companyId: item.company_id,
            sellerId: item.seller_id,
            orderId: item.order_id,
            customerName: item.customer_name || "Cliente",
            customerPhone: phone,
            alertCount: nextAttempt,
            level: "CRITICAL",
            origin,
          });

          sellerSent += result.sent;
          sellerFailed += result.failed;

          await prisma.$executeRawUnsafe(
            `INSERT INTO order_delivery_events (
               tracking_id, company_id, order_id, event_type, metadata
             )
             VALUES ($1::uuid,$2::uuid,$3::uuid,'SELLER_CRITICAL_PUSH',$4::jsonb)`,
            item.id,
            item.company_id,
            item.order_id,
            JSON.stringify({ attempt: nextAttempt, sent: result.sent })
          );
        }
      }
    }

    return NextResponse.json({
      success: true,
      due: due.length,
      sent,
      withoutPush,
      failed,
      sellerSent,
      sellerFailed,
    });
  } catch (error) {
    console.error("[CRON_DELIVERY_ALERTS]", error);
    return NextResponse.json(
      { error: "Erro ao processar alertas de entrega." },
      { status: 500 }
    );
  }
}
