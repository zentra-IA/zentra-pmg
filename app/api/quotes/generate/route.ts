import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type PriceRow = Record<string, any>;

type ParsedLine = {
  raw: string;
  quantity: number;
  quantityUnit: string | null;
  discountPercent: number;
  searchText: string;
};

function roundMoney(value: number): number {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function normalizeDiscountPercent(value: unknown): number {
  const parsed = Number(String(value ?? 0).replace(",", "."));

  if (!Number.isFinite(parsed) || parsed <= 0) return 0;

  // Evita desconto negativo ou acima de 100%.
  return Math.min(100, roundMoney(parsed));
}

function applyDiscount(value: number, discountPercent: number): number {
  const base = roundMoney(value);
  const percent = normalizeDiscountPercent(discountPercent);

  if (!percent) return base;

  return roundMoney(base * (1 - percent / 100));
}

function isValidUuid(value: unknown): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "")
  );
}

function normalize(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9\s.,/%-]/g, " ")
    .replace(/\bmussarelas?\b/g, "mucarela")
    .replace(/\bmucarelas?\b/g, "mucarela")
    .replace(/\bmozarelas?\b/g, "mucarela")
    .replace(/\bmucarela?s?\b/g, "mucarela")
    .replace(/\bmuçarelas?\b/g, "mucarela")
    .replace(/\bcalabresas?\b/g, "calabresa")
    .replace(/\brequeijoes\b/g, "requeijao")
    .replace(/\brequeijões\b/g, "requeijao")
    .replace(/\brequeijao\b/g, "requeijao")
    .replace(/\bpresuntos?\b/g, "presunto")
    .replace(/\bapresuntados?\b/g, "apresuntado")
    .replace(/\bpepperi\b/g, "peperi")
    .replace(/\bpepery\b/g, "peperi")
    .replace(/\btiroles\b/g, "tiroles")
    .replace(/\s+/g, " ")
    .trim();
}

function moneyBR(value: number): string {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function firstValue(...values: any[]) {
  for (const value of values) {
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      return value;
    }
  }

  return "";
}

function getCatalog(row: PriceRow): Record<string, any> {
  if (row.catalog_product && typeof row.catalog_product === "object") {
    return row.catalog_product;
  }

  return {};
}

function getCode(row: PriceRow): string {
  return String(firstValue(row.code, row.codigo, row.product_code, row.sku, row.id));
}

function getName(row: PriceRow): string {
  const c = getCatalog(row);

  return String(
    firstValue(
      c.official_name,
      c.description_original,
      c.descricao_original,
      c.name,
      c.normalized_name,
      c.product,
      row.official_name,
      row.description_original,
      row.descricao_original,
      row.description,
      row.descricao,
      row.product_name_from_pdf,
      row.product_name,
      row.name,
      row.nome,
      row.normalized_name,
      row.product,
      row.produto,
      row.item,
      row.title,
      row.search_text,
      getCode(row)
    )
  );
}

function getBrand(row: PriceRow): string {
  const c = getCatalog(row);
  return String(firstValue(c.brand, c.marca, row.brand, row.marca));
}

function getCategory(row: PriceRow): string {
  const c = getCatalog(row);
  return String(firstValue(c.category, c.categoria, row.category, row.categoria));
}

function getUnit(row: PriceRow): string {
  const c = getCatalog(row);

  return String(
    firstValue(
      row.sell_unit,
      row.default_sell_unit,
      row.unit,
      row.unidade,
      row.sold_by,
      c.sell_unit,
      c.default_sell_unit,
      c.unit,
      c.unidade,
      c.sold_by,
      c.vende_por,
      "UN"
    )
  ).toUpperCase();
}

function getPrice(row: PriceRow): number {
  const raw = firstValue(
    row.price,
    row.current_price,
    row.preco,
    row.unit_price,
    row.valor,
    row.sale_price,
    row.price_unit,
    row.preco_unitario,
    0
  );

  if (typeof raw === "number") return raw;

  const cleaned = String(raw)
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");

  return Number(cleaned || 0);
}

function getTableDate(rows: PriceRow[]) {
  const row = rows.find(Boolean);
  return String(firstValue(row?.table_date, row?.date, row?.created_at, "Dia atual"));
}

function getHaystack(row: PriceRow): string {
  const c = getCatalog(row);
  const allValues = [
    getCode(row),
    getName(row),
    getBrand(row),
    getCategory(row),
    row.search_text,
    row.normalized_name,
    row.product_name_from_pdf,
    row.product_name,
    row.description,
    row.descricao,
    row.unit,
    row.sell_unit,
    c.search_text,
    c.normalized_name,
    c.product,
    c.brand,
    c.category,
    c.family,
    c.subtype,
    c.line,
    c.flavor,
    c.package,
    c.sold_by,
    ...(Array.isArray(c.aliases) ? c.aliases : []),
    ...(Array.isArray(c.keywords) ? c.keywords : []),
  ];

  return normalize(allValues.filter(Boolean).join(" "));
}

