import { NextRequest, NextResponse } from "next/server";
import { runCommercialQuoteEngine } from "@/lib/quotes/engine";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function isValidUuid(value: unknown): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "")
  );
}

async function resolveCompanyId(incomingCompanyId: unknown) {
  if (isValidUuid(incomingCompanyId)) return String(incomingCompanyId);

  const company = await prisma.companies.findFirst({
    select: { id: true },
    orderBy: { created_at: "asc" },
  });

  return company?.id || null;
}

function asNumber(value: any): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "number") return value;
  if (typeof value?.toNumber === "function") return value.toNumber();

  const parsed = Number(String(value).replace(/[^\d,.-]/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const companyId = await resolveCompanyId(
      body.companyId || body.company_id || body.company?.id || body.company
    );

    const rawText = String(
      body.rawText ||
        body.raw_text ||
        body.requestText ||
        body.text ||
        body.query ||
        body.orderText ||
        body.pedido ||
        body.message ||
        body.content ||
        ""
    ).trim();

    if (!companyId || !rawText) {
      return NextResponse.json(
        { error: "companyId e rawText são obrigatórios." },
        { status: 400 }
      );
    }

    const products = await prisma.quote_catalog_products.findMany({
      where: {
        company_id: companyId,
        active: true,
      },
      orderBy: {
        official_name: "asc",
      },
      take: 10000,
    });

    const latestPrices = await prisma.quote_daily_prices.findMany({
      where: { company_id: companyId },
      orderBy: [{ table_date: "desc" }, { updated_at: "desc" }],
      take: 20000,
    });

    const priceByCode = new Map<string, any>();
    for (const price of latestPrices) {
      if (!priceByCode.has(price.code)) {
        priceByCode.set(price.code, price);
      }
    }

    const catalog = products.map((p) => {
      const price = priceByCode.get(p.code);

      return {
        id: p.id,
        companyId: p.company_id,
        code: p.code,
        descricaoOriginal: p.official_name,
        produto: p.official_name,
        marca: p.brand || undefined,
        categoria: p.category || undefined,
        familia: p.category || undefined,
        subtipo: p.subcategory || undefined,
        linha: p.subcategory || undefined,
        sabor: undefined,
        embalagem: p.package_type || undefined,
        vendePor: price?.sell_unit || p.default_sell_unit || undefined,
        peso: asNumber(p.weight_value),
        pesoPeca: undefined,
        pesoPacote: undefined,
        pesoCaixa: undefined,
        pecasCaixa: undefined,
        pacotesCaixa: undefined,
        aliases: p.synonyms || [],
        keywords: p.forbidden_terms || [],
        searchText: p.normalized_name,
        price: asNumber(price?.price),
      };
    });

   const result = runCommercialQuoteEngine({
  companyId,
  rawText,
  catalog,
});
    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error("QUOTE_AI_ERROR", error);

    return NextResponse.json(
      { error: error?.message || "Erro ao processar cotação com IA." },
      { status: 500 }
    );
  }
}
