import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/server-company";

export const dynamic = "force-dynamic";

function asNumber(value: unknown, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }
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

  const quantity = asNumber(
    item?.quantity ?? item?.qty ?? item?.quantidade,
    0
  );

  const unit = cleanString(
    item?.unit ??
      item?.quantityUnit ??
      item?.sellUnit ??
      item?.unidade
  );

  const unitPrice = asNumber(
    item?.unitPrice ?? item?.price ?? item?.precoUnitario,
    0
  );

  const total = asNumber(
    item?.subtotal ?? item?.total ?? item?.totalItem,
    unitPrice * quantity
  );

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
  return JSON.parse(
    JSON.stringify(value ?? null)
  ) as Prisma.InputJsonValue;
}

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export async function GET(req: NextRequest) {
  try {
    const access = await requireCompanyAccess(req);
    const companyId = access.companyId;
    const userId = access.userId;
    const role = String(access.userRole || "").toUpperCase();

    if (role === "SUPERVISOR") {
      return NextResponse.json(
        { error: "Acesso negado." },
        { status: 403 }
      );
    }

    if (!companyId || !userId) {
      return NextResponse.json(
        { error: "Empresa ou usuário não identificado." },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);

    const customerId =
      searchParams.get("customerId") ||
      searchParams.get("customer_id");

    const requestedLimit = Number(searchParams.get("limit") || 100);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 500)
      : 100;

    const logs = await prisma.activity_logs.findMany({
      where: {
        company_id: companyId,
        action: "quote_saved",
        ...(role === "VENDEDOR" ? { user_id: userId } : {}),
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
        ...(typeof log.metadata === "object" && log.metadata
          ? (log.metadata as any)
          : {}),
      })),
    });
  } catch (error: any) {
    console.error("QUOTE_HISTORY_GET_ERROR", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ||
          "Erro ao buscar histórico de cotações.",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const access = await requireCompanyAccess(req);
    const companyId = access.companyId;
    const userId = access.userId;
    const role = String(access.userRole || "").toUpperCase();

    if (role === "SUPERVISOR") {
      return NextResponse.json(
        { error: "Acesso negado." },
        { status: 403 }
      );
    }

    if (!companyId || !userId) {
      return NextResponse.json(
        {
          success: false,
          error: "Empresa ou usuário não identificado.",
        },
        { status: 401 }
      );
    }

    const body = await req.json();

    const incomingCustomerId = cleanString(
      body.customerId || body.customer_id
    );

    const customerInternalCode = cleanString(
      body.customerInternalCode ||
        body.clientId ||
        body.internalCode
    );

    const customerName = cleanString(
      body.customerName ||
        body.clientName ||
        body.name
    );

    if (
      !incomingCustomerId &&
      !customerInternalCode &&
      !customerName
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Selecione ou informe um cliente antes de salvar o histórico.",
        },
        { status: 400 }
      );
    }

    const rawItems = Array.isArray(body.items) ? body.items : [];
    const items = rawItems
      .map(normalizeQuoteItem)
      .filter((item) => item.name);

    const total = asNumber(
      body.total,
      items.reduce(
        (sum, item) => sum + asNumber(item.total),
        0
      )
    );

    /*
     * Resolve o cliente antes de salvar o histórico.
     *
     * Ordem:
     * 1. ID do cliente;
     * 2. código interno/ERP;
     * 3. nome empresarial ou fantasia.
     *
     * O select é intencionalmente pequeno para não carregar dados
     * desnecessários nem alterar o fluxo já existente da cotação.
     */
    let resolvedCustomer: {
      id: string;
      seller_id: string | null;
    } | null = null;

    if (incomingCustomerId) {
      resolvedCustomer = await prisma.salesCustomer.findFirst({
        where: {
          company_id: companyId,
          id: incomingCustomerId,
          ...(role === "VENDEDOR" ? { seller_id: userId } : {}),
        },
        select: {
          id: true,
          seller_id: true,
        },
      });
    }

    if (!resolvedCustomer && customerInternalCode) {
      resolvedCustomer = await prisma.salesCustomer.findFirst({
        where: {
          company_id: companyId,
          ...(role === "VENDEDOR" ? { seller_id: userId } : {}),
          OR: [
            { internal_code: customerInternalCode },
            { erp_code: customerInternalCode },
          ],
        },
        select: {
          id: true,
          seller_id: true,
        },
      });
    }

    if (!resolvedCustomer && customerName) {
      resolvedCustomer = await prisma.salesCustomer.findFirst({
        where: {
          company_id: companyId,
          ...(role === "VENDEDOR" ? { seller_id: userId } : {}),
          OR: [
            {
              legal_name: {
                equals: customerName,
                mode: "insensitive",
              },
            },
            {
              trade_name: {
                equals: customerName,
                mode: "insensitive",
              },
            },
          ],
        },
        select: {
          id: true,
          seller_id: true,
        },
      });
    }

    const customerId =
      resolvedCustomer?.id || incomingCustomerId || null;

    const authenticatedUserId = userId;

    const sellerId =
      role === "VENDEDOR"
        ? userId
        : resolvedCustomer?.seller_id || userId;

    const metadata = {
      source: "quotes_ai",
      type: "quote_history",
      status: "quoted",
      companyId,
      userId: authenticatedUserId,
      customerId,
      customerInternalCode,
      customerName,
      title:
        cleanString(body.title) ||
        `Cotação ${
          customerName || customerInternalCode || ""
        }`.trim(),
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

    /*
     * Mantém o comportamento original:
     * o histórico da cotação continua sendo salvo em activity_logs.
     */
    const saved = await prisma.activity_logs.create({
      data: {
        company_id: companyId,
        user_id: authenticatedUserId,
        action: "quote_saved",
        entity: "quote",
        metadata: toInputJson(metadata),
      },
    });

    /*
     * Sincronização adicional para o Command Center.
     *
     * Ela fica isolada em try/catch para que um problema pontual na
     * sincronização não impeça o histórico da cotação de ser salvo.
     */
    let commandCenterSync = {
      customerResolved: Boolean(resolvedCustomer),
      customerUpdated: false,
      activityCreated: false,
      warning: null as string | null,
    };

    if (resolvedCustomer) {
      try {
        const quotedAt = new Date();

        await prisma.$transaction([
          prisma.salesCustomer.updateMany({
            where: {
              id: resolvedCustomer.id,
              company_id: companyId,
              ...(role === "VENDEDOR"
                ? { seller_id: userId }
                : {}),
            },
            data: {
              last_quote_at: quotedAt,
            },
          }),

          prisma.salesCustomerActivity.create({
            data: {
              company_id: companyId,
              seller_id: sellerId,
              customer_id: resolvedCustomer.id,
              lead_id: null,
              phone: null,
              type: "cotacao",
              origin: "quotes_ai",
              title: "Cotação gerada",
              description: `Cotação gerada com ${
                items.length
              } item(ns), no valor total de ${formatCurrency(
                total
              )}.`,
              priority: "media",
              status: "concluida",
              created_at: quotedAt,
            },
          }),
        ]);

        commandCenterSync = {
          customerResolved: true,
          customerUpdated: true,
          activityCreated: true,
          warning: null,
        };
      } catch (syncError: any) {
        console.error(
          "QUOTE_HISTORY_COMMAND_CENTER_SYNC_ERROR",
          syncError
        );

        commandCenterSync.warning =
          syncError?.message ||
          "A cotação foi salva, mas não foi possível sincronizar o Command Center.";
      }
    } else {
      commandCenterSync.warning =
        "A cotação foi salva, mas o cliente não foi localizado no SalesCustomer para atualizar o Command Center.";
    }

    return NextResponse.json({
      success: true,
      quoteId: saved.id,
      quote: {
        id: saved.id,
        createdAt: saved.created_at,
        ...metadata,
      },
      commandCenterSync,
    });
  } catch (error: any) {
    console.error("QUOTE_HISTORY_POST_ERROR", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ||
          "Erro ao salvar histórico da cotação.",
      },
      { status: 500 }
    );
  }
}
