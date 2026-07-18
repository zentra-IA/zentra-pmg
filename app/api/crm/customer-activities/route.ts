import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/server-company";

export const dynamic = "force-dynamic";

type CompanyAccess = Awaited<ReturnType<typeof requireCompanyAccess>>;

function normalizeRole(role?: string | null) {
  const value = String(role || "").trim().toUpperCase();

  if (["GERAL", "MASTER", "ADMIN", "OWNER"].includes(value)) {
    return "GERAL";
  }

  if (["SUPERVISOR", "GESTOR", "MANAGER"].includes(value)) {
    return "SUPERVISOR";
  }

  return "VENDEDOR";
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

function operationalAccessError(access: CompanyAccess) {
  const role = normalizeRole(access.userRole);

  if (!access.companyId || !access.userId) {
    return NextResponse.json(
      { error: "Usuário ou empresa não encontrados na sessão." },
      { status: 401 }
    );
  }

  if (role === "SUPERVISOR") {
    return NextResponse.json(
      { error: "Supervisor não possui acesso a esta rota operacional." },
      { status: 403 }
    );
  }

  return null;
}

function canAccessWhere(access: CompanyAccess) {
  const role = normalizeRole(access.userRole);
  const where: any = { company_id: access.companyId };

  if (role === "VENDEDOR") {
    where.seller_id = access.userId;
  }

  return where;
}

export async function GET(req: NextRequest) {
  try {
    const access = await requireCompanyAccess(req);
    const accessError = operationalAccessError(access);

    if (accessError) {
      return accessError;
    }

    const { searchParams } = new URL(req.url);

    const customerId = cleanText(searchParams.get("customer_id"));
    const leadId = cleanText(searchParams.get("lead_id"));
    const status = cleanText(searchParams.get("status"));
    const scope = cleanText(searchParams.get("scope"));

    const where: any = canAccessWhere(access);

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
      orderBy: [{ scheduled_at: "asc" }, { created_at: "desc" }],
      take: 300,
    });

    return NextResponse.json({ activities });
  } catch (error: any) {
    console.error("[customer-activities:get]", error);
    return NextResponse.json(
      { error: "Erro ao carregar atividades." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const access = await requireCompanyAccess(req);
    const accessError = operationalAccessError(access);

    if (accessError) {
      return accessError;
    }

    const role = normalizeRole(access.userRole);
    const body = await req.json();

    const customerId = cleanOptional(body?.customer_id);
    const leadId = cleanOptional(body?.lead_id);
    const phone = cleanOptional(body?.phone);
    const title = cleanText(body?.title);
    const scheduledAt = parseDate(body?.scheduled_at);

    if (!customerId && !leadId && !phone) {
      return NextResponse.json(
        {
          error:
            "Informe um cliente, lead ou telefone para criar a próxima ação.",
        },
        { status: 400 }
      );
    }

    if (!title) {
      return NextResponse.json(
        { error: "Título da atividade é obrigatório." },
        { status: 400 }
      );
    }

    let sellerId =
      role === "VENDEDOR"
        ? access.userId
        : cleanOptional(body?.seller_id) || access.userId;

    if (customerId) {
      const customer = await prisma.salesCustomer.findFirst({
        where: {
          id: customerId,
          ...canAccessWhere(access),
        },
        select: {
          id: true,
          seller_id: true,
          whatsapp: true,
          phone: true,
        },
      });

      if (!customer) {
        return NextResponse.json(
          { error: "Cliente não encontrado ou sem permissão." },
          { status: 404 }
        );
      }

      sellerId =
        role === "VENDEDOR"
          ? access.userId
          : cleanOptional(body?.seller_id) ||
            customer.seller_id ||
            access.userId;
    }

    if (leadId) {
      const lead = await prisma.leads.findFirst({
        where: {
          id: leadId,
          company_id: access.companyId,
          ...(role === "VENDEDOR"
            ? { owner_user_id: access.userId }
            : {}),
        },
        select: {
          id: true,
          owner_user_id: true,
        },
      });

      if (!lead) {
        return NextResponse.json(
          { error: "Lead não encontrado ou sem permissão." },
          { status: 404 }
        );
      }

      if (!customerId) {
        sellerId =
          role === "VENDEDOR"
            ? access.userId
            : cleanOptional(body?.seller_id) ||
              lead.owner_user_id ||
              access.userId;
      }
    }

    const activity = await prisma.salesCustomerActivity.create({
      data: {
        company_id: access.companyId,
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
    return NextResponse.json(
      { error: "Erro ao criar atividade." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const access = await requireCompanyAccess(req);
    const accessError = operationalAccessError(access);

    if (accessError) {
      return accessError;
    }

    const body = await req.json();
    const id = cleanText(body?.id);

    if (!id) {
      return NextResponse.json(
        { error: "ID da atividade é obrigatório." },
        { status: 400 }
      );
    }

    const existing = await prisma.salesCustomerActivity.findFirst({
      where: {
        id,
        ...canAccessWhere(access),
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Atividade não encontrada ou sem permissão." },
        { status: 404 }
      );
    }

    const nextStatus = body?.status
      ? cleanText(body.status)
      : existing.status;

    const activity = await prisma.salesCustomerActivity.update({
      where: { id: existing.id },
      data: {
        type:
          body?.type !== undefined
            ? cleanText(body.type || "followup")
            : undefined,
        title:
          body?.title !== undefined ? cleanText(body.title) : undefined,
        description:
          body?.description !== undefined
            ? cleanOptional(body.description)
            : undefined,
        scheduled_at:
          body?.scheduled_at !== undefined
            ? parseDate(body.scheduled_at)
            : undefined,
        priority:
          body?.priority !== undefined
            ? cleanText(body.priority || "media")
            : undefined,
        status: nextStatus,
        notify:
          body?.notify !== undefined ? Boolean(body.notify) : undefined,

        completed_at:
          nextStatus === "concluido"
            ? new Date()
            : body?.completed_at === null
              ? null
              : undefined,
        completed_by:
          nextStatus === "concluido"
            ? access.userId
            : body?.completed_by === null
              ? null
              : undefined,
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
    return NextResponse.json(
      { error: "Erro ao atualizar atividade." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const access = await requireCompanyAccess(req);
    const accessError = operationalAccessError(access);

    if (accessError) {
      return accessError;
    }

    const id = cleanText(new URL(req.url).searchParams.get("id"));

    if (!id) {
      return NextResponse.json(
        { error: "ID da atividade é obrigatório." },
        { status: 400 }
      );
    }

    const existing = await prisma.salesCustomerActivity.findFirst({
      where: {
        id,
        ...canAccessWhere(access),
      },
      select: {
        id: true,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Atividade não encontrada ou sem permissão." },
        { status: 404 }
      );
    }

    await prisma.salesCustomerActivity.delete({
      where: { id: existing.id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[customer-activities:delete]", error);
    return NextResponse.json(
      { error: "Erro ao remover atividade." },
      { status: 500 }
    );
  }
}
