import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/server-company";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ audienceId: string }>;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stringIds(value: unknown) {
  const source = Array.isArray(value) ? value : [value];

  return [
    ...new Set(
      source
        .map((item) => text(item))
        .filter(Boolean)
    ),
  ];
}

async function contextIds(
  request: NextRequest,
  context: RouteContext
) {
  const access = await requireCompanyAccess(request);
  const params = await context.params;
  const audienceId = text(params?.audienceId);
  const sellerId = text(access.userId);

  if (!sellerId) {
    throw new Error("Vendedor não identificado.");
  }

  if (!audienceId) {
    throw new Error("Campanha não identificada.");
  }

  const list = await prisma.promotionAudienceList.findFirst({
    where: {
      id: audienceId,
      company_id: access.companyId,
      seller_id: sellerId,
    },
    select: {
      id: true,
      name: true,
      status: true,
    },
  });

  if (!list) {
    throw new Error("Campanha não encontrada.");
  }

  return {
    access,
    sellerId,
    audienceId,
    list,
  };
}

function errorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const status =
    message.includes("não identificad") ? 401 :
    message.includes("não encontrad") ? 404 :
    500;

  console.error("[PROMOTION_AUDIENCE_MEMBERS]", error);
  return NextResponse.json({ error: message }, { status });
}

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { access, audienceId, list } =
      await contextIds(request, context);

    const members = await prisma.promotionAudienceMember.findMany({
      where: {
        company_id: access.companyId,
        audience_list_id: audienceId,
      },
      select: {
        id: true,
        created_at: true,
        customer: {
          select: {
            id: true,
            legal_name: true,
            trade_name: true,
            document: true,
            buyer_name: true,
            whatsapp: true,
            phone: true,
            city: true,
            state: true,
            segment: true,
            category: true,
            distance_km: true,
            price_table: true,
            status: true,
          },
        },
      },
      orderBy: {
        created_at: "desc",
      },
      take: 1000,
    });

    return NextResponse.json({
      list,
      members,
      member_count: members.length,
    });
  } catch (error) {
    return errorResponse(error, "Erro ao carregar clientes da campanha.");
  }
}

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { access, sellerId, audienceId, list } =
      await contextIds(request, context);
    const body = await request.json();
    const customerIds = stringIds(
      body?.customer_ids ?? body?.customer_id
    );

    if (list.status !== "active") {
      return NextResponse.json(
        { error: "Reative a campanha antes de adicionar clientes." },
        { status: 409 }
      );
    }

    if (!customerIds.length) {
      return NextResponse.json(
        { error: "Selecione pelo menos um cliente." },
        { status: 400 }
      );
    }

    const customers = await prisma.salesCustomer.findMany({
      where: {
        id: { in: customerIds },
        company_id: access.companyId,
        seller_id: sellerId,
        status: {
          equals: "ativo",
          mode: "insensitive",
        },
      },
      select: {
        id: true,
      },
    });

    if (customers.length !== customerIds.length) {
      return NextResponse.json(
        {
          error:
            "Um ou mais clientes não pertencem à sua carteira ou estão inativos.",
        },
        { status: 403 }
      );
    }

    const result = await prisma.promotionAudienceMember.createMany({
      data: customers.map((customer) => ({
        company_id: access.companyId,
        audience_list_id: audienceId,
        customer_id: customer.id,
        added_by: sellerId,
      })),
      skipDuplicates: true,
    });

    const memberCount = await prisma.promotionAudienceMember.count({
      where: {
        company_id: access.companyId,
        audience_list_id: audienceId,
      },
    });

    return NextResponse.json(
      {
        success: true,
        added: result.count,
        member_count: memberCount,
      },
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(error, "Erro ao adicionar clientes.");
  }
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { access, audienceId } =
      await contextIds(request, context);

    const body = await request.json().catch(() => ({}));
    const customerIds = stringIds(
      body?.customer_ids ??
        body?.customer_id ??
        request.nextUrl.searchParams.get("customer_id")
    );

    if (!customerIds.length) {
      return NextResponse.json(
        { error: "Informe o cliente que será removido." },
        { status: 400 }
      );
    }

    const result = await prisma.promotionAudienceMember.deleteMany({
      where: {
        company_id: access.companyId,
        audience_list_id: audienceId,
        customer_id: {
          in: customerIds,
        },
      },
    });

    const memberCount = await prisma.promotionAudienceMember.count({
      where: {
        company_id: access.companyId,
        audience_list_id: audienceId,
      },
    });

    return NextResponse.json({
      success: true,
      removed: result.count,
      member_count: memberCount,
    });
  } catch (error) {
    return errorResponse(error, "Erro ao remover clientes.");
  }
}
