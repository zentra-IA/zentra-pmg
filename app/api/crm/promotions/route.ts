import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/server-company";
import { dispatchPromotionPush } from "@/lib/promotions/dispatch-push";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ADMIN_ROLES = new Set([
  "GERAL",
  "MASTER",
  "ADMIN",
  "OWNER",
  "SUPERVISOR",
  "GESTOR",
  "MANAGER",
]);

const ALLOWED_STATUS = new Set([
  "draft",
  "scheduled",
  "published",
  "expired",
  "cancelled",
]);

const ALLOWED_AUDIENCE_MODES = new Set([
  "table",
  "campaign",
]);

const include: Prisma.WebPromotionInclude = {
  targets: {
    orderBy: {
      price_table: "asc",
    },
  },
  images: {
    orderBy: {
      sort_order: "asc",
    },
  },
  audienceList: {
    select: {
      id: true,
      name: true,
      description: true,
      status: true,
      _count: {
        select: {
          members: true,
        },
      },
    },
  },
  deliveries: {
    orderBy: {
      created_at: "desc",
    },
    select: {
      id: true,
      customer_id: true,
      seller_id: true,
      status: true,
      queued_at: true,
      sent_at: true,
      accepted_at: true,
      opened_at: true,
      viewed_at: true,
      clicked_at: true,
      whatsapp_clicked_at: true,
      error_code: true,
      error_message: true,
      customer: {
        select: {
          id: true,
          legal_name: true,
          trade_name: true,
          whatsapp: true,
          phone: true,
        },
      },
    },
  },
};

type CompanyAccess = Awaited<
  ReturnType<typeof requireCompanyAccess>
>;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function optional(value: unknown) {
  return text(value) || null;
}

function normalizeWhatsapp(value: unknown) {
  const digits = text(value).replace(/\D/g, "");

  if (!digits) return null;
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;

  return digits;
}

function dateOrNull(value: unknown) {
  const raw = text(value);
  if (!raw) return null;

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function intOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function priceTables(value: unknown) {
  if (!Array.isArray(value)) return [];

  return [
    ...new Set(
      value
        .map((item) => Number(item))
        .filter(
          (item) =>
            Number.isInteger(item) &&
            item >= 0 &&
            item <= 5
        )
    ),
  ].sort((a, b) => a - b);
}

function images(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item, index) => {
      const source =
        item && typeof item === "object"
          ? (item as Record<string, unknown>)
          : {};

      const imageUrl = text(source.image_url);
      if (!imageUrl) return null;

      return {
        image_url: imageUrl,
        file_name: optional(source.file_name),
        mime_type: optional(source.mime_type),
        file_size: intOrNull(source.file_size),
        sort_order:
          intOrNull(source.sort_order) ?? index,
      };
    })
    .filter(
      (
        item
      ): item is {
        image_url: string;
        file_name: string | null;
        mime_type: string | null;
        file_size: number | null;
        sort_order: number;
      } => Boolean(item)
    )
    .slice(0, 10);
}

function audienceMode(value: unknown) {
  const mode = text(value).toLowerCase();
  return ALLOWED_AUDIENCE_MODES.has(mode) ? mode : "table";
}

function sellerFilter(access: CompanyAccess) {
  return ADMIN_ROLES.has(
    String(access.userRole || "").toUpperCase()
  )
    ? {}
    : { seller_id: access.userId };
}

function ownerSellerId(access: CompanyAccess, fallback?: string | null) {
  const value = text(fallback) || text(access.userId);

  if (!value) {
    throw new Error("Vendedor não identificado.");
  }

  return value;
}

function sameNumbers(left: number[], right: number[]) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function responseError(error: unknown, fallback: string) {
  console.error("[CRM_PROMOTIONS]", error);

  const message =
    error instanceof Error ? error.message : fallback;

  const status =
    message.includes("não identificad") ? 401 :
    message.includes("não encontrad") ? 404 :
    message.includes("não pertence") ? 403 :
    500;

  return NextResponse.json(
    { error: message },
    { status }
  );
}

