import webpush, { type PushSubscription as WebPushSubscription } from "web-push";

let configured = false;

export function configureWebPush() {
  if (configured) return;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) {
    throw new Error(
      "VAPID não configurado. Defina NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY e VAPID_SUBJECT."
    );
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  icon?: string;
  badge?: string;
  image?: string | null;
  tag?: string;
};

export async function sendWebPush(
  subscription: WebPushSubscription,
  payload: PushPayload
) {
  configureWebPush();

  return webpush.sendNotification(
    subscription,
    JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url,
      icon: payload.icon || "/logo-pmg.png",
      badge: payload.badge || "/logo-pmg.png",
      image: payload.image || undefined,
      tag: payload.tag || "pmg-promotion",
    }),
    {
      TTL: 60 * 60,
      urgency: "high",
    }
  );
}
