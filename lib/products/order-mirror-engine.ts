import { convertToBaseQuantity } from "./commercial-units";
import { validateOrderLineMath } from "./order-line-validator";
import { resolveCommercialProduct } from "./product-commercial-resolver";
import { tokenCoverage, tokenJaccard } from "./text-normalizer";

export type RawCommercialItem = {
  code?: string | null;
  name?: string | null;
  original_name?: string | null;
  quantity?: number | string | null;
  unit?: string | null;
  unit_price?: number | string | null;
  discount?: number | string | null;
  total?: number | string | null;
};

function numberValue(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = String(value || "")
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function normalizeItems(params: {
  companyId: string;
  source: "typed" | "mirror";
  items: RawCommercialItem[];
}) {
  const normalized = [];

  for (const [index, item] of params.items.entries()) {
    const rawName = String(item.original_name || item.name || "").trim();
    const resolution = await resolveCommercialProduct({
      companyId: params.companyId,
      rawCode: item.code,
      rawName,
    });

    const productName = resolution.product?.official_name || rawName || "Produto não identificado";
    const catalogUnit = resolution.product?.default_sell_unit || item.unit || null;

    const converted = convertToBaseQuantity({
      quantity: numberValue(item.quantity),
      inputUnit: item.unit,
      productName,
      catalogUnit,
      source: params.source,
    });

    const math =
      params.source === "mirror"
        ? validateOrderLineMath({
            quantity: item.quantity,
            unitPrice: item.unit_price,
            discount: item.discount,
            total: item.total,
          })
        : { valid: true, expectedTotal: null, difference: null, reason: null };

    normalized.push({
      index,
      code: resolution.product?.code || item.code || null,
      productId: resolution.product?.id || null,
      productName,
      originalName: rawName,
      baseQuantity: converted.quantity,
      baseUnit: converted.unit,
      displayQuantity: converted.display,
      confidence: resolution.confidence,
      needsReview: resolution.needsReview || !resolution.matched || !math.valid,
      resolution,
      math,
      raw: item,
    });
  }

  return normalized;
}

function quantityStatus(typed: number, mirror: number, unit: string | null) {
  const difference = Math.round((typed - mirror) * 1000) / 1000;
  const abs = Math.abs(difference);

  if (unit === "KG" && abs <= 0.3) {
    return { status: abs <= 0.001 ? "OK" : "WARNING_LIGHT", difference };
  }

  return {
    status: abs <= 0.001 ? "OK" : "QUANTITY_DIVERGENT",
    difference,
  };
}


function reviewPairScore(a: string, b: string) {
  return tokenCoverage(a, b) * 0.7 + tokenJaccard(a, b) * 0.3;
}

export async function compareOrderMirror(params: {
  companyId: string;
  typedItems: RawCommercialItem[];
  mirrorItems: RawCommercialItem[];
}) {
  const typed = await normalizeItems({
    companyId: params.companyId,
    source: "typed",
    items: params.typedItems,
  });

  const mirror = await normalizeItems({
    companyId: params.companyId,
    source: "mirror",
    items: params.mirrorItems,
  });

  const usedMirrorIndexes = new Set<number>();
  const checklist: any[] = [];
  const okItems: any[] = [];
  const quantityDivergences: any[] = [];
  const missingInMirror: any[] = [];
  const extraInMirror: any[] = [];
  const reviewItems: any[] = [];

  for (const typedItem of typed) {
    let mirrorItem =
      typedItem.productId
        ? mirror.find(
            (item) =>
              !usedMirrorIndexes.has(item.index) &&
              item.productId === typedItem.productId
          )
        : null;

    if (!mirrorItem && typedItem.code) {
      mirrorItem = mirror.find(
        (item) =>
          !usedMirrorIndexes.has(item.index) &&
          item.code &&
          item.code === typedItem.code &&
          !item.needsReview &&
          !typedItem.needsReview
      );
    }

    if (!mirrorItem) {
      const candidates = mirror
        .filter((item) => !usedMirrorIndexes.has(item.index))
        .map((item) => ({
          item,
          score: reviewPairScore(
            typedItem.originalName || typedItem.productName,
            item.originalName || item.productName
          ),
        }))
        .sort((a, b) => b.score - a.score);

      if (candidates[0]?.score >= 0.58) {
        mirrorItem = candidates[0].item;
      }
    }

    if (!mirrorItem || typedItem.needsReview) {
      if (mirrorItem) {
        usedMirrorIndexes.add(mirrorItem.index);
      }
      const row = {
        product: typedItem.productName,
        productName: typedItem.productName,
        quantity: typedItem.displayQuantity,
        typedQuantity: typedItem.displayQuantity,
        mirrorQuantity: mirrorItem?.displayQuantity || "-",
        status: typedItem.needsReview ? "REVIEW" : "MISSING_IN_MIRROR",
        message: typedItem.needsReview
          ? "Produto digitado não foi identificado com segurança."
          : "Produto digitado não foi encontrado no espelho.",
      };

      checklist.push(row);
      (typedItem.needsReview ? reviewItems : missingInMirror).push(row);
      continue;
    }

    usedMirrorIndexes.add(mirrorItem.index);

    if (mirrorItem.needsReview) {
      const row = {
        product: mirrorItem.productName,
        productName: mirrorItem.productName,
        quantity: mirrorItem.displayQuantity,
        typedQuantity: typedItem.displayQuantity,
        mirrorQuantity: mirrorItem.displayQuantity,
        status: "REVIEW",
        message: mirrorItem.math.valid
          ? "Produto do espelho exige revisão."
          : mirrorItem.math.reason,
      };
      checklist.push(row);
      reviewItems.push(row);
      continue;
    }

    const result = quantityStatus(
      typedItem.baseQuantity,
      mirrorItem.baseQuantity,
      mirrorItem.baseUnit || typedItem.baseUnit
    );

    const row = {
      product: mirrorItem.productName,
      productName: mirrorItem.productName,
      quantity: mirrorItem.displayQuantity,
      typedQuantity: typedItem.displayQuantity,
      mirrorQuantity: mirrorItem.displayQuantity,
      unit: mirrorItem.baseUnit || typedItem.baseUnit,
      difference: result.difference,
      status: result.status,
      message:
        result.status === "OK"
          ? "OK"
          : result.status === "WARNING_LIGHT"
            ? "Diferença pequena em KG. Revisar."
            : "Quantidade divergente.",
    };

    checklist.push(row);

    if (result.status === "OK") okItems.push(row);
    else quantityDivergences.push(row);
  }

  for (const mirrorItem of mirror) {
    if (usedMirrorIndexes.has(mirrorItem.index)) continue;

    const row = {
      product: mirrorItem.productName,
      productName: mirrorItem.productName,
      quantity: mirrorItem.displayQuantity,
      typedQuantity: "-",
      mirrorQuantity: mirrorItem.displayQuantity,
      status: mirrorItem.needsReview ? "REVIEW" : "EXTRA_IN_MIRROR",
      message: mirrorItem.needsReview
        ? mirrorItem.math.reason || "Produto do espelho exige revisão."
        : "Produto está no espelho, mas não foi encontrado no pedido digitado.",
    };

    checklist.push(row);
    (mirrorItem.needsReview ? reviewItems : extraInMirror).push(row);
  }

  const blocking =
    quantityDivergences.filter((item) => item.status !== "WARNING_LIGHT").length +
    missingInMirror.length +
    extraInMirror.length;

  const warnings =
    quantityDivergences.filter((item) => item.status === "WARNING_LIGHT").length +
    reviewItems.length;

  const checked = typed.length;
  const ok = okItems.length;
  const score = checked ? Math.round((ok / checked) * 100) : 0;

  const status = blocking > 0 ? "bloqueado" : warnings > 0 ? "atencao" : "aprovado";
  const summary =
    status === "aprovado"
      ? "Pedido conferido sem divergências."
      : status === "atencao"
        ? "Pedido exige revisão em alguns itens."
        : "Pedido possui divergências que bloqueiam a conferência.";

  const recommendation =
    status === "aprovado"
      ? "O pedido pode seguir para a próxima etapa."
      : reviewItems.length > 0
        ? "Revise os itens marcados antes de aprovar. O sistema não confirma produtos ambíguos."
        : "Corrija as quantidades ou os produtos divergentes e execute a conferência novamente.";

  return {
    engine: "pmg-commercial-resolver-v1.1",
    status,
    summary,
    recommendation,
    score,
    totals: {
      checked,
      ok,
      divergences: blocking + warnings,
      blockingDivergences: blocking,
      warnings,
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
    typedItems: typed,
    mirrorItems: mirror,
  };
}
