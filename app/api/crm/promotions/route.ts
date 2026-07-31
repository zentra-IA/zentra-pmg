import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/server-company";
import { dispatchPromotionPush } from "@/lib/promotions/dispatch-push";

export const dynamic = "force-dynamic";

const ALLOWED_STATUS = new Set([
  "draft",
  "published",
  "scheduled",
  "expired",
  "cancelled",
]);

const ADMIN_ROLES = new Set([
  "GERAL",
  "MASTER",
  "ADMIN",
  "OWNER",
  "SUPERVISOR",
  "GESTOR",
  "MANAGER",
]);

function text(value: unknown) {
  return String(value ?? "").trim();
}

function optional(value: unknown) {
  const normalized = text(value);
  return normalized || null;
}

function dateOrNull(value: unknown) {
  const normalized = text(value);

  if (!normalized) return null;

  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Data inválida.");
  }

  return date;
}

function priceTables(value: unknown): number[] {
  if (!Array.isArray(value)) return [];

  return [
    ...new Set(
      value
        .map(Number)
        .filter(
          (item) =>
            Number.isInteger(item) &&
            item >= 0 &&
            item <= 5
        )
    ),
  ];
}

function normalizeWhatsapp(value: unknown) {
  let digits = text(value).replace(/\D/g, "").slice(0, 15);

  if (!digits) return null;

  if (
    !digits.startsWith("55") &&
    (digits.length === 10 || digits.length === 11)
  ) {
    digits = `55${digits}`;
  }

  return digits;
}

function images(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .slice(0, 10)
    .map((item: any, index) => ({
      image_url: text(item?.image_url || item?.url),
      file_name: optional(item?.file_name || item?.name),
      mime_type: optional(item?.mime_type || item?.mimeType),
      file_size: Number.isFinite(
        Number(item?.file_size || item?.size)
      )
        ? Number(item?.file_size || item?.size)
        : null,
      sort_order: index,
    }))
    .filter((item) => item.image_url);
}

function sellerFilter(
  access: Awaited<ReturnType<typeof requireCompanyAccess>>
) {
  return ADMIN_ROLES.has(
    String(access.userRole || "").toUpperCase()
  )
    ? {}
    : { seller_id: access.userId };
}

function customerSellerFilter(
  access: Awaited<ReturnType<typeof requireCompanyAccess>>
) {
  return ADMIN_ROLES.has(
    String(access.userRole || "").toUpperCase()
  )
    ? {}
    : { seller_id: access.userId };
}

function responseError(error: unknown, fallback: string) {
  const message =
    error instanceof Error ? error.message : fallback;

  const status = /não identificad|sem acesso|não autoriz/i.test(
    message
  )
    ? 401
    : 500;

  return NextResponse.json({ error: message }, { status });
}

const include = {
  targets: {
    orderBy: { price_table: "asc" as const },
  },
  images: {
    orderBy: { sort_order: "asc" as const },
  },
  deliveries: {
    orderBy: { created_at: "desc" as const },
    take: 300,
    select: {
      id: true,
      status: true,
      queued_at: true,
      sent_at: true,
      accepted_at: true,
      opened_at: true,
      viewed_at: true,
      clicked_at: true,
      error_code: true,
      error_message: true,
      customer: {
        select: {
          id: true,
          legal_name: true,
          trade_name: true,
          price_table: true,
          city: true,
          state: true,
        },
      },
    },
  },
  _count: {
    select: { deliveries: true },
  },
};

function validatePayload(
  body: any,
  requestedStatus: string,
  promotionImages: ReturnType<typeof images>,
  tables: number[]
) {
  const title = text(body?.title);
  const whatsapp = normalizeWhatsapp(body?.contact_whatsapp);

  if (!title) {
    return "Informe o título da promoção.";
  }

  if (!tables.length) {
    return "Selecione pelo menos uma tabela comercial.";
  }

  if (!ALLOWED_STATUS.has(requestedStatus)) {
    return "Status inválido.";
  }

  if (requestedStatus === "published") {
    if (!promotionImages.length) {
      return "Adicione pelo menos uma imagem antes de publicar.";
    }

    if (!text(body?.portal_text)) {
      return "Informe o texto do portal antes de publicar.";
    }

    if (!whatsapp || whatsapp.length < 12) {
      return "Informe um WhatsApp válido com DDD.";
    }

    if (!text(body?.call_to_action)) {
      return "Informe o texto do botão.";
    }
  }

  return null;
}

