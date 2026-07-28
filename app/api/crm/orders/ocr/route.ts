import { NextRequest, NextResponse } from "next/server";
import sharp, { type Sharp } from "sharp";

import { openai } from "@/lib/openai";
import {
  summarizeCatalogValidation,
  validateOrderItemsWithCatalog,
} from "@/lib/product-catalog";
import { requireCompanyAccess } from "@/lib/server-company";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AnyItem = Record<string, any>;

type LiteralRow = {
  row_index: number;
  code: string | null;
  name: string | null;
  quantity: number | null;
  unit_price: number | null;
  discount: number | null;
  total: number | null;
};

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);

    if (!match) {
      throw new Error("A IA não retornou JSON válido.");
    }

    return JSON.parse(match[0]);
  }
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

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

function normalizeCode(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  const code = String(value).replace(/\D/g, "").trim();
  return code || null;
}

function normalizeName(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  const name = String(value).replace(/\s+/g, " ").trim();
  return name || null;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function rowMath(row: LiteralRow) {
  if (
    row.quantity === null ||
    row.unit_price === null ||
    row.total === null
  ) {
    return {
      valid: false,
      expected_total: null,
      difference: null,
      reason: "Campo numérico ilegível.",
    };
  }

  /*
   * Regra documental dos espelhos PMG:
   * Valor Total = Quantidade × Valor unitário.
   * A coluna Desconto é informativa e não é subtraída novamente.
   */
  const expectedTotal = roundMoney(
    row.quantity * row.unit_price
  );
  const difference = roundMoney(
    Math.abs(expectedTotal - row.total)
  );
  const valid = difference <= 0.06;

  return {
    valid,
    expected_total: expectedTotal,
    difference,
    reason: valid
      ? null
      : `${row.quantity} × ${row.unit_price.toFixed(
          2
        )} = ${expectedTotal.toFixed(
          2
        )}, mas o total lido foi ${row.total.toFixed(2)}.`,
  };
}

function normalizeRows(items: unknown): LiteralRow[] {
  if (!Array.isArray(items)) return [];

  return items
    .map((item: AnyItem, index: number) => ({
      row_index: Number(item?.row_index || index + 1),
      code: normalizeCode(item?.code),
      name: normalizeName(item?.name),
      quantity: toNumber(item?.quantity),
      unit_price: toNumber(item?.unit_price),
      discount: toNumber(item?.discount) ?? 0,
      total: toNumber(item?.total),
    }))
    .filter((item) => item.code || item.name)
    .sort((a, b) => a.row_index - b.row_index);
}

function extractionScore(rows: LiteralRow[]) {
  const codes = rows
    .map((row) => row.code)
    .filter(Boolean) as string[];

  const uniqueCodes = new Set(codes).size;
  const completeRows = rows.filter(
    (row) =>
      row.name &&
      row.quantity !== null &&
      row.unit_price !== null &&
      row.total !== null
  ).length;
  const validMathRows = rows.filter(
    (row) => rowMath(row).valid
  ).length;

  return (
    rows.length * 3 +
    uniqueCodes * 2 +
    completeRows * 3 +
    validMathRows * 6
  );
}

function imageDataUrl(buffer: Buffer) {
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

async function prepareImages(original: Buffer) {
  const metadata = await sharp(original).metadata();

  const width = metadata.width || 0;
  const height = metadata.height || 0;

  if (!width || !height) {
    throw new Error("Não foi possível identificar as dimensões da imagem.");
  }

  /*
   * Os prints vêm do mesmo sistema, mas com resoluções e recortes diferentes.
   * Por isso usamos proporções, não pixels fixos.
   */
  const scale =
    width < 700 || height < 500
      ? 5
      : width < 1100
        ? 4
        : 3;

  const tableTop = Math.max(
    0,
    Math.floor(height * 0.18)
  );
  const tableBottom = Math.min(
    height,
    Math.floor(height * 0.84)
  );
  const tableHeight = Math.max(
    1,
    tableBottom - tableTop
  );

  const numericLeft = Math.floor(width * 0.46);
  const numericWidth = Math.max(
    1,
    width - numericLeft
  );

  const enhance = (input: Sharp) =>
    input
      .resize({
        width: width * scale,
        kernel: sharp.kernel.lanczos3,
        withoutEnlargement: false,
      })
      .grayscale()
      .normalize()
      .sharpen({
        sigma: 1.2,
        m1: 1,
        m2: 2,
      })
      .png();

  const full = await enhance(
    sharp(original, { failOn: "none" })
  ).toBuffer();

  const table = await enhance(
    sharp(original, { failOn: "none" }).extract({
      left: 0,
      top: tableTop,
      width,
      height: tableHeight,
    })
  ).toBuffer();

  const numeric = await sharp(
    original,
    { failOn: "none" }
  )
    .extract({
      left: numericLeft,
      top: tableTop,
      width: numericWidth,
      height: tableHeight,
    })
    .resize({
      width: numericWidth * Math.max(scale, 5),
      kernel: sharp.kernel.lanczos3,
      withoutEnlargement: false,
    })
    .grayscale()
    .normalize()
    .sharpen({
      sigma: 1.3,
      m1: 1,
      m2: 2,
    })
    .png()
    .toBuffer();

  return {
    width,
    height,
    full,
    table,
    numeric,
  };
}

async function readFixedLayout(params: {
  full: Buffer;
  table: Buffer;
  numeric: Buffer;
}) {
  const prompt = `
Você é um TRANSCRITOR DE TABELAS do sistema PMG Atacadista.

As três imagens pertencem ao MESMO espelho:
1. imagem completa ampliada;
2. recorte ampliado da tabela;
3. recorte ampliado das colunas numéricas.

O layout é sempre:
Item | Produto | Quantidade | Valor (R$) | Desconto (R$) | Valor Total (R$)

OBJETIVO:
Copiar literalmente o documento. Não interpretar unidade, não converter
quantidade, não consultar catálogo e não trocar produto.

REGRAS ABSOLUTAS:
- Leia uma linha horizontal por vez, de cima para baixo.
- Código, produto, quantidade, valor, desconto e total devem vir da MESMA linha.
- Use row_index 1, 2, 3... conforme a ordem visual.
- Preserve exatamente a quantidade impressa.
- "20,000" em Quantidade vira 20.
- "47,300" em Quantidade vira 47.3.
- "1.010,88" em valor vira 1010.88.
- Valor Total deve ser conferido visualmente no recorte numérico.
- A coluna Desconto é apenas transcrita.
- Não use o desconto para alterar valor unitário ou total.
- Se um campo estiver realmente ilegível, use null. Nunca invente.
- Não copie números da linha anterior ou posterior.
- Não corrija o nome com base no código.
- Não adicione unidade à quantidade.
- Retorne SOMENTE JSON válido, sem markdown.

Formato:
{
  "order_number": string | null,
  "customer_id": string | null,
  "customer_name": string | null,
  "document": string | null,
  "seller_name": string | null,
  "seller_code": string | null,
  "payment_terms": string | null,
  "installments": number | null,
  "delivery_date": string | null,
  "address": string | null,
  "items": [
    {
      "row_index": number,
      "code": string | null,
      "name": string | null,
      "quantity": number | null,
      "unit_price": number | null,
      "discount": number | null,
      "total": number | null
    }
  ],
  "discount_total": number | null,
  "tax_total": number | null,
  "total": number | null,
  "raw_text": string,
  "ai_summary": string
}
`;

  const result = await openai.chat.completions.create({
    model: process.env.OPENAI_OCR_MODEL || "gpt-4o",
    temperature: 0,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image_url",
            image_url: {
              url: imageDataUrl(params.full),
              detail: "high",
            },
          },
          {
            type: "image_url",
            image_url: {
              url: imageDataUrl(params.table),
              detail: "high",
            },
          },
          {
            type: "image_url",
            image_url: {
              url: imageDataUrl(params.numeric),
              detail: "high",
            },
          },
        ],
      },
    ],
  });

  return safeJsonParse(
    result.choices[0]?.message?.content || "{}"
  );
}

