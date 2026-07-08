import { CatalogProduct, QuoteInputLine } from "./types";

export type ConversionResult = {
  quantity: number;
  unit: string;
  convertedQuantity?: number;
  convertedUnit?: string;
  needsReview: boolean;
  message?: string;
};

export function convertQuantity(
  input: QuoteInputLine,
  product?: CatalogProduct
): ConversionResult {
  const quantity = input.quantity || 1;
  const unit = input.unit || "UN";

  if (!product) {
    return {
      quantity,
      unit,
      needsReview: true,
      message: "Produto não selecionado para conversão.",
    };
  }

  const normalizedUnit = unit.toLowerCase();

  if (normalizedUnit === "kg") {
    if (product.pesoPacote) {
      return {
        quantity,
        unit,
        convertedQuantity: quantity / product.pesoPacote,
        convertedUnit: "PCT",
        needsReview: false,
      };
    }

    if (product.pesoCaixa) {
      return {
        quantity,
        unit,
        convertedQuantity: quantity / product.pesoCaixa,
        convertedUnit: "CX",
        needsReview: false,
      };
    }

    if (product.pesoPeca) {
      return {
        quantity,
        unit,
        convertedQuantity: quantity / product.pesoPeca,
        convertedUnit: "PÇ",
        needsReview: false,
      };
    }

    return {
      quantity,
      unit,
      needsReview: true,
      message: "Produto vendido por KG, mas sem regra de conversão configurada.",
    };
  }

  return {
    quantity,
    unit,
    convertedQuantity: quantity,
    convertedUnit: unit.toUpperCase(),
    needsReview: false,
  };
}