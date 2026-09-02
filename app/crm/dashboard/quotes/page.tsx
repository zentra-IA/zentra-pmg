"use client";

import { useEffect, useMemo, useState } from "react";

type GeneratedQuote = {
  outputText: string;
  total: number;
  tableDate: string;
  items: any[];
  optionBlocks?: any[];
  unresolved?: any[];
};

type CandidateGroup = {
  index: number;
  raw: string;
  parsed: any;
  quantity: number;
  quantityUnit?: string | null;
  discountPercent: number;
  optionCount?: number;
  discoveryMode?: boolean;
  searchText?: string;
  selectedCode?: string | null;
  selectedOptionId?: string | null;
  skipped?: boolean;
  options: any[];
};

type Customer = {
  id: string;
  internal_code?: string | null;
  erp_code?: string | null;
  document?: string | null;
  legal_name: string;
  trade_name?: string | null;
  whatsapp?: string | null;
  city?: string | null;
  state?: string | null;
  segment?: string | null;
};


type SavedQuoteItem = {
  code?: string | null;
  name?: string | null;
  raw?: string | null;
  quantity?: number;
  unit?: string | null;
  billedQuantity?: number;
  tableUnit?: string | null;
  originalUnitPrice?: number;
  discountedUnitPrice?: number;
  unitPrice?: number;
  originalTableUnitPrice?: number;
  tableUnitPrice?: number;
  discountPercent?: number;
  discountAmountPerUnit?: number;
  totalDiscountAmount?: number;
  equivalentText?: string | null;
  subtotal?: number;
  total?: number;
  priceBreakdown?: any;
};

type SavedQuote = {
  id: string;
  quoteNumber?: string | null;
  createdAt?: string | null;
  customerId?: string | null;
  customerInternalCode?: string | null;
  customerName?: string | null;
  customerIdentified?: boolean;
  requestText?: string | null;
  outputText?: string | null;
  total?: number;
  totalDiscountAmount?: number;
  itemsWithDiscount?: number;
  tableDate?: string | null;
  priceDisplayMode?: string | null;
  itemCount?: number;
  items?: SavedQuoteItem[];
  metadata?: {
    showProductId?: boolean;
    [key: string]: any;
  } | null;
};

const unitOptions = [
  ["", "Usar padrão do produto"],
  ["kg", "KG"],
  ["peca", "Peça"],
  ["caixa", "Caixa"],
  ["pacote", "Pacote"],
  ["balde", "Balde"],
  ["bisnaga", "Bisnaga"],
  ["unidade", "Unidade"],
  ["fardo", "Fardo"],
  ["lata", "Lata"],
  ["vidro", "Vidro"],
  ["galao", "Galão"],
  ["barrica", "Barrica"],
  ["bag", "Bag"],
];

const displayModes = [
  {
    value: "client_clean",
    title: "Cliente final limpo",
    desc: "Produto, quantidade, valor e subtotal. Melhor para WhatsApp.",
  },
  {
    value: "unit_and_total",
    title: "Unitário + subtotal",
    desc: "Mostra valor unitário e subtotal por item.",
  },
  {
    value: "kg_unit_box",
    title: "KG + unidade + caixa",
    desc: "Detalha embalagem: caixa/fardo, unidades internas, peso e preço por KG.",
  },
  {
    value: "box_only",
    title: "Somente caixa",
    desc: "Ideal quando o cliente pediu por caixas.",
  },
  {
    value: "unit_only",
    title: "Somente unitário",
    desc: "Cotação curta com o menor volume de informação.",
  },
];

const DEFAULT_COMPANY_ID =
  process.env.NEXT_PUBLIC_DEFAULT_COMPANY_ID || "11111111-1111-4111-8111-111111111111";

function formatEngineQuoteText(data: any, clientName?: string, displayMode = "client_clean", showProductId = true) {
  const items = Array.isArray(data?.items) ? data.items : [];

  if (!items.length) {
    return "Nenhum item encontrado.";
  }

  const out: string[] = [];

  out.push("📋 *COTAÇÃO*");

  if (clientName) {
    out.push(`👤 Cliente: *${clientName}*`);
  }

  out.push("");

  items.forEach((item: any, index: number) => {
    const product =
      item?.productName ||
      item?.selected?.descricaoOriginal ||
      item?.selected?.descriptionOriginal ||
      item?.selected?.produto ||
      item?.selected?.product ||
      item?.option?.official_name ||
      item?.input?.raw ||
      `Item ${index + 1}`;

    const productCode = String(
      item?.code || item?.option?.code || item?.selected?.code || ""
    ).trim();

    const productIdSuffix =
      showProductId && productCode ? ` • ID ${productCode}` : "";

    const quantity = item?.convertedQuantity || item?.quantity || 1;

    const unit =
      (
        item?.convertedUnit ||
        item?.unit ||
        "UN"
      )
        .toString()
        .replace("PÇ", "peças")
        .replace("UN", "unidades")
        .replace("CX", "caixas")
        .replace("PCT", "pacotes")
        .replace("FD", "fardos")
        .replace("KG", "kg")
        .replace("BIS", "bisnagas")
        .replace("BD", "baldes");

    const unitPrice = Number(item?.unitPrice || 0);
    const subtotal = Number(item?.subtotal || 0);

    out.push("━━━━━━━━━━━━━━━━━━━━━━");

    out.push(`*${product}${productIdSuffix}*`);

    out.push("");

    out.push(`📦 Quantidade: ${quantity} ${unit}`);

    if (unitPrice > 0) {
      out.push(`💲 Valor unitário: ${moneyBR(unitPrice)}`);
    }

    if (subtotal > 0) {
      out.push(`💰 Subtotal: ${moneyBR(subtotal)}`);
    }

    if (
      displayMode === "kg_unit_box" &&
      item?.priceBreakdown?.available &&
      Array.isArray(item?.priceBreakdown?.lines) &&
      item.priceBreakdown.lines.length
    ) {
      out.push("");
      out.push("📊 *DETALHAMENTO COMERCIAL DA EMBALAGEM*");
      item.priceBreakdown.lines.forEach((line: string) => out.push(line));
    }

    if (item?.needsReview) {
      out.push("⚠️ Confirmar produto");
    }

    out.push("");
  });

  out.push("━━━━━━━━━━━━━━━━━━━━━━");
  out.push("");
  out.push(`💵 *TOTAL DA COTAÇÃO*`);
  out.push(`*${moneyBR(data?.total || 0)}*`);

  if (data?.needsReview) {
    out.push("");
    out.push(
      "⚠️ Existem itens aguardando confirmação antes do envio."
    );
  }

  return out.join("\n");
}


function normalizeQuoteText(input: any): string {
  return String(input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ç/g, "c")
    .replace(/Ç/g, "C")
    .toLowerCase()
    .replace(/[^\w\s%.,/x-]/g, " ")
    .replace(/\bmussarela\b/g, "mucarela")
    .replace(/\bmuçarela\b/g, "mucarela")
    .replace(/\bmozarela\b/g, "mucarela")
    .replace(/\bmozzarella\b/g, "mucarela")
    .replace(/\bpepperi\b/g, "peperi")
    .replace(/\bpepery\b/g, "peperi")
    .replace(/\bperir\b/g, "peperi")
    .replace(/\s+/g, " ")
    .trim();
}

type QuoteSearchScope =
  | "all"
  | "id"
  | "customer"
  | "product"
  | "code"
  | "quote"
  | "phone"
  | "document";

function parseQuoteSearch(raw: string): {
  scope: QuoteSearchScope;
  value: string;
} {
  const value = String(raw || "").trim();

  const match = value.match(
    /^(id|cliente|produto|codigo|código|cotacao|cotação|telefone|whatsapp|cnpj|cpf)\s*[:#-]?\s+(.+)$/i
  );

  if (!match) {
    return {
      scope: "all",
      value,
    };
  }

  const key = normalizeQuoteText(match[1]);

  const scopeMap: Record<string, QuoteSearchScope> = {
    id: "id",
    cliente: "customer",
    produto: "product",
    codigo: "code",
    cotacao: "quote",
    telefone: "phone",
    whatsapp: "phone",
    cnpj: "document",
    cpf: "document",
  };

  return {
    scope: scopeMap[key] || "all",
    value: match[2].trim(),
  };
}

function quoteSearchMatches(
  query: string,
  fields: Array<any>
): boolean {
  const rawQuery = String(query || "").trim();

  if (!rawQuery) return true;

  const normalizedQuery = normalizeQuoteText(rawQuery);
  const normalizedHaystack = normalizeQuoteText(
    fields.filter(Boolean).join(" ")
  );

  const tokens = normalizedQuery
    .split(/\s+/)
    .filter(Boolean);

  const haystackDigits = fields
    .filter(Boolean)
    .map((value) =>
      String(value).replace(/\D/g, "")
    )
    .filter(Boolean)
    .join(" ");

  return tokens.every((token) => {
    if (normalizedHaystack.includes(token)) {
      return true;
    }

    const tokenDigits = token.replace(/\D/g, "");

    return (
      tokenDigits.length >= 3 &&
      haystackDigits.includes(tokenDigits)
    );
  });
}

function cleanSearchText(raw: string): string {
  let q = normalizeQuoteText(raw);
  q = q.replace(/desconto\s*(?:de)?\s*\d+(?:[,.]\d+)?\s*%?/g, " ");
  q = q.replace(/\b(mais barato|mais barata|mais baratos|mais baratas|mais vendido|mais vendida|mais vendidos|mais vendidas|menor preco|menor preço)\b/g, " ");
  q = q.replace(/^\s*\d+(?:[,.]\d+)?\s*/, "");
  q = q.replace(/^(kg|kilo|kilos|quilo|quilos|peca|pecas|pc|pç|bisnaga|bisnagas|bis|caixa|caixas|cx|pacote|pacotes|pct|balde|baldes|bd|unidade|unidades|un|fardo|fardos|fd|lata|latas|lt|vidro|vidros|vd|galao|gl)\s+/, "");
  return q.replace(/\s+/g, " ").trim();
}

function productHaystack(option: any): string {
  return normalizeQuoteText([
    option?.official_name,
    option?.product_name_from_pdf,
    option?.normalized_name,
    option?.category,
    option?.subcategory,
    option?.brand,
    option?.package_type,
    option?.sell_unit,
    option?.default_sell_unit,
    ...(option?.synonyms || []),
  ].join(" "));
}

function levenshteinClient(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[a.length][b.length];
}

function looseClientMatch(hay: string, token: string): boolean {
  const t = normalizeQuoteText(token);
  if (!t) return true;
  if (hay.includes(t)) return true;
  return hay.split(/\s+/).some((w) => {
    if (!w) return false;
    if (w === t) return true;
    if (t.length >= 4 && (w.startsWith(t) || t.startsWith(w))) return true;
    return t.length >= 5 && Math.abs(w.length - t.length) <= 2 && levenshteinClient(w, t) <= 2;
  });
}

function locallyFilterOptions(options: any[], query: string) {
  const cleaned = cleanSearchText(query);
  if (!cleaned) return options;
  const tokens = cleaned
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !["de", "da", "do", "das", "dos", "com", "sem", "mais", "barato", "barata", "desconto"].includes(t));
  if (!tokens.length) return options;

  return options
    .map((option) => {
      const hay = productHaystack(option);
      const score = tokens.reduce((acc, token) => acc + (looseClientMatch(hay, token) ? 1 : -3), 0);
      return { option, score };
    })
    .filter((x) => x.score >= Math.max(1, Math.ceil(tokens.length * 0.45)))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.option);
}

function moneyBR(value: any) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}


type QuoteVisualItem = {
  kind: "item" | "option";
  rank?: number;
  code: string;
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
};

