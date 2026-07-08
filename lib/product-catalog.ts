import { prisma } from "@/lib/prisma";

type RawOrderItem = {
  code?: string | null;
  name?: string | null;
  quantity?: number | string | null;
  unit_price?: number | string | null;
  discount?: number | string | null;
  total?: number | string | null;
};

type CatalogProduct = {
  id: string;
  company_id: string;
  code: string;
  name: string;
  unit: string | null;
  active: boolean;
};

const OCR_ALIAS_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bMARGARELA\b/g, "MUCARELA"],
  [/\bMARGAR?ELA\b/g, "MUCARELA"],
  [/\bMUSSARELA\b/g, "MUCARELA"],
  [/\bMUSSARELLA\b/g, "MUCARELA"],
  [/\bMUC?ARELA\b/g, "MUCARELA"],
  [/\bMUCL?ELA\b/g, "MUCARELA"],
  [/\bMUCERELA\b/g, "MUCARELA"],
  [/\bMOCARELA\b/g, "MUCARELA"],
  [/\bMUCELA\b/g, "MUCARELA"],
  [/\bDOMILAK\b/g, "DOMILAC"],
  [/\bDOMILAC\s+1KG\b/g, "DOMILAC 1 KG"],
  [/\bLOMBOR\b/g, "LOMBO"],
  [/\bLOMBOR\b/g, "LOMBO"],
  [/\bDEL\s+GOURMET\b/g, "DELI GOURMET"],
  [/\bDELI\s+GOUMET\b/g, "DELI GOURMET"],
  [/\bVERMELHO\s+AZUL\b/g, "QUEIJO AZUL"],
  [/\bQUEJO\b/g, "QUEIJO"],
  [/\bREQUEIJAO\b/g, "REQUEIJAO"],
  [/\bREQUEIJO\b/g, "REQUEIJAO"],
  [/\bPARMESAO\b/g, "PARMESAO"],
  [/\bPARMEZAO\b/g, "PARMESAO"],
  [/\bPROVOLONE\s+CRISTAL\s+5KG\b/g, "PROVOLONE CRISTAL 5 KG"],
];

export function normalizeCatalogText(value: unknown) {
  let text = String(value || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[“”"']/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  for (const [pattern, replacement] of OCR_ALIAS_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }

  return text.replace(/\s+/g, " ").trim();
}

function cleanCode(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/[^\dA-Za-z/.-]/g, "");
}

function numericCode(value: unknown) {
  return String(value || "")
    .replace(/[^\d]/g, "")
    .trim();
}

function toNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value || "")
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function levenshtein(a: string, b: string) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    let prev = i;
    for (let j = 1; j <= b.length; j++) {
      const old = matrix[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j] = Math.min(matrix[j] + 1, prev + 1, matrix[j - 1] + cost);
      prev = old;
    }
    matrix[0] = i;
  }

  return matrix[b.length];
}

function stringSimilarity(a: string, b: string) {
  const maxLen = Math.max(a.length, b.length);
  if (!maxLen) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

function tokenScore(a: string, b: string) {
  const aTokens = new Set(a.split(" ").filter((t) => t.length > 1));
  const bTokens = new Set(b.split(" ").filter((t) => t.length > 1));

  if (!aTokens.size || !bTokens.size) return 0;

  let intersection = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) intersection++;
  }

  const union = new Set([...Array.from(aTokens), ...Array.from(bTokens)]).size;
  return intersection / union;
}

function scoreProduct(rawName: string, productName: string) {
  const a = normalizeCatalogText(rawName);
  const b = normalizeCatalogText(productName);

  const tokens = tokenScore(a, b);
  const distance = stringSimilarity(a, b);

  // Token score pesa mais porque o OCR costuma trocar letras, mas mantém marca/peso/embalagem.
  return Math.round((tokens * 0.72 + distance * 0.28) * 100);
}

async function loadCatalog(companyId: string) {
  const rows = await prisma.$queryRawUnsafe<CatalogProduct[]>(
    `
    SELECT id, company_id::text, code, name, unit, active
    FROM product_catalog
    WHERE company_id = $1::uuid
      AND active = true
    `,
    companyId
  );

  return rows || [];
}

