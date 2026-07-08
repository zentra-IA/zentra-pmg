import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;


const FALLBACK_COMPANY_ID = process.env.NEXT_PUBLIC_DEFAULT_COMPANY_ID || "11111111-1111-4111-8111-111111111111";

function isUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function resolveCompanyId(value: string | null): string {
  const candidate = String(value || "").trim();
  if (candidate && candidate !== "default-company" && isUUID(candidate)) return candidate;
  return FALLBACK_COMPANY_ID;
}

type ImportedProduct = {
  code: string;
  officialName: string;
  normalizedName: string;
  category: string | null;
  subcategory: string | null;
  brand: string | null;
  packageType: string | null;
  packageQty: number | null;
  packageUnit: string | null;
  weightValue: number | null;
  weightUnit: string | null;
  defaultSellUnit: string | null;
  synonyms: string[];
  forbiddenTerms: string[];
  raw: Record<string, unknown>;
};

function cleanText(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(value: unknown): string {
  return cleanText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/Ç/g, "C")
    .replace(/[^A-Z0-9,.\s/()-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value: string): string {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;

  const text = String(value)
    .replace(/[R$\s]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");

  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function pick(row: Record<string, unknown>, names: string[]): string {
  const wanted = names.map(normalizeText);

  for (const [key, value] of Object.entries(row)) {
    if (wanted.includes(normalizeText(key))) {
      return cleanText(value);
    }
  }

  return "";
}

function splitList(value: string): string[] {
  return cleanText(value)
    .split(/[;,|]/g)
    .map((item) => normalizeText(item))
    .filter(Boolean);
}

function parsePackage(name: string): {
  packageType: string | null;
  packageQty: number | null;
  packageUnit: string | null;
} {
  const normalized = normalizeText(name);

  const match = normalized.match(
    /\((CX|FDO|FD|PCT|BD|BARR|BARRICA|UN|KG|LT|VD|FR|GL|BIS|PC|PÇ)\s+(\d+(?:[,.]\d+)?)\s*([A-Z]{1,10})\)/
  );

  if (match) {
    return {
      packageType: normalizeUnit(match[1]),
      packageQty: parseNumber(match[2]),
      packageUnit: normalizeUnit(match[3]),
    };
  }

  const single = normalized.match(/\((CX|FDO|FD|PCT|BD|BARR|BARRICA|UN|KG|LT|VD|FR|GL|BIS|PC|PÇ)\)/);

  return {
    packageType: single ? normalizeUnit(single[1]) : null,
    packageQty: null,
    packageUnit: null,
  };
}

function parseWeight(name: string): {
  weightValue: number | null;
  weightUnit: string | null;
} {
  const normalized = normalizeText(name).replace(/\([^)]*\)/g, " ");
  const matches = Array.from(
    normalized.matchAll(/(\d+(?:[,.]\d+)?)\s*(KG|G|ML|L|LT)/g)
  );

  if (!matches.length) {
    return { weightValue: null, weightUnit: null };
  }

  const last = matches[matches.length - 1];

  return {
    weightValue: parseNumber(last[1]),
    weightUnit: normalizeUnit(last[2]),
  };
}

function normalizeUnit(value: unknown): string {
  const unit = normalizeText(value);

  const map: Record<string, string> = {
    PECA: "PÇ",
    PEÇAS: "PÇ",
    PC: "PÇ",
    PÇ: "PÇ",
    PCT: "PCT",
    PACOTE: "PCT",
    PACOTES: "PCT",
    BIS: "BIS",
    BISNAGA: "BIS",
    BISNAGAS: "BIS",
    CX: "CX",
    CAIXA: "CX",
    CAIXAS: "CX",
    FD: "FD",
    FDO: "FD",
    FARDO: "FD",
    FARDOS: "FD",
    BD: "BD",
    BALDE: "BD",
    BALDES: "BD",
    BARR: "BARR",
    BARRICA: "BARR",
    UN: "UN",
    UND: "UN",
    UNIDADE: "UN",
    KG: "KG",
    G: "G",
    LT: "LT",
    L: "LT",
    ML: "ML",
    VD: "VD",
    FR: "FR",
    GL: "GL",
  };

  return map[unit] || unit;
}

const KNOWN_BRANDS = [
  "TIROLEZ",
  "TRES MARIAS",
  "TRÊS MARIAS",
  "AURORA",
  "IMPERADOR",
  "ALTO DO VALE",
  "HM",
  "JUQUEI",
  "LITORAL",
  "NATVILLE",
  "BONISSIMO",
  "BONÍSSIMO",
  "CORONATA",
  "PURANATA",
  "SCALA",
  "SADIA",
  "SEARA",
  "PERDIGAO",
  "PERDIGÃO",
  "PEPERI",
  "DALIA",
  "DÁLIA",
  "ANACONDA",
  "RJ",
  "RJR",
  "TOZZI",
  "QUALIMAX",
  "ITAIQUARA",
  "UNIÃO",
  "UNIAO",
];

function detectBrand(name: string, explicitBrand?: string): string | null {
  if (explicitBrand) return normalizeText(explicitBrand);

  const normalized = normalizeText(name);

  const found = KNOWN_BRANDS.find((brand) =>
    normalized.includes(normalizeText(brand))
  );

  return found ? normalizeText(found) : null;
}

function detectCategory(name: string, explicitCategory?: string): string | null {
  if (explicitCategory) return normalizeText(explicitCategory);

  const n = normalizeText(name);

  if (n.includes("REQUEIJAO")) return "REQUEIJAO";
  if (
    n.includes("MUCARELA") ||
    n.includes("MUC ARELA") ||
    n.includes("MUSSARELA") ||
    n.includes("MOZZARELA") ||
    n.includes("MOZARELA")
  ) {
    return "MUCARELA";
  }
  if (n.includes("CALABRESA")) return "CALABRESA";
  if (n.includes("PARMESAO")) return "PARMESAO";
  if (n.includes("APRESUNTADO")) return "APRESUNTADO";
  if (n.includes("PRESUNTO")) return "PRESUNTO";
  if (n.includes("FARINHA")) return "FARINHA";
  if (n.includes("AZEITONA")) return "AZEITONA";
  if (n.includes("CHOCOLATE")) return "CHOCOLATE";
  if (n.includes("ACUCAR")) return "ACUCAR";
  if (n.includes("ARROZ")) return "ARROZ";
  if (n.includes("ATUM")) return "ATUM";
  if (n.includes("AZEITE")) return "AZEITE";

  return n.split(" ").slice(0, 2).join(" ") || null;
}

function detectSubcategory(name: string, explicitSubcategory?: string): string | null {
  if (explicitSubcategory) return normalizeText(explicitSubcategory);

  const n = normalizeText(name);
  const values = new Set<string>();

  if (n.includes("SEM AMIDO")) values.add("SEM AMIDO");
  if (n.includes("COM AMIDO")) values.add("COM AMIDO");
  if (n.includes("CHEDDAR")) values.add("CHEDDAR");
  if (n.includes("BISNAGA") || n.includes(" BIS") || (n.includes("(CX") && n.includes("BIS"))) values.add("BISNAGA");
  if (n.includes("BALDE") || n.includes(" BD") || n.includes("(BD")) values.add("BALDE");
  if (n.includes("COPO")) values.add("COPO");
  if (n.includes("RALADO")) values.add("RALADO");
  if (n.includes("FATIADA") || n.includes("FATIADO")) values.add("FATIADO");
  if (n.includes("PECA") || n.includes("PÇ") || n.includes(" PC ")) values.add("PECA");
  if (n.includes("PIZZA")) values.add("PIZZA");
  if (n.includes("PRETA")) values.add("PRETA");
  if (n.includes("VERDE")) values.add("VERDE");

  return values.size ? Array.from(values).join(" / ") : null;
}

function forbiddenTermsFor(category: string | null, subcategory: string | null): string[] {
  const c = normalizeText(category || "");
  const s = normalizeText(subcategory || "");
  const terms = new Set<string>();

  if (c === "MUCARELA") {
    ["BUFALA", "BOLINHA", "COBERTURA", "TOPPING", "MOZZANA", "RALADA"].forEach((x) => terms.add(x));
  }

  if (c === "PRESUNTO") {
    ["APRESUNTADO", "PARMA"].forEach((x) => terms.add(x));
  }

  if (c === "REQUEIJAO" && s.includes("SEM AMIDO")) {
    ["CHEDDAR", "COM AMIDO", "SABOR"].forEach((x) => terms.add(x));
  }

  return Array.from(terms);
}

function buildSynonyms(name: string, category: string | null, brand: string | null): string[] {
  const items = new Set<string>();

  if (category) items.add(normalizeText(category));
  if (brand) items.add(normalizeText(brand));

  const n = normalizeText(name);

  if (n.includes("MUCARELA") || n.includes("MUSSARELA") || n.includes("MOZZARELA") || n.includes("MOZARELA")) {
    ["MUCARELA", "MUCARELA", "MUSSARELA", "MOZZARELA", "MOZARELA"].forEach((x) => items.add(x));
  }

  if (n.includes("REQUEIJAO")) {
    ["REQUEIJAO", "REQ", "REQUEIJAO BISNAGA"].forEach((x) => items.add(x));
  }

  if (n.includes("CALABRESA")) items.add("CALABRESA");
  if (n.includes("PARMESAO")) items.add("PARMESAO");

  return Array.from(items).filter(Boolean);
}

function parseRow(row: Record<string, unknown>, index: number): ImportedProduct | null {
  const code =
    pick(row, ["Código", "Codigo", "COD", "CODIGO", "COD PRODUTOS", "COD/ID", "ID"]) ||
    cleanText(row["code"]);

  const officialName =
    pick(row, ["Produto", "Produtos", "Nome", "Nome Oficial", "Descrição", "Descricao", "Description"]) ||
    cleanText(row["name"]);

  if (!code || !officialName || normalizeText(officialName).length < 3) {
    return null;
  }

  const sellUnit =
    pick(row, ["VEND. POR:", "VEND POR", "VEND. POR", "Vendido Por", "Vend Por", "Unidade", "UN.", "UN", "Unit"]) ||
    "";

  const explicitCategory = pick(row, ["Categoria", "Category"]);
  const explicitSubcategory = pick(row, ["Subcategoria", "Sub Category", "Subtipo", "Familia", "Família"]);
  const explicitBrand = pick(row, ["Marca", "Brand"]);

  const category = detectCategory(officialName, explicitCategory);
  const subcategory = detectSubcategory(officialName, explicitSubcategory);
  const brand = detectBrand(officialName, explicitBrand);
  const pkg = parsePackage(officialName);
  const weight = parseWeight(officialName);
  const normalizedSellUnit = sellUnit ? normalizeUnit(sellUnit) : pkg.packageUnit;

  const synonyms = [
    ...buildSynonyms(officialName, category, brand),
    ...splitList(pick(row, ["Sinônimos", "Sinonimos", "Aliases"])),
  ];

  const forbiddenTerms = [
    ...forbiddenTermsFor(category, subcategory),
    ...splitList(pick(row, ["Palavras Proibidas", "Proibidas", "Forbidden"])),
  ];

  return {
    code: cleanText(code),
    officialName: cleanText(officialName),
    normalizedName: normalizeText(officialName),
    category,
    subcategory,
    brand,
    packageType: pkg.packageType,
    packageQty: pkg.packageQty,
    packageUnit: pkg.packageUnit,
    weightValue: weight.weightValue,
    weightUnit: weight.weightUnit,
    defaultSellUnit: normalizedSellUnit || null,
    synonyms: Array.from(new Set(synonyms)),
    forbiddenTerms: Array.from(new Set(forbiddenTerms)),
    raw: {
      rowIndex: index + 2,
      ...row,
    },
  };
}

function normalizeRows(rows: Record<string, unknown>[]): ImportedProduct[] {
  return rows
    .map((row, index) => parseRow(row, index))
    .filter((item): item is ImportedProduct => Boolean(item));
}

async function saveProducts(params: {
  companyId: string;
  branchId: string | null;
  products: ImportedProduct[];
}) {
  let created = 0;
  let updated = 0;

  for (const item of params.products) {
    const attributes = {
      packageQty: item.packageQty,
      packageUnit: item.packageUnit,
      raw: JSON.parse(JSON.stringify(item.raw ?? {})),
    } satisfies Prisma.InputJsonObject;

    const existing = await prisma.quote_catalog_products.findUnique({
      where: {
        company_id_code: {
          company_id: params.companyId,
          code: item.code,
        },
      },
      select: { id: true },
    });

    await prisma.quote_catalog_products.upsert({
      where: {
        company_id_code: {
          company_id: params.companyId,
          code: item.code,
        },
      },
      update: {
        branch_id: params.branchId,
        official_name: item.officialName,
        normalized_name: item.normalizedName,
        category: item.category,
        subcategory: item.subcategory,
        brand: item.brand,
        package_type: item.packageType,
        weight_value: item.weightValue,
        weight_unit: item.weightUnit,
        default_sell_unit: item.defaultSellUnit,
        synonyms: item.synonyms,
        forbidden_terms: item.forbiddenTerms,
        attributes,
        active: true,
        updated_at: new Date(),
      },
      create: {
        company_id: params.companyId,
        branch_id: params.branchId,
        code: item.code,
        official_name: item.officialName,
        normalized_name: item.normalizedName,
        category: item.category,
        subcategory: item.subcategory,
        brand: item.brand,
        package_type: item.packageType,
        weight_value: item.weightValue,
        weight_unit: item.weightUnit,
        default_sell_unit: item.defaultSellUnit,
        synonyms: item.synonyms,
        forbidden_terms: item.forbiddenTerms,
        attributes,
        active: true,
      },
    });

    await prisma.product_catalog.upsert({
      where: {
        company_id_code: {
          company_id: params.companyId,
          code: item.code,
        },
      },
      update: {
        name: item.officialName,
        unit: item.defaultSellUnit,
        search_text: `${item.normalizedName} ${item.synonyms.join(" ")}`,
        active: true,
        updated_at: new Date(),
      },
      create: {
        company_id: params.companyId,
        code: item.code,
        name: item.officialName,
        unit: item.defaultSellUnit,
        active: true,
        search_text: `${item.normalizedName} ${item.synonyms.join(" ")}`,
      },
    });

    if (existing) updated++;
    else created++;
  }

  return { created, updated };
}

async function parseExcel(file: File): Promise<{
  rows: Record<string, unknown>[];
  products: ImportedProduct[];
}> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheet = workbook.SheetNames[0];

  if (!firstSheet) {
    return { rows: [], products: [] };
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    workbook.Sheets[firstSheet],
    { defval: "" }
  );

  return {
    rows,
    products: normalizeRows(rows),
  };
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const companyId = resolveCompanyId(
      String(formData.get("companyId") || formData.get("company_id") || "").trim()
    );

    const branchIdRaw =
      String(formData.get("branchId") || formData.get("branch_id") || "").trim();

    const file = formData.get("file") as File | null;

    if (!isUUID(companyId)) {
      return NextResponse.json(
        { success: false, error: "companyId inválido." },
        { status: 400 }
      );
    }

    if (!file) {
      return NextResponse.json(
        { success: false, error: "Arquivo obrigatório." },
        { status: 400 }
      );
    }

    const { rows, products } = await parseExcel(file);

    if (!products.length) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Nenhum produto válido encontrado. Confira as colunas: Código/COD, Produto/Descrição e Vend. Por.",
        },
        { status: 400 }
      );
    }

    const result = await saveProducts({
      companyId,
      branchId: branchIdRaw || null,
      products,
    });

    const categories = new Set(products.map((p) => p.category).filter(Boolean));
    const subcategories = new Set(products.map((p) => p.subcategory).filter(Boolean));
    const brands = new Set(products.map((p) => p.brand).filter(Boolean));
    const units = new Set(products.map((p) => p.defaultSellUnit).filter(Boolean));

    return NextResponse.json({
      success: true,
      file: file.name,
      rows: rows.length,
      total: products.length,
      imported: products.length,
      created: result.created,
      updated: result.updated,
      stats: {
        products: products.length,
        categories: categories.size,
        subcategories: subcategories.size,
        brands: brands.size,
        units: units.size,
        warnings: {
          withoutCategory: products.filter((p) => !p.category).length,
          withoutUnit: products.filter((p) => !p.defaultSellUnit).length,
          withoutPackage: products.filter((p) => !p.packageType).length,
          withoutBrand: products.filter((p) => !p.brand).length,
        },
      },
      sample: products.slice(0, 10),
    });
  } catch (error) {
    console.error("QUOTES_CATALOG_UPLOAD_ERROR", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro ao importar catálogo.",
      },
      { status: 500 }
    );
  }
}
