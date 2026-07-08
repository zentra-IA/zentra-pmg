import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import {
  validateOrderItemsWithCatalog,
  summarizeCatalogValidation,
} from "@/lib/product-catalog";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AnyItem = Record<string, any>;

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("A IA não retornou JSON válido.");
    return JSON.parse(match[0]);
  }
}

function normalizeText(value: any) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toNumber(value: any): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  let text = String(value).trim();

  // Remove currency and spaces.
  text = text.replace(/[R$\s]/gi, "");

  // Brazilian format: 1.234,56 -> 1234.56
  if (/^\d{1,3}(\.\d{3})+,\d+$/.test(text)) {
    text = text.replace(/\./g, "").replace(",", ".");
  } else if (text.includes(",") && !text.includes(".")) {
    text = text.replace(",", ".");
  } else if (text.includes(",") && text.includes(".")) {
    // Prefer comma as decimal when both exist.
    text = text.replace(/\./g, "").replace(",", ".");
  }

  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeOcrItem(item: AnyItem): AnyItem {
  return {
    ...item,
    code: item?.code === null || item?.code === undefined ? null : String(item.code).replace(/\D/g, "").trim() || null,
    name: item?.name ? String(item.name).replace(/\s+/g, " ").trim() : null,
    quantity: toNumber(item?.quantity),
    unit_price: toNumber(item?.unit_price),
    discount: toNumber(item?.discount) ?? 0,
    total: toNumber(item?.total),
  };
}

function tokenSet(value: any) {
  const stop = new Set([
    "DE",
    "DO",
    "DA",
    "DAS",
    "DOS",
    "COM",
    "SEM",
    "E",
    "A",
    "O",
    "AS",
    "OS",
    "KG",
    "G",
    "CX",
    "PC",
    "PCT",
    "UN",
    "BIS",
    "FD",
    "FDO",
    "GR",
  ]);

  return new Set(
    normalizeText(value)
      .split(" ")
      .filter((t) => t.length >= 3 && !stop.has(t))
  );
}

function tokenSimilarity(a: any, b: any) {
  const A = tokenSet(a);
  const B = tokenSet(b);
  if (!A.size || !B.size) return 0;

  let inter = 0;
  for (const token of A) {
    if (B.has(token)) inter += 1;
  }

  return inter / Math.max(A.size, B.size);
}

function getCatalogName(item: AnyItem): string {
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

  return String(candidates.find((v) => typeof v === "string" && v.trim()) || item?.name || "").trim();
}

function getConfidence(item: AnyItem): number {
  const candidates = [
    item?.confidence,
    item?.match_confidence,
    item?.matchConfidence,
    item?.catalog_confidence,
    item?.score,
    item?.similarity,
  ];

  for (const value of candidates) {
    const n = Number(value);
    if (Number.isFinite(n)) return n <= 1 ? n * 100 : n;
  }

  return 0;
}

/**
 * Validação inteligente para espelho PMG.
 *
 * Regra principal:
 * - Código confiável manda.
 * - Mas se a IA leu um CÓDIGO que aponta para um produto totalmente diferente do NOME bruto lido,
 *   isso é forte sinal de OCR desalinhado de coluna/linha.
 * - Nesse caso, revalidamos aquele item SEM código, usando o nome bruto.
 *
 * Exemplo real:
 *   OCR: code 3935 + name "CHANTILLY SPRAY POLENGHI..."
 *   Catálogo pelo código 3935: "MUÇARELA ALTO DO VALE..."
 *   Similaridade baixa => código provavelmente foi lido errado => fallback por nome.
 */
async function validateOrderItemsWithCatalogSmart(companyId: string, rawItems: AnyItem[]) {
  const normalizedRawItems = rawItems.map(normalizeOcrItem);

  const firstPass = await validateOrderItemsWithCatalog(companyId, normalizedRawItems);

  const finalItems = await Promise.all(
    normalizedRawItems.map(async (raw, index) => {
      const validated = (firstPass as AnyItem[])?.[index] || raw;

      const rawName = raw?.name || "";
      const officialByCode = getCatalogName(validated);
      const code = String(raw?.code || "").trim();

      const similarity = tokenSimilarity(rawName, officialByCode);

      // Só tenta fallback quando há código + nome útil + conflito forte.
      const hasUsefulRawName = tokenSet(rawName).size >= 2;
      const shouldTryNameFallback =
        Boolean(code) &&
        hasUsefulRawName &&
        officialByCode &&
        similarity > 0 &&
        similarity < 0.22;

      if (!shouldTryNameFallback) {
        return {
          ...validated,
          ocr_raw_name: rawName,
          ocr_raw_code: code || null,
          ocr_name_catalog_similarity: similarity,
        };
      }

      const fallbackInput = {
        ...raw,
        code: null,
        ocr_suspected_wrong_code: code,
      };

      const fallbackValidated = (await validateOrderItemsWithCatalog(companyId, [fallbackInput]))?.[0] as AnyItem;
      const fallbackOfficial = getCatalogName(fallbackValidated);
      const fallbackSimilarity = tokenSimilarity(rawName, fallbackOfficial);
      const fallbackConfidence = getConfidence(fallbackValidated);
      const firstConfidence = getConfidence(validated);

      // Usa fallback somente se ele combina bem mais com o nome lido.
      if (fallbackOfficial && fallbackSimilarity >= 0.35 && fallbackSimilarity > similarity && fallbackConfidence >= firstConfidence) {
        return {
          ...fallbackValidated,
          ocr_raw_name: rawName,
          ocr_raw_code: code || null,
          ocr_corrected_by: "name_fallback_due_code_name_conflict",
          ocr_warning:
            `Código lido (${code}) parecia incompatível com o nome OCR. Produto resolvido pelo nome bruto do espelho.`,
        };
      }

      // Se não deu para confiar no fallback, não inventa: mantém primeiro passe, mas marca revisão.
      return {
        ...validated,
        ocr_raw_name: rawName,
        ocr_raw_code: code || null,
        ocr_name_catalog_similarity: similarity,
        needs_review: true,
        status: validated?.status === "confirmed" ? "review" : validated?.status,
        ocr_warning:
          `Possível conflito entre código (${code}) e nome OCR (${rawName}). Revisar manualmente.`,
      };
    })
  );

  return finalItems;
}

