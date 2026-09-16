import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCompanyAccess } from "@/lib/server-company";
import { dispatchPortalChatPush } from "@/lib/portal-chat-push";
import {
  portalChatClean,
  portalMessageLabel,
  uploadPortalChatMedia,
} from "@/lib/portal-chat";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function requireSeller(req: NextRequest) {
  const access = await requireCompanyAccess(req);

  const companyId = portalChatClean(access?.companyId);
  const userId = portalChatClean(access?.userId);
  const role = portalChatClean(access?.userRole).toUpperCase();

  if (!companyId || !userId) {
    throw new Error("AUTH_NOT_FOUND");
  }

  if (role === "SUPERVISOR") {
    throw new Error("ACCESS_DENIED");
  }

  return {
    companyId,
    sellerId: userId,
  };
}

async function getSellerCustomer(
  companyId: string,
  sellerId: string,
  customerId: string
) {
  return prisma.salesCustomer.findFirst({
    where: {
      id: customerId,
      company_id: companyId,
      seller_id: sellerId,
    },
    select: {
      id: true,
      company_id: true,
      seller_id: true,
      legal_name: true,
      trade_name: true,
      phone: true,
      whatsapp: true,
      internal_code: true,
      status: true,
    },
  });
}

async function getOrCreateSellerConversation(options: {
  companyId: string;
  sellerId: string;
  customerId: string;
}) {
  const customer = await getSellerCustomer(
    options.companyId,
    options.sellerId,
    options.customerId
  );

  if (!customer) {
    throw new Error("CUSTOMER_NOT_FOUND");
  }

  const portalAccess = await prisma.webPromotionAccess.findFirst({
    where: {
      company_id: options.companyId,
      customer_id: customer.id,
      active: true,
      token_value: {
        not: null,
      },
    },
    select: {
      token_value: true,
    },
  });

  if (!portalAccess?.token_value) {
    throw new Error("CUSTOMER_PORTAL_NOT_READY");
  }

  const customerName =
    portalChatClean(customer.trade_name) ||
    portalChatClean(customer.legal_name) ||
    "Cliente";

  const customerPhone =
    portalChatClean(customer.whatsapp) ||
    portalChatClean(customer.phone) ||
    null;

  const conversation = await prisma.portalConversation.upsert({
    where: {
      customer_id: customer.id,
    },
    update: {
      company_id: options.companyId,
      seller_id: options.sellerId,
      customer_name: customerName,
      customer_phone: customerPhone,
      updated_at: new Date(),
    },
    create: {
      company_id: options.companyId,
      seller_id: options.sellerId,
      customer_id: customer.id,
      customer_name: customerName,
      customer_phone: customerPhone,
    },
  });

  return {
    conversation,
    portalToken: portalAccess.token_value,
  };
}

async function listSellerCustomers(
  companyId: string,
  sellerId: string,
  search: string
) {
  const normalizedSearch = portalChatClean(search).slice(0, 80);

  const where: any = {
    company_id: companyId,
    seller_id: sellerId,
  };

  if (normalizedSearch) {
    where.OR = [
      {
        trade_name: {
          contains: normalizedSearch,
          mode: "insensitive",
        },
      },
      {
        legal_name: {
          contains: normalizedSearch,
          mode: "insensitive",
        },
      },
      {
        internal_code: {
          contains: normalizedSearch,
          mode: "insensitive",
        },
      },
      {
        document: {
          contains: normalizedSearch,
          mode: "insensitive",
        },
      },
      {
        whatsapp: {
          contains: normalizedSearch,
          mode: "insensitive",
        },
      },
    ];
  }

  const customers = await prisma.salesCustomer.findMany({
    where,
    select: {
      id: true,
      legal_name: true,
      trade_name: true,
      internal_code: true,
      document: true,
      phone: true,
      whatsapp: true,
      city: true,
      state: true,
      status: true,
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
        },
        take: 1,
      },
    },
    orderBy: [
      {
        trade_name: "asc",
      },
      {
        legal_name: "asc",
      },
    ],
    take: normalizedSearch ? 100 : 80,
  });

  const customerIds = customers.map((customer) => customer.id);

  const conversations = customerIds.length
    ? await prisma.portalConversation.findMany({
        where: {
          company_id: companyId,
          seller_id: sellerId,
          customer_id: {
            in: customerIds,
          },
        },
        select: {
          id: true,
          customer_id: true,
          last_message: true,
          last_message_at: true,
          seller_unread: true,
        },
      })
    : [];

  const conversationByCustomer = new Map(
    conversations.map((conversation) => [
      conversation.customer_id,
      conversation,
    ])
  );

  return customers.map((customer) => {
    const existingConversation = conversationByCustomer.get(customer.id);

    return {
      id: customer.id,
      customer_name:
        customer.trade_name ||
        customer.legal_name ||
        "Cliente",
      legal_name: customer.legal_name,
      internal_code: customer.internal_code,
      document: customer.document,
      phone: customer.whatsapp || customer.phone,
      city: customer.city,
      state: customer.state,
      status: customer.status,
      portal_ready: Boolean(
        customer.webPromotionAccess?.active &&
          customer.webPromotionAccess?.token_value
      ),
      push_enabled: customer.pushSubscriptions.length > 0,
      conversation_id: existingConversation?.id || null,
      last_message: existingConversation?.last_message || null,
      last_message_at: existingConversation?.last_message_at || null,
      seller_unread: existingConversation?.seller_unread || 0,
    };
  });
}

