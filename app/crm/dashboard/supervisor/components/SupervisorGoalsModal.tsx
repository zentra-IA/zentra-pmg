"use client";

import { useState } from "react";
import { X, Save } from "lucide-react";

export function SupervisorGoalsModal({
  seller,
  onClose,
  onSaved,
}: {
  seller: any | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [goal, setGoal] = useState("");

  if (!seller) return null;

  async function saveGoal() {
    const value = Number(
      goal.replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, "")
    );

    await fetch("/api/crm/goals", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-role": "SUPERVISOR",
        "x-company-id": localStorage.getItem("active_company_id") || "",
      },
      body: JSON.stringify({
  seller_id: seller.id,
  goal_amount: value,
  month: new Date().getMonth() + 1,
  year: new Date().getFullYear(),
}),
    });

    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-slate-950/40" onClick={onClose} />

      <div className="absolute left-1/2 top-1/2 w-[92%] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-950">
              Editar meta
            </h2>

            <p className="text-sm text-slate-500">
              {seller.name}
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded-xl border p-2 hover:bg-slate-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <label className="mt-6 block text-sm font-semibold text-slate-700">
          Meta mensal
        </label>

        <input
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="Ex: 150000"
          className="mt-2 w-full rounded-2xl border px-4 py-3 text-lg font-bold outline-none focus:border-violet-500"
        />

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-2xl border px-4 py-3 text-sm font-semibold hover:bg-slate-50"
          >
            Cancelar
          </button>

          <button
            onClick={saveGoal}
            className="inline-flex items-center gap-2 rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-700"
          >
            <Save className="h-4 w-4" />
            Salvar meta
          </button>
        </div>
      </div>
    </div>
  );
}