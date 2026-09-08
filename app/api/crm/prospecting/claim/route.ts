import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/server-company";
import { analyzeBrazilianPhone } from "@/lib/prospecting/phone";

export const dynamic = "force-dynamic";

function clean(value: unknown, max = 180) {
  return String(value ?? "").trim().slice(0, max);
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

function phoneVariants(phone: string) {
  const raw = digits(phone);
  if (!raw) return [];

  const variants = new Set<string>([raw, phone]);

  if (raw.startsWith("55")) {
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

async function findExistingCustomer(input: {
  companyId: string;
  cnpj: string;
  phone: string;
}) {
  const documents = [
    ...new Set([
      input.cnpj,
      formatLegacyCnpj(input.cnpj),
    ]),
  ];

  const phones = phoneVariants(input.phone);

  return prisma.salesCustomer.findFirst({
    where: {
      company_id: input.companyId,
      OR: [
        {
          document: {
            in: documents,
          },
        },
        {
          phone: {
            in: phones,
          },
        },
        {
          whatsapp: {
            in: phones,
          },
        },
      ],
    },
    select: {
      id: true,
      legal_name: true,
      trade_name: true,
      document: true,
      seller_id: true,
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const access = await requireCompanyAccess(req);
    const body = await req.json().catch(() => ({}));

    const sourceId = clean(
      body?.sourceId || body?.placeId,
      80
    )
      .replace(/[^A-Za-z0-9]/g, "")
      .toUpperCase();

    const segment = clean(body?.segment, 80);
    const cityHint = clean(body?.city, 80);
    const regionHint = clean(body?.region, 80);

    if (!sourceId) {
      return NextResponse.json(
        { error: "CNPJ do prospect não informado." },
        { status: 400 }
      );
    }

    const sourceCompany =
      await prisma.cnpjProspectingCompany.findUnique({
        where: {
          cnpj: sourceId,
        },
      });

    if (!sourceCompany) {
      return NextResponse.json(
        {
          error:
            "Empresa não encontrada na base CNPJ. Atualize a pesquisa e tente novamente.",
        },
        { status: 404 }
      );
    }

    const phoneInfo = analyzeBrazilianPhone(
      sourceCompany.phone_digits || sourceCompany.phone
    );

    const existingCompany =
      await prisma.externalProspectCompany.findUnique({
        where: {
          company_id_source_source_external_id: {
            company_id: access.companyId,
            source: "receita_cnpj",
            source_external_id: sourceCompany.cnpj,
          },
        },
        include: {
          lead: {
            select: {
              id: true,
              seller_id: true,
              status: true,
            },
          },
        },
      });

    if (existingCompany?.lead) {
      if (existingCompany.lead.seller_id === access.userId) {
        return NextResponse.json({
          success: true,
          alreadyMine: true,
          leadId: existingCompany.lead.id,
        });
      }

      return NextResponse.json(
        {
          error:
            "Este prospect já pertence à operação de outro vendedor. Escolha outro contato.",
        },
        { status: 409 }
      );
    }

    const existingCustomer = await findExistingCustomer({
      companyId: access.companyId,
      cnpj: sourceCompany.cnpj,
      phone: sourceCompany.phone_digits,
    });

    if (existingCustomer) {
      return NextResponse.json(
        {
          error:
            "Esta empresa já existe na carteira de clientes do Zentra e não será criada como novo prospect.",
          customerId: existingCustomer.id,
        },
        { status: 409 }
      );
    }

    const address = formatAddress(sourceCompany);

    try {
      const lead = await prisma.$transaction(async (tx) => {
        const prospectCompany =
          await tx.externalProspectCompany.create({
            data: {
              company_id: access.companyId,
              source: "receita_cnpj",
              source_external_id: sourceCompany.cnpj,
              google_place_id: null,
              segment_hint:
                segment ||
                sourceCompany.segment_tags[0] ||
                null,
              city_hint: sourceCompany.city || cityHint || null,
              region_hint:
                sourceCompany.neighborhood ||
                regionHint ||
                null,
              created_by: access.userId,
            },
          });

        const createdLead =
          await tx.externalProspectLead.create({
            data: {
              company_id: access.companyId,
              prospect_company_id: prospectCompany.id,
              seller_id: access.userId!,
              status: "novo",
              priority: "media",
              company_name:
                sourceCompany.trade_name ||
                sourceCompany.legal_name ||
                `CNPJ ${sourceCompany.cnpj}`,
              phone: sourceCompany.phone,
              whatsapp: phoneInfo.whatsapp,
              email: sourceCompany.email,
              cnpj: sourceCompany.cnpj,
              address: address || null,
            },
          });

        await tx.externalProspectActivity.create({
          data: {
            company_id: access.companyId,
            lead_id: createdLead.id,
            seller_id: access.userId,
            action: "lead_claimed",
            metadata: {
              source: "receita_cnpj",
              cnpj: sourceCompany.cnpj,
              cnae: sourceCompany.cnae_main,
              phone_type: phoneInfo.type,
              whatsapp_suggested: phoneInfo.whatsappSuggested,
              source_month: sourceCompany.source_month,
              segment:
                segment ||
                sourceCompany.segment_tags[0] ||
                null,
              city: sourceCompany.city,
              region: sourceCompany.neighborhood,
            },
          },
        });

        return createdLead;
      });

      return NextResponse.json({
        success: true,
        leadId: lead.id,
        company: {
          cnpj: sourceCompany.cnpj,
          name:
            sourceCompany.trade_name ||
            sourceCompany.legal_name,
          phone: sourceCompany.phone,
          phoneType: phoneInfo.type,
          whatsapp: phoneInfo.whatsapp,
          whatsappSuggested: phoneInfo.whatsappSuggested,
          whatsappNeedsConfirmation: phoneInfo.needsConfirmation,
          email: sourceCompany.email,
          address,
          city: sourceCompany.city,
          neighborhood: sourceCompany.neighborhood,
          cnae: sourceCompany.cnae_main,
          cnaeDescription:
            sourceCompany.cnae_description,
        },
      });
    } catch (error: any) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const winner =
          await prisma.externalProspectCompany.findUnique({
            where: {
              company_id_source_source_external_id: {
                company_id: access.companyId,
                source: "receita_cnpj",
                source_external_id: sourceCompany.cnpj,
              },
            },
            include: {
              lead: {
                select: {
                  id: true,
                  seller_id: true,
                },
              },
            },
          });

        if (winner?.lead?.seller_id === access.userId) {
          return NextResponse.json({
            success: true,
            alreadyMine: true,
            leadId: winner.lead.id,
          });
        }

        return NextResponse.json(
          {
            error:
              "Este prospect acabou de ser reservado por outro vendedor. Escolha outro contato.",
          },
          { status: 409 }
        );
      }

      throw error;
    }
  } catch (error: any) {
    console.error("[prospecting/claim][cnpj]", error);

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Não foi possível assumir este prospect agora.",
      },
      { status: 500 }
    );
  }
}
