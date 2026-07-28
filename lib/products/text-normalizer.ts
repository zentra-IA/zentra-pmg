const UNIT_WORDS = new Set([
  "kg","quilo","quilos","g","gr","grama","gramas","ml","l","lt","litro","litros",
  "un","und","unidade","unidades","cx","caixa","caixas","pct","pacote","pacotes",
  "fdo","fd","fardo","fardos","bd","balde","baldes","bis","bisnaga","bisnagas",
  "pc","pç","pca","peca","pecas","peça","peças"
]);

const STOP_WORDS = new Set([
  "de","da","do","das","dos","e","a","o","as","os","com","para","por"
]);

const NORMALIZATION_RULES: Array<[RegExp, string]> = [
  [/\bmussarelas?\b/g, "mucarela"],
  [/\bmuçarelas?\b/g, "mucarela"],
  [/\bmucarelas?\b/g, "mucarela"],
  [/\bmozarelas?\b/g, "mucarela"],
  [/\brequeijoes?\b/g, "requeijao"],
  [/\brequeijões?\b/g, "requeijao"],
  [/\bcalabresas?\b/g, "calabresa"],
  [/\bapresuntados?\b/g, "apresuntado"],
  [/\bpresuntos?\b/g, "presunto"],
  [/\bpepperi\b/g, "peperi"],
  [/\bpepery\b/g, "peperi"],
  [/\btiroles\b/g, "tirolez"],
  [/\bforneavel\b/g, "forneavel"],
];

export function normalizeCommercialText(value: unknown): string {
  let text = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9\s.,/%-]/g, " ");

  for (const [pattern, replacement] of NORMALIZATION_RULES) {
    text = text.replace(pattern, replacement);
  }

  return text.replace(/\s+/g, " ").trim();
}

export function commercialTokens(value: unknown, options?: {
  keepUnits?: boolean;
  keepNumbers?: boolean;
}): string[] {
  const keepUnits = options?.keepUnits ?? false;
  const keepNumbers = options?.keepNumbers ?? false;

  return normalizeCommercialText(value)
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => keepNumbers || !/^\d+(?:[.,]\d+)?$/.test(token))
    .filter((token) => keepUnits || !UNIT_WORDS.has(token))
    .filter((token) => !STOP_WORDS.has(token))
    .filter((token) => token.length >= 2);
}

export function normalizeProductQuery(value: unknown): string {
  return commercialTokens(value).join(" ");
}

export function tokenCoverage(query: unknown, target: unknown): number {
  const q = commercialTokens(query);
  const t = new Set(commercialTokens(target));

  if (!q.length || !t.size) return 0;

  const hits = q.filter((token) => t.has(token)).length;
  return hits / q.length;
}

export function tokenJaccard(a: unknown, b: unknown): number {
  const aSet = new Set(commercialTokens(a));
  const bSet = new Set(commercialTokens(b));

  if (!aSet.size || !bSet.size) return 0;

  let intersection = 0;
  for (const token of aSet) {
    if (bSet.has(token)) intersection += 1;
  }

  return intersection / new Set([...aSet, ...bSet]).size;
}

export function extractNumbers(value: unknown): number[] {
  const matches = normalizeCommercialText(value).match(/\d+(?:[.,]\d+)?/g) || [];
  return matches
    .map((item) => Number(item.replace(",", ".")))
    .filter(Number.isFinite);
}