function validatePayload(
  body: Record<string, unknown>,
  requestedStatus: string,
  promotionImages: ReturnType<typeof images>,
  tables: number[],
  mode: string,
  audienceListId: string | null
) {
  const title = text(body?.title);
  const whatsapp = normalizeWhatsapp(
    body?.contact_whatsapp
  );

  if (!title) {
    return "Informe o título da promoção.";
  }

  if (!ALLOWED_STATUS.has(requestedStatus)) {
    return "Status inválido.";
  }

  if (mode === "table" && !tables.length) {
    return "Selecione pelo menos uma tabela comercial.";
  }

  if (mode === "campaign" && !audienceListId) {
    return "Selecione uma campanha personalizada.";
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

async function findAudienceList(
  tx: Prisma.TransactionClient | typeof prisma,
  options: {
    companyId: string;
    sellerId: string;
    audienceListId: string;
    requireActive: boolean;
  }
) {
  const list = await tx.promotionAudienceList.findFirst({
    where: {
      id: options.audienceListId,
      company_id: options.companyId,
      seller_id: options.sellerId,
      ...(options.requireActive
        ? { status: "active" }
        : {}),
    },
    select: {
      id: true,
      name: true,
      status: true,
    },
  });

  if (!list) {
    throw new Error(
      options.requireActive
        ? "Campanha personalizada não encontrada, arquivada ou não pertence ao vendedor."
        : "Campanha personalizada não encontrada ou não pertence ao vendedor."
    );
  }

  return list;
}

async function queueMissingDeliveries(
  tx: Prisma.TransactionClient,
  options: {
    companyId: string;
    sellerId: string;
    promotionId: string;
    mode: string;
    tables: number[];
    audienceListId: string | null;
    now: Date;
  }
) {
  let customerIds: string[] = [];

  if (options.mode === "campaign") {
    if (!options.audienceListId) {
      throw new Error(
        "Campanha personalizada não identificada."
      );
    }

    await findAudienceList(tx, {
      companyId: options.companyId,
      sellerId: options.sellerId,
      audienceListId: options.audienceListId,
      requireActive: true,
    });

    const members =
      await tx.promotionAudienceMember.findMany({
        where: {
          company_id: options.companyId,
          audience_list_id: options.audienceListId,
        },
        select: {
          customer_id: true,
        },
      });

    const memberIds = members.map(
      (member) => member.customer_id
    );

    if (memberIds.length) {
      const customers = await tx.salesCustomer.findMany({
        where: {
          id: {
            in: memberIds,
          },
          company_id: options.companyId,
          seller_id: options.sellerId,
          status: {
            equals: "ativo",
            mode: "insensitive",
          },
        },
        select: {
          id: true,
        },
      });

      customerIds = customers.map(
        (customer) => customer.id
      );
    }
  } else {
    const customers = await tx.salesCustomer.findMany({
      where: {
        company_id: options.companyId,
        seller_id: options.sellerId,
        status: {
          equals: "ativo",
          mode: "insensitive",
        },
        distance_km: {
          not: null,
        },
        price_table: {
          in: options.tables,
        },
      },
      select: {
        id: true,
      },
    });

    customerIds = customers.map(
      (customer) => customer.id
    );
  }

  if (!customerIds.length) return 0;

  const result = await tx.pushDelivery.createMany({
    data: customerIds.map((customerId) => ({
      company_id: options.companyId,
      promotion_id: options.promotionId,
      customer_id: customerId,
      seller_id: options.sellerId,
      status: "pending",
      queued_at: options.now,
    })),
    skipDuplicates: true,
  });

  return result.count;
}

export async function GET(request: NextRequest) {
  try {
    const access = await requireCompanyAccess(request);
    const { searchParams } = request.nextUrl;

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
                {
                  audienceList: {
                    is: {
                      name: {
                        contains: q,
                        mode: "insensitive",
                      },
                    },
                  },
                },
              ],
            }
          : {}),
      },
      include,
      orderBy: {
        created_at: "desc",
      },
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
    const sellerId = ownerSellerId(access);
    const body =
      (await request.json()) as Record<string, unknown>;

    const title = text(body?.title);
    const tables = priceTables(body?.price_tables);
    const promotionImages = images(body?.images);
    const requestedStatus =
      text(body?.status) || "draft";
    const mode = audienceMode(body?.audience_mode);
    const audienceListId =
      mode === "campaign"
        ? optional(body?.audience_list_id)
        : null;

    const validationError = validatePayload(
      body,
      requestedStatus,
      promotionImages,
      tables,
      mode,
      audienceListId
    );

    if (validationError) {
      return NextResponse.json(
        { error: validationError },
        { status: 400 }
      );
    }

    if (mode === "campaign" && audienceListId) {
      await findAudienceList(prisma, {
        companyId: access.companyId,
        sellerId,
        audienceListId,
        requireActive: true,
      });
    }

    const now = new Date();

    const result = await prisma.$transaction(
      async (tx) => {
        const created = await tx.webPromotion.create({
          data: {
            company_id: access.companyId,
            seller_id: sellerId,
            audience_mode: mode,
            audience_list_id: audienceListId,
            internal_title: optional(
              body?.internal_title
            ),
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
            scheduled_at: dateOrNull(
              body?.scheduled_at
            ),
            valid_from: dateOrNull(body?.valid_from),
            valid_until: dateOrNull(
              body?.valid_until
            ),
            status: requestedStatus,
            published_at:
              requestedStatus === "published"
                ? now
                : null,
            targets: {
              create:
                mode === "table"
                  ? tables.map((price_table) => ({
                      price_table,
                    }))
                  : [],
            },
            images: {
              create: promotionImages,
            },
          },
          select: {
            id: true,
          },
        });

        const queued =
          requestedStatus === "published"
            ? await queueMissingDeliveries(tx, {
                companyId: access.companyId,
                sellerId,
                promotionId: created.id,
                mode,
                tables,
                audienceListId,
                now,
              })
            : 0;

        return {
          promotionId: created.id,
          queued,
        };
      }
    );

    let push = null;

    if (requestedStatus === "published") {
      try {
        push = await dispatchPromotionPush({
          companyId: access.companyId,
          promotionId: result.promotionId,
          origin: request.nextUrl.origin,
        });
      } catch (pushError) {
        console.error(
          "[PROMOTION_AUTO_PUSH_POST]",
          pushError
        );

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
        where: {
          id: result.promotionId,
        },
        include,
      });

    return NextResponse.json(
      {
        promotion,
        queued: result.queued,
        push,
      },
      { status: 201 }
    );
  } catch (error) {
    return responseError(
      error,
      "Erro ao criar promoção."
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const access = await requireCompanyAccess(request);
    const body =
      (await request.json()) as Record<string, unknown>;

    const id = text(body?.id);

    if (!id) {
      return NextResponse.json(
        { error: "Promoção não identificada." },
        { status: 400 }
      );
    }

    const current = await prisma.webPromotion.findFirst({
      where: {
        id,
        company_id: access.companyId,
        ...sellerFilter(access),
      },
      select: {
        id: true,
        seller_id: true,
        status: true,
        published_at: true,
        audience_mode: true,
        audience_list_id: true,
        targets: {
          select: {
            price_table: true,
          },
          orderBy: {
            price_table: "asc",
          },
        },
      },
    });

    if (!current) {
      return NextResponse.json(
        { error: "Promoção não encontrada." },
        { status: 404 }
      );
    }

    const sellerId = ownerSellerId(
      access,
      current.seller_id
    );
    const title = text(body?.title);
    const tables = priceTables(body?.price_tables);
    const promotionImages = images(body?.images);
    const requestedStatus =
      text(body?.status) || current.status;
    const mode = audienceMode(
      body?.audience_mode ?? current.audience_mode
    );
    const audienceListId =
      mode === "campaign"
        ? optional(
            body?.audience_list_id ??
              current.audience_list_id
          )
        : null;

    const validationError = validatePayload(
      body,
      requestedStatus,
      promotionImages,
      tables,
      mode,
      audienceListId
    );

    if (validationError) {
      return NextResponse.json(
        { error: validationError },
        { status: 400 }
      );
    }

    const currentTables = current.targets.map(
      (target) => target.price_table
    );

    const audienceChanged =
      current.audience_mode !== mode ||
      (current.audience_list_id || null) !==
        audienceListId ||
      !sameNumbers(currentTables, tables);

    if (
      current.status === "published" &&
      audienceChanged
    ) {
      return NextResponse.json(
        {
          error:
            "O público de uma promoção publicada fica bloqueado para preservar o histórico de entregas. Duplique ou crie uma nova promoção para trocar o público.",
        },
        { status: 409 }
      );
    }

    if (mode === "campaign" && audienceListId) {
      await findAudienceList(prisma, {
        companyId: access.companyId,
        sellerId,
        audienceListId,
        requireActive:
          audienceChanged ||
          (current.status !== "published" &&
            requestedStatus === "published"),
      });
    }

    const now = new Date();
    const becamePublished =
      current.status !== "published" &&
      requestedStatus === "published";

    const queued = await prisma.$transaction(
      async (tx) => {
        await tx.webPromotionTarget.deleteMany({
          where: {
            promotion_id: id,
          },
        });

        await tx.webPromotionImage.deleteMany({
          where: {
            promotion_id: id,
          },
        });

        await tx.webPromotion.update({
          where: {
            id,
          },
          data: {
            audience_mode: mode,
            audience_list_id: audienceListId,
            internal_title: optional(
              body?.internal_title
            ),
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
            scheduled_at: dateOrNull(
              body?.scheduled_at
            ),
            valid_from: dateOrNull(body?.valid_from),
            valid_until: dateOrNull(
              body?.valid_until
            ),
            status: requestedStatus,
            published_at:
              requestedStatus === "published"
                ? current.published_at || now
                : null,
            targets: {
              create:
                mode === "table"
                  ? tables.map((price_table) => ({
                      price_table,
                    }))
                  : [],
            },
            images: {
              create: promotionImages,
            },
          },
        });

        return becamePublished
          ? queueMissingDeliveries(tx, {
              companyId: access.companyId,
              sellerId,
              promotionId: id,
              mode,
              tables,
              audienceListId,
              now,
            })
          : 0;
      }
    );

    let push = null;

    if (becamePublished) {
      try {
        push = await dispatchPromotionPush({
          companyId: access.companyId,
          promotionId: id,
          origin: request.nextUrl.origin,
        });
      } catch (pushError) {
        console.error(
          "[PROMOTION_AUTO_PUSH_PATCH]",
          pushError
        );

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
        where: {
          id,
        },
        include,
      });

    return NextResponse.json({
      promotion,
      queued,
      push,
    });
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
      request.nextUrl.searchParams.get("id")
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
        select: {
          id: true,
        },
      });

    if (!promotion) {
      return NextResponse.json(
        { error: "Promoção não encontrada." },
        { status: 404 }
      );
    }

    await prisma.webPromotion.delete({
      where: {
        id,
      },
    });

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    return responseError(
      error,
      "Erro ao excluir promoção."
    );
  }
}