export async function GET(req: NextRequest) {
  try {
    const access = await requireSeller(req);
    const mode = portalChatClean(req.nextUrl.searchParams.get("mode"));

    if (mode === "customers") {
      const customers = await listSellerCustomers(
        access.companyId,
        access.sellerId,
        req.nextUrl.searchParams.get("search") || ""
      );

      return NextResponse.json({
        success: true,
        customers,
      });
    }

    const conversationId = portalChatClean(
      req.nextUrl.searchParams.get("conversationId") ||
        req.nextUrl.searchParams.get("conversation_id")
    );

    if (!conversationId) {
      const conversations = await prisma.portalConversation.findMany({
        where: {
          company_id: access.companyId,
          seller_id: access.sellerId,
        },
        orderBy: [
          { last_message_at: "desc" },
          { updated_at: "desc" },
        ],
        take: 300,
      });

      return NextResponse.json({
        success: true,
        conversations,
      });
    }

    const conversation = await prisma.portalConversation.findFirst({
      where: {
        id: conversationId,
        company_id: access.companyId,
        seller_id: access.sellerId,
      },
    });

    if (!conversation) {
      return NextResponse.json(
        { success: false, error: "Conversa não encontrada." },
        { status: 404 }
      );
    }

    const messages = await prisma.portalMessage.findMany({
      where: {
        conversation_id: conversation.id,
        company_id: access.companyId,
        seller_id: access.sellerId,
      },
      orderBy: {
        created_at: "asc",
      },
      take: 500,
    });

    if (conversation.seller_unread > 0) {
      await prisma.$transaction([
        prisma.portalConversation.update({
          where: { id: conversation.id },
          data: { seller_unread: 0 },
        }),
        prisma.portalMessage.updateMany({
          where: {
            conversation_id: conversation.id,
            sender_type: "customer",
            read_at: null,
          },
          data: {
            read_at: new Date(),
          },
        }),
      ]);
    }

    return NextResponse.json({
      success: true,
      conversation: {
        ...conversation,
        seller_unread: 0,
      },
      messages,
    });
  } catch (error: any) {
    const message = error?.message || "Erro ao carregar chat.";

    if (message === "AUTH_NOT_FOUND") {
      return NextResponse.json(
        { success: false, error: "Usuário não identificado." },
        { status: 401 }
      );
    }

    if (message === "ACCESS_DENIED") {
      return NextResponse.json(
        { success: false, error: "Acesso negado." },
        { status: 403 }
      );
    }

    console.error("GET /api/crm/portal-chat:", error);

    return NextResponse.json(
      { success: false, error: "Erro ao carregar conversas do portal." },
      { status: 500 }
    );
  }
}


