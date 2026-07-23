import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/server-company";

export const dynamic = "force-dynamic";

function currentMonthKey() {
  return new Date().toISOString().slice(0, 7);
}

function digits(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}

function mask(value?: string | null) {
  if (!value) return "Oculto";

  const text = String(value);

  if (text.includes("@")) {
    return text.replace(/^(.{2}).+(@.+)$/, "$1***$2");
  }

  const onlyDigits = digits(text);

  if (!onlyDigits) return "Oculto";

  return `${onlyDigits.slice(0, 4)}*****${onlyDigits.slice(-2)}`;
}

function getPhone(prospect: any) {
  return prospect.phone1 || prospect.phone || prospect.whatsapp || "";
}

function formatDate(date?: Date | null) {
  if (!date) return null;
  return date.toISOString();
}

function getSort(sortBy: string, sortDir: string) {
  const direction = sortDir === "asc" ? "asc" : "desc";

  const allowed: Record<string, any> = {
    name: { name: direction },
    city: { city: direction },
    externalId: { externalId: direction },
    lastOrderAt: { lastOrderAt: direction },
    creditLimit: { creditLimit: direction },
    paymentMethod: { paymentMethod: direction },
    createdAt: { createdAt: direction },
  };

  return allowed[sortBy] || { createdAt: "desc" };
}

async function getUsage(
  access: Awaited<ReturnType<typeof requireCompanyAccess>>
) {
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
    remaining: Math.max(
      0,
      (usage.monthlyLimit || defaultLimit) - usage.used
    ),
  };
}

export async function GET(req: NextRequest) {
  try {
    const access = await requireCompanyAccess(req);
    const { companyId, userId } = access;
    const role = String(access.userRole || "").toUpperCase();

    // Preserva exatamente a regra atual do Radar.
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
    const requestedPage = Number(searchParams.get("page") || 1);

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
      select: {
        prospectId: true,
      },
    });

    const exportedIds = exports.map((item) => item.prospectId);

    const take = Math.max(1, Math.min(requestedLimit, 500));
    const page = Math.max(1, Number.isFinite(requestedPage) ? requestedPage : 1);
    const skip = (page - 1) * take;

    const currentSnapshot = await prisma.radar_snapshots.findFirst({
      where: {
        company_id: companyId,
        is_current: true,
        status: "completed",
      },
      orderBy: {
        created_at: "desc",
      },
      select: {
        id: true,
        created_at: true,
        file_name: true,
      },
    });

    /*
     * Compatibilidade segura:
     * - antes do primeiro snapshot, mantém a consulta antiga;
     * - depois da primeira ativação, mostra apenas membros do snapshot atual.
     */
    const snapshotFilter = currentSnapshot
      ? {
          radar_snapshot_prospects: {
            some: {
              snapshot_id: currentSnapshot.id,
              company_id: companyId,
            },
          },
        }
      : {};

    const prospectWhere = {
      company_id: companyId,
      active: true,
      ...snapshotFilter,

      externalId: externalId
        ? { contains: externalId, mode: "insensitive" }
        : undefined,

      city: city
        ? { contains: city, mode: "insensitive" }
        : undefined,

      state: state
        ? { contains: state, mode: "insensitive" }
        : undefined,

      name: name
        ? { contains: name, mode: "insensitive" }
        : undefined,

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

    const [prospectsRaw, totalFound] = await Promise.all([
      prisma.prospect.findMany({
        where: prospectWhere,
        orderBy: getSort(sortBy, sortDir),
        skip,
        take,
      }),

      prisma.prospect.count({
        where: prospectWhere,
      }),
    ]);

    const exportedSet = new Set(exportedIds);

    const prospects = prospectsRaw.map((prospect: any) => {
      const revealed = exportedSet.has(prospect.id);
      const phone = getPhone(prospect);

      return {
        id: prospect.id,
        externalId: prospect.externalId || null,
        name: prospect.name,
        city: prospect.city || null,
        state: prospect.state || null,
        segment: prospect.segment || null,
        category: prospect.category || null,
        productInterest: prospect.productInterest || null,
        email: revealed ? prospect.email || null : null,
        phone1: revealed ? phone || null : null,
        phone2: revealed ? prospect.phone2 || null : null,
        contactMasked: revealed ? phone || null : mask(phone),
        emailMasked: revealed
          ? prospect.email || null
          : mask(prospect.email),
        lastTransferAt: formatDate(prospect.lastTransferAt),
        lastActivationAt: formatDate(prospect.lastActivationAt),
        lastOrderAt: formatDate(prospect.lastOrderAt),
        creditLimit: prospect.creditLimit ?? null,
        paymentMethod: prospect.paymentMethod || null,
        revealed,
      };
    });

    return NextResponse.json({
      success: true,
      prospects,
      total: prospects.length,
      totalFound,
      page,
      limit: take,
      totalPages: Math.max(1, Math.ceil(totalFound / take)),
      usage,
      snapshot: currentSnapshot
        ? {
            id: currentSnapshot.id,
            fileName: currentSnapshot.file_name,
            createdAt: currentSnapshot.created_at,
          }
        : null,
      snapshotMode: Boolean(currentSnapshot),
    });
  } catch (error: any) {
    console.error("[RADAR_SEARCH_V2_ERROR]", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Erro ao buscar oportunidades.",
      },
      { status: 500 }
    );
  }
}
