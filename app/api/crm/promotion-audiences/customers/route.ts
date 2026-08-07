import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/server-company";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(request: NextRequest) {
  try {
    const access = await requireCompanyAccess(request);
    const sellerId = text(access.userId);

    if (!sellerId) {
      return NextResponse.json(
        { error: "Vendedor não identificado." },
        { status: 401 }
      );
    }

    const q = text(request.nextUrl.searchParams.get("q"));
    const requestedLimit = Number(
      request.nextUrl.searchParams.get("limit") || 50
    );
    const limit = Math.min(
      100,
      Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : 50)
    );

    const customers = await prisma.salesCustomer.findMany({
      where: {
        company_id: access.companyId,
        seller_id: sellerId,
        status: {
          equals: "ativo",
          mode: "insensitive",
        },
        ...(q
          ? {
              OR: [
                {
                  legal_name: {
                    contains: q,
                    mode: "insensitive",
                  },
                },
                {
                  trade_name: {
                    contains: q,
                    mode: "insensitive",
                  },
                },
                {
                  document: {
                    contains: q,
                    mode: "insensitive",
                  },
                },
                {
                  whatsapp: {
                    contains: q,
                    mode: "insensitive",
                  },
                },
                {
                  phone: {
                    contains: q,
                    mode: "insensitive",
                  },
                },
                {
                  city: {
                    contains: q,
                    mode: "insensitive",
                  },
                },
                {
                  segment: {
                    contains: q,
                    mode: "insensitive",
                  },
                },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        legal_name: true,
        trade_name: true,
        document: true,
        buyer_name: true,
        whatsapp: true,
        phone: true,
        city: true,
        state: true,
        segment: true,
        category: true,
        distance_km: true,
        price_table: true,
        status: true,
      },
      orderBy: [
        { trade_name: "asc" },
        { legal_name: "asc" },
      ],
      take: limit,
    });

    return NextResponse.json({ customers });
  } catch (error) {
    console.error("[PROMOTION_AUDIENCE_CUSTOMERS_GET]", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao buscar clientes.",
      },
      { status: 500 }
    );
  }
}
