import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/server-company";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED_STATUS = new Set(["active", "archived"]);

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function requireSellerId(
  access: Awaited<ReturnType<typeof requireCompanyAccess>>
) {
  const sellerId = text(access.userId);

  if (!sellerId) {
    throw new Error("Vendedor não identificado.");
  }

  return sellerId;
}

function errorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const status =
    message.includes("não identificad") ? 401 :
    message.includes("não encontrad") ? 404 :
    500;

  console.error("[PROMOTION_AUDIENCES]", error);
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: NextRequest) {
  try {
    const access = await requireCompanyAccess(request);
    const sellerId = requireSellerId(access);
    const requestedStatus = text(request.nextUrl.searchParams.get("status"));

    const lists = await prisma.promotionAudienceList.findMany({
      where: {
        company_id: access.companyId,
        seller_id: sellerId,
        ...(ALLOWED_STATUS.has(requestedStatus)
          ? { status: requestedStatus }
          : {}),
      },
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        created_at: true,
        updated_at: true,
        _count: {
          select: {
            members: true,
            promotions: true,
          },
        },
      },
      orderBy: [
        { status: "asc" },
        { updated_at: "desc" },
      ],
      take: 200,
    });

    return NextResponse.json({
      lists: lists.map((item) => ({
        ...item,
        member_count: item._count.members,
        promotion_count: item._count.promotions,
      })),
    });
  } catch (error) {
    return errorResponse(error, "Erro ao carregar campanhas.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const access = await requireCompanyAccess(request);
    const sellerId = requireSellerId(access);
    const body = await request.json();

    const name = text(body?.name);
    const description = text(body?.description) || null;

    if (name.length < 3) {
      return NextResponse.json(
        { error: "Informe um nome com pelo menos 3 caracteres." },
        { status: 400 }
      );
    }

    const duplicate = await prisma.promotionAudienceList.findFirst({
      where: {
        company_id: access.companyId,
        seller_id: sellerId,
        name: {
          equals: name,
          mode: "insensitive",
        },
        status: "active",
      },
      select: { id: true },
    });

    if (duplicate) {
      return NextResponse.json(
        { error: "Já existe uma campanha ativa com esse nome." },
        { status: 409 }
      );
    }

    const list = await prisma.promotionAudienceList.create({
      data: {
        company_id: access.companyId,
        seller_id: sellerId,
        name,
        description,
        status: "active",
      },
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        created_at: true,
        updated_at: true,
      },
    });

    return NextResponse.json(
      {
        list: {
          ...list,
          member_count: 0,
          promotion_count: 0,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(error, "Erro ao criar campanha.");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const access = await requireCompanyAccess(request);
    const sellerId = requireSellerId(access);
    const body = await request.json();

    const id = text(body?.id);
    const name = text(body?.name);
    const description = text(body?.description) || null;
    const status = text(body?.status) || "active";

    if (!id) {
      return NextResponse.json(
        { error: "Campanha não identificada." },
        { status: 400 }
      );
    }

    if (name.length < 3) {
      return NextResponse.json(
        { error: "Informe um nome com pelo menos 3 caracteres." },
        { status: 400 }
      );
    }

    if (!ALLOWED_STATUS.has(status)) {
      return NextResponse.json(
        { error: "Status de campanha inválido." },
        { status: 400 }
      );
    }

    const current = await prisma.promotionAudienceList.findFirst({
      where: {
        id,
        company_id: access.companyId,
        seller_id: sellerId,
      },
      select: { id: true },
    });

    if (!current) {
      return NextResponse.json(
        { error: "Campanha não encontrada." },
        { status: 404 }
      );
    }

    const duplicate = await prisma.promotionAudienceList.findFirst({
      where: {
        id: { not: id },
        company_id: access.companyId,
        seller_id: sellerId,
        status: "active",
        name: {
          equals: name,
          mode: "insensitive",
        },
      },
      select: { id: true },
    });

    if (duplicate) {
      return NextResponse.json(
        { error: "Já existe outra campanha ativa com esse nome." },
        { status: 409 }
      );
    }

    const list = await prisma.promotionAudienceList.update({
      where: { id },
      data: {
        name,
        description,
        status,
      },
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        created_at: true,
        updated_at: true,
        _count: {
          select: {
            members: true,
            promotions: true,
          },
        },
      },
    });

    return NextResponse.json({
      list: {
        ...list,
        member_count: list._count.members,
        promotion_count: list._count.promotions,
      },
    });
  } catch (error) {
    return errorResponse(error, "Erro ao atualizar campanha.");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const access = await requireCompanyAccess(request);
    const sellerId = requireSellerId(access);
    const id = text(request.nextUrl.searchParams.get("id"));

    if (!id) {
      return NextResponse.json(
        { error: "Campanha não identificada." },
        { status: 400 }
      );
    }

    const list = await prisma.promotionAudienceList.findFirst({
      where: {
        id,
        company_id: access.companyId,
        seller_id: sellerId,
      },
      select: {
        id: true,
        _count: {
          select: {
            promotions: true,
          },
        },
      },
    });

    if (!list) {
      return NextResponse.json(
        { error: "Campanha não encontrada." },
        { status: 404 }
      );
    }

    if (list._count.promotions > 0) {
      return NextResponse.json(
        {
          error:
            "Essa campanha já está vinculada a promoções. Arquive-a para preservar o histórico.",
        },
        { status: 409 }
      );
    }

    await prisma.promotionAudienceList.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error, "Erro ao excluir campanha.");
  }
}