function parseLine(raw: string): ParsedLine {
  const text = normalize(raw);

  const quantityMatch = text.match(/(^|\s)(\d+(?:[,.]\d+)?)/);
  const quantity = quantityMatch ? Number(quantityMatch[2].replace(",", ".")) : 1;

  const discountMatch = text.match(
    /(?:com\s+)?desconto\s*(?:de)?\s*(\d+(?:[,.]\d+)?)\s*%?/
  );

  const discountPercent = normalizeDiscountPercent(
    discountMatch?.[1] ?? 0
  );

  let quantityUnit: string | null = null;

  const unitRules: Array<[RegExp, string]> = [
    [/\bkg|quilo|quilos|kilo|kilos\b/, "KG"],
    [/\bfardo|fardos|fd\b/, "FD"],
    [/\bcaixa|caixas|cx\b/, "CX"],
    [/\bpeca|pecas|pc|pç\b/, "PÇ"],
    [/\bpacote|pacotes|pct\b/, "PCT"],
    [/\bbalde|baldes|bd\b/, "BD"],
    [/\bbisnaga|bisnagas|bis\b/, "BIS"],
    [/\blata|latas|lt\b/, "LT"],
    [/\bvidro|vidros|vd\b/, "VD"],
    [/\bunidade|unidades|un\b/, "UN"],
  ];

  for (const [regex, unit] of unitRules) {
    if (regex.test(text)) {
      quantityUnit = unit;
      break;
    }
  }

  // Plurais de produto que no comercial significam unidade de venda.
  if (!quantityUnit && /\bmucarela\b/.test(text)) quantityUnit = "PÇ";
  if (!quantityUnit && /\bcalabresa\b/.test(text)) quantityUnit = "PCT";

  const searchText = text
    .replace(/desconto\s*(?:de)?\s*\d+(?:[,.]\d+)?\s*%?/g, " ")
    .replace(/^\s*\d+(?:[,.]\d+)?\s*/, " ")
    .replace(/\b(kg|quilo|quilos|kilo|kilos|fardo|fardos|fd|caixa|caixas|cx|peca|pecas|pc|pç|pacote|pacotes|pct|balde|baldes|bd|bisnaga|bisnagas|bis|unidade|unidades|un|lata|latas|lt|vidro|vidros|vd)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    raw,
    quantity,
    quantityUnit,
    discountPercent,
    searchText,
  };
}

function tokensOf(query: string): string[] {
  return normalize(query)
    .split(/\s+/)
    .filter((token) => token.length >= 2)
    .filter(
      (token) =>
        ![
          "de",
          "da",
          "do",
          "das",
          "dos",
          "com",
          "sem",
          "ao",
          "a",
          "o",
          "e",
          "mais",
          "barato",
          "barata",
          "baratos",
          "baratas",
          "menor",
          "preco",
          "precos",
          "preço",
          "preços",
          "desconto",
        ].includes(token)
    );
}


function tokenMatchesHaystack(haystack: string, token: string): boolean {
  const words = haystack.split(/\s+/).filter(Boolean);

  if (words.includes(token)) return true;

  // Aceita singular/plural e pequenas variações de OCR/digitação.
  if (
    words.some(
      (word) =>
        word.length >= 4 &&
        token.length >= 4 &&
        (word.startsWith(token) ||
          token.startsWith(word) ||
          word.includes(token) ||
          token.includes(word))
    )
  ) {
    return true;
  }

  if (token.length >= 5) {
    for (const word of words) {
      if (Math.abs(word.length - token.length) > 1) continue;

      let differences = 0;
      const length = Math.max(word.length, token.length);

      for (let index = 0; index < length; index++) {
        if (word[index] !== token[index]) differences++;
        if (differences > 1) break;
      }

      if (differences <= 1) return true;
    }
  }

  return false;
}

function genericProductMatch(query: string, row: PriceRow): {
  accepted: boolean;
  matched: number;
  total: number;
  coverage: number;
} {
  const tokens = tokensOf(query);
  const haystack = getHaystack(row);

  if (!tokens.length) {
    return { accepted: false, matched: 0, total: 0, coverage: 0 };
  }

  const matches = tokens.map((token) => tokenMatchesHaystack(haystack, token));
  const matched = matches.filter(Boolean).length;
  const coverage = matched / tokens.length;

  /*
   * Regra geral para os mais de 2 mil itens:
   * - 1 ou 2 termos: todos precisam existir.
   * - 3 termos: pelo menos 2, mas o primeiro termo (família) é obrigatório.
   * - 4+ termos: mínimo de 75%, com o primeiro termo obrigatório.
   *
   * Isso impede absurdos como:
   * "azeitona verde média" -> "aguardente Pitú"
   * "farinha de trigo pizza" -> "farinha de mandioca"
   */
  const firstTokenMatches = matches[0] === true;

  let accepted = false;

  if (tokens.length <= 2) {
    accepted = matched === tokens.length;
  } else if (tokens.length === 3) {
    accepted = firstTokenMatches && matched >= 2;
  } else {
    accepted = firstTokenMatches && coverage >= 0.75;
  }

  return {
    accepted,
    matched,
    total: tokens.length,
    coverage,
  };
}

function unitMatchesRequest(row: PriceRow, requestedUnit?: string | null): boolean {
  if (!requestedUnit) return true;

  const wanted = normalizeUnitAlias(requestedUnit);
  const sellUnit = normalizeUnitAlias(getUnit(row));
  const haystack = getHaystack(row);

  if (sellUnit === wanted) return true;

  // Também aceita quando a embalagem solicitada aparece no nome oficial.
  const pattern = unitPattern(wanted);
  return new RegExp(`\\b(?:${pattern})\\b`, "i").test(haystack);
}

function wantsCheapest(query: string): boolean {
  const q = normalize(query);

  return (
    q.match(/\bmais\s+barat[ao]s?\b/) !== null ||
    q.match(/\bmenor\s+preco\b/) !== null ||
    q.match(/\bmenores\s+precos\b/) !== null ||
    q.match(/\bmais\s+em\s+conta\b/) !== null
  );
}

function requestedProduct(query: string): "MUCARELA" | "CALABRESA" | "REQUEIJAO" | "PRESUNTO" | "APRESUNTADO" | "AZEITONA" | "MORTADELA" | "GORGONZOLA" | null {
  const q = normalize(query);
  if (/\bmucarela\b/.test(q)) return "MUCARELA";
  if (/\bcalabresa\b/.test(q)) return "CALABRESA";
  if (/\brequeijao\b/.test(q)) return "REQUEIJAO";
  if (/\bapresuntado\b/.test(q)) return "APRESUNTADO";
  if (/\bpresunto\b/.test(q)) return "PRESUNTO";
  if (/\bazeitona\b/.test(q)) return "AZEITONA";
  if (/\bmortadela\b/.test(q)) return "MORTADELA";
  if (/\bgorgonzola\b/.test(q)) return "GORGONZOLA";
  return null;
}

