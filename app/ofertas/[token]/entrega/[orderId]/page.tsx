"use client";

import { useEffect, useState } from "react";

export default function DeliveryConfirmationPage({
  params,
}: {
  params: Promise<{ token: string; orderId: string }>;
}) {
  const [token, setToken] = useState("");
  const [orderId, setOrderId] = useState("");
  const [delivery, setDelivery] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      const resolved = await params;
      setToken(resolved.token);
      setOrderId(resolved.orderId);

      try {
        const res = await fetch(
          `/api/delivery/${encodeURIComponent(resolved.token)}/${encodeURIComponent(resolved.orderId)}`,
          { cache: "no-store" }
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Erro ao carregar entrega.");
        setDelivery(data.delivery);
      } catch (e: any) {
        setError(e?.message || "Erro ao carregar entrega.");
      } finally {
        setLoading(false);
      }
    })();
  }, [params]);

  async function answer(value: "READY" | "NOT_READY") {
    if (!token || !orderId) return;
    setSaving(true);
    setError("");

    try {
      const res = await fetch(
        `/api/delivery/${encodeURIComponent(token)}/${encodeURIComponent(orderId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answer: value }),
        }
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao confirmar.");
      setDelivery((current: any) => ({ ...current, ...data.delivery }));
    } catch (e: any) {
      setError(e?.message || "Erro ao confirmar.");
    } finally {
      setSaving(false);
    }
  }

  function hour(value: string) {
    if (!value) return "--:--";
    return new Date(value).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 p-5">
        <div className="mx-auto max-w-lg rounded-3xl bg-white p-6 shadow-sm">
          Carregando sua entrega...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="mx-auto max-w-lg rounded-[28px] border border-slate-200 bg-white p-6 shadow-xl">
        <div className="text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-emerald-100 text-3xl">
            🚚
          </div>
          <p className="mt-4 text-xs font-black uppercase tracking-[0.2em] text-emerald-700">
            Entrega PMG
          </p>
          <h1 className="mt-2 text-2xl font-black text-slate-950">
            Sua entrega é hoje
          </h1>
        </div>

        {error && (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
            {error}
          </div>
        )}

        {delivery && (
          <>
            <div className="mt-6 rounded-2xl bg-slate-50 p-4">
              <span className="text-xs font-bold uppercase text-slate-400">
                Pedido
              </span>
              <strong className="mt-1 block text-lg font-black text-slate-900">
                {delivery.order_number || "Pedido PMG"}
              </strong>
              <p className="mt-2 text-sm font-semibold text-slate-600">
                Previsão: <b>{hour(delivery.delivery_start)}</b> até{" "}
                <b>{hour(delivery.delivery_end)}</b>
              </p>
            </div>

            {delivery.status === "READY" ? (
              <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center">
                <div className="text-3xl">✅</div>
                <strong className="mt-2 block text-lg font-black text-emerald-800">
                  Confirmado
                </strong>
                <p className="mt-1 text-sm font-semibold text-emerald-700">
                  Você informou que está preparado para receber a entrega.
                </p>
              </div>
            ) : delivery.status === "NOT_READY" ? (
              <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-5 text-center">
                <div className="text-3xl">⚠️</div>
                <strong className="mt-2 block text-lg font-black text-red-800">
                  Você informou que não está pronto
                </strong>
                <p className="mt-1 text-sm font-semibold text-red-700">
                  Seu vendedor poderá entrar em contato para ajustar a entrega.
                </p>
              </div>
            ) : (
              <div className="mt-6">
                <p className="text-center text-sm font-bold leading-6 text-slate-700">
                  Você está no estabelecimento e preparado para receber o pedido?
                </p>

                <div className="mt-4 grid gap-3">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void answer("READY")}
                    className="min-h-[58px] rounded-2xl bg-emerald-600 px-4 text-base font-black text-white shadow-md disabled:opacity-50"
                  >
                    ✅ SIM, ESTOU PRONTO
                  </button>

                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void answer("NOT_READY")}
                    className="min-h-[58px] rounded-2xl border border-red-200 bg-red-50 px-4 text-base font-black text-red-700 disabled:opacity-50"
                  >
                    ❌ NÃO POSSO RECEBER AGORA
                  </button>
                </div>

                <p className="mt-4 text-center text-xs font-semibold leading-5 text-slate-400">
                  Os alertas repetidos param assim que você responder.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
