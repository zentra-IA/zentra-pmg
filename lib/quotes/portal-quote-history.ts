import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

function decimalOrNull(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? new Prisma.Decimal(number) : null;
}

export async function createPortalQuoteSession(params: {
  companyId: string;
  sellerId?: string | null;
  customerId: string;
  conversationId?: string | null;
  rawRequest?: string | null;
  normalizedRequest?: string | null;
  priceTable?: number | null;
  priceTableVersionId?: string | null;
  tableDate?: Date | null;
  source?: string;
  metadata?: Prisma.InputJsonValue;
}) {
  return prisma.portalQuoteSession.create({
    data: {
      company_id: params.companyId,
      seller_id: params.sellerId || null,
      customer_id: params.customerId,
      conversation_id: params.conversationId || null,
      source: params.source || "portal_chat",
      status: "collecting",
      raw_request: params.rawRequest || null,
      normalized_request: params.normalizedRequest || null,
      price_table: params.priceTable ?? null,
      price_table_version_id: params.priceTableVersionId || null,
      table_date: params.tableDate || null,
      metadata: params.metadata,
    },
  });
}

export async function replacePortalQuoteItems(params: {
  quoteSessionId: string;
  items: Array<{
    rawTerm?: string | null;
    productCode?: string | null;
    productName?: string | null;
    requestedQuantity?: number | null;
    requestedUnit?: string | null;
    sellUnit?: string | null;
    unitPrice?: number | null;
    subtotal?: number | null;
    status?: string;
    candidatesSnapshot?: Prisma.InputJsonValue;
    priceSnapshot?: Prisma.InputJsonValue;
  }>;
}) {
  return prisma.$transaction(async (tx) => {
    await tx.portalQuoteItem.deleteMany({
      where: {
        quote_session_id: params.quoteSessionId,
      },
    });

    if (params.items.length) {
      await tx.portalQuoteItem.createMany({
        data: params.items.map((item) => ({
          quote_session_id: params.quoteSessionId,
          raw_term: item.rawTerm || null,
          product_code: item.productCode || null,
          product_name: item.productName || null,
          requested_quantity: decimalOrNull(item.requestedQuantity),
          requested_unit: item.requestedUnit || null,
          sell_unit: item.sellUnit || null,
          unit_price: decimalOrNull(item.unitPrice),
          subtotal: decimalOrNull(item.subtotal),
          status: item.status || "pending",
          candidates_snapshot: item.candidatesSnapshot,
          price_snapshot: item.priceSnapshot,
        })),
      });
    }

    return tx.portalQuoteSession.findUnique({
      where: {
        id: params.quoteSessionId,
      },
      include: {
        items: true,
      },
    });
  });
}

export async function finishPortalQuoteSession(params: {
  quoteSessionId: string;
  status: "quoted" | "accepted" | "handed_off" | "cancelled";
  total?: number | null;
  outputText?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  return prisma.portalQuoteSession.update({
    where: {
      id: params.quoteSessionId,
    },
    data: {
      status: params.status,
      total: decimalOrNull(params.total),
      output_text: params.outputText || null,
      metadata: params.metadata,
      completed_at:
        ["quoted", "accepted", "handed_off", "cancelled"].includes(params.status)
          ? new Date()
          : null,
    },
  });
}
