import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/server-company";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PMG_ORIGIN = {
  latitude: -23.718094084605312,
  longitude: -46.89524968501926,
  address:
    "Estrada Ferreira Guedes, 784, Potuvera, Itapecerica da Serra - SP, Brasil",
};

const GEOCODING_USER_AGENT =
  process.env.GEOCODING_USER_AGENT ||
  "ZentraSalesAI/2.0 (contato@pmg.com.br)";

const SYSTEM_ADMIN_ROLES = new Set([
  "MASTER",
  "OWNER",
]);

const COMPANY_CONFIRMATION = "RECALCULAR_DISTANCIAS";
const SYSTEM_CONFIRMATION = "RECALCULAR_TODO_SISTEMA";

type Scope = "seller" | "company" | "system";

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

type CustomerCandidate = AddressInput & {
  id: string;
  company_id: string;
  seller_id: string | null;
  legal_name: string;
  trade_name: string | null;
  distance_km: unknown;
  price_table: number | null;
  updated_at: Date;
};

type DistanceClassification = {
  distance_km: number;
  price_table: number;
  geocoded_address: string;
  source: "osrm" | "haversine" | "stored";
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeRole(value: unknown) {
  return text(value).toUpperCase();
}

function normalizeScope(value: unknown): Scope {
  const scope = text(value).toLowerCase();

  if (scope === "seller") return "seller";
  if (scope === "system") return "system";

  return "company";
}

function clampInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) return fallback;

  return Math.max(
    min,
    Math.min(max, Math.trunc(parsed))
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function onlyUnique<T>(values: T[]) {
  return [...new Set(values)];
}

function cleanCep(value: unknown) {
  const digits = text(value).replace(/\D/g, "");
  return digits.length === 8 ? digits : "";
}

function extractCepFromAddress(value: unknown) {
  const match = text(value).match(
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

function hasCalculableAddress(customer: AddressInput) {
  if (effectiveCep(customer)) return true;

  return Boolean(
    text(customer.address) &&
      text(customer.city) &&
      text(customer.state)
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

/*
 * O Nominatim público pede intervalo entre requisições.
 * Esta fila protege chamadas concorrentes dentro da mesma
 * instância do servidor sem alterar nenhuma tabela do banco.
 */
let nominatimQueue: Promise<unknown> =
  Promise.resolve();

let lastNominatimRequestAt = 0;

function scheduleNominatim<T>(
  task: () => Promise<T>
): Promise<T> {
  const run = nominatimQueue.then(async () => {
    const elapsed =
      Date.now() - lastNominatimRequestAt;

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
      cep?: string;
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

    if (
      !isBrazilianCoordinate(
        latitude,
        longitude
      )
    ) {
      return null;
    }

    return {
      latitude,
      longitude,
      displayName: [
        text(data.street),
        text(data.neighborhood),
        text(data.city),
        text(data.state),
        formatCep(cepDigits),
        "Brasil",
      ]
        .filter(Boolean)
        .join(", "),
    };
  } catch (error) {
    console.warn(
      "[admin:customers:geocode:brasilapi]",
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

    const city = text(data.localidade);
    const state = text(data.uf);

    if (!city || !state) {
      return null;
    }

    return {
      cep:
        cleanCep(data.cep) ||
        cepDigits,
      address: text(data.logradouro),
      neighborhood: text(data.bairro),
      city,
      state,
    };
  } catch (error) {
    console.warn(
      "[admin:customers:geocode:viacep]",
      cepDigits,
      error
    );

    return null;
  }
}

function normalizeComparable(value: unknown) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
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
    text(address.state_code) ||
    text(address["ISO3166-2-lvl4"]) ||
    text(address["ISO3166-2-lvl3"]);

  if (!rawStateCode) return true;

  const candidateCode = rawStateCode
    .split("-")
    .pop()
    ?.toUpperCase();

  return (
    candidateCode ===
    expectedState.toUpperCase()
  );
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

  /*
   * Muitos pontos do OpenStreetMap não possuem postcode.
   * Quando existe, exigimos ao menos o mesmo prefixo de 5 dígitos.
   */
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
        text(customer.number),
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
    text(customer.address),
    text(customer.number),
    text(customer.neighborhood),
    text(customer.city),
    text(customer.state),
    cep ? formatCep(cep) : "",
    "Brasil",
  ]
    .filter(Boolean)
    .join(", ");

  const rawAddress = [
    text(customer.address),
    "Brasil",
  ]
    .filter(Boolean)
    .join(", ");

  const cityState = [
    text(customer.city),
    text(customer.state),
    "Brasil",
  ]
    .filter(Boolean)
    .join(", ");

  /*
   * Ordem segura:
   * 1. Endereço limpo retornado pelo CEP.
   * 2. CEP + cidade + UF.
   * 3. CEP isolado.
   * 4. Cadastro estruturado original.
   * 5. Endereço bruto importado.
   * 6. Cidade/UF.
   */
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

  /*
   * Para clientes com CEP, primeiro usamos um provedor cuja
   * resposta já está vinculada ao próprio CEP. Isso evita aceitar
   * um endereço homônimo em outro estado.
   */
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
    text(customer.state);

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
          text(candidate.display_name) ||
          query,
      };
    } catch (error) {
      console.warn(
        "[admin:customers:geocode:nominatim]",
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
      "[admin:customers:distance:osrm]",
      error
    );
  }

  /*
   * Fallback conservador quando o serviço rodoviário
   * estiver indisponível. Não impede o lote inteiro.
   */
  const straightLineKm = haversineDistanceKm(
    PMG_ORIGIN,
    destination
  );

  return {
    distanceKm: straightLineKm * 1.22,
    source: "haversine",
  };
}

async function calculateClassification(
  customer: CustomerCandidate,
  force: boolean
): Promise<DistanceClassification> {
  const storedDistance = Number(
    customer.distance_km
  );

  if (
    !force &&
    customer.distance_km !== null &&
    customer.distance_km !== undefined &&
    Number.isFinite(storedDistance) &&
    storedDistance >= 0
  ) {
    const storedTable =
      priceTableForDistance(storedDistance);

    if (storedTable === null) {
      throw new Error(
        "Distância armazenada inválida."
      );
    }

    return {
      distance_km: Number(
        storedDistance.toFixed(2)
      ),
      price_table: storedTable,
      geocoded_address:
        "Distância já existente no cadastro.",
      source: "stored",
    };
  }

  const destination =
    await geocodeAddress(customer);

  const route =
    await calculateDrivingDistanceKm(
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
    geocoded_address:
      destination.displayName,
    source: route.source,
  };
}

function authorizeScope(
  access: Awaited<
    ReturnType<typeof requireCompanyAccess>
  >,
  scope: Scope
) {
  const role = normalizeRole(access.userRole);

  if (!access.companyId) {
    throw new Error(
      "Empresa não identificada."
    );
  }

  if (!access.userId) {
    throw new Error(
      "Usuário não identificado."
    );
  }

  if (scope === "seller") {
    return;
  }

  /*
   * Escopo company:
   * qualquer usuário autenticado da empresa pode executar,
   * porque a consulta continua rigidamente limitada por company_id
   * e o POST exige a confirmação explícita
   * RECALCULAR_DISTANCIAS.
   *
   * Isso permite processar Júlia, Gregory e os demais vendedores
   * da mesma empresa sem abrir acesso a outras empresas.
   */
  if (scope === "company") {
    return;
  }

  /*
   * Escopo system continua restrito.
   */
  if (!SYSTEM_ADMIN_ROLES.has(role)) {
    throw new Error(
      "Apenas MASTER ou OWNER pode usar o escopo system."
    );
  }
}

function scopeWhere(
  access: Awaited<
    ReturnType<typeof requireCompanyAccess>
  >,
  scope: Scope
) {
  if (scope === "system") {
    return {};
  }

  if (scope === "seller") {
    return {
      company_id: access.companyId,
      seller_id: access.userId,
    };
  }

  /*
   * Escopo padrão e seguro:
   * todos os vendedores da empresa atual,
   * inclusive seller_id nulo.
   */
  return {
    company_id: access.companyId,
  };
}

function pendingWhere(
  baseWhere: Record<string, unknown>,
  force: boolean
) {
  if (force) return baseWhere;

  return {
    ...baseWhere,
    OR: [
      { distance_km: null },
      { price_table: null },
    ],
  };
}

function parseExcludedIds(value: unknown) {
  if (!Array.isArray(value)) return [];

  return onlyUnique(
    value
      .map(text)
      .filter((id) =>
        /^[0-9a-f-]{36}$/i.test(id)
      )
  ).slice(0, 500);
}

async function loadPendingCustomers(
  where: Record<string, unknown>,
  scanLimit: number
): Promise<CustomerCandidate[]> {
  return prisma.salesCustomer.findMany({
    where,
    select: {
      id: true,
      company_id: true,
      seller_id: true,
      legal_name: true,
      trade_name: true,
      cep: true,
      address: true,
      number: true,
      neighborhood: true,
      city: true,
      state: true,
      distance_km: true,
      price_table: true,
      updated_at: true,
    },
    orderBy: [
      { updated_at: "asc" },
      { id: "asc" },
    ],
    take: scanLimit,
  }) as Promise<CustomerCandidate[]>;
}

function summarize(
  customers: CustomerCandidate[]
) {
  const bySeller = new Map<
    string,
    {
      seller_id: string | null;
      pending: number;
      calculable: number;
      insufficient: number;
    }
  >();

  let calculable = 0;
  let insufficient = 0;

  for (const customer of customers) {
    const canCalculate =
      customer.distance_km !== null &&
      customer.distance_km !== undefined
        ? true
        : hasCalculableAddress(customer);

    if (canCalculate) {
      calculable += 1;
    } else {
      insufficient += 1;
    }

    const key =
      customer.seller_id || "__SEM_VENDEDOR__";

    const current = bySeller.get(key) || {
      seller_id: customer.seller_id,
      pending: 0,
      calculable: 0,
      insufficient: 0,
    };

    current.pending += 1;

    if (canCalculate) {
      current.calculable += 1;
    } else {
      current.insufficient += 1;
    }

    bySeller.set(key, current);
  }

  return {
    pending: customers.length,
    calculable,
    insufficient,
    by_seller: [...bySeller.values()].sort(
      (a, b) =>
        String(a.seller_id).localeCompare(
          String(b.seller_id)
        )
    ),
  };
}

function errorResponse(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : "Erro inesperado.";

  const status =
    /apenas|acesso|identificad|gestor|master|owner/i.test(
      message
    )
      ? 403
      : 500;

  console.error(
    "[admin:customers:recalculate-distances]",
    error
  );

  return NextResponse.json(
    { error: message },
    { status }
  );
}

/*
 * GET = diagnóstico seguro, sem alterar dados.
 *
 * Exemplos:
 * /api/admin/customers/recalculate-distances
 * /api/admin/customers/recalculate-distances?scope=company
 * /api/admin/customers/recalculate-distances?scope=seller
 */
export async function GET(
  request: NextRequest
) {
  try {
    const access =
      await requireCompanyAccess(request);

    const scope = normalizeScope(
      request.nextUrl.searchParams.get("scope")
    );

    authorizeScope(access, scope);

    const force =
      request.nextUrl.searchParams.get("force") ===
      "true";

    const scanLimit = clampInteger(
      request.nextUrl.searchParams.get(
        "scan_limit"
      ),
      1000,
      1,
      5000
    );

    const where = pendingWhere(
      scopeWhere(access, scope),
      force
    );

    const customers =
      await loadPendingCustomers(
        where,
        scanLimit
      );

    return NextResponse.json({
      success: true,
      mode: "preview",
      scope,
      company_id:
        scope === "system"
          ? null
          : access.companyId,
      origin: PMG_ORIGIN,
      ...summarize(customers),
      rules: [
        { table: 0, from_km: 0, to_km_exclusive: 100 },
        { table: 1, from_km: 100, to_km_exclusive: 200 },
        { table: 2, from_km: 200, to_km_exclusive: 300 },
        { table: 3, from_km: 300, to_km_exclusive: 400 },
        { table: 4, from_km: 400, to_km_exclusive: 500 },
        { table: 5, from_km: 500, to_km_exclusive: null },
      ],
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/*
 * POST = processa um lote pequeno.
 *
 * Segurança:
 * - padrão: scope company;
 * - máximo: 2 clientes por chamada;
 * - nunca altera company_id ou seller_id;
 * - nunca apaga cliente;
 * - não cria migration;
 * - somente distance_km, price_table, cep extraído
 *   e updated_at podem ser atualizados.
 */
export async function POST(
  request: NextRequest
) {
  try {
    const access =
      await requireCompanyAccess(request);

    const body = await request
      .json()
      .catch(() => ({}));

    const scope = normalizeScope(body?.scope);
    const force = body?.force === true;
    const dryRun = body?.dry_run === true;

    authorizeScope(access, scope);

    const requiredConfirmation =
      scope === "system"
        ? SYSTEM_CONFIRMATION
        : COMPANY_CONFIRMATION;

    if (
      !dryRun &&
      text(body?.confirmation) !==
        requiredConfirmation
    ) {
      return NextResponse.json(
        {
          error:
            `Confirmação inválida. Envie "${requiredConfirmation}".`,
        },
        { status: 400 }
      );
    }

    const limit = clampInteger(
      body?.limit,
      1,
      1,
      2
    );

    const scanLimit = clampInteger(
      body?.scan_limit,
      1000,
      1,
      5000
    );

    const excludedIds =
      parseExcludedIds(body?.exclude_ids);

    const excluded = new Set(excludedIds);

    const where = pendingWhere(
      scopeWhere(access, scope),
      force
    );

    const pending =
      await loadPendingCustomers(
        where,
        scanLimit
      );

    const available = pending.filter(
      (customer) => !excluded.has(customer.id)
    );

    const insufficient = available.filter(
      (customer) =>
        customer.distance_km === null &&
        !hasCalculableAddress(customer)
    );

    const calculable = available.filter(
      (customer) =>
        !(
          customer.distance_km === null &&
          !hasCalculableAddress(customer)
        )
    );

    const batch = calculable.slice(0, limit);

    if (dryRun) {
      return NextResponse.json({
        success: true,
        mode: "dry_run",
        scope,
        requested_limit: limit,
        selected: batch.map((customer) => ({
          id: customer.id,
          company_id: customer.company_id,
          seller_id: customer.seller_id,
          name:
            customer.trade_name ||
            customer.legal_name,
          cep:
            formatCep(effectiveCep(customer)) ||
            customer.cep,
          address: customer.address,
          city: customer.city,
          state: customer.state,
        })),
        insufficient: insufficient.map(
          (customer) => ({
            id: customer.id,
            company_id: customer.company_id,
            seller_id: customer.seller_id,
            name:
              customer.trade_name ||
              customer.legal_name,
            reason:
              "Sem CEP e sem endereço completo.",
          })
        ),
      });
    }

    const processed: Array<Record<string, unknown>> =
      [];

    const failed: Array<Record<string, unknown>> =
      [];

    for (const customer of batch) {
      try {
        const classification =
          await calculateClassification(
            customer,
            force
          );

        const extractedCep =
          effectiveCep(customer);

        const formattedCep =
          formatCep(extractedCep);

        const updated =
          await prisma.salesCustomer.update({
            where: {
              id: customer.id,
            },
            data: {
              distance_km:
                classification.distance_km,
              price_table:
                classification.price_table,
              ...(formattedCep &&
              !cleanCep(customer.cep)
                ? { cep: formattedCep }
                : {}),
              updated_at: new Date(),
            },
            select: {
              id: true,
              company_id: true,
              seller_id: true,
              legal_name: true,
              trade_name: true,
              cep: true,
              city: true,
              state: true,
              distance_km: true,
              price_table: true,
            },
          });

        processed.push({
          ...updated,
          distance_km:
            updated.distance_km === null
              ? null
              : Number(updated.distance_km),
          source: classification.source,
          geocoded_address:
            classification.geocoded_address,
        });
      } catch (error) {
        failed.push({
          id: customer.id,
          company_id: customer.company_id,
          seller_id: customer.seller_id,
          name:
            customer.trade_name ||
            customer.legal_name,
          error:
            error instanceof Error
              ? error.message
              : "Falha no cálculo.",
        });
      }
    }

    const nextExcluded = onlyUnique([
      ...excludedIds,
      ...failed.map((item) =>
        text(item.id)
      ),
    ]);

    const remainingRows =
      await loadPendingCustomers(
        where,
        scanLimit
      );

    const remainingCalculable =
      remainingRows.filter(
        (customer) =>
          !nextExcluded.includes(customer.id) &&
          !(
            customer.distance_km === null &&
            !hasCalculableAddress(customer)
          )
      ).length;

    return NextResponse.json({
      success: true,
      mode: "processed",
      scope,
      origin: PMG_ORIGIN.address,
      batch_limit: limit,
      processed_count: processed.length,
      failed_count: failed.length,
      insufficient_count:
        insufficient.length,
      remaining_calculable:
        remainingCalculable,
      done: remainingCalculable === 0,
      processed,
      failed,
      insufficient: insufficient.map(
        (customer) => ({
          id: customer.id,
          company_id: customer.company_id,
          seller_id: customer.seller_id,
          name:
            customer.trade_name ||
            customer.legal_name,
          reason:
            "Sem CEP e sem endereço completo.",
        })
      ),
      /*
       * Reenvie estes IDs em exclude_ids na próxima chamada
       * para que um endereço problemático não bloqueie o lote.
       */
      next_exclude_ids: nextExcluded,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