function getQuoteVisualItems(
  currentQuote: GeneratedQuote | null
): QuoteVisualItem[] {
  const quoteItems = Array.isArray(
    currentQuote?.items
  )
    ? currentQuote?.items || []
    : [];

  const optionBlocks = Array.isArray(
    currentQuote?.optionBlocks
  )
    ? currentQuote?.optionBlocks || []
    : [];

  /*
   * A regra "X produtos mais baratos" é retornada pela API
   * dentro de optionBlocks. Ela não representa uma quantidade
   * comprada; representa uma lista ordenada de alternativas.
   */
  const optionRows: QuoteVisualItem[] =
    optionBlocks.flatMap((block: any) => {
      const discount = Math.min(
        100,
        Math.max(
          0,
          Number(
            block?.discountPercent || 0
          )
        )
      );

      return (
        Array.isArray(block?.options)
          ? block.options
          : []
      ).map(
        (option: any, index: number) => {
          const originalPrice = Number(
            option?.price ??
              option?.unitPrice ??
              0
          );

          const finalPrice =
            Math.round(
              (
                originalPrice *
                  (1 - discount / 100) +
                Number.EPSILON
              ) *
                100
            ) / 100;

          return {
            kind: "option" as const,
            rank: index + 1,
            code: String(
              option?.code || ""
            ).trim(),
            name: String(
              option?.official_name ||
                option?.product_name_from_pdf ||
                option?.name ||
                `Opção ${index + 1}`
            ).trim(),
            quantity: 0,
            unit: String(
              option?.sell_unit ||
                option?.unit ||
                "UN"
            ).trim(),
            unitPrice:
              Number.isFinite(finalPrice)
                ? finalPrice
                : 0,
            total:
              Number.isFinite(finalPrice)
                ? finalPrice
                : 0,
          };
        }
      );
    });

  const itemRows: QuoteVisualItem[] =
    quoteItems.map(
      (item: any, index: number) => {
        const name = String(
          item?.productName ||
            item?.name ||
            item?.option?.official_name ||
            item?.selected?.descricaoOriginal ||
            item?.selected?.descriptionOriginal ||
            item?.selected?.produto ||
            item?.selected?.product ||
            item?.input?.raw ||
            item?.raw ||
            `Item ${index + 1}`
        ).trim();

        const code = String(
          item?.code ||
            item?.productCode ||
            item?.option?.code ||
            item?.selected?.code ||
            ""
        ).trim();

        const quantity = Number(
          item?.quantity ??
            item?.convertedQuantity ??
            1
        );

        const unit = String(
          item?.unit ||
            item?.convertedUnit ||
            item?.tableUnit ||
            "UN"
        ).trim();

        const unitPrice = Number(
          item?.discountedUnitPrice ??
            item?.unitPrice ??
            item?.tableUnitPrice ??
            0
        );

        const total = Number(
          item?.subtotal ??
            item?.total ??
            unitPrice * quantity
        );

        return {
          kind: "item" as const,
          code,
          name,
          quantity:
            Number.isFinite(quantity) &&
            quantity > 0
              ? quantity
              : 1,
          unit: unit || "UN",
          unitPrice:
            Number.isFinite(unitPrice)
              ? unitPrice
              : 0,
          total:
            Number.isFinite(total)
              ? total
              : 0,
        };
      }
    );

  /*
   * Mantém a mesma lógica do texto gerado:
   * opções mais baratas primeiro e itens fechados depois.
   */
  return [...optionRows, ...itemRows];
}

function quoteIsOptionsOnly(
  currentQuote: GeneratedQuote | null
) {
  const rows =
    getQuoteVisualItems(currentQuote);

  return (
    rows.length > 0 &&
    rows.every(
      (row) => row.kind === "option"
    )
  );
}

function formatQuoteTableDate(
  value?: string | null
) {
  const raw = String(
    value || ""
  ).trim();

  if (!raw) return "";

  if (
    raw.toLowerCase() === "dia atual"
  ) {
    return "Dia atual";
  }

  const date = new Date(raw);

  if (
    Number.isNaN(date.getTime())
  ) {
    return raw;
  }

  return date.toLocaleDateString(
    "pt-BR"
  );
}

function formatQuoteQuantity(value: number) {
  return Number(value || 0).toLocaleString(
    "pt-BR",
    {
      minimumFractionDigits: 0,
      maximumFractionDigits: 3,
    }
  );
}

function formatQuoteImageDate() {
  return new Date().toLocaleDateString(
    "pt-BR"
  );
}

function safeQuoteFilePart(value: string) {
  return normalizeQuoteText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function loadQuoteLogo(
  src: string
): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(
        new Error(
          "Não foi possível carregar o logo PMG."
        )
      );

    image.src = src;
  });
}

function canvasRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill: string
) {
  const r = Math.min(
    radius,
    width / 2,
    height / 2
  );

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(
    x + width,
    y,
    x + width,
    y + height,
    r
  );
  ctx.arcTo(
    x + width,
    y + height,
    x,
    y + height,
    r
  );
  ctx.arcTo(
    x,
    y + height,
    x,
    y,
    r
  );
  ctx.arcTo(
    x,
    y,
    x + width,
    y,
    r
  );
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function canvasTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
) {
  const words = String(text || "")
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) return [""];

  const lines: string[] = [];
  let current = words[0];

  for (let index = 1; index < words.length; index += 1) {
    const candidate = `${current} ${words[index]}`;

    if (
      ctx.measureText(candidate).width <=
      maxWidth
    ) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[index];
    }
  }

  lines.push(current);
  return lines;
}

function drawQuoteImageText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  options?: {
    font?: string;
    fill?: string;
    align?: CanvasTextAlign;
    baseline?: CanvasTextBaseline;
  }
) {
  ctx.font =
    options?.font ||
    "600 26px Arial, sans-serif";
  ctx.fillStyle =
    options?.fill || "#0f172a";
  ctx.textAlign =
    options?.align || "left";
  ctx.textBaseline =
    options?.baseline || "middle";
  ctx.fillText(String(text || ""), x, y);
}

