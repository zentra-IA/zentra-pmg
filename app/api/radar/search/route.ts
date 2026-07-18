import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/server-company";

export const dynamic = "force-dynamic";

function currentMonthKey() {
  return new Date().toISOString().slice(0, 7);
}

function digits(value: any) {
  return String(value || "").replace(/\D/g, "");
}

function mask(value?: string | null) {
  if (!value) return "Oculto";

  const s = String(value);
  if (s.includes("@")) return s.replace(/^(.{2}).+(@.+)$/, "$1***$2");

  const d = digits(s);
  if (!d) return "Oculto";
  return `${d.slice(0, 4)}*****${d.slice(-2)}`;
}

function getPhone(p: any) {
  return p.phone1 || p.phone || p.whatsapp || "";
}

function formatDate(date?: Date | null) {
  if (!date) return null;
  return date.toISOString();
}

function getSort(sortBy: string, sortDir: string) {
  const dir = sortDir === "asc" ? "asc" : "desc";

  const allowed: Record<string, any> = {
    name: { name: dir },
    city: { city: dir },
    externalId: { externalId: dir },
    lastOrderAt: { lastOrderAt: dir },
    creditLimit: { creditLimit: dir },
    paymentMethod: { paymentMethod: dir },
    createdAt: { createdAt: dir },
  };

  return allowed[sortBy] || { createdAt: "desc" };
}

async function getUsage(access: Awaited<ReturnType<typeof requireCompanyAccess>>) {
  const clientId = access.userId;
  const month = currentMonthKey();

  const defaultLimit =
    Number(access.userRadarMonthlyLimit || 0) ||
    Number(access.planRadarLimit || 0) ||
    500;

  const usage = await prisma.prospectUsage.upsert({
    where: {
      company_id_clientId_month: {
        company_id: access.companyId,
        clientId,
        month,
      },
    },
    update: {},
    create: {
      company_id: access.companyId,
      branch_id: access.branchId || null,
      clientId,
      month,
      monthlyLimit: defaultLimit,
      used: 0,
    },
  });

  return {
    clientId,
    month,
    used: usage.used,
    limit: usage.monthlyLimit || defaultLimit,
    remaining: Math.max(0, (usage.monthlyLimit || defaultLimit) - usage.used),
  };
}

export async function GET(req: NextRequest) {
  try {
    const access = await requireCompanyAccess(req);
    const { companyId, userId } = access;
    const role = String(access.userRole || "").toUpperCase();

    if (role === "SUPERVISOR") {
      return NextResponse.json(
        {
          success: false,
          error: "Acesso negado.",
        },
        { status: 403 }
      );
    }

    if (!companyId || !userId) {
      return NextResponse.json(
        {
          success: false,
          error: "Empresa ou usuário não identificado.",
        },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);

    const city = searchParams.get("city") || "";
    const state = searchParams.get("state") || "";
    const name = searchParams.get("name") || "";
    const segment = searchParams.get("segment") || "";
    const category = searchParams.get("category") || "";
    const product = searchParams.get("product") || "";
    const paymentMethod = searchParams.get("paymentMethod") || "";
    const externalId = searchParams.get("externalId") || "";
    const requestedLimit = Number(searchParams.get("limit") || 100);
    const view =
      searchParams.get("view") ||
      searchParams.get("viewMode") ||
      searchParams.get("status") ||
      "NEW";

    const sortBy = searchParams.get("sortBy") || "createdAt";
    const sortDir = searchParams.get("sortDir") || "desc";

    const usage = await getUsage(access);
    const clientId = usage.clientId;

    const exports = await prisma.prospectExport.findMany({
      where: {
        company_id: companyId,
        ...(role === "VENDEDOR" ? { clientId } : {}),
      },
      select: { prospectId: true },
    });

    const exportedIds = exports.map((item) => item.prospectId);

    const take = Math.max(1, Math.min(requestedLimit, 500));

    const prospectWhere = {
      company_id: companyId,
      active: true,
      externalId: externalId
        ? { contains: externalId, mode: "insensitive" }
        : undefined,
      city: city ? { contains: city, mode: "insensitive" } : undefined,
      state: state ? { contains: state, mode: "insensitive" } : undefined,
      name: name ? { contains: name, mode: "insensitive" } : undefined,
      segment: segment
        ? { contains: segment, mode: "insensitive" }
        : undefined,
      category: category
        ? { contains: category, mode: "insensitive" }
        : undefined,
      productInterest: product
        ? { contains: product, mode: "insensitive" }
        : undefined,
      paymentMethod: paymentMethod
        ? { contains: paymentMethod, mode: "insensitive" }
        : undefined,
      id:
        view === "NEW"
          ? exportedIds.length
            ? { notIn: exportedIds }
            : undefined
          : view === "REVEALED"
            ? { in: exportedIds.length ? exportedIds : ["__none__"] }
            : undefined,
    } as any;

    const prospectsRaw = await prisma.prospect.findMany({
      where: prospectWhere,
      orderBy: getSort(sortBy, sortDir),
      take,
    });

    const exportedSet = new Set(exportedIds);

    const prospects = prospectsRaw.map((p: any) => {
      const revealed = exportedSet.has(p.id);
      const phone = getPhone(p);

      return {
        id: p.id,
        externalId: p.externalId || null,
        name: p.name,
        city: p.city || null,
        state: p.state || null,
        segment: p.segment || null,
        category: p.category || null,
        productInterest: p.productInterest || null,
        email: revealed ? p.email || null : null,
        phone1: revealed ? phone || null : null,
        phone2: revealed ? p.phone2 || null : null,
        contactMasked: revealed ? phone || null : mask(phone),
        emailMasked: revealed ? p.email || null : mask(p.email),
        lastTransferAt: formatDate(p.lastTransferAt),
        lastActivationAt: formatDate(p.lastActivationAt),
        lastOrderAt: formatDate(p.lastOrderAt),
        creditLimit: p.creditLimit ?? null,
        paymentMethod: p.paymentMethod || null,
        revealed,
      };
    });

    const totalFound = await prisma.prospect.count({
      where: prospectWhere,
    });

    return NextResponse.json({
      success: true,
      prospects,
      total: prospects.length,
      totalFound,
      usage,
    });
  } catch (error: any) {
    console.error("[RADAR_SEARCH_ERROR]", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Erro ao buscar oportunidades.",
      },
      { status: 500 }
    );
  }
}
