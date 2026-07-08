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

function parseDate(value: unknown) {
  const text = cleanText(value);
  if (!text) return null;

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
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

    const customerId = cleanText(searchParams.get("customer_id"));
    const leadId = cleanText(searchParams.get("lead_id"));
    const status = cleanText(searchParams.get("status"));
    const scope = cleanText(searchParams.get("scope"));

    const where: any = canAccessWhere(auth);

    if (customerId) where.customer_id = customerId;
    if (leadId) where.lead_id = leadId;
    if (status) where.status = status;

    if (scope === "today") {
      const start = new Date();
      start.setHours(0, 0, 0, 0);

      const end = new Date();
      end.setHours(23, 59, 59, 999);

      where.scheduled_at = {
        gte: start,
        lte: end,
      };

      where.status = {
        in: ["pendente", "atrasado"],
      };
    }

    if (scope === "overdue") {
      where.scheduled_at = {
        lt: new Date(),
      };

      where.status = "pendente";
    }

    const activities = await prisma.salesCustomerActivity.findMany({
      where,
      include: {
        customer: {
          select: {
            id: true,
            legal_name: true,
            trade_name: true,
            whatsapp: true,
            phone: true,
            city: true,
            state: true,
          },
        },
      },
      orderBy: [
        { scheduled_at: "asc" },
        { created_at: "desc" },
      ],
      take: 300,
    });

    return NextResponse.json({ activities });
  } catch (error: any) {
    console.error("[customer-activities:get]", error);
    return NextResponse.json({ error: "Erro ao carregar atividades." }, { status: 500 });
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

    const customerId = cleanOptional(body?.customer_id);
    const leadId = cleanOptional(body?.lead_id);
    const phone = cleanOptional(body?.phone);
    const title = cleanText(body?.title);
    const scheduledAt = parseDate(body?.scheduled_at);

    if (!customerId && !leadId && !phone) {
      return NextResponse.json(
        { error: "Informe um cliente, lead ou telefone para criar a próxima ação." },
        { status: 400 }
      );
    }

    if (!title) {
      return NextResponse.json({ error: "Título da atividade é obrigatório." }, { status: 400 });
    }

    let sellerId = auth.userId || null;

    if (customerId) {
      const customer = await prisma.salesCustomer.findFirst({
        where: {
          id: customerId,
          ...canAccessWhere(auth),
        },
        select: {
          id: true,
          seller_id: true,
          whatsapp: true,
          phone: true,
        },
      });

      if (!customer) {
        return NextResponse.json({ error: "Cliente não encontrado ou sem permissão." }, { status: 404 });
      }

      sellerId = auth.role === "VENDEDOR" ? auth.userId || null : cleanOptional(body?.seller_id) || customer.seller_id || auth.userId || null;
    }

    const activity = await prisma.salesCustomerActivity.create({
      data: {
        company_id: auth.companyId,
        seller_id: sellerId,

        customer_id: customerId,
        lead_id: leadId,
        phone,

        type: cleanText(body?.type || "followup"),
        origin: cleanText(body?.origin || (leadId ? "kanban" : "customer")),
        title,
        description: cleanOptional(body?.description),
        scheduled_at: scheduledAt,
        priority: cleanText(body?.priority || "media"),
        status: cleanText(body?.status || "pendente"),
        notify: body?.notify === false ? false : true,
      },
      include: {
        customer: {
          select: {
            id: true,
            legal_name: true,
            trade_name: true,
            whatsapp: true,
            phone: true,
          },
        },
      },
    });

    return NextResponse.json({ success: true, activity });
  } catch (error: any) {
    console.error("[customer-activities:post]", error);
    return NextResponse.json({ error: "Erro ao criar atividade." }, { status: 500 });
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
      return NextResponse.json({ error: "ID da atividade é obrigatório." }, { status: 400 });
    }

    const existing = await prisma.salesCustomerActivity.findFirst({
      where: {
        id,
        ...canAccessWhere(auth),
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "Atividade não encontrada ou sem permissão." }, { status: 404 });
    }

    const nextStatus = body?.status ? cleanText(body.status) : existing.status;

    const activity = await prisma.salesCustomerActivity.update({
      where: { id },
      data: {
        type: body?.type !== undefined ? cleanText(body.type || "followup") : undefined,
        title: body?.title !== undefined ? cleanText(body.title) : undefined,
        description: body?.description !== undefined ? cleanOptional(body.description) : undefined,
        scheduled_at: body?.scheduled_at !== undefined ? parseDate(body.scheduled_at) : undefined,
        priority: body?.priority !== undefined ? cleanText(body.priority || "media") : undefined,
        status: nextStatus,
        notify: body?.notify !== undefined ? Boolean(body.notify) : undefined,

        completed_at: nextStatus === "concluido" ? new Date() : body?.completed_at === null ? null : undefined,
        completed_by: nextStatus === "concluido" ? auth.userId || null : body?.completed_by === null ? null : undefined,
      },
      include: {
        customer: {
          select: {
            id: true,
            legal_name: true,
            trade_name: true,
            whatsapp: true,
            phone: true,
          },
        },
      },
    });

    return NextResponse.json({ success: true, activity });
  } catch (error: any) {
    console.error("[customer-activities:patch]", error);
    return NextResponse.json({ error: "Erro ao atualizar atividade." }, { status: 500 });
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
      return NextResponse.json({ error: "ID da atividade é obrigatório." }, { status: 400 });
    }

    const existing = await prisma.salesCustomerActivity.findFirst({
      where: {
        id,
        ...canAccessWhere(auth),
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "Atividade não encontrada ou sem permissão." }, { status: 404 });
    }

    await prisma.salesCustomerActivity.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[customer-activities:delete]", error);
    return NextResponse.json({ error: "Erro ao remover atividade." }, { status: 500 });
  }
}