async function repairInvalidRows(params: {
  table: Buffer;
  numeric: Buffer;
  header: AnyItem;
  rows: LiteralRow[];
}) {
  const invalidRows = params.rows
    .map((row) => ({
      ...row,
      validation: rowMath(row),
    }))
    .filter((row) => !row.validation.valid);

  if (!invalidRows.length) {
    return params.rows;
  }

  const prompt = `
Você é um REVISOR NUMÉRICO de uma tabela PMG.

As imagens mostram a tabela completa e as colunas numéricas ampliadas.

A extração abaixo possui linhas cuja conta não fechou:
${JSON.stringify(invalidRows)}

Para cada row_index listado:
- releia a mesma linha horizontal;
- preserve código e nome da extração;
- corrija APENAS quantity, unit_price, discount e total;
- não use números de outra linha;
- para validar visualmente, Quantity × Unit Price deve ser aproximadamente Total;
- a coluna Desconto é informativa;
- se não for possível ler, mantenha null;
- retorne SOMENTE JSON válido.

Formato:
{
  "items": [
    {
      "row_index": number,
      "quantity": number | null,
      "unit_price": number | null,
      "discount": number | null,
      "total": number | null
    }
  ]
}
`;

  const result = await openai.chat.completions.create({
    model:
      process.env.OPENAI_OCR_REPAIR_MODEL ||
      process.env.OPENAI_OCR_MODEL ||
      "gpt-4o",
    temperature: 0,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image_url",
            image_url: {
              url: imageDataUrl(params.table),
              detail: "high",
            },
          },
          {
            type: "image_url",
            image_url: {
              url: imageDataUrl(params.numeric),
              detail: "high",
            },
          },
        ],
      },
    ],
  });

  const parsed = safeJsonParse(
    result.choices[0]?.message?.content || "{}"
  );
  const repairs = normalizeRows(
    (parsed?.items || []).map((item: AnyItem) => {
      const original = params.rows.find(
        (row) =>
          row.row_index ===
          Number(item?.row_index)
      );

      return {
        ...original,
        ...item,
        code: original?.code,
        name: original?.name,
      };
    })
  );

  const repairMap = new Map(
    repairs.map((row) => [row.row_index, row])
  );

  return params.rows.map((row) => {
    const repair = repairMap.get(row.row_index);

    if (!repair) return row;

    /*
     * Só aceitamos a correção se a nova linha melhorar a validação.
     */
    const oldValid = rowMath(row).valid;
    const newValid = rowMath(repair).valid;

    if (!oldValid && newValid) {
      return repair;
    }

    return row;
  });
}

