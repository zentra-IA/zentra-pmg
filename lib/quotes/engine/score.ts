import { tokenize } from "./tokenizer";
import { CatalogProduct, QuoteInputLine } from "./types";
import { normalizeText } from "./normalize";

export function scoreProduct(input: QuoteInputLine, product: CatalogProduct) {
  let score = 0;
  const reasons: string[] = [];

  const query = normalizeText(input.raw);
  const tokens = tokenize(query);

  const fields = {
    produto: product.produto,
    marca: product.marca,
    categoria: product.categoria,
    familia: product.familia,
    subtipo: product.subtipo,
    linha: product.linha,
    sabor: product.sabor,
    embalagem: product.embalagem,
    searchText: product.searchText,
  };

  const add = (points: number, reason: string) => {
    score += points;
    reasons.push(reason);
  };

  for (const token of tokens) {
    for (const [field, value] of Object.entries(fields)) {
      if (!value) continue;

      const normalizedValue = normalizeText(value);

      if (normalizedValue === token) add(30, `${field}: match exato ${token}`);
      else if (normalizedValue.split(" ").includes(token)) add(15, `${field}: token ${token}`);
    }

    if (product.aliases?.map(normalizeText).includes(token)) {
      add(25, `alias: ${token}`);
    }

    if (product.keywords?.map(normalizeText).includes(token)) {
      add(20, `keyword: ${token}`);
    }
  }

  if (input.product && normalizeText(product.produto) === normalizeText(input.product)) {
    add(80, "produto identificado");
  }

  if (input.brand && product.marca && normalizeText(product.marca) === normalizeText(input.brand)) {
    add(70, "marca identificada");
  }

  applyBusinessExclusions(query, product, add);

  return { score, reasons };
}

function applyBusinessExclusions(
  query: string,
  product: CatalogProduct,
  add: (points: number, reason: string) => void
) {
  const text = normalizeText([
    product.produto,
    product.descricaoOriginal,
    product.subtipo,
    product.linha,
    product.categoria,
  ].join(" "));

  if (query.includes("presunto")) {
    if (text.includes("parma")) add(-300, "presunto não deve sugerir parma");
    if (text.includes("apresuntado") && !query.includes("peperi")) {
      add(-200, "presunto não deve sugerir apresuntado");
    }
  }

  if (query.includes("apresuntado") && text.includes("presunto") && !text.includes("apresuntado")) {
    add(-250, "apresuntado não deve sugerir presunto comum");
  }

  if (query.includes("mucarela") && !query.includes("ralada")) {
    const blocked = ["ralada", "bufala", "bolinha", "cobertura", "mozzana", "topping"];
    if (blocked.some((b) => text.includes(b))) {
      add(-300, "muçarela tradicional exclui variações");
    }
  }
}