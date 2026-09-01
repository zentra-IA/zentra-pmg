import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/server-company";

export const dynamic = "force-dynamic";

function toDecimal(value: any) {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;

  let str = String(value).trim().replace(/R\$/gi, "").replace(/\s/g, "");
  if (str.includes(",") && str.includes(".")) str = str.replace(/\./g, "").replace(",", ".");
  else if (str.includes(",")) str = str.replace(",", ".");

  const n = Number(str);
  return Number.isFinite(n) ? n : undefined;
}

function parseDateBR(value: any) {
  if (!value) return undefined;
  const raw = String(value).trim();
  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  const [, dd, mm, yyyy] = match;
  return new Date(`${yyyy}-${mm}-${dd}T12:00:00.000Z`);
}

function dateRangeFromParams(url: URL) {
  const period = url.searchParams.get("period") || "";
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const now = new Date();

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

  if (from || to) {
    return {
      gte: from ? startOfDay(new Date(`${from}T12:00:00`)) : undefined,
      lte: to ? endOfDay(new Date(`${to}T12:00:00`)) : undefined,
    };
  }

  if (period === "today") return { gte: startOfDay(now), lte: endOfDay(now) };

  if (period === "yesterday") {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    return { gte: startOfDay(d), lte: endOfDay(d) };
  }

  if (period === "7d") {
    const d = new Date(now);
    d.setDate(d.getDate() - 6);
    return { gte: startOfDay(d), lte: endOfDay(now) };
  }

  if (period === "month") {
    return {
      gte: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0),
      lte: endOfDay(now),
    };
  }

  return {};
}

type CompanyAccess = Awaited<ReturnType<typeof requireCompanyAccess>>;

type SearchScope =
  | "all"
  | "product"
  | "customer"
  | "order"
  | "seller";

function cleanSearch(value: string | null): string {
  return String(value || "").trim();
}

