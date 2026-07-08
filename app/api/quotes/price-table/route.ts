import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function toDateOnly(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.toISOString().slice(0, 10));
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get("companyId");

    if (!companyId) {
      return NextResponse.json(
        { error: "companyId obrigatório" },
        { status: 400 }
      );
    }

    const tableDateParam =
      searchParams.get("tableDate") || new Date().toISOString().slice(0, 10);

    const tableDate = toDateOnly(tableDateParam);

    if (!tableDate) {
      return NextResponse.json(
        { error: "tableDate inválida" },
        { status: 400 }
      );
    }

    const products = await prisma.quote_daily_prices.findMany({
      where: {
        company_id: companyId,
        table_date: tableDate,
      },
      select: {
        id: true,
        code: true,
        product_name_from_pdf: true,
        sell_unit: true,
        price: true,
        table_date: true,
        catalog_product_id: true,
        raw_line: true,
        created_at: true,
        updated_at: true,
      },
      orderBy: {
        product_name_from_pdf: "asc",
      },
    });

    return NextResponse.json({
      success: true,
      priceTable: products.map((p) => ({
        id: p.id,
        code: p.code,
        product: p.product_name_from_pdf,
        sellUnit: p.sell_unit,
        price: Number(p.price),
        tableDate: p.table_date,
        catalogProductId: p.catalog_product_id,
        rawLine: p.raw_line,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
      })),
    });
  } catch (error) {
    console.error("PRICE_TABLE_GET_ERROR", error);
    return NextResponse.json(
      { success: false, error: "Erro ao buscar tabela de preços" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, companyId, code, tableDate, price } = await req.json();

    if (price === undefined || price === null || Number.isNaN(Number(price))) {
      return NextResponse.json(
        { success: false, error: "price é obrigatório e precisa ser numérico" },
        { status: 400 }
      );
    }

    let updated;

    if (id) {
      updated = await prisma.quote_daily_prices.update({
        where: { id },
        data: {
          price: Number(price),
          updated_at: new Date(),
        },
      });
    } else {
      if (!companyId || !code || !tableDate) {
        return NextResponse.json(
          { success: false, error: "Informe id ou companyId, code e tableDate" },
          { status: 400 }
        );
      }

      const parsedDate = toDateOnly(tableDate);

      if (!parsedDate) {
        return NextResponse.json(
          { success: false, error: "tableDate inválida" },
          { status: 400 }
        );
      }

      const existing = await prisma.quote_daily_prices.findFirst({
        where: {
          company_id: companyId,
          code: String(code),
          table_date: parsedDate,
        },
        select: {
          id: true,
        },
      });

      if (!existing) {
        return NextResponse.json(
          { success: false, error: "Preço não encontrado para companyId, code e tableDate informados" },
          { status: 404 }
        );
      }

      updated = await prisma.quote_daily_prices.update({
        where: {
          id: existing.id,
        },
        data: {
          price: Number(price),
          updated_at: new Date(),
        },
      });
    }

    return NextResponse.json({
      success: true,
      price: {
        ...updated,
        price: Number(updated.price),
      },
    });
  } catch (error) {
    console.error("PRICE_TABLE_UPDATE_ERROR", error);
    return NextResponse.json(
      { success: false, error: "Erro ao atualizar preço" },
      { status: 500 }
    );
  }
}
