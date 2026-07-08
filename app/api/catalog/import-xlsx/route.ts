import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ParsedProduct = {
  code: string;
  official_name: string;
  normalized_name: string;
  category: string | null;
  subcategory: string | null;
  brand: string | null;
  package_type: string | null;
  weight_value: number | null;
  weight_unit: string | null;
  default_sell_unit: string | null;
  synonyms: string[];
  forbidden_terms: string[];
  attributes: Record<string, unknown>;
  price: number | null;
};

const UNIT_PATTERN =
  /^(LT|PCT|KG|CX|UN|FD|FDO|VD|BD|GL|SC|BIS|PÇ|PC|BAG|BARR|FR|POTE|COPO)$/i;

const KNOWN_CATEGORIES = [
  "REQUEIJÃO",
  "MUÇARELA",
  "MUÇARELA",
  "MUSSARELA",
  "MOZARELA",
  "CALABRESA",
  "PARMESÃO",
  "PRESUNTO",
  "APRESUNTADO",
  "FARINHA",
  "AZEITONA",
  "CHOCOLATE",
  "AÇÚCAR",
  "ARROZ",
  "ATUM",
  "AZEITE",
  "ÁGUA",
  "ALHO",
  "AMIDO",
  "BACON",
  "BATATA",
  "FRANGO",
  "CARNE",
  "QUEIJO",
  "MARGARINA",
  "MAIONESE",
  "MOLHO",
  "LEITE",
  "CREME",
  "CATUPIRY",
];

const KNOWN_BRANDS = [
  "TIROLEZ",
  "TRÊS MARIAS",
  "TRES MARIAS",
  "CORONATA",
  "AURORA",
  "IMPERADOR",
  "ALTO DO VALE",
  "HM",
  "JUQUEÍ",
  "JUQUEI",
  "LITORAL",
  "NATVILLE",
  "BONÍSSIMO",
  "BONISSIMO",
  "ANACONDA",
  "SCALA",
  "PEPERI",
  "DÁLIA",
  "DALIA",
  "PERDIGÃO",
  "PERDIGAO",
  "SADIA",
  "SEARA",
  "FRIMESA",
  "PRIETO",
  "REZENDE",
  "QUALIMAX",
  "TECNUTRI",
  "MAIZENA",
  "UNIÃO",
  "UNIAO",
  "TOZZI",
  "COLOSSO",
  "ARCO BELLO",
  "DI SALERNO",
  "GOMES DA COSTA",
];

