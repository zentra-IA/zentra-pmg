import { prisma } from "@/lib/prisma";

export type PortalPricingContext = {
  customerId: string;
  priceTable: number;
  distanceKm: number | null;
  versionId: string;
  tableDate: Date;
  pdfName: string;
};

export async function getPortalPricingContext(params: {
  companyId: string;
  customerId: string;
}): Promise<PortalPricingContext | null> {
  const customer = await prisma.salesCustomer.findFirst({
    where: {
      id: params.customerId,
      company_id: params.companyId,
    },
    select: {
      id: true,
      price_table: true,
      distance_km: true,
    },
  });

  if (!customer || customer.price_table == null) return null;

  const version = await prisma.portalPriceTableVersion.findFirst({
    where: {
      company_id: params.companyId,
      price_table: customer.price_table,
      status: "active",
    },
    orderBy: [
      { table_date: "desc" },
      { activated_at: "desc" },
      { created_at: "desc" },
    ],
    select: {
      id: true,
      table_date: true,
      pdf_name: true,
    },
  });

  if (!version) return null;

  return {
    customerId: customer.id,
    priceTable: customer.price_table,
    distanceKm:
      customer.distance_km == null ? null : Number(customer.distance_km),
    versionId: version.id,
    tableDate: version.table_date,
    pdfName: version.pdf_name,
  };
}

export async function loadPortalPriceRowsForCustomer(params: {
  companyId: string;
  customerId: string;
}) {
  const context = await getPortalPricingContext(params);
  if (!context) {
    return {
      context: null,
      rows: [],
    };
  }

  const rows = await prisma.portalPriceTableItem.findMany({
    where: {
      company_id: params.companyId,
      version_id: context.versionId,
    },
    orderBy: {
      code: "asc",
    },
    select: {
      id: true,
      code: true,
      product_name: true,
      sell_unit: true,
      price: true,
      raw_line: true,
      catalog_product_id: true,
    },
  });

  return {
    context,
    rows: rows.map((row) => ({
      ...row,
      price: Number(row.price),
    })),
  };
}

export async function searchPortalPriceTable(params: {
  companyId: string;
  customerId: string;
  search: string;
  limit?: number;
}) {
  const context = await getPortalPricingContext(params);

  if (!context) {
    return {
      context: null,
      rows: [],
    };
  }

  const q = String(params.search || "").trim();
  if (!q) {
    return {
      context,
      rows: [],
    };
  }

  const limit = Math.max(1, Math.min(100, Number(params.limit || 30)));

  const rows = await prisma.portalPriceTableItem.findMany({
    where: {
      company_id: params.companyId,
      version_id: context.versionId,
      OR: [
        { code: { contains: q, mode: "insensitive" } },
        { product_name: { contains: q, mode: "insensitive" } },
        { raw_line: { contains: q, mode: "insensitive" } },
      ],
    },
    orderBy: {
      price: "asc",
    },
    take: limit,
  });

  return {
    context,
    rows: rows.map((row) => ({
      ...row,
      price: Number(row.price),
    })),
  };
}
