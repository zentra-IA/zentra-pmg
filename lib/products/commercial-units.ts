import { normalizeCommercialText } from "./text-normalizer";

export type CommercialUnit =
  | "KG" | "G" | "L" | "ML"
  | "UN" | "PÇ" | "PCT" | "CX" | "FDO" | "BD" | "BIS"
  | null;

export function normalizeCommercialUnit(value: unknown): CommercialUnit {
  const unit = normalizeCommercialText(value).toUpperCase();

  if (!unit) return null;
  if (["KG", "QUILO", "QUILOS"].includes(unit)) return "KG";
  if (["G", "GR", "GRAMA", "GRAMAS"].includes(unit)) return "G";
  if (["L", "LT", "LITRO", "LITROS"].includes(unit)) return "L";
  if (unit === "ML") return "ML";
  if (["UN", "UND", "UNIDADE", "UNIDADES"].includes(unit)) return "UN";
  if (["PC", "PÇ", "PCA", "PECA", "PEÇA", "PECAS", "PEÇAS"].includes(unit)) return "PÇ";
  if (["PCT", "PACOTE", "PACOTES"].includes(unit)) return "PCT";
  if (["CX", "CAIXA", "CAIXAS"].includes(unit)) return "CX";
  if (["FD", "FDO", "FARDO", "FARDOS"].includes(unit)) return "FDO";
  if (["BD", "BALDE", "BALDES"].includes(unit)) return "BD";
  if (["BIS", "BISNAGA", "BISNAGAS"].includes(unit)) return "BIS";

  return null;
}

export function parsePackageInfo(name: unknown, fallbackUnit?: unknown) {
  const text = normalizeCommercialText(name).toUpperCase();

  const packageMatch = text.match(
    /\((CX|FD|FDO|PCT|BD|UN|KG|LT|BIS|PC|PÇ|PCA)\s+(\d+(?:[,.]\d+)?)\s*([A-ZÇ]{1,10})\)/
  );

  const weights = [...text.matchAll(/(\d+(?:[,.]\d+)?)\s*(KG|G|ML|L)\b/g)];

  const packageType = packageMatch
    ? normalizeCommercialUnit(packageMatch[1])
    : null;
  const unitsPerPackage = packageMatch
    ? Number(packageMatch[2].replace(",", "."))
    : null;
  const packageUnit = packageMatch
    ? normalizeCommercialUnit(packageMatch[3])
    : null;

  let unitWeightKg: number | null = null;

  if (weights.length) {
    const first = weights[0];
    const amount = Number(first[1].replace(",", "."));
    const unit = normalizeCommercialUnit(first[2]);

    if (unit === "KG") unitWeightKg = amount;
    if (unit === "G") unitWeightKg = amount / 1000;
  }

  let baseUnit = normalizeCommercialUnit(fallbackUnit);

  if (!baseUnit) {
    if (packageType === "FDO") baseUnit = "FDO";
    else if (packageType === "BD") baseUnit = "BD";
    else if (packageUnit) baseUnit = packageUnit;
  }

  const weightedPiece =
    baseUnit === "KG" &&
    packageUnit === "PÇ" &&
    Boolean(unitWeightKg);

  let packageBaseQuantity: number | null = null;

  if (unitsPerPackage && baseUnit) {
    if (weightedPiece && unitWeightKg) {
      packageBaseQuantity = unitsPerPackage * unitWeightKg;
    } else if (packageType === baseUnit) {
      packageBaseQuantity = 1;
    } else {
      packageBaseQuantity = unitsPerPackage;
    }
  }

  return {
    packageType,
    unitsPerPackage,
    packageUnit,
    unitWeightKg,
    baseUnit,
    weightedPiece,
    packageBaseQuantity,
  };
}

export function convertToBaseQuantity(params: {
  quantity: number;
  inputUnit?: unknown;
  productName: string;
  catalogUnit?: unknown;
  source: "typed" | "mirror";
}) {
  const quantity = Number(params.quantity || 0);
  const info = parsePackageInfo(params.productName, params.catalogUnit);
  const baseUnit = info.baseUnit || normalizeCommercialUnit(params.inputUnit);
  let inputUnit = normalizeCommercialUnit(params.inputUnit);

  // O espelho já traz a quantidade na unidade comercial oficial do SKU.
  if (params.source === "mirror") {
    return {
      quantity,
      unit: baseUnit,
      display: baseUnit ? `${quantity} ${baseUnit}` : String(quantity),
      assumed: false,
    };
  }

  // Sem unidade digitada: só inferimos depois do SKU estar resolvido.
  // Ex.: 5 muçarelas de 4 kg = 5 peças = 20 kg.
  if (!inputUnit) {
    inputUnit = info.weightedPiece ? "PÇ" : baseUnit;
  }

  if (!inputUnit || !baseUnit || inputUnit === baseUnit) {
    return {
      quantity,
      unit: baseUnit,
      display: baseUnit ? `${quantity} ${baseUnit}` : String(quantity),
      assumed: !normalizeCommercialUnit(params.inputUnit),
    };
  }

  if (inputUnit === "PÇ" && baseUnit === "KG" && info.unitWeightKg) {
    const converted = quantity * info.unitWeightKg;
    return {
      quantity: converted,
      unit: "KG" as const,
      display: `${quantity} PÇ = ${converted} KG`,
      assumed: !normalizeCommercialUnit(params.inputUnit),
    };
  }

  if (
    (inputUnit === "CX" || inputUnit === "FDO") &&
    info.packageBaseQuantity &&
    info.packageType !== inputUnit
  ) {
    const converted = quantity * info.packageBaseQuantity;
    return {
      quantity: converted,
      unit: baseUnit,
      display: `${quantity} ${inputUnit} = ${converted} ${baseUnit}`,
      assumed: false,
    };
  }

  if (inputUnit === "G" && baseUnit === "KG") {
    const converted = quantity / 1000;
    return {
      quantity: converted,
      unit: "KG" as const,
      display: `${quantity} G = ${converted} KG`,
      assumed: false,
    };
  }

  return {
    quantity,
    unit: baseUnit || inputUnit,
    display: `${quantity} ${inputUnit}`.trim(),
    assumed: false,
  };
}
