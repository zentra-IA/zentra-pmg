"use client";

import { useEffect, useRef } from "react";

type Props = {
  portalToken: string;
};

type TrackEvent = "opened" | "viewed" | "whatsapp";

async function track(
  portalToken: string,
  promotionId: string,
  deliveryId: string,
  event: TrackEvent
) {
  try {
    await fetch("/api/push/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        portalToken,
        promotionId,
        deliveryId,
        event,
      }),
    });
  } catch {
    // Analytics não pode impedir o uso do portal.
  }
}

export default function PromotionAnalyticsTracker({
  portalToken,
}: Props) {
  const viewed = useRef(new Set<string>());

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const promotionId = params.get("promotion_id");
    const deliveryId = params.get("delivery_id");
    const source = params.get("src");

    // Portal realmente carregou depois do clique no Push.
    if (
      source === "push" &&
      promotionId &&
      deliveryId
    ) {
      void track(
        portalToken,
        promotionId,
        deliveryId,
        "opened"
      );
    }

    // Visualização real: só registra quando o card fica
    // suficientemente visível na tela do cliente.
    const cards = Array.from(
      document.querySelectorAll<HTMLElement>(
        "[data-promotion-id][data-delivery-id]"
      )
    );

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || entry.intersectionRatio < 0.45) {
            continue;
          }

          const element = entry.target as HTMLElement;
          const currentPromotionId =
            element.dataset.promotionId || "";
          const currentDeliveryId =
            element.dataset.deliveryId || "";

          if (
            !currentPromotionId ||
            !currentDeliveryId ||
            viewed.current.has(currentDeliveryId)
          ) {
            continue;
          }

          viewed.current.add(currentDeliveryId);

          void track(
            portalToken,
            currentPromotionId,
            currentDeliveryId,
            "viewed"
          );
        }
      },
      { threshold: [0.45] }
    );

    cards.forEach((card) => observer.observe(card));

    // CTA WhatsApp.
    const whatsappLinks = Array.from(
      document.querySelectorAll<HTMLElement>(
        "[data-whatsapp-promotion][data-whatsapp-delivery]"
      )
    );

    const listeners = whatsappLinks.map((element) => {
      const handler = () => {
        const currentPromotionId =
          element.dataset.whatsappPromotion || "";
        const currentDeliveryId =
          element.dataset.whatsappDelivery || "";

        if (currentPromotionId && currentDeliveryId) {
          void track(
            portalToken,
            currentPromotionId,
            currentDeliveryId,
            "whatsapp"
          );
        }
      };

      element.addEventListener("click", handler);
      return { element, handler };
    });

    return () => {
      observer.disconnect();
      listeners.forEach(({ element, handler }) => {
        element.removeEventListener("click", handler);
      });
    };
  }, [portalToken]);

  return null;
}
