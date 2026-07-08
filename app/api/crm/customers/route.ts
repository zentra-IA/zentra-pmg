import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function normalizeRole(role?: string | null) {
  const value = String(role || "").trim().toUpperCase();
  if (["GERAL", "MASTER", "ADMIN", "OWNER"].includes(value)) return "GERAL";
  if (["SUPERVISOR", "GESTOR", "MANAGER"].includes(value)) return "SUPERVISOR";
  return "VENDEDOR";
}

function getAuth(req: NextRequest) {
  const companyId = req.cookies.get("zentra_company_id")?.value;
  const userId = req.cookies.get("zentra_user_id")?.value;
  const role = normalizeRole(req.cookies.get("zentra_user_role")?.value);

  return { companyId, userId, role };
}

function cleanText(value: unknown) {
  return String(value || "").trim();
}

function cleanOptional(value: unknown) {
  const text = cleanText(value);
  return text || null;
}

function cleanMoney(value: unknown) {
  const raw = cleanText(value).replace(/\./g, "").replace(",", ".");
  if (!raw) return null;
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}

function cleanWeekdays(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => cleanText(item)).filter(Boolean);
  const text = cleanText(value);
  if (!text) return [];
  return text
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function mapCustomerPayload(body: any, auth: ReturnType<typeof getAuth>) {
  return {
    company_id: auth.companyId!,
    seller_id: auth.role === "VENDEDOR" ? auth.userId || null : cleanOptional(body?.seller_id) || auth.userId || null,

    internal_code: cleanOptional(body?.internal_code),
    erp_code: cleanOptional(body?.erp_code),
    document: cleanOptional(body?.document),
    legal_name: cleanText(body?.legal_name || body?.name || body?.razao_social),
    trade_name: cleanOptional(body?.trade_name || body?.nome_fantasia),
    segment: cleanOptional(body?.segment),
    category: cleanOptional(body?.category),

    buyer_name: cleanOptional(body?.buyer_name || body?.contact_name),
    phone: cleanOptional(body?.phone),
    whatsapp: cleanOptional(body?.whatsapp),
    email: cleanOptional(body?.email),

    cep: cleanOptional(body?.cep),
    address: cleanOptional(body?.address),
    number: cleanOptional(body?.number),
    complement: cleanOptional(body?.complement),
    neighborhood: cleanOptional(body?.neighborhood),
    city: cleanOptional(body?.city),
    state: cleanOptional(body?.state),

    payment_terms: cleanOptional(body?.payment_terms),
    weekly_purchase_limit: cleanMoney(body?.weekly_purchase_limit),
    habitual_purchase_day: cleanOptional(body?.habitual_purchase_day),
    purchase_weekdays: cleanWeekdays(body?.purchase_weekdays),
    expected_ticket: cleanMoney(body?.expected_ticket),
    commercial_notes: cleanOptional(body?.commercial_notes),

    status: cleanText(body?.status || "ativo"),
  };
}

function canAccessWhere(auth: ReturnType<typeof getAuth>) {
  const base: any = { company_id: auth.companyId };
  if (auth.role === "VENDEDOR") {
    base.seller_id = auth.userId;
  }
  return base;
}

export async function GET(req: NextRequest) {
  try {
    const auth = getAuth(req);

    if (!auth.companyId) {
      return NextResponse.json({ error: "Empresa não encontrada na sessão." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const q = cleanText(searchParams.get("q")).toLowerCase();
    const status = cleanText(searchParams.get("status"));
    const segment = cleanText(searchParams.get("segment"));

    const where: any = canAccessWhere(auth);

    if (status) where.status = status;
    if (segment) where.segment = { contains: segment, mode: "insensitive" };

    if (q) {
      where.OR = [
        { legal_name: { contains: q, mode: "insensitive" } },
        { trade_name: { contains: q, mode: "insensitive" } },
        { document: { contains: q, mode: "insensitive" } },
        { whatsapp: { contains: q, mode: "insensitive" } },
        { buyer_name: { contains: q, mode: "insensitive" } },
        { city: { contains: q, mode: "insensitive" } },
      ];
    }

    const customers = await prisma.salesCustomer.findMany({
      where,
      orderBy: [{ updated_at: "desc" }],
      take: 300,
    });

    return NextResponse.json({ customers });
  } catch (error: any) {
    console.error("[customers:get]", error);
    return NextResponse.json({ error: "Erro ao carregar clientes." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = getAuth(req);

    if (!auth.companyId) {
      return NextResponse.json({ error: "Empresa não encontrada na sessão." }, { status: 401 });
    }

    if (auth.role === "VENDEDOR" && !auth.userId) {
      return NextResponse.json({ error: "Usuário não encontrado na sessão." }, { status: 401 });
    }

    const body = await req.json();
    const data = mapCustomerPayload(body, auth);

    if (!data.legal_name) {
      return NextResponse.json({ error: "Razão social ou nome do cliente é obrigatório." }, { status: 400 });
    }

    const customer = await prisma.salesCustomer.create({ data });

    return NextResponse.json({ success: true, customer });
  } catch (error: any) {
    console.error("[customers:post]", error);
    return NextResponse.json({ error: "Erro ao criar cliente." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = getAuth(req);

    if (!auth.companyId) {
      return NextResponse.json({ error: "Empresa não encontrada na sessão." }, { status: 401 });
    }

    const body = await req.json();
    const id = cleanText(body?.id);

    if (!id) {
      return NextResponse.json({ error: "ID do cliente é obrigatório." }, { status: 400 });
    }

    const existing = await prisma.salesCustomer.findFirst({
      where: { id, ...canAccessWhere(auth) },
    });

    if (!existing) {
      return NextResponse.json({ error: "Cliente não encontrado ou sem permissão." }, { status: 404 });
    }

    const mapped = mapCustomerPayload(body, auth);
    const { company_id, seller_id, ...data } = mapped;

    const customer = await prisma.salesCustomer.update({
      where: { id },
      data,
    });

    return NextResponse.json({ success: true, customer });
  } catch (error: any) {
    console.error("[customers:patch]", error);
    return NextResponse.json({ error: "Erro ao atualizar cliente." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = getAuth(req);

    if (!auth.companyId) {
      return NextResponse.json({ error: "Empresa não encontrada na sessão." }, { status: 401 });
    }

    const id = cleanText(new URL(req.url).searchParams.get("id"));

    if (!id) {
      return NextResponse.json({ error: "ID do cliente é obrigatório." }, { status: 400 });
    }

    const existing = await prisma.salesCustomer.findFirst({
      where: { id, ...canAccessWhere(auth) },
    });

    if (!existing) {
      return NextResponse.json({ error: "Cliente não encontrado ou sem permissão." }, { status: 404 });
    }

    await prisma.salesCustomer.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[customers:delete]", error);
    return NextResponse.json({ error: "Erro ao remover cliente." }, { status: 500 });
  }
}
