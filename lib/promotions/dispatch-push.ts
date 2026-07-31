import { prisma } from "@/lib/prisma";
import { sendWebPush } from "@/lib/push";

type DispatchOptions = {
  companyId: string;
  promotionId: string;
  origin: string;
};

export type PushDispatchResult = {
  audience: number;
  subscriptions: number;
  sent: number;
  failed: number;
  withoutSubscription: number;
  deactivated: number;
};

function absolutePortalUrl(origin: string, token?: string | null) {
  if (!token) return origin;
  return new URL(`/ofertas/${token}`, origin).toString();
}

export async function dispatchPromotionPush({
  companyId,
  promotionId,
  origin,
}: DispatchOptions): Promise<PushDispatchResult> {
  const promotion = await prisma.webPromotion.findFirst({
    where: {
      id: promotionId,
      company_id: companyId,
      status: "published",
    },
    include: {
      images: {
        orderBy: { sort_order: "asc" },
        take: 1,
      },
      deliveries: {
        select: {
          id: true,
          customer_id: true,
          status: true,
          customer: {
            select: {
              webPromotionAccess: {
                select: {
                  active: true,
                  token_value: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!promotion) {
    throw new Error("Promoção publicada não encontrada.");
  }

  const customerIds = promotion.deliveries.map(
    (delivery) => delivery.customer_id
  );

  const subscriptions = customerIds.length
    ? await prisma.pushSubscription.findMany({
        where: {
          company_id: companyId,
          customer_id: { in: customerIds },
          active: true,
          permission: "granted",
        },
        select: {
          id: true,
          customer_id: true,
          endpoint: true,
          p256dh: true,
          auth_key: true,
        },
      })
    : [];

  const subscriptionsByCustomer = new Map<
    string,
    typeof subscriptions
  >();

  for (const subscription of subscriptions) {
    const current =
      subscriptionsByCustomer.get(subscription.customer_id) || [];
    current.push(subscription);
    subscriptionsByCustomer.set(subscription.customer_id, current);
  }

  const title = promotion.push_title || promotion.title;
  const message =
    promotion.push_message ||
    promotion.portal_text ||
    promotion.description ||
    "Confira a nova promoção da PMG.";

  const image = promotion.images[0]?.image_url || undefined;

  let sent = 0;
  let failed = 0;
  let withoutSubscription = 0;
  let deactivated = 0;

  for (const delivery of promotion.deliveries) {
    // Não duplica um envio que já foi concluído anteriormente.
    if (
      ["sent", "opened", "viewed", "clicked"].includes(
        delivery.status
      )
    ) {
      continue;
    }

    const customerSubscriptions =
      subscriptionsByCustomer.get(delivery.customer_id) || [];

    if (!customerSubscriptions.length) {
      withoutSubscription += 1;

      await prisma.pushDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "failed",
          error_code: "NO_SUBSCRIPTION",
          error_message:
            "O cliente ainda não ativou notificações em nenhum navegador.",
        },
      });

      continue;
    }

    const portalToken =
      delivery.customer.webPromotionAccess?.active
        ? delivery.customer.webPromotionAccess.token_value
        : null;

    const url = absolutePortalUrl(origin, portalToken);
    let customerSent = false;
    let lastErrorCode = "PUSH_ERROR";
    let lastErrorMessage = "Falha ao enviar Push.";
    let successfulSubscriptionId: string | null = null;

    for (const subscription of customerSubscriptions) {
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
            title,
            body: message,
            url,
            image,
            tag: `promotion-${promotion.id}`,
            icon: "/logo-pmg.png",
            badge: "/logo-pmg.png",
          }
        );

        customerSent = true;
        successfulSubscriptionId = subscription.id;
      } catch (error: any) {
        const statusCode = Number(error?.statusCode || 0);
        const invalid = statusCode === 404 || statusCode === 410;

        lastErrorCode = statusCode
          ? String(statusCode)
          : "PUSH_ERROR";
        lastErrorMessage =
          error instanceof Error
            ? error.message.slice(0, 1000)
            : "Falha ao enviar Push.";

        if (invalid) {
          deactivated += 1;

          await prisma.pushSubscription.update({
            where: { id: subscription.id },
            data: {
              active: false,
              revoked_at: new Date(),
              permission: "denied",
              permission_updated_at: new Date(),
            },
          });
        }
      }
    }

    if (customerSent) {
      sent += 1;
      const now = new Date();

      await prisma.$transaction([
        prisma.pushDelivery.update({
          where: { id: delivery.id },
          data: {
            push_subscription_id: successfulSubscriptionId,
            status: "sent",
            sent_at: now,
            accepted_at: now,
            error_code: null,
            error_message: null,
          },
        }),
        prisma.salesCustomer.update({
          where: { id: delivery.customer_id },
          data: { last_push_sent_at: now },
        }),
      ]);
    } else {
      failed += 1;

      await prisma.pushDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "failed",
          error_code: lastErrorCode,
          error_message: lastErrorMessage,
        },
      });
    }
  }

  return {
    audience: promotion.deliveries.length,
    subscriptions: subscriptions.length,
    sent,
    failed,
    withoutSubscription,
    deactivated,
  };
}
