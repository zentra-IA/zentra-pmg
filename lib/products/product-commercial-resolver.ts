import { prisma } from "@/lib/prisma";
import { aliasBoost } from "./product-commercial-alias";
import {
  extractNumbers,
  normalizeCommercialText,
  tokenCoverage,
  tokenJaccard,
} from "./text-normalizer";

export type CatalogProduct = {
  id: string;
  company_id: string;
  code: string;
  official_name: string;
  normalized_name: string | null;
  brand: string | null;
  category: string | null;
  subcategory: string | null;
  package_type: string | null;
  weight_value: unknown;
  weight_unit: string | null;
  default_sell_unit: string | null;
  synonyms: string[];
  forbidden_terms: string[];
  attributes: unknown;
};

export type ProductResolution = {
  matched: boolean;
  product: CatalogProduct | null;
  confidence: number;
  needsReview: boolean;
  method: "code_and_name" | "name" | "alias" | "ambiguous" | "not_found";
  reasons: string[];
  secondBestConfidence: number;
  codeNameConflict: boolean;
};

function codeKey(value: unknown): string {
  return String(value || "").replace(/[^\dA-Za-z]/g, "").toUpperCase();
}

function includesForbidden(query: string, product: CatalogProduct): boolean {
  const q = normalizeCommercialText(query);
  return (Array.isArray(product.forbidden_terms) ? product.forbidden_terms : []).some((term) =>
    q.includes(normalizeCommercialText(term))
  );
}

function weightAgreement(query: string, productName: string): number {
  const q = extractNumbers(query);
  const p = extractNumbers(productName);

  if (!q.length || !p.length) return 0;

  return q.some((value) => p.some((target) => Math.abs(value - target) < 0.001))
    ? 8
    : -4;
}

function scoreCandidate(query: string, product: CatalogProduct) {
  const target = [
    product.official_name,
    product.normalized_name,
    product.brand,
    ...(Array.isArray(product.synonyms) ? product.synonyms : []),
  ]
    .filter(Boolean)
    .join(" ");

  const coverage = tokenCoverage(query, target);
  const jaccard = tokenJaccard(query, target);
  const alias = aliasBoost(query, target);
  const brandHit =
    product.brand &&
    normalizeCommercialText(query).includes(normalizeCommercialText(product.brand))
      ? 10
      : 0;

  const forbiddenPenalty = includesForbidden(query, product) ? -35 : 0;
  const weight = weightAgreement(query, product.official_name);

  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        coverage * 58 +
          jaccard * 18 +
          alias.score +
          brandHit +
          weight +
          forbiddenPenalty
      )
    )
  );

  return {
    score,
    reasons: [
      `cobertura de termos: ${Math.round(coverage * 100)}%`,
      `similaridade de tokens: ${Math.round(jaccard * 100)}%`,
      ...alias.reasons,
      ...(brandHit ? ["marca encontrada no texto"] : []),
      ...(weight > 0 ? ["peso/embalagem coerente"] : []),
      ...(forbiddenPenalty ? ["termo proibido encontrado"] : []),
    ],
  };
}

async function loadCatalog(companyId: string): Promise<CatalogProduct[]> {
  return prisma.quote_catalog_products.findMany({
    where: {
      company_id: companyId,
      active: true,
    },
    select: {
      id: true,
      company_id: true,
      code: true,
      official_name: true,
      normalized_name: true,
      brand: true,
      category: true,
      subcategory: true,
      package_type: true,
      weight_value: true,
      weight_unit: true,
      default_sell_unit: true,
      synonyms: true,
      forbidden_terms: true,
      attributes: true,
    },
  }) as Promise<CatalogProduct[]>;
}

export async function resolveCommercialProduct(params: {
  companyId: string;
  rawCode?: unknown;
  rawName?: unknown;
}): Promise<ProductResolution> {
  const catalog = await loadCatalog(params.companyId);
  const query = String(params.rawName || "").trim();
  const rawCode = codeKey(params.rawCode);

  const byCode = rawCode
    ? catalog.find((product) => codeKey(product.code) === rawCode)
    : null;

  const ranked = catalog
    .map((product) => ({
      product,
      ...scoreCandidate(query, product),
    }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0] || null;
  const second = ranked[1] || null;

  if (byCode) {
    const codeScore = query ? scoreCandidate(query, byCode) : { score: 100, reasons: [] };

    if (!query || codeScore.score >= 62) {
      return {
        matched: true,
        product: byCode,
        confidence: Math.max(90, codeScore.score),
        needsReview: false,
        method: "code_and_name",
        reasons: ["código oficial encontrado", ...codeScore.reasons],
        secondBestConfidence: second?.score || 0,
        codeNameConflict: false,
      };
    }

    if (best && best.product.id !== byCode.id && best.score >= 72 && best.score >= codeScore.score + 12) {
      return {
        matched: true,
        product: best.product,
        confidence: best.score,
        needsReview: best.score < 90,
        method: best.reasons.some((reason) => reason.includes("alias"))
          ? "alias"
          : "name",
        reasons: [
          `código ${rawCode} conflitou com o nome lido`,
          ...best.reasons,
        ],
        secondBestConfidence: second?.score || 0,
        codeNameConflict: true,
      };
    }

    return {
      matched: false,
      product: null,
      confidence: Math.max(codeScore.score, best?.score || 0),
      needsReview: true,
      method: "ambiguous",
      reasons: [
        `código ${rawCode} existe, mas o nome OCR aponta para outro produto`,
      ],
      secondBestConfidence: second?.score || 0,
      codeNameConflict: true,
    };
  }

  if (!best || best.score < 62) {
    return {
      matched: false,
      product: null,
      confidence: best?.score || 0,
      needsReview: true,
      method: "not_found",
      reasons: ["nenhum SKU atingiu confiança mínima"],
      secondBestConfidence: second?.score || 0,
      codeNameConflict: false,
    };
  }

  const margin = best.score - (second?.score || 0);
  const ambiguous = margin < 6;

  return {
    matched: !ambiguous,
    product: ambiguous ? null : best.product,
    confidence: best.score,
    needsReview: ambiguous || best.score < 78,
    method: ambiguous
      ? "ambiguous"
      : best.reasons.some((reason) => reason.includes("alias"))
        ? "alias"
        : "name",
    reasons: ambiguous
      ? [`resultado ambíguo: diferença de apenas ${margin} pontos para o segundo SKU`]
      : best.reasons,
    secondBestConfidence: second?.score || 0,
    codeNameConflict: false,
  };
}
