import { CatalogProduct } from "./types";
import { normalizeText } from "./normalize";
import { QuoteSearchIntent } from "./intent-engine";

export function catalogText(product: CatalogProduct): string {
  return normalizeText(
    [
      product.code,
      product.descricaoOriginal,
      product.produto,
      product.marca,
      product.categoria,
      product.familia,
      product.subtipo,
      product.linha,
      product.sabor,
      product.embalagem,
      product.vendePor,
      product.searchText,
      ...(product.aliases || []),
      ...(product.keywords || []),
    ]
      .filter(Boolean)
      .join(" ")
  )
    .replace(/\bmussarelas?\b/g, "mucarela")
    .replace(/\bmuçarelas?\b/g, "mucarela")
    .replace(/\bmozarelas?\b/g, "mucarela")
    .replace(/\bmucarelas?\b/g, "mucarela");
}

export function passesCommercialFilter(
  product: CatalogProduct,
  intent: QuoteSearchIntent
): boolean {
  const text = catalogText(product);

  for (const blocked of intent.mustNotHave) {
    if (text.includes(blocked)) return false;
  }

  for (const required of intent.mustHave) {
    if (!text.includes(required)) return false;
  }

  return true;
}