function normalizeText(value: unknown) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ç/gi, "C")
    .toUpperCase()
    .replace(/[^A-Z0-9.,%/() X-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanText(value: unknown) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function cleanCode(value: unknown) {
  return String(value || "").trim().replace(/[^\dA-Za-z.-]/g, "");
}

function normalizeHeader(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function getValue(row: any, possibleNames: string[]) {
  const normalizedMap: Record<string, any> = {};

  Object.keys(row || {}).forEach((key) => {
    normalizedMap[normalizeHeader(key)] = row[key];
  });

  for (const name of possibleNames) {
    const value = normalizedMap[normalizeHeader(name)];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }

  return "";
}

function parseMoney(value: unknown): number | null {
  const raw = String(value || "")
    .replace(/R\$/gi, "")
    .replace(/\s/g, "")
    .trim();

  if (!raw) return null;

  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;

  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function extractPackage(normalizedName: string) {
  const matches = [...normalizedName.matchAll(/\(([^)]+)\)/g)];
  const last = matches[matches.length - 1]?.[1] || "";

  const match = last.match(/\b(CX|FDO|FD|PCT|BD|BAG|BARR|SC)\s+(\d+(?:[,.]\d+)?)\s*([A-ZÇ]{1,6})\b/i);

  if (!match) {
    return {
      package_type: null,
      package_quantity: null,
      package_unit: null,
      package_raw: last || null,
    };
  }

  return {
    package_type: match[1].toUpperCase() === "FDO" ? "FD" : match[1].toUpperCase(),
    package_quantity: Number(match[2].replace(",", ".")),
    package_unit: match[3].toUpperCase(),
    package_raw: last,
  };
}

function extractWeight(normalizedName: string) {
  const withoutPackage = normalizedName.replace(/\([^)]*\)/g, " ");
  const matches = [
    ...withoutPackage.matchAll(/\b(\d+(?:[,.]\d+)?)\s*(KG|G|ML|L)\b/g),
  ];

  const last = matches[matches.length - 1];
  if (!last) return { weight_value: null, weight_unit: null };

  return {
    weight_value: Number(last[1].replace(",", ".")),
    weight_unit: last[2].toUpperCase(),
  };
}

function inferCategory(normalizedName: string): string | null {
  const text = normalizedName.replace("MUSSARELA", "MUÇARELA").replace("MOZARELA", "MUÇARELA");
  if (/\b(MUÇARELA|MUCARELA|MUÇARELA|MUSSARELA|MOZARELA)\b/.test(text)) return "MUÇARELA";
  for (const cat of KNOWN_CATEGORIES) {
    const n = normalizeText(cat);
    if (new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(normalizedName)) {
      if (["MUÇARELA", "MUSSARELA", "MOZARELA"].includes(n)) return "MUÇARELA";
      return cat.normalize("NFC").toUpperCase();
    }
  }

  return normalizedName.split(" ").filter(Boolean).slice(0, 2).join(" ") || null;
}

function inferSubcategory(normalizedName: string, packageUnit: string | null): string | null {
  const sub: string[] = [];

  if (/\bSEM AMIDO\b/.test(normalizedName)) sub.push("SEM AMIDO");
  if (/\bCOM AMIDO\b/.test(normalizedName)) sub.push("COM AMIDO");
  if (/\bCHEDDAR\b/.test(normalizedName)) sub.push("CHEDDAR");
  if (/\bRALAD[OA]\b/.test(normalizedName)) sub.push("RALADO");
  if (/\bFATIAD[OA]\b/.test(normalizedName)) sub.push("FATIADO");
  if (/\bBISNAGA\b|\bBIS\b/.test(normalizedName) || packageUnit === "BIS") sub.push("BISNAGA");
  if (/\bBALDE\b|\bBD\b/.test(normalizedName) || packageUnit === "BD") sub.push("BALDE");
  if (/\bCOPO\b/.test(normalizedName) || packageUnit === "COPO") sub.push("COPO");
  if (/\bBARRICA\b|\bBARR\b/.test(normalizedName) || packageUnit === "BARR") sub.push("BARRICA");
  if (/\bPOTE\b/.test(normalizedName) || packageUnit === "POTE") sub.push("POTE");

  return sub.length ? [...new Set(sub)].join(" / ") : null;
}

function inferBrand(normalizedName: string): string | null {
  const normalizedBrands = KNOWN_BRANDS
    .map((brand) => ({ brand: brand.toUpperCase(), normalized: normalizeText(brand) }))
    .sort((a, b) => b.normalized.length - a.normalized.length);

  for (const item of normalizedBrands) {
    if (new RegExp(`\\b${item.normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(normalizedName)) {
      return item.brand;
    }
  }

  return null;
}

function buildForbiddenTerms(category: string | null, subcategory: string | null, normalizedName: string) {
  const forbidden = new Set<string>();

  if (category === "MUÇARELA") {
    ["BÚFALA", "BUFALA", "BOLINHA", "RALADA", "RALADO", "COBERTURA", "TOPPING", "MOZZANA"].forEach((v) =>
      forbidden.add(v)
    );
  }

  if (category === "PRESUNTO") {
    ["APRESUNTADO", "PARMA"].forEach((v) => forbidden.add(v));
  }

  if (category === "APRESUNTADO") {
    ["PRESUNTO", "PARMA"].forEach((v) => forbidden.add(v));
  }

  if (category === "REQUEIJÃO") {
    if (subcategory?.includes("SEM AMIDO")) {
      ["CHEDDAR", "COM AMIDO", "SABOR CHEDDAR"].forEach((v) => forbidden.add(v));
    }

    if (normalizedName.includes("CHEDDAR")) {
      ["SEM AMIDO", "COM AMIDO"].forEach((v) => forbidden.add(v));
    }
  }

  return Array.from(forbidden);
}

function buildSynonyms(category: string | null, brand: string | null, normalizedName: string) {
  const synonyms = new Set<string>();

  if (category) synonyms.add(category);

  if (category === "MUÇARELA") {
    ["MUSSARELA", "MOZARELA", "MUCARELA", "MUÇARELA"].forEach((v) => synonyms.add(v));
  }

  if (category === "REQUEIJÃO") {
    ["REQUEIJAO", "REQUÉIJAO", "CATUPIRY"].forEach((v) => synonyms.add(v));
  }

  if (brand) synonyms.add(brand);

  // Algumas palavras úteis do nome, sem números/unidades.
  normalizedName
    .replace(/\([^)]*\)/g, " ")
    .split(" ")
    .filter((token) => token.length >= 4 && !/^\d/.test(token) && !UNIT_PATTERN.test(token))
    .slice(0, 12)
    .forEach((token) => synonyms.add(token));

  return Array.from(synonyms);
}

function parseProduct(input: {
  code: string;
  name: string;
  unit: string;
  price: number | null;
}): ParsedProduct {
  const official_name = cleanText(input.name).toUpperCase();
  const normalized_name = normalizeText(official_name);
  const pkg = extractPackage(normalized_name);
  const weight = extractWeight(normalized_name);
  const category = inferCategory(normalized_name);
  const subcategory = inferSubcategory(normalized_name, pkg.package_unit);
  const brand = inferBrand(normalized_name);
  const default_sell_unit = normalizeText(input.unit || pkg.package_unit || "").replace("FDO", "FD") || null;
  const forbidden_terms = buildForbiddenTerms(category, subcategory, normalized_name);
  const synonyms = buildSynonyms(category, brand, normalized_name);

  return {
    code: input.code,
    official_name,
    normalized_name,
    category,
    subcategory,
    brand,
    package_type: pkg.package_type,
    weight_value: weight.weight_value,
    weight_unit: weight.weight_unit,
    default_sell_unit,
    synonyms,
    forbidden_terms,
    price: input.price,
    attributes: {
      package_quantity: pkg.package_quantity,
      package_unit: pkg.package_unit,
      package_raw: pkg.package_raw,
      original_unit: input.unit || null,
      imported_from: "xlsx",
    },
  };
}

function parseRowsFromWorksheet(sheet: XLSX.WorkSheet) {
  const rows = XLSX.utils.sheet_to_json<any>(sheet, {
    defval: "",
    raw: false,
  });

  const parsed: Array<{ code: string; name: string; unit: string; price: number | null }> = [];

  for (const row of rows) {
    let code = cleanCode(getValue(row, ["COD", "CÓD", "CODIGO", "CÓDIGO", "CODE", "ID"]));

    let name = cleanText(
      getValue(row, ["PRODUTOS", "PRODUTO", "DESCRICAO", "DESCRIÇÃO", "NOME", "NOME OFICIAL"])
    );

    let unit = cleanText(
      getValue(row, ["VEND. POR", "VEND POR", "VENDIDO POR", "UN", "UNIDADE", "VENDA"])
    );

    let price = parseMoney(
      getValue(row, ["PREÇO 0", "PRECO 0", "PREÇO", "PRECO", "VALOR", "PRICE"])
    );

    // Fallback para planilhas sem cabeçalho perfeito.
    if (!code || !name) {
      const values = Object.values(row).map((v) => cleanText(v));

      const codeCandidate = values.find((v) => /^\d{1,8}$/.test(v));
      const nameCandidate = values.find(
        (v) =>
          v.length > 8 &&
          !/^R\$/i.test(v) &&
          !/^\d+([,.]\d+)?$/.test(v) &&
          !UNIT_PATTERN.test(v)
      );

      code = code || cleanCode(codeCandidate);
      name = name || cleanText(nameCandidate);

      unit =
        unit ||
        cleanText(values.find((v) => UNIT_PATTERN.test(v)));

      if (price === null) {
        const priceCandidate = values.find((v) => /R\$|\d+,\d{2}$|\d+\.\d{2}$/.test(v));
        price = parseMoney(priceCandidate);
      }
    }

    if (!code || !name) continue;
    if (name.toLowerCase().includes("produtos")) continue;
    if (code.toLowerCase().includes("cod")) continue;

    parsed.push({
      code,
      name,
      unit: unit.toUpperCase(),
      price,
    });
  }

  const unique = new Map<string, { code: string; name: string; unit: string; price: number | null }>();
  parsed.forEach((item) => unique.set(item.code, item));

  return Array.from(unique.values());
}

async function getCompanyId(req: NextRequest, formData?: FormData) {
  const fromForm = formData?.get("companyId") || formData?.get("company_id") || "";
  const fromUrl = new URL(req.url).searchParams.get("companyId") || "";
  const fromCookie =
    req.cookies.get("zentra_company_id")?.value ||
    req.cookies.get("company_id")?.value ||
    "";
  const fromHeader = req.headers.get("x-company-id") || "";
  const candidate = String(fromForm || fromUrl || fromHeader || fromCookie || "").trim();

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

async function ensureTables() {
  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS product_catalog (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id uuid NOT NULL,
      code text NOT NULL,
      name text NOT NULL,
      unit text,
      active boolean NOT NULL DEFAULT true,
      search_text text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(company_id, code)
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS quote_catalog_products (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id uuid NOT NULL,
      branch_id uuid,
      code text NOT NULL,
      official_name text NOT NULL,
      normalized_name text NOT NULL,
      category text,
      subcategory text,
      brand text,
      package_type text,
      weight_value numeric(12,3),
      weight_unit text,
      default_sell_unit text,
      synonyms text[] NOT NULL DEFAULT '{}',
      forbidden_terms text[] NOT NULL DEFAULT '{}',
      attributes jsonb DEFAULT '{}',
      active boolean DEFAULT true,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      UNIQUE(company_id, code)
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS quote_daily_prices (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id uuid NOT NULL,
      branch_id uuid,
      catalog_product_id uuid,
      code text NOT NULL,
      pdf_name text,
      product_name_from_pdf text NOT NULL,
      sell_unit text NOT NULL,
      price numeric(12,2) NOT NULL,
      table_date date NOT NULL,
      raw_line text,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      UNIQUE(company_id, code, table_date)
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS quote_catalog_products_company_name_idx
    ON quote_catalog_products(company_id, normalized_name)
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS quote_daily_prices_company_date_idx
    ON quote_daily_prices(company_id, table_date)
  `);
}

export async function POST(req: NextRequest) {
  try {
    await ensureTables();

    const formData = await req.formData();
    const companyId = await getCompanyId(req, formData);
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "Envie uma planilha XLSX/XLS no campo file." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });

    let rawProducts: Array<{ code: string; name: string; unit: string; price: number | null }> = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      rawProducts = rawProducts.concat(parseRowsFromWorksheet(sheet));
    }

    const unique = new Map<string, { code: string; name: string; unit: string; price: number | null }>();
    rawProducts.forEach((item) => unique.set(item.code, item));
    const products = Array.from(unique.values()).map(parseProduct);

    if (!products.length) {
      return NextResponse.json(
        {
          success: false,
          error: "Não encontrei produtos na planilha. Verifique se existem colunas COD e PRODUTOS.",
        },
        { status: 400 }
      );
    }

    await prisma.$executeRawUnsafe(
      `UPDATE product_catalog SET active = false, updated_at = now() WHERE company_id = $1::uuid`,
      companyId
    );

    await prisma.$executeRawUnsafe(
      `UPDATE quote_catalog_products SET active = false, updated_at = now() WHERE company_id = $1::uuid`,
      companyId
    );

    const tableDate = new Date().toISOString().slice(0, 10);
    let imported = 0;
    let priceRows = 0;

    for (const item of products) {
      await prisma.$executeRawUnsafe(
        `
        INSERT INTO product_catalog (company_id, code, name, unit, active, search_text, created_at, updated_at)
        VALUES ($1::uuid, $2, $3, $4, true, $5, now(), now())
        ON CONFLICT (company_id, code)
        DO UPDATE SET
          name = EXCLUDED.name,
          unit = EXCLUDED.unit,
          active = true,
          search_text = EXCLUDED.search_text,
          updated_at = now()
        `,
        companyId,
        item.code,
        item.official_name,
        item.default_sell_unit,
        `${item.code} ${item.official_name} ${item.normalized_name} ${item.synonyms.join(" ")}`
      );

      const saved = await prisma.$queryRawUnsafe<any[]>(
        `
        INSERT INTO quote_catalog_products (
          company_id, code, official_name, normalized_name, category, subcategory, brand,
          package_type, weight_value, weight_unit, default_sell_unit, synonyms, forbidden_terms,
          attributes, active, created_at, updated_at
        )
        VALUES (
          $1::uuid, $2, $3, $4, $5, $6, $7,
          $8, $9::numeric, $10, $11, $12::text[], $13::text[],
          $14::jsonb, true, now(), now()
        )
        ON CONFLICT (company_id, code)
        DO UPDATE SET
          official_name = EXCLUDED.official_name,
          normalized_name = EXCLUDED.normalized_name,
          category = EXCLUDED.category,
          subcategory = EXCLUDED.subcategory,
          brand = EXCLUDED.brand,
          package_type = EXCLUDED.package_type,
          weight_value = EXCLUDED.weight_value,
          weight_unit = EXCLUDED.weight_unit,
          default_sell_unit = EXCLUDED.default_sell_unit,
          synonyms = EXCLUDED.synonyms,
          forbidden_terms = EXCLUDED.forbidden_terms,
          attributes = EXCLUDED.attributes,
          active = true,
          updated_at = now()
        RETURNING id
        `,
        companyId,
        item.code,
        item.official_name,
        item.normalized_name,
        item.category,
        item.subcategory,
        item.brand,
        item.package_type,
        item.weight_value,
        item.weight_unit,
        item.default_sell_unit,
        item.synonyms,
        item.forbidden_terms,
        JSON.stringify(item.attributes)
      );

      const catalogProductId = saved?.[0]?.id || null;

      if (item.price !== null && item.default_sell_unit) {
        await prisma.$executeRawUnsafe(
          `
          INSERT INTO quote_daily_prices (
            company_id, catalog_product_id, code, pdf_name, product_name_from_pdf,
            sell_unit, price, table_date, raw_line, created_at, updated_at
          )
          VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7::numeric, $8::date, $9, now(), now())
          ON CONFLICT (company_id, code, table_date)
          DO UPDATE SET
            catalog_product_id = EXCLUDED.catalog_product_id,
            product_name_from_pdf = EXCLUDED.product_name_from_pdf,
            sell_unit = EXCLUDED.sell_unit,
            price = EXCLUDED.price,
            raw_line = EXCLUDED.raw_line,
            updated_at = now()
          `,
          companyId,
          catalogProductId,
          item.code,
          file.name,
          item.official_name,
          item.default_sell_unit,
          item.price,
          tableDate,
          item.official_name
        );
        priceRows++;
      }

      imported++;
    }

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
      WHERE company_id = $1::uuid AND COALESCE(active, true) = true
      `,
      companyId
    );

    const stats = statsRows?.[0] || {};

    return NextResponse.json({
      success: true,
      company_id: companyId,
      imported,
      priceRows,
      stats: {
        products: Number(stats.products || imported),
        categories: Number(stats.categories || 0),
        subcategories: Number(stats.subcategories || 0),
        brands: Number(stats.brands || 0),
        withoutCategory: Number(stats.without_category || 0),
        withoutSellUnit: Number(stats.without_sell_unit || 0),
      },
      message: `${imported} produtos importados e estruturados para o Catálogo IA.`,
    });
  } catch (error: any) {
    console.error("ERRO IMPORT XLSX CATALOGO:", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Erro ao importar catálogo.",
      },
      { status: 500 }
    );
  }
}
