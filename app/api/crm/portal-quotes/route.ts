import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/server-company";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function clean(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function serialise(quote: any) {
  return {
    ...quote,
    total: quote.total == null ? null : Number(quote.total),
    items: Array.isArray(quote.items)
      ? quote.items.map((item: any) => ({
          ...item,
          requested_quantity:
            item.requested_quantity == null
              ? null
              : Number(item.requested_quantity),
          unit_price:
            item.unit_price == null ? null : Number(item.unit_price),
          subtotal:
            item.subtotal == null ? null : Number(item.subtotal),
        }))
      : [],
  };
}

export async function GET(req: NextRequest) {
  try {
    const access = await requireCompanyAccess(req);
    const params = new URL(req.url).searchParams;
    const customerId = clean(params.get("customerId"), 100);
    const status = clean(params.get("status"), 50);
    const take = Math.max(
      1,
      Math.min(100, Number(params.get("take") || 30))
    );

    const quotes = await prisma.portalQuoteSession.findMany({
      where: {
        company_id: access.companyId,
        seller_id: access.userId,
        ...(customerId ? { customer_id: customerId } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: {
        created_at: "desc",
      },
      take,
      include: {
        items: {
          orderBy: {
            created_at: "asc",
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      quotes: quotes.map(serialise),
    });
  } catch (error: any) {
    console.error("GET /api/crm/portal-quotes:", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Erro ao carregar cotações do Portal.",
      },
      { status: 500 }
    );
  }
}
