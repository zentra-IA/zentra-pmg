import { prisma } from "@/lib/prisma";
import { sendWebPush } from "@/lib/push";

export async function dispatchPortalChatPush(options: {
  companyId: string;
  customerId: string;
  portalToken: string;
  origin: string;
}) {
  const subscriptions = await prisma.pushSubscription.findMany({
    where: {
      company_id: options.companyId,
      customer_id: options.customerId,
      active: true,
      permission: "granted",
    },
    select: {
      id: true,
      endpoint: true,
      p256dh: true,
      auth_key: true,
    },
  });

  let sent = 0;

  for (const subscription of subscriptions) {
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
          body: "Seu vendedor respondeu no atendimento. Toque para abrir.",
          url: new URL(
            `/ofertas/${encodeURIComponent(options.portalToken)}?chat=open`,
            options.origin
          ).toString(),
          tag: `portal-chat-${options.customerId}`,
          icon: "/logo-pmg.png",
          badge: "/logo-pmg.png",
        }
      );

      sent += 1;
    } catch (error: any) {
      const statusCode = Number(error?.statusCode || 0);

      if (statusCode === 404 || statusCode === 410) {
        await prisma.pushSubscription.update({
          where: { id: subscription.id },
          data: {
            active: false,
            revoked_at: new Date(),
            permission: "denied",
            permission_updated_at: new Date(),
          },
        });
      } else {
        console.error("PORTAL_CHAT_PUSH_ERROR:", error);
      }
    }
  }

  return {
    subscriptions: subscriptions.length,
    sent,
  };
}
