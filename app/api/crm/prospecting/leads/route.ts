import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/server-company";
import {
  enrichGooglePlaces,
  makeWhatsAppLink,
} from "@/lib/prospecting/google-places";
import { analyzeBrazilianPhone } from "@/lib/prospecting/phone";

export const dynamic = "force-dynamic";

const MANAGEMENT_ROLES = new Set([
  "GERAL",
  "MASTER",
  "ADMIN",
  "OWNER",
  "SUPERVISOR",
]);

const ALLOWED_STATUS = new Set([
  "novo",
  "contato_realizado",
  "interessado",
  "cotacao",
  "negociacao",
  "convertido",
  "sem_resposta",
  "retornar_depois",
  "sem_interesse",
  "descartado",
]);

const ALLOWED_PRIORITY = new Set([
  "baixa",
  "media",
  "alta",
]);

function clean(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function normalizeRole(role?: string | null) {
  return String(role || "").trim().toUpperCase();
}

function parseDate(value: unknown) {
  const raw = clean(value, 80);
  if (!raw) return null;

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildLeadWhere(access: Awaited<ReturnType<typeof requireCompanyAccess>>) {
  const role = normalizeRole(access.userRole);

  return {
    company_id: access.companyId,
    ...(MANAGEMENT_ROLES.has(role)
      ? {}
      : { seller_id: access.userId! }),
  };
}

export async function GET(req: NextRequest) {
  try {
    const access = await requireCompanyAccess(req);
    const url = new URL(req.url);
    const status = clean(url.searchParams.get("status"), 40);
    const q = clean(url.searchParams.get("q"), 120).toLowerCase();

    const baseWhere = buildLeadWhere(access);

    const where = {
      ...baseWhere,
      ...(status && ALLOWED_STATUS.has(status)
        ? { status }
        : {}),
    };

    const [rows, statusGroups] = await Promise.all([
      prisma.externalProspectLead.findMany({
        where,
        include: {
          prospect_company: {
            select: {
              source: true,
              source_external_id: true,
              google_place_id: true,
              segment_hint: true,
              city_hint: true,
              region_hint: true,
              created_at: true,
            },
          },
        },
        orderBy: [
          { priority: "desc" },
          { updated_at: "desc" },
        ],
        take: 80,
      }),
      prisma.externalProspectLead.groupBy({
        by: ["status"],
        where: baseWhere,
        _count: {
          _all: true,
        },
      }),
    ]);

    const googlePlaceIds = rows
      .filter(
        (row) =>
          row.prospect_company.source === "google_places" &&
          Boolean(row.prospect_company.google_place_id)
      )
      .map((row) => row.prospect_company.google_place_id!)
      .filter(Boolean);

    let googlePlaces = new Map<string, any>();

    if (
      googlePlaceIds.length &&
      process.env.GOOGLE_PLACES_API_KEY
    ) {
      try {
        googlePlaces = await enrichGooglePlaces(
          googlePlaceIds,
          3
        );
      } catch (error) {
        console.warn(
          "[prospecting/leads] Google indisponível; usando dados já salvos.",
          error
        );
      }
    }

    const merged = rows.map((row) => {
      const placeId =
        row.prospect_company.google_place_id || null;

      const place = placeId
        ? googlePlaces.get(placeId) || null
        : null;

      const phone =
        row.phone ||
        place?.phone ||
        place?.internationalPhone ||
        null;

      const phoneInfo = analyzeBrazilianPhone(phone);

      // Mantém whatsapp como valor confirmado/salvo quando existir.
      // Para celular antigo provável, o +9 automático fica separado em
      // whatsappOperational, sem sobrescrever o telefone original.
      const whatsapp =
        row.whatsapp ||
        phoneInfo.whatsapp ||
        null;

      const whatsappOperational =
        row.whatsapp ||
        phoneInfo.operationalWhatsapp ||
        phoneInfo.whatsapp ||
        null;

      const fallbackId =
        row.prospect_company.source_external_id ||
        placeId ||
        row.id;

      return {
        id: row.id,
        seller_id: row.seller_id,
        status: row.status,
        priority: row.priority,
        company_name:
          row.company_name ||
          place?.name ||
          `Prospect ${fallbackId.slice(0, 14)}`,
        owner_name: row.owner_name,
        buyer_name: row.buyer_name,
        phone,
        phoneType: phoneInfo.type,
        whatsapp,
        whatsappOperational,
        whatsappSuggested:
          phoneInfo.type === "mobile_candidate"
            ? phoneInfo.whatsappSuggested
            : null,
        whatsappNeedsConfirmation: false,
        whatsappNeedsValidation:
          phoneInfo.type === "mobile_candidate" &&
          !row.whatsapp,
        whatsapp_link: makeWhatsAppLink(whatsappOperational),
        email: row.email,
        cnpj: row.cnpj,
        site: row.site || place?.website || null,
        address: row.address || place?.address || null,
        notes: row.notes,
        next_action_at: row.next_action_at,
        last_contact_at: row.last_contact_at,
        claimed_at: row.claimed_at,
        converted_at: row.converted_at,
        converted_customer_id: row.converted_customer_id,
        created_at: row.created_at,
        updated_at: row.updated_at,
        source: row.prospect_company.source,
        source_external_id:
          row.prospect_company.source_external_id,
        segment:
          row.prospect_company.segment_hint ||
          place?.primaryType ||
          null,
        city: row.prospect_company.city_hint,
        region: row.prospect_company.region_hint,
        google_place_id: placeId,
        google_maps: place?.mapsUri || null,
        google_business_status:
          place?.businessStatus || null,
        google_live: Boolean(place),
      };
    });

    const filtered = q
      ? merged.filter((item) => {
          const haystack = [
            item.company_name,
            item.owner_name,
            item.buyer_name,
            item.phone,
            item.whatsapp,
            item.cnpj,
            item.city,
            item.region,
            item.segment,
            item.notes,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          return haystack.includes(q);
        })
      : merged;

    const stats = Object.fromEntries(
      statusGroups.map((group) => [
        group.status,
        group._count._all,
      ])
    );

    return NextResponse.json({
      success: true,
      leads: filtered,
      stats,
      total: statusGroups.reduce(
        (sum, group) => sum + group._count._all,
        0
      ),
      scope:
        MANAGEMENT_ROLES.has(normalizeRole(access.userRole))
          ? "management"
          : "seller",
      attribution: "Base CNPJ Zentra",
    });
  } catch (error: any) {
    console.error("[prospecting/leads][GET]", error);

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Não foi possível carregar a prospecção.",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const access = await requireCompanyAccess(req);
    const body = await req.json().catch(() => ({}));
    const id = clean(body?.id, 80);

    if (!id) {
      return NextResponse.json(
        { error: "Prospect não informado." },
        { status: 400 }
      );
    }

    const role = normalizeRole(access.userRole);
    const canManageAll = MANAGEMENT_ROLES.has(role);

    const existing = await prisma.externalProspectLead.findFirst({
      where: {
        id,
        company_id: access.companyId,
        ...(canManageAll
          ? {}
          : { seller_id: access.userId! }),
      },
      select: {
        id: true,
        status: true,
        seller_id: true,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Prospect não encontrado ou sem acesso." },
        { status: 404 }
      );
    }

    const data: any = {};
    const changedFields: string[] = [];

    if (body?.status !== undefined) {
      const status = clean(body.status, 40).toLowerCase();

      if (!ALLOWED_STATUS.has(status)) {
        return NextResponse.json(
          { error: "Status comercial inválido." },
          { status: 400 }
        );
      }

      data.status = status;
      changedFields.push("status");

      if (
        ["contato_realizado", "interessado", "cotacao", "negociacao"].includes(
          status
        ) &&
        existing.status === "novo"
      ) {
        data.last_contact_at = new Date();
      }

      if (status === "convertido") {
        data.converted_at = new Date();
      }
    }

    if (body?.priority !== undefined) {
      const priority = clean(body.priority, 20).toLowerCase();

      if (!ALLOWED_PRIORITY.has(priority)) {
        return NextResponse.json(
          { error: "Prioridade inválida." },
          { status: 400 }
        );
      }

      data.priority = priority;
      changedFields.push("priority");
    }

    const textFields: Array<[string, number]> = [
      ["company_name", 160],
      ["owner_name", 120],
      ["buyer_name", 120],
      ["phone", 40],
      ["whatsapp", 40],
      ["email", 160],
      ["cnpj", 30],
      ["site", 500],
      ["address", 500],
      ["notes", 4000],
      ["converted_customer_id", 80],
    ];

    for (const [field, max] of textFields) {
      if (body?.[field] !== undefined) {
        const value = clean(body[field], max);
        data[field] = value || null;
        changedFields.push(field);
      }
    }

    if (body?.next_action_at !== undefined) {
      data.next_action_at = parseDate(body.next_action_at);
      changedFields.push("next_action_at");
    }

    if (body?.mark_contact_now === true) {
      data.last_contact_at = new Date();
      changedFields.push("last_contact_at");
    }

    if (!changedFields.length) {
      return NextResponse.json(
        { error: "Nenhuma alteração informada." },
        { status: 400 }
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.externalProspectLead.update({
        where: { id: existing.id },
        data,
      });

      await tx.externalProspectActivity.create({
        data: {
          company_id: access.companyId,
          lead_id: existing.id,
          seller_id: access.userId,
          action:
            changedFields.length === 1 &&
            changedFields[0] === "status"
              ? "status_updated"
              : "lead_updated",
          metadata: {
            fields: changedFields,
            status_before: existing.status,
            status_after:
              typeof data.status === "string"
                ? data.status
                : existing.status,
          },
        },
      });

      return row;
    });

    return NextResponse.json({
      success: true,
      lead: updated,
    });
  } catch (error: any) {
    console.error("[prospecting/leads][PATCH]", error);

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Não foi possível atualizar o prospect.",
      },
      { status: 500 }
    );
  }
}
