import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/server-company";

export const dynamic = "force-dynamic";

function normalizeRole(role?: string | null) {
  const value = String(role || "").trim().toUpperCase();
  if (["GERAL", "MASTER", "ADMIN", "OWNER"].includes(value)) return "GERAL";
  if (["SUPERVISOR", "GESTOR", "MANAGER"].includes(value)) return "SUPERVISOR";
  return "VENDEDOR";
}

type CompanyAccess = Awaited<ReturnType<typeof requireCompanyAccess>>;

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
  if (Array.isArray(value)) {
    return value.map((item) => cleanText(item)).filter(Boolean);
  }

  const text = cleanText(value);
  if (!text) return [];

  return text
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function mapCustomerPayload(
  body: any,
  access: CompanyAccess,
  role: ReturnType<typeof normalizeRole>
) {
  return {
    company_id: access.companyId,
    seller_id:
      role === "VENDEDOR"
        ? access.userId || null
        : cleanOptional(body?.seller_id) || access.userId || null,

    internal_code: cleanOptional(body?.internal_code),
    erp_code: cleanOptional(body?.erp_code),
    document: cleanOptional(body?.document),
    legal_name: cleanText(
      body?.legal_name || body?.name || body?.razao_social
    ),
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

function canAccessWhere(
  access: CompanyAccess,
  role: ReturnType<typeof normalizeRole>
) {
  const where: any = {
    company_id: access.companyId,
  };

  if (role === "VENDEDOR") {
    where.seller_id = access.userId;
  }

  return where;
}

function supervisorForbidden() {
  return NextResponse.json(
    {
      error:
        "Supervisor não possui acesso a esta rota operacional. Utilize o Command Center.",
    },
    { status: 403 }
  );
}

export async function GET(req: NextRequest) {
  try {
    const access = await requireCompanyAccess(req);
    const role = normalizeRole(access.userRole);

    if (role === "SUPERVISOR") {
      return supervisorForbidden();
    }

    if (role === "VENDEDOR" && !access.userId) {
      return NextResponse.json(
        { error: "Usuário não encontrado na sessão." },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const q = cleanText(searchParams.get("q")).toLowerCase();
    const status = cleanText(searchParams.get("status"));
    const segment = cleanText(searchParams.get("segment"));

    const where: any = canAccessWhere(access, role);

    if (status) {
      where.status = status;
    }

    if (segment) {
      where.segment = {
        contains: segment,
        mode: "insensitive",
      };
    }

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
    return NextResponse.json(
      { error: "Erro ao carregar clientes." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const access = await requireCompanyAccess(req);
    const role = normalizeRole(access.userRole);

    if (role === "SUPERVISOR") {
      return supervisorForbidden();
    }

    if (role === "VENDEDOR" && !access.userId) {
      return NextResponse.json(
        { error: "Usuário não encontrado na sessão." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const data = mapCustomerPayload(body, access, role);

    if (!data.legal_name) {
      return NextResponse.json(
        { error: "Razão social ou nome do cliente é obrigatório." },
        { status: 400 }
      );
    }

    const customer = await prisma.salesCustomer.create({
      data,
    });

    return NextResponse.json({
      success: true,
      customer,
    });
  } catch (error: any) {
    console.error("[customers:post]", error);
    return NextResponse.json(
      { error: "Erro ao criar cliente." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const access = await requireCompanyAccess(req);
    const role = normalizeRole(access.userRole);

    if (role === "SUPERVISOR") {
      return supervisorForbidden();
    }

    if (role === "VENDEDOR" && !access.userId) {
      return NextResponse.json(
        { error: "Usuário não encontrado na sessão." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const id = cleanText(body?.id);

    if (!id) {
      return NextResponse.json(
        { error: "ID do cliente é obrigatório." },
        { status: 400 }
      );
    }

    const existing = await prisma.salesCustomer.findFirst({
      where: {
        id,
        ...canAccessWhere(access, role),
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Cliente não encontrado ou sem permissão." },
        { status: 404 }
      );
    }

    const mapped = mapCustomerPayload(body, access, role);
    const { company_id, seller_id, ...data } = mapped;

    const customer = await prisma.salesCustomer.update({
      where: {
        id: existing.id,
      },
      data,
    });

    return NextResponse.json({
      success: true,
      customer,
    });
  } catch (error: any) {
    console.error("[customers:patch]", error);
    return NextResponse.json(
      { error: "Erro ao atualizar cliente." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const access = await requireCompanyAccess(req);
    const role = normalizeRole(access.userRole);

    if (role === "SUPERVISOR") {
      return supervisorForbidden();
    }

    if (role === "VENDEDOR" && !access.userId) {
      return NextResponse.json(
        { error: "Usuário não encontrado na sessão." },
        { status: 401 }
      );
    }

    const id = cleanText(new URL(req.url).searchParams.get("id"));

    if (!id) {
      return NextResponse.json(
        { error: "ID do cliente é obrigatório." },
        { status: 400 }
      );
    }

    const existing = await prisma.salesCustomer.findFirst({
      where: {
        id,
        ...canAccessWhere(access, role),
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Cliente não encontrado ou sem permissão." },
        { status: 404 }
      );
    }

    await prisma.salesCustomer.delete({
      where: {
        id: existing.id,
      },
    });

    return NextResponse.json({
      success: true,
    });
  } catch (error: any) {
    console.error("[customers:delete]", error);
    return NextResponse.json(
      { error: "Erro ao remover cliente." },
      { status: 500 }
    );
  }
}