function rankByName(rawName: string, catalog: CatalogProduct[]) {
  let best: { product: CatalogProduct; score: number } | null = null;

  for (const product of catalog) {
    const score = scoreProduct(rawName, product.name);
    if (!best || score > best.score) {
      best = { product, score };
    }
  }

  return best;
}

export async function validateOrderItemsWithCatalog(
  companyId: string,
  items: RawOrderItem[] = []
) {
  const catalog = await loadCatalog(companyId);
  const byCode = new Map<string, CatalogProduct>();

  for (const product of catalog) {
    byCode.set(cleanCode(product.code), product);
    const numeric = numericCode(product.code);
    if (numeric) byCode.set(numeric, product);
  }

  return items.map((item) => {
    const originalCode = cleanCode(item.code);
    const normalizedCode = numericCode(originalCode);
    const originalName = String(item.name || "").trim();

    let product =
      byCode.get(originalCode) ||
      (normalizedCode ? byCode.get(normalizedCode) : undefined);

    if (product) {
      const method = product.code === originalCode ? "codigo_exato" : "codigo_normalizado";

      return {
        ...item,
        original_code: originalCode || null,
        original_name: originalName || null,
        code: product.code,
        name: product.name,
        unit: product.unit,
        quantity: toNumber(item.quantity),
        unit_price: toNumber(item.unit_price),
        discount: toNumber(item.discount),
        total: toNumber(item.total),
        catalog_match: {
          matched: true,
          method,
          confidence: 100,
          needs_review: false,
          message:
            method === "codigo_exato"
              ? "Produto confirmado pelo código oficial PMG."
              : "Produto confirmado pelo código normalizado do catálogo PMG.",
        },
      };
    }

    const best = originalName ? rankByName(originalName, catalog) : null;

    if (best && best.score >= 72) {
      return {
        ...item,
        original_code: originalCode || null,
        original_name: originalName || null,
        code: best.product.code,
        name: best.product.name,
        unit: best.product.unit,
        quantity: toNumber(item.quantity),
        unit_price: toNumber(item.unit_price),
        discount: toNumber(item.discount),
        total: toNumber(item.total),
        catalog_match: {
          matched: true,
          method: "similaridade_nome",
          confidence: best.score,
          needs_review: best.score < 86,
          message:
            best.score >= 86
              ? "Produto corrigido automaticamente por similaridade com o catálogo PMG."
              : "Produto sugerido pelo catálogo PMG. Recomenda-se revisar antes de salvar.",
        },
      };
    }

    return {
      ...item,
      original_code: originalCode || null,
      original_name: originalName || null,
      code: originalCode || null,
      name: originalName || "Produto não identificado",
      unit: null,
      quantity: toNumber(item.quantity),
      unit_price: toNumber(item.unit_price),
      discount: toNumber(item.discount),
      total: toNumber(item.total),
      catalog_match: {
        matched: false,
        method: "nao_encontrado",
        confidence: best?.score || 0,
        needs_review: true,
        message:
          "Produto não encontrado com segurança no catálogo PMG. Revise manualmente antes de salvar.",
      },
    };
  });
}

export function summarizeCatalogValidation(items: any[] = []) {
  const total = items.length;
  const exact = items.filter((i) => i.catalog_match?.method === "codigo_exato").length;
  const normalized = items.filter((i) => i.catalog_match?.method === "codigo_normalizado").length;
  const fuzzy = items.filter((i) => i.catalog_match?.method === "similaridade_nome").length;
  const review = items.filter((i) => i.catalog_match?.needs_review).length;

  const score =
    total > 0
      ? Math.round(((exact + normalized) * 100 + fuzzy * 88 + (total - exact - normalized - fuzzy - review) * 50) / total)
      : 0;

  return {
    total,
    exact,
    normalized,
    fuzzy,
    review,
    score,
    safe_to_save: review === 0,
  };
}