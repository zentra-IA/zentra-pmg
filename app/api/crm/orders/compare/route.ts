import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { prisma } from "@/lib/prisma";
import { compareTypedOrderWithOcr } from "../../../../../lib/products/pmg-commercial-engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ParsedItem = {
  code?: string | null;
  name?: string | null;
  quantity?: number | string | null;
  unit?: string | null;
};

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    const arrayMatch = text.match(/\[[\s\S]*\]/);
    if (arrayMatch) return JSON.parse(arrayMatch[0]);

    const objectMatch = text.match(/\{[\s\S]*\}/);
    if (objectMatch) return JSON.parse(objectMatch[0]);

    throw new Error("A IA não retornou JSON válido.");
  }
}

async function resolveCompanyId(req: NextRequest) {
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

async function parseTypedOrder(typedOrder: string): Promise<ParsedItem[]> {
  const prompt = `
Você é um conferente comercial da PMG Atacadista.

Extraia do pedido digitado APENAS os produtos e quantidades.
O sistema vai validar o produto no Catálogo PMG depois.
Não invente produto.
Não calcule valor.
Não compare com o espelho.
Se o vendedor escrever "caixa", "cx", "peça", "kg", "bisnaga", "pacote", mantenha isso no campo unit.

Retorne SOMENTE JSON válido neste formato:
[
  {
    "code": "código se existir",
    "name": "nome do produto como digitado",
    "quantity": 0,
    "unit": "caixa | kg | peça | pacote | bisnaga | unidade | null"
  }
]

Exemplos:
"2 caixas de requeijão tirolez sem amido" =>
[{"name":"requeijão tirolez sem amido","quantity":2,"unit":"caixa"}]

"47,3 kg muçarela frizzo" =>
[{"name":"muçarela frizzo","quantity":47.3,"unit":"kg"}]

Pedido digitado:
${typedOrder}
`;

  const result = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    messages: [{ role: "user", content: prompt }],
  });

  const text = result.choices[0]?.message?.content || "[]";
  const parsed = safeJsonParse(text);

  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.items)) return parsed.items;

  return [];
}

export async function POST(req: NextRequest) {
  try {
    const companyId = await resolveCompanyId(req);
    const { typedOrder, extracted } = await req.json();

    if (!typedOrder || !String(typedOrder).trim()) {
      return NextResponse.json(
        { error: "Cole o pedido digitado para fazer a conferência." },
        { status: 400 }
      );
    }

    if (!extracted?.items?.length) {
      return NextResponse.json(
        { error: "Leia o espelho com IA antes de comparar." },
        { status: 400 }
      );
    }

    const typedItems = await parseTypedOrder(String(typedOrder));

    const comparison = await compareTypedOrderWithOcr({
      companyId,
      typedItems,
      mirrorItems: extracted.items || [],
    });

    return NextResponse.json({
      ok: true,
      comparison,
    });
  } catch (error: any) {
    console.error("[POST /api/crm/orders/compare]", error);
    return NextResponse.json(
      { error: error?.message || "Erro ao conferir pedido." },
      { status: 500 }
    );
  }
}
