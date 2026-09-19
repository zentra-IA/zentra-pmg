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
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [pushEndpoint, setPushEndpoint] = useState("");
  const [preferences, setPreferences] = useState({
    promotions_enabled: true,
    deliveries_enabled: false,
    finance_enabled: false,
  });
  const [savingPreference, setSavingPreference] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  const needsIOSInstall = useMemo(
    () => Boolean(portalToken && isIOS && !isStandalone),
    [portalToken, isIOS, isStandalone]
  );

  useEffect(() => {
    if (!portalToken) {
      setChecking(false);
      return;
    }

    const ios = isIOSDevice();
    const standalone = isStandaloneMode();

    setIsIOS(ios);
    setIsStandalone(standalone);

    const isSupported =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;

    setSupported(isSupported);

    if (!isSupported) {
      setChecking(false);
      return;
    }

    async function initializePush() {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        const subscription = await registration.pushManager.getSubscription();

        setEnabled(
          Boolean(subscription) && Notification.permission === "granted"
        );

        if (subscription && portalToken) {
          setPushEndpoint(subscription.endpoint);

          const prefResponse = await fetch(
            `/api/push/preferences?portalToken=${encodeURIComponent(
              portalToken
            )}&endpoint=${encodeURIComponent(subscription.endpoint)}`,
            { cache: "no-store" }
          );

          if (prefResponse.ok) {
            const prefData = await prefResponse.json();
            if (prefData?.preferences) {
              setPreferences(prefData.preferences);
            }
          }
        }
      } catch (error) {
        console.error("Erro ao registrar Service Worker:", error);
      } finally {
        setChecking(false);
      }
    }

    void initializePush();
  }, [portalToken]);

  useEffect(() => {
    if (!portalToken || !supported) return;

    async function refreshEnabledState() {
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();

        setEnabled(
          Boolean(subscription) && Notification.permission === "granted"
        );
      } catch {
        // Mantém o estado atual; a inicialização principal continua responsável por erros.
      }
    }

    const onFocus = () => void refreshEnabledState();
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void refreshEnabledState();
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [portalToken, supported]);

  useEffect(() => {
    function handleChatState(event: Event) {
      const customEvent = event as CustomEvent<{ open?: boolean }>;
      setChatOpen(Boolean(customEvent.detail?.open));
    }

    window.addEventListener("pmg:portal-chat-open", handleChatState);

    return () => {
      window.removeEventListener("pmg:portal-chat-open", handleChatState);
    };
  }, []);


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
      setPushEndpoint(subscription.endpoint);

      const prefResponse = await fetch("/api/push/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          portalToken,
          endpoint: subscription.endpoint,
          promotions_enabled: preferences.promotions_enabled,
          deliveries_enabled: preferences.deliveries_enabled,
          finance_enabled: preferences.finance_enabled,
        }),
      });

      if (prefResponse.ok) {
        const prefData = await prefResponse.json();
        if (prefData?.preferences) {
          setPreferences(prefData.preferences);
        }
      }

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

  async function updatePreference(
    key: "promotions_enabled" | "deliveries_enabled" | "finance_enabled",
    value: boolean
  ) {
    if (!portalToken || !pushEndpoint) return;

    const next = {
      ...preferences,
      [key]: value,
    };

    setSavingPreference(true);

    try {
      const response = await fetch("/api/push/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          portalToken,
          endpoint: pushEndpoint,
          ...next,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data?.error || "Não foi possível atualizar a preferência."
        );
      }

      setPreferences(data.preferences || next);
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Erro ao atualizar notificações."
      );
    } finally {
      setSavingPreference(false);
    }
  }

  if (!portalToken || chatOpen) return null;

  if (needsIOSInstall) {
    return (
      <div className="fixed inset-x-3 top-[max(10px,env(safe-area-inset-top))] z-[118] mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
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

  if (!supported || checking) return null;

  if (enabled) {
    return (
      <div className="fixed right-3 top-[max(10px,env(safe-area-inset-top))] z-[118] w-[min(92vw,350px)] rounded-2xl border border-slate-200 bg-white/95 p-2.5 shadow-xl backdrop-blur max-[600px]:left-3 max-[600px]:right-3 max-[600px]:w-auto">
        <button
          type="button"
          onClick={() => setPanelOpen((current) => !current)}
          className="flex min-h-[42px] w-full items-center justify-between gap-3 rounded-xl px-2 text-left"
          aria-expanded={panelOpen}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-black text-slate-900">
              <span aria-hidden="true">🔔</span>
              <span>Notificações deste aparelho</span>
            </div>

            {!panelOpen && (
              <div className="mt-1 flex flex-wrap gap-1.5 text-[9px] font-black">
                <span
                  className={`rounded-full px-2 py-0.5 ${
                    preferences.promotions_enabled
                      ? "bg-violet-100 text-violet-700"
                      : "bg-slate-100 text-slate-400"
                  }`}
                >
                  🎁 Ofertas {preferences.promotions_enabled ? "✓" : "—"}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 ${
                    preferences.deliveries_enabled
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-slate-100 text-slate-400"
                  }`}
                >
                  🚚 Entregas {preferences.deliveries_enabled ? "✓" : "—"}
                </span>
              </div>
            )}
          </div>

          <span className="shrink-0 text-sm font-black text-slate-400">
            {panelOpen ? "▲" : "▼"}
          </span>
        </button>

        {panelOpen && (
          <div className="mt-2 grid gap-2 border-t border-slate-100 pt-2">
            <button
              type="button"
              disabled={savingPreference}
              onClick={() =>
                void updatePreference(
                  "promotions_enabled",
                  !preferences.promotions_enabled
                )
              }
              className={`flex min-h-[38px] items-center justify-between rounded-xl border px-3 text-xs font-black ${
                preferences.promotions_enabled
                  ? "border-violet-200 bg-violet-50 text-violet-800"
                  : "border-slate-200 bg-slate-50 text-slate-500"
              }`}
            >
              <span>🎁 Promoções e ofertas</span>
              <span>{preferences.promotions_enabled ? "ATIVO" : "INATIVO"}</span>
            </button>

            <button
              type="button"
              disabled={savingPreference}
              onClick={() =>
                void updatePreference(
                  "deliveries_enabled",
                  !preferences.deliveries_enabled
                )
              }
              className={`flex min-h-[42px] items-center justify-between rounded-xl border px-3 text-xs font-black ${
                preferences.deliveries_enabled
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-slate-200 bg-slate-50 text-slate-500"
              }`}
            >
              <span>🚚 Alertas de entrega</span>
              <span>{preferences.deliveries_enabled ? "ATIVO" : "INATIVO"}</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="fixed right-3 top-[max(10px,env(safe-area-inset-top))] z-[118] max-[600px]:left-3 max-[600px]:right-3">
      <button
        type="button"
        onClick={enablePush}
        disabled={loading}
        className="w-full rounded-xl bg-green-600 px-4 py-3 text-sm font-black text-white shadow-xl disabled:bg-gray-500"
      >
        {loading ? "Ativando..." : "🔔 Ativar notificações"}
      </button>
    </div>
  );
}
