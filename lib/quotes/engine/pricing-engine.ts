import { CatalogProduct } from "./types";

export function calculatePrice(params: {
  product?: CatalogProduct;
  quantity: number;
  convertedQuantity?: number;
  discount?: number;
}) {
  const { product, quantity, convertedQuantity, discount = 0 } = params;

  if (!product?.price) {
    return {
      unitPrice: undefined,
      subtotal: undefined,
      needsReview: true,
      message: "Preço não encontrado na tabela do dia.",
    };
  }

  const finalQuantity = convertedQuantity || quantity;
  const subtotalRaw = product.price * finalQuantity;
  const subtotal = subtotalRaw - subtotalRaw * (discount / 100);

  return {
    unitPrice: product.price,
    subtotal,
    needsReview: false,
  };
}