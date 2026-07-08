import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function isValidUuid(value: unknown): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "")
  );
}

async function resolveCompanyId(incomingCompanyId: unknown) {
  if (isValidUuid(incomingCompanyId)) return String(incomingCompanyId);

  const envCompany =
    process.env.NEXT_PUBLIC_DEFAULT_COMPANY_ID || process.env.DEFAULT_COMPANY_ID;

  if (isValidUuid(envCompany)) return String(envCompany);

  const company = await prisma.companies.findFirst({
    select: { id: true },
    orderBy: { created_at: "asc" },
  });

  return company?.id || null;
}

function asNumber(value: unknown, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (typeof value === "bigint") return Number(value);

  const raw = String(value).replace(/R\$/gi, "").trim();
  const normalized =
    raw.includes(",") && raw.includes(".")
      ? raw.replace(/\./g, "").replace(",", ".")
      : raw.replace(",", ".");

  const n = Number(normalized);
  return Number.isFinite(n) ? n : fallback;
}

function cleanString(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function normalizeQuoteItem(item: any) {
  const code =
    cleanString(item?.code) ||
    cleanString(item?.productCode) ||
    cleanString(item?.selectedCode) ||
    cleanString(item?.codigo);

  const name =
    cleanString(item?.name) ||
    cleanString(item?.productName) ||
    cleanString(item?.product) ||
    cleanString(item?.officialName) ||
    cleanString(item?.descricao) ||
    "Produto sem nome";

  const quantity = asNumber(item?.quantity ?? item?.qty ?? item?.quantidade, 0);
  const unit = cleanString(item?.unit ?? item?.quantityUnit ?? item?.sellUnit ?? item?.unidade);
  const unitPrice = asNumber(item?.unitPrice ?? item?.price ?? item?.precoUnitario, 0);
  const total = asNumber(item?.subtotal ?? item?.total ?? item?.totalItem, unitPrice * quantity);

  return {
    code,
    name,
    category: cleanString(item?.category ?? item?.categoria),
    subcategory: cleanString(item?.subcategory ?? item?.subcategoria),
    brand: cleanString(item?.brand ?? item?.marca),
    quantity,
    unit,
    unitPrice,
    total,
  };
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const companyId = await resolveCompanyId(
      searchParams.get("companyId") || searchParams.get("company_id")
    );

    if (!companyId) {
      return NextResponse.json({ error: "companyId obrigatório" }, { status: 400 });
    }

    const customerId = searchParams.get("customerId") || searchParams.get("customer_id");
    const limit = Math.min(Number(searchParams.get("limit") || 100), 500);

    const logs = await prisma.activity_logs.findMany({
      where: {
        company_id: companyId,
        action: "quote_saved",
        ...(customerId
          ? {
              metadata: {
                path: ["customerId"],
                equals: customerId,
              },
            }
          : {}),
      },
      orderBy: { created_at: "desc" },
      take: limit,
    });

    return NextResponse.json({
      success: true,
      quotes: logs.map((log) => ({
        id: log.id,
        companyId: log.company_id,
        createdAt: log.created_at,
        ...(typeof log.metadata === "object" && log.metadata ? (log.metadata as any) : {}),
      })),
    });
  } catch (error: any) {
    console.error("QUOTE_HISTORY_GET_ERROR", error);

    return NextResponse.json(
      { success: false, error: error?.message || "Erro ao buscar histórico de cotações." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const companyId = await resolveCompanyId(body.companyId || body.company_id);

    if (!companyId) {
      return NextResponse.json(
        { success: false, error: "companyId obrigatório ou inválido." },
        { status: 400 }
      );
    }

    const customerId = cleanString(body.customerId || body.customer_id);
    const customerInternalCode = cleanString(body.customerInternalCode || body.clientId || body.internalCode);
    const customerName = cleanString(body.customerName || body.clientName || body.name);

    if (!customerId && !customerInternalCode && !customerName) {
      return NextResponse.json(
        { success: false, error: "Selecione ou informe um cliente antes de salvar o histórico." },
        { status: 400 }
      );
    }

    const rawItems = Array.isArray(body.items) ? body.items : [];
    const items = rawItems.map(normalizeQuoteItem).filter((item) => item.name);

    const total = asNumber(
      body.total,
      items.reduce((sum, item) => sum + asNumber(item.total), 0)
    );

    const metadata = {
      source: "quotes_ai",
      type: "quote_history",
      status: "quoted",
      companyId,
      customerId,
      customerInternalCode,
      customerName,
      title: cleanString(body.title) || `Cotação ${customerName || customerInternalCode || ""}`.trim(),
      requestText: cleanString(body.requestText),
      outputText: cleanString(body.outputText),
      total,
      tableDate: cleanString(body.tableDate),
      priceDisplayMode: cleanString(body.priceDisplayMode),
      items,
      itemCount: items.length,
      createdAt: new Date().toISOString(),
      metadata: body.metadata || {},
    };

    const saved = await prisma.activity_logs.create({
      data: {
        company_id: companyId,
        user_id: isValidUuid(body.userId || body.user_id) ? String(body.userId || body.user_id) : null,
        action: "quote_saved",
        entity: "quote",
        metadata: toInputJson(metadata),
      },
    });

    return NextResponse.json({
      success: true,
      quoteId: saved.id,
      quote: {
        id: saved.id,
        createdAt: saved.created_at,
        ...metadata,
      },
    });
  } catch (error: any) {
    console.error("QUOTE_HISTORY_POST_ERROR", error);

    return NextResponse.json(
      { success: false, error: error?.message || "Erro ao salvar histórico da cotação." },
      { status: 500 }
    );
  }
}
