import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/server-company";


export const dynamic = "force-dynamic";

const MAX_MANUAL_CONTACTS = 300;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalizePhone(value: unknown) {
  let valueDigits = clean(value).replace(/\D/g, "");

  if (valueDigits.startsWith("55") && valueDigits.length >= 12) {
    valueDigits = valueDigits.slice(2);
  }

  if (valueDigits.length !== 10 && valueDigits.length !== 11) {
    return "";
  }

  return valueDigits;
}

function normalizeManualContacts(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seenPhones = new Set<string>();
  const contacts: Array<{
    name: string;
    phone: string;
  }> = [];

  for (const item of value) {
    const name = clean(item?.name);
    const phone = normalizePhone(item?.phone);

    if (!name || !phone || seenPhones.has(phone)) {
      continue;
    }

    seenPhones.add(phone);
    contacts.push({
      name: name.slice(0, 180),
      phone,
    });

    if (contacts.length >= MAX_MANUAL_CONTACTS) {
      break;
    }
  }

  return contacts;
}

export async function GET(req: NextRequest) {
  try {
    const access = await requireCompanyAccess(req);
    const { companyId, userId } = access;

    if (!companyId || !userId) {
      return NextResponse.json(
        { success: false, error: "Empresa ou usuário não identificado." },
        { status: 401 }
      );
    }

    const campaigns = await prisma.dialerCampaign.findMany({
      where: {
        company_id: companyId,
        user_id: userId,
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        name: true,
        status: true,
        total: true,
        processed: true,
        answered: true,
        sales: true,
        createdAt: true,
        startedAt: true,
        finishedAt: true,
      },
      take: 100,
    });

    return NextResponse.json({
      success: true,
      campaigns,
    });
  } catch (error: any) {
    console.error("[DIALER_CAMPAIGNS_GET_ERROR]", error);

    return NextResponse.json(
      { success: false, error: error?.message || "Erro ao listar campanhas." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const access = await requireCompanyAccess(req);
    const { companyId, branchId, userId } = access;
    const role = String(access.userRole || "").toUpperCase();

    // Mantém o mesmo comportamento de acesso do Radar reveal-v2.
    if (role === "SUPERVISOR") {
      return NextResponse.json(
        { success: false, error: "Acesso negado." },
        { status: 403 }
      );
    }

    if (!companyId || !userId) {
      return NextResponse.json(
        { success: false, error: "Empresa ou usuário não identificado." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const name = String(body?.name || "").trim();
    const manualContacts = normalizeManualContacts(body?.manualContacts);

    const prospectIds: string[] = Array.isArray(body?.prospectIds)
      ? Array.from(
          new Set(
            body.prospectIds
              .map((id: unknown) => String(id).trim())
              .filter(Boolean)
          )
        )
      : [];

    if (!name) {
      return NextResponse.json(
        { success: false, error: "Informe o nome da campanha." },
        { status: 400 }
      );
    }

    const isManualCampaign = manualContacts.length > 0;

    if (!isManualCampaign && !prospectIds.length) {
      return NextResponse.json(
        { success: false, error: "Nenhum contato selecionado." },
        { status: 400 }
      );
    }

    if (Array.isArray(body?.manualContacts) && body.manualContacts.length > MAX_MANUAL_CONTACTS) {
      return NextResponse.json(
        {
          success: false,
          error: `A campanha manual aceita até ${MAX_MANUAL_CONTACTS} contatos por vez.`,
        },
        { status: 400 }
      );
    }

    // Segurança adicional do fluxo RADAR:
    // o contato precisa ser da empresa E já ter sido revelado para este usuário.
    let validProspects: Array<{ id: string; phone1: string | null }> = [];

    if (!isManualCampaign) {
      const prospects = await prisma.prospect.findMany({
        where: {
          company_id: companyId,
          id: { in: prospectIds },
          active: true,
          exports: {
            some: {
              company_id: companyId,
              clientId: userId,
            },
          },
        },
        select: {
          id: true,
          phone1: true,
        },
      });

      validProspects = prospects.filter((item) => Boolean(item.phone1));

      if (!validProspects.length) {
        return NextResponse.json(
          {
            success: false,
            error: "Nenhum contato revelado com telefone foi encontrado para este usuário.",
          },
          { status: 400 }
        );
      }
    }

    const campaign = await prisma.$transaction(async (tx) => {
      if (isManualCampaign) {
        const created = await tx.dialerCampaign.create({
          data: {
            company_id: companyId,
            branch_id: branchId || null,
            user_id: userId,
            name,
            status: "READY",
            total: manualContacts.length,
          },
        });

        const createdProspects = await tx.prospect.createManyAndReturn({
          data: manualContacts.map((contact) => ({
            company_id: companyId,
            branch_id: branchId || null,
            name: contact.name,
            phone1: contact.phone,
            active: true,
            sourcePayload: {
              source: "DIALER_MANUAL",
              ownerUserId: userId,
              createdFrom: "DIALER_MANUAL_CAMPAIGN",
              campaignId: created.id,
              responsibleName: null,
              responsibleRole: null,
              whatsapp: null,
              manualNotes: null,
            },
          })),
          select: {
            id: true,
          },
        });

        await tx.dialerCampaignContact.createMany({
          data: createdProspects.map((prospect, index) => ({
            campaignId: created.id,
            prospectId: prospect.id,
            position: index + 1,
            status: "PENDING",
          })),
        });

        return created;
      }

      const created = await tx.dialerCampaign.create({
        data: {
          company_id: companyId,
          branch_id: branchId || null,
          user_id: userId,
          name,
          status: "READY",
          total: validProspects.length,
        },
      });

      await tx.dialerCampaignContact.createMany({
        data: validProspects.map((prospect, index) => ({
          campaignId: created.id,
          prospectId: prospect.id,
          position: index + 1,
          status: "PENDING",
        })),
      });

      return created;
    });

    return NextResponse.json({
      success: true,
      campaign: {
        id: campaign.id,
        name: campaign.name,
        total: campaign.total,
        status: campaign.status,
        source: isManualCampaign ? "MANUAL" : "RADAR",
      },
    });
  } catch (error: any) {
    console.error("[DIALER_CAMPAIGNS_POST_ERROR]", error);

    return NextResponse.json(
      { success: false, error: error?.message || "Erro ao criar campanha." },
      { status: 500 }
    );
  }
}