async function createQuoteImageBlob(params: {
  quote: GeneratedQuote;
  clientName?: string;
  clientId?: string;
  showProductId?: boolean;
}) {
  const rows = getQuoteVisualItems(
    params.quote
  );

  const optionsOnly =
    quoteIsOptionsOnly(params.quote);

  if (!rows.length) {
    throw new Error(
      "A cotação ainda não possui itens para gerar a imagem."
    );
  }

  const canvas = document.createElement(
    "canvas"
  );

  const width = 1440;
  const outer = 48;
  const innerX = 88;
  const innerWidth = width - innerX * 2;

  /*
   * Calculamos a altura de cada linha conforme o tamanho do nome do
   * produto para evitar letras pequenas ou nomes cortados.
   */
  const measureCanvas =
    document.createElement("canvas");
  const measureCtx =
    measureCanvas.getContext("2d");

  if (!measureCtx) {
    throw new Error(
      "Seu navegador não conseguiu preparar a imagem."
    );
  }

  measureCtx.font =
    "700 28px Arial, sans-serif";

  const productTextWidth = 520;

  const rowLayouts = rows.map((row) => {
    const lines = canvasTextLines(
      measureCtx,
      row.name,
      productTextWidth
    );

    const lineCount = Math.min(
      Math.max(lines.length, 1),
      4
    );

    return {
      row,
      lines: lines.slice(0, 4),
      height: Math.max(
        98,
        46 + lineCount * 31
      ),
    };
  });

  const rowsHeight = rowLayouts.reduce(
    (sum, item) => sum + item.height,
    0
  );

  const height =
    outer +
    190 +
    28 +
    118 +
    30 +
    72 +
    rowsHeight +
    34 +
    154 +
    82 +
    outer;

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error(
      "Seu navegador não conseguiu gerar a imagem."
    );
  }

  // Fundo externo.
  ctx.fillStyle = "#f1f5f4";
  ctx.fillRect(0, 0, width, height);

  // Cartão principal.
  canvasRoundedRect(
    ctx,
    outer,
    outer,
    width - outer * 2,
    height - outer * 2,
    34,
    "#ffffff"
  );

  // Faixa superior.
  canvasRoundedRect(
    ctx,
    outer,
    outer,
    width - outer * 2,
    190,
    34,
    "#07130f"
  );

  // Corrige os cantos inferiores da faixa para ficarem retos.
  ctx.fillStyle = "#07130f";
  ctx.fillRect(
    outer,
    outer + 120,
    width - outer * 2,
    70
  );

  // Linha de identidade.
  ctx.fillStyle = "#10b981";
  ctx.fillRect(
    outer,
    outer + 186,
    width - outer * 2,
    4
  );

  // Logo.
  try {
    const logo = await loadQuoteLogo(
      "/logo-pmg.png"
    );

    const logoBoxWidth = 250;
    const logoBoxHeight = 102;
    const ratio = Math.min(
      logoBoxWidth / logo.width,
      logoBoxHeight / logo.height
    );

    const logoWidth =
      logo.width * ratio;
    const logoHeight =
      logo.height * ratio;

    ctx.drawImage(
      logo,
      innerX,
      outer + 40,
      logoWidth,
      logoHeight
    );
  } catch {
    drawQuoteImageText(
      ctx,
      "PMG",
      innerX,
      outer + 91,
      {
        font: "900 54px Arial, sans-serif",
        fill: "#ffffff",
      }
    );
  }

  drawQuoteImageText(
    ctx,
    optionsOnly
      ? "OPÇÕES MAIS BARATAS"
      : "COTAÇÃO COMERCIAL",
    width - innerX,
    outer + 76,
    {
      font: "900 38px Arial, sans-serif",
      fill: "#ffffff",
      align: "right",
    }
  );

  drawQuoteImageText(
    ctx,
    `Emitida em ${formatQuoteImageDate()}`,
    width - innerX,
    outer + 126,
    {
      font: "600 22px Arial, sans-serif",
      fill: "#a7b6af",
      align: "right",
    }
  );

  let y = outer + 218;

  // Cliente.
  canvasRoundedRect(
    ctx,
    innerX,
    y,
    innerWidth,
    118,
    22,
    "#f7faf9"
  );

  drawQuoteImageText(
    ctx,
    "CLIENTE",
    innerX + 30,
    y + 31,
    {
      font: "800 18px Arial, sans-serif",
      fill: "#0f8a5f",
    }
  );

  drawQuoteImageText(
    ctx,
    params.clientName ||
      "Cliente não informado",
    innerX + 30,
    y + 72,
    {
      font: "800 31px Arial, sans-serif",
      fill: "#0f172a",
    }
  );

  const rightInfo = [
    params.clientId
      ? `ID ${params.clientId}`
      : "",
    params.quote.tableDate
      ? `Tabela: ${formatQuoteTableDate(
          params.quote.tableDate
        )}`
      : "",
  ]
    .filter(Boolean)
    .join("  •  ");

  if (rightInfo) {
    drawQuoteImageText(
      ctx,
      rightInfo,
      width - innerX - 30,
      y + 72,
      {
        font: "600 20px Arial, sans-serif",
        fill: "#64748b",
        align: "right",
      }
    );
  }

  y += 148;

  // Tabela.
  const colProduct = 584;
  const colQty = 130;
  const colUnit = 130;
  const colUnitPrice = 200;
  const colTotal = innerWidth -
    colProduct -
    colQty -
    colUnit -
    colUnitPrice;

  const xProduct = innerX;
  const xQty = xProduct + colProduct;
  const xUnit = xQty + colQty;
  const xUnitPrice = xUnit + colUnit;
  const xTotal = xUnitPrice + colUnitPrice;

  canvasRoundedRect(
    ctx,
    innerX,
    y,
    innerWidth,
    72,
    18,
    "#0f5138"
  );

  drawQuoteImageText(
    ctx,
    "PRODUTO",
    xProduct + 24,
    y + 36,
    {
      font: "800 19px Arial, sans-serif",
      fill: "#ffffff",
    }
  );
  drawQuoteImageText(
    ctx,
    optionsOnly
      ? "OPÇÃO"
      : "QTD.",
    xQty + colQty / 2,
    y + 36,
    {
      font: "800 19px Arial, sans-serif",
      fill: "#ffffff",
      align: "center",
    }
  );
  drawQuoteImageText(
    ctx,
    "UN.",
    xUnit + colUnit / 2,
    y + 36,
    {
      font: "800 19px Arial, sans-serif",
      fill: "#ffffff",
      align: "center",
    }
  );
  drawQuoteImageText(
    ctx,
    optionsOnly
      ? "PREÇO"
      : "PREÇO UNIT.",
    xUnitPrice + colUnitPrice - 22,
    y + 36,
    {
      font: "800 19px Arial, sans-serif",
      fill: "#ffffff",
      align: "right",
    }
  );
  if (!optionsOnly) {
    drawQuoteImageText(
      ctx,
      "TOTAL",
      xTotal + colTotal - 24,
      y + 36,
      {
        font: "800 19px Arial, sans-serif",
        fill: "#ffffff",
        align: "right",
      }
    );
  }

  y += 72;

  rowLayouts.forEach(
    ({ row, lines, height: rowHeight }, index) => {
      ctx.fillStyle =
        index % 2 === 0
          ? "#ffffff"
          : "#f8faf9";

      ctx.fillRect(
        innerX,
        y,
        innerWidth,
        rowHeight
      );

      // Linha divisória.
      ctx.fillStyle = "#e2e8e5";
      ctx.fillRect(
        innerX,
        y + rowHeight - 1,
        innerWidth,
        1
      );

      // Nome do produto.
      ctx.font =
        "700 28px Arial, sans-serif";
      ctx.fillStyle = "#111827";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";

      const productTop =
        y +
        Math.max(
          18,
          (rowHeight -
            lines.length * 31 -
            (params.showProductId &&
            row.code
              ? 25
              : 0)) /
            2
        );

      lines.forEach(
        (line, lineIndex) => {
          ctx.fillText(
            line,
            xProduct + 24,
            productTop +
              lineIndex * 31
          );
        }
      );

      if (
        params.showProductId !== false &&
        row.code
      ) {
        ctx.font =
          "600 18px Arial, sans-serif";
        ctx.fillStyle = "#64748b";
        ctx.fillText(
          `ID ${row.code}`,
          xProduct + 24,
          productTop +
            lines.length * 31 +
            5
        );
      }

      const centerY = y + rowHeight / 2;

      drawQuoteImageText(
        ctx,
        row.kind === "option"
          ? `${row.rank || index + 1}ª`
          : formatQuoteQuantity(
              row.quantity
            ),
        xQty + colQty / 2,
        centerY,
        {
          font: "800 25px Arial, sans-serif",
          fill: "#334155",
          align: "center",
        }
      );

      drawQuoteImageText(
        ctx,
        row.unit.toUpperCase(),
        xUnit + colUnit / 2,
        centerY,
        {
          font: "800 22px Arial, sans-serif",
          fill: "#64748b",
          align: "center",
        }
      );

      drawQuoteImageText(
        ctx,
        moneyBR(row.unitPrice),
        xUnitPrice +
          colUnitPrice -
          22,
        centerY,
        {
          font: "700 24px Arial, sans-serif",
          fill: "#334155",
          align: "right",
        }
      );

      if (!optionsOnly) {
        drawQuoteImageText(
          ctx,
          moneyBR(row.total),
          xTotal + colTotal - 24,
          centerY,
          {
            font: "900 26px Arial, sans-serif",
            fill: "#0f5138",
            align: "right",
          }
        );
      }

      y += rowHeight;
    }
  );

  y += 34;

  // Total geral.
  canvasRoundedRect(
    ctx,
    innerX,
    y,
    innerWidth,
    154,
    24,
    "#07130f"
  );

  drawQuoteImageText(
    ctx,
    `${rows.length} ${
      rows.length === 1
        ? "produto"
        : "produtos"
    }`,
    innerX + 34,
    y + 55,
    {
      font: "700 22px Arial, sans-serif",
      fill: "#a7b6af",
    }
  );

  drawQuoteImageText(
    ctx,
    optionsOnly
      ? "MELHORES OPÇÕES ENCONTRADAS"
      : "TOTAL DA COTAÇÃO",
    innerX + 34,
    y + 99,
    {
      font: "900 27px Arial, sans-serif",
      fill: "#ffffff",
    }
  );

  drawQuoteImageText(
    ctx,
    optionsOnly
      ? "Valores unitários"
      : moneyBR(
          params.quote.total
        ),
    width - innerX - 34,
    y + 77,
    {
      font: optionsOnly
        ? "800 31px Arial, sans-serif"
        : "900 48px Arial, sans-serif",
      fill: "#34d399",
      align: "right",
    }
  );

  y += 154;

  // Rodapé.
  drawQuoteImageText(
    ctx,
    "PMG • Cotação comercial",
    innerX,
    y + 46,
    {
      font: "700 19px Arial, sans-serif",
      fill: "#64748b",
    }
  );

  drawQuoteImageText(
    ctx,
    "Valores apresentados conforme a cotação gerada.",
    width - innerX,
    y + 46,
    {
      font: "500 18px Arial, sans-serif",
      fill: "#94a3b8",
      align: "right",
    }
  );

  return new Promise<Blob>(
    (resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
            return;
          }

          reject(
            new Error(
              "Não foi possível finalizar a imagem."
            )
          );
        },
        "image/png",
        1
      );
    }
  );
}

