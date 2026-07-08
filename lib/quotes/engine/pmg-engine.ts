import { resolveQuoteItem } from "./commercial-engine";
import { parseQuoteText } from "./parser-engine";
import { CatalogProduct, QuoteResult } from "./types";

export async function runCommercialQuoteEngine(params: {
  companyId: string;
  rawText: string;
  catalog: CatalogProduct[];
}): Promise<QuoteResult> {
  const lines = parseQuoteText(params.rawText);

  const items = await Promise.all(
    lines.map((line) =>
      resolveQuoteItem(params.companyId, line, params.catalog)
    )
  );

  const total = items.reduce((sum, item) => {
    return sum + Number(item.subtotal || 0);
  }, 0);

  return {
    items,
    total,
    needsReview: items.some((item) => item.needsReview),
  };
}