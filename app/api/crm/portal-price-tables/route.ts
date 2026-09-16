import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/server-company";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

const ADMIN_ROLES = new Set([
  "GERAL",
  "MASTER",
  "ADMIN",
  "OWNER",
  "SUPERVISOR",
  "GESTOR",
  "MANAGER",
]);

type ParsedPdfItem = {
  code: string;
  name: string;
  sellUnit: string;
  price: number;
  page?: number;
  raw?: string;
};

function clean(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function parseTable(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= 5
    ? number
    : null;
}

function canManage(role: unknown) {
  return ADMIN_ROLES.has(clean(role, 60).toUpperCase());
}

async function runRemoteParser(file: File, timeoutMs = 120000) {
  const parserUrl = process.env.PDF_PARSER_URL;
  const parserToken = process.env.PDF_PARSER_TOKEN;

  if (!parserUrl) {
    throw new Error(
      "Configure PDF_PARSER_URL nas variáveis de ambiente da Vercel."
    );
  }

  const formData = new FormData();
  formData.append("file", file, file.name);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(parserUrl, {
      method: "POST",
      body: formData,
      signal: controller.signal,
      headers: parserToken
        ? { Authorization: `Bearer ${parserToken}` }
        : undefined,
    });

    const text = await response.text();
    let data: any = {};

    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(
        `Parser remoto retornou resposta inválida: ${text.slice(0, 600)}`
      );
    }

    if (!response.ok || !data.success) {
      throw new Error(
        data?.error ||
          data?.message ||
          "Parser remoto retornou erro."
      );
    }

    return data;
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new Error(
        `Timeout do parser após ${Math.round(timeoutMs / 1000)}s.`
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function catalogMap(companyId: string, codes: string[]) {
  if (!codes.length) return new Map<string, string>();

  const rows = await prisma.$queryRawUnsafe<
    Array<{ id: string; code: string }>
  >(
    `SELECT id, code
       FROM quote_catalog_products
      WHERE company_id = $1::uuid
        AND code = ANY($2::text[])`,
    companyId,
    codes
  );

  return new Map(
    rows.map((row) => [String(row.code), String(row.id)])
  );
}

async function summary(companyId: string) {
  const [versions, customerGroups] = await Promise.all([
    prisma.portalPriceTableVersion.findMany({
      where: {
        company_id: companyId,
      },
      orderBy: [
        { price_table: "asc" },
        { table_date: "desc" },
        { created_at: "desc" },
      ],
      take: 120,
      select: {
        id: true,
        price_table: true,
        table_date: true,
        pdf_name: true,
        status: true,
        product_count: true,
        unmatched_count: true,
        parser_engine: true,
        activated_at: true,
        created_at: true,
      },
    }),
    prisma.salesCustomer.groupBy({
      by: ["price_table"],
      where: {
        company_id: companyId,
      },
      _count: {
        _all: true,
      },
    }),
  ]);

  const customerCounts = new Map<number, number>();
  for (const row of customerGroups) {
    if (row.price_table != null) {
      customerCounts.set(row.price_table, row._count._all);
    }
  }

  const tables = Array.from({ length: 6 }, (_, priceTable) => {
    const tableVersions = versions.filter(
      (version) => version.price_table === priceTable
    );
    const active =
      tableVersions.find((version) => version.status === "active") ||
      null;

    return {
      price_table: priceTable,
      customer_count: customerCounts.get(priceTable) || 0,
      active_version: active,
      versions: tableVersions.slice(0, 6),
    };
  });

  return {
    tables,
    unclassified_customers:
      customerGroups.find((row) => row.price_table == null)?._count
        ._all || 0,
  };
}

async function uploadTable(
  req: NextRequest,
  companyId: string,
  userId: string
) {
  const form = await req.formData();
  const file = form.get("file") as File | null;
  const priceTable = parseTable(form.get("priceTable"));

  if (priceTable == null) {
    return NextResponse.json(
      { success: false, error: "Selecione uma tabela entre 0 e 5." },
      { status: 400 }
    );
  }

  if (!file || !file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json(
      { success: false, error: "Envie o PDF da tabela selecionada." },
      { status: 400 }
    );
  }

  if (!file.size) {
    return NextResponse.json(
      { success: false, error: "O PDF está vazio." },
      { status: 400 }
    );
  }

  const parsed = await runRemoteParser(file);
  const sourceItems: ParsedPdfItem[] = Array.isArray(parsed?.items)
    ? parsed.items
    : [];

  const items = sourceItems
    .map((item) => ({
      code: clean(item.code, 100),
      name: clean(item.name, 1000),
      sellUnit: clean(item.sellUnit, 80).toUpperCase(),
      price: Number(item.price),
      raw: clean(
        item.raw ||
          `${item.code} ${item.name} ${item.sellUnit} R$ ${item.price}`,
        3000
      ),
    }))
    .filter(
      (item) =>
        item.code &&
        item.name &&
        item.sellUnit &&
        Number.isFinite(item.price) &&
        item.price > 0
    );

  if (!items.length) {
    return NextResponse.json(
      {
        success: false,
        error:
          "O parser abriu o PDF, mas nenhum produto válido foi identificado.",
        ignoredCount: parsed?.ignoredCount || 0,
        ignoredSample: parsed?.ignoredSample || [],
      },
      { status: 422 }
    );
  }

  const deduped = [
    ...new Map(items.map((item) => [item.code, item])).values(),
  ];

  const codes = deduped.map((item) => item.code);
  const map = await catalogMap(companyId, codes);
  const tableDate = new Date(
    `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`
  );

  const version = await prisma.portalPriceTableVersion.create({
    data: {
      company_id: companyId,
      price_table: priceTable,
      table_date: tableDate,
      pdf_name: file.name,
      status: "ready",
      product_count: deduped.length,
      unmatched_count: deduped.filter(
        (item) => !map.has(item.code)
      ).length,
      parser_engine: "remote-python-pdfplumber",
      imported_by: userId,
    },
  });

  try {
    const chunkSize = 500;

    for (
      let offset = 0;
      offset < deduped.length;
      offset += chunkSize
    ) {
      const chunk = deduped.slice(offset, offset + chunkSize);

      await prisma.portalPriceTableItem.createMany({
        data: chunk.map((item) => ({
          version_id: version.id,
          company_id: companyId,
          price_table: priceTable,
          catalog_product_id: map.get(item.code) || null,
          code: item.code,
          product_name: item.name,
          sell_unit: item.sellUnit,
          price: item.price,
          raw_line: item.raw || null,
        })),
        skipDuplicates: true,
      });
    }
  } catch (error) {
    await prisma.portalPriceTableVersion
      .update({
        where: { id: version.id },
        data: { status: "failed" },
      })
      .catch(() => null);
    throw error;
  }

  return NextResponse.json({
    success: true,
    version: {
      id: version.id,
      price_table: priceTable,
      table_date: version.table_date,
      pdf_name: version.pdf_name,
      status: version.status,
      product_count: deduped.length,
      unmatched_count: deduped.filter(
        (item) => !map.has(item.code)
      ).length,
      catalog_matched: map.size,
    },
    ignoredCount: parsed?.ignoredCount || 0,
    ignoredSample: parsed?.ignoredSample || [],
  });
}

async function activateVersion(
  companyId: string,
  versionId: string
) {
  const version = await prisma.portalPriceTableVersion.findFirst({
    where: {
      id: versionId,
      company_id: companyId,
      status: {
        in: ["ready", "active", "superseded"],
      },
    },
  });

  if (!version) {
    return NextResponse.json(
      { success: false, error: "Versão de tabela não encontrada." },
      { status: 404 }
    );
  }

  const itemCount = await prisma.portalPriceTableItem.count({
    where: {
      version_id: version.id,
    },
  });

  if (!itemCount) {
    return NextResponse.json(
      {
        success: false,
        error: "Esta versão não possui preços importados.",
      },
      { status: 409 }
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.portalPriceTableVersion.updateMany({
      where: {
        company_id: companyId,
        price_table: version.price_table,
        status: "active",
        id: {
          not: version.id,
        },
      },
      data: {
        status: "superseded",
      },
    });

    await tx.portalPriceTableVersion.update({
      where: {
        id: version.id,
      },
      data: {
        status: "active",
        activated_at: new Date(),
      },
    });
  });

  return NextResponse.json({
    success: true,
    active: {
      id: version.id,
      price_table: version.price_table,
      table_date: version.table_date,
      pdf_name: version.pdf_name,
      product_count: itemCount,
    },
  });
}

export async function GET(req: NextRequest) {
  try {
    const access = await requireCompanyAccess(req);

    return NextResponse.json({
      success: true,
      ...(await summary(access.companyId)),
      can_manage: canManage(access.userRole),
    });
  } catch (error: any) {
    console.error("GET /api/crm/portal-price-tables:", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Erro ao carregar tabelas do Portal.",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const access = await requireCompanyAccess(req);

    if (!canManage(access.userRole)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Somente gestão/administração pode atualizar as tabelas oficiais.",
        },
        { status: 403 }
      );
    }

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      return uploadTable(
        req,
        access.companyId,
        access.userId
      );
    }

    const body = await req.json().catch(() => ({}));
    const action = clean(body?.action, 40);

    if (action === "activate") {
      const versionId = clean(body?.versionId, 100);
      if (!versionId) {
        return NextResponse.json(
          { success: false, error: "versionId obrigatório." },
          { status: 400 }
        );
      }
      return activateVersion(access.companyId, versionId);
    }

    return NextResponse.json(
      { success: false, error: "Ação inválida." },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("POST /api/crm/portal-price-tables:", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Erro ao processar tabela do Portal.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const access = await requireCompanyAccess(req);

    if (!canManage(access.userRole)) {
      return NextResponse.json(
        { success: false, error: "Sem permissão." },
        { status: 403 }
      );
    }

    const id = clean(
      new URL(req.url).searchParams.get("versionId"),
      100
    );

    const version = await prisma.portalPriceTableVersion.findFirst({
      where: {
        id,
        company_id: access.companyId,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!version) {
      return NextResponse.json(
        { success: false, error: "Versão não encontrada." },
        { status: 404 }
      );
    }

    if (version.status === "active") {
      return NextResponse.json(
        {
          success: false,
          error:
            "Não é permitido excluir a versão ativa. Ative outra versão primeiro.",
        },
        { status: 409 }
      );
    }

    await prisma.portalPriceTableVersion.delete({
      where: {
        id: version.id,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("DELETE /api/crm/portal-price-tables:", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Erro ao excluir versão.",
      },
      { status: 500 }
    );
  }
}
