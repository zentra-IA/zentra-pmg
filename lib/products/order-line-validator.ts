export type OrderLineValidation = {
  valid: boolean;
  expectedTotal: number | null;
  difference: number | null;
  reason: string | null;
};

function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  const normalized = String(value || "")
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Nos espelhos PMG usados pelo módulo de pedidos, a coluna Valor (R$)
 * já é o valor líquido usado no total da linha. A coluna Desconto é
 * informativa e NÃO deve ser subtraída novamente.
 */
export function validateOrderLineMath(params: {
  quantity?: unknown;
  unitPrice?: unknown;
  discount?: unknown;
  total?: unknown;
  tolerance?: number;
}): OrderLineValidation {
  const quantity = toNumber(params.quantity);
  const unitPrice = toNumber(params.unitPrice);
  const total = toNumber(params.total);
  const tolerance = params.tolerance ?? 0.05;

  if (!quantity || !unitPrice || !total) {
    return {
      valid: true,
      expectedTotal: null,
      difference: null,
      reason: null,
    };
  }

  const expectedTotal = roundMoney(quantity * unitPrice);
  const difference = roundMoney(Math.abs(expectedTotal - total));
  const valid = difference <= tolerance;

  return {
    valid,
    expectedTotal,
    difference,
    reason: valid
      ? null
      : `A linha não fecha: ${quantity} × ${unitPrice.toFixed(2)} = ${expectedTotal.toFixed(2)}, mas o total lido foi ${total.toFixed(2)}. Possível desalinhamento de OCR.`,
  };
}