function getCatalogName(item: AnyItem): string | null {
  const candidates = [
    item?.catalog_name,
    item?.catalogName,
    item?.catalog_product_name,
    item?.catalogProductName,
    item?.product_name,
    item?.productName,
    item?.official_name,
    item?.officialName,
    item?.description,
    item?.product?.name,
    item?.product?.description,
    item?.catalogProduct?.name,
    item?.catalogProduct?.description,
    item?.matched_product?.name,
    item?.matchedProduct?.name,
    item?.matched?.name,
    item?.resolved_name,
    item?.resolvedName,
  ];

  const value = candidates.find(
    (candidate) =>
      typeof candidate === "string" &&
      candidate.trim()
  );

  return value
    ? String(value).trim()
    : null;
}

async function decorateWithCatalog(
  companyId: string,
  rows: LiteralRow[]
) {
  const validated =
    await validateOrderItemsWithCatalog(
      companyId,
      rows.map((row) => ({
        code: row.code,
        name: row.name,
        quantity: row.quantity,
        unit_price: row.unit_price,
        discount: row.discount,
        total: row.total,
      }))
    );

  return rows.map((row, index) => {
    const catalogItem =
      (validated as AnyItem[])?.[index] || {};
    const validation = rowMath(row);

    return {
      ...catalogItem,

      /*
       * Catálogo separado do documento.
       * Nunca substitui o texto ou os números transcritos.
       */
      catalog_name: getCatalogName(catalogItem),
      catalog_code:
        catalogItem?.catalog_code ||
        catalogItem?.catalogCode ||
        catalogItem?.official_code ||
        catalogItem?.officialCode ||
        catalogItem?.product?.code ||
        null,

      row_index: row.row_index,
      code: row.code,
      name: row.name,
      quantity: row.quantity,
      unit_price: row.unit_price,
      discount: row.discount,
      total: row.total,

      ocr_raw_code: row.code,
      ocr_raw_name: row.name,
      ocr_raw_quantity: row.quantity,
      ocr_raw_unit_price: row.unit_price,
      ocr_raw_discount: row.discount,
      ocr_raw_total: row.total,

      row_validation: validation,

      catalog_match: {
        ...(catalogItem?.catalog_match || {}),
        needs_review:
          Boolean(
            catalogItem?.catalog_match
              ?.needs_review
          ) || !validation.valid,
        literal_document_preserved: true,
      },

      needs_review:
        Boolean(catalogItem?.needs_review) ||
        Boolean(
          catalogItem?.catalog_match
            ?.needs_review
        ) ||
        !validation.valid,
    };
  });
}

