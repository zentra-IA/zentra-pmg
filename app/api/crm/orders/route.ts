import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function getCompanyId(req: NextRequest) {
  return (
    req.headers.get("x-company-id") ||
    req.cookies.get("company_id")?.value ||
    process.env.DEFAULT_COMPANY_ID ||
    ""
  );
}

function getSellerId(req: NextRequest) {
  return (
    req.headers.get("x-user-id") ||
    req.cookies.get("user_id")?.value ||
    undefined
  );
}

function getRole(req: NextRequest) {
  return (
    req.headers.get("x-user-role") ||
    req.cookies.get("user_role")?.value ||
    req.cookies.get("role")?.value ||
    ""
  ).toUpperCase();
}

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

async function resolveCompanyId(req: NextRequest) {
  const fromReq = getCompanyId(req);
  if (fromReq) return fromReq;
  const company = await prisma.companies.findFirst({ select: { id: true } });
  return company?.id || "";
}

function buildWhere(req: NextRequest, company_id: string) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") || "";
  const status = url.searchParams.get("status") || "";
  const seller = url.searchParams.get("seller_id") || "";
  const role = getRole(req);
  const sellerFromSession = getSellerId(req);
  const deliveryRange = dateRangeFromParams(url);

  const where: any = { company_id };

  if (role === "VENDEDOR" && sellerFromSession) where.seller_id = sellerFromSession;
  else if (seller) where.seller_id = seller;

  if (status) where.status = status;
  if (deliveryRange.gte || deliveryRange.lte) where.delivery_date = deliveryRange;

  if (q) {
    where.OR = [
      { order_number: { contains: q, mode: "insensitive" } },
      { customer_name: { contains: q, mode: "insensitive" } },
      { document: { contains: q, mode: "insensitive" } },
      { customer_internal_code: { contains: q, mode: "insensitive" } },
      { seller_name: { contains: q, mode: "insensitive" } },
      { payment_terms: { contains: q, mode: "insensitive" } },
      { SalesOrderItem: { some: { name: { contains: q, mode: "insensitive" } } } },
      { SalesOrderItem: { some: { code: { contains: q, mode: "insensitive" } } } },
    ];
  }

  return where;
}

export async function GET(req: NextRequest) {
  try {
    const company_id = await resolveCompanyId(req);
    if (!company_id) return NextResponse.json({ orders: [], summary: null });

    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get("limit") || 80), 200);
    const page = Math.max(Number(url.searchParams.get("page") || 1), 1);
    const orderByParam = url.searchParams.get("orderBy") || "created_desc";
    const where = buildWhere(req, company_id);

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
    const company_id = await resolveCompanyId(req);
    const seller_id = getSellerId(req);

    if (!company_id) {
      return NextResponse.json({ error: "Empresa não encontrada." }, { status: 400 });
    }

    const body = await req.json();
    const extracted = body.extracted || body;

    const customerCode = extracted.customer_id || extracted.customerInternalCode || extracted.codigo_cliente || extracted.cliente_id;
    const document = extracted.document || extracted.cnpj_cpf || extracted.cnpj || extracted.cpf;
    const legalName = extracted.customer_name || extracted.cliente || extracted.legal_name || "Cliente sem nome";

    let customer = null;

    if (customerCode || document) {
      customer = await prisma.salesCustomer.findFirst({
        where: {
          company_id,
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
    const company_id = await resolveCompanyId(req);
    const body = await req.json();

    if (!company_id || !body.id) {
      return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
    }

    const order = await prisma.salesOrder.update({
      where: { id: body.id },
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
    const company_id = await resolveCompanyId(req);
    const id = new URL(req.url).searchParams.get("id");

    if (!company_id || !id) {
      return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
    }

    await prisma.salesOrderItem.deleteMany({ where: { order_id: id } });
    await prisma.salesOrderOcr.deleteMany({ where: { order_id: id } });
    await prisma.salesOrder.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[DELETE /api/crm/orders]", error);
    return NextResponse.json({ error: "Erro ao excluir pedido." }, { status: 500 });
  }
}
