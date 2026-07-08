import { validateOrderItemsWithCatalog } from "@/lib/product-catalog";

export type PmgCommercialRawItem = {
  code?: string | null;
  name?: string | null;
  original_code?: string | null;
  original_name?: string | null;
  quantity?: number | string | null;
  unit?: string | null;
  unit_price?: number | string | null;
  discount?: number | string | null;
  total?: number | string | null;
  catalog_match?: any;
};

export type PmgBaseUnit = "KG" | "UN" | "BIS" | "PC" | "PCT" | "CX" | string;

export type PmgPackageInfo = {
  packageType: string | null;
  unitsPerBox: number | null;
  boxUnit: string | null;
  unitWeightKg: number | null;
  baseUnit: PmgBaseUnit | null;
  boxBaseQuantity: number | null;
};

export type ResolvedCommercialProduct = {
  code: string | null;
  productName: string;
  originalName: string | null;
  catalogUnit: string | null;
  confidence: number;
  needsReview: boolean;
  packageInfo: PmgPackageInfo;
  raw: any;
};

export type ConvertedCommercialQuantity = {
  quantity: number;
  unit: PmgBaseUnit | null;
  display: string;
  conversionText: string;
  assumedUnit: boolean;
  packageInfo: PmgPackageInfo;
};

type NormalizedCommercialItem = {
  key: string;
  code: string | null;
  productName: string;
  originalName: string | null;
  inputQuantity: number;
  inputUnit: string | null;
  baseQuantity: number;
  baseUnit: PmgBaseUnit | null;
  displayQuantity: string;
  conversionText: string;
  confidence: number;
  needsReview: boolean;
  assumedUnit: boolean;
  rawItems: any[];
};

const UNIT_ALIASES: Record<string, string> = {
  CX: "CX",
  CAIXA: "CX",
  CAIXAS: "CX",
  CXS: "CX",

  KG: "KG",
  KILO: "KG",
  KILOS: "KG",
  QUILO: "KG",
  QUILOS: "KG",

  G: "G",
  GR: "G",
  GRAMA: "G",
  GRAMAS: "G",

  PC: "PC",
  PÇ: "PC",
  PCA: "PC",
  PECA: "PC",
  PECAS: "PC",
  PEÇA: "PC",
  PEÇAS: "PC",

  UN: "UN",
  UND: "UN",
  UNIDADE: "UN",
  UNIDADES: "UN",

  BIS: "BIS",
  BISNAGA: "BIS",
  BISNAGAS: "BIS",
  BLS: "BIS",
  BISN: "BIS",

  PCT: "PCT",
  PACOTE: "PCT",
  PACOTES: "PCT",

  BD: "BD",
  BALDE: "BD",
  BALDES: "BD",

  FD: "FD",
  FDO: "FD",
  FARDO: "FD",
  FARDOS: "FD",

  LT: "LT",
  LATA: "LT",
  LATAS: "LT",

  VD: "VD",
  VIDRO: "VD",
  VIDROS: "VD",

  FR: "FR",
  FRASCO: "FR",
  FRASCOS: "FR",

  GL: "GL",
  GALAO: "GL",
  GALÃO: "GL",
  GALOES: "GL",
  GALÕES: "GL",
};

