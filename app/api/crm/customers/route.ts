import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/server-company";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CUSTOMER_STATUSES = new Set([
  "prospect",
  "cotacao",
  "pedido",
  "ativo",
  "risco",
  "inativo",
  "inadimplente",
  "bloqueado",
]);

const PMG_ORIGIN = {
  latitude: -23.718094084605312,
  longitude: -46.89524968501926,
  address:
    "Estrada Ferreira Guedes, 784, Potuvera, Itapecerica da Serra - SP, Brasil",
};

const GEOCODING_USER_AGENT =
  process.env.GEOCODING_USER_AGENT ||
  "ZentraSalesAI/2.0 (contato@pmg.com.br)";

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

type CompanyAccess = Awaited<ReturnType<typeof requireCompanyAccess>>;

type AddressInput = {
  cep?: string | null;
  address?: string | null;
  number?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
};

type Coordinates = {
  latitude: number;
  longitude: number;
};

type DistanceClassification = {
  distance_km: number;
  price_table: number;
  geocoded_address: string;
  source: "osrm" | "haversine";
};

function cleanText(value: unknown) {
  return String(value || "").trim();
}

function cleanOptional(value: unknown) {
  const text = cleanText(value);
  return text || null;
}

function cleanMoney(value: unknown) {
  const raw = cleanText(value).replace(/\./g, "").replace(",", ".");

  if (!raw) return null;

  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}

function cleanWeekdays(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => cleanText(item)).filter(Boolean);
  }

  const text = cleanText(value);

  if (!text) return [];

  return text
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function cleanCep(value: unknown) {
  const digits = cleanText(value).replace(/\D/g, "");
  return digits.length === 8 ? digits : "";
}

function extractCepFromAddress(value: unknown) {
  const match = cleanText(value).match(
    /(?:CEP\s*[:\-]?\s*)?(\d{5})-?(\d{3})/i
  );

  return match ? `${match[1]}${match[2]}` : "";
}

function effectiveCep(customer: AddressInput) {
  return (
    cleanCep(customer.cep) ||
    extractCepFromAddress(customer.address)
  );
}

function formatCep(digits: string) {
  if (!/^\d{8}$/.test(digits)) return null;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function onlyUnique<T>(values: T[]) {
  return [...new Set(values)];
}

function mapCustomerPayload(
  body: any,
  access: CompanyAccess,
  role: ReturnType<typeof normalizeRole>
) {
  return {
    company_id: access.companyId,
    seller_id:
      role === "VENDEDOR"
        ? access.userId || null
        : cleanOptional(body?.seller_id) || access.userId || null,

    internal_code: cleanOptional(body?.internal_code),
    erp_code: cleanOptional(body?.erp_code),
    document: cleanOptional(body?.document),
    legal_name: cleanText(
      body?.legal_name || body?.name || body?.razao_social
    ),
    trade_name: cleanOptional(
      body?.trade_name || body?.nome_fantasia
    ),
    segment: cleanOptional(body?.segment),
    category: cleanOptional(body?.category),

    buyer_name: cleanOptional(body?.buyer_name || body?.contact_name),
    phone: cleanOptional(body?.phone),
    whatsapp: cleanOptional(body?.whatsapp),
    email: cleanOptional(body?.email),

    cep: cleanOptional(body?.cep),
    address: cleanOptional(body?.address),
    number: cleanOptional(body?.number),
    complement: cleanOptional(body?.complement),
    neighborhood: cleanOptional(body?.neighborhood),
    city: cleanOptional(body?.city),
    state: cleanOptional(body?.state),

    payment_terms: cleanOptional(body?.payment_terms),
    weekly_purchase_limit: cleanMoney(body?.weekly_purchase_limit),
    habitual_purchase_day: cleanOptional(body?.habitual_purchase_day),
    purchase_weekdays: cleanWeekdays(body?.purchase_weekdays),
    expected_ticket: cleanMoney(body?.expected_ticket),
    commercial_notes: cleanOptional(body?.commercial_notes),

    status: cleanText(body?.status || "ativo"),
  };
}

function canAccessWhere(
  access: CompanyAccess,
  role: ReturnType<typeof normalizeRole>
) {
  const where: any = {
    company_id: access.companyId,
  };

  if (role === "VENDEDOR") {
    where.seller_id = access.userId;
  }

  return where;
}

function supervisorForbidden() {
  return NextResponse.json(
    {
      error:
        "Supervisor não possui acesso a esta rota operacional. Utilize o Command Center.",
    },
    { status: 403 }
  );
}

let nominatimQueue: Promise<unknown> = Promise.resolve();
let lastNominatimRequestAt = 0;

function scheduleNominatim<T>(
  task: () => Promise<T>
): Promise<T> {
  const run = nominatimQueue.then(async () => {
    const elapsed = Date.now() - lastNominatimRequestAt;
    const waitMs = Math.max(0, 1100 - elapsed);

    if (waitMs > 0) {
      await sleep(waitMs);
    }

    lastNominatimRequestAt = Date.now();
    return task();
  }) as Promise<T>;

  nominatimQueue = run.then(
    () => undefined,
    () => undefined
  );

  return run;
}

type CepAddress = {
  cep: string;
  address: string;
  neighborhood: string;
  city: string;
  state: string;
};

function isBrazilianCoordinate(
  latitude: number,
  longitude: number
) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -35 &&
    latitude <= 6 &&
    longitude >= -75 &&
    longitude <= -30
  );
}