function QuoteVisualPreview(props: {
  quote: GeneratedQuote;
  clientName?: string;
  clientId?: string;
  showProductId?: boolean;
}) {
  const rows = getQuoteVisualItems(
    props.quote
  );

  const optionsOnly =
    quoteIsOptionsOnly(props.quote);

  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm">
      <div className="border-b-4 border-emerald-500 bg-slate-950 p-4 text-white">
        <div className="flex items-center justify-between gap-4">
          <img
            src="/logo-pmg.png"
            alt="PMG"
            className="h-12 max-w-[145px] rounded-lg bg-white object-contain px-2 py-1"
          />

          <div className="text-right">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300">
              {optionsOnly
                ? "Opções mais baratas"
                : "Cotação comercial"}
            </p>

            <p className="mt-1 text-[11px] font-semibold text-slate-300">
              {formatQuoteImageDate()}
            </p>
          </div>
        </div>
      </div>

      <div className="border-b border-slate-100 bg-slate-50 p-4">
        <p className="text-[9px] font-black uppercase tracking-[0.18em] text-emerald-700">
          Cliente
        </p>

        <p className="mt-1 truncate text-base font-black text-slate-950">
          {props.clientName ||
            "Cliente não informado"}
        </p>

        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-semibold text-slate-500">
          {props.clientId && (
            <span>
              ID {props.clientId}
            </span>
          )}

          {props.quote.tableDate && (
            <span>
              Tabela:{" "}
              {formatQuoteTableDate(
                props.quote.tableDate
              )}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_72px_110px] gap-2 bg-emerald-800 px-4 py-2.5 text-[9px] font-black uppercase tracking-wide text-white">
        <span>Produto</span>

        <span className="text-center">
          {optionsOnly
            ? "Opção"
            : "Qtd."}
        </span>

        <span className="text-right">
          {optionsOnly
            ? "Preço"
            : "Total"}
        </span>
      </div>

      <div>
        {rows.map((row, index) => (
          <div
            key={`${row.code || row.name}-${index}`}
            className={`grid grid-cols-[minmax(0,1fr)_72px_110px] gap-2 border-b border-slate-100 px-4 py-3 ${
              index % 2
                ? "bg-slate-50/70"
                : "bg-white"
            }`}
          >
            <div className="min-w-0">
              <p className="text-xs font-black leading-5 text-slate-900">
                {row.name}
              </p>

              <p className="mt-1 text-[10px] font-semibold text-slate-500">
                {props.showProductId !==
                  false &&
                row.code
                  ? `ID ${row.code} • `
                  : ""}

                {moneyBR(
                  row.unitPrice
                )}{" "}
                /{" "}
                {row.unit.toUpperCase()}
              </p>
            </div>

            <div className="flex items-center justify-center text-center">
              {row.kind === "option" ? (
                <div>
                  <p className="text-sm font-black text-emerald-700">
                    {row.rank ||
                      index + 1}ª
                  </p>
                  <p className="text-[9px] font-bold uppercase text-slate-400">
                    menor
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-xs font-black text-slate-900">
                    {formatQuoteQuantity(
                      row.quantity
                    )}
                  </p>

                  <p className="text-[9px] font-bold uppercase text-slate-400">
                    {row.unit}
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end text-right">
              <p className="text-xs font-black text-emerald-700">
                {moneyBR(
                  row.kind === "option"
                    ? row.unitPrice
                    : row.total
                )}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 bg-slate-950 p-4 text-white">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
            {optionsOnly
              ? "Resultado da pesquisa"
              : "Total da cotação"}
          </p>

          <p className="mt-1 text-[10px] font-semibold text-slate-400">
            {rows.length}{" "}
            {rows.length === 1
              ? "produto"
              : "produtos"}
          </p>
        </div>

        {optionsOnly ? (
          <p className="text-right text-xs font-black text-emerald-300">
            Ordenado do
            <br />
            menor preço
          </p>
        ) : (
          <p className="text-xl font-black text-emerald-300">
            {moneyBR(
              props.quote.total
            )}
          </p>
        )}
      </div>
    </div>
  );
}

function customerLabel(c: Customer) {
  const name = c.trade_name || c.legal_name;
  const code = c.internal_code || c.erp_code || "";
  return `${name}${code ? ` • ID ${code}` : ""}${c.whatsapp ? ` • ${c.whatsapp}` : ""}`;
}

function optionSubtitle(option: any) {
  const parts = [
    option.code ? `ID ${option.code}` : null,
    option.brand ? `Marca: ${option.brand}` : null,
    option.category ? `Categoria: ${option.category}` : null,
    option.sell_unit ? `Vend. por: ${option.sell_unit}` : null,
  ].filter(Boolean);
  return parts.join(" • ");
}

function optionPrices(option: any) {
  const parts = [
    option.labelPrice ? `Unit.: ${option.labelPrice}` : null,
    option.labelKg ? `KG: ${option.labelKg}` : null,
    option.labelBox ? `Caixa: ${option.labelBox}` : null,
  ].filter(Boolean);
  return parts.join(" | ");
}

function getDiscountedSavedItems(saved: SavedQuote): SavedQuoteItem[] {
  const items = Array.isArray(saved.items) ? saved.items : [];

  return items.filter(
    (item) => Number(item.discountPercent || 0) > 0
  );
}

function getSavedQuoteDiscountAmount(saved: SavedQuote): number {
  const stored = Number(saved.totalDiscountAmount || 0);

  if (stored > 0) return stored;

  return getDiscountedSavedItems(saved).reduce(
    (sum, item) =>
      sum + Number(item.totalDiscountAmount || 0),
    0
  );
}

function formatPercentBR(value: number | undefined | null) {
  return Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function formatSavedQuoteDate(value?: string | null) {
  if (!value) return "Data não informada";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function buildRequestFromSavedQuote(saved: SavedQuote) {
  const original = String(saved.requestText || "").trim();
  if (original) return original;

  const items = Array.isArray(saved.items) ? saved.items : [];

  return items
    .map((item) => {
      const quantity = Number(item.quantity || 1);
      const unit = String(item.unit || "").trim();
      const name = String(item.name || item.code || "produto").trim();
      const discount = Number(item.discountPercent || 0);

      return [
        quantity,
        unit,
        name,
        discount > 0 ? `desconto ${discount}%` : "",
      ]
        .filter(Boolean)
        .join(" ");
    })
    .join("\n");
}

export default function QuotesPage() {
  const [clientName, setClientName] = useState("");
  const [clientId, setClientId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [quickCustomerOpen, setQuickCustomerOpen] = useState(false);
  const [quickCustomerName, setQuickCustomerName] = useState("");
  const [quickCustomerDocument, setQuickCustomerDocument] = useState("");

  const [requestText, setRequestText] = useState(
    "3 peças mussarela imperador\n2 fardos farinha anaconda pizza\n3 requeijão coronata com amido\n2 requeijão scala\n1 presunto peperi\n2 bisnagas chocolate ao leite confeiteiro"
  );
  const [displayMode, setDisplayMode] = useState("client_clean");
  const [showProductId, setShowProductId] = useState(true);
  const [loading, setLoading] = useState(false);
  const [quote, setQuote] = useState<GeneratedQuote | null>(null);
  const [quotePreviewMode, setQuotePreviewMode] = useState<"text" | "image">("text");
  const [quoteImageLoading, setQuoteImageLoading] = useState(false);
  const [quoteImageStatus, setQuoteImageStatus] = useState("");
  const [tableDate, setTableDate] = useState("");
  const [candidateGroups, setCandidateGroups] = useState<CandidateGroup[]>([]);
  const [autoItems, setAutoItems] = useState<any[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [currentConfirmIndex, setCurrentConfirmIndex] = useState(0);
  const [manualSearch, setManualSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [optionSort, setOptionSort] = useState<
    "relevance" | "az" | "za" | "price_asc" | "price_desc"
  >("relevance");
  const [addMoreOpen, setAddMoreOpen] = useState(false);
  const [addMoreText, setAddMoreText] = useState("");
  const [addingMore, setAddingMore] = useState(false);
  const [addMoreStatus, setAddMoreStatus] = useState("");
  const [status, setStatus] = useState("");
  const [savedStatus, setSavedStatus] = useState("");
  const [priceUploading, setPriceUploading] = useState(false);
  const [priceUploadStatus, setPriceUploadStatus] = useState("");

  const [activeTab, setActiveTab] = useState<"new" | "saved">("new");
  const [savedQuotes, setSavedQuotes] = useState<SavedQuote[]>([]);
  const [savedQuotesLoading, setSavedQuotesLoading] = useState(false);
  const [savedQuotesError, setSavedQuotesError] = useState("");
  const [savedQuoteSearch, setSavedQuoteSearch] = useState("");
  const [savedQuotePeriod, setSavedQuotePeriod] = useState("all");
  const [savedQuoteDiscount, setSavedQuoteDiscount] = useState("all");
  const [openedSavedQuote, setOpenedSavedQuote] = useState<SavedQuote | null>(null);

  const quoteVisualRows = useMemo(
    () => getQuoteVisualItems(quote),
    [quote]
  );

  useEffect(() => {
    fetchCustomers();
  }, []);

  useEffect(() => {
    if (activeTab === "saved") {
      fetchSavedQuotes();
    }
  }, [activeTab]);

  async function fetchCustomers(q = "") {
    try {
      const parsedSearch = parseQuoteSearch(q);

      /*
       * Para busca explícita por ID/UUID usamos a lista padrão e filtramos
       * no frontend, porque a rota de clientes pode não pesquisar o campo id.
       */
      const useLocalIdSearch =
        parsedSearch.scope === "id";

      const remoteQuery = useLocalIdSearch
        ? ""
        : parsedSearch.value;

      const res = await fetch(
        `/api/crm/customers${
          remoteQuery
            ? `?q=${encodeURIComponent(remoteQuery)}`
            : ""
        }`,
        { cache: "no-store" }
      );

      const data = await res.json();

      let rows = Array.isArray(data.customers)
        ? data.customers
        : Array.isArray(data.rows)
          ? data.rows
          : [];

      /*
       * Se a API não encontrou um termo, preservamos uma segunda chance
       * usando a lista padrão e a busca inteligente local.
       */
      if (q.trim() && !rows.length && !useLocalIdSearch) {
        const fallbackRes = await fetch(
          "/api/crm/customers",
          { cache: "no-store" }
        );

        const fallbackData =
          await fallbackRes.json();

        rows = Array.isArray(
          fallbackData.customers
        )
          ? fallbackData.customers
          : Array.isArray(fallbackData.rows)
            ? fallbackData.rows
            : [];
      }

      setCustomers(rows);
    } catch {
      setCustomers([]);
    }
  }

  const customerSuggestions = useMemo(() => {
    const search = parseQuoteSearch(
      customerSearch
    );

    if (!search.value) {
      return customers.slice(0, 8);
    }

    return customers
      .filter((c) => {
        const idFields = [
          c.id,
          c.internal_code,
          c.erp_code,
        ];

        const customerFields = [
          c.legal_name,
          c.trade_name,
          c.city,
          c.state,
          c.segment,
        ];

        const phoneFields = [c.whatsapp];
        const documentFields = [c.document];

        if (search.scope === "id") {
          return quoteSearchMatches(
            search.value,
            idFields
          );
        }

        if (search.scope === "customer") {
          return quoteSearchMatches(
            search.value,
            customerFields
          );
        }

        if (search.scope === "phone") {
          return quoteSearchMatches(
            search.value,
            phoneFields
          );
        }

        if (search.scope === "document") {
          return quoteSearchMatches(
            search.value,
            documentFields
          );
        }

        return quoteSearchMatches(
          search.value,
          [
            ...idFields,
            ...customerFields,
            ...phoneFields,
            ...documentFields,
          ]
        );
      })
      .slice(0, 10);
  }, [customerSearch, customers]);

  const filteredSavedQuotes = useMemo(() => {
    const search = parseQuoteSearch(
      savedQuoteSearch
    );

    const now = Date.now();

    return savedQuotes.filter((saved) => {
      if (search.value) {
        const itemFields = (saved.items || [])
          .flatMap((item) => [
            item.code,
            item.name,
            item.raw,
          ]);

        const idFields = [
          saved.id,
          saved.quoteNumber,
          saved.customerId,
          saved.customerInternalCode,
          saved.metadata?.customerId,
          saved.metadata?.customerInternalCode,
          saved.metadata?.clientId,
          ...((saved.items || []).map(
            (item) => item.code
          )),
        ];

        const customerFields = [
          saved.customerName,
          saved.customerId,
          saved.customerInternalCode,
          saved.metadata?.customerId,
          saved.metadata?.customerInternalCode,
          saved.metadata?.clientId,
        ];

        const quoteFields = [
          saved.id,
          saved.quoteNumber,
        ];

        const codeFields = [
          saved.customerInternalCode,
          saved.metadata?.customerInternalCode,
          saved.metadata?.clientId,
          ...((saved.items || []).map(
            (item) => item.code
          )),
        ];

        let fields: any[] = [
          ...idFields,
          ...customerFields,
          ...quoteFields,
          ...itemFields,
          saved.requestText,
          saved.outputText,
        ];

        if (search.scope === "id") {
          fields = idFields;
        } else if (
          search.scope === "customer"
        ) {
          fields = customerFields;
        } else if (
          search.scope === "product"
        ) {
          fields = itemFields;
        } else if (
          search.scope === "code"
        ) {
          fields = codeFields;
        } else if (
          search.scope === "quote"
        ) {
          fields = quoteFields;
        }

        if (
          !quoteSearchMatches(
            search.value,
            fields
          )
        ) {
          return false;
        }
      }

      const discountedItems = getDiscountedSavedItems(saved);

      if (savedQuoteDiscount === "with") {
        if (discountedItems.length <= 0) return false;
      }

      if (savedQuoteDiscount === "without") {
        if (discountedItems.length > 0) return false;
      }

      if (savedQuotePeriod !== "all") {
        const days = Number(savedQuotePeriod);
        const createdAt = saved.createdAt ? new Date(saved.createdAt).getTime() : NaN;

        if (!Number.isFinite(createdAt)) return false;

        const minDate = now - days * 24 * 60 * 60 * 1000;
        if (createdAt < minDate) return false;
      }

      return true;
    });
  }, [
    savedQuotes,
    savedQuoteSearch,
    savedQuotePeriod,
    savedQuoteDiscount,
  ]);

  const currentGroup = candidateGroups[currentConfirmIndex];
  const filteredCurrentOptions = useMemo(() => {
    if (!currentGroup) return [];

    const filtered = locallyFilterOptions(
      currentGroup.options || [],
      manualSearch || currentGroup.searchText || ""
    );

    if (optionSort === "relevance") return filtered;

    return [...filtered].sort((a, b) => {
      const nameA = String(a?.official_name || a?.product_name_from_pdf || "").trim();
      const nameB = String(b?.official_name || b?.product_name_from_pdf || "").trim();
      const priceA = Number(a?.price ?? a?.unitPrice ?? 0);
      const priceB = Number(b?.price ?? b?.unitPrice ?? 0);

      if (optionSort === "az") {
        return nameA.localeCompare(nameB, "pt-BR", { sensitivity: "base" });
      }

      if (optionSort === "za") {
        return nameB.localeCompare(nameA, "pt-BR", { sensitivity: "base" });
      }

      if (optionSort === "price_asc") {
        if (priceA !== priceB) return priceA - priceB;
        return nameA.localeCompare(nameB, "pt-BR", { sensitivity: "base" });
      }

      if (optionSort === "price_desc") {
        if (priceA !== priceB) return priceB - priceA;
        return nameA.localeCompare(nameB, "pt-BR", { sensitivity: "base" });
      }

      return 0;
    });
  }, [currentGroup, manualSearch, optionSort]);

  const progress = candidateGroups.length ? Math.round(((currentConfirmIndex + 1) / candidateGroups.length) * 100) : 0;

  function selectCustomer(c: Customer) {
    setCustomerId(c.id);
    setClientName(c.trade_name || c.legal_name || "");
    setClientId(c.internal_code || c.erp_code || "");
    setCustomerSearch(customerLabel(c));
  }

  async function quickCreateCustomer() {
    const legalName = quickCustomerName.trim() || customerSearch.trim();
    if (!legalName) {
      alert("Informe o nome ou empresa do cliente.");
      return;
    }

    try {
      const res = await fetch("/api/crm/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          legal_name: legalName,
          trade_name: legalName,
          document: quickCustomerDocument || null,
        }),
      });
      const data = await res.json();
      const created = data.customer || data;
      if (created?.id) {
        selectCustomer(created);
        setQuickCustomerOpen(false);
        setQuickCustomerName("");
        setQuickCustomerDocument("");
        await fetchCustomers();
      } else {
        setClientName(legalName);
        setClientId("");
        setCustomerSearch(legalName);
        setQuickCustomerOpen(false);
      }
    } catch {
      setClientName(legalName);
      setClientId("");
      setCustomerSearch(legalName);
      setQuickCustomerOpen(false);
    }
  }

  async function uploadPriceTablePdf(file: File | null) {
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setPriceUploadStatus("Envie um arquivo PDF da tabela de preços.");
      return;
    }

    setPriceUploading(true);
    setPriceUploadStatus("Carregando e lendo PDF do dia... isso pode levar alguns segundos.");
    setStatus("");

    try {
      const form = new FormData();
      form.append("companyId", DEFAULT_COMPANY_ID);
      form.append("file", file);

      const res = await fetch("/api/quotes/price-table/upload", {
        method: "POST",
        body: form,
      });

      const data = await res.json();

      if (!data.success) {
        setPriceUploadStatus(data.error || "Erro ao carregar a tabela de preços.");
        return;
      }

      setTableDate(data.tableDate || "");
      setPriceUploadStatus(
        `Tabela atualizada: ${data.updated || data.parsed || 0} preços lidos` +
          (data.unmatched ? ` • ${data.unmatched} códigos sem vínculo no catálogo` : "")
      );
    } catch (err: any) {
      setPriceUploadStatus(err?.message || "Erro ao carregar PDF.");
    } finally {
      setPriceUploading(false);
    }
  }

  async function changeDisplayMode(nextMode: string) {
    const previousMode = displayMode;

    setDisplayMode(nextMode);

    if (!quote) {
      return;
    }

    try {
      const res = await fetch("/api/quotes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formatOnly: true,
          items: quote.items || [],
          optionBlocks: quote.optionBlocks || [],
          total: quote.total,
          tableDate: quote.tableDate || tableDate || null,
          clientName,
          displayMode: nextMode,
          showProductId,
        }),
      });

      const data = await res.json();

      if (!data.success) {
        setDisplayMode(previousMode);
        setStatus(
          data.error ||
            "Não foi possível alterar a preferência de envio."
        );
        return;
      }

      setQuote((current) =>
        current
          ? {
              ...current,
              outputText: data.outputText || current.outputText,
            }
          : current
      );

      setStatus(
        "Preferência de envio alterada sem recalcular a cotação."
      );
    } catch (err: any) {
      setDisplayMode(previousMode);
      setStatus(
        err?.message ||
          "Não foi possível alterar a preferência de envio."
      );
    }
  }

  async function generateQuote() {
    if (!tableDate && !priceUploadStatus) {
      setPriceUploadStatus("Atenção: carregue o PDF do dia para garantir preços atualizados antes de finalizar a cotação.");
    }

    setLoading(true);
    setQuote(null);
    setQuoteImageStatus("");
    setStatus("Interpretando pedido com IA e consultando a tabela PMG...");
    setSavedStatus("");

    try {
      const res = await fetch("/api/quotes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: DEFAULT_COMPANY_ID,
          customerId: customerId || null,
          rawText: requestText,
          requestText,
          clientName,
          clientId,
          displayMode,
          showProductId,
        }),
      });
      const data = await res.json();

      if (!data.success) {
        setStatus(data.error || "Erro ao gerar cotação.");
        return;
      }

      if (Array.isArray(data.items)) {
        const normalizedQuote: GeneratedQuote = {
          ...data,
          outputText: data.outputText || formatEngineQuoteText(data, clientName, displayMode, showProductId),
          total: Number(data.total || 0),
          tableDate: data.tableDate || tableDate || "Dia atual",
          items: data.items || [],
          unresolved: data.items?.filter((item: any) => item.needsReview) || [],
        };

        setQuote(normalizedQuote);
        setTableDate(normalizedQuote.tableDate || "");
        setStatus(
          data.needsReview
            ? "Cotação gerada com itens para revisar."
            : "Cotação gerada com sucesso."
        );
        return;
      }

      setTableDate(data.tableDate || "");

      if (data.mode === "confirm") {
        setCandidateGroups(data.candidateGroups || []);
        setAutoItems(data.autoItems || []);
        setCurrentConfirmIndex(0);
        setManualSearch(data.candidateGroups?.[0]?.searchText || "");
        setConfirmOpen(true);
        setStatus("Revise os produtos sugeridos. Confirme item por item.");
        return;
      }

      setQuote(data);
      setStatus("Cotação gerada com sucesso.");
    } catch (err: any) {
      setStatus(err?.message || "Erro ao gerar cotação.");
    } finally {
      setLoading(false);
    }
  }

  function updateCurrentGroup(patch: Partial<CandidateGroup>) {
    setCandidateGroups((prev) =>
      prev.map((g, idx) => (idx === currentConfirmIndex ? { ...g, ...patch } : g))
    );
  }

  function goNextConfirmation() {
    if (currentConfirmIndex < candidateGroups.length - 1) {
      const next = currentConfirmIndex + 1;
      setCurrentConfirmIndex(next);
      setManualSearch(candidateGroups[next]?.searchText || "");
    } else {
      finalizeConfirmedQuote();
    }
  }

  function goPrevConfirmation() {
    if (currentConfirmIndex <= 0) return;
    const prev = currentConfirmIndex - 1;
    setCurrentConfirmIndex(prev);
    setManualSearch(candidateGroups[prev]?.searchText || "");
  }

  async function searchCatalog() {
    if (!currentGroup) return;
    const q = manualSearch.trim();
    if (!q) return;

    setSearching(true);
    try {
      const res = await fetch("/api/quotes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: DEFAULT_COMPANY_ID, rawText: q, requestText: q, searchOnly: true, query: q, limit: 80 }),
      });
      const data = await res.json();
      if (data.success) {
        updateCurrentGroup({
          options: data.options || [],
          selectedCode: data.options?.[0]?.code || null,
          selectedOptionId: data.options?.[0]?.id || null,
          searchText: q,
          skipped: false,
        });
      } else {
        alert(data.error || "Não encontrei produtos.");
      }
    } catch (err: any) {
      alert(err?.message || "Erro ao pesquisar.");
    } finally {
      setSearching(false);
    }
  }


  async function addMoreItemsToConfirmation() {
    const extraText = addMoreText.trim();

    if (!extraText) {
      setAddMoreStatus("Digite pelo menos um produto para adicionar.");
      return;
    }

    setAddingMore(true);
    setAddMoreStatus("Buscando os novos itens no catálogo...");

    try {
      const res = await fetch("/api/quotes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: DEFAULT_COMPANY_ID,
          customerId: customerId || null,
          rawText: extraText,
          requestText: extraText,
          clientName,
          clientId,
          displayMode,
          showProductId,
        }),
      });

      const data = await res.json();

      if (!data.success) {
        setAddMoreStatus(data.error || "Erro ao adicionar novos itens.");
        return;
      }

      const newGroups = Array.isArray(data.candidateGroups)
        ? data.candidateGroups
        : [];

      const newAutoItems = Array.isArray(data.autoItems)
        ? data.autoItems
        : Array.isArray(data.items)
          ? data.items
          : [];

      if (!newGroups.length && !newAutoItems.length) {
        setAddMoreStatus(
          "Nenhum item pôde ser adicionado automaticamente. Tente uma descrição mais específica."
        );
        return;
      }

      const currentLength = candidateGroups.length;

      if (newGroups.length) {
        setCandidateGroups((prev) => [
          ...prev,
          ...newGroups.map((group: CandidateGroup, index: number) => ({
            ...group,
            index: currentLength + index,
          })),
        ]);
      }

      if (newAutoItems.length) {
        setAutoItems((prev) => [...prev, ...newAutoItems]);
      }

      setRequestText((prev) =>
        prev.trim() ? `${prev.trim()}\n${extraText}` : extraText
      );

      setAddMoreText("");
      setAddMoreOpen(false);
      setAddMoreStatus(
        `${newGroups.length + newAutoItems.length} item(ns) adicionado(s) à cotação.`
      );
    } catch (err: any) {
      setAddMoreStatus(err?.message || "Erro ao adicionar novos itens.");
    } finally {
      setAddingMore(false);
    }
  }

  async function finalizeConfirmedQuote() {
    setConfirming(true);
    try {
      const confirmedItems = candidateGroups.map((g) => ({
        raw: g.raw,
        code: g.selectedCode,
        optionId: g.selectedOptionId || null,
        quantity: g.quantity,
        quantityUnit: g.quantityUnit,
        discountPercent: g.discountPercent,
        skipped: g.skipped || !g.selectedCode,
      }));

      const res = await fetch("/api/quotes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: DEFAULT_COMPANY_ID,
          rawText: requestText,
          requestText,
          customerId: customerId || null,
          confirmedItems,
          autoItems,
          clientName,
          clientId,
          displayMode,
          showProductId,
          tableDate,
        }),
      });
      const data = await res.json();

      if (!data.success) {
        alert(data.error || "Erro ao finalizar cotação.");
        return;
      }

      setQuote(data);
      setConfirmOpen(false);
      setStatus("Cotação final gerada com sucesso.");
    } catch (err: any) {
      alert(err?.message || "Erro ao finalizar.");
    } finally {
      setConfirming(false);
    }
  }

  async function copyQuote() {
    if (!quote?.outputText) return;
    await navigator.clipboard.writeText(quote.outputText);
    setStatus("Cotação copiada. Agora é só colar no WhatsApp.");
  }

  function quoteImageFileName() {
    const client =
      safeQuoteFilePart(clientName) ||
      "cliente";

    const date = new Date()
      .toISOString()
      .slice(0, 10);

    return `cotacao-pmg-${client}-${date}.png`;
  }

  function downloadQuoteBlob(
    blob: Blob,
    fileName: string
  ) {
    const url =
      URL.createObjectURL(blob);

    const link =
      document.createElement("a");

    link.href = url;
    link.download = fileName;

    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(
      () => URL.revokeObjectURL(url),
      1500
    );
  }

  async function copyQuoteImage() {
    if (!quote) return;

    setQuoteImageLoading(true);
    setQuoteImageStatus(
      "Preparando imagem para copiar..."
    );

    try {
      const blob =
        await createQuoteImageBlob({
          quote,
          clientName,
          clientId,
          showProductId,
        });

      const clipboard =
        navigator.clipboard as
          | (Clipboard & {
              write?: (
                data: ClipboardItem[]
              ) => Promise<void>;
            })
          | undefined;

      const ClipboardItemCtor =
        (window as any).ClipboardItem;

      if (
        !clipboard?.write ||
        !ClipboardItemCtor
      ) {
        throw new Error(
          "Seu navegador não permite copiar imagens diretamente. Use Compartilhar imagem ou Baixar PNG."
        );
      }

      const clipboardItem =
        new ClipboardItemCtor({
          "image/png": blob,
        });

      await clipboard.write([
        clipboardItem,
      ]);

      setQuoteImageStatus(
        "Imagem copiada! Abra o WhatsApp e cole com Ctrl + V."
      );
    } catch (err: any) {
      setQuoteImageStatus(
        err?.message ||
          "Não foi possível copiar a imagem. Use Compartilhar imagem ou Baixar PNG."
      );
    } finally {
      setQuoteImageLoading(false);
    }
  }

  async function downloadQuoteImage() {
    if (!quote) return;

    setQuoteImageLoading(true);
    setQuoteImageStatus(
      "Preparando imagem em alta qualidade..."
    );

    try {
      const blob =
        await createQuoteImageBlob({
          quote,
          clientName,
          clientId,
          showProductId,
        });

      downloadQuoteBlob(
        blob,
        quoteImageFileName()
      );

      setQuoteImageStatus(
        "Imagem da cotação gerada com sucesso."
      );
    } catch (err: any) {
      setQuoteImageStatus(
        err?.message ||
          "Não foi possível gerar a imagem."
      );
    } finally {
      setQuoteImageLoading(false);
    }
  }

  async function shareQuoteImage() {
    if (!quote) return;

    setQuoteImageLoading(true);
    setQuoteImageStatus(
      "Preparando imagem para compartilhar..."
    );

    try {
      const blob =
        await createQuoteImageBlob({
          quote,
          clientName,
          clientId,
          showProductId,
        });

      const fileName =
        quoteImageFileName();

      const file = new File(
        [blob],
        fileName,
        { type: "image/png" }
      );

      const navigatorWithShare =
        navigator as Navigator & {
          canShare?: (data: {
            files?: File[];
          }) => boolean;
          share?: (data: {
            files?: File[];
            title?: string;
            text?: string;
          }) => Promise<void>;
        };

      if (
        navigatorWithShare.share &&
        navigatorWithShare.canShare?.({
          files: [file],
        })
      ) {
        await navigatorWithShare.share({
          files: [file],
          title: "Cotação PMG",
          text: clientName
            ? `Cotação para ${clientName}`
            : "Cotação PMG",
        });

        setQuoteImageStatus(
          "Imagem pronta para compartilhar."
        );

        return;
      }

      downloadQuoteBlob(
        blob,
        fileName
      );

      setQuoteImageStatus(
        "Seu navegador não permite compartilhar arquivos diretamente. A imagem foi baixada."
      );
    } catch (err: any) {
      if (
        String(err?.name || "") ===
        "AbortError"
      ) {
        setQuoteImageStatus("");
        return;
      }

      setQuoteImageStatus(
        err?.message ||
          "Não foi possível compartilhar a imagem."
      );
    } finally {
      setQuoteImageLoading(false);
    }
  }

  async function fetchSavedQuotes() {
    setSavedQuotesLoading(true);
    setSavedQuotesError("");

    try {
      const res = await fetch("/api/quotes/history?limit=500", {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setSavedQuotes([]);
        setSavedQuotesError(
          data.error || "Erro ao carregar cotações salvas."
        );
        return;
      }

      setSavedQuotes(
        Array.isArray(data.quotes) ? data.quotes : []
      );
    } catch (err: any) {
      setSavedQuotes([]);
      setSavedQuotesError(
        err?.message || "Erro ao carregar cotações salvas."
      );
    } finally {
      setSavedQuotesLoading(false);
    }
  }

  function reuseSavedQuote(saved: SavedQuote) {
    const rebuiltRequest = buildRequestFromSavedQuote(saved);

    setRequestText(rebuiltRequest);

    if (saved.customerIdentified) {
      setCustomerId(saved.customerId || "");
      setClientId(saved.customerInternalCode || "");
      setClientName(saved.customerName || "");
      setCustomerSearch(saved.customerName || "");
    } else {
      setCustomerId("");
      setClientId("");
      setClientName("");
      setCustomerSearch("");
    }

    if (saved.priceDisplayMode) {
      setDisplayMode(saved.priceDisplayMode);
    }

    if (typeof saved.metadata?.showProductId === "boolean") {
      setShowProductId(saved.metadata.showProductId);
    }

    setQuote(null);
    setCandidateGroups([]);
    setAutoItems([]);
    setSavedStatus("");
    setStatus(
      `Cotação ${saved.quoteNumber || ""} carregada. Clique em "Buscar e confirmar produtos" para recalcular com a tabela atual.`
    );
    setActiveTab("new");
    setOpenedSavedQuote(null);

    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  async function copySavedQuote(saved: SavedQuote) {
    const text = String(saved.outputText || "").trim();
    if (!text) return;

    await navigator.clipboard.writeText(text);
  }

  async function saveQuote() {
    if (!quote) return;
    setSavedStatus("Salvando cotação...");
    try {
      const res = await fetch("/api/quotes/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: DEFAULT_COMPANY_ID,
          customerId: customerId || null,
          customerInternalCode: clientId || null,
          clientId: clientId || null,
          customerName: clientName,
          clientName,
          title: `Cotação ${clientName || "PMG"}`,
          requestText,
          outputText: quote.outputText,
          total: quote.total,
          priceDisplayMode: displayMode,
          tableDate: quote.tableDate || tableDate || null,
          items: quote.items || [],
          metadata: {
            customerId,
            customerInternalCode: clientId,
            clientId,
            displayMode,
            showProductId,
            tableDate: quote.tableDate || tableDate,
          },
        }),
      });
      const data = await res.json();
      setSavedStatus(
        data.success
          ? `${data.quote?.quoteNumber || "Cotação"} salva com sucesso.`
          : data.error || "Erro ao salvar cotação."
      );

      if (data.success) {
        await fetchSavedQuotes();
      }
    } catch (err: any) {
      setSavedStatus(err?.message || "Erro ao salvar.");
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-3 py-4 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-5 p-5 sm:p-7 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-3 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-black uppercase tracking-wide text-emerald-700">
                Cotador IA PMG
              </div>
              <h1 className="text-2xl font-black tracking-tight sm:text-4xl">
                Cotações rápidas, bonitas e vinculadas ao CRM
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                Cole o pedido do cliente, confirme os produtos sugeridos e gere uma cotação profissional pronta para WhatsApp.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 rounded-3xl bg-slate-50 p-3 text-sm sm:min-w-[360px]">
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <p className="text-xs font-bold uppercase text-slate-400">Tabela</p>
                <p className="mt-1 font-black text-slate-900">{tableDate || "Dia atual"}</p>
              </div>
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <p className="text-xs font-bold uppercase text-slate-400">Tempo alvo</p>
                <p className="mt-1 font-black text-emerald-700">menos cliques</p>
              </div>
            </div>
          </div>
        </header>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-2 shadow-sm">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("new")}
              className={`rounded-[1.35rem] px-4 py-3 text-sm font-black transition ${
                activeTab === "new"
                  ? "bg-slate-950 text-white shadow-sm"
                  : "bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              Nova cotação
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("saved")}
              className={`rounded-[1.35rem] px-4 py-3 text-sm font-black transition ${
                activeTab === "saved"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              Cotações salvas
            </button>
          </div>
        </section>

        {activeTab === "new" ? (
          <>
        <section className="rounded-[2rem] border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="inline-flex rounded-full bg-white px-3 py-1 text-xs font-black uppercase tracking-wide text-emerald-700 shadow-sm">
                Tabela de preços do dia
              </div>
              <h2 className="mt-3 text-xl font-black text-slate-950 sm:text-2xl">
                Carregue o PDF diário antes de gerar as cotações
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                O catálogo continua sendo a base oficial dos produtos. Este PDF atualiza somente preço, unidade de venda e informações comerciais do dia.
              </p>
              <div className="mt-3 text-sm font-semibold text-slate-700">
                Status: <span className={tableDate ? "text-emerald-700" : "text-amber-700"}>{tableDate ? `tabela carregada em ${tableDate}` : "aguardando PDF do dia"}</span>
              </div>
              {priceUploadStatus && (
                <div className="mt-3 rounded-2xl border border-emerald-100 bg-white px-4 py-3 text-sm font-semibold text-emerald-800 shadow-sm">
                  {priceUploadStatus}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
              <input
                id="price-table-pdf-input"
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(e) => {
                  uploadPriceTablePdf(e.target.files?.[0] || null);
                  e.currentTarget.value = "";
                }}
              />
              <label
                htmlFor="price-table-pdf-input"
                className={`inline-flex cursor-pointer items-center justify-center rounded-2xl px-6 py-4 text-sm font-black text-white shadow-sm transition ${
                  priceUploading ? "bg-slate-400" : "bg-emerald-600 hover:bg-emerald-700"
                }`}
              >
                {priceUploading ? "Lendo PDF..." : "Carregar PDF do dia"}
              </label>
              <a
                href="/crm/dashboard/quotes/catalog"
                className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm font-black text-slate-800 transition hover:bg-slate-50"
              >
                Ver catálogo PMG
              </a>
            </div>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)_420px]">
          <aside className="space-y-5">
            <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-black">Cliente</h2>
                <button
                  onClick={() => setQuickCustomerOpen(true)}
                  className="rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white transition hover:bg-emerald-700"
                >
                  Novo
                </button>
              </div>

              <label className="mt-4 block text-xs font-bold uppercase text-slate-500">
                Buscar cliente cadastrado
              </label>
              <input
                value={customerSearch}
                onChange={(e) => {
                  setCustomerSearch(e.target.value);
                  fetchCustomers(e.target.value);
                }}
                placeholder="Nome, ID/UUID, código, CNPJ ou WhatsApp"
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:bg-white"
              />

              <p className="mt-2 text-[11px] font-semibold leading-5 text-slate-400">
                Busca inteligente: use também “id:”, “cliente:”, “whatsapp:” ou “cnpj:”.
              </p>

              <div className="mt-3 max-h-56 space-y-2 overflow-auto pr-1">
                {customerSuggestions.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => selectCustomer(c)}
                    className={`w-full rounded-2xl border p-3 text-left text-sm transition ${
                      customerId === c.id ? "border-emerald-400 bg-emerald-50" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <div className="font-black text-slate-900">{c.trade_name || c.legal_name}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {[c.internal_code || c.erp_code, c.whatsapp, c.document].filter(Boolean).join(" • ") || "Cliente cadastrado"}
                    </div>
                  </button>
                ))}
                {!customerSuggestions.length && (
                  <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                    Nenhum cliente encontrado. Use o botão Novo para cadastrar rápido.
                  </div>
                )}
              </div>

              <div className="mt-4 grid gap-3">
                <input
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Nome que aparecerá na cotação"
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                />
                <input
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="ID interno opcional"
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-black">Preferência de envio</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Define como o cliente verá a cotação. Pode ser alterada mesmo depois de gerar, sem recalcular os itens.
              </p>
              <div className="mt-4 space-y-2">
                {displayModes.map((mode) => (
                  <button
                    key={mode.value}
                    onClick={() => void changeDisplayMode(mode.value)}
                    className={`w-full rounded-2xl border p-3 text-left transition ${
                      displayMode === mode.value
                        ? "border-emerald-400 bg-emerald-50"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <div className="text-sm font-black">{mode.title}</div>
                    <div className="mt-1 text-xs text-slate-500">{mode.desc}</div>
                  </button>
                ))}
              </div>

              <div className="mt-5 border-t border-slate-100 pt-5">
                <div className="text-sm font-black text-slate-900">ID do produto</div>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Usa o código oficial da coluna COD da tabela PMG ao lado do produto.
                </p>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setShowProductId(true)}
                    className={`rounded-2xl border px-3 py-3 text-sm font-black transition ${
                      showProductId
                        ? "border-emerald-400 bg-emerald-50 text-emerald-800"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    Com ID
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowProductId(false)}
                    className={`rounded-2xl border px-3 py-3 text-sm font-black transition ${
                      !showProductId
                        ? "border-emerald-400 bg-emerald-50 text-emerald-800"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    Sem ID
                  </button>
                </div>
              </div>
            </div>
          </aside>

          <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-xl font-black">Pedido do cliente</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Uma linha por item. Sem quantidade, o sistema assume 1. Você também pode usar "desconto 2% em todos".
                </p>
              </div>
              <button
                onClick={() => setRequestText("")}
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                Limpar
              </button>
            </div>

            <textarea
              value={requestText}
              onChange={(e) => setRequestText(e.target.value)}
              className="mt-5 min-h-[440px] w-full resize-y rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5 text-base leading-7 outline-none transition focus:border-emerald-500 focus:bg-white"
              placeholder={`Cole aqui o pedido recebido pelo WhatsApp:\ndesconto 2% em todos\nmussarela imperador\nfarinha 101\n5 caixas mussarela camila desconto 3%`}
            />

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-slate-500">
                {requestText.split(/\n/).filter((x) => x.trim()).length} linhas no pedido
              </div>
              <button
                disabled={loading}
                onClick={generateQuote}
                className="rounded-2xl bg-emerald-600 px-6 py-4 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Processando..." : "Buscar e confirmar produtos"}
              </button>
            </div>

            {status && (
              <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
                {status}
              </div>
            )}
          </section>

          <aside className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black">
                  Cotação pronta
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Envie como texto ou como uma imagem profissional.
                </p>
              </div>

              {quote?.total ? (
                <div className="shrink-0 rounded-2xl bg-slate-950 px-4 py-3 text-right text-white">
                  <p className="text-[10px] font-bold uppercase text-slate-300">
                    Total
                  </p>
                  <p className="text-sm font-black">
                    {moneyBR(quote.total)}
                  </p>
                </div>
              ) : null}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1.5">
              <button
                type="button"
                onClick={() =>
                  setQuotePreviewMode("text")
                }
                className={`rounded-xl px-3 py-2.5 text-xs font-black transition ${
                  quotePreviewMode === "text"
                    ? "bg-white text-slate-950 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Texto
              </button>

              <button
                type="button"
                onClick={() =>
                  setQuotePreviewMode("image")
                }
                className={`rounded-xl px-3 py-2.5 text-xs font-black transition ${
                  quotePreviewMode === "image"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Imagem
              </button>
            </div>

            <div className="mt-4 min-h-[480px] rounded-[1.5rem] border border-slate-200 bg-slate-50 p-3">
              {quote?.outputText ? (
                quotePreviewMode === "text" ? (
                  <pre className="whitespace-pre-wrap break-words p-1 font-sans text-sm leading-6 text-slate-800">
                    {quote.outputText}
                  </pre>
                ) : (
                  <div>
                    <QuoteVisualPreview
                      quote={quote}
                      clientName={clientName}
                      clientId={clientId}
                      showProductId={showProductId}
                    />

                    <div className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2.5 text-[11px] font-semibold leading-5 text-emerald-800">
                      A imagem final é gerada em alta resolução com o logo oficial PMG. Cotações normais mostram quantidade, preço unitário e total; pesquisas de “mais baratos” mostram o ranking e o preço de cada opção.
                    </div>
                  </div>
                )
              ) : (
                <div className="flex min-h-[420px] flex-col items-center justify-center text-center">
                  <div className="rounded-full bg-white px-4 py-2 text-xs font-black uppercase text-slate-400 shadow-sm">
                    Aguardando cotação
                  </div>

                  <p className="mt-4 max-w-xs text-sm leading-6 text-slate-500">
                    Depois da confirmação, você poderá usar a versão em texto ou gerar uma imagem comercial pronta para o cliente.
                  </p>
                </div>
              )}
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button
                disabled={!quote?.outputText}
                onClick={copyQuote}
                className="rounded-2xl bg-slate-950 px-4 py-3.5 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Copiar texto
              </button>

              <button
                disabled={
                  !quoteVisualRows.length ||
                  quoteImageLoading
                }
                onClick={copyQuoteImage}
                className="rounded-2xl bg-emerald-600 px-4 py-3.5 text-sm font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {quoteImageLoading
                  ? "Preparando..."
                  : "Copiar imagem"}
              </button>

              <button
                disabled={
                  !quoteVisualRows.length ||
                  quoteImageLoading
                }
                onClick={downloadQuoteImage}
                className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3.5 text-sm font-black text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Baixar imagem PNG
              </button>

              <button
                disabled={
                  !quoteVisualRows.length ||
                  quoteImageLoading
                }
                onClick={shareQuoteImage}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Compartilhar imagem
              </button>

              <button
                disabled={!quote?.outputText}
                onClick={saveQuote}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-black text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 sm:col-span-2"
              >
                Salvar cotação
              </button>
            </div>

            {quoteImageStatus && (
              <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-center text-xs font-semibold text-slate-600">
                {quoteImageStatus}
              </p>
            )}

            {savedStatus && (
              <p className="mt-2 text-center text-xs font-semibold text-slate-500">
                {savedStatus}
              </p>
            )}
          </aside>
        </section>
          </>
        ) : (
          <section className="space-y-5">
            <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <div className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-black uppercase tracking-wide text-emerald-700">
                    Biblioteca comercial
                  </div>
                  <h2 className="mt-3 text-2xl font-black text-slate-950">
                    Cotações salvas
                  </h2>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                    Busque por cliente, número da cotação, código ou produto. Abra a versão original ou carregue a mesma base para recotar com os preços atuais.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={fetchSavedQuotes}
                  disabled={savedQuotesLoading}
                  className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  {savedQuotesLoading ? "Atualizando..." : "Atualizar lista"}
                </button>
              </div>

              <div className="mt-6 grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_190px]">
                <input
                  value={savedQuoteSearch}
                  onChange={(e) => setSavedQuoteSearch(e.target.value)}
                  placeholder="Buscar ID, COT-..., cliente, produto ou código"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:bg-white"
                />

                <select
                  value={savedQuotePeriod}
                  onChange={(e) => setSavedQuotePeriod(e.target.value)}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-emerald-500"
                >
                  <option value="all">Todo período</option>
                  <option value="7">Últimos 7 dias</option>
                  <option value="30">Últimos 30 dias</option>
                  <option value="90">Últimos 90 dias</option>
                </select>

                <select
                  value={savedQuoteDiscount}
                  onChange={(e) => setSavedQuoteDiscount(e.target.value)}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-emerald-500"
                >
                  <option value="all">Todos os descontos</option>
                  <option value="with">Com desconto</option>
                  <option value="without">Sem desconto</option>
                </select>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500">
                <span className="rounded-full bg-slate-100 px-3 py-1.5">
                  {filteredSavedQuotes.length} cotação(ões)
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1.5">
                  Busca também dentro dos itens
                </span>
                <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-emerald-700">
                  ID/UUID • cliente • produto • código
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1.5">
                  Dica: id:, cliente:, produto:, codigo:, cotacao:
                </span>
              </div>

              {savedQuotesError && (
                <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-semibold text-red-700">
                  {savedQuotesError}
                </div>
              )}
            </div>

            {savedQuotesLoading && !savedQuotes.length ? (
              <div className="rounded-[2rem] border border-slate-200 bg-white p-10 text-center text-sm font-semibold text-slate-500 shadow-sm">
                Carregando cotações...
              </div>
            ) : filteredSavedQuotes.length ? (
              <div className="grid gap-4 xl:grid-cols-2">
                {filteredSavedQuotes.map((saved) => {
                  const items = Array.isArray(saved.items) ? saved.items : [];
                  const discountedItems = getDiscountedSavedItems(saved);
                  const totalDiscountAmount = getSavedQuoteDiscountAmount(saved);

                  const firstItems = items
                    .slice(0, 3)
                    .map((item) => item.name || item.code)
                    .filter(Boolean);

                  return (
                    <article
                      key={saved.id}
                      className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm"
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
                            {saved.quoteNumber || `Cotação ${saved.id.slice(0, 8)}`}
                          </div>

                          <h3 className="mt-3 truncate text-lg font-black text-slate-950">
                            {saved.customerName || "Cliente não identificado"}
                          </h3>

                          <p className="mt-1 text-xs font-semibold text-slate-500">
                            {formatSavedQuoteDate(saved.createdAt)}
                          </p>

                          <p className="mt-1 text-[10px] font-bold text-slate-400">
                            ID: {saved.id}
                          </p>
                        </div>

                        <div className="rounded-2xl bg-slate-950 px-4 py-3 text-right text-white">
                          <p className="text-[10px] font-bold uppercase text-slate-300">
                            Total
                          </p>
                          <p className="text-sm font-black">
                            {moneyBR(saved.total || 0)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold">
                        <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-600">
                          {Number(saved.itemCount || items.length)} item(ns)
                        </span>

                        {discountedItems.length > 0 ? (
                          <span className="rounded-full bg-amber-50 px-3 py-1.5 text-amber-700">
                            {discountedItems.length} com desconto
                          </span>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-500">
                            Sem desconto
                          </span>
                        )}

                        {totalDiscountAmount > 0 && (
                          <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-emerald-700">
                            Desconto interno {moneyBR(totalDiscountAmount)}
                          </span>
                        )}
                      </div>

                      <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                        <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                          Itens
                        </p>

                        <p className="mt-2 text-sm leading-6 text-slate-700">
                          {firstItems.length
                            ? firstItems.join(" • ")
                            : "Itens não disponíveis no histórico antigo."}
                          {items.length > 3 ? ` • +${items.length - 3}` : ""}
                        </p>
                      </div>

                      {discountedItems.length > 0 && (
                        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-[10px] font-black uppercase tracking-wide text-amber-700">
                              Condições internas
                            </p>
                            <span className="text-[10px] font-bold text-amber-700">
                              Não aparece ao cliente
                            </span>
                          </div>

                          <div className="mt-3 space-y-2">
                            {discountedItems.slice(0, 3).map((item, index) => (
                              <div
                                key={`${item.code || item.name || "item"}-${index}`}
                                className="flex items-start justify-between gap-3 text-xs"
                              >
                                <span className="min-w-0 font-semibold text-slate-700">
                                  {item.name || item.code || `Item ${index + 1}`}
                                </span>
                                <span className="shrink-0 rounded-full bg-white px-2.5 py-1 font-black text-amber-700">
                                  {formatPercentBR(item.discountPercent)}%
                                </span>
                              </div>
                            ))}

                            {discountedItems.length > 3 && (
                              <p className="text-xs font-bold text-amber-700">
                                +{discountedItems.length - 3} item(ns) com desconto
                              </p>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => setOpenedSavedQuote(saved)}
                          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50"
                        >
                          Abrir original
                        </button>

                        <button
                          type="button"
                          onClick={() => reuseSavedQuote(saved)}
                          className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white transition hover:bg-emerald-700"
                        >
                          Usar novamente
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
                <h3 className="text-lg font-black text-slate-900">
                  Nenhuma cotação encontrada
                </h3>
                <p className="mt-2 text-sm text-slate-500">
                  Ajuste os filtros ou salve uma nova cotação.
                </p>
              </div>
            )}
          </section>
        )}
      </div>

      {quickCustomerOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-950/40 p-3 backdrop-blur-sm sm:items-center sm:justify-center">
          <div className="w-full max-w-md rounded-[2rem] bg-white p-5 shadow-2xl">
            <h3 className="text-xl font-black">Cadastrar cliente rápido</h3>
            <p className="mt-1 text-sm text-slate-500">Depois você pode completar os dados na tela de clientes.</p>
            <div className="mt-5 grid gap-3">
              <input
                value={quickCustomerName}
                onChange={(e) => setQuickCustomerName(e.target.value)}
                placeholder="Nome ou empresa"
                className="rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-emerald-500"
              />
              <input
                value={quickCustomerDocument}
                onChange={(e) => setQuickCustomerDocument(e.target.value)}
                placeholder="CNPJ/CPF opcional"
                className="rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-emerald-500"
              />
            </div>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setQuickCustomerOpen(false)}
                className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 font-bold text-slate-600"
              >
                Cancelar
              </button>
              <button
                onClick={quickCreateCustomer}
                className="flex-1 rounded-2xl bg-emerald-600 px-4 py-3 font-black text-white"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmOpen && currentGroup && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 p-3 backdrop-blur-sm">
          <div className="mx-auto my-4 max-w-5xl rounded-[2rem] bg-white shadow-2xl">
            <div className="border-b border-slate-100 p-5 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase text-emerald-700">
                    Confirmação {currentConfirmIndex + 1} de {candidateGroups.length}
                  </p>
                  <h3 className="mt-1 text-2xl font-black">Confirme o produto correto</h3>
                  <p className="mt-2 text-sm text-slate-500">
                    Pedido original: <span className="font-bold text-slate-800">{currentGroup.raw}</span>
                  </p>
                </div>
                <button
                  onClick={() => setConfirmOpen(false)}
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600"
                >
                  Fechar
                </button>
              </div>
              <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-emerald-600" style={{ width: `${progress}%` }} />
              </div>
            </div>

            <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[300px_minmax(0,1fr)]">
              <aside className="space-y-4">
                <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                  <label className="text-xs font-black uppercase text-slate-500">Quantidade</label>
                  <input
                    type="number"
                    value={currentGroup.quantity}
                    onChange={(e) => updateCurrentGroup({ quantity: Number(e.target.value || 1) })}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-500"
                  />
                  <label className="mt-4 block text-xs font-black uppercase text-slate-500">Tipo/unidade</label>
                  <select
                    value={currentGroup.quantityUnit || ""}
                    onChange={(e) => updateCurrentGroup({ quantityUnit: e.target.value || null })}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-500"
                  >
                    {unitOptions.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>

                  <label className="mt-4 block text-xs font-black uppercase text-slate-500">Desconto interno</label>
                  <div className="mt-2 flex items-center rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <input
                      type="number"
                      step="0.1"
                      value={currentGroup.discountPercent || 0}
                      onChange={(e) => updateCurrentGroup({ discountPercent: Number(e.target.value || 0) })}
                      className="w-full bg-transparent text-sm outline-none"
                    />
                    <span className="text-sm font-bold text-slate-400">%</span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">Esse desconto não aparece para o cliente.</p>
                </div>

                <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4">
                  <label className="text-xs font-black uppercase text-slate-500">Buscar no catálogo</label>
                  <textarea
                    value={manualSearch}
                    onChange={(e) => setManualSearch(e.target.value)}
                    rows={3}
                    className="mt-2 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:bg-white"
                  />
                  <button
                    onClick={searchCatalog}
                    disabled={searching}
                    className="mt-3 w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white disabled:opacity-50"
                  >
                    {searching ? "Buscando..." : "Pesquisar novamente"}
                  </button>
                </div>

                <div className="rounded-[1.5rem] border border-emerald-200 bg-emerald-50 p-4">
                  <button
                    type="button"
                    onClick={() => {
                      setAddMoreOpen((value) => !value);
                      setAddMoreStatus("");
                    }}
                    className="w-full rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white transition hover:bg-emerald-700"
                  >
                    {addMoreOpen ? "Cancelar adição" : "+ Adicionar mais itens"}
                  </button>

                  {addMoreOpen && (
                    <div className="mt-3">
                      <label className="text-xs font-black uppercase text-emerald-800">
                        Novos itens
                      </label>
                      <textarea
                        value={addMoreText}
                        onChange={(e) => setAddMoreText(e.target.value)}
                        rows={4}
                        placeholder={"Ex.:\n2 farinha de trigo\n1 caixa requeijão"}
                        className="mt-2 w-full resize-y rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-500"
                      />
                      <p className="mt-2 text-xs leading-5 text-emerald-800">
                        Uma linha por item. Eles entram no mesmo checklist e na mesma cotação.
                      </p>
                      <button
                        type="button"
                        onClick={addMoreItemsToConfirmation}
                        disabled={addingMore || !addMoreText.trim()}
                        className="mt-3 w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white disabled:opacity-50"
                      >
                        {addingMore ? "Adicionando..." : "Buscar e adicionar"}
                      </button>
                    </div>
                  )}

                  {addMoreStatus && (
                    <div className="mt-3 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-emerald-800">
                      {addMoreStatus}
                    </div>
                  )}
                </div>

                <button
                  onClick={() => {
                    updateCurrentGroup({ skipped: true, selectedCode: null, selectedOptionId: null });
                    goNextConfirmation();
                  }}
                  className="w-full rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-black text-red-700"
                >
                  Pular este item
                </button>
              </aside>

              <section className="space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h4 className="font-black">Produtos encontrados</h4>
                    <span className="text-xs font-bold text-slate-500">
                      {filteredCurrentOptions.length} opções
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <label
                      htmlFor="quote-option-sort"
                      className="text-xs font-black uppercase text-slate-500"
                    >
                      Ordenar
                    </label>
                    <select
                      id="quote-option-sort"
                      value={optionSort}
                      onChange={(e) =>
                        setOptionSort(
                          e.target.value as
                            | "relevance"
                            | "az"
                            | "za"
                            | "price_asc"
                            | "price_desc"
                        )
                      }
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-emerald-500"
                    >
                      <option value="relevance">Mais relevantes</option>
                      <option value="az">Nome A → Z</option>
                      <option value="za">Nome Z → A</option>
                      <option value="price_asc">Menor preço</option>
                      <option value="price_desc">Maior preço</option>
                    </select>
                  </div>
                </div>

                <div className="max-h-[560px] space-y-3 overflow-y-auto pr-1">
                  {filteredCurrentOptions.map((option) => {
                    const selected = currentGroup.selectedOptionId ? currentGroup.selectedOptionId === option.id : currentGroup.selectedCode === option.code;
                    return (
                      <button
                        key={`${option.id || option.code}-${option.official_name}`}
                        onClick={() => updateCurrentGroup({ selectedCode: option.code, selectedOptionId: option.id, skipped: false })}
                        className={`w-full rounded-[1.5rem] border p-4 text-left transition ${
                          selected
                            ? "border-emerald-500 bg-emerald-50 shadow-sm"
                            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="text-sm font-black text-slate-950">{option.official_name}</div>
                            <div className="mt-1 text-xs text-slate-500">{optionSubtitle(option)}</div>
                            <div className="mt-2 text-xs font-bold text-emerald-700">{optionPrices(option)}</div>
                          </div>
                          <div className={`rounded-full px-3 py-1 text-xs font-black ${selected ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-500"}`}>
                            {selected ? "Selecionado" : "Selecionar"}
                          </div>
                        </div>
                      </button>
                    );
                  })}

                  {!filteredCurrentOptions.length && (
                    <div className="rounded-[1.5rem] border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                      Nenhum produto encontrado. Ajuste o campo de busca e clique em Pesquisar novamente.
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    onClick={goPrevConfirmation}
                    disabled={currentConfirmIndex === 0}
                    className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-600 disabled:opacity-40"
                  >
                    Voltar
                  </button>
                  <button
                    onClick={goNextConfirmation}
                    disabled={confirming || (!currentGroup.selectedCode && !currentGroup.skipped)}
                    className="rounded-2xl bg-emerald-600 px-6 py-3 text-sm font-black text-white disabled:opacity-40"
                  >
                    {currentConfirmIndex === candidateGroups.length - 1
                      ? confirming ? "Gerando..." : "Finalizar cotação"
                      : "Confirmar e próximo"}
                  </button>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {openedSavedQuote && (
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-950/50 p-3 backdrop-blur-sm">
          <div className="mx-auto my-4 max-w-5xl rounded-[2rem] bg-white shadow-2xl">
            <div className="border-b border-slate-100 p-5 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
                    {openedSavedQuote.quoteNumber || "Cotação salva"}
                  </div>

                  <h3 className="mt-3 text-2xl font-black text-slate-950">
                    {openedSavedQuote.customerName || "Cliente não identificado"}
                  </h3>

                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    {formatSavedQuoteDate(openedSavedQuote.createdAt)}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setOpenedSavedQuote(null)}
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600"
                >
                  Fechar
                </button>
              </div>
            </div>

            <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_320px]">
              <section>
                <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                    Versão original enviada
                  </p>

                  {openedSavedQuote.outputText ? (
                    <pre className="mt-4 whitespace-pre-wrap break-words font-sans text-sm leading-6 text-slate-800">
                      {openedSavedQuote.outputText}
                    </pre>
                  ) : (
                    <p className="mt-4 text-sm text-slate-500">
                      Esta cotação antiga não possui o texto final armazenado.
                    </p>
                  )}
                </div>

                {getDiscountedSavedItems(openedSavedQuote).length > 0 && (
                  <div className="mt-4 rounded-[1.5rem] border border-amber-200 bg-amber-50 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-xs font-black uppercase tracking-wide text-amber-700">
                          Condições comerciais internas
                        </p>
                        <p className="mt-1 text-xs font-semibold text-amber-800">
                          Informação exclusiva do vendedor. Não entra na cópia enviada ao cliente.
                        </p>
                      </div>

                      {getSavedQuoteDiscountAmount(openedSavedQuote) > 0 && (
                        <div className="rounded-xl bg-white px-3 py-2 text-right">
                          <p className="text-[10px] font-bold uppercase text-slate-400">
                            Desconto total
                          </p>
                          <p className="text-sm font-black text-amber-700">
                            {moneyBR(getSavedQuoteDiscountAmount(openedSavedQuote))}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 space-y-3">
                      {getDiscountedSavedItems(openedSavedQuote).map((item, index) => (
                        <div
                          key={`${item.code || item.name || "item"}-${index}`}
                          className="rounded-2xl border border-amber-100 bg-white p-4"
                        >
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <p className="text-sm font-black text-slate-900">
                                {item.name || item.code || `Item ${index + 1}`}
                              </p>
                              {item.code && (
                                <p className="mt-1 text-xs font-semibold text-slate-500">
                                  ID {item.code}
                                </p>
                              )}
                            </div>

                            <span className="shrink-0 rounded-full bg-amber-100 px-3 py-1.5 text-sm font-black text-amber-800">
                              {formatPercentBR(item.discountPercent)}%
                            </span>
                          </div>

                          <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
                            <div className="rounded-xl bg-slate-50 p-3">
                              <p className="font-bold uppercase text-slate-400">
                                Preço original
                              </p>
                              <p className="mt-1 font-black text-slate-800">
                                {moneyBR(item.originalUnitPrice || 0)}
                              </p>
                            </div>

                            <div className="rounded-xl bg-slate-50 p-3">
                              <p className="font-bold uppercase text-slate-400">
                                Preço final
                              </p>
                              <p className="mt-1 font-black text-slate-800">
                                {moneyBR(
                                  item.discountedUnitPrice ??
                                    item.unitPrice ??
                                    0
                                )}
                              </p>
                            </div>

                            <div className="rounded-xl bg-slate-50 p-3">
                              <p className="font-bold uppercase text-slate-400">
                                Desconto no item
                              </p>
                              <p className="mt-1 font-black text-amber-700">
                                {moneyBR(item.totalDiscountAmount || 0)}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>

              <aside className="space-y-4">
                <div className="rounded-[1.5rem] bg-slate-950 p-5 text-white">
                  <p className="text-xs font-bold uppercase text-slate-300">
                    Total salvo
                  </p>
                  <p className="mt-1 text-2xl font-black">
                    {moneyBR(openedSavedQuote.total || 0)}
                  </p>

                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl bg-white/10 p-3">
                      <p className="text-slate-300">Itens</p>
                      <p className="mt-1 font-black">
                        {openedSavedQuote.itemCount ||
                          openedSavedQuote.items?.length ||
                          0}
                      </p>
                    </div>

                    <div className="rounded-xl bg-white/10 p-3">
                      <p className="text-slate-300">Desconto</p>
                      <p className="mt-1 font-black">
                        {getDiscountedSavedItems(openedSavedQuote).length} item(ns)
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={!openedSavedQuote.outputText}
                  onClick={() => copySavedQuote(openedSavedQuote)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
                >
                  Copiar versão do cliente
                </button>

                <p className="-mt-2 text-center text-[11px] font-semibold leading-4 text-slate-500">
                  Copia somente a versão enviada. Os descontos internos não são incluídos.
                </p>

                <button
                  type="button"
                  onClick={() => reuseSavedQuote(openedSavedQuote)}
                  className="w-full rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white transition hover:bg-emerald-700"
                >
                  Criar nova baseada nesta
                </button>

                <div className="rounded-[1.5rem] border border-emerald-100 bg-emerald-50 p-4 text-xs leading-5 text-emerald-800">
                  A cotação original permanece intacta. Ao reutilizar, você volta ao Cotador e recalcula usando a tabela de preço atual.
                </div>
              </aside>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
