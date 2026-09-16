import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/server-company";
import { sendWebPush } from "@/lib/push";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_RESULTS = 2500;
const MAX_LIST_MEMBERS = 5000;
const SEND_CONCURRENCY = 10;

type Access = Awaited<ReturnType<typeof requireCompanyAccess>>;

function clean(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function uniqueIds(value: unknown) {
  if (!Array.isArray(value)) return [];

  return [
    ...new Set(
      value
        .map((item) => clean(item, 80))
        .filter(Boolean)
    ),
  ].slice(0, MAX_LIST_MEMBERS);
}

function sellerId(access: Access) {
  const id = clean(access.userId, 80);

  if (!id) {
    throw new Error("SELLER_NOT_FOUND");
  }

  return id;
}

function portalUrl(origin: string, token: string) {
  const url = new URL(`/ofertas/${encodeURIComponent(token)}`, origin);
  url.searchParams.set("chat", "open");
  url.searchParams.set("src", "broadcast");
  return url.toString();
}

function customerName(customer: {
  trade_name: string | null;
  legal_name: string;
}) {
  return customer.trade_name || customer.legal_name || "Cliente";
}

function customerPhone(customer: {
  whatsapp: string | null;
  phone: string | null;
}) {
  return customer.whatsapp || customer.phone || null;
}

function sortedUnique(values: Array<string | null | undefined>) {
  return [...new Set(values.map((item) => clean(item, 120)).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
}

async function bootstrap(access: Access) {
  const sid = sellerId(access);

  const [lists, values] = await Promise.all([
    prisma.promotionAudienceList.findMany({
      where: {
        company_id: access.companyId,
        seller_id: sid,
        status: "active",
      },
      orderBy: {
        updated_at: "desc",
      },
      take: 100,
      select: {
        id: true,
        name: true,
        description: true,
        created_at: true,
        updated_at: true,
        members: {
          select: {
            customer_id: true,
          },
        },
      },
    }),
    prisma.salesCustomer.findMany({
      where: {
        company_id: access.companyId,
        seller_id: sid,
      },
      take: 5000,
      select: {
        city: true,
        segment: true,
        category: true,
        status: true,
        price_table: true,
      },
    }),
  ]);

  return {
    lists: lists.map((list) => ({
      id: list.id,
      name: list.name,
      description: list.description,
      created_at: list.created_at,
      updated_at: list.updated_at,
      member_count: list.members.length,
      customer_ids: list.members.map((item) => item.customer_id),
    })),
    filters: {
      cities: sortedUnique(values.map((item) => item.city)),
      segments: sortedUnique(values.map((item) => item.segment)),
      categories: sortedUnique(values.map((item) => item.category)),
      statuses: sortedUnique(values.map((item) => item.status)),
      price_tables: [
        ...new Set(
          values
            .map((item) => item.price_table)
            .filter((item): item is number => Number.isInteger(item))
        ),
      ].sort((a, b) => a - b),
    },
  };
}

async function listCustomers(req: NextRequest, access: Access) {
  const sid = sellerId(access);
  const params = new URL(req.url).searchParams;

  const q = clean(params.get("q"), 160);
  const push = clean(params.get("push"), 20);
  const portal = clean(params.get("portal"), 20);
  const status = clean(params.get("status"), 50);
  const city = clean(params.get("city"), 120);
  const segment = clean(params.get("segment"), 120);
  const category = clean(params.get("category"), 120);
  const priceTableRaw = clean(params.get("priceTable"), 10);
  const priceTable =
    priceTableRaw !== "" && Number.isInteger(Number(priceTableRaw))
      ? Number(priceTableRaw)
      : null;

  const and: Prisma.SalesCustomerWhereInput[] = [];

  if (q) {
    and.push({
      OR: [
        { trade_name: { contains: q, mode: "insensitive" } },
        { legal_name: { contains: q, mode: "insensitive" } },
        { internal_code: { contains: q, mode: "insensitive" } },
        { erp_code: { contains: q, mode: "insensitive" } },
        { document: { contains: q, mode: "insensitive" } },
        { buyer_name: { contains: q, mode: "insensitive" } },
        { city: { contains: q, mode: "insensitive" } },
        { segment: { contains: q, mode: "insensitive" } },
        { category: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  if (push === "active") {
    and.push({
      pushSubscriptions: {
        some: {
          active: true,
          permission: "granted",
        },
      },
    });
  } else if (push === "inactive") {
    and.push({
      pushSubscriptions: {
        none: {
          active: true,
          permission: "granted",
        },
      },
    });
  }

  if (portal === "active") {
    and.push({
      webPromotionAccess: {
        is: {
          active: true,
          token_value: {
            not: null,
          },
        },
      },
    });
  } else if (portal === "inactive") {
    and.push({
      OR: [
        {
          webPromotionAccess: {
            is: null,
          },
        },
        {
          webPromotionAccess: {
            is: {
              active: false,
            },
          },
        },
        {
          webPromotionAccess: {
            is: {
              token_value: null,
            },
          },
        },
      ],
    });
  }

  if (status) and.push({ status });
  if (city) and.push({ city });
  if (segment) and.push({ segment });
  if (category) and.push({ category });
  if (priceTable !== null) and.push({ price_table: priceTable });

  const where: Prisma.SalesCustomerWhereInput = {
    company_id: access.companyId,
    seller_id: sid,
    ...(and.length ? { AND: and } : {}),
  };

  const customers = await prisma.salesCustomer.findMany({
    where,
    orderBy: [
      {
        trade_name: "asc",
      },
      {
        legal_name: "asc",
      },
    ],
    take: MAX_RESULTS,
    select: {
      id: true,
      internal_code: true,
      erp_code: true,
      legal_name: true,
      trade_name: true,
      buyer_name: true,
      city: true,
      state: true,
      segment: true,
      category: true,
      status: true,
      price_table: true,
      whatsapp: true,
      phone: true,
      webPromotionAccess: {
        select: {
          active: true,
          token_value: true,
          push_permission: true,
          last_access_at: true,
        },
      },
      pushSubscriptions: {
        where: {
          active: true,
          permission: "granted",
        },
        take: 1,
        select: {
          id: true,
        },
      },
    },
  });

  return customers.map((customer) => ({
    id: customer.id,
    internal_code: customer.internal_code,
    erp_code: customer.erp_code,
    name: customerName(customer),
    legal_name: customer.legal_name,
    buyer_name: customer.buyer_name,
    city: customer.city,
    state: customer.state,
    segment: customer.segment,
    category: customer.category,
    status: customer.status,
    price_table: customer.price_table,
    phone: customerPhone(customer),
    portal_active: Boolean(
      customer.webPromotionAccess?.active &&
        customer.webPromotionAccess?.token_value
    ),
    portal_accessed: Boolean(
      customer.webPromotionAccess?.last_access_at
    ),
    push_active: customer.pushSubscriptions.length > 0,
    push_permission:
      customer.webPromotionAccess?.push_permission || "not_requested",
  }));
}

async function accessibleCustomerIds(
  access: Access,
  ids: string[]
) {
  if (!ids.length) return [];

  const sid = sellerId(access);

  const customers = await prisma.salesCustomer.findMany({
    where: {
      company_id: access.companyId,
      seller_id: sid,
      id: {
        in: ids,
      },
    },
    select: {
      id: true,
    },
  });

  return customers.map((item) => item.id);
}

async function createList(
  body: any,
  access: Access
) {
  const sid = sellerId(access);
  const name = clean(body?.name, 120);
  const description = clean(body?.description, 500) || null;
  const requestedIds = uniqueIds(body?.customerIds);

  if (!name) {
    return NextResponse.json(
      { success: false, error: "Informe o nome da lista." },
      { status: 400 }
    );
  }

  if (!requestedIds.length) {
    return NextResponse.json(
      { success: false, error: "Selecione pelo menos um cliente." },
      { status: 400 }
    );
  }

  const ids = await accessibleCustomerIds(access, requestedIds);

  if (!ids.length) {
    return NextResponse.json(
      { success: false, error: "Nenhum cliente da sua carteira foi selecionado." },
      { status: 400 }
    );
  }

  const list = await prisma.$transaction(async (tx) => {
    const created = await tx.promotionAudienceList.create({
      data: {
        company_id: access.companyId,
        seller_id: sid,
        name,
        description:
          description ||
          "Lista de transmissão do Chat/Push Zentra",
        status: "active",
      },
      select: {
        id: true,
        name: true,
        description: true,
      },
    });

    await tx.promotionAudienceMember.createMany({
      data: ids.map((customerId) => ({
        company_id: access.companyId,
        audience_list_id: created.id,
        customer_id: customerId,
        added_by: sid,
      })),
      skipDuplicates: true,
    });

    return created;
  });

  return NextResponse.json({
    success: true,
    list: {
      ...list,
      member_count: ids.length,
      customer_ids: ids,
    },
  });
}

async function replaceList(
  body: any,
  access: Access
) {
  const sid = sellerId(access);
  const listId = clean(body?.listId, 80);
  const requestedIds = uniqueIds(body?.customerIds);

  const list = await prisma.promotionAudienceList.findFirst({
    where: {
      id: listId,
      company_id: access.companyId,
      seller_id: sid,
      status: "active",
    },
    select: {
      id: true,
    },
  });

  if (!list) {
    return NextResponse.json(
      { success: false, error: "Lista não encontrada." },
      { status: 404 }
    );
  }

  const ids = await accessibleCustomerIds(access, requestedIds);

  await prisma.$transaction([
    prisma.promotionAudienceMember.deleteMany({
      where: {
        company_id: access.companyId,
        audience_list_id: list.id,
      },
    }),
    prisma.promotionAudienceMember.createMany({
      data: ids.map((customerId) => ({
        company_id: access.companyId,
        audience_list_id: list.id,
        customer_id: customerId,
        added_by: sid,
      })),
      skipDuplicates: true,
    }),
    prisma.promotionAudienceList.update({
      where: {
        id: list.id,
      },
      data: {
        updated_at: new Date(),
      },
    }),
  ]);

  return NextResponse.json({
    success: true,
    member_count: ids.length,
    customer_ids: ids,
  });
}

async function sendOne(
  customer: {
    id: string;
    legal_name: string;
    trade_name: string | null;
    phone: string | null;
    whatsapp: string | null;
    webPromotionAccess: {
      active: boolean;
      token_value: string | null;
    } | null;
    pushSubscriptions: Array<{
      id: string;
      endpoint: string;
      p256dh: string;
      auth_key: string;
    }>;
  },
  access: Access,
  sid: string,
  message: string,
  origin: string
) {
  const portal = customer.webPromotionAccess;

  if (!portal?.active || !portal.token_value) {
    return {
      messageDelivered: 0,
      pushSent: 0,
      noPush: 0,
      noPortal: 1,
      pushFailed: 0,
    };
  }

  const now = new Date();
  const name = customerName(customer);
  const phone = customerPhone(customer);

  const conversation = await prisma.portalConversation.upsert({
    where: {
      customer_id: customer.id,
    },
    update: {
      company_id: access.companyId,
      seller_id: sid,
      customer_name: name,
      customer_phone: phone,
      last_message: message.slice(0, 500),
      last_message_at: now,
      last_sender_type: "seller",
      customer_unread: {
        increment: 1,
      },
      updated_at: now,
    },
    create: {
      company_id: access.companyId,
      seller_id: sid,
      customer_id: customer.id,
      customer_name: name,
      customer_phone: phone,
      last_message: message.slice(0, 500),
      last_message_at: now,
      last_sender_type: "seller",
      customer_unread: 1,
    },
  });

  await prisma.portalMessage.create({
    data: {
      conversation_id: conversation.id,
      company_id: access.companyId,
      seller_id: sid,
      customer_id: customer.id,
      sender_type: "seller",
      message_type: "text",
      content: message,
    },
  });

  if (!customer.pushSubscriptions.length) {
    return {
      messageDelivered: 1,
      pushSent: 0,
      noPush: 1,
      noPortal: 0,
      pushFailed: 0,
    };
  }

  let pushSent = 0;
  let pushFailed = 0;

  for (const subscription of customer.pushSubscriptions) {
    try {
      await sendWebPush(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth_key,
          },
        },
        {
          title: "PMG Atacadista · Nova mensagem",
          body:
            message.length > 110
              ? `${message.slice(0, 107)}...`
              : message,
          url: portalUrl(origin, portal.token_value),
          icon: "/logo-pmg.png",
          badge: "/logo-pmg.png",
          tag: `portal-broadcast-${customer.id}`,
        }
      );

      pushSent += 1;
    } catch (error: any) {
      pushFailed += 1;

      if ([404, 410].includes(Number(error?.statusCode))) {
        await prisma.pushSubscription
          .update({
            where: {
              id: subscription.id,
            },
            data: {
              active: false,
              permission: "denied",
              revoked_at: new Date(),
              permission_updated_at: new Date(),
            },
          })
          .catch(() => null);
      }
    }
  }

  return {
    messageDelivered: 1,
    pushSent,
    noPush: 0,
    noPortal: 0,
    pushFailed,
  };
}

async function sendBroadcast(
  req: NextRequest,
  body: any,
  access: Access
) {
  const sid = sellerId(access);
  const message = clean(body?.message, 10000);
  const listId = clean(body?.listId, 80);
  let ids = uniqueIds(body?.customerIds);

  if (!message) {
    return NextResponse.json(
      { success: false, error: "Digite a mensagem da transmissão." },
      { status: 400 }
    );
  }

  if (listId) {
    const list = await prisma.promotionAudienceList.findFirst({
      where: {
        id: listId,
        company_id: access.companyId,
        seller_id: sid,
        status: "active",
      },
      select: {
        members: {
          select: {
            customer_id: true,
          },
        },
      },
    });

    if (!list) {
      return NextResponse.json(
        { success: false, error: "Lista de transmissão não encontrada." },
        { status: 404 }
      );
    }

    ids = list.members.map((item) => item.customer_id);
  }

  if (!ids.length) {
    return NextResponse.json(
      { success: false, error: "Nenhum cliente selecionado." },
      { status: 400 }
    );
  }

  const customers = await prisma.salesCustomer.findMany({
    where: {
      company_id: access.companyId,
      seller_id: sid,
      id: {
        in: ids,
      },
    },
    select: {
      id: true,
      legal_name: true,
      trade_name: true,
      phone: true,
      whatsapp: true,
      webPromotionAccess: {
        select: {
          active: true,
          token_value: true,
        },
      },
      pushSubscriptions: {
        where: {
          active: true,
          permission: "granted",
        },
        select: {
          id: true,
          endpoint: true,
          p256dh: true,
          auth_key: true,
        },
      },
    },
  });

  const result = {
    selected: ids.length,
    eligible: customers.length,
    message_delivered: 0,
    push_sent: 0,
    without_push: 0,
    without_portal: 0,
    push_failed: 0,
    failed: 0,
  };

  const origin = new URL(req.url).origin;

  for (let index = 0; index < customers.length; index += SEND_CONCURRENCY) {
    const batch = customers.slice(index, index + SEND_CONCURRENCY);

    const settled = await Promise.allSettled(
      batch.map((customer) =>
        sendOne(customer, access, sid, message, origin)
      )
    );

    for (const item of settled) {
      if (item.status === "rejected") {
        result.failed += 1;
        console.error("PORTAL BROADCAST CUSTOMER:", item.reason);
        continue;
      }

      result.message_delivered += item.value.messageDelivered;
      result.push_sent += item.value.pushSent;
      result.without_push += item.value.noPush;
      result.without_portal += item.value.noPortal;
      result.push_failed += item.value.pushFailed;
    }
  }

  return NextResponse.json({
    success: true,
    result,
  });
}

export async function GET(req: NextRequest) {
  try {
    const access = await requireCompanyAccess(req);
    const mode = clean(new URL(req.url).searchParams.get("mode"), 30);

    if (mode === "bootstrap") {
      return NextResponse.json({
        success: true,
        ...(await bootstrap(access)),
      });
    }

    return NextResponse.json({
      success: true,
      customers: await listCustomers(req, access),
    });
  } catch (error: any) {
    console.error("GET /api/crm/portal-chat/broadcasts:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message === "SELLER_NOT_FOUND"
            ? "Vendedor não identificado."
            : error?.message || "Erro ao carregar transmissões.",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const access = await requireCompanyAccess(req);
    const body = await req.json().catch(() => ({}));
    const action = clean(body?.action, 40);

    if (action === "create_list") {
      return createList(body, access);
    }

    if (action === "replace_list") {
      return replaceList(body, access);
    }

    if (action === "send") {
      return sendBroadcast(req, body, access);
    }

    return NextResponse.json(
      { success: false, error: "Ação inválida." },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("POST /api/crm/portal-chat/broadcasts:", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Erro na transmissão.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const access = await requireCompanyAccess(req);
    const sid = sellerId(access);
    const listId = clean(
      new URL(req.url).searchParams.get("listId"),
      80
    );

    const list = await prisma.promotionAudienceList.findFirst({
      where: {
        id: listId,
        company_id: access.companyId,
        seller_id: sid,
      },
      select: {
        id: true,
      },
    });

    if (!list) {
      return NextResponse.json(
        { success: false, error: "Lista não encontrada." },
        { status: 404 }
      );
    }

    await prisma.promotionAudienceList.delete({
      where: {
        id: list.id,
      },
    });

    return NextResponse.json({
      success: true,
    });
  } catch (error: any) {
    console.error("DELETE /api/crm/portal-chat/broadcasts:", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Erro ao excluir lista.",
      },
      { status: 500 }
    );
  }
}
