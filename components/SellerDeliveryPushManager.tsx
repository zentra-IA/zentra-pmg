"use client";

import { useEffect, useState } from "react";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const rawData = window.atob(base64);

  return Uint8Array.from(
    [...rawData].map((character) => character.charCodeAt(0))
  );
}

export default function SellerDeliveryPushManager() {
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const ok =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;

    setSupported(ok);

    if (!ok) return;

    void (async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        const subscription = await registration.pushManager.getSubscription();

        if (!subscription || Notification.permission !== "granted") return;

        const res = await fetch(
          `/api/crm/seller-push/subscribe?endpoint=${encodeURIComponent(
            subscription.endpoint
          )}`,
          { cache: "no-store" }
        );

        if (res.ok) {
          const data = await res.json();
          setActive(Boolean(data?.active));
        }
      } catch {
        // A tela de Pedidos continua funcionando mesmo sem Push.
      }
    })();
  }, []);

  async function enable() {
    try {
      setLoading(true);

      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) {
        throw new Error("NEXT_PUBLIC_VAPID_PUBLIC_KEY não configurada.");
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        throw new Error("Permissão de notificações não concedida.");
      }

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey:
            urlBase64ToUint8Array(publicKey) as BufferSource,
        });
      }

      const res = await fetch("/api/crm/seller-push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || "Erro ao ativar Push operacional.");
      }

      setActive(true);
    } catch (error: any) {
      alert(error?.message || "Erro ao ativar Push operacional.");
    } finally {
      setLoading(false);
    }
  }

  if (!supported) return null;

  if (active) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-black text-emerald-700">
        🔔 Push operacional do vendedor: ATIVO
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={loading}
      onClick={() => void enable()}
      className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-black text-amber-800 disabled:opacity-50"
    >
      {loading ? "Ativando..." : "🔔 Ativar alertas de entrega no meu celular"}
    </button>
  );
}
