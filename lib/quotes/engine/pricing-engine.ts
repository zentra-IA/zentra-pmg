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

  /*
    Usa a quantidade convertida quando existir.

    Exemplo crítico:
    Produto vendido por KG
    Pedido: 1 peça de provolone
    Conversão: 5 KG
    Cálculo: 5 x preço do KG

    Não usar "convertedQuantity || quantity", porque isso pode ignorar
    valores convertidos válidos em casos específicos.
  */
  const finalQuantity =
    convertedQuantity !== undefined ? convertedQuantity : quantity;

  const subtotalRaw = product.price * finalQuantity;
  const subtotal = subtotalRaw - subtotalRaw * (discount / 100);

  return {
    unitPrice: product.price,
    subtotal,
    needsReview: false,
  };
}
