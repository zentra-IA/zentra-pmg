import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function getCompanyId(req: NextRequest) {
  const url = new URL(req.url);
  const fromUrl = url.searchParams.get("companyId") || url.searchParams.get("company_id") || "";
  const fromCookie =
    req.cookies.get("zentra_company_id")?.value ||
    req.cookies.get("company_id")?.value ||
    "";
  const fromHeader = req.headers.get("x-company-id") || "";
  const candidate = String(fromUrl || fromHeader || fromCookie || "").trim();

  if (candidate && candidate !== "default-company") return candidate;

  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT id
    FROM companies
    WHERE COALESCE(active, true) = true
    ORDER BY created_at ASC NULLS LAST
    LIMIT 1
  `);

  const firstCompanyId = rows?.[0]?.id ? String(rows[0].id) : "";

  if (!firstCompanyId) {
    throw new Error("Empresa não identificada. Faça login novamente ou cadastre uma empresa primeiro.");
  }

  return firstCompanyId;
}

function normalizeQuery(value: string) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ");
}

export async function GET(req: NextRequest) {
  try {
    const companyId = await getCompanyId(req);
    const url = new URL(req.url);
    const q = String(url.searchParams.get("q") || "").trim();
    const category = String(url.searchParams.get("category") || "").trim();
    const subcategory = String(url.searchParams.get("subcategory") || "").trim();
    const brand = String(url.searchParams.get("brand") || "").trim();
    const limit = Math.min(Number(url.searchParams.get("limit") || 80), 300);

    const normalizedQ = normalizeQuery(q);

    const whereParts = [
      `p.company_id = $1::uuid`,
      `COALESCE(p.active, true) = true`,
    ];

    const params: any[] = [companyId];
    let idx = 2;

    if (q) {
      whereParts.push(`(
        p.code ILIKE $${idx}
        OR p.official_name ILIKE $${idx + 1}
        OR p.normalized_name ILIKE $${idx + 2}
        OR EXISTS (
          SELECT 1 FROM unnest(p.synonyms) s
          WHERE s ILIKE $${idx + 3}
        )
      )`);
      params.push(`%${q}%`, `%${q}%`, `%${normalizedQ}%`, `%${normalizedQ}%`);
      idx += 4;
    }

    if (category) {
      whereParts.push(`p.category ILIKE $${idx}`);
      params.push(`%${category}%`);
      idx++;
    }

    if (subcategory) {
      whereParts.push(`p.subcategory ILIKE $${idx}`);
      params.push(`%${subcategory}%`);
      idx++;
    }

    if (brand) {
      whereParts.push(`p.brand ILIKE $${idx}`);
      params.push(`%${brand}%`);
      idx++;
    }

    params.push(limit);

    const products = await prisma.$queryRawUnsafe<any[]>(
      `
      SELECT
        p.id,
        p.company_id,
        p.code,
        p.official_name AS name,
        p.official_name,
        p.normalized_name,
        p.category,
        p.subcategory,
        p.brand,
        p.package_type,
        p.weight_value,
        p.weight_unit,
        p.default_sell_unit AS unit,
        p.default_sell_unit,
        p.synonyms,
        p.forbidden_terms,
        p.attributes,
        p.active,
        p.created_at,
        p.updated_at,
        dp.price,
        dp.sell_unit,
        dp.table_date
      FROM quote_catalog_products p
      LEFT JOIN LATERAL (
        SELECT price, sell_unit, table_date
        FROM quote_daily_prices
        WHERE company_id = p.company_id
          AND code = p.code
        ORDER BY table_date DESC, created_at DESC
        LIMIT 1
      ) dp ON true
      WHERE ${whereParts.join("\n        AND ")}
      ORDER BY
        CASE WHEN p.code = $${idx} THEN 0 ELSE 1 END,
        p.category NULLS LAST,
        p.official_name ASC
      LIMIT $${idx + 1}
      `,
      ...params.slice(0, -1),
      q,
      limit
    );

    const totalRows = await prisma.$queryRawUnsafe<any[]>(
      `
      SELECT COUNT(*)::int AS total
      FROM quote_catalog_products
      WHERE company_id = $1::uuid
        AND COALESCE(active, true) = true
      `,
      companyId
    );

    const categories = await prisma.$queryRawUnsafe<any[]>(
      `
      SELECT category, COUNT(*)::int AS total
      FROM quote_catalog_products
      WHERE company_id = $1::uuid
        AND COALESCE(active, true) = true
        AND category IS NOT NULL
      GROUP BY category
      ORDER BY total DESC, category ASC
      LIMIT 80
      `,
      companyId
    );

    const subcategories = await prisma.$queryRawUnsafe<any[]>(
      `
      SELECT subcategory, COUNT(*)::int AS total
      FROM quote_catalog_products
      WHERE company_id = $1::uuid
        AND COALESCE(active, true) = true
        AND subcategory IS NOT NULL
      GROUP BY subcategory
      ORDER BY total DESC, subcategory ASC
      LIMIT 120
      `,
      companyId
    );

    const statsRows = await prisma.$queryRawUnsafe<any[]>(
      `
      SELECT
        COUNT(*)::int AS products,
        COUNT(DISTINCT category)::int AS categories,
        COUNT(DISTINCT subcategory)::int AS subcategories,
        COUNT(DISTINCT brand)::int AS brands,
        COUNT(*) FILTER (WHERE category IS NULL)::int AS without_category,
        COUNT(*) FILTER (WHERE default_sell_unit IS NULL)::int AS without_sell_unit
      FROM quote_catalog_products
      WHERE company_id = $1::uuid
        AND COALESCE(active, true) = true
      `,
      companyId
    );

    const stats = statsRows?.[0] || {};

    return NextResponse.json({
      success: true,
      company_id: companyId,
      total: Number(totalRows?.[0]?.total || 0),
      products,
      categories,
      subcategories,
      stats: {
        products: Number(stats.products || 0),
        categories: Number(stats.categories || 0),
        subcategories: Number(stats.subcategories || 0),
        brands: Number(stats.brands || 0),
        withoutCategory: Number(stats.without_category || 0),
        withoutSellUnit: Number(stats.without_sell_unit || 0),
      },
    });
  } catch (error: any) {
    console.error("ERRO API CATALOGO PRODUCTS:", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Erro ao buscar catálogo de produtos.",
      },
      { status: 500 }
    );
  }
}