export async function PATCH(req: NextRequest) {
  try {
    const access = await requireSeller(req);
    const body = await req.json().catch(() => ({}));
    const conversationId = portalChatClean(
      body?.conversationId || body?.conversation_id
    );

    if (!conversationId || typeof body?.aiPaused !== "boolean") {
      return NextResponse.json(
        { success: false, error: "Conversa ou estado da IA não informado." },
        { status: 400 }
      );
    }

    const conversation = await prisma.portalConversation.findFirst({
      where: {
        id: conversationId,
        company_id: access.companyId,
        seller_id: access.sellerId,
      },
    });

    if (!conversation) {
      return NextResponse.json(
        { success: false, error: "Conversa não encontrada." },
        { status: 404 }
      );
    }

    const updated = await prisma.portalConversation.update({
      where: { id: conversation.id },
      data: {
        ai_paused: body.aiPaused,
        updated_at: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      conversation: updated,
    });
  } catch (error: any) {
    const message = error?.message || "Erro ao alterar chatbot.";

    if (message === "AUTH_NOT_FOUND") {
      return NextResponse.json(
        { success: false, error: "Usuário não identificado." },
        { status: 401 }
      );
    }

    if (message === "ACCESS_DENIED") {
      return NextResponse.json(
        { success: false, error: "Acesso negado." },
        { status: 403 }
      );
    }

    console.error("PATCH /api/crm/portal-chat:", error);

    return NextResponse.json(
      { success: false, error: "Erro ao alterar chatbot da conversa." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const access = await requireSeller(req);
    const body = await req.json().catch(() => ({}));

    let conversationId = portalChatClean(
      body?.conversationId || body?.conversation_id
    );

    const customerId = portalChatClean(
      body?.customerId || body?.customer_id
    );

    let conversation: any = null;
    let portalToken: string | null = null;

    if (conversationId) {
      conversation = await prisma.portalConversation.findFirst({
        where: {
          id: conversationId,
          company_id: access.companyId,
          seller_id: access.sellerId,
        },
      });

      if (!conversation) {
        return NextResponse.json(
          { success: false, error: "Conversa não encontrada." },
          { status: 404 }
        );
      }
    } else if (customerId) {
      const prepared = await getOrCreateSellerConversation({
        companyId: access.companyId,
        sellerId: access.sellerId,
        customerId,
      });

      conversation = prepared.conversation;
      portalToken = prepared.portalToken;
      conversationId = conversation.id;

      if (body?.createOnly === true || body?.create_only === true) {
        return NextResponse.json({
          success: true,
          conversation,
        });
      }
    } else {
      return NextResponse.json(
        { success: false, error: "Conversa ou cliente não informado." },
        { status: 400 }
      );
    }

    const content = portalChatClean(
      body?.message || body?.text || body?.content
    ).slice(0, 10000);

    const hasMedia = Boolean(portalChatClean(body?.base64));

    if (!content && !hasMedia) {
      return NextResponse.json(
        { success: false, error: "Digite uma mensagem ou envie um arquivo." },
        { status: 400 }
      );
    }

    const media = hasMedia
      ? await uploadPortalChatMedia({
          companyId: access.companyId,
          sellerId: access.sellerId,
          customerId: conversation.customer_id,
          base64: body?.base64,
          mediaType: body?.mediaType || body?.media_type,
          mimeType: body?.mimeType || body?.mime_type,
          fileName: body?.fileName || body?.file_name,
        })
      : {
          mediaUrl: null,
          mediaType: null,
          mimeType: null,
          fileName: null,
          fileSize: null,
        };

    const preview =
      content ||
      portalMessageLabel(media.mediaType, media.fileName);

    const now = new Date();

    const [, message] = await prisma.$transaction([
      prisma.portalConversation.update({
        where: { id: conversation.id },
        data: {
          last_message: preview.slice(0, 500),
          last_message_at: now,
          last_sender_type: "seller",
          ai_paused: true,
          customer_unread: {
            increment: 1,
          },
          updated_at: now,
        },
      }),
      prisma.portalMessage.create({
        data: {
          conversation_id: conversation.id,
          company_id: access.companyId,
          seller_id: access.sellerId,
          customer_id: conversation.customer_id,
          sender_type: "seller",
          message_type: media.mediaType || "text",
          content: content || null,
          media_url: media.mediaUrl,
          mime_type: media.mimeType,
          file_name: media.fileName,
          file_size: media.fileSize,
        },
      }),
    ]);

    /*
     * Push do chat:
     * a mensagem é persistida primeiro. Falha no Push nunca desfaz o envio.
     */
    try {
      if (!portalToken) {
        const portalAccess = await prisma.webPromotionAccess.findFirst({
          where: {
            company_id: access.companyId,
            customer_id: conversation.customer_id,
            active: true,
          },
          select: {
            token_value: true,
          },
        });

        portalToken = portalAccess?.token_value || null;
      }

      if (portalToken) {
        const origin = new URL(req.url).origin;

        await dispatchPortalChatPush({
          companyId: access.companyId,
          customerId: conversation.customer_id,
          portalToken,
          origin,
        });
      }
    } catch (pushError) {
      console.error("PORTAL_CHAT_PUSH_WARNING:", pushError);
    }

    return NextResponse.json({
      success: true,
      conversation,
      message,
    });
  } catch (error: any) {
    const message = error?.message || "Erro ao enviar mensagem.";

    if (message === "AUTH_NOT_FOUND") {
      return NextResponse.json(
        { success: false, error: "Usuário não identificado." },
        { status: 401 }
      );
    }

    if (message === "ACCESS_DENIED") {
      return NextResponse.json(
        { success: false, error: "Acesso negado." },
        { status: 403 }
      );
    }

    if (message === "CUSTOMER_NOT_FOUND") {
      return NextResponse.json(
        {
          success: false,
          error: "Cliente não encontrado na sua carteira.",
        },
        { status: 404 }
      );
    }

    if (message === "CUSTOMER_PORTAL_NOT_READY") {
      return NextResponse.json(
        {
          success: false,
          error:
            "Este cliente ainda não possui Portal de Ofertas ativo. Gere o portal antes de iniciar a conversa.",
        },
        { status: 409 }
      );
    }

    console.error("POST /api/crm/portal-chat:", error);

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