function stripAccents(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Normalização comercial para comparação e busca.
 * Mantém somente letras/números, remove acentos e reduz ruído de digitação.
 */
export function normalizeText(value: unknown) {
  return stripAccents(String(value || ""))
    .toLowerCase()
    .replace(/[“”"']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeKey(value: unknown) {
  return normalizeText(value).toUpperCase();
}

function normalizeUnit(value: unknown) {
  const key = normalizeKey(value);
  if (!key) return null;
  return UNIT_ALIASES[key] || key;
}

function toNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  const raw = String(value || "")
    .trim()
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");

  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function round3(value: number) {
  return Number((value || 0).toFixed(3));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
    maximumFractionDigits: 3,
  }).format(value);
}

/**
 * Lê a embalagem do nome oficial do catálogo PMG.
 *
 * Exemplos:
 * - REQUEIJÃO QUATÁ SEM AMIDO 1,5 KG (CX 12 BIS)
 *   1 CX = 12 BIS
 *
 * - CHANTILLY SPRAY POLENGHI 250 G (CX 12 UN)
 *   1 CX = 12 UN
 *
 * - MUÇARELA FRIZZO 4 KG (CX 6 PÇ), com unidade base KG
 *   1 CX = 6 PÇ x 4 KG = 24 KG
 */
export function parsePackageInfo(productName: string, catalogUnit?: string | null): PmgPackageInfo {
  const name = normalizeKey(productName);
  const catalogBaseUnit = normalizeUnit(catalogUnit);

  const packageMatch = name.match(
    /\((CX|FD|FDO|PCT|BD|BARR|BARRICA|UN|KG|LT|VD|FR|GL|BIS|BLS|PC|PÇ|PCA)\s+(\d+(?:[,.]\d+)?)\s*([A-ZÇ]{1,10})\)/i
  );

  const weightMatches = [...name.matchAll(/(\d+(?:[,.]\d+)?)\s*(KG|G|ML|L)\b/g)];

  const packageType = packageMatch ? normalizeUnit(packageMatch[1]) : null;
  const unitsPerBox = packageMatch ? toNumber(packageMatch[2]) : null;
  const boxUnit = packageMatch ? normalizeUnit(packageMatch[3]) : null;

  let unitWeightKg: number | null = null;

  if (weightMatches.length) {
    const lastWeight = weightMatches[weightMatches.length - 1];
    const amount = toNumber(lastWeight[1]);
    const unit = normalizeUnit(lastWeight[2]);

    if (unit === "KG") unitWeightKg = amount;
    if (unit === "G") unitWeightKg = amount / 1000;
  }

  // Conceito correto PMG:
  // O espelho usa a UNIDADE BASE do catálogo, não "caixa".
  // Se o catálogo/validador devolver CX ou não devolver unidade, inferimos a base pelo nome oficial:
  // - (CX 12 BIS) => base BIS
  // - (CX 12 UN)  => base UN
  // - (CX 6 PÇ) + produto 4 KG => base KG
  let baseUnit: PmgBaseUnit | null = catalogBaseUnit;

  if (!baseUnit || baseUnit === "CX") {
    if (packageType === "CX") {
      if ((boxUnit === "PC" || boxUnit === "PÇ") && unitWeightKg) {
        baseUnit = "KG";
      } else if (boxUnit) {
        baseUnit = boxUnit;
      }
    }
  }

  let boxBaseQuantity: number | null = null;

  if (packageType === "CX" && unitsPerBox) {
    if (baseUnit === "KG") {
      if (unitWeightKg && (!boxUnit || ["PC", "PÇ", "UN", "PCT", "BIS"].includes(boxUnit))) {
        boxBaseQuantity = unitsPerBox * unitWeightKg;
      } else {
        boxBaseQuantity = unitsPerBox;
      }
    } else {
      boxBaseQuantity = unitsPerBox;
    }
  }

  return {
    packageType,
    unitsPerBox,
    boxUnit,
    unitWeightKg,
    baseUnit,
    boxBaseQuantity: boxBaseQuantity ? round3(boxBaseQuantity) : null,
  };
}

/**
 * Resolve o produto no catálogo PMG usando o validador já existente.
 * Se a confiança vier baixa, a engine marca como revisão e não cria divergência falsa.
 */
export async function resolveCommercialProduct(params: {
  companyId: string;
  item: PmgCommercialRawItem;
}): Promise<ResolvedCommercialProduct | null> {
  const [validated] = await validateOrderItemsWithCatalog(params.companyId, [params.item]);

  if (!validated) return null;

  const productName = String(
    validated.name ||
      validated.original_name ||
      params.item.name ||
      params.item.original_name ||
      "Produto sem nome"
  );

  const confidence = Number(validated.catalog_match?.confidence ?? 100);
  const needsReview = Boolean(validated.catalog_match?.needs_review) || confidence < 90;

  return {
    code: validated.code || null,
    productName,
    originalName: validated.original_name || params.item.name || null,
    catalogUnit: validated.unit || params.item.unit || null,
    confidence,
    needsReview,
    packageInfo: parsePackageInfo(productName, validated.unit || params.item.unit),
    raw: validated,
  };
}

/**
 * Converte a quantidade digitada pelo vendedor para a unidade base do espelho.
 *
 * Regra PMG V2:
 * - Se o pedido digitado vier sem unidade, quantidade simples normalmente significa CAIXA.
 * - Ex: "1 requeijão quatá" => 1 CX => 12 BIS.
 * - Ex: "2 muçarela frizzo" => 2 CX => 48 KG.
 * - Se o vendedor informar KG, BIS, UN etc., respeitamos a unidade informada.
 */
export function convertTypedQuantityToBase(params: {
  productName: string;
  catalogUnit?: string | null;
  quantity: number | string | null | undefined;
  inputUnit?: string | null;
  source?: "typed" | "mirror";
}) {
  const quantity = toNumber(params.quantity);
  const explicitInputUnit = normalizeUnit(params.inputUnit);
  const info = parsePackageInfo(params.productName, params.catalogUnit);
  const baseUnit = info.baseUnit || explicitInputUnit || null;

  const shouldAssumeBox =
    params.source !== "mirror" &&
    !explicitInputUnit &&
    info.packageType === "CX" &&
    Boolean(info.boxBaseQuantity);

  // Regra comercial principal:
  // No pedido digitado, "1 requeijão quatá" normalmente significa "1 caixa",
  // porque o cliente/vendedor fala em caixa. O espelho, porém, vem em unidade base.
  const inputUnit = shouldAssumeBox ? "CX" : explicitInputUnit;
  const assumedUnit = shouldAssumeBox;

  // Caixa precisa ser convertida ANTES de qualquer retorno direto.
  // Ex: 1 CX de (CX 12 BIS) => 12 BIS.
  // Ex: 2 CX de (CX 6 PÇ) 4 KG => 48 KG.
  if (inputUnit === "CX" && info.boxBaseQuantity && baseUnit && baseUnit !== "CX") {
    const converted = round3(quantity * info.boxBaseQuantity);

    return {
      quantity: converted,
      unit: baseUnit,
      display: `${formatNumber(quantity)} caixa${quantity === 1 ? "" : "s"} = ${formatNumber(converted)} ${baseUnit}`,
      conversionText: `${formatNumber(quantity)} CX × ${formatNumber(info.boxBaseQuantity)} ${baseUnit} = ${formatNumber(converted)} ${baseUnit}`,
      assumedUnit,
      packageInfo: info,
    } satisfies ConvertedCommercialQuantity;
  }

  if (!inputUnit || !baseUnit || inputUnit === baseUnit) {
    return {
      quantity: round3(quantity),
      unit: baseUnit,
      display: baseUnit ? `${formatNumber(quantity)} ${baseUnit}` : formatNumber(quantity),
      conversionText: baseUnit ? `${formatNumber(quantity)} ${baseUnit}` : formatNumber(quantity),
      assumedUnit,
      packageInfo: info,
    } satisfies ConvertedCommercialQuantity;
  }

  if ((inputUnit === "PC" || inputUnit === "PÇ" || inputUnit === "UN") && baseUnit === "KG" && info.unitWeightKg) {
    const converted = round3(quantity * info.unitWeightKg);

    return {
      quantity: converted,
      unit: baseUnit,
      display: `${formatNumber(quantity)} ${inputUnit} = ${formatNumber(converted)} KG`,
      conversionText: `${formatNumber(quantity)} ${inputUnit} × ${formatNumber(info.unitWeightKg)} KG = ${formatNumber(converted)} KG`,
      assumedUnit,
      packageInfo: info,
    } satisfies ConvertedCommercialQuantity;
  }

  if (inputUnit === "G" && baseUnit === "KG") {
    const converted = round3(quantity / 1000);

    return {
      quantity: converted,
      unit: "KG",
      display: `${formatNumber(quantity)} G = ${formatNumber(converted)} KG`,
      conversionText: `${formatNumber(quantity)} G = ${formatNumber(converted)} KG`,
      assumedUnit,
      packageInfo: info,
    } satisfies ConvertedCommercialQuantity;
  }

  return {
    quantity: round3(quantity),
    unit: baseUnit,
    display: baseUnit ? `${formatNumber(quantity)} ${baseUnit}` : formatNumber(quantity),
    conversionText: `Sem conversão segura: ${formatNumber(quantity)} ${inputUnit} comparado em ${baseUnit || "unidade desconhecida"}`,
    assumedUnit,
    packageInfo: info,
  } satisfies ConvertedCommercialQuantity;
}

function buildKey(item: NormalizedCommercialItem) {
  const code = String(item.code || "").trim();
  if (code) return `code:${code}`;
  return `name:${normalizeText(item.productName)}`;
}

function publicItem(item: NormalizedCommercialItem) {
  return {
    product: item.productName,
    productName: item.productName,
    quantity: item.baseQuantity,
    unit: item.baseUnit,
    displayQuantity: item.displayQuantity,
    originalQuantity: item.inputQuantity,
    originalUnit: item.inputUnit,
    conversionText: item.conversionText,
    confidence: item.confidence,
    needsReview: item.needsReview,
  };
}


async function validateOneItemWithCatalogConflictGuard(params: {
  companyId: string;
  rawItem: PmgCommercialRawItem;
  firstValidation?: any;
}) {
  const rawName = String(
    params.rawItem.original_name ||
      params.rawItem.name ||
      params.firstValidation?.original_name ||
      ""
  ).trim();

  let validated = params.firstValidation;

  if (!validated) {
    const [single] = await validateOrderItemsWithCatalog(params.companyId, [params.rawItem]);
    validated = single;
  }

  if (!validated) return null;

  const validatedName = String(
    validated.name ||
      validated.original_name ||
      params.rawItem.name ||
      ""
  ).trim();

  const rawHasUsefulName = productTokens(rawName).length >= 1;
  const scoreAgainstRaw = rawHasUsefulName ? nameSimilarity(rawName, validatedName) : 1;

  /**
   * Proteção crítica para espelho PMG:
   *
   * Às vezes a IA lê o NOME correto, mas erra 1 dígito do código.
   * Exemplo real:
   * - Código lido: 3935
   * - Nome lido: CHANTILLY SPRAY POLENGHI 250 G (CX 12 UN)
   * - Catálogo pelo código 3935: MUÇARELA ALTO DO VALE
   *
   * Se aceitarmos cegamente o código, o sistema troca o produto.
   * Então, quando nome OCR e produto do catálogo conflitam muito,
   * revalidamos SEM código e deixamos o catálogo resolver pelo nome.
   */
  if (rawHasUsefulName && scoreAgainstRaw < 0.35) {
    const nameOnlyItem: PmgCommercialRawItem = {
      ...params.rawItem,
      code: null,
      original_code: null,
      name: rawName,
      original_name: rawName,
    };

    const [nameValidated] = await validateOrderItemsWithCatalog(params.companyId, [nameOnlyItem]);

    if (nameValidated) {
      const nameValidatedName = String(
        nameValidated.name ||
          nameValidated.original_name ||
          rawName
      ).trim();

      const nameScore = nameSimilarity(rawName, nameValidatedName);

      if (nameScore >= 0.5 && nameScore > scoreAgainstRaw + 0.2) {
        return {
          ...nameValidated,
          original_name: rawName,
          catalog_match: {
            ...(nameValidated.catalog_match || {}),
            confidence: Math.max(Number(nameValidated.catalog_match?.confidence ?? 0), Math.round(nameScore * 100)),
            corrected_by: "name_over_code_conflict",
            code_name_conflict: true,
            original_code_read: params.rawItem.code || params.rawItem.original_code || null,
          },
        };
      }
    }

    return {
      ...validated,
      original_name: rawName || validated.original_name,
      catalog_match: {
        ...(validated.catalog_match || {}),
        confidence: Math.min(Number(validated.catalog_match?.confidence ?? 100), Math.round(scoreAgainstRaw * 100)),
        needs_review: true,
        code_name_conflict: true,
        reason: "Código lido e nome OCR apontam para produtos diferentes.",
      },
    };
  }

  return validated;
}


async function normalizeCommercialItems(params: {
  companyId: string;
  items: PmgCommercialRawItem[];
  source: "typed" | "mirror";
}) {
  const firstPass = await validateOrderItemsWithCatalog(params.companyId, params.items);
  const merged = new Map<string, NormalizedCommercialItem>();

  for (const [index, rawItem] of (params.items || []).entries()) {
    const firstValidation = firstPass?.[index];
    const item = await validateOneItemWithCatalogConflictGuard({
      companyId: params.companyId,
      rawItem,
      firstValidation,
    });

    if (!item) continue;

    const rawName = String(rawItem.original_name || rawItem.name || "").trim();
    const productName = String(item.name || item.original_name || rawName || "Produto sem nome");
    const quantity = toNumber(item.quantity ?? rawItem.quantity);

    // Importante:
    // - No pedido digitado, a unidade deve vir do texto original do vendedor.
    //   Se usarmos item.unit depois da validação, podemos pegar a unidade base do catálogo
    //   e perder a regra comercial "1 produto = 1 caixa".
    // - No espelho, a unidade já representa a unidade base lida/salva pelo OCR/catálogo.
    const inputUnit =
      params.source === "mirror"
        ? normalizeUnit(item.unit ?? rawItem.unit)
        : normalizeUnit(rawItem.unit);

    const catalogUnit = normalizeUnit(item.unit) || normalizeUnit(rawItem.unit);

    const converted = convertTypedQuantityToBase({
      productName,
      catalogUnit,
      quantity,
      inputUnit,
      source: params.source,
    });

    const confidence = Number(item.catalog_match?.confidence ?? 100);
    const needsReview = Boolean(item.catalog_match?.needs_review) || confidence < 90;

    const normalized: NormalizedCommercialItem = {
      key: "",
      code: item.code || null,
      productName,
      originalName: rawName || item.original_name || null,
      inputQuantity: quantity,
      inputUnit,
      baseQuantity: converted.quantity,
      baseUnit: converted.unit,
      displayQuantity: converted.display,
      conversionText: converted.conversionText,
      confidence,
      needsReview,
      assumedUnit: converted.assumedUnit,
      rawItems: [item],
    };

    normalized.key = buildKey(normalized);

    if (normalized.key === "name:") continue;

    const current = merged.get(normalized.key);

    if (current) {
      current.inputQuantity = round3(current.inputQuantity + normalized.inputQuantity);
      current.baseQuantity = round3(current.baseQuantity + normalized.baseQuantity);
      current.displayQuantity = `${formatNumber(current.baseQuantity)} ${current.baseUnit || ""}`.trim();
      current.rawItems.push(item);
      current.needsReview = current.needsReview || normalized.needsReview;
      current.confidence = Math.min(current.confidence, normalized.confidence);
    } else {
      merged.set(normalized.key, normalized);
    }
  }

  return Array.from(merged.values());
}

function compareQuantity(params: {
  typedQuantity: number;
  mirrorQuantity: number;
  unit: string | null;
}) {
  const difference = round3(params.typedQuantity - params.mirrorQuantity);
  const abs = Math.abs(difference);
  const unit = normalizeUnit(params.unit);

  if (unit === "KG") {
    if (abs <= 0.001) return { status: "OK" as const, difference };
    if (abs <= 0.3) return { status: "WARNING_LIGHT" as const, difference };
    return { status: "QUANTITY_DIVERGENT" as const, difference };
  }

  if (abs <= 0.001) return { status: "OK" as const, difference };
  return { status: "QUANTITY_DIVERGENT" as const, difference };
}


function productTokens(value: string) {
  const cleaned = normalizeText(value)
    .replace(/\b\d+(?:[,.]\d+)?\b/g, " ")
    .replace(/\b(cx|caixa|caixas|kg|g|gr|ml|l|lt|un|und|bis|bisnaga|bisnagas|pc|pç|peca|peça|pecas|peças|pct|pacote|pacotes)\b/g, " ")
    .replace(/\bsem|com|de|da|do|das|dos|e|a|o|as|os\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned.split(" ").filter((token) => token.length >= 3);
}

function nameSimilarity(a: string, b: string) {
  const aTokens = productTokens(a);
  const bTokens = productTokens(b);

  if (!aTokens.length || !bTokens.length) return 0;

  const bSet = new Set(bTokens);
  const hits = aTokens.filter((token) => bSet.has(token)).length;

  // Como o pedido digitado costuma vir curto ("requeijão quatá"),
  // usamos o menor conjunto como referência para não penalizar o nome oficial completo do catálogo.
  return hits / Math.min(aTokens.length, bTokens.length);
}

function findBestMirrorMatch(
  typedItem: NormalizedCommercialItem,
  mirrorItems: NormalizedCommercialItem[],
  usedMirrorKeys: Set<string>
) {
  let best: NormalizedCommercialItem | null = null;
  let bestScore = 0;

  for (const mirrorItem of mirrorItems) {
    if (usedMirrorKeys.has(mirrorItem.key)) continue;

    if (typedItem.code && mirrorItem.code && typedItem.code === mirrorItem.code) {
      return { item: mirrorItem, score: 1 };
    }

    const score = nameSimilarity(typedItem.productName, mirrorItem.productName);

    if (score > bestScore) {
      best = mirrorItem;
      bestScore = score;
    }
  }

  // Evita falso positivo. Se não tiver confiança de nome, não força associação.
  if (best && bestScore >= 0.6) {
    return { item: best, score: bestScore };
  }

  return { item: null, score: bestScore };
}

/**
 * Comparador comercial V2.
 * Retorna um checklist limpo para tela e mantém arrays compatíveis com o comparador antigo.
 */
export async function compareTypedOrderWithOcr(params: {
  companyId: string;
  typedItems: PmgCommercialRawItem[];
  mirrorItems: PmgCommercialRawItem[];
}) {
  const typed = await normalizeCommercialItems({
    companyId: params.companyId,
    items: params.typedItems,
    source: "typed",
  });

  const mirror = await normalizeCommercialItems({
    companyId: params.companyId,
    items: params.mirrorItems,
    source: "mirror",
  });

  const checklist: any[] = [];
  const okItems: any[] = [];
  const quantityDivergences: any[] = [];
  const reviewItems: any[] = [];
  const missingInMirror: any[] = [];
  const extraInMirror: any[] = [];
  const usedMirrorKeys = new Set<string>();

  for (const typedItem of typed) {
    const match = findBestMirrorMatch(typedItem, mirror, usedMirrorKeys);
    const mirrorItem = match.item;

    if (typedItem.needsReview) {
      const review = {
        product: typedItem.productName,
        typedQuantity: typedItem.displayQuantity,
        mirrorQuantity: mirrorItem?.displayQuantity || "-",
        difference: null,
        unit: typedItem.baseUnit || mirrorItem?.baseUnit || null,
        status: "REVIEW",
        message: "Produto com baixa confiança de identificação. Revise antes de acusar divergência.",
      };

      if (mirrorItem) usedMirrorKeys.add(mirrorItem.key);
      checklist.push(review);
      reviewItems.push(review);
      continue;
    }

    if (!mirrorItem) {
      const missing = {
        product: typedItem.productName,
        typedQuantity: typedItem.displayQuantity,
        mirrorQuantity: "-",
        difference: null,
        unit: typedItem.baseUnit,
        status: "MISSING_IN_MIRROR",
        message: "Produto está no pedido digitado, mas não foi encontrado no espelho.",
      };

      checklist.push(missing);
      missingInMirror.push({
        ...publicItem(typedItem),
        message: missing.message,
      });
      continue;
    }

    usedMirrorKeys.add(mirrorItem.key);

    if (mirrorItem.needsReview) {
      const review = {
        product: typedItem.productName,
        typedQuantity: typedItem.displayQuantity,
        mirrorQuantity: mirrorItem.displayQuantity,
        difference: null,
        unit: typedItem.baseUnit || mirrorItem.baseUnit,
        status: "REVIEW",
        message: "Produto do espelho com baixa confiança de identificação. Revise antes de acusar divergência.",
      };

      checklist.push(review);
      reviewItems.push(review);
      continue;
    }

    const comparison = compareQuantity({
      typedQuantity: typedItem.baseQuantity,
      mirrorQuantity: mirrorItem.baseQuantity,
      unit: mirrorItem.baseUnit || typedItem.baseUnit,
    });

    const unit = mirrorItem.baseUnit || typedItem.baseUnit;
    const row = {
      product: mirrorItem.productName || typedItem.productName,
      typedQuantity: typedItem.displayQuantity,
      mirrorQuantity: `${formatNumber(mirrorItem.baseQuantity)} ${unit || ""}`.trim(),
      difference: comparison.difference,
      differenceText: `${formatNumber(Math.abs(comparison.difference))} ${unit || ""}`.trim(),
      unit,
      status: comparison.status,
      matchScore: match.score,
      message:
        comparison.status === "OK"
          ? "OK"
          : comparison.status === "WARNING_LIGHT"
            ? "Diferença pequena em KG. Conferir, mas não bloquear automaticamente."
            : "Quantidade divergente.",
    };

    checklist.push(row);

    if (comparison.status === "OK") {
      okItems.push({
        productName: row.product,
        quantity: mirrorItem.baseQuantity,
        unit,
        typedConversion: typedItem.conversionText,
        mirrorConversion: mirrorItem.conversionText,
      });
    } else {
      quantityDivergences.push({
        productName: row.product,
        typedQuantity: typedItem.baseQuantity,
        mirrorQuantity: mirrorItem.baseQuantity,
        difference: comparison.difference,
        unit,
        typedConversion: typedItem.conversionText,
        mirrorConversion: mirrorItem.conversionText,
        severity: comparison.status === "WARNING_LIGHT" ? "light" : "attention",
        message: row.message,
      });
    }
  }

  for (const mirrorItem of mirror) {
    if (!usedMirrorKeys.has(mirrorItem.key)) {
      const extra = {
        product: mirrorItem.productName,
        typedQuantity: "-",
        mirrorQuantity: mirrorItem.displayQuantity,
        difference: null,
        unit: mirrorItem.baseUnit,
        status: mirrorItem.needsReview ? "REVIEW" : "EXTRA_IN_MIRROR",
        message: mirrorItem.needsReview
          ? "Produto sobrando no espelho com baixa confiança. Revisar."
          : "Produto está no espelho, mas não foi encontrado no pedido digitado.",
      };

      checklist.push(extra);

      if (mirrorItem.needsReview) {
        reviewItems.push(extra);
      } else {
        extraInMirror.push({
          ...publicItem(mirrorItem),
          message: extra.message,
        });
      }
    }
  }

  const blockingDivergences =
    quantityDivergences.filter((item) => item.severity !== "light").length +
    missingInMirror.length +
    extraInMirror.length;

  const lightWarnings =
    quantityDivergences.filter((item) => item.severity === "light").length +
    reviewItems.length;

  const checked = typed.length;
  const ok = okItems.length;
  const score = checked > 0 ? Math.max(0, Math.round((ok / checked) * 100)) : 0;

  const status =
    blockingDivergences === 0 && lightWarnings === 0
      ? "aprovado"
      : blockingDivergences === 0
        ? "atencao"
        : "bloqueado";

  return {
    engine: "pmg-commercial-v2",
    status,
    score,
    summary:
      status === "aprovado"
        ? "Conferência aprovada. Todos os produtos e quantidades batem."
        : status === "atencao"
          ? "Conferência com avisos. Revise os itens marcados antes de finalizar."
          : "Divergências encontradas. Revise antes de enviar para evitar devolução, multa ou entrega incorreta.",
    recommendation:
      status === "aprovado"
        ? "Pode seguir com o pedido."
        : "Revise os produtos/quantidades destacados antes de finalizar.",
    totals: {
      checked,
      ok,
      divergences: blockingDivergences + lightWarnings,
      blockingDivergences,
      warnings: lightWarnings,
      missing: missingInMirror.length,
      extra: extraInMirror.length,
      review: reviewItems.length,
    },
    checklist,
    okItems,
    quantityDivergences,
    missingInMirror,
    extraInMirror,
    reviewItems,
    typedItems: typed.map(publicItem),
    mirrorItems: mirror.map(publicItem),
  };
}

// Alias de compatibilidade caso alguma rota antiga importe esse nome por engano.
export const compareTypedOrderAgainstMirror = compareTypedOrderWithOcr;
