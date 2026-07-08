"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Activity = {
  id: string;
  title: string;
  description?: string | null;
  scheduled_at?: string | null;
  status?: string | null;
  priority?: string | null;
  origin?: string | null;
  phone?: string | null;
};

type NextActionModalProps = {
  open: boolean;
  onClose: () => void;

  source: "customer" | "lead";
  customerId?: string | null;
  leadId?: string | null;

  name?: string | null;
  phone?: string | null;

  onSaved?: () => void;
};

function todayInputValue() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function timeInputValue() {
  const now = new Date();
  now.setMinutes(now.getMinutes() + 30);
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "Sem horário";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sem horário";

  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function NextActionModal({
  open,
  onClose,
  source,
  customerId,
  leadId,
  name,
  phone,
  onSaved,
}: NextActionModalProps) {
  const [title, setTitle] = useState("Retornar contato");
  const [date, setDate] = useState(todayInputValue());
  const [time, setTime] = useState(timeInputValue());
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);

  const sourceId = source === "customer" ? customerId : leadId;

  const query = useMemo(() => {
    const params = new URLSearchParams();

    if (source === "customer" && customerId) {
      params.set("customer_id", customerId);
    }

    if (source === "lead" && leadId) {
      params.set("lead_id", leadId);
    }

    params.set("status", "pendente");

    return params.toString();
  }, [source, customerId, leadId]);

  async function loadActivities() {
    if (!open || !sourceId) return;

    setLoadingActivities(true);

    try {
      const res = await fetch(`/api/crm/customer-activities?${query}`, {
        cache: "no-store",
        credentials: "include",
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setActivities(Array.isArray(data.activities) ? data.activities : []);
      }
    } finally {
      setLoadingActivities(false);
    }
  }

  useEffect(() => {
    if (!open) return;

    setTitle("Retornar contato");
    setDate(todayInputValue());
    setTime(timeInputValue());
    setDescription("");

    loadActivities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sourceId]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (!sourceId) {
      alert("Origem da próxima ação não encontrada.");
      return;
    }

    if (!title.trim()) {
      alert("Informe o título da próxima ação.");
      return;
    }

    if (!date || !time) {
      alert("Informe data e hora.");
      return;
    }

    const scheduledAt = new Date(`${date}T${time}:00`);

    if (Number.isNaN(scheduledAt.getTime())) {
      alert("Data ou hora inválida.");
      return;
    }

    setSaving(true);

    try {
      const payload: any = {
        title: title.trim(),
        description: description.trim() || null,
        scheduled_at: scheduledAt.toISOString(),
        type: "followup",
        origin: source,
        phone: phone || null,
        status: "pendente",
        notify: true,
      };

      if (source === "customer") payload.customer_id = customerId;
      if (source === "lead") payload.lead_id = leadId;

      const res = await fetch("/api/crm/customer-activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        alert(data.error || "Erro ao salvar próxima ação.");
        return;
      }

      await loadActivities();
      onSaved?.();

      setTitle("Retornar contato");
      setDate(todayInputValue());
      setTime(timeInputValue());
      setDescription("");
    } finally {
      setSaving(false);
    }
  }

  async function completeActivity(id: string) {
    const ok = confirm("Marcar esta ação como concluída?");
    if (!ok) return;

    const res = await fetch("/api/crm/customer-activities", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        id,
        status: "concluido",
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      alert(data.error || "Erro ao concluir atividade.");
      return;
    }

    await loadActivities();
    onSaved?.();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 p-6">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">
              Próxima ação
            </p>
            <h2 className="mt-1 text-2xl font-black text-slate-900">
              {name || "Contato"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {source === "lead" ? "Origem: Kanban" : "Origem: Cliente"}
              {phone ? ` • ${phone}` : ""}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-3 py-1 text-sm font-bold text-slate-600 hover:bg-slate-50"
          >
            Fechar
          </button>
        </div>

        <div className="grid gap-6 p-6 md:grid-cols-[1fr_0.9fr]">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-bold text-slate-700">
                Título
              </label>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Ex: Retornar sobre proposta"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-bold text-slate-700">
                  Data
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-bold text-slate-700">
                  Hora
                </label>
                <input
                  type="time"
                  value={time}
                  onChange={(event) => setTime(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-bold text-slate-700">
                Observação
              </label>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Ex: Cliente pediu para chamar segunda de manhã."
                rows={4}
                className="w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-blue-200 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Salvando..." : "Salvar próxima ação"}
            </button>
          </form>

          <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="font-black text-slate-900">Agenda</h3>
                <p className="text-xs text-slate-500">Pendências deste contato</p>
              </div>

              <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-700">
                {activities.length}
              </span>
            </div>

            <div className="max-h-80 space-y-3 overflow-auto pr-1">
              {loadingActivities && (
                <div className="rounded-2xl bg-white p-4 text-sm text-slate-500">
                  Carregando agenda...
                </div>
              )}

              {!loadingActivities && activities.length === 0 && (
                <div className="rounded-2xl bg-white p-4 text-sm text-slate-500">
                  Nenhuma ação pendente.
                </div>
              )}

              {activities.map((activity) => (
                <div
                  key={activity.id}
                  className="rounded-2xl border border-slate-100 bg-white p-4"
                >
                  <div className="text-xs font-black uppercase tracking-wide text-blue-600">
                    {formatDateTime(activity.scheduled_at)}
                  </div>

                  <div className="mt-1 font-black text-slate-900">
                    {activity.title}
                  </div>

                  {activity.description && (
                    <div className="mt-1 text-sm text-slate-500">
                      {activity.description}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => completeActivity(activity.id)}
                    className="mt-3 rounded-xl border border-emerald-200 px-3 py-2 text-xs font-black text-emerald-700 hover:bg-emerald-50"
                  >
                    Marcar como concluída
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