function isTraditionalMucarela(row: PriceRow): boolean {
  const hay = getHaystack(row);

  if (!/\bmucarela\b/.test(hay)) return false;

  // Muçarela simples para cotação comercial: peça/bloco de 4kg, caixa 6 peças.
  if (/\bfatiada|fatias|pequena|bufala|ralada|bolinha|cobertura|topping|mozzana|yema|750\s*g|500\s*g|250\s*g|150\s*g\b/.test(hay)) {
    return false;
  }

  if (!/\b4\s*kg\b/.test(hay)) return false;
  if (!/\bcx\s*6\s*p[cç]\b|\bcx\s*6\s*peca|\bcx\s*6\s*pecas\b/.test(hay)) return false;

  return true;
}

function isCommercialCalabresa(row: PriceRow): boolean {
  const hay = getHaystack(row);

  if (!/\bcalabresa\b/.test(hay)) return false;
  if (/\bpimenta|tempero|molho|fatiada|fatias\b/.test(hay)) return false;

  // Regra comercial esperada: pacote de 5kg.
  if (!/\b5\s*kg\b/.test(hay)) return false;

  return true;
}

function commercialReject(query: string, row: PriceRow): boolean {
  const q = normalize(query);
  const hay = getHaystack(row);

  const product = requestedProduct(q);

  if (product === "MUCARELA") {
    return !isTraditionalMucarela(row);
  }

  if (product === "CALABRESA") {
    return !isCommercialCalabresa(row);
  }

  const asksPresunto = /\bpresunto\b/.test(q);
  const asksApresuntado = /\bapresuntado\b/.test(q);
  const asksPeperi = /\bpeperi\b/.test(q);

  if (asksPresunto && asksPeperi) {
    if (/\bparma\b/.test(hay)) return true;
    if (!/\bpeperi\b/.test(hay)) return true;
  }

  if (asksPresunto && !asksPeperi) {
    if (!/\bpresunto\b/.test(hay)) return true;
    if (/\bparma\b/.test(hay)) return true;
    if (/\bapresuntado\b/.test(hay)) return true;
  }

  if (asksApresuntado) {
    if (!/\bapresuntado\b/.test(hay)) return true;
    if (asksPeperi && !/\bpeperi\b/.test(hay)) return true;
    if (/\bparma\b/.test(hay)) return true;
  }

  if (/\brequeijao\b/.test(q)) {
    if (!/\brequeijao\b/.test(hay)) return true;

    // Quando o vendedor pede "sem amido", cheddar/sabores e itens sem essa
    // característica NÃO podem entrar na lista de mais baratos.
    if (/\bsem\s+amido\b/.test(q)) {
      if (!/\bsem\s+amido\b/.test(hay)) return true;
      if (/\bcheddar\b|\bsabor\b|\bsabores\b/.test(hay)) return true;
    }

    if (/\bcom\s+amido\b/.test(q) && /\bsem\s+amido\b/.test(hay)) return true;
  }

  if (/\bazeitona\b/.test(q) && !/\bazeitona\b/.test(hay)) return true;
  if (/\bmortadela\b/.test(q) && !/\bmortadela\b/.test(hay)) return true;

  if (/\bzero\b/.test(q) && !/\bzero\b/.test(hay)) return true;

  return false;
}

function tokenScore(haystack: string, token: string): number {
  const words = haystack.split(/\s+/);

  if (words.some((word) => word === token)) return 40;
  if (words.some((word) => word.length >= 4 && (word.indexOf(token) >= 0 || token.indexOf(word) >= 0))) {
    return 18;
  }

  if (token.length >= 5) {
    for (let i = 0; i < token.length; i++) {
      const reduced = token.slice(0, i) + token.slice(i + 1);
      if (words.some((word) => word.indexOf(reduced) >= 0)) return 10;
    }
  }

  return -8;
}

function businessPenalty(query: string, row: PriceRow): number {
  const hay = getHaystack(row);
  const q = normalize(query);
  let penalty = 0;

  if (/\bpresunto\b/.test(q)) {
    if (/\bparma\b/.test(hay)) penalty -= 500;
    if (/\bapresuntado\b/.test(hay) && !/\bpeperi\b/.test(q)) penalty -= 250;
    if (/\bpeperi\b/.test(q) && !/\bpeperi\b/.test(hay)) penalty -= 1000;
  }

  if (/\bapresuntado\b/.test(q) && /\bpresunto\b/.test(hay) && !/\bapresuntado\b/.test(hay)) {
    penalty -= 300;
  }

  if (requestedProduct(q) === "MUCARELA" && !isTraditionalMucarela(row)) penalty -= 2000;
  if (requestedProduct(q) === "CALABRESA" && !isCommercialCalabresa(row)) penalty -= 2000;

  return penalty;
}

function scoreRow(query: string, row: PriceRow): { score: number; reasons: string[] } {
  const hay = getHaystack(row);
  const tokens = tokensOf(query);
  const reasons: string[] = [];
  let score = 0;

  for (const token of tokens) {
    const value = tokenScore(hay, token);
    score += value;
    if (value > 0) reasons.push(`termo ${token}: +${value}`);
  }

  const matched = reasons.length;
  if (tokens.length && matched === tokens.length) {
    score += 120;
    reasons.push("todos os termos relevantes encontrados");
  }

  if (getBrand(row) && tokens.some((t) => normalize(getBrand(row)).split(/\s+/).some((b) => b === t))) {
    score += 60;
    reasons.push("marca encontrada");
  }

  const product = requestedProduct(query);
  if (product === "MUCARELA" && isTraditionalMucarela(row)) {
    score += 300;
    reasons.push("muçarela tradicional 4kg peça");
  }

  if (product === "CALABRESA" && isCommercialCalabresa(row)) {
    score += 300;
    reasons.push("calabresa comercial 5kg pacote");
  }

  const penalty = businessPenalty(query, row);
  if (penalty) {
    score += penalty;
    reasons.push(`regra comercial: ${penalty}`);
  }

  const price = getPrice(row);
  if (price > 0) {
    score += 15;
    reasons.push("preço disponível");
  }

  return { score, reasons };
}

