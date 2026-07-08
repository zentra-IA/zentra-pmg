import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FALLBACK_COMPANY_ID =
  process.env.NEXT_PUBLIC_DEFAULT_COMPANY_ID ||
  "11111111-1111-4111-8111-111111111111";

function isUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function resolveCompanyId(value: string | null): string {
  const candidate = String(value || "").trim();

  if (candidate && candidate !== "default-company" && isUUID(candidate)) {
    return candidate;
  }

  return FALLBACK_COMPANY_ID;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;

  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseAttributes(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function uniqueSorted(values: Array<string | null>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const companyId = resolveCompanyId(
      searchParams.get("companyId") || searchParams.get("company_id")
    );

    if (!isUUID(companyId)) {
      return NextResponse.json(
        { success: false, error: "companyId inválido." },
        { status: 400 }
      );
    }

    const q = (searchParams.get("q") || "").trim();
    const category = (searchParams.get("category") || "").trim();
    const tableDate = searchParams.get("tableDate");

    /*
      Importante:
      Antes o endpoint limitava em 500 e a tela usava esse número como total.
      Agora:
      - total/ativos/categorias vêm do banco completo;
      - lista usa limit apenas como paginação/amostra;
      - padrão sobe para 5000 para carregar o catálogo inteiro atual.
    */
    const limitParam = Number(searchParams.get("limit") || 5000);
    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(limitParam, 1), 10000)
      : 5000;

    const baseWhere = {
      company_id: companyId,
      active: true,
      ...(category
        ? {
            category: {
              contains: category,
              mode: "insensitive" as const,
            },
          }
        : {}),
      ...(q
        ? {
            OR: [
              { official_name: { contains: q, mode: "insensitive" as const } },
              {
                normalized_name: {
                  contains: q.toUpperCase(),
                  mode: "insensitive" as const,
                },
              },
              { code: { contains: q, mode: "insensitive" as const } },
              { brand: { contains: q, mode: "insensitive" as const } },
              { category: { contains: q, mode: "insensitive" as const } },
              { subcategory: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const companyWhere = {
      company_id: companyId,
    };

    const [
      totalProducts,
      activeProducts,
      filteredProducts,
      categoryRows,
      subcategoryRows,
      brandRows,
      unitRows,
    ] = await Promise.all([
      prisma.quote_catalog_products.count({
        where: companyWhere,
      }),

      prisma.quote_catalog_products.count({
        where: {
          company_id: companyId,
          active: true,
        },
      }),

      prisma.quote_catalog_products.findMany({
        where: baseWhere,
        orderBy: [{ category: "asc" }, { official_name: "asc" }],
        take: limit,
      }),

      prisma.quote_catalog_products.findMany({
        where: {
          company_id: companyId,
          active: true,
          NOT: { category: null },
        },
        select: { category: true },
        distinct: ["category"],
        orderBy: { category: "asc" },
      }),

      prisma.quote_catalog_products.findMany({
        where: {
          company_id: companyId,
          active: true,
          NOT: { subcategory: null },
        },
        select: { subcategory: true },
        distinct: ["subcategory"],
        orderBy: { subcategory: "asc" },
      }),

      prisma.quote_catalog_products.findMany({
        where: {
          company_id: companyId,
          active: true,
          NOT: { brand: null },
        },
        select: { brand: true },
        distinct: ["brand"],
        orderBy: { brand: "asc" },
      }),

      prisma.quote_catalog_products.findMany({
        where: {
          company_id: companyId,
          active: true,
          NOT: { default_sell_unit: null },
        },
        select: { default_sell_unit: true },
        distinct: ["default_sell_unit"],
        orderBy: { default_sell_unit: "asc" },
      }),
    ]);

    const codes = filteredProducts.map((product) => product.code);

    const prices = codes.length
      ? await prisma.quote_daily_prices.findMany({
          where: {
            company_id: companyId,
            code: { in: codes },
            ...(tableDate ? { table_date: new Date(tableDate) } : {}),
          },
          orderBy: [{ table_date: "desc" }, { updated_at: "desc" }],
        })
      : [];

    const priceByCode = new Map<string, (typeof prices)[number]>();

    for (const price of prices) {
      if (!priceByCode.has(price.code)) {
        priceByCode.set(price.code, price);
      }
    }

    const catalog = filteredProducts.map((product) => {
      const attrs = parseAttributes(product.attributes);
      const price = priceByCode.get(product.code);

      return {
        id: product.id,
        companyId: product.company_id,
        branchId: product.branch_id,
        code: product.code,
        officialName: product.official_name,
        normalizedName: product.normalized_name,
        name: product.official_name,
        product: product.official_name,
        category: product.category,
        subcategory: product.subcategory,
        brand: product.brand,
        packageType: product.package_type,
        packageQty: toNumber(attrs.packageQty),
        packageUnit:
          typeof attrs.packageUnit === "string" ? attrs.packageUnit : null,
        weightValue: toNumber(product.weight_value),
        weightUnit: product.weight_unit,
        defaultSellUnit: product.default_sell_unit,
        sellUnit: price?.sell_unit || product.default_sell_unit,
        synonyms: product.synonyms || [],
        forbiddenTerms: product.forbidden_terms || [],
        active: product.active,
        price: price ? Number(price.price) : null,
        tableDate: price?.table_date || null,
        pdfName: price?.pdf_name || null,
        rawLine: price?.raw_line || null,
        attributes: attrs,
        createdAt: product.created_at,
        updatedAt: product.updated_at,
      };
    });

    const categories = uniqueSorted(categoryRows.map((row) => row.category));
    const subcategories = uniqueSorted(
      subcategoryRows.map((row) => row.subcategory)
    );
    const brands = uniqueSorted(brandRows.map((row) => row.brand));
    const units = uniqueSorted(unitRows.map((row) => row.default_sell_unit));

    return NextResponse.json({
      success: true,

      /*
        Compatibilidade com a tela atual:
        - total/produtosNoCatalogo mostram o total real do banco;
        - catalog/products trazem a lista carregada.
      */
      total: totalProducts,
      totalProducts,
      activeProducts,
      displayedProducts: catalog.length,

      catalog,
      products: catalog,

      stats: {
        products: totalProducts,
        active: activeProducts,
        displayed: catalog.length,
        categories: categories.length,
        subcategories: subcategories.length,
        brands: brands.length,
        units: units.length,
      },

      filters: {
        categories,
        subcategories,
        brands,
        units,
      },
    });
  } catch (error) {
    console.error("QUOTES_CATALOG_GET_ERROR", error);

    return NextResponse.json(
      {
        success: false,
        error: "Erro ao carregar catálogo de cotações.",
      },
      { status: 500 }
    );
  }
}
