import { CatalogProduct, QuoteInputLine } from "./types";

export type ConversionResult = {
  quantity: number;
  unit: string;
  convertedQuantity?: number;
  convertedUnit?: string;
  needsReview: boolean;
  message?: string;
};

function normalizeUnit(value?: string | null) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isPieceUnit(unit: string) {
  return ["P", "PC", "PCS", "PÇ", "PÇS", "PECA", "PECAS"].includes(unit);
}

function isBoxUnit(unit: string) {
  return ["CX", "CAIXA", "CAIXAS"].includes(unit);
}

function isPackageUnit(unit: string) {
  return ["PCT", "PACOTE", "PACOTES"].includes(unit);
}

function isBundleUnit(unit: string) {
  return ["FD", "FDO", "FARDO", "FARDOS"].includes(unit);
}

function positiveNumber(value?: number | null) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function extractWeightFromText(...values: Array<string | undefined | null>) {
  const text = values
    .filter(Boolean)
    .join(" ")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, " ");

  // Prioriza KG explícito na descrição do produto.
  const kgMatch = text.match(/(\d+(?:[,.]\d+)?)\s*KG\b/);
  if (kgMatch) {
    const value = Number(kgMatch[1].replace(",", "."));
    if (Number.isFinite(value) && value > 0) return value;
  }

  // Fallback para gramas, caso algum produto venha em G.
  const gMatch = text.match(/(\d+(?:[,.]\d+)?)\s*G\b/);
  if (gMatch) {
    const value = Number(gMatch[1].replace(",", ".")) / 1000;
    if (Number.isFinite(value) && value > 0) return value;
  }

  return undefined;
}

function resolvePieceWeight(product: CatalogProduct) {
  return (
    positiveNumber(product.pesoPeca) ||
    positiveNumber(product.peso) ||
    extractWeightFromText(
      product.descricaoOriginal,
      product.produto,
      product.marca,
      product.embalagem
    )
  );
}

function resolvePackageWeight(product: CatalogProduct) {
  return (
    positiveNumber(product.pesoPacote) ||
    extractWeightFromText(product.descricaoOriginal, product.produto, product.embalagem)
  );
}


export function convertQuantity(
  input: QuoteInputLine,
  product?: CatalogProduct
): ConversionResult {
  const quantity = input.quantity || 1;
  const originalUnit = input.unit || "UN";
  const requestedUnit = normalizeUnit(originalUnit);

  if (!product) {
    return {
      quantity,
      unit: originalUnit,
      needsReview: true,
      message: "Produto não selecionado para conversão.",
    };
  }

  const soldBy = normalizeUnit(product.vendePor || "UN");

  const pieceWeight = resolvePieceWeight(product);
  const packageWeight = resolvePackageWeight(product);
  const boxWeight = positiveNumber(product.pesoCaixa);
  const piecesPerBox = positiveNumber(product.pecasCaixa);
  const packagesPerBox = positiveNumber(product.pacotesCaixa);

  /*
    REGRA CRÍTICA:
    Quando o cliente pede PEÇA e o produto é vendido por KG,
    a cobrança precisa ser feita pelo peso da peça.

    Exemplo:
    PROVOLONE 5 KG - Vend. por KG
    Pedido: 1 peça
    Cobrança: 5 KG x preço do KG

    Antes o sistema fazia 1 peça = 1 KG, o que gerava preço errado.
  */
  if (isPieceUnit(requestedUnit)) {
    if (soldBy === "KG") {
      if (pieceWeight) {
        return {
          quantity,
          unit: "PÇ",
          convertedQuantity: quantity * pieceWeight,
          convertedUnit: "KG",
          needsReview: false,
        };
      }

      return {
        quantity,
        unit: "PÇ",
        needsReview: true,
        message:
          "O cliente pediu peça, mas o peso da peça não foi encontrado no catálogo.",
      };
    }

    if (isPieceUnit(soldBy)) {
      return {
        quantity,
        unit: "PÇ",
        convertedQuantity: quantity,
        convertedUnit: "PÇ",
        needsReview: false,
      };
    }
  }

  /*
    Quando o cliente pede KG:
    - se vende por KG, não converte;
    - se vende por pacote/caixa/peça, converte proporcionalmente.
  */
  if (requestedUnit === "KG") {
    if (soldBy === "KG") {
      return {
        quantity,
        unit: "KG",
        convertedQuantity: quantity,
        convertedUnit: "KG",
        needsReview: false,
      };
    }

    if (isPackageUnit(soldBy) && packageWeight) {
      return {
        quantity,
        unit: "KG",
        convertedQuantity: quantity / packageWeight,
        convertedUnit: "PCT",
        needsReview: false,
      };
    }

    if (isBoxUnit(soldBy) && boxWeight) {
      return {
        quantity,
        unit: "KG",
        convertedQuantity: quantity / boxWeight,
        convertedUnit: "CX",
        needsReview: false,
      };
    }

    if (isPieceUnit(soldBy) && pieceWeight) {
      return {
        quantity,
        unit: "KG",
        convertedQuantity: quantity / pieceWeight,
        convertedUnit: "PÇ",
        needsReview: false,
      };
    }

    return {
      quantity,
      unit: "KG",
      needsReview: true,
      message: "Produto sem regra suficiente para converter KG.",
    };
  }

  /*
    Quando o cliente pede CAIXA:
    converte para a unidade oficial de venda do produto.
  */
  if (isBoxUnit(requestedUnit)) {
    if (isBoxUnit(soldBy)) {
      return {
        quantity,
        unit: "CX",
        convertedQuantity: quantity,
        convertedUnit: "CX",
        needsReview: false,
      };
    }

    if (soldBy === "KG") {
      if (boxWeight) {
        return {
          quantity,
          unit: "CX",
          convertedQuantity: quantity * boxWeight,
          convertedUnit: "KG",
          needsReview: false,
        };
      }

      if (piecesPerBox && pieceWeight) {
        return {
          quantity,
          unit: "CX",
          convertedQuantity: quantity * piecesPerBox * pieceWeight,
          convertedUnit: "KG",
          needsReview: false,
        };
      }
    }

    if (isPieceUnit(soldBy) && piecesPerBox) {
      return {
        quantity,
        unit: "CX",
        convertedQuantity: quantity * piecesPerBox,
        convertedUnit: "PÇ",
        needsReview: false,
      };
    }

    if (isPackageUnit(soldBy) && packagesPerBox) {
      return {
        quantity,
        unit: "CX",
        convertedQuantity: quantity * packagesPerBox,
        convertedUnit: "PCT",
        needsReview: false,
      };
    }

    return {
      quantity,
      unit: "CX",
      needsReview: true,
      message: "Produto sem regra suficiente para converter caixa.",
    };
  }

  if (isPackageUnit(requestedUnit)) {
    return {
      quantity,
      unit: "PCT",
      convertedQuantity: quantity,
      convertedUnit: "PCT",
      needsReview: false,
    };
  }

  if (isBundleUnit(requestedUnit)) {
    return {
      quantity,
      unit: "FD",
      convertedQuantity: quantity,
      convertedUnit: "FD",
      needsReview: false,
    };
  }

  return {
    quantity,
    unit: requestedUnit || originalUnit,
    convertedQuantity: quantity,
    convertedUnit: requestedUnit || originalUnit.toUpperCase(),
    needsReview: false,
  };
}
