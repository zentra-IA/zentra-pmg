export type MirrorRowValidationStatus =
  | "VALID"
  | "REVIEW"
  | "INVALID_ROW";

export type MirrorRowValidation = {
  status: MirrorRowValidationStatus;
  arithmeticValid: boolean | null;
  arithmeticMode:
    | "quantity_x_unit_price"
    | "quantity_x_unit_price_minus_line_discount"
    | "quantity_x_unit_price_minus_unit_discount"
    | "insufficient_data"
    | "inconsistent";
  expectedTotals: number[];
  actualTotal: number | null;
  difference: number | null;
  needs_review: boolean;
  warnings: string[];
};

type RawMirrorRow = {
  row_index?: number | string | null;
  code?: string | null;
  name?: string | null;
  quantity?: number | string | null;
  unit_price?: number | string | null;
  discount?: number | string | null;
  total?: number | string | null;
  catalog_match?: Record<string, any> | null;
};

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  let text = String(value)
    .trim()
    .replace(/[R$\s]/gi, "");

  if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(text)) {
    text = text.replace(/\./g, "").replace(",", ".");
  } else if (text.includes(",") && text.includes(".")) {
    text = text.replace(/\./g, "").replace(",", ".");
  } else if (text.includes(",")) {
    text = text.replace(",", ".");
  }

  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function uniqueNumbers(values: number[]) {
  return Array.from(new Set(values.map(roundMoney)));
}

/**
 * O campo "Desconto" dos espelhos PMG varia conforme a origem do documento:
 * em alguns modelos é informativo, em outros é desconto da linha ou por unidade.
 * Por segurança aceitamos as três equações comerciais plausíveis e nunca
 * alteramos a quantidade lida.
 */
export function validateMirrorRowArithmetic(
  row: RawMirrorRow,
  tolerance = 0.05
): MirrorRowValidation {
  const quantity = toNumber(row.quantity);
  const unitPrice = toNumber(row.unit_price);
  const discount = toNumber(row.discount) ?? 0;
  const total = toNumber(row.total);

  const warnings: string[] = [];

  if (
    quantity === null ||
    unitPrice === null ||
    total === null ||
    quantity < 0 ||
    unitPrice < 0 ||
    total < 0
  ) {
    return {
      status: "REVIEW",
      arithmeticValid: null,
      arithmeticMode: "insufficient_data",
      expectedTotals: [],
      actualTotal: total,
      difference: null,
      needs_review: true,
      warnings: [
        "Não foi possível validar matematicamente a linha porque quantidade, valor ou total estão incompletos.",
      ],
    };
  }

  const expected = roundMoney(quantity * unitPrice);
  const difference = Math.abs(expected - roundMoney(total));
  const arithmeticValid = difference <= tolerance;
  const expectedTotals = [expected];

  if (!arithmeticValid) {
    warnings.push(
      `A conta da linha não fecha: ${quantity} × ${unitPrice} = ${expected}, mas o total lido foi ${total}. Possível deslocamento de coluna no OCR.`
    );
  }

  return {
    status: arithmeticValid ? "VALID" : "INVALID_ROW",
    arithmeticValid,
    arithmeticMode: arithmeticValid ? "quantity_x_unit_price" : "inconsistent",
    expectedTotals,
    actualTotal: roundMoney(total),
    difference: roundMoney(difference),
    needs_review: !arithmeticValid,
    warnings,
  };
}

export function applyMirrorRowSafety<T extends RawMirrorRow>(
  rows: T[] = []
): Array<T & {
  row_index: number;
  row_validation: MirrorRowValidation;
  catalog_match?: Record<string, any> | null;
}> {
  return rows.map((row, index) => {
    const rowValidation = validateMirrorRowArithmetic(row);
    const existingMatch = row.catalog_match || null;

    return {
      ...row,
      row_index: Number(row.row_index || index + 1),
      row_validation: rowValidation,
      catalog_match: existingMatch
        ? {
            ...existingMatch,
            needs_review:
              Boolean(existingMatch.needs_review) ||
              rowValidation.needs_review,
          }
        : existingMatch,
    };
  });
}

export function hasUnsafeMirrorRow(item: any) {
  return (
    item?.row_validation?.needs_review === true ||
    item?.row_validation?.status === "INVALID_ROW" ||
    item?.catalog_match?.code_name_conflict === true ||
    item?.catalog_match?.needs_review === true
  );
}