function toOption(row: PriceRow, score = 0, reasons: string[] = []) {
  const price = getPrice(row);
  const unit = getUnit(row);
  const name = getName(row);
  const brand = getBrand(row);
  const category = getCategory(row);

  return {
    id: String(firstValue(row.id, getCode(row))),
    code: getCode(row),
    official_name: name,
    product_name_from_pdf: name,
    normalized_name: normalize(name),
    brand: brand || null,
    category: category || null,
    subcategory: firstValue(row.subcategory, getCatalog(row).subcategory, null),
    package_type: firstValue(row.package_type, getCatalog(row).package, null),
    sell_unit: unit,
    default_sell_unit: unit,
    unit,
    price,
    unitPrice: price,
    labelPrice: price ? moneyBR(price) : "",
    labelKg: "",
    labelBox: "",
    score,
    reasons,
  };
}

function dedupeScoredRows<T extends { row: PriceRow; score: number; reasons: string[] }>(
  items: T[],
  query: string
): T[] {
  const cheapest = wantsCheapest(query);
  const byCode = new Map<string, T>();

  for (const item of items) {
    const code = getCode(item.row);
    if (!code) continue;

    const current = byCode.get(code);
    if (!current) {
      byCode.set(code, item);
      continue;
    }

    if (cheapest) {
      const currentPrice = comparableCommercialPrice(query, current.row);
      const nextPrice = comparableCommercialPrice(query, item.row);

      if (nextPrice < currentPrice) {
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

function searchRows(
  rows: PriceRow[],
  query: string,
  limit = 20,
  requestedUnit?: string | null
) {
  const cheapest = wantsCheapest(query);

  const scoredRaw = rows
    .filter((row) => getPrice(row) > 0)
    .filter((row) => unitMatchesRequest(row, requestedUnit))
    .map((row) => {
      const generic = genericProductMatch(query, row);
      const result = scoreRow(query, row);

      return {
        row,
        score:
          result.score +
          Math.round(generic.coverage * 500) +
          generic.matched * 80,
        reasons: [
          ...result.reasons,
          `cobertura dos termos: ${generic.matched}/${generic.total}`,
        ],
        price: getPrice(row),
        generic,
      };
    })
    .filter((item) => item.generic.accepted)
    .filter((item) => !commercialReject(query, item.row));

  const scored = dedupeScoredRows(scoredRaw, query)
    .sort((a, b) => {
      if (cheapest) {
        const priceA = comparableCommercialPrice(query, a.row);
        const priceB = comparableCommercialPrice(query, b.row);

        if (priceA !== priceB) return priceA - priceB;
      }

      return b.score - a.score;
    })
    .slice(0, limit);

  /*
   * Nunca mais usamos o catálogo inteiro como fallback.
   * Se não houver correspondência real, devolvemos [] para revisão manual.
   */
  return scored.map((item) => toOption(item.row, item.score, item.reasons));
}

function extractFirstKg(name: string): number | null {
  const text = normalize(name);
  const match = text.match(/(\d+(?:[,.]\d+)?)\s*kg/);
  if (!match) return null;
  return Number(match[1].replace(",", "."));
}

function normalizeUnitAlias(unit: string): string {
  const value = normalize(unit).toUpperCase();

  if (["PC", "PCA", "PECA", "PECAS", "PÇ"].includes(value)) return "PÇ";
  if (["PACOTE", "PACOTES"].includes(value)) return "PCT";
  if (["CAIXA", "CAIXAS"].includes(value)) return "CX";
  if (["FARDO", "FARDOS", "FDO"].includes(value)) return "FD";
  if (["BISNAGA", "BISNAGAS"].includes(value)) return "BIS";
  if (["BALDE", "BALDES"].includes(value)) return "BD";
  if (["LATA", "LATAS"].includes(value)) return "LT";
  if (["VIDRO", "VIDROS"].includes(value)) return "VD";
  if (["UNIDADE", "UNIDADES"].includes(value)) return "UN";
  if (["QUILO", "QUILOS", "KILO", "KILOS"].includes(value)) return "KG";

  return value;
}

function unitPattern(unit: string): string {
  const normalized = normalizeUnitAlias(unit);

  const patterns: Record<string, string> = {
    "PÇ": "p[cç]|pc|peca|pecas",
    PCT: "pct|pacote|pacotes",
    BIS: "bis|bisnaga|bisnagas",
    BD: "bd|balde|baldes",
    CX: "cx|caixa|caixas",
    FD: "fd|fdo|fardo|fardos",
    LT: "lt|lata|latas",
    VD: "vd|vidro|vidros",
    UN: "un|unidade|unidades",
    KG: "kg|quilo|quilos|kilo|kilos",
    BAG: "bag",
    GL: "gl|galao|galoes",
    BARR: "barr|barrica|barricas",
  };

  return patterns[normalized] || normalized.toLowerCase();
}

function extractContainerMultiplier(name: string, requestedUnit: string, sellUnit: string): number | null {
  const text = normalize(name);
  const container = unitPattern(requestedUnit);
  const sold = unitPattern(sellUnit);

  const direct = text.match(new RegExp(`\\b(?:${container})\\s*(\\d+(?:[,.]\\d+)?)\\s*(?:${sold})\\b`));
  if (direct) return Number(direct[1].replace(",", "."));

  // Casos comuns da tabela: (CX 8 BIS), (CX 5 PCT), (FDO 10 PCT), (PCT 12 UN), (CX 20 KG)
  const generic = text.match(new RegExp(`\\b(?:${container})\\s*(\\d+(?:[,.]\\d+)?)\\s*([a-zç]+)\\b`));
  if (generic && normalizeUnitAlias(generic[2]) === normalizeUnitAlias(sellUnit)) {
    return Number(generic[1].replace(",", "."));
  }

  return null;
}

function extractPiecesPerBox(name: string): number | null {
  return (
    extractContainerMultiplier(name, "CX", "PÇ") ||
    extractContainerMultiplier(name, "CX", "BIS") ||
    extractContainerMultiplier(name, "CX", "PCT") ||
    null
  );
}

function extractPackageKg(name: string): number | null {
  const text = normalize(name);
  const match =
    text.match(/\bfdo\s*(\d+(?:[,.]\d+)?)\s*kg\b/) ||
    text.match(/\bfd\s*(\d+(?:[,.]\d+)?)\s*kg\b/) ||
    text.match(/\bpct\s*(\d+(?:[,.]\d+)?)\s*kg\b/);

  if (!match) return null;
  return Number(match[1].replace(",", "."));
}

function comparableCommercialPrice(query: string, row: PriceRow): number {
  const unitPrice = getPrice(row);
  const product = requestedProduct(query);
  const name = getName(row);

  if (product === "MUCARELA") {
    // Compara por preço da peça, não por KG.
    const kg = extractFirstKg(name) || 4;
    return unitPrice * kg;
  }

  if (product === "CALABRESA") {
    // Se a tabela já vende por PCT, o preço já é do pacote.
    if (normalizeUnitAlias(getUnit(row)) === "PCT") return unitPrice;

    // Se vende por KG, compara pelo pacote comercial de 5kg.
    const kg = extractPackageKg(name) || extractFirstKg(name) || 5;
    return unitPrice * kg;
  }

  return unitPrice;
}

function defaultUnitForLine(parsed: ParsedLine, option: any): string {
  if (parsed.quantityUnit) return parsed.quantityUnit;

  const q = normalize(parsed.raw);
  const name = normalize(option?.official_name || "");

  if (/\bmucarela\b/.test(q)) return "PÇ";
  if (/\bcalabresa\b/.test(q)) return "PCT";
  if (/\brequeijao\b/.test(q)) return "BIS";
  if (/\bazeitona\b/.test(q)) return "BD";
  if (/\bmortadela\b/.test(q)) return "PÇ";

  return String(option?.sell_unit || "UN").toUpperCase();
}

function getBilledQuantity(quantity: number, requestedUnit: string, option: any) {
  const unit = normalizeUnitAlias(requestedUnit || option?.sell_unit || "UN");
  const name = option?.official_name || "";
  const sellUnit = normalizeUnitAlias(option?.sell_unit || "UN");
  const product = requestedProduct(name);
  const kg = extractFirstKg(name);
  const packageKg = extractPackageKg(name);
  const unitPrice = Number(option?.price || 0);

  // Regra de ouro: PREÇO sempre é da unidade de venda da tabela.
  // Se o vendedor pediu a mesma unidade que a tabela vende, não converte.
  if (sellUnit === unit || !unit) {
    return {
      billedQuantity: quantity,
      displayUnit: sellUnit || unit || "UN",
      commercialUnitPrice: unitPrice,
      equivalentText: null,
    };
  }

  // Unidade maior para unidade de venda: CX 8 BIS, CX 5 PCT, FDO 10 PCT, PCT 12 UN etc.
  const containerMultiplier = extractContainerMultiplier(name, unit, sellUnit);
  if (containerMultiplier) {
    return {
      billedQuantity: quantity * containerMultiplier,
      displayUnit: unit,
      commercialUnitPrice: unitPrice * containerMultiplier,
      equivalentText: `${quantity * containerMultiplier} ${sellUnit}`,
    };
  }

  // Pedido em KG para produto vendido por embalagem com peso fixo.
  // Ex.: 50 KG farinha com FDO 25 KG vendido por FD => 2 FD.
  if (unit === "KG" && sellUnit !== "KG") {
    const kgPerSellUnit = packageKg || kg;
    if (kgPerSellUnit) {
      const billed = quantity / kgPerSellUnit;
      return {
        billedQuantity: billed,
        displayUnit: "KG",
        commercialUnitPrice: unitPrice,
        equivalentText: `${billed} ${sellUnit}`,
      };
    }
  }

  // Muçarela normalmente vende por KG na tabela; peça/caixa precisam virar KG.
  if (product === "MUCARELA" && sellUnit === "KG") {
    if (unit === "PÇ") {
      const pieceKg = kg || 4;
      return {
        billedQuantity: quantity * pieceKg,
        displayUnit: "PÇ",
        commercialUnitPrice: unitPrice * pieceKg,
        equivalentText: `${quantity * pieceKg} KG`,
      };
    }

    if (unit === "CX") {
      const pieces = extractContainerMultiplier(name, "CX", "PÇ") || 6;
      const pieceKg = kg || 4;
      return {
        billedQuantity: quantity * pieces * pieceKg,
        displayUnit: "CX",
        commercialUnitPrice: unitPrice * pieces * pieceKg,
        equivalentText: `${quantity * pieces} PÇ / ${quantity * pieces * pieceKg} KG`,
      };
    }
  }

  // Calabresa: se tabela vende por KG, pacote comercial costuma ser 5kg.
  // Se tabela vende por PCT, a regra de ouro acima já resolveu.
  if (product === "CALABRESA" && sellUnit === "KG") {
    if (unit === "PCT") {
      const kgPerPackage = packageKg || kg || 5;
      return {
        billedQuantity: quantity * kgPerPackage,
        displayUnit: "PCT",
        commercialUnitPrice: unitPrice * kgPerPackage,
        equivalentText: `${quantity * kgPerPackage} KG`,
      };
    }

    if (unit === "CX") {
      const packages = extractContainerMultiplier(name, "CX", "PCT") || 1;
      const kgPerPackage = packageKg || kg || 5;
      return {
        billedQuantity: quantity * packages * kgPerPackage,
        displayUnit: "CX",
        commercialUnitPrice: unitPrice * packages * kgPerPackage,
        equivalentText: `${quantity * packages} PCT / ${quantity * packages * kgPerPackage} KG`,
      };
    }
  }

  // Requeijão vendido por BIS: caixa vira quantidade de bisnagas conforme a tabela.
  if (product === "REQUEIJAO" && sellUnit === "BIS" && unit === "CX") {
    const bis = extractContainerMultiplier(name, "CX", "BIS") || 12;
    return {
      billedQuantity: quantity * bis,
      displayUnit: "CX",
      commercialUnitPrice: unitPrice * bis,
      equivalentText: `${quantity * bis} BIS`,
    };
  }

  // Mortadela/embutidos por KG, peça/caixa precisam converter.
  if (product === "MORTADELA" && sellUnit === "KG") {
    if (unit === "PÇ") {
      const pieceKg = kg || 4;
      return {
        billedQuantity: quantity * pieceKg,
        displayUnit: "PÇ",
        commercialUnitPrice: unitPrice * pieceKg,
        equivalentText: `${quantity * pieceKg} KG`,
      };
    }

    if (unit === "CX") {
      const pieces = extractContainerMultiplier(name, "CX", "PÇ") || 2;
      const pieceKg = kg || 4;
      return {
        billedQuantity: quantity * pieces * pieceKg,
        displayUnit: "CX",
        commercialUnitPrice: unitPrice * pieces * pieceKg,
        equivalentText: `${quantity * pieces} PÇ / ${quantity * pieces * pieceKg} KG`,
      };
    }
  }

  /*
   * Conversão genérica para produtos vendidos por KG.
   *
   * Exemplos:
   * - Gorgonzola 3 KG (CX 2 PÇ), tabela em KG:
   *   1 PÇ = 3 KG.
   * - Presunto 3,5 KG (CX 2 PÇ), tabela em KG:
   *   1 PÇ = 3,5 KG.
   *
   * Essa regra é aplicada somente quando:
   * - a tabela vende por KG;
   * - o vendedor pediu PÇ ou CX;
   * - o peso da peça está explícito no nome oficial.
   *
   * Assim não inventamos peso quando o PDF não informa.
   */
  if (sellUnit === "KG" && (unit === "PÇ" || unit === "CX")) {
    const pieceKg = kg;

    if (pieceKg && pieceKg > 0) {
      if (unit === "PÇ") {
        return {
          billedQuantity: quantity * pieceKg,
          displayUnit: "PÇ",
          commercialUnitPrice: unitPrice * pieceKg,
          equivalentText: `${quantity * pieceKg} KG`,
        };
      }

      const piecesPerBox = extractContainerMultiplier(name, "CX", "PÇ");

      if (piecesPerBox && piecesPerBox > 0) {
        return {
          billedQuantity: quantity * piecesPerBox * pieceKg,
          displayUnit: "CX",
          commercialUnitPrice: unitPrice * piecesPerBox * pieceKg,
          equivalentText: `${quantity * piecesPerBox} PÇ / ${quantity * piecesPerBox * pieceKg} KG`,
        };
      }
    }
  }

  // Fallback seguro: não inventa conversão.
  // Usa quantidade digitada e deixa rastreável no item.
  return {
    billedQuantity: quantity,
    displayUnit: unit || sellUnit || "UN",
    commercialUnitPrice: unitPrice,
    equivalentText: sellUnit !== unit ? `verificar conversão para ${sellUnit}` : null,
  };
}
function buildFinalItem(params: {
  raw: string;
  code: string;
  option: any;
  quantity: number;
  quantityUnit?: string | null;
  discountPercent?: number;
}) {
  const quantity = Number(params.quantity || 1);
  const discountPercent = normalizeDiscountPercent(params.discountPercent);
  const requestedUnit = String(
    params.quantityUnit || params.option?.sell_unit || "UN"
  ).toUpperCase();

  const conversion = getBilledQuantity(quantity, requestedUnit, params.option);

  const originalTableUnitPrice = roundMoney(
    Number(params.option?.price || 0)
  );

  const originalCommercialUnitPrice = roundMoney(
    Number(conversion.commercialUnitPrice || 0)
  );

  /*
   * Regra financeira rígida:
   * preço final da unidade = preço original × (1 - desconto / 100)
   * total = preço final da unidade × quantidade solicitada
   *
   * Exemplos:
   * R$ 100,00 - 3% = R$ 97,00
   * R$ 100,00 - 2,95% = R$ 97,05
   *
   * A unidade pode ser KG, PÇ, CX, BD, PCT etc.
   */
  const discountedCommercialUnitPrice = applyDiscount(
    originalCommercialUnitPrice,
    discountPercent
  );

  const discountedTableUnitPrice = applyDiscount(
    originalTableUnitPrice,
    discountPercent
  );

  const subtotal = roundMoney(
    discountedCommercialUnitPrice * quantity
  );

  const discountAmountPerUnit = roundMoney(
    originalCommercialUnitPrice - discountedCommercialUnitPrice
  );

  const totalDiscountAmount = roundMoney(
    discountAmountPerUnit * quantity
  );

  return {
    raw: params.raw,
    code: params.code,
    productName: params.option?.official_name || params.raw,
    quantity,
    unit: conversion.displayUnit,
    billedQuantity: conversion.billedQuantity,
    tableUnit: params.option?.sell_unit || "UN",

    // Compatibilidade com o frontend existente:
    unitPrice: discountedCommercialUnitPrice,
    tableUnitPrice: discountedTableUnitPrice,

    originalUnitPrice: originalCommercialUnitPrice,
    originalTableUnitPrice,
    discountedUnitPrice: discountedCommercialUnitPrice,
    discountAmountPerUnit,
    totalDiscountAmount,

    equivalentText: conversion.equivalentText,
    subtotal,
    discountPercent,
    option: params.option,
  };
}

function formatFinalQuote(params: {
  clientName?: string;
  items: any[];
  total: number;
}) {
  const lines: string[] = [];

  lines.push("📋 *COTAÇÃO*");

  if (params.clientName) {
    lines.push(`👤 Cliente: *${params.clientName}*`);
  }

  lines.push("");

  params.items.forEach((item, index) => {
    lines.push("━━━━━━━━━━━━━━━━━━━━━━");
    lines.push(`*${index + 1}. ${item.productName}*`);
    lines.push("");
    lines.push(`📦 Quantidade solicitada: ${item.quantity} ${item.unit}`);

if (item.equivalentText) {
  lines.push(`📐 Conversão: ${item.equivalentText}`);
}

const finalUnitPrice = roundMoney(
  Number(item.discountedUnitPrice ?? item.unitPrice ?? 0)
);

if (Number(item.discountPercent || 0) > 0) {
  lines.push(
    `🏷️ Desconto aplicado: ${String(item.discountPercent).replace(".", ",")}%`
  );
  lines.push(
    `💰 Preço original por ${item.unit}: ${moneyBR(item.originalUnitPrice)}`
  );
  lines.push(
    `✅ Preço com desconto por ${item.unit}: ${moneyBR(finalUnitPrice)}`
  );
  lines.push(
    `💸 Economia neste item: ${moneyBR(item.totalDiscountAmount)}`
  );
} else {
  lines.push(`💰 Preço unitário final: ${moneyBR(finalUnitPrice)}`);
}

lines.push(`💲Valor total deste item: ${moneyBR(item.subtotal)}`);

    lines.push("");
  });

  lines.push("━━━━━━━━━━━━━━━━━━━━━━");
  lines.push("");
  lines.push("*TOTAL DA COTAÇÃO*");
  lines.push(`💵 *${moneyBR(params.total)}*`);

  return lines.join("\n");
}
function hasExplicitCommercialUnit(raw: string): boolean {
  const q = normalize(raw);

  return /\b(kg|quilo|quilos|kilo|kilos|fardo|fardos|fd|caixa|caixas|cx|peca|pecas|pc|pç|pacote|pacotes|pct|balde|baldes|bd|bisnaga|bisnagas|bis|unidade|unidades|un|lata|latas|lt|vidro|vidros|vd)\b/.test(q);
}

function isCheapestOptionsRequest(raw: string): boolean {
  /*
   * Regra global solicitada:
   * "10 muçarelas mais baratas" -> 10 opções
   * "5 manteigas balde mais baratas" -> 5 opções em balde
   * "8 farinhas de trigo pizza mais baratas" -> 8 opções
   *
   * Vale para qualquer produto dos mais de 2 mil itens do catálogo.
   */
  return wantsCheapest(raw);
}

function formatCheapestOptionsQuote(params: {
  clientName?: string;
  blocks: Array<{
    raw: string;
    options: any[];
    discountPercent?: number;
  }>;
}) {
  const lines: string[] = [];

  lines.push("🔎 *OPÇÕES MAIS BARATAS*");

  if (params.clientName) {
    lines.push(`👤 Cliente: *${params.clientName}*`);
  }

  lines.push("");

  params.blocks.forEach((block) => {
    lines.push(`*${block.raw}*`);
    lines.push("");

    if (!block.options.length) {
      lines.push("Nenhuma opção encontrada para esse produto.");
      lines.push("");
      return;
    }

    const discountPercent = normalizeDiscountPercent(
      block.discountPercent
    );

    block.options.forEach((option, index) => {
      const unit = String(option.sell_unit || option.unit || "UN").toUpperCase();
      const originalPrice = roundMoney(Number(option.price || 0));
      const finalPrice = applyDiscount(originalPrice, discountPercent);

      lines.push(`${index + 1}º ${option.official_name}`);

      if (discountPercent > 0) {
        lines.push(
          `   Vend. por: ${unit} • Original: ${moneyBR(originalPrice)}`
        );
        lines.push(
          `   Desconto: ${String(discountPercent).replace(".", ",")}% • Final: ${moneyBR(finalPrice)}`
        );
      } else {
        lines.push(
          `   Vend. por: ${unit} • Preço: ${moneyBR(originalPrice)}`
        );
      }

      lines.push("");
    });

    lines.push("━━━━━━━━━━━━━━━━━━━━━━");
    lines.push("");
  });

  lines.push("Escolha uma opção para transformar em cotação.");

  return lines.join("\n");
}
function formatMixedQuote(params: {
  clientName?: string;
  optionBlocks: Array<{
    raw: string;
    options: any[];
    discountPercent?: number;
  }>;
  items: any[];
  total: number;
}) {
  const parts: string[] = [];

  if (params.optionBlocks.length) {
    parts.push(
      formatCheapestOptionsQuote({
        clientName: params.clientName,
        blocks: params.optionBlocks,
      })
    );
  }

  if (params.items.length) {
    parts.push(
      formatFinalQuote({
        clientName: params.optionBlocks.length ? undefined : params.clientName,
        items: params.items,
        total: params.total,
      })
    );
  }

  return parts.join("\n\n");
}

async function resolveCompanyId(incomingCompanyId: any) {
  if (isValidUuid(incomingCompanyId)) return String(incomingCompanyId);

  const company = await prisma.companies.findFirst({
    select: { id: true },
    orderBy: { created_at: "asc" },
  });

  return company?.id || null;
}

async function loadPriceRows(companyId: string) {
  // REGRA DE SEGURANÇA:
  // - quote_catalog_products (Excel) é apenas identidade do produto.
  // - quote_daily_prices (PDF do dia) é a única fonte oficial de preço.
  // - Se houver várias importações do PDF para o mesmo código, usa a mais recente.
  // - Se houver duplicidade no catálogo para o mesmo código, pega apenas um registro.
  return prisma.$queryRawUnsafe<PriceRow[]>(
    `
    with latest_prices as (
      select distinct on (qdp.company_id, qdp.code)
        qdp.*
      from quote_daily_prices qdp
      where qdp.company_id = $1::uuid
        and qdp.price is not null
      order by
        qdp.company_id,
        qdp.code,
        qdp.table_date desc nulls last,
        qdp.updated_at desc nulls last,
        qdp.created_at desc nulls last,
        qdp.id desc
    )
    select
      lp.*,
      row_to_json(qcp) as catalog_product
    from latest_prices lp
    left join lateral (
      select qcp.*
      from quote_catalog_products qcp
      where qcp.company_id = lp.company_id
        and qcp.code = lp.code
        and coalesce(qcp.active, true) = true
      order by
        qcp.updated_at desc nulls last,
        qcp.created_at desc nulls last,
        qcp.id desc
      limit 1
    ) qcp on true
    order by lp.code asc
    `,
    companyId
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const companyId = await resolveCompanyId(
      body.companyId || body.company_id || body.company?.id || body.company
    );

    if (!companyId) {
      return NextResponse.json(
        { success: false, error: "Nenhuma empresa encontrada." },
        { status: 400 }
      );
    }

    const rawText = String(
      body.rawText ||
        body.raw_text ||
        body.requestText ||
        body.text ||
        body.query ||
        body.orderText ||
        body.pedido ||
        body.message ||
        body.content ||
        ""
    ).trim();

    if (!rawText) {
      return NextResponse.json(
        { success: false, error: "Informe o pedido para cotar." },
        { status: 400 }
      );
    }

    const rows = await loadPriceRows(companyId);

    if (!rows.length) {
      return NextResponse.json(
        {
          success: false,
          error: "Nenhuma tabela de preço carregada. Suba o PDF do dia antes de cotar.",
        },
        { status: 400 }
      );
    }

    const tableDate = getTableDate(rows);

    if (body.searchOnly) {
      const options = searchRows(
        rows,
        rawText,
        Number(body.limit || 80),
        body.quantityUnit || body.unit || null
      );

      return NextResponse.json({
        success: true,
        mode: "search",
        options,
      });
    }

    if (Array.isArray(body.confirmedItems)) {
      const byCode = new Map(rows.map((row) => [getCode(row), row]));
      const byId = new Map(rows.map((row) => [String(firstValue(row.id, getCode(row))), row]));

      const items = body.confirmedItems
        .filter((item: any) => !item.skipped && (item.optionId || item.code))
        .map((item: any) => {
          const row =
            (item.optionId ? byId.get(String(item.optionId)) : null) ||
            byCode.get(String(item.code));
          const option = row ? toOption(row) : null;

          if (!option) {
            return null;
          }

          return buildFinalItem({
            raw: item.raw,
            code: item.code,
            option,
            quantity: Number(item.quantity || 1),
            quantityUnit: item.quantityUnit || option.sell_unit,
            discountPercent: Number(item.discountPercent || 0),
          });
        })
        .filter(Boolean);

      const total = roundMoney(
        items.reduce(
          (sum: number, item: any) => sum + Number(item.subtotal || 0),
          0
        )
      );
      const outputText = formatFinalQuote({
        clientName: body.clientName,
        items,
        total,
      });

      return NextResponse.json({
        success: true,
        mode: "final",
        outputText,
        tableDate,
        items,
        total,
        needsReview: false,
      });
    }

    const lines = rawText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const autoItems: any[] = [];
    const candidateGroups: any[] = [];
    const optionBlocks: Array<{
      raw: string;
      options: any[];
      discountPercent?: number;
    }> = [];

    lines.forEach((line, index) => {
      const parsed = parseLine(line);

      if (isCheapestOptionsRequest(line)) {
        const optionLimit = Math.max(
          1,
          Math.min(20, Math.floor(Number(parsed.quantity || 1)))
        );

        const options = searchRows(
          rows,
          parsed.searchText || line,
          optionLimit,
          parsed.quantityUnit
        );

        optionBlocks.push({
          raw: line,
          options,
          discountPercent: parsed.discountPercent,
        });

        return;
      }

      const options = searchRows(
        rows,
        parsed.searchText || line,
        20,
        parsed.quantityUnit
      );
      const canAutoCheapest = wantsCheapest(line) && options.length > 0;

      if (canAutoCheapest) {
        const selected = options[0];

        autoItems.push(
          buildFinalItem({
            raw: line,
            code: selected.code,
            option: selected,
            quantity: parsed.quantity,
            quantityUnit: defaultUnitForLine(parsed, selected),
            discountPercent: parsed.discountPercent,
          })
        );

        return;
      }

      candidateGroups.push({
        index,
        raw: line,
        parsed,
        quantity: parsed.quantity,
        quantityUnit: parsed.quantityUnit,
        discountPercent: parsed.discountPercent,
        optionCount: options.length,
        discoveryMode: false,
        searchText: parsed.searchText || line,
        selectedCode: options[0]?.code || null,
        selectedOptionId: options[0]?.id || null,
        skipped: false,
        options,
      });
    });

    if (candidateGroups.length === 0) {
      const total = roundMoney(
        autoItems.reduce(
          (sum: number, item: any) => sum + Number(item.subtotal || 0),
          0
        )
      );
      const outputText = formatMixedQuote({
        clientName: body.clientName,
        optionBlocks,
        items: autoItems,
        total,
      });

      return NextResponse.json({
        success: true,
        mode: "final",
        tableDate,
        outputText,
        items: autoItems,
        optionBlocks,
        total,
        needsReview: false,
        totalCatalogProducts: rows.length,
      });
    }

    return NextResponse.json({
      success: true,
      mode: "confirm",
      tableDate,
      candidateGroups,
      autoItems,
      optionBlocks,
      totalCatalogProducts: rows.length,
    });
  } catch (error: any) {
    console.error("QUOTE_GENERATE_ERROR", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Erro ao gerar cotação.",
      },
      { status: 500 }
    );
  }
}
