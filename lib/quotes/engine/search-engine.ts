import { detectIntent } from "./intent-engine";
import { passesCommercialFilter, catalogText } from "./filter-engine";
import { CatalogProduct, QuoteInputLine, SearchCandidate } from "./types";

function scoreProductByIntent(input: QuoteInputLine, product: CatalogProduct) {
  const intent = detectIntent(input.raw);
  const text = catalogText(product);

  let score = 0;
  const reasons: string[] = [];

  const add = (points: number, reason: string) => {
    score += points;
    reasons.push(reason);
  };

  for (const token of intent.tokens) {
    if (
      ["mais", "barato", "barata", "baratos", "baratas", "menor", "preco", "preço"].includes(token)
    ) {
      continue;
    }

    if (text.includes(token)) {
      add(20, `Token: ${token}`);
    }
  }

  for (const required of intent.mustHave) {
    if (text.includes(required)) {
      add(80, `Obrigatório: ${required}`);
    }
  }

  if (product.price && Number(product.price) > 0) {
    add(10, "Preço disponível");
  }

  return { score, reasons, intent };
}

function dedupeByCode(results: SearchCandidate[], strategy: string): SearchCandidate[] {
  const byCode = new Map<string, SearchCandidate>();

  for (const item of results) {
    const code = String(item.product.code || item.product.id || "").trim();
    if (!code) continue;

    const current = byCode.get(code);
    if (!current) {
      byCode.set(code, item);
      continue;
    }

    const currentPrice = Number(current.product.price || 0);
    const nextPrice = Number(item.product.price || 0);

    if (strategy === "CHEAPEST") {
      if (nextPrice > 0 && (currentPrice <= 0 || nextPrice < currentPrice)) {
        byCode.set(code, item);
      }
      continue;
    }

    if (strategy === "MOST_EXPENSIVE") {
      if (nextPrice > currentPrice) {
        byCode.set(code, item);
      }
      continue;
    }

    if (item.score > current.score) {
      byCode.set(code, item);
    }
  }

  return Array.from(byCode.values());
}

function rankResults(results: SearchCandidate[], strategy: string, limit: number) {
  return dedupeByCode(
    results.filter((item) => item.score > 0 && Number(item.product.price || 0) > 0),
    strategy
  )
    .sort((a, b) => {
      if (strategy === "CHEAPEST") {
        const priceA = Number(a.product.price || 999999999);
        const priceB = Number(b.product.price || 999999999);

        if (priceA !== priceB) return priceA - priceB;
        return b.score - a.score;
      }

      if (strategy === "MOST_EXPENSIVE") {
        const priceA = Number(a.product.price || 0);
        const priceB = Number(b.product.price || 0);

        if (priceA !== priceB) return priceB - priceA;
        return b.score - a.score;
      }

      return b.score - a.score;
    })
    .slice(0, limit);
}

export async function searchProductsWithLearning(
  companyId: string,
  input: QuoteInputLine,
  catalog: CatalogProduct[],
  limit = 20
): Promise<SearchCandidate[]> {
  const intent = detectIntent(input.raw);

  const filtered = catalog.filter((product) =>
    passesCommercialFilter(product, intent)
  );

  const safeCatalog = filtered.length > 0 ? filtered : catalog;

  const results = safeCatalog.map((product) => {
    const scored = scoreProductByIntent(input, product);

    return {
      product,
      score: scored.score,
      reasons: scored.reasons,
    };
  });

  const ranked = rankResults(results, intent.strategy, limit);

  if (ranked.length > 0) return ranked;

  return dedupeByCode(
    catalog
      .filter((product) => Number(product.price || 0) > 0)
      .map((product) => ({
        product,
        score: 1,
        reasons: ["Fallback manual"],
      })),
    intent.strategy
  ).slice(0, limit);
}

export function searchProducts(
  input: QuoteInputLine,
  catalog: CatalogProduct[],
  limit = 20
): SearchCandidate[] {
  const intent = detectIntent(input.raw);

  const filtered = catalog.filter((product) =>
    passesCommercialFilter(product, intent)
  );

  const safeCatalog = filtered.length > 0 ? filtered : catalog;

  const results = safeCatalog.map((product) => {
    const scored = scoreProductByIntent(input, product);

    return {
      product,
      score: scored.score,
      reasons: scored.reasons,
    };
  });

  return rankResults(results, intent.strategy, limit);
}