export async function POST(req: NextRequest) {
  try {
    const access =
      await requireCompanyAccess(req);
    const companyId = access.companyId;

    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          error:
            "Envie uma imagem do espelho do pedido.",
        },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        {
          error:
            "OPENAI_API_KEY não configurada no .env.",
        },
        { status: 500 }
      );
    }

    const allowedTypes = new Set([
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/webp",
    ]);

    if (
      file.type &&
      !allowedTypes.has(file.type)
    ) {
      return NextResponse.json(
        {
          error:
            "Formato inválido. Envie PNG, JPG, JPEG ou WEBP.",
        },
        { status: 400 }
      );
    }

    if (file.size > 12 * 1024 * 1024) {
      return NextResponse.json(
        {
          error:
            "A imagem deve ter no máximo 12 MB.",
        },
        { status: 400 }
      );
    }

    const original = Buffer.from(
      await file.arrayBuffer()
    );
    const prepared =
      await prepareImages(original);

    const first =
      await readFixedLayout({
        full: prepared.full,
        table: prepared.table,
        numeric: prepared.numeric,
      });

    let rows = normalizeRows(first?.items);

    if (!rows.length) {
      return NextResponse.json(
        {
          error:
            "Nenhuma linha de produto foi identificada.",
        },
        { status: 422 }
      );
    }

    const originalScore =
      extractionScore(rows);

    rows = await repairInvalidRows({
      table: prepared.table,
      numeric: prepared.numeric,
      header: first,
      rows,
    });

    const repairedScore =
      extractionScore(rows);

    const items =
      await decorateWithCatalog(
        companyId,
        rows
      );

    const validation =
      summarizeCatalogValidation(items);

    const invalidRows = items.filter(
      (item: AnyItem) =>
        !item?.row_validation?.valid
    ).length;

    const extracted = {
      ...first,
      items,
      document_items: rows,

      extraction_mode:
        "fixed_layout_enhanced_adaptive_repair",
      literal_document_preserved: true,
      conversions_applied: false,

      image_analysis: {
        original_width: prepared.width,
        original_height: prepared.height,
        original_score: originalScore,
        final_score: repairedScore,
      },

      catalog_validation: validation,

      row_validation_summary: {
        total: items.length,
        valid:
          items.length - invalidRows,
        review: invalidRows,
      },

      ai_summary:
        invalidRows > 0
          ? `Espelho transcrito literalmente. ${invalidRows} linha(s) ainda precisam de revisão numérica. Nenhuma conversão comercial foi aplicada.`
          : "Espelho transcrito literalmente. Todas as linhas fecharam matematicamente. Nenhuma conversão comercial foi aplicada.",
    };

    return NextResponse.json({
      ok: true,
      extracted,
      provider: "openai",
      imageStored: false,
      catalogValidation: validation,
      literalDocumentPreserved: true,
      conversionsApplied: false,
    });
  } catch (error: unknown) {
    console.error(
      "[POST /api/crm/orders/ocr]",
      error
    );

    const message =
      error instanceof Error
        ? error.message
        : "Erro ao ler imagem do pedido.";

    const status =
      message.includes("não identificado") ||
      message.includes("sem acesso")
        ? 401
        : 500;

    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}