function stripSearchAccents(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function searchTokens(value: string): string[] {
  return cleanSearch(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
    .slice(0, 8);
}

function productTokenVariants(token: string): string[] {
  const normalized = stripSearchAccents(token);

  if (
    [
      "mussarela",
      "mucarela",
      "mozarela",
      "mozzarella",
    ].includes(normalized)
  ) {
    return [
      "mussarela",
      "muçarela",
      "mucarela",
      "mozarela",
      "mozzarella",
    ];
  }

  if (normalized === "requeijao") {
    return ["requeijao", "requeijão"];
  }

  return [token];
}

function parseSmartSearch(
  rawQuery: string,
  requestedScope: string
): { query: string; scope: SearchScope } {
  const query = cleanSearch(rawQuery);
  const allowed: SearchScope[] = [
    "all",
    "product",
    "customer",
    "order",
    "seller",
  ];

  let scope: SearchScope = allowed.includes(
    requestedScope as SearchScope
  )
    ? (requestedScope as SearchScope)
    : "all";

  if (!query || scope !== "all") {
    return { query, scope };
  }

  const prefix = query.match(
    /^(produto|item|cliente|pedido|vendedor)\s*[:#-]?\s+(.+)$/i
  );

  if (!prefix) {
    return { query, scope };
  }

  const prefixMap: Record<string, SearchScope> = {
    produto: "product",
    item: "product",
    cliente: "customer",
    pedido: "order",
    vendedor: "seller",
  };

  return {
    query: prefix[2].trim(),
    scope: prefixMap[prefix[1].toLowerCase()] || "all",
  };
}

function buildProductItemFilter(
  productQuery: string,
  productCode = ""
) {
  const conditions: any[] = [];

  const tokens = searchTokens(productQuery);

  for (const token of tokens) {
    const variants = productTokenVariants(token);

    conditions.push({
      OR: variants.flatMap((variant) => [
        {
          product_name: {
            contains: variant,
            mode: "insensitive",
          },
        },
        {
          product_code: {
            contains: variant,
            mode: "insensitive",
          },
        },
      ]),
    });
  }

  if (productCode) {
    conditions.push({
      product_code: {
        contains: productCode,
        mode: "insensitive",
      },
    });
  }

  if (!conditions.length) return null;

  return {
    SalesOrderItem: {
      some: {
        AND: conditions,
      },
    },
  };
}

function buildSmartSearchFilter(
  query: string,
  scope: SearchScope
) {
  if (!query) return null;

  if (scope === "product") {
    return buildProductItemFilter(query);
  }

  if (scope === "customer") {
    return {
      OR: [
        {
          customer_name: {
            contains: query,
            mode: "insensitive",
          },
        },
        {
          customer_internal_code: {
            contains: query,
            mode: "insensitive",
          },
        },
        {
          document: {
            contains: query,
            mode: "insensitive",
          },
        },
      ],
    };
  }

  if (scope === "order") {
    return {
      order_number: {
        contains: query,
        mode: "insensitive",
      },
    };
  }

  if (scope === "seller") {
    return {
      OR: [
        {
          seller_name: {
            contains: query,
            mode: "insensitive",
          },
        },
        {
          seller_code: {
            contains: query,
            mode: "insensitive",
          },
        },
      ],
    };
  }

  const productFilter = buildProductItemFilter(query);

  return {
    OR: [
      {
        order_number: {
          contains: query,
          mode: "insensitive",
        },
      },
      {
        customer_name: {
          contains: query,
          mode: "insensitive",
        },
      },
      {
        document: {
          contains: query,
          mode: "insensitive",
        },
      },
      {
        customer_internal_code: {
          contains: query,
          mode: "insensitive",
        },
      },
      {
        seller_name: {
          contains: query,
          mode: "insensitive",
        },
      },
      {
        seller_code: {
          contains: query,
          mode: "insensitive",
        },
      },
      {
        payment_terms: {
          contains: query,
          mode: "insensitive",
        },
      },
      ...(productFilter ? [productFilter] : []),
    ],
  };
}

function buildWhere(req: NextRequest, access: CompanyAccess) {
  const url = new URL(req.url);

  const rawQuery = cleanSearch(url.searchParams.get("q"));
  const searchIn = cleanSearch(
    url.searchParams.get("searchIn")
  );

  const status = cleanSearch(url.searchParams.get("status"));
  const sellerParam = cleanSearch(
    url.searchParams.get("seller_id")
  );

  const customer = cleanSearch(
    url.searchParams.get("customer")
  );
  const seller = cleanSearch(
    url.searchParams.get("seller")
  );
  const product = cleanSearch(
    url.searchParams.get("product")
  );
  const productCode = cleanSearch(
    url.searchParams.get("productCode")
  );
  const payment = cleanSearch(
    url.searchParams.get("payment")
  );

  const minTotal = toDecimal(
    url.searchParams.get("minTotal")
  );
  const maxTotal = toDecimal(
    url.searchParams.get("maxTotal")
  );

  const role = String(access.userRole || "").toUpperCase();
  const deliveryRange = dateRangeFromParams(url);

  const where: any = {
    company_id: access.companyId,
  };

  /*
   * Segurança permanece igual:
   * vendedor só pesquisa os próprios pedidos.
   * Os filtros nunca ampliam a carteira permitida.
   */
  if (role === "VENDEDOR") {
    where.seller_id = access.userId;
  } else if (role === "GERAL" && sellerParam) {
    where.seller_id = sellerParam;
  }

  if (status) {
    where.status = status;
  }

  if (deliveryRange.gte || deliveryRange.lte) {
    where.delivery_date = deliveryRange;
  }

  if (
    minTotal !== undefined ||
    maxTotal !== undefined
  ) {
    where.total = {
      ...(minTotal !== undefined
        ? { gte: minTotal }
        : {}),
      ...(maxTotal !== undefined
        ? { lte: maxTotal }
        : {}),
    };
  }

  const andFilters: any[] = [];

  if (customer) {
    andFilters.push({
      OR: [
        {
          customer_name: {
            contains: customer,
            mode: "insensitive",
          },
        },
        {
          customer_internal_code: {
            contains: customer,
            mode: "insensitive",
          },
        },
        {
          document: {
            contains: customer,
            mode: "insensitive",
          },
        },
      ],
    });
  }

  if (seller) {
    andFilters.push({
      OR: [
        {
          seller_name: {
            contains: seller,
            mode: "insensitive",
          },
        },
        {
          seller_code: {
            contains: seller,
            mode: "insensitive",
          },
        },
      ],
    });
  }

  if (payment) {
    andFilters.push({
      payment_terms: {
        contains: payment,
        mode: "insensitive",
      },
    });
  }

  const explicitProductFilter =
    buildProductItemFilter(product, productCode);

  if (explicitProductFilter) {
    andFilters.push(explicitProductFilter);
  }

  if (rawQuery) {
    const smartSearch = parseSmartSearch(
      rawQuery,
      searchIn
    );

    const smartFilter = buildSmartSearchFilter(
      smartSearch.query,
      smartSearch.scope
    );

    if (smartFilter) {
      andFilters.push(smartFilter);
    }
  }

  if (andFilters.length) {
    where.AND = andFilters;
  }

  return where;
}

function supervisorForbidden() {
  return NextResponse.json(
    { error: "Supervisor não possui acesso a esta rota operacional." },
    { status: 403 }
  );
}

export async function GET(req: NextRequest) {
  try {
    const access = await requireCompanyAccess(req);
    const role = String(access.userRole || "").toUpperCase();

    if (role === "SUPERVISOR") return supervisorForbidden();

    const url = new URL(req.url);
    const requestedLimit = Number(
      url.searchParams.get("limit") || 80
    );
    const requestedPage = Number(
      url.searchParams.get("page") || 1
    );

    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 10), 200)
      : 80;

    const page = Number.isFinite(requestedPage)
      ? Math.max(requestedPage, 1)
      : 1;
    const orderByParam = url.searchParams.get("orderBy") || "created_desc";
    const where = buildWhere(req, access);

    const orderBy =
      orderByParam === "value_desc"
        ? { total: "desc" as const }
        : orderByParam === "value_asc"
          ? { total: "asc" as const }
          : orderByParam === "oldest"
            ? { created_at: "asc" as const }
            : { created_at: "desc" as const };

    const [orders, totalRows, aggregate] = await Promise.all([
      prisma.salesOrder.findMany({
        where,
        include: { SalesCustomer: true, SalesOrderItem: true },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.salesOrder.count({ where }),
      prisma.salesOrder.aggregate({
        where,
        _sum: { total: true },
        _avg: { total: true },
      }),
    ]);

    const normalizedOrders = orders.map((order: any) => ({
      ...order,
      items: (order.SalesOrderItem || []).map((item: any) => ({
        ...item,
        code: item.product_code,
        name: item.product_name,
      })),
      customer: order.SalesCustomer || null,
    }));

    return NextResponse.json({
      orders: normalizedOrders,
      pagination: {
        page,
        limit,
        totalRows,
        totalPages: Math.max(Math.ceil(totalRows / limit), 1),
      },
      summary: {
        order_count: totalRows,
        total_sales: Number(aggregate._sum.total || 0),
        average_ticket: Number(aggregate._avg.total || 0),
      },
    });
  } catch (error) {
    console.error("[GET /api/crm/orders]", error);
    return NextResponse.json({ error: "Erro ao listar pedidos." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const access = await requireCompanyAccess(req);
    const role = String(access.userRole || "").toUpperCase();

    if (role === "SUPERVISOR") return supervisorForbidden();

    const company_id = access.companyId;
    const body = await req.json();
    const extracted = body.extracted || body;
    const seller_id =
      role === "VENDEDOR"
        ? access.userId
        : extracted.seller_id || body.seller_id || access.userId;

    const customerCode = extracted.customer_id || extracted.customerInternalCode || extracted.codigo_cliente || extracted.cliente_id;
    const document = extracted.document || extracted.cnpj_cpf || extracted.cnpj || extracted.cpf;
    const legalName = extracted.customer_name || extracted.cliente || extracted.legal_name || "Cliente sem nome";

    let customer = null;

    if (customerCode || document) {
      customer = await prisma.salesCustomer.findFirst({
        where: {
          company_id,
          ...(role === "VENDEDOR" ? { seller_id: access.userId } : {}),
          OR: [
            ...(customerCode ? [{ internal_code: String(customerCode) }] : []),
            ...(document ? [{ document: String(document) }] : []),
          ],
        },
      });
    }

    if (!customer && legalName) {
      customer = await prisma.salesCustomer.create({
        data: {
          company_id,
          seller_id,
          internal_code: customerCode ? String(customerCode) : undefined,
          document: document ? String(document) : undefined,
          legal_name: String(legalName),
          trade_name: extracted.trade_name || extracted.nome_fantasia || null,
          address: extracted.address || extracted.endereco || null,
          payment_terms: extracted.payment_terms || extracted.forma_pagamento || null,
          status: "ativo",
        },
      });
    }

    const paymentTerms = extracted.payment_terms || extracted.forma_pagamento || "";
    const deliveryDate = parseDateBR(extracted.delivery_date || extracted.data_entrega);
    let boletoDueDate: Date | undefined;

    const boletoMatch = String(paymentTerms).match(/boleto\s*(\d{1,2})\s*dias?/i);
    if (boletoMatch && deliveryDate) {
      boletoDueDate = new Date(deliveryDate);
      boletoDueDate.setDate(boletoDueDate.getDate() + Number(boletoMatch[1]));
    }

    const order = await prisma.salesOrder.create({
      data: {
        company_id,
        seller_id,
        customer_id: customer?.id,
        customer_internal_code: customerCode ? String(customerCode) : null,
        order_number: extracted.order_number || extracted.numero_pedido || null,
        customer_name: String(legalName),
        document: document ? String(document) : null,
        seller_name: extracted.seller_name || extracted.vendedor || null,
        seller_code: extracted.seller_code || extracted.codigo_vendedor || null,
        payment_terms: paymentTerms,
        installments: extracted.installments ? Number(extracted.installments) : undefined,
        delivery_date: deliveryDate,
        address: extracted.address || extracted.endereco || null,
        subtotal: toDecimal(extracted.subtotal),
        discount_total: toDecimal(extracted.discount_total || extracted.desconto_total),
        tax_total: toDecimal(extracted.tax_total),
        total: toDecimal(extracted.total || extracted.valor_total) || 0,
        status: extracted.status || "registrado",
        raw_text: extracted.raw_text || null,
        ai_summary: extracted.ai_summary || null,
        confidence: extracted.confidence ? Number(extracted.confidence) : 0,
        boleto_due_date: boletoDueDate,
        divergences: extracted.divergences || undefined,
        SalesOrderItem: {
          create: (extracted.items || []).map((item: any) => ({
            company_id,
            product_code: item.code || item.codigo || item.product_code || null,
            product_name: item.name || item.produto || item.product_name || "Produto sem nome",
            quantity: toDecimal(item.quantity || item.quantidade) || 0,
            unit_price: toDecimal(item.unit_price || item.valor_unitario || item.valor) || 0,
            discount: toDecimal(item.discount || item.desconto) || 0,
            total: toDecimal(item.total || item.valor_total) || 0,
          })),
        },
      },
      include: { SalesOrderItem: true, SalesCustomer: true },
    });

    if (customer?.id) {
      await prisma.salesCustomer.update({
        where: { id: customer.id },
        data: {
          last_order_at: new Date(),
          payment_terms: paymentTerms || customer.payment_terms,
        },
      });
    }

    return NextResponse.json({
      order: {
        ...order,
        items: ((order as any).SalesOrderItem || []).map((item: any) => ({
          ...item,
          code: item.product_code,
          name: item.product_name,
        })),
        customer: (order as any).SalesCustomer || null,
      },
    });
  } catch (error) {
    console.error("[POST /api/crm/orders]", error);
    return NextResponse.json({ error: "Erro ao salvar pedido." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const access = await requireCompanyAccess(req);
    const role = String(access.userRole || "").toUpperCase();

    if (role === "SUPERVISOR") return supervisorForbidden();

    const body = await req.json();

    if (!body.id) {
      return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
    }

    const existing = await prisma.salesOrder.findFirst({
      where: {
        id: body.id,
        company_id: access.companyId,
        ...(role === "VENDEDOR" ? { seller_id: access.userId } : {}),
      },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Pedido não encontrado ou sem permissão." },
        { status: 404 }
      );
    }

    const order = await prisma.salesOrder.update({
      where: { id: existing.id },
      data: {
        order_number: body.order_number ?? undefined,
        customer_name: body.customer_name ?? undefined,
        payment_terms: body.payment_terms ?? undefined,
        status: body.status ?? undefined,
        delivery_date: body.delivery_date ? parseDateBR(body.delivery_date) : undefined,
        total: body.total !== undefined ? toDecimal(body.total) : undefined,
        commercial_notes: body.commercial_notes ?? undefined,
      },
      include: { SalesOrderItem: true, SalesCustomer: true },
    });

    return NextResponse.json({
      order: {
        ...order,
        items: ((order as any).SalesOrderItem || []).map((item: any) => ({
          ...item,
          code: item.product_code,
          name: item.product_name,
        })),
        customer: (order as any).SalesCustomer || null,
      },
    });
  } catch (error) {
    console.error("[PATCH /api/crm/orders]", error);
    return NextResponse.json({ error: "Erro ao editar pedido." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const access = await requireCompanyAccess(req);
    const role = String(access.userRole || "").toUpperCase();

    if (role === "SUPERVISOR") return supervisorForbidden();

    const id = new URL(req.url).searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
    }

    const existing = await prisma.salesOrder.findFirst({
      where: {
        id,
        company_id: access.companyId,
        ...(role === "VENDEDOR" ? { seller_id: access.userId } : {}),
      },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Pedido não encontrado ou sem permissão." },
        { status: 404 }
      );
    }

    await prisma.$transaction([
      prisma.salesOrderItem.deleteMany({ where: { order_id: existing.id } }),
      prisma.salesOrderOcr.deleteMany({ where: { order_id: existing.id } }),
      prisma.salesOrder.delete({ where: { id: existing.id } }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[DELETE /api/crm/orders]", error);
    return NextResponse.json({ error: "Erro ao excluir pedido." }, { status: 500 });
  }
}
