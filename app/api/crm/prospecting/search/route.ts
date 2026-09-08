import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/server-company";
import { analyzeBrazilianPhone } from "@/lib/prospecting/phone";

export const dynamic = "force-dynamic";

function clean(value: unknown, max = 160) {
  return String(value ?? "").trim().slice(0, max);
}

function normalizeSearch(value: unknown) {
  return clean(value, 200)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function digits(value: unknown) {
  return clean(value, 100).replace(/\D/g, "");
}

function formatLegacyCnpj(value: string) {
  const raw = value.replace(/\D/g, "");
  if (raw.length !== 14) return value;

  return `${raw.slice(0, 2)}.${raw.slice(2, 5)}.${raw.slice(
    5,
    8
  )}/${raw.slice(8, 12)}-${raw.slice(12)}`;
}

function formatAddress(row: {
  street_type: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string;
  uf: string;
  postal_code: string | null;
}) {
  const street = [row.street_type, row.street]
    .filter(Boolean)
    .join(" ")
    .trim();

  const line1 = [street, row.number]
    .filter(Boolean)
    .join(", ");

  const line2 = [
    row.neighborhood,
    `${row.city} - ${row.uf}`,
    row.postal_code
      ? `CEP ${row.postal_code.slice(0, 5)}-${row.postal_code.slice(5)}`
      : null,
  ]
    .filter(Boolean)
    .join(" • ");

  return [line1, row.complement, line2]
    .filter(Boolean)
    .join(" — ");
}

function segmentKey(value: string) {
  const normalized = normalizeSearch(value);

  const aliases: Record<string, string> = {
    pizzaria: "pizzaria",
    hamburgueria: "hamburgueria",
    restaurante: "restaurante",
    lanchonete: "lanchonete",
    marmitaria: "marmitaria",
    padaria: "padaria",
    confeitaria: "confeitaria",
    acougue: "acougue",
    peixaria: "peixaria",
    supermercado: "supermercado",
    mercado: "mercado",
    minimercado: "minimercado",
    mercearia: "mercearia",
    bar: "bar",
    cafeteria: "cafeteria",
    buffet: "buffet",
    conveniencia: "conveniencia",
    alimentos: "alimentos",
  };

  return aliases[normalized] || normalized.replace(/\s+/g, "_");
}

function nationalPhone(value: unknown) {
  const raw = digits(value);

  if (
    raw.startsWith("55") &&
    (raw.length === 12 || raw.length === 13)
  ) {
    return raw.slice(2);
  }

  return raw;
}

function oldMobilePrefix(value: unknown) {
  const national = nationalPhone(value);

  if (national.length !== 10) {
    return "";
  }

  const local = national.slice(2);

  if (
    local.length === 8 &&
    /^[6-9]/.test(local)
  ) {
    return local[0];
  }

  return "";
}

function matchesPhoneFilter(
  type: string,
  phoneValue: unknown,
  filterRaw: unknown
) {
  const filter = clean(filterRaw, 40).toLowerCase();

  if (!filter || filter === "all") return true;

  if (filter === "mobile_or_candidate") {
    return type === "mobile" || type === "mobile_candidate";
  }

  if (/^mobile_candidate_[6789]$/.test(filter)) {
    const wantedPrefix = filter.slice(-1);

    return (
      type === "mobile_candidate" &&
      oldMobilePrefix(phoneValue) === wantedPrefix
    );
  }

  return type === filter;
}

function companyAgeInYears(value: unknown) {
  if (!value) return null;

  const date = new Date(value as any);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return Math.max(
    0,
    (Date.now() - date.getTime()) /
      (365.25 * 24 * 60 * 60 * 1000)
  );
}

function matchesCompanyAge(
  startDate: unknown,
  filterRaw: unknown
) {
  const filter = clean(filterRaw, 30).toLowerCase();

  if (!filter || filter === "all") return true;

  const years = companyAgeInYears(startDate);

  if (years === null) {
    return false;
  }

  if (filter === "up_to_1") return years < 1;
  if (filter === "1_3") return years >= 1 && years < 3;
  if (filter === "3_5") return years >= 3 && years < 5;
  if (filter === "5_10") return years >= 5 && years < 10;
  if (filter === "10_plus") return years >= 10;

  return true;
}

function formatPhoneForDisplay(value: unknown) {
  const national = nationalPhone(value);

  if (national.length === 11) {
    return `(${national.slice(0, 2)}) ${national.slice(
      2,
      7
    )}-${national.slice(7)}`;
  }

  if (national.length === 10) {
    return `(${national.slice(0, 2)}) ${national.slice(
      2,
      6
    )}-${national.slice(6)}`;
  }

  return clean(value, 50) || null;
}

function buildLeadScore(input: {
  phoneType: string;
  email: string | null;
  tradeName: string | null;
  neighborhood: string | null;
  startDate: unknown;
}) {
  let score = 0;
  const reasons: string[] = [];

  if (input.phoneType === "mobile") {
    score += 45;
    reasons.push("WhatsApp pronto");
  } else if (input.phoneType === "mobile_candidate") {
    score += 32;
    reasons.push("Celular antigo provável");
  } else if (input.phoneType === "landline") {
    score += 12;
    reasons.push("Telefone fixo");
  }

  if (input.email) {
    score += 25;
    reasons.push("E-mail disponível");
  }

  if (input.tradeName) {
    score += 20;
    reasons.push("Nome fantasia");
  }

  if (input.neighborhood) {
    score += 10;
    reasons.push("Bairro identificado");
  }

  const age = companyAgeInYears(input.startDate);

  if (age !== null) {
    if (age >= 10) {
      score += 15;
      reasons.push("Empresa com 10+ anos");
    } else if (age >= 5) {
      score += 12;
      reasons.push("Empresa estabelecida há 5+ anos");
    } else if (age >= 3) {
      score += 8;
      reasons.push("Empresa com 3+ anos");
    } else if (age >= 1) {
      score += 5;
      reasons.push("Empresa com histórico");
    }
  }

  return {
    score: Math.min(100, score),
    reasons,
  };
}

function phoneVariants(phone: string) {
  const raw = digits(phone);
  if (!raw) return [];

  const variants = new Set<string>([raw, phone]);

  if (raw.startsWith("55") && raw.length >= 12) {
    variants.add(raw.slice(2));
    variants.add(`+${raw}`);
  }

  if (raw.length === 13 && raw.startsWith("55")) {
    const ddd = raw.slice(2, 4);
    const local = raw.slice(4);
    variants.add(`(${ddd}) ${local.slice(0, 5)}-${local.slice(5)}`);
  }

  return [...variants];
}

async function filterUnavailable(input: {
  companyId: string;
  rows: Array<{
    cnpj: string;
    phone: string;
    phone_digits: string;
  }>;
}) {
  if (!input.rows.length) {
    return {
      reservedCnpjs: new Set<string>(),
      customerCnpjs: new Set<string>(),
      customerPhones: new Set<string>(),
    };
  }

  const cnpjs = input.rows.map((row) => row.cnpj);

  const reserved = await prisma.externalProspectCompany.findMany({
    where: {
      company_id: input.companyId,
      source: "receita_cnpj",
      source_external_id: {
        in: cnpjs,
      },
    },
    select: {
      source_external_id: true,
    },
  });

  const documentVariants = [
    ...new Set(
      cnpjs.flatMap((cnpj) => [
        cnpj,
        formatLegacyCnpj(cnpj),
      ])
    ),
  ];

  const phoneValues = [
    ...new Set(
      input.rows.flatMap((row) => [
        ...phoneVariants(row.phone),
        ...phoneVariants(row.phone_digits),
      ])
    ),
  ];

  const customers = await prisma.salesCustomer.findMany({
    where: {
      company_id: input.companyId,
      OR: [
        {
          document: {
            in: documentVariants,
          },
        },
        {
          phone: {
            in: phoneValues,
          },
        },
        {
          whatsapp: {
            in: phoneValues,
          },
        },
      ],
    },
    select: {
      document: true,
      phone: true,
      whatsapp: true,
    },
    take: 5000,
  });

  const customerCnpjs = new Set<string>();
  const customerPhones = new Set<string>();

  for (const customer of customers) {
    const document = clean(customer.document, 60)
      .replace(/[^A-Za-z0-9]/g, "")
      .toUpperCase();

    if (document) {
      customerCnpjs.add(document);
    }

    for (const value of [
      customer.phone,
      customer.whatsapp,
    ]) {
      const phone = digits(value);

      if (!phone) continue;

      customerPhones.add(phone);

      if (phone.startsWith("55")) {
        customerPhones.add(phone.slice(2));
      } else if (phone.length === 11) {
        customerPhones.add(`55${phone}`);
      }
    }
  }

  return {
    reservedCnpjs: new Set(
      reserved.map((item) => item.source_external_id)
    ),
    customerCnpjs,
    customerPhones,
  };
}

export async function POST(req: NextRequest) {
  try {
    const access = await requireCompanyAccess(req);
    const body = await req.json().catch(() => ({}));

    const segment = clean(body?.segment, 80);
    const city = clean(body?.city, 80);
    const region = clean(body?.region, 80);
    const phoneFilter = clean(
      body?.phoneFilter || "all",
      40
    ).toLowerCase();
    const hasEmail = body?.hasEmail === true;
    const hasTradeName = body?.hasTradeName === true;
    const cnaeMain = digits(body?.cnaeMain);
    const companyAge = clean(
      body?.companyAge || "all",
      30
    ).toLowerCase();

    const pageSize = Math.max(
      1,
      Math.min(30, Number(body?.pageSize || 20))
    );

    const initialOffset = Math.max(
      0,
      Number.parseInt(
        clean(body?.pageToken, 30) || "0",
        10
      ) || 0
    );

    if (!segment) {
      return NextResponse.json(
        {
          error:
            "Informe o segmento que deseja prospectar.",
        },
        { status: 400 }
      );
    }

    if (!city) {
      return NextResponse.json(
        {
          error:
            "Informe a cidade da busca.",
        },
        { status: 400 }
      );
    }

    const tag = segmentKey(segment);
    const citySearch = normalizeSearch(city);
    const regionSearch = normalizeSearch(region);

    const queryText = region
      ? `${segment} • ${city} • ${region}`
      : `${segment} • ${city}`;

    const results: any[] = [];
    let hiddenReserved = 0;
    let hiddenCustomers = 0;
    let hiddenByFilters = 0;
    let offset = initialOffset;
    let exhausted = false;

    /*
     * Os filtros de prefixo do celular antigo são aplicados depois da leitura
     * porque phone_digits guarda DDI + DDD + número. O chunk maior evita que
     * um filtro 6/7/8/9 retorne poucos resultados mesmo existindo mais na base.
     */
    const chunkSize = 100;
    const maxChunks = 12;

    for (
      let loop = 0;
      loop < maxChunks &&
      results.length < pageSize;
      loop += 1
    ) {
      const rows =
        await prisma.cnpjProspectingCompany.findMany({
          where: {
            uf: "SP",
            status_code: "02",
            segment_tags: {
              has: tag,
            },
            city_search: citySearch,
            ...(regionSearch
              ? {
                  neighborhood_search: {
                    contains: regionSearch,
                  },
                }
              : {}),
            ...(hasEmail
              ? {
                  email: {
                    not: null,
                  },
                }
              : {}),
            ...(hasTradeName
              ? {
                  trade_name: {
                    not: null,
                  },
                }
              : {}),
            ...(cnaeMain
              ? {
                  cnae_main: cnaeMain,
                }
              : {}),
          },
          orderBy: [
            {
              trade_name: "asc",
            },
            {
              cnpj: "asc",
            },
          ],
          skip: offset,
          take: chunkSize,
          select: {
            cnpj: true,
            trade_name: true,
            legal_name: true,
            cnae_main: true,
            cnae_description: true,
            segment_tags: true,
            start_date: true,
            city: true,
            uf: true,
            neighborhood: true,
            street_type: true,
            street: true,
            number: true,
            complement: true,
            postal_code: true,
            phone: true,
            phone_digits: true,
            email: true,
            source_month: true,
          },
        });

      if (!rows.length) {
        exhausted = true;
        break;
      }

      /*
       * Primeiro aplica filtros baratos em memória. Depois consulta reservas
       * e clientes somente para as linhas que realmente podem entrar.
       */
      const filteredRows = rows.filter((row) => {
        const phoneInfo = analyzeBrazilianPhone(
          row.phone_digits || row.phone
        );

        const phoneOk = matchesPhoneFilter(
          phoneInfo.type,
          row.phone_digits || row.phone,
          phoneFilter
        );

        const ageOk = matchesCompanyAge(
          row.start_date,
          companyAge
        );

        if (!phoneOk || !ageOk) {
          hiddenByFilters += 1;
          return false;
        }

        return true;
      });

      const unavailable = await filterUnavailable({
        companyId: access.companyId,
        rows: filteredRows,
      });

      for (const row of filteredRows) {
        if (unavailable.reservedCnpjs.has(row.cnpj)) {
          hiddenReserved += 1;
          continue;
        }

        const candidatePhone = digits(
          row.phone_digits
        );

        if (
          unavailable.customerCnpjs.has(
            row.cnpj.toUpperCase()
          ) ||
          unavailable.customerPhones.has(
            candidatePhone
          ) ||
          unavailable.customerPhones.has(
            candidatePhone.startsWith("55")
              ? candidatePhone.slice(2)
              : `55${candidatePhone}`
          )
        ) {
          hiddenCustomers += 1;
          continue;
        }

        const phoneInfo = analyzeBrazilianPhone(
          row.phone_digits || row.phone
        );

        const score = buildLeadScore({
          phoneType: phoneInfo.type,
          email: row.email,
          tradeName: row.trade_name,
          neighborhood: row.neighborhood,
          startDate: row.start_date,
        });

        const whatsappOperational =
          phoneInfo.type === "mobile_candidate"
            ? phoneInfo.whatsappSuggested
            : phoneInfo.whatsapp;

        results.push({
          id: row.cnpj,
          source: "receita_cnpj",
          cnpj: row.cnpj,
          name:
            row.trade_name ||
            row.legal_name ||
            `CNPJ ${row.cnpj}`,
          address: formatAddress(row),
          primaryType:
            row.cnae_description ||
            row.segment_tags[0] ||
            segment,
          segmentTags: row.segment_tags,
          phone: row.phone,
          phoneDigits: row.phone_digits,
          phoneType: phoneInfo.type,
          whatsapp: phoneInfo.whatsapp,
          whatsappOperational,
          whatsappSuggested:
            phoneInfo.whatsappSuggested,
          whatsappSuggestedDisplay:
            phoneInfo.whatsappSuggested
              ? formatPhoneForDisplay(
                  phoneInfo.whatsappSuggested
                )
              : null,
          whatsappNeedsConfirmation:
            phoneInfo.type ===
            "mobile_candidate",
          whatsappNeedsValidation:
            phoneInfo.type ===
            "mobile_candidate",
          email: row.email,
          leadScore: score.score,
          scoreReasons: score.reasons,
          city: row.city,
          neighborhood: row.neighborhood,
          cnae: row.cnae_main,
          startDate: row.start_date,
          sourceMonth: row.source_month,
          mapsUri: null,
          latitude: null,
          longitude: null,
        });

        if (results.length >= pageSize) {
          break;
        }
      }

      offset += rows.length;

      if (rows.length < chunkSize) {
        exhausted = true;
        break;
      }
    }

    await prisma.externalProspectSearch.create({
      data: {
        company_id: access.companyId,
        seller_id: access.userId!,
        segment,
        city,
        region: region || null,
        query_text: queryText,
        source: "receita_cnpj",
        result_count:
          results.length +
          hiddenReserved +
          hiddenCustomers +
          hiddenByFilters,
        available_count: results.length,
      },
    });

    return NextResponse.json({
      success: true,
      query: queryText,
      results,
      hiddenReserved,
      hiddenCustomers,
      hiddenByFilters,
      filtersApplied: {
        phoneFilter,
        hasEmail,
        hasTradeName,
        cnaeMain: cnaeMain || null,
        companyAge,
      },
      nextPageToken:
        !exhausted &&
        results.length >= pageSize
          ? String(offset)
          : null,
      attribution:
        "Base CNPJ Zentra / Dados Abertos da Receita Federal",
    });
  } catch (error: any) {
    console.error(
      "[prospecting/search][cnpj]",
      error
    );

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Não foi possível buscar empresas na base CNPJ agora.",
      },
      { status: 500 }
    );
  }
}
