"use client";

import { useEffect, useMemo, useState } from "react";

type Props = {
  portalToken?: string;
};

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

function isIOSDevice() {
  if (typeof navigator === "undefined") return false;

  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isStandaloneMode() {
  if (typeof window === "undefined") return false;

  const navigatorWithStandalone = navigator as Navigator & {
    standalone?: boolean;
  };

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    navigatorWithStandalone.standalone === true
  );
}

export default function PushNotificationManager({ portalToken }: Props) {
  const [supported, setSupported] = useState(false);
  const [loading, setLoading] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  const needsIOSInstall = useMemo(
    () => Boolean(portalToken && isIOS && !isStandalone),
    [portalToken, isIOS, isStandalone]
  );

  useEffect(() => {
    if (!portalToken) return;

    const ios = isIOSDevice();
    const standalone = isStandaloneMode();

    setIsIOS(ios);
    setIsStandalone(standalone);

    const isSupported =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;

    setSupported(isSupported);

    if (!isSupported) return;

    async function initializePush() {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        const subscription = await registration.pushManager.getSubscription();

        setEnabled(
          Boolean(subscription) && Notification.permission === "granted"
        );
      } catch (error) {
        console.error("Erro ao registrar Service Worker:", error);
      }
    }

    void initializePush();
  }, [portalToken]);

  async function testNotification() {
    try {
      if (Notification.permission !== "granted") {
        throw new Error("Ative as notificações primeiro.");
      }

      const registration = await navigator.serviceWorker.ready;

      await registration.showNotification("PMG Atacadista", {
        body: "Teste concluído. As notificações estão funcionando neste aparelho.",
        icon: "/logo-pmg.png",
        badge: "/logo-pmg.png",
        tag: "pmg-push-test",
      });
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Não foi possível exibir a notificação de teste."
      );
    }
  }

  async function enablePush() {
    if (!portalToken) return;

    if (isIOSDevice() && !isStandaloneMode()) {
      alert(
        'No iPhone, primeiro toque em Compartilhar → "Adicionar à Tela de Início". Depois abra o portal pelo ícone PMG criado.'
      );
      return;
    }

    try {
      setLoading(true);

      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) {
        throw new Error("NEXT_PUBLIC_VAPID_PUBLIC_KEY não foi configurada.");
      }

      if (
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        throw new Error(
          "Este navegador não oferece suporte a notificações Web Push."
        );
      }

      const permission = await Notification.requestPermission();

      if (permission !== "granted") {
        throw new Error("A permissão para notificações não foi concedida.");
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

      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...subscription.toJSON(),
          portalToken,
        }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(result?.error || "Não foi possível registrar o Push.");
      }

      setEnabled(true);
      alert("Notificações ativadas com sucesso.");
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Erro ao ativar notificações."
      );
    } finally {
      setLoading(false);
    }
  }

  if (!portalToken) return null;

  if (needsIOSInstall) {
    return (
      <div className="fixed inset-x-4 bottom-5 z-50 mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-100 text-xl">
            📲
          </div>

          <div>
            <strong className="block text-sm font-black text-slate-900">
              Ative notificações no iPhone
            </strong>
            <p className="mt-1 text-sm leading-5 text-slate-600">
              No Safari, toque em <b>Compartilhar</b> →{" "}
              <b>Adicionar à Tela de Início</b>. Depois abra este portal pelo
              ícone PMG criado.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!supported) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2">
      {enabled && (
        <button
          type="button"
          onClick={testNotification}
          className="rounded-xl border border-green-700 bg-white px-4 py-2 text-sm font-bold text-green-800 shadow-lg"
        >
          Testar notificação
        </button>
      )}

      <button
        type="button"
        onClick={enablePush}
        disabled={loading || enabled}
        className="rounded-xl bg-green-600 px-4 py-3 font-semibold text-white shadow-lg disabled:bg-gray-500"
      >
        {loading
          ? "Ativando..."
          : enabled
            ? "Notificações ativadas"
            : "Ativar notificações"}
      </button>
    </div>
  );
}
