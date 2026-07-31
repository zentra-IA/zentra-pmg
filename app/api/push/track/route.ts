import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED_EVENTS = new Set([
  "clicked",
  "opened",
  "viewed",
  "whatsapp",
]);

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const portalToken = text(body?.portalToken);
    const promotionId = text(body?.promotionId);
    const deliveryId = text(body?.deliveryId);
    const event = text(body?.event).toLowerCase();

    if (
      !portalToken ||
      !promotionId ||
      !deliveryId ||
      !ALLOWED_EVENTS.has(event)
    ) {
      return NextResponse.json(
        { error: "Evento de tracking inválido." },
        { status: 400 }
      );
    }

    // Valida o token permanente do cliente.
    const access = await prisma.webPromotionAccess.findFirst({
      where: {
        token_value: portalToken,
        active: true,
      },
      select: {
        company_id: true,
        customer_id: true,
      },
    });

    if (!access) {
      return NextResponse.json(
        { error: "Portal inválido ou revogado." },
        { status: 404 }
      );
    }

    // O delivery precisa pertencer ao mesmo cliente, empresa e promoção.
    const delivery = await prisma.pushDelivery.findFirst({
      where: {
        id: deliveryId,
        promotion_id: promotionId,
        company_id: access.company_id,
        customer_id: access.customer_id,
      },
      select: {
        id: true,
        status: true,
        clicked_at: true,
        opened_at: true,
        viewed_at: true,
        whatsapp_clicked_at: true,
      },
    });

    if (!delivery) {
      return NextResponse.json(
        { error: "Entrega não encontrada para este cliente." },
        { status: 404 }
      );
    }

    const now = new Date();
    const deliveryData: Record<string, unknown> = {};
    const customerData: Record<string, unknown> = {};

    if (event === "clicked" && !delivery.clicked_at) {
      deliveryData.clicked_at = now;
      deliveryData.status = "clicked";
      customerData.last_promotion_click_at = now;
    }

    if (event === "opened" && !delivery.opened_at) {
      deliveryData.opened_at = now;

      // Não regride clicked -> opened.
      if (delivery.status !== "clicked") {
        deliveryData.status = "opened";
      }

      customerData.last_promotion_open_at = now;
    }

    if (event === "viewed" && !delivery.viewed_at) {
      deliveryData.viewed_at = now;

      // Status visualização é o estágio mais profundo do portal.
      deliveryData.status = "viewed";
      customerData.last_promotion_view_at = now;
    }

    if (event === "whatsapp" && !delivery.whatsapp_clicked_at) {
      deliveryData.whatsapp_clicked_at = now;
      customerData.last_promotion_click_at = now;
    }

    const operations = [];

    if (Object.keys(deliveryData).length) {
      operations.push(
        prisma.pushDelivery.update({
          where: { id: delivery.id },
          data: deliveryData,
        })
      );
    }

    if (Object.keys(customerData).length) {
      operations.push(
        prisma.salesCustomer.update({
          where: { id: access.customer_id },
          data: customerData,
        })
      );
    }

    // Mantém o último acesso ao portal atualizado.
    operations.push(
      prisma.webPromotionAccess.updateMany({
        where: {
          token_value: portalToken,
          customer_id: access.customer_id,
          active: true,
        },
        data: {
          last_access_at: now,
        },
      })
    );

    await prisma.$transaction(operations);

    return NextResponse.json({
      success: true,
      event,
      tracked_at: now.toISOString(),
    });
  } catch (error) {
    console.error("[PUSH_TRACK_POST]", error);

    return NextResponse.json(
      { error: "Não foi possível registrar o evento." },
      { status: 500 }
    );
  }
}