async function queueMissingDeliveries(
  tx: Parameters<
    Parameters<typeof prisma.$transaction>[0]
  >[0],
  options: {
    companyId: string;
    sellerId: string | null;
    promotionId: string;
    tables: number[];
    access: Awaited<ReturnType<typeof requireCompanyAccess>>;
    now: Date;
  }
) {
  const customers = await tx.salesCustomer.findMany({
    where: {
      company_id: options.companyId,
      ...customerSellerFilter(options.access),
      status: "ativo",
      price_table: { in: options.tables },
    },
    select: {
      id: true,
      seller_id: true,
    },
  });

  if (!customers.length) return;

  await tx.pushDelivery.createMany({
    data: customers.map((customer) => ({
      company_id: options.companyId,
      promotion_id: options.promotionId,
      customer_id: customer.id,
      seller_id:
        customer.seller_id || options.sellerId || null,
      status: "pending",
      queued_at: options.now,
    })),
    skipDuplicates: true,
  });
}

export async function GET(request: NextRequest) {
  try {
    const access = await requireCompanyAccess(request);
    const { searchParams } = new URL(request.url);

    const q = text(searchParams.get("q"));
    const status = text(searchParams.get("status"));

    const promotions = await prisma.webPromotion.findMany({
      where: {
        company_id: access.companyId,
        ...sellerFilter(access),
        ...(status && ALLOWED_STATUS.has(status)
          ? { status }
          : {}),
        ...(q
          ? {
              OR: [
                {
                  internal_title: {
                    contains: q,
                    mode: "insensitive",
                  },
                },
                {
                  title: {
                    contains: q,
                    mode: "insensitive",
                  },
                },
                {
                  description: {
                    contains: q,
                    mode: "insensitive",
                  },
                },
                {
                  portal_text: {
                    contains: q,
                    mode: "insensitive",
                  },
                },
              ],
            }
          : {}),
      },
      include,
      orderBy: { created_at: "desc" },
      take: 100,
    });

    return NextResponse.json({ promotions });
  } catch (error) {
    return responseError(
      error,
      "Erro ao carregar promoções."
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const access = await requireCompanyAccess(request);
    const body = await request.json();

    const title = text(body?.title);
    const tables = priceTables(body?.price_tables);
    const promotionImages = images(body?.images);
    const requestedStatus =
      text(body?.status) || "draft";

    const validationError = validatePayload(
      body,
      requestedStatus,
      promotionImages,
      tables
    );

    if (validationError) {
      return NextResponse.json(
        { error: validationError },
        { status: 400 }
      );
    }

    const now = new Date();

    const promotionId = await prisma.$transaction(
      async (tx) => {
        const created = await tx.webPromotion.create({
          data: {
            company_id: access.companyId,
            seller_id: access.userId,
            internal_title: optional(body?.internal_title),
            title,
            description: optional(body?.description),
            ai_prompt: optional(body?.ai_prompt),
            push_title: optional(body?.push_title),
            push_message: optional(body?.push_message),
            portal_text: optional(body?.portal_text),
            call_to_action:
              optional(body?.call_to_action) ||
              "Entrar em contato",
            contact_whatsapp: normalizeWhatsapp(
              body?.contact_whatsapp
            ),
            whatsapp_message: optional(
              body?.whatsapp_message
            ),
            valid_from: dateOrNull(body?.valid_from),
            valid_until: dateOrNull(body?.valid_until),
            status: requestedStatus,
            published_at:
              requestedStatus === "published"
                ? now
                : null,
            targets: {
              create: tables.map((price_table) => ({
                price_table,
              })),
            },
            images: {
              create: promotionImages,
            },
          },
          select: { id: true },
        });

        if (requestedStatus === "published") {
          await queueMissingDeliveries(tx, {
            companyId: access.companyId,
            sellerId: access.userId,
            promotionId: created.id,
            tables,
            access,
            now,
          });
        }

        return created.id;
      }
    );

    let push = null;

    if (requestedStatus === "published") {
      try {
        push = await dispatchPromotionPush({
          companyId: access.companyId,
          promotionId,
          origin: request.nextUrl.origin,
        });
      } catch (pushError) {
        console.error("[PROMOTION_AUTO_PUSH_POST]", pushError);
        push = {
          error:
            pushError instanceof Error
              ? pushError.message
              : "Falha ao disparar Push.",
        };
      }
    }

    const promotion =
      await prisma.webPromotion.findUnique({
        where: { id: promotionId },
        include,
      });

    return NextResponse.json(
      { promotion, push },
      { status: 201 }
    );
  } catch (error) {
    return responseError(error, "Erro ao criar promoção.");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const access = await requireCompanyAccess(request);
    const body = await request.json();

    const id = text(body?.id);

    if (!id) {
      return NextResponse.json(
        { error: "Promoção não identificada." },
        { status: 400 }
      );
    }

    const current =
      await prisma.webPromotion.findFirst({
        where: {
          id,
          company_id: access.companyId,
          ...sellerFilter(access),
        },
        select: {
          id: true,
          status: true,
          published_at: true,
        },
      });

    if (!current) {
      return NextResponse.json(
        { error: "Promoção não encontrada." },
        { status: 404 }
      );
    }

    const title = text(body?.title);
    const tables = priceTables(body?.price_tables);
    const promotionImages = images(body?.images);
    const requestedStatus =
      text(body?.status) || current.status;

    const validationError = validatePayload(
      body,
      requestedStatus,
      promotionImages,
      tables
    );

    if (validationError) {
      return NextResponse.json(
        { error: validationError },
        { status: 400 }
      );
    }

    const now = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.webPromotionTarget.deleteMany({
        where: { promotion_id: id },
      });

      await tx.webPromotionImage.deleteMany({
        where: { promotion_id: id },
      });

      await tx.webPromotion.update({
        where: { id },
        data: {
          internal_title: optional(body?.internal_title),
          title,
          description: optional(body?.description),
          ai_prompt: optional(body?.ai_prompt),
          push_title: optional(body?.push_title),
          push_message: optional(body?.push_message),
          portal_text: optional(body?.portal_text),
          call_to_action:
            optional(body?.call_to_action) ||
            "Entrar em contato",
          contact_whatsapp: normalizeWhatsapp(
            body?.contact_whatsapp
          ),
          whatsapp_message: optional(
            body?.whatsapp_message
          ),
          valid_from: dateOrNull(body?.valid_from),
          valid_until: dateOrNull(body?.valid_until),
          status: requestedStatus,
          published_at:
            requestedStatus === "published"
              ? current.published_at || now
              : null,
          targets: {
            create: tables.map((price_table) => ({
              price_table,
            })),
          },
          images: {
            create: promotionImages,
          },
        },
      });

      if (requestedStatus === "published") {
        await queueMissingDeliveries(tx, {
          companyId: access.companyId,
          sellerId: access.userId,
          promotionId: id,
          tables,
          access,
          now,
        });
      }
    });

    let push = null;
    const becamePublished =
      current.status !== "published" &&
      requestedStatus === "published";

    if (becamePublished) {
      try {
        push = await dispatchPromotionPush({
          companyId: access.companyId,
          promotionId: id,
          origin: request.nextUrl.origin,
        });
      } catch (pushError) {
        console.error("[PROMOTION_AUTO_PUSH_PATCH]", pushError);
        push = {
          error:
            pushError instanceof Error
              ? pushError.message
              : "Falha ao disparar Push.",
        };
      }
    }

    const promotion =
      await prisma.webPromotion.findUnique({
        where: { id },
        include,
      });

    return NextResponse.json({ promotion, push });
  } catch (error) {
    return responseError(
      error,
      "Erro ao atualizar promoção."
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const access = await requireCompanyAccess(request);
    const id = text(
      new URL(request.url).searchParams.get("id")
    );

    if (!id) {
      return NextResponse.json(
        { error: "Promoção não identificada." },
        { status: 400 }
      );
    }

    const promotion =
      await prisma.webPromotion.findFirst({
        where: {
          id,
          company_id: access.companyId,
          ...sellerFilter(access),
        },
        select: { id: true },
      });

    if (!promotion) {
      return NextResponse.json(
        { error: "Promoção não encontrada." },
        { status: 404 }
      );
    }

    // As relações da promoção usam onDelete: Cascade.
    // Portanto, imagens, alvos e entregas são removidos junto.
    await prisma.webPromotion.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return responseError(
      error,
      "Erro ao excluir promoção."
    );
  }
}