async function getCompanyId(req: NextRequest) {
  const fromCookie =
    req.cookies.get("zentra_company_id")?.value ||
    req.cookies.get("company_id")?.value ||
    "";

  const fromHeader = req.headers.get("x-company-id") || "";
  const candidate = String(fromHeader || fromCookie || "").trim();

  if (candidate) return candidate;

  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT id
    FROM companies
    WHERE COALESCE(active, true) = true
    ORDER BY created_at ASC NULLS LAST
    LIMIT 1
  `);

  const firstCompanyId = rows?.[0]?.id ? String(rows[0].id) : "";

  if (!firstCompanyId) {
    throw new Error("Empresa não identificada. Faça login novamente ou cadastre uma empresa primeiro.");
  }

  return firstCompanyId;
}

export async function POST(req: NextRequest) {
  try {
    const companyId = await getCompanyId(req);
    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Envie uma imagem do espelho do pedido." }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY não configurada no .env." },
        { status: 500 }
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const mime = file.type || "image/jpeg";
    const base64 = bytes.toString("base64");

    const prompt = `
Você é uma IA especialista em LEITURA FIEL de espelhos de Pedido de Venda da PMG Atacadista.

IMPORTANTE:
Você NÃO é catálogo.
Você NÃO corrige produto.
Você NÃO deve adivinhar produto.
Você NÃO deve substituir um produto por outro parecido.
Você deve apenas ler a tabela do espelho.

O documento tem uma tabela com colunas nesta ordem:
Item | Produto | Quantidade | Valor (R$) | Desconto (R$) | Valor Total (R$)

Para cada linha:
1. Leia o código da primeira coluna "Item".
2. Leia o produto exatamente como aparece na segunda coluna.
3. Leia a quantidade da coluna "Quantidade".
4. Leia valor, desconto e total das colunas corretas.

REGRAS CRÍTICAS:
- Cada item da resposta deve representar UMA linha real da tabela.
- Nunca misture código de uma linha com produto de outra linha.
- Nunca use conhecimento próprio para corrigir produto.
- Se uma palavra estiver difícil, retorne o trecho parcial em "name".
- Se o código estiver ilegível, use null.
- Se o nome estiver ilegível, use o texto parcial, não invente.
- Preserve nomes como aparecem, mesmo com erro de OCR.
- Use ponto como separador decimal.
- Quantidade "47,300" deve virar 47.3.
- Valores brasileiros como "1.010,88" devem virar 1010.88.
- Retorne SOMENTE JSON válido, sem markdown.

Formato obrigatório:
{
  "order_number": "número do pedido",
  "customer_id": "ID numérico do cliente que aparece após Cliente:",
  "customer_name": "nome do cliente",
  "document": "CNPJ/CPF",
  "seller_name": "vendedor",
  "seller_code": "código do vendedor se existir",
  "payment_terms": "forma de pagamento completa",
  "installments": número de parcelas ou null,
  "delivery_date": "DD/MM/AAAA",
  "address": "endereço completo",
  "items": [
    {
      "code": "código do produto exatamente como aparece na primeira coluna",
      "name": "texto bruto do produto exatamente como aparece na segunda coluna",
      "quantity": número,
      "unit_price": número,
      "discount": número,
      "total": número
    }
  ],
  "discount_total": número,
  "tax_total": número,
  "total": número,
  "confidence": 0 a 100,
  "raw_text": "texto bruto resumido que você conseguiu ler",
  "ai_summary": "resumo comercial curto do pedido"
}

Checklist antes de responder:
- A quantidade de itens em "items" deve ser igual ao número de linhas reais da tabela.
- O código, nome e quantidade devem vir da mesma linha.
- Se estiver em dúvida entre dois produtos, NÃO escolha outro produto. Retorne o texto que aparece ou null.
`;

    const result = await openai.chat.completions.create({
      // gpt-4o tem leitura visual melhor que gpt-4o-mini para tabelas pequenas.
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
                url: `data:${mime};base64,${base64}`,
                detail: "high",
              },
            },
          ],
        },
      ],
    });

    const text = result.choices[0]?.message?.content || "{}";
    const extracted = safeJsonParse(text);

    const rawItems = Array.isArray(extracted.items) ? extracted.items : [];
    const validatedItems = await validateOrderItemsWithCatalogSmart(companyId, rawItems);

    const validation = summarizeCatalogValidation(validatedItems);

    const extractedWithCatalog = {
      ...extracted,
      items: validatedItems,
      catalog_validation: validation,
      ai_summary:
        validation.review > 0
          ? `${extracted.ai_summary || "Pedido lido."} Atenção: ${validation.review} produto(s) precisam de revisão manual.`
          : extracted.ai_summary || "Pedido lido e validado pelo catálogo PMG.",
    };

    return NextResponse.json({
      ok: true,
      extracted: extractedWithCatalog,
      provider: "openai",
      imageStored: false,
      catalogValidation: validation,
    });
  } catch (error: any) {
    console.error("[POST /api/crm/orders/ocr]", error);
    return NextResponse.json(
      { error: error?.message || "Erro ao ler imagem do pedido." },
      { status: 500 }
    );
  }
}
