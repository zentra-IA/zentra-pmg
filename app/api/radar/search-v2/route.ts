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

function parseDateBoundary(value: string, endOfDay = false) {
  if (!value) return undefined;

  const suffix = endOfDay
    ? "T23:59:59.999Z"
    : "T00:00:00.000Z";

  const date = new Date(`${value}${suffix}`);

  return Number.isNaN(date.getTime())
    ? undefined
    : date;
}

function dateRangeFilter(from: string, to: string) {
  const gte = parseDateBoundary(from, false);
  const lte = parseDateBoundary(to, true);

  if (!gte && !lte) return undefined;

  return {
    ...(gte ? { gte } : {}),
    ...(lte ? { lte } : {}),
  };
}

function getSort(sortBy: string, sortDir: string) {
  const direction = sortDir === "asc" ? "asc" : "desc";

  const allowed: Record<string, any> = {
    name: { name: direction },
    city: { city: direction },
    state: { state: direction },
    externalId: { externalId: direction },
    createdAt: { createdAt: direction },
    lastTransferAt: { lastTransferAt: direction },
    lastActivationAt: { lastActivationAt: direction },
    lastOrderAt: { lastOrderAt: direction },
    phone1: { phone1: direction },
    creditLimit: { creditLimit: direction },
    paymentMethod: { paymentMethod: direction },
  };

  return allowed[sortBy] || { createdAt: "desc" };
}

async function getUsage(
  access: Awaited<ReturnType<typeof requireCompanyAccess>>
) {
  const clientId = access.userId;
  const month = currentMonthKey();

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
      monthlyLimit: 0,
      used: 0,
    },
  });

  return {
    clientId,
    month,
    used: usage.used,
    limit: 0,
    remaining: null,
    unlimited: true,
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
    const contact = digits(searchParams.get("contact") || "");
    const contactStatus = (searchParams.get("contactStatus") || "ALL").toUpperCase();
    const orderStatus = (searchParams.get("orderStatus") || "ALL").toUpperCase();

    const createdFrom = searchParams.get("createdFrom") || "";
    const createdTo = searchParams.get("createdTo") || "";
    const lastTransferFrom = searchParams.get("lastTransferFrom") || "";
    const lastTransferTo = searchParams.get("lastTransferTo") || "";
    const lastActivationFrom = searchParams.get("lastActivationFrom") || "";
    const lastActivationTo = searchParams.get("lastActivationTo") || "";
    const lastOrderFrom = searchParams.get("lastOrderFrom") || "";
    const lastOrderTo = searchParams.get("lastOrderTo") || "";

    const creditMinRaw = searchParams.get("creditMin");
    const creditMaxRaw = searchParams.get("creditMax");
    const creditMin =
      creditMinRaw !== null && creditMinRaw !== ""
        ? Number(creditMinRaw.replace(",", "."))
        : undefined;
    const creditMax =
      creditMaxRaw !== null && creditMaxRaw !== ""
        ? Number(creditMaxRaw.replace(",", "."))
        : undefined;

    const rawLimit = searchParams.get("limit");
    const requestedLimit =
      rawLimit === "0"
        ? 0
        : Number(rawLimit || 100);

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

    const unlimited = requestedLimit === 0;

    /*
     * "Sem limite" comercial não significa carregar a base inteira em RAM.
     * No modo ilimitado, entregamos lotes de 250 registros.
     */
    const SAFE_BATCH_SIZE = 250;

    const page = Math.max(
      1,
      Number.isFinite(requestedPage) ? requestedPage : 1
    );

    const boundedTake = Math.max(
      1,
      Math.min(
        Number.isFinite(requestedLimit) ? requestedLimit : 100,
        500
      )
    );

    const pageSize = unlimited ? SAFE_BATCH_SIZE : boundedTake;
    const skip = (page - 1) * pageSize;

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

    const createdAtFilter = dateRangeFilter(createdFrom, createdTo);
    const lastTransferAtFilter = dateRangeFilter(lastTransferFrom, lastTransferTo);
    const lastActivationAtFilter = dateRangeFilter(lastActivationFrom, lastActivationTo);
    const lastOrderAtRange = dateRangeFilter(lastOrderFrom, lastOrderTo);

    const creditLimitFilter =
      (Number.isFinite(creditMin) || Number.isFinite(creditMax))
        ? {
            ...(Number.isFinite(creditMin) ? { gte: creditMin } : {}),
            ...(Number.isFinite(creditMax) ? { lte: creditMax } : {}),
          }
        : undefined;

    const extraAnd: any[] = [];

    if (contact) {
      extraAnd.push({
        OR: [
          { phone1: { contains: contact } },
          { phone2: { contains: contact } },
        ],
      });
    }

    if (contactStatus === "WITH") {
      extraAnd.push({
        OR: [
          { phone1: { not: null } },
          { phone2: { not: null } },
        ],
      });
    } else if (contactStatus === "WITHOUT") {
      extraAnd.push({
        AND: [
          { OR: [{ phone1: null }, { phone1: "" }] },
          { OR: [{ phone2: null }, { phone2: "" }] },
        ],
      });
    }

    if (orderStatus === "WITH_ORDER") {
      extraAnd.push({
        lastOrderAt: { not: null },
      });
    } else if (orderStatus === "NO_ORDER") {
      extraAnd.push({
        lastOrderAt: null,
      });
    }

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

      createdAt: createdAtFilter,
      lastTransferAt: lastTransferAtFilter,
      lastActivationAt: lastActivationAtFilter,

      lastOrderAt:
        orderStatus === "ALL"
          ? lastOrderAtRange
          : undefined,

      creditLimit: creditLimitFilter,

      id:
        view === "NEW"
          ? exportedIds.length
            ? { notIn: exportedIds }
            : undefined
          : view === "REVEALED"
            ? { in: exportedIds.length ? exportedIds : ["__none__"] }
            : undefined,

      ...(extraAnd.length ? { AND: extraAnd } : {}),
    } as any;

    /*
     * Consulta segura:
     * - nunca carrega a base inteira;
     * - no modo ilimitado busca 251 para saber se existe próximo lote;
     * - evita Promise.all entre findMany/count para não disputar pool pequeno.
     */
    const rawRows = await prisma.prospect.findMany({
      where: prospectWhere,
      orderBy: getSort(sortBy, sortDir),
      skip,
      take: unlimited ? pageSize + 1 : pageSize,
    });

    const hasMore = unlimited
      ? rawRows.length > pageSize
      : false;

    const prospectsRaw = unlimited
      ? rawRows.slice(0, pageSize)
      : rawRows;

    const totalFound = unlimited
      ? null
      : await prisma.prospect.count({
          where: prospectWhere,
        });

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
        createdAt: formatDate(prospect.createdAt),
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
      limit: unlimited ? 0 : pageSize,
      batchSize: pageSize,
      hasMore,
      totalPages: unlimited
        ? null
        : Math.max(1, Math.ceil(Number(totalFound || 0) / pageSize)),
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
