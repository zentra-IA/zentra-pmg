import { normalizeText } from "./normalize";

export type SearchStrategy = "BEST_MATCH" | "CHEAPEST" | "MOST_EXPENSIVE";

export type QuoteSearchIntent = {
  raw: string;
  normalized: string;
  tokens: string[];
  strategy: SearchStrategy;
  product?: string;
  brand?: string;
  mustHave: string[];
  mustNotHave: string[];
};

export function detectIntent(raw: string): QuoteSearchIntent {
  const normalized = normalizeText(raw)
    .replace(/\bmussarelas?\b/g, "mucarela")
    .replace(/\bmuçarelas?\b/g, "mucarela")
    .replace(/\bmozarelas?\b/g, "mucarela")
    .replace(/\bmucarelas?\b/g, "mucarela")
    .replace(/\brequeijoes?\b/g, "requeijao")
    .replace(/\bpeperis?\b/g, "peperi");

  const tokens = normalized.split(/\s+/).filter(Boolean);

  const has = (word: string) => tokens.includes(word);

  const strategy =
    has("barato") || has("barata") || has("baratos") || has("baratas") || normalized.includes("menor preco")
      ? "CHEAPEST"
      : normalized.includes("mais caro") || normalized.includes("maior preco")
      ? "MOST_EXPENSIVE"
      : "BEST_MATCH";

  const mustHave: string[] = [];
  const mustNotHave: string[] = [];

  let product: string | undefined;
  let brand: string | undefined;

  if (has("mucarela")) {
    product = "mucarela";
    mustHave.push("mucarela");

    const askedSpecial =
      has("bufala") ||
      has("ralada") ||
      has("bolinha") ||
      has("cobertura") ||
      has("topping") ||
      has("mozzana");

    if (!askedSpecial) {
      mustNotHave.push("bufala", "ralada", "bolinha", "cobertura", "topping", "mozzana");
    }
  }

  if (has("calabresa")) {
    product = "calabresa";
    mustHave.push("calabresa");
    mustNotHave.push("pimenta", "tempero", "molho");
  }

  if (has("presunto")) {
    product = "presunto";

    if (has("peperi")) {
      brand = "peperi";
      mustHave.push("peperi");
      mustNotHave.push("parma", "dalia");
    } else {
      mustHave.push("presunto");
      mustNotHave.push("apresuntado", "parma");
    }
  }

  if (has("apresuntado")) {
    product = "apresuntado";
    mustHave.push("apresuntado");
    mustNotHave.push("parma");
  }

  if (has("requeijao")) {
    product = "requeijao";
    mustHave.push("requeijao");

    if (has("sem") && has("amido")) {
      mustHave.push("sem", "amido");
    }

    if (has("com") && has("amido")) {
      mustHave.push("com", "amido");
    }
  }

  const brands = ["imperador", "anaconda", "coronata", "scala", "aurora", "peperi", "tiroles", "harald"];
  brand = brand || brands.find((b) => has(b));

  if (brand) {
    mustHave.push(brand);
  }

  return {
    raw,
    normalized,
    tokens,
    strategy,
    product,
    brand,
    mustHave: Array.from(new Set(mustHave)),
    mustNotHave: Array.from(new Set(mustNotHave)),
  };
}