function priceTableForDistance(distanceKm: number) {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) {
    return null;
  }

  if (distanceKm < 100) return 0;
  if (distanceKm < 200) return 1;
  if (distanceKm < 300) return 2;
  if (distanceKm < 400) return 3;
  if (distanceKm < 500) return 4;

  return 5;
}

function haversineDistanceKm(
  origin: Coordinates,
  destination: Coordinates
) {
  const toRadians = (value: number) =>
    (value * Math.PI) / 180;

  const earthRadiusKm = 6371;

  const latitudeDelta = toRadians(
    destination.latitude - origin.latitude
  );

  const longitudeDelta = toRadians(
    destination.longitude - origin.longitude
  );

  const originLatitude = toRadians(origin.latitude);
  const destinationLatitude = toRadians(
    destination.latitude
  );

  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(originLatitude) *
      Math.cos(destinationLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return (
    2 *
    earthRadiusKm *
    Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  );
}

async function fetchJson(
  url: string,
  init: RequestInit = {},
  timeoutMs = 12000
) {
  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    timeoutMs
  );

  try {
    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(
        `Serviço externo respondeu ${response.status}.`
      );
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function geocodeCepWithBrasilApi(
  cepDigits: string
): Promise<
  (Coordinates & { displayName: string }) | null
> {
  try {
    const data = await fetchJson(
      `https://brasilapi.com.br/api/cep/v2/${cepDigits}`,
      {
        headers: {
          "User-Agent": GEOCODING_USER_AGENT,
        },
      },
      12000
    ) as {
      state?: string;
      city?: string;
      neighborhood?: string;
      street?: string;
      location?: {
        coordinates?: {
          latitude?: string | number;
          longitude?: string | number;
        };
      };
    };

    const latitude = Number(
      data?.location?.coordinates?.latitude
    );

    const longitude = Number(
      data?.location?.coordinates?.longitude
    );

    if (!isBrazilianCoordinate(latitude, longitude)) {
      return null;
    }

    return {
      latitude,
      longitude,
      displayName: [
        cleanText(data.street),
        cleanText(data.neighborhood),
        cleanText(data.city),
        cleanText(data.state),
        formatCep(cepDigits),
        "Brasil",
      ]
        .filter(Boolean)
        .join(", "),
    };
  } catch (error) {
    console.warn(
      "[customers:geocode:brasilapi]",
      cepDigits,
      error
    );

    return null;
  }
}

async function lookupCepWithViaCep(
  cepDigits: string
): Promise<CepAddress | null> {
  try {
    const data = await fetchJson(
      `https://viacep.com.br/ws/${cepDigits}/json/`,
      {
        headers: {
          "User-Agent": GEOCODING_USER_AGENT,
        },
      },
      12000
    ) as {
      erro?: boolean;
      cep?: string;
      logradouro?: string;
      bairro?: string;
      localidade?: string;
      uf?: string;
    };

    if (data?.erro) {
      return null;
    }

    const city = cleanText(data.localidade);
    const state = cleanText(data.uf);

    if (!city || !state) {
      return null;
    }

    return {
      cep: cleanCep(data.cep) || cepDigits,
      address: cleanText(data.logradouro),
      neighborhood: cleanText(data.bairro),
      city,
      state,
    };
  } catch (error) {
    console.warn(
      "[customers:geocode:viacep]",
      cepDigits,
      error
    );

    return null;
  }
}

function candidateMatchesExpectedState(
  candidate: {
    address?: Record<string, unknown>;
  },
  expectedState: string
) {
  if (!expectedState) return true;

  const address = candidate.address || {};

  const rawStateCode =
    cleanText(address.state_code) ||
    cleanText(address["ISO3166-2-lvl4"]) ||
    cleanText(address["ISO3166-2-lvl3"]);

  if (!rawStateCode) return true;

  const candidateCode = rawStateCode
    .split("-")
    .pop()
    ?.toUpperCase();

  return candidateCode === expectedState.toUpperCase();
}

function candidateMatchesExpectedCep(
  candidate: {
    address?: Record<string, unknown>;
  },
  expectedCep: string
) {
  if (!expectedCep) return true;

  const candidateCep = cleanCep(
    candidate.address?.postcode
  );

  if (!candidateCep) return true;

  return (
    candidateCep.slice(0, 5) ===
    expectedCep.slice(0, 5)
  );
}

function buildGeocodingQueries(
  customer: AddressInput,
  resolvedCep: CepAddress | null
) {
  const cep = effectiveCep(customer);

  const resolvedAddress = resolvedCep
    ? [
        resolvedCep.address,
        cleanText(customer.number),
        resolvedCep.neighborhood,
        resolvedCep.city,
        resolvedCep.state,
        formatCep(resolvedCep.cep),
        "Brasil",
      ]
        .filter(Boolean)
        .join(", ")
    : "";

  const resolvedCepCity = resolvedCep
    ? [
        formatCep(resolvedCep.cep),
        resolvedCep.city,
        resolvedCep.state,
        "Brasil",
      ]
        .filter(Boolean)
        .join(", ")
    : "";

  const structuredAddress = [
    cleanText(customer.address),
    cleanText(customer.number),
    cleanText(customer.neighborhood),
    cleanText(customer.city),
    cleanText(customer.state),
    cep ? formatCep(cep) : "",
    "Brasil",
  ]
    .filter(Boolean)
    .join(", ");

  const rawAddress = [
    cleanText(customer.address),
    "Brasil",
  ]
    .filter(Boolean)
    .join(", ");

  const cityState = [
    cleanText(customer.city),
    cleanText(customer.state),
    "Brasil",
  ]
    .filter(Boolean)
    .join(", ");

  return onlyUnique(
    [
      resolvedAddress,
      resolvedCepCity,
      cep ? `${formatCep(cep)}, Brasil` : "",
      structuredAddress !== "Brasil"
        ? structuredAddress
        : "",
      rawAddress !== "Brasil" ? rawAddress : "",
      cityState !== "Brasil" ? cityState : "",
    ].filter(Boolean)
  );
}

async function geocodeAddress(
  customer: AddressInput
): Promise<Coordinates & { displayName: string }> {
  const cep = effectiveCep(customer);

  if (cep) {
    const directCoordinates =
      await geocodeCepWithBrasilApi(cep);

    if (directCoordinates) {
      return directCoordinates;
    }
  }

  const resolvedCep = cep
    ? await lookupCepWithViaCep(cep)
    : null;

  const queries = buildGeocodingQueries(
    customer,
    resolvedCep
  );

  if (!queries.length) {
    throw new Error(
      "Cliente sem CEP ou endereço suficiente."
    );
  }

  const expectedState =
    resolvedCep?.state ||
    cleanText(customer.state);

  const expectedCep =
    resolvedCep?.cep ||
    cep;

  for (const query of queries) {
    const params = new URLSearchParams({
      q: query,
      format: "jsonv2",
      limit: "5",
      countrycodes: "br",
      addressdetails: "1",
    });

    try {
      const data = await scheduleNominatim(
        () =>
          fetchJson(
            `https://nominatim.openstreetmap.org/search?${params.toString()}`,
            {
              headers: {
                "User-Agent": GEOCODING_USER_AGENT,
                "Accept-Language":
                  "pt-BR,pt;q=0.9",
              },
            }
          )
      ) as Array<{
        lat?: string;
        lon?: string;
        display_name?: string;
        address?: Record<string, unknown>;
      }>;

      const candidate = (data || []).find(
        (item) => {
          const latitude = Number(item?.lat);
          const longitude = Number(item?.lon);

          return (
            isBrazilianCoordinate(
              latitude,
              longitude
            ) &&
            candidateMatchesExpectedState(
              item,
              expectedState
            ) &&
            candidateMatchesExpectedCep(
              item,
              expectedCep
            )
          );
        }
      );

      if (!candidate) {
        continue;
      }

      return {
        latitude: Number(candidate.lat),
        longitude: Number(candidate.lon),
        displayName:
          cleanText(candidate.display_name) ||
          query,
      };
    } catch (error) {
      console.warn(
        "[customers:geocode:nominatim]",
        query,
        error
      );
    }
  }

  throw new Error(
    "Não foi possível localizar o CEP/endereço."
  );
}

async function calculateDrivingDistanceKm(
  destination: Coordinates
): Promise<{
  distanceKm: number;
  source: "osrm" | "haversine";
}> {
  const coordinates = [
    `${PMG_ORIGIN.longitude},${PMG_ORIGIN.latitude}`,
    `${destination.longitude},${destination.latitude}`,
  ].join(";");

  const params = new URLSearchParams({
    overview: "false",
    alternatives: "false",
    steps: "false",
  });

  try {
    const data = await fetchJson(
      `https://router.project-osrm.org/route/v1/driving/${coordinates}?${params.toString()}`,
      {
        headers: {
          "User-Agent": GEOCODING_USER_AGENT,
        },
      }
    ) as {
      code?: string;
      routes?: Array<{ distance?: number }>;
    };

    const distanceMeters = Number(
      data?.routes?.[0]?.distance
    );

    if (
      data?.code === "Ok" &&
      Number.isFinite(distanceMeters) &&
      distanceMeters >= 0
    ) {
      return {
        distanceKm: distanceMeters / 1000,
        source: "osrm",
      };
    }
  } catch (error) {
    console.warn(
      "[customers:distance:osrm]",
      error
    );
  }

  const straightLineKm = haversineDistanceKm(
    PMG_ORIGIN,
    destination
  );

  return {
    distanceKm: straightLineKm * 1.22,
    source: "haversine",
  };
}

async function calculateCustomerClassification(
  customer: AddressInput
): Promise<DistanceClassification> {
  const destination = await geocodeAddress(customer);

  const route = await calculateDrivingDistanceKm(
    destination
  );

  const roundedDistance = Number(
    route.distanceKm.toFixed(2)
  );

  const priceTable =
    priceTableForDistance(roundedDistance);

  if (priceTable === null) {
    throw new Error(
      "Distância calculada inválida."
    );
  }

  return {
    distance_km: roundedDistance,
    price_table: priceTable,
    geocoded_address: destination.displayName,
    source: route.source,
  };
}


function promotionState(customer: any) {
  const access = customer.webPromotionAccess || null;
  const subscriptions = Array.isArray(customer.pushSubscriptions)
    ? customer.pushSubscriptions
    : [];

  const activeAccess = Boolean(access?.active);
  const linkGenerated = Boolean(access);
  const portalAccessed = Boolean(
    access?.first_access_at ||
      access?.last_access_at ||
      Number(access?.access_count || 0) > 0
  );

  const pushEnabled = subscriptions.some(
    (subscription: any) =>
      subscription?.active !== false &&
      String(subscription?.permission || "granted").toLowerCase() ===
        "granted"
  );

  const status = pushEnabled
    ? "push"
    : portalAccessed
      ? "accessed"
      : linkGenerated
        ? "link"
        : "none";

  return {
    promotion_link_generated: linkGenerated,
    promotion_link_active: activeAccess,
    promotion_portal_accessed: portalAccessed,
    promotion_push_enabled: pushEnabled,
    promotion_status: status,
    promotion_access_count: Number(access?.access_count || 0),
    promotion_last_access_at: access?.last_access_at || null,
    promotion_push_permission:
      access?.push_permission || "not_requested",
  };
}

function serializeCustomer(
  customer: any,
  context?: {
    lastOrderAt?: Date | null;
    recentOrderCount?: number;
    lastQuoteAt?: Date | null;
    recentQuoteCount?: number;
  }
) {
  const { webPromotionAccess, pushSubscriptions, ...base } = customer;

  return {
    ...base,
    ...promotionState({
      webPromotionAccess,
      pushSubscriptions,
    }),
    last_order_at: context?.lastOrderAt || null,
    recent_order_count: Number(context?.recentOrderCount || 0),
    last_quote_at: context?.lastQuoteAt || null,
    recent_quote_count: Number(context?.recentQuoteCount || 0),
  };
}

export async function GET(req: NextRequest) {
  try {
    const access = await requireCompanyAccess(req);
    const role = normalizeRole(access.userRole);

    if (role === "SUPERVISOR") {
      return supervisorForbidden();
    }

    if (role === "VENDEDOR" && !access.userId) {
      return NextResponse.json(
        { error: "Usuário não encontrado na sessão." },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const q = cleanText(searchParams.get("q")).toLowerCase();
    const status = cleanText(searchParams.get("status"));
    const segment = cleanText(searchParams.get("segment"));

    const where: any = canAccessWhere(access, role);

    if (status) {
      where.status =
        status === "inativo"
          ? { in: ["inativo", "risco"] }
          : status;
    }

    if (segment) {
      where.segment = {
        contains: segment,
        mode: "insensitive",
      };
    }

    if (q) {
      where.OR = [
        { legal_name: { contains: q, mode: "insensitive" } },
        { trade_name: { contains: q, mode: "insensitive" } },
        { internal_code: { contains: q, mode: "insensitive" } },
        { erp_code: { contains: q, mode: "insensitive" } },
        { document: { contains: q, mode: "insensitive" } },
        { whatsapp: { contains: q, mode: "insensitive" } },
        { buyer_name: { contains: q, mode: "insensitive" } },
        { city: { contains: q, mode: "insensitive" } },
        { cep: { contains: q, mode: "insensitive" } },
      ];
    }

    const customers = await prisma.salesCustomer.findMany({
      where,
      include: {
        webPromotionAccess: {
          select: {
            active: true,
            first_access_at: true,
            last_access_at: true,
            access_count: true,
            push_permission: true,
          },
        },
        pushSubscriptions: {
          where: {
            active: true,
          },
          select: {
            id: true,
            active: true,
            permission: true,
          },
          take: 3,
        },
      },
      orderBy: [{ updated_at: "desc" }],
      take: 300,
    });

    const customerIds = customers.map((customer) => customer.id);
    const customerByKey = new Map<string, string>();

    for (const customer of customers) {
      [
        customer.id,
        customer.internal_code,
        customer.erp_code,
        customer.document,
      ]
        .filter(Boolean)
        .forEach((value) => {
          customerByKey.set(String(value), customer.id);
        });
    }

    const start180 = new Date();
    start180.setDate(start180.getDate() - 180);

    const orderStats =
      customerIds.length > 0
        ? await prisma.salesOrder.groupBy({
            by: ["customer_id"],
            where: {
              company_id: access.companyId,
              customer_id: {
                in: customerIds,
              },
              created_at: {
                gte: start180,
              },
              ...(role === "VENDEDOR"
                ? { seller_id: access.userId }
                : {}),
            },
            _max: {
              created_at: true,
            },
            _count: {
              _all: true,
            },
          })
        : [];

    const orderContext = new Map<
      string,
      { lastOrderAt: Date | null; recentOrderCount: number }
    >();

    for (const row of orderStats) {
      if (!row.customer_id) continue;

      orderContext.set(row.customer_id, {
        lastOrderAt: row._max.created_at || null,
        recentOrderCount: Number(row._count._all || 0),
      });
    }

    const quoteLogs = await prisma.activity_logs.findMany({
      where: {
        company_id: access.companyId,
        action: "quote_saved",
        created_at: {
          gte: start180,
        },
        ...(role === "VENDEDOR"
          ? { user_id: access.userId }
          : {}),
      },
      select: {
        created_at: true,
        metadata: true,
      },
      orderBy: {
        created_at: "desc",
      },
      take: 1000,
    });

    const quoteContext = new Map<
      string,
      { lastQuoteAt: Date | null; recentQuoteCount: number }
    >();

    for (const log of quoteLogs) {
      const metadata =
        log.metadata &&
        typeof log.metadata === "object" &&
        !Array.isArray(log.metadata)
          ? (log.metadata as any)
          : {};

      const keys = [
        metadata.customerId,
        metadata.customerInternalCode,
        metadata.clientId,
        metadata.document,
      ].filter(Boolean);

      const customerId = keys
        .map((value) => customerByKey.get(String(value)))
        .find(Boolean);

      if (!customerId) continue;

      const current = quoteContext.get(customerId) || {
        lastQuoteAt: null,
        recentQuoteCount: 0,
      };

      current.recentQuoteCount += 1;

      if (
        !current.lastQuoteAt ||
        log.created_at.getTime() > current.lastQuoteAt.getTime()
      ) {
        current.lastQuoteAt = log.created_at;
      }

      quoteContext.set(customerId, current);
    }

    return NextResponse.json({
      customers: customers.map((customer) =>
        serializeCustomer(customer, {
          lastOrderAt: orderContext.get(customer.id)?.lastOrderAt || null,
          recentOrderCount:
            orderContext.get(customer.id)?.recentOrderCount || 0,
          lastQuoteAt: quoteContext.get(customer.id)?.lastQuoteAt || null,
          recentQuoteCount:
            quoteContext.get(customer.id)?.recentQuoteCount || 0,
        })
      ),
      price_table_rules: {
        origin: PMG_ORIGIN.address,
        ranges: [
          { table: 0, from_km: 0, to_km_exclusive: 100 },
          { table: 1, from_km: 100, to_km_exclusive: 200 },
          { table: 2, from_km: 200, to_km_exclusive: 300 },
          { table: 3, from_km: 300, to_km_exclusive: 400 },
          { table: 4, from_km: 400, to_km_exclusive: 500 },
          { table: 5, from_km: 500, to_km_exclusive: null },
        ],
      },
    });
  } catch (error: any) {
    console.error("[customers:get]", error);

    return NextResponse.json(
      { error: "Erro ao carregar clientes." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const access = await requireCompanyAccess(req);
    const role = normalizeRole(access.userRole);

    if (role === "SUPERVISOR") {
      return supervisorForbidden();
    }

    if (role === "VENDEDOR" && !access.userId) {
      return NextResponse.json(
        { error: "Usuário não encontrado na sessão." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const data = mapCustomerPayload(body, access, role);

    if (!data.legal_name) {
      return NextResponse.json(
        { error: "Razão social ou nome do cliente é obrigatório." },
        { status: 400 }
      );
    }

    let classification: DistanceClassification | null = null;
    let distanceWarning: string | null = null;

    try {
      classification = await calculateCustomerClassification(data);
    } catch (error) {
      distanceWarning =
        error instanceof Error
          ? error.message
          : "Não foi possível calcular a distância.";
      console.warn("[customers:post:distance]", error);
    }

    const extractedCep = effectiveCep(data);
    const formattedCep = formatCep(extractedCep);

    const customer = await prisma.salesCustomer.create({
      data: {
        ...data,
        ...(formattedCep ? { cep: formattedCep } : {}),
        distance_km: classification?.distance_km ?? null,
        price_table: classification?.price_table ?? null,
      },
    });

    return NextResponse.json({
      success: true,
      customer,
      distance_calculation: classification,
      warning: distanceWarning,
    });
  } catch (error: any) {
    console.error("[customers:post]", error);

    return NextResponse.json(
      { error: "Erro ao criar cliente." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const access = await requireCompanyAccess(req);
    const role = normalizeRole(access.userRole);

    if (role === "SUPERVISOR") {
      return supervisorForbidden();
    }

    if (role === "VENDEDOR" && !access.userId) {
      return NextResponse.json(
        { error: "Usuário não encontrado na sessão." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const id = cleanText(body?.id);

    if (!id) {
      return NextResponse.json(
        { error: "ID do cliente é obrigatório." },
        { status: 400 }
      );
    }

    const existing = await prisma.salesCustomer.findFirst({
      where: {
        id,
        ...canAccessWhere(access, role),
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Cliente não encontrado ou sem permissão." },
        { status: 404 }
      );
    }

    if (body?.status_only === true) {
      const nextStatus = cleanText(body?.status).toLowerCase();

      if (!CUSTOMER_STATUSES.has(nextStatus)) {
        return NextResponse.json(
          {
            error:
              "Status inválido. Use prospect, cotacao, pedido, ativo, inativo, inadimplente ou bloqueado.",
          },
          { status: 400 }
        );
      }

      const customer = await prisma.salesCustomer.update({
        where: {
          id: existing.id,
        },
        data: {
          status: nextStatus,
          updated_at: new Date(),
        },
      });

      return NextResponse.json({
        success: true,
        customer,
        status_only: true,
      });
    }

    const mapped = mapCustomerPayload(body, access, role);
    const { company_id, seller_id, ...data } = mapped;

    const addressFields = [
      "cep",
      "address",
      "number",
      "neighborhood",
      "city",
      "state",
    ] as const;

    const addressChanged = addressFields.some(
      (field) =>
        cleanText(existing[field]) !==
        cleanText(data[field])
    );

    let classification: DistanceClassification | null = null;
    let distanceWarning: string | null = null;

    try {
      classification = await calculateCustomerClassification(data);
    } catch (error) {
      distanceWarning =
        error instanceof Error
          ? error.message
          : "Não foi possível recalcular a distância.";
      console.warn("[customers:patch:distance]", error);
    }

    const extractedCep = effectiveCep(data);
    const formattedCep = formatCep(extractedCep);

    const customer = await prisma.salesCustomer.update({
      where: {
        id: existing.id,
      },
      data: {
        ...data,
        ...(formattedCep ? { cep: formattedCep } : {}),
        distance_km: classification
          ? classification.distance_km
          : addressChanged
            ? null
            : existing.distance_km,
        price_table: classification
          ? classification.price_table
          : addressChanged
            ? null
            : existing.price_table,
      },
    });

    return NextResponse.json({
      success: true,
      customer,
      distance_calculation: classification,
      warning: distanceWarning,
    });
  } catch (error: any) {
    console.error("[customers:patch]", error);

    return NextResponse.json(
      { error: "Erro ao atualizar cliente." },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const access = await requireCompanyAccess(req);
    const role = normalizeRole(access.userRole);

    if (role === "SUPERVISOR") {
      return supervisorForbidden();
    }

    if (role === "VENDEDOR" && !access.userId) {
      return NextResponse.json(
        { error: "Usuário não encontrado na sessão." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const customerId = cleanText(body?.customer_id || body?.id);

    if (!customerId) {
      return NextResponse.json(
        { error: "ID do cliente é obrigatório." },
        { status: 400 }
      );
    }

    const existing = await prisma.salesCustomer.findFirst({
      where: {
        id: customerId,
        ...canAccessWhere(access, role),
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Cliente não encontrado ou sem permissão." },
        { status: 404 }
      );
    }

    const classification =
      await calculateCustomerClassification(existing);

    const customer = await prisma.salesCustomer.update({
      where: {
        id: existing.id,
      },
      data: {
        distance_km: classification.distance_km,
        price_table: classification.price_table,
        updated_at: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      customer,
      distance_calculation: classification,
    });
  } catch (error: any) {
    console.error("[customers:put:distance]", error);

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Erro ao recalcular distância e tabela do cliente.",
      },
      { status: 422 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const access = await requireCompanyAccess(req);
    const role = normalizeRole(access.userRole);

    if (role === "SUPERVISOR") {
      return supervisorForbidden();
    }

    if (role === "VENDEDOR" && !access.userId) {
      return NextResponse.json(
        { error: "Usuário não encontrado na sessão." },
        { status: 401 }
      );
    }

    const id = cleanText(new URL(req.url).searchParams.get("id"));

    if (!id) {
      return NextResponse.json(
        { error: "ID do cliente é obrigatório." },
        { status: 400 }
      );
    }

    const existing = await prisma.salesCustomer.findFirst({
      where: {
        id,
        ...canAccessWhere(access, role),
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Cliente não encontrado ou sem permissão." },
        { status: 404 }
      );
    }

    await prisma.salesCustomer.delete({
      where: {
        id: existing.id,
      },
    });

    return NextResponse.json({
      success: true,
    });
  } catch (error: any) {
    console.error("[customers:delete]", error);

    return NextResponse.json(
      { error: "Erro ao remover cliente." },
      { status: 500 }
    );
  }
}
