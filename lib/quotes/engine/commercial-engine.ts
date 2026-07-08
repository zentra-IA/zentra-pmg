import { calculateConfidenceV2 } from "./confidence-engine";
import { convertQuantity } from "./conversion-engine";
import { calculatePrice } from "./pricing-engine";
import { searchProductsWithLearning } from "./search-engine";
import { CatalogProduct, QuoteInputLine, ResolvedQuoteItem } from "./types";

export async function resolveQuoteItem(
  companyId: string,
  input: QuoteInputLine,
  catalog: CatalogProduct[]
): Promise<ResolvedQuoteItem> {
  const suggestions = await searchProductsWithLearning(
    companyId,
    input,
    catalog,
    20
  );

  const confidenceResult = calculateConfidenceV2(suggestions);
  const confidence = confidenceResult.confidence;

  const best = suggestions[0];
  const selected =
    best && confidence >= 90 && best.product.price
      ? best.product
      : undefined;

  const conversion = convertQuantity(input, selected);

  const pricing = calculatePrice({
    product: selected,
    quantity: conversion.quantity,
    convertedQuantity: conversion.convertedQuantity,
    discount: input.discount,
  });

  const needsReview =
    !selected ||
    !pricing.unitPrice ||
    confidence < 90 ||
    conversion.needsReview;

  return {
    input,
    selected,
    suggestions,
    confidence,
    quantity: conversion.quantity,
    unit: conversion.unit,
    convertedQuantity: conversion.convertedQuantity,
    convertedUnit: conversion.convertedUnit,
    unitPrice: pricing.unitPrice,
    subtotal: pricing.subtotal,
    needsReview,
    message: needsReview
      ? "Confirme o produto antes de gerar a cotação."
      : "Produto encontrado e calculado.",
  };
}