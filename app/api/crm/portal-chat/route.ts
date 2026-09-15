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

export async function GET(req: NextRequest) {
  try {
    const access = await requireSeller(req);
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

export async function POST(req: NextRequest) {
  try {
    const access = await requireSeller(req);
    const body = await req.json().catch(() => ({}));

    const conversationId = portalChatClean(
      body?.conversationId || body?.conversation_id
    );

    if (!conversationId) {
      return NextResponse.json(
        { success: false, error: "Conversa não informada." },
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
     * a resposta já foi persistida, então falha de Push nunca desfaz a mensagem.
     * O conteúdo da conversa não é exposto na tela bloqueada.
     */
    try {
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

      if (portalAccess?.token_value) {
        const origin = new URL(req.url).origin;

        await dispatchPortalChatPush({
          companyId: access.companyId,
          customerId: conversation.customer_id,
          portalToken: portalAccess.token_value,
          origin,
        });
      }
    } catch (pushError) {
      console.error("PORTAL_CHAT_PUSH_WARNING:", pushError);
    }

    return NextResponse.json({
      success: true,
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

    console.error("POST /api/crm/portal-chat:", error);

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
