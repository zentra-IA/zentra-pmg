import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/server-company";

export const dynamic = "force-dynamic";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(value ?? null)
  ) as Prisma.InputJsonValue;
}

export async function POST(req: NextRequest) {
  try {
    const access = await requireCompanyAccess(req);
    const companyId = access.companyId;
    const userId = access.userId;
    const role = clean(access.userRole).toUpperCase();

    if (role === "SUPERVISOR") {
      return NextResponse.json(
        {
          error:
            "Supervisor deve utilizar apenas o Command Center.",
        },
        { status: 403 }
      );
    }

    if (!companyId || !userId) {
      return NextResponse.json(
        { error: "Usuário ou empresa não identificados." },
        { status: 401 }
      );
    }

    if (!["GERAL", "VENDEDOR"].includes(role)) {
      return NextResponse.json(
        {
          error:
            "Perfil sem permissão para registrar proteção de carteira.",
        },
        { status: 403 }
      );
    }

    const body = await req.json();
    const customerId = clean(
      body?.customerId || body?.customer_id
    );
    const action = clean(body?.action).toLowerCase();
    const note = clean(body?.note);

    if (!customerId) {
      return NextResponse.json(
        { error: "customerId é obrigatório." },
        { status: 400 }
      );
    }

    if (!["activated", "not_activated"].includes(action)) {
      return NextResponse.json(
        {
          error:
            'Ação inválida. Use "activated" ou "not_activated".',
        },
        { status: 400 }
      );
    }

    const customer = await prisma.salesCustomer.findFirst({
      where: {
        id: customerId,
        company_id: companyId,
        ...(role === "VENDEDOR"
          ? { seller_id: userId }
          : {}),
      },
      select: {
        id: true,
        internal_code: true,
        erp_code: true,
        legal_name: true,
        trade_name: true,
        seller_id: true,
        status: true,
      },
    });

    if (!customer) {
      return NextResponse.json(
        {
          error:
            "Cliente não encontrado ou não pertence à sua carteira.",
        },
        { status: 404 }
      );
    }

    const customerName =
      customer.trade_name ||
      customer.legal_name ||
      "Cliente";

    const actionName =
      action === "activated"
        ? "portfolio_pmg_activated"
        : "portfolio_pmg_not_activated";

    const log = await prisma.activity_logs.create({
      data: {
        company_id: companyId,
        user_id: userId,
        action: actionName,
        entity: "sales_customer",
        metadata: toInputJson({
          customerId: customer.id,
          customerInternalCode:
            customer.internal_code ||
            customer.erp_code ||
            null,
          customerName,
          sellerId: customer.seller_id,
          portfolioAction: action,
          source: "assistant_portfolio",
          note: note || null,
          recordedAt: new Date().toISOString(),
        }),
      },
    });

    return NextResponse.json({
      success: true,
      action,
      customer: {
        id: customer.id,
        name: customerName,
        internalCode:
          customer.internal_code ||
          customer.erp_code ||
          null,
      },
      recordedAt: log.created_at,
      protectionReset: action === "activated",
    });
  } catch (error: any) {
    console.error(
      "[POST /api/crm/portfolio-protection]",
      error
    );

    return NextResponse.json(
      {
        error:
          "Erro ao registrar proteção de carteira.",
        details: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}
