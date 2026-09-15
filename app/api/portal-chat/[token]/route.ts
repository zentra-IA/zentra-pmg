import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getPortalChatAccess,
  portalChatClean,
  portalMessageLabel,
  uploadPortalChatMedia,
} from "@/lib/portal-chat";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ token: string }>;
};

async function resolveAccess(token: string) {
  const access = await getPortalChatAccess(token);

  if (!access) {
    throw new Error("PORTAL_ACCESS_NOT_FOUND");
  }

  if (!access.seller_id) {
    throw new Error("PORTAL_SELLER_NOT_FOUND");
  }

  return access;
}

async function getOrCreateConversation(access: Awaited<ReturnType<typeof resolveAccess>>) {
  const customerName =
    access.customer.trade_name ||
    access.customer.legal_name ||
    "Cliente";

  const customerPhone =
    access.customer.whatsapp ||
    access.customer.phone ||
    null;

  return prisma.portalConversation.upsert({
    where: {
      customer_id: access.customer_id,
    },
    update: {
      company_id: access.company_id,
      seller_id: access.seller_id,
      customer_name: customerName,
      customer_phone: customerPhone,
      updated_at: new Date(),
    },
    create: {
      company_id: access.company_id,
      seller_id: access.seller_id,
      customer_id: access.customer_id,
      customer_name: customerName,
      customer_phone: customerPhone,
    },
  });
}

export async function GET(
  _req: NextRequest,
  { params }: RouteContext
) {
  try {
    const { token } = await params;
    const access = await resolveAccess(token);

    const conversation = await prisma.portalConversation.findFirst({
      where: {
        company_id: access.company_id,
        seller_id: access.seller_id,
        customer_id: access.customer_id,
      },
    });

    if (!conversation) {
      return NextResponse.json({
        success: true,
        customer: {
          name:
            access.customer.trade_name ||
            access.customer.legal_name,
        },
        conversation: null,
        messages: [],
      });
    }

    const messages = await prisma.portalMessage.findMany({
      where: {
        conversation_id: conversation.id,
        company_id: access.company_id,
        customer_id: access.customer_id,
      },
      orderBy: {
        created_at: "asc",
      },
      take: 500,
    });

    if (conversation.customer_unread > 0) {
      await prisma.$transaction([
        prisma.portalConversation.update({
          where: { id: conversation.id },
          data: { customer_unread: 0 },
        }),
        prisma.portalMessage.updateMany({
          where: {
            conversation_id: conversation.id,
            sender_type: "seller",
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
      customer: {
        name:
          access.customer.trade_name ||
          access.customer.legal_name,
      },
      conversation: {
        ...conversation,
        customer_unread: 0,
      },
      messages,
    });
  } catch (error: any) {
    const message = error?.message || "Erro ao carregar chat.";

    if (message === "PORTAL_ACCESS_NOT_FOUND") {
      return NextResponse.json(
        { success: false, error: "Portal não encontrado." },
        { status: 404 }
      );
    }

    if (message === "PORTAL_SELLER_NOT_FOUND") {
      return NextResponse.json(
        {
          success: false,
          error:
            "Este cliente ainda não possui vendedor responsável pelo atendimento.",
        },
        { status: 409 }
      );
    }

    console.error("GET /api/portal-chat/[token]:", error);

    return NextResponse.json(
      { success: false, error: "Erro ao carregar atendimento." },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: RouteContext
) {
  try {
    const { token } = await params;
    const access = await resolveAccess(token);
    const body = await req.json().catch(() => ({}));

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

    const conversation = await getOrCreateConversation(access);

    const media = hasMedia
      ? await uploadPortalChatMedia({
          companyId: access.company_id,
          sellerId: access.seller_id,
          customerId: access.customer_id,
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

    const messageType = media.mediaType || "text";
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
          last_sender_type: "customer",
          seller_unread: {
            increment: 1,
          },
          updated_at: now,
        },
      }),
      prisma.portalMessage.create({
        data: {
          conversation_id: conversation.id,
          company_id: access.company_id,
          seller_id: access.seller_id,
          customer_id: access.customer_id,
          sender_type: "customer",
          message_type: messageType,
          content: content || null,
          media_url: media.mediaUrl,
          mime_type: media.mimeType,
          file_name: media.fileName,
          file_size: media.fileSize,
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      message,
    });
  } catch (error: any) {
    const message = error?.message || "Erro ao enviar mensagem.";

    if (message === "PORTAL_ACCESS_NOT_FOUND") {
      return NextResponse.json(
        { success: false, error: "Portal não encontrado." },
        { status: 404 }
      );
    }

    if (message === "PORTAL_SELLER_NOT_FOUND") {
      return NextResponse.json(
        {
          success: false,
          error:
            "Este cliente ainda não possui vendedor responsável pelo atendimento.",
        },
        { status: 409 }
      );
    }

    console.error("POST /api/portal-chat/[token]:", error);

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
