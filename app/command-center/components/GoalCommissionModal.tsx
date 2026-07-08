"use client";

import { useEffect, useState } from "react";
import { Calculator, Save, X } from "lucide-react";

export function GoalCommissionModal({
  seller,
  onClose,
  onSaved,
}: {
  seller: any | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [goal, setGoal] = useState("");
  const [commission, setCommission] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (seller) {
      setGoal(String(Number(seller.goal || 0)));
      setCommission(String(Number(seller.commissionPercent || 0)));
    }
  }, [seller]);

  if (!seller) return null;

  const sold = Number(seller.sold || 0);
  const commissionValue = (sold * Number(commission || 0)) / 100;

  async function save() {
    try {
      setSaving(true);

      const response = await fetch("/api/command-center/seller-settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-role": "SUPERVISOR",
          "x-company-id": localStorage.getItem("active_company_id") || "",
        },
        body: JSON.stringify({
          seller_id: seller.id,
          goal_amount: Number(goal || 0),
          commission_percent: Number(commission || 0),
          month: new Date().getMonth() + 1,
          year: new Date().getFullYear(),
        }),
      });

      const data = await response.json();

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Erro ao salvar.");
      }

      await onSaved();
      onClose();
    } catch (error) {
      console.error("[GoalCommissionModal]", error);
      alert("Não foi possível salvar meta/comissão.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80]">
      <div
        className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="absolute left-1/2 top-1/2 w-[92%] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[34px] bg-white shadow-2xl">
        <div className="bg-gradient-to-br from-slate-950 via-emerald-950 to-emerald-900 p-6 text-white">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-300">
                Meta e comissão
              </p>
              <h2 className="mt-2 text-2xl font-black">
                {seller.name}
              </h2>
              <p className="mt-1 text-sm text-emerald-50/70">
                Configure a meta mensal e a comissão deste vendedor.
              </p>
            </div>

            <button
              onClick={onClose}
              className="rounded-2xl border border-white/10 bg-white/10 p-2 hover:bg-white/20"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <DarkInfo label="Vendido" value={seller.soldFormatted} />
            <DarkInfo label="Meta atual" value={seller.goalFormatted} />
          </div>
        </div>

        <div className="space-y-4 p-6">
          <div>
            <label className="text-sm font-black text-slate-700">
              Meta mensal
            </label>
            <input
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              placeholder="Ex: 180000"
              inputMode="numeric"
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-lg font-black outline-none focus:border-emerald-500"
            />
            <p className="mt-1 text-xs font-semibold text-slate-500">
              Digite sem pontos. Exemplo: 180000 para R$ 180.000,00.
            </p>
          </div>

          <div>
            <label className="text-sm font-black text-slate-700">
              Comissão %
            </label>
            <input
              value={commission}
              onChange={(event) => setCommission(event.target.value)}
              placeholder="Ex: 3"
              inputMode="decimal"
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-lg font-black outline-none focus:border-emerald-500"
            />
          </div>

          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
            <div className="flex items-center gap-2">
              <Calculator className="h-4 w-4 text-emerald-700" />
              <p className="text-sm font-black text-emerald-900">
                Comissão estimada
              </p>
            </div>

            <p className="mt-2 text-2xl font-black text-emerald-800">
              {commissionValue.toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              })}
            </p>
          </div>

          <button
            onClick={save}
            disabled={saving}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-4 text-sm font-black text-white shadow-lg shadow-emerald-700/20 hover:bg-emerald-700 disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {saving ? "Salvando..." : "Salvar meta e comissão"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DarkInfo({ label, value }: any) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 p-3">
      <p className="text-xs font-bold text-emerald-50/60">{label}</p>
      <p className="mt-1 truncate font-black text-white">{value}</p>
    </div>
  );
}
