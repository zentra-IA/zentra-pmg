"use client";

import { useEffect, useMemo, useState } from "react";

type CustomerRef = {
  id?: string | null;
  internalCode?: string | null;
  name?: string;
  document?: string | null;
  sellerName?: string;
  sellerId?: string | null;
};

type Action = {
  id: string;
  type: "boleto" | "ticket" | "mix" | "pagamento" | "quote_gap" | "portfolio" | string;
  title?: string;
  priority: "alta" | "media" | "baixa" | string;
  score?: number;
  customer?: CustomerRef;
  orderId?: string;
  orderNumber?: string;
  reason?: string;
  recommendation?: string;
  valueFormatted?: string;
  dueDate?: string;
  estimatedValueFormatted?: string;
  currentTicketFormatted?: string;
  averageTicketFormatted?: string;
  dropPercent?: number;
  portfolioStatus?: string;
  products?: Array<{
    code?: string;
    name: string;
    averageValue?: number;
    quotedValueFormatted?: string;
  }>;
  message?: string;
};

type PortfolioStatus =
  | "critical"
  | "d29"
  | "attention"
  | "habit_overdue"
  | "expected_today"
  | "expected_tomorrow"
  | "protected"
  | "not_activated"
  | string;

type PortfolioItem = {
  id: string;
  customer: CustomerRef;
  status: PortfolioStatus;
  statusRank?: number;
  title: string;
  reason: string;
  recommendation: string;
  referenceAt?: string | null;
  referenceDate?: string | null;
  daysSinceReference?: number | null;
  lastOrderAt?: string | null;
  lastOrderDate?: string | null;
  lastActivationAt?: string | null;
  lastActivationDate?: string | null;
  lastPortfolioAction?: "activated" | "not_activated" | null;
  lastPortfolioActionAt?: string | null;
  lastPortfolioActionNote?: string | null;
  rhythm?: {
    cadence?: string | null;
    intervalDays?: number | null;
    confidence?: number | null;
    dominantWeekday?: string | null;
    expectedAt?: string | null;
    expectedDate?: string | null;
    sampleSize?: number | null;
  } | null;
  manualHabitualPurchaseDay?: string | null;
  manualPurchaseWeekdays?: string[];
};

type PortfolioSummary = {
  total: number;
  attention: number;
  d29: number;
  critical: number;
  expectedToday: number;
  expectedTomorrow: number;
  overdueHabit: number;
  activated: number;
  notActivated: number;
};

type IntelligenceResponse = {
  ok: boolean;
  generatedAt: string;
  scope?: string;
  summary: {
    totalActions: number;
    boletos: number;
    ticket: number;
    mix: number;
    pagamento: number;
    cotacoes?: number;
    portfolio?: number;
    potential?: number;
    potentialFormatted: string;
    highPriority: number;
  };
  actions: Action[];
  groups: {
    boletos: Action[];
    ticket: Action[];
    mix: Action[];
    pagamento: Action[];
    cotacoes?: Action[];
    portfolio?: Action[];
  };
  portfolio?: {
    summary: PortfolioSummary;
    items: PortfolioItem[];
  };
  supervisor?: {
    sellers: Array<{
      seller: string;
      actions: number;
      highPriority: number;
      potential: number;
    }>;
  };
  whatsappSummary?: string;
};

type Activity = {
  id: string;
  type: string;
  origin?: string | null;
  title: string;
  description?: string | null;
  scheduled_at?: string | null;
  priority: string;
  status: string;
  phone?: string | null;
  customer?: {
    id?: string;
    legal_name?: string | null;
    trade_name?: string | null;
    whatsapp?: string | null;
    phone?: string | null;
  } | null;
  lead?: {
    id?: string;
    name?: string | null;
    phone?: string | null;
    remote_jid?: string | null;
  } | null;
};

type Goal = {
  id: string;
  seller_id?: string | null;
  seller_name?: string | null;
  name?: string | null;
  goal_amount: number;
};

type AgendaCustomer = {
  id: string;
  legal_name?: string | null;
  trade_name?: string | null;
  internal_code?: string | null;
  erp_code?: string | null;
  whatsapp?: string | null;
  phone?: string | null;
};

type AgendaForm = {
  customerId: string;
  customerName: string;
  title: string;
  description: string;
  date: string;
  time: string;
};

const EMPTY_PORTFOLIO_SUMMARY: PortfolioSummary = {
  total: 0,
  attention: 0,
  d29: 0,
  critical: 0,
  expectedToday: 0,
  expectedTomorrow: 0,
  overdueHabit: 0,
  activated: 0,
  notActivated: 0,
};

const tabs = [
  { id: "prioridade", label: "Prioridade" },
  { id: "carteira", label: "Carteira" },
  { id: "boleto", label: "Boletos" },
  { id: "ticket", label: "Ticket" },
  { id: "mix", label: "Mix perdido" },
  { id: "cotacoes", label: "Cotações" },
  { id: "pagamento", label: "Pagamento" },
  { id: "supervisor", label: "Supervisor" },
];

const PORTFOLIO_FILTERS = [
  { value: "all", label: "Todos" },
  { value: "urgent", label: "Urgentes" },
  { value: "critical", label: "30+ dias" },
  { value: "d29", label: "D+29" },
  { value: "attention", label: "D+26 a D+28" },
  { value: "expected_today", label: "Compra hoje" },
  { value: "expected_tomorrow", label: "Compra amanhã" },
  { value: "habit_overdue", label: "Padrão atrasado" },
  { value: "protected", label: "Ativados" },
  { value: "not_activated", label: "Não ativados" },
];

function brl(value: number) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function todayISO(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function currentTimeInput() {
  const date = new Date();
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatDateLabel(value: string) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
  });
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTime(value?: string | null) {
  if (!value) return "Sem horário";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sem horário";

  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function priorityStyle(priority?: string) {
  const p = String(priority || "").toLowerCase();
  if (p === "alta") return "border-red-200 bg-red-50 text-red-700";
  if (p === "media") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-teal-700";
}

function typeLabel(type?: string) {
  if (type === "boleto") return "Boleto";
  if (type === "ticket") return "Ticket";
  if (type === "mix") return "Mix";
  if (type === "pagamento") return "Pagamento";
  if (type === "quote_gap" || type === "cotacao") return "Cotação";
  if (type === "portfolio") return "Carteira";
  return "Ação";
}

function activityTypeLabel(type?: string) {
  const labels: Record<string, string> = {
    call: "Ligação",
    whatsapp: "WhatsApp",
    meeting: "Reunião",
    visit: "Visita",
    followup: "Follow-up",
    task: "Tarefa",
    note: "Observação",
    quote: "Cotação",
    charge: "Cobrança",
  };

  return labels[String(type || "")] || "Atividade";
}

function getActivityName(activity: Activity) {
  return (
    activity.customer?.trade_name ||
    activity.customer?.legal_name ||
    activity.lead?.name ||
    activity.phone ||
    activity.lead?.phone ||
    "Contato sem nome"
  );
}

function cleanPhone(value?: string | null) {
  return String(value || "").replace(/\D/g, "");
}

function customerDisplayName(customer: AgendaCustomer) {
  return customer.trade_name || customer.legal_name || "Cliente sem nome";
}

function portfolioStatusMeta(status: PortfolioStatus) {
  const map: Record<
    string,
    { label: string; pill: string; border: string; icon: string }
  > = {
    critical: {
      label: "30+ dias · Crítico",
      pill: "border-red-200 bg-red-50 text-red-700",
      border: "border-red-200",
      icon: "🚨",
    },
    d29: {
      label: "D+29 · Agir hoje",
      pill: "border-orange-200 bg-orange-50 text-orange-700",
      border: "border-orange-200",
      icon: "⏳",
    },
    attention: {
      label: "Atenção de carteira",
      pill: "border-amber-200 bg-amber-50 text-amber-700",
      border: "border-amber-200",
      icon: "⚠️",
    },
    habit_overdue: {
      label: "Compra atrasada",
      pill: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700",
      border: "border-fuchsia-200",
      icon: "📉",
    },
    expected_today: {
      label: "Compra esperada hoje",
      pill: "border-blue-200 bg-blue-50 text-blue-700",
      border: "border-blue-200",
      icon: "🎯",
    },
    expected_tomorrow: {
      label: "Compra esperada amanhã",
      pill: "border-cyan-200 bg-cyan-50 text-cyan-700",
      border: "border-cyan-200",
      icon: "📅",
    },
    protected: {
      label: "Ativado no PMG",
      pill: "border-emerald-200 bg-emerald-50 text-teal-700",
      border: "border-emerald-200",
      icon: "🛡️",
    },
    not_activated: {
      label: "Não ativado",
      pill: "border-slate-300 bg-slate-100 text-slate-700",
      border: "border-slate-300",
      icon: "↩",
    },
  };

  return (
    map[String(status)] || {
      label: String(status || "Carteira"),
      pill: "border-slate-200 bg-slate-50 text-slate-700",
      border: "border-slate-200",
      icon: "•",
    }
  );
}

function KpiCard({
  label,
  value,
  helper,
  tone = "slate",
}: {
  label: string;
  value: string | number;
  helper: string;
  tone?: "slate" | "emerald" | "red" | "blue" | "amber";
}) {
  const toneMap = {
    slate: "border-slate-200 bg-white text-slate-950",
    emerald: "border-emerald-100 bg-emerald-50 text-emerald-700",
    red: "border-red-100 bg-red-50 text-red-700",
    blue: "border-blue-100 bg-blue-50 text-blue-700",
    amber: "border-amber-100 bg-amber-50 text-amber-700",
  };

  return (
    <div className={`rounded-3xl border p-5 shadow-sm ${toneMap[tone]}`}>
      <p className="text-[11px] font-black uppercase tracking-[0.16em] opacity-70">
        {label}
      </p>
      <strong className="mt-2 block text-2xl font-black tracking-tight">
        {value}
      </strong>
      <p className="mt-1 text-xs font-bold opacity-70">{helper}</p>
    </div>
  );
}

function ActionCard({ action }: { action: Action }) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(action.message || "");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      alert("Não foi possível copiar a mensagem automaticamente.");
    }
  }

  const customerName = action.customer?.name || "Cliente não informado";
  const clientUrl = action.customer?.id
    ? `/crm/dashboard/customers?customer=${action.customer.id}`
    : `/crm/dashboard/customers?search=${encodeURIComponent(customerName)}`;

  const ordersUrl = action.orderId
    ? `/crm/dashboard/orders?order=${action.orderId}`
    : `/crm/dashboard/orders?search=${encodeURIComponent(customerName)}`;

  return (
    <article className="rounded-[22px] border border-slate-200 bg-white px-4 py-4 shadow-sm transition hover:border-slate-300 hover:shadow-md">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-teal-700">
              {typeLabel(action.type)}
            </span>
            <span
              className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] ${priorityStyle(action.priority)}`}
            >
              {action.priority || "média"}
            </span>
            <span className="text-[10px] font-black text-slate-400">
              Score {Math.round(action.score || 0)}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="text-base font-black tracking-tight text-slate-950">
              {customerName}
            </h3>
            <span className="text-[11px] font-bold text-slate-400">
              {action.customer?.internalCode
                ? `ID ${action.customer.internalCode}`
                : "Sem ID PMG"}
            </span>
          </div>

          <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-slate-600">
            {action.recommendation ||
              action.reason ||
              "Ação comercial recomendada pela IA."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {action.estimatedValueFormatted || action.valueFormatted ? (
            <div className="rounded-xl bg-slate-50 px-3 py-2 text-right">
              <span className="block text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
                Potencial
              </span>
              <strong className="text-xs font-black text-teal-700">
                {action.estimatedValueFormatted ||
                  action.valueFormatted ||
                  "—"}
              </strong>
            </div>
          ) : null}

          {action.message ? (
            <button
              type="button"
              onClick={copyMessage}
              className="rounded-xl bg-teal-700 px-3 py-2 text-[11px] font-black text-white transition hover:bg-teal-800"
            >
              {copied ? "Copiada" : "Copiar mensagem"}
            </button>
          ) : null}

          <a
            href={clientUrl}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-black text-slate-700 transition hover:bg-slate-50"
          >
            Cliente
          </a>

          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-black text-slate-700 transition hover:bg-slate-100"
          >
            {expanded ? "Menos" : "Detalhes"}
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl bg-slate-50 p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                O que aconteceu
              </p>
              <p className="mt-1 text-xs font-bold leading-5 text-slate-700">
                {action.reason || "Sem diagnóstico detalhado."}
              </p>
            </div>

            <div className="rounded-2xl bg-teal-50 p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-teal-700">
                Próxima ação
              </p>
              <p className="mt-1 text-xs font-bold leading-5 text-teal-950">
                {action.recommendation || "Fazer contato comercial."}
              </p>
            </div>
          </div>

          {action.type === "boleto" ? (
            <div className="mt-3 rounded-2xl border border-rose-100 bg-rose-50 p-3 text-xs font-bold text-rose-900">
              Vencimento: {action.dueDate}
              {action.valueFormatted ? ` • ${action.valueFormatted}` : ""}
            </div>
          ) : null}

          {action.type === "ticket" ? (
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-black">
              <span className="rounded-xl bg-slate-100 px-3 py-2 text-slate-700">
                Atual {action.currentTicketFormatted || "—"}
              </span>
              <span className="rounded-xl bg-slate-100 px-3 py-2 text-slate-700">
                Média {action.averageTicketFormatted || "—"}
              </span>
              <span className="rounded-xl bg-rose-50 px-3 py-2 text-rose-700">
                Queda {action.dropPercent || 0}%
              </span>
            </div>
          ) : null}

          {!!action.products?.length ? (
            <div className="mt-3 rounded-2xl border border-slate-100 p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                Produtos
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {action.products.slice(0, 6).map((product) => (
                  <span
                    key={`${product.code}-${product.name}`}
                    className="rounded-xl bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-700"
                  >
                    {product.code ? `${product.code} • ` : ""}
                    {product.name}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={ordersUrl}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-black text-slate-700"
            >
              Ver pedidos
            </a>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function DeliveryRow({
  order,
  onUpdate,
}: {
  order: any;
  onUpdate: (order: any, status: "entregue" | "nao_entregue") => void;
}) {
  const delivered = order.status === "entregue";
  const failed = order.status === "nao_entregue";

  return (
    <div
      className={`rounded-2xl border p-4 ${
        delivered
          ? "border-emerald-100 bg-emerald-50"
          : failed
            ? "border-red-100 bg-red-50"
            : "border-slate-200 bg-slate-50"
      }`}
    >
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <strong className="text-sm font-black text-slate-950">
              {order.customer_name || "Cliente sem nome"}
            </strong>
            <span
              className={`rounded-full px-3 py-1 text-[11px] font-black ${
                delivered
                  ? "bg-emerald-100 text-emerald-700"
                  : failed
                    ? "bg-red-100 text-red-700"
                    : "bg-amber-100 text-amber-700"
              }`}
            >
              {delivered ? "Entregue" : failed ? "Não entregue" : "Pendente"}
            </span>
          </div>
          <p className="mt-1 text-xs font-bold text-slate-500">
            Pedido {order.order_number || "-"} ·{" "}
            {brl(Number(order.total || 0))} · Vendedor:{" "}
            {order.seller_name || "-"}
          </p>
          {order.commercial_notes ? (
            <p className="mt-1 text-xs font-bold text-red-700">
              {order.commercial_notes}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {!delivered ? (
            <button
              onClick={() => onUpdate(order, "entregue")}
              className="rounded-2xl bg-emerald-700 px-4 py-2 text-xs font-black text-white transition hover:bg-emerald-800"
            >
              Entregue
            </button>
          ) : null}

          {!failed ? (
            <button
              onClick={() => onUpdate(order, "nao_entregue")}
              className="rounded-2xl border border-red-200 bg-white px-4 py-2 text-xs font-black text-red-700 transition hover:bg-red-50"
            >
              Não entregue
            </button>
          ) : null}

          <a
            href={`/crm/dashboard/orders?order=${order.id}`}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-black text-slate-700 transition hover:bg-slate-100"
          >
            Ver pedido
          </a>
        </div>
      </div>
    </div>
  );
}

function PortfolioCard({
  item,
  savingKey,
  onOpenPmg,
  onRegister,
  onSchedule,
}: {
  item: PortfolioItem;
  savingKey: string;
  onOpenPmg: (item: PortfolioItem) => void;
  onRegister: (
    item: PortfolioItem,
    action: "activated" | "not_activated"
  ) => void;
  onSchedule: (item: PortfolioItem) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const meta = portfolioStatusMeta(item.status);
  const customerName = item.customer?.name || "Cliente sem nome";
  const internalCode = item.customer?.internalCode || "";

  const cadence = item.rhythm?.cadence
    ? `${item.rhythm.cadence}${
        item.rhythm.intervalDays ? ` · ~${item.rhythm.intervalDays} dias` : ""
      }`
    : null;

  const rhythmDescription = item.rhythm
    ? [
        cadence,
        item.rhythm.dominantWeekday
          ? `dia forte: ${item.rhythm.dominantWeekday}`
          : null,
        item.rhythm.confidence
          ? `confiança ${item.rhythm.confidence}%`
          : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : item.manualHabitualPurchaseDay ||
        item.manualPurchaseWeekdays?.length
      ? `Padrão cadastrado: ${[
          item.manualHabitualPurchaseDay,
          ...(item.manualPurchaseWeekdays || []),
        ]
          .filter(Boolean)
          .join(", ")}`
      : "Sem padrão de recompra confiável ainda.";

  const activatedLoading =
    savingKey === `${item.customer.id}:activated`;
  const notActivatedLoading =
    savingKey === `${item.customer.id}:not_activated`;

  return (
    <article
      className={`rounded-[22px] border bg-white px-4 py-4 shadow-sm transition hover:shadow-md ${meta.border}`}
    >
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] ${meta.pill}`}
            >
              {meta.icon} {meta.label}
            </span>

            {item.daysSinceReference !== null &&
            item.daysSinceReference !== undefined ? (
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-600">
                D+{item.daysSinceReference}
              </span>
            ) : null}

            {item.rhythm?.cadence ? (
              <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-black text-indigo-700">
                {item.rhythm.cadence}
              </span>
            ) : null}
          </div>

          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="text-base font-black tracking-tight text-slate-950">
              {customerName}
            </h3>
            <span className="text-[11px] font-bold text-slate-400">
              {internalCode ? `ID PMG ${internalCode}` : "Sem ID PMG"}
            </span>
          </div>

          <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-slate-600">
            {item.recommendation || item.reason}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-xl bg-slate-50 px-3 py-2">
            <span className="block text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
              Referência
            </span>
            <strong className="text-[11px] font-black text-slate-700">
              {item.referenceDate || "—"}
            </strong>
          </div>

          <button
            type="button"
            onClick={() => onOpenPmg(item)}
            className="rounded-xl bg-slate-900 px-3 py-2 text-[11px] font-black text-white transition hover:bg-slate-800"
          >
            PMG + ID
          </button>

          <button
            type="button"
            disabled={activatedLoading || notActivatedLoading}
            onClick={() => onRegister(item, "activated")}
            className="rounded-xl bg-teal-700 px-3 py-2 text-[11px] font-black text-white transition hover:bg-teal-800 disabled:opacity-60"
          >
            {activatedLoading ? "Salvando..." : "Ativado"}
          </button>

          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-black text-slate-700 transition hover:bg-slate-100"
          >
            {expanded ? "Menos" : "Detalhes"}
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                Diagnóstico
              </p>
              <p className="mt-1 text-xs font-bold leading-5 text-slate-700">
                {item.reason}
              </p>
            </div>

            <div className="rounded-2xl bg-teal-50 p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-teal-700">
                O que fazer
              </p>
              <p className="mt-1 text-xs font-bold leading-5 text-teal-950">
                {item.recommendation}
              </p>
            </div>

            <div className="rounded-2xl bg-indigo-50 p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-indigo-700">
                Recorrência
              </p>
              <p className="mt-1 text-xs font-bold leading-5 text-indigo-950">
                {rhythmDescription}
              </p>
              {item.rhythm?.expectedDate ? (
                <p className="mt-1 text-[11px] font-black text-indigo-700">
                  Próxima esperada: {item.rhythm.expectedDate}
                </p>
              ) : null}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold text-slate-600">
            <span className="rounded-xl bg-slate-50 px-3 py-2">
              Último pedido:{" "}
              <strong className="text-slate-950">
                {item.lastOrderDate || "não localizado"}
              </strong>
            </span>
            <span className="rounded-xl bg-slate-50 px-3 py-2">
              Última ativação:{" "}
              <strong className="text-slate-950">
                {item.lastActivationDate || "não registrada"}
              </strong>
            </span>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={activatedLoading || notActivatedLoading}
              onClick={() => onRegister(item, "not_activated")}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-[11px] font-black text-slate-700"
            >
              {notActivatedLoading ? "Salvando..." : "Não ativado"}
            </button>

            <button
              type="button"
              onClick={() => onSchedule(item)}
              className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-[11px] font-black text-indigo-700"
            >
              Agendar retorno
            </button>

            <a
              href={`/crm/dashboard/customers?customer=${encodeURIComponent(
                String(item.customer.id || "")
              )}`}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-black text-slate-700"
            >
              Abrir cliente
            </a>

            <a
              href={`/crm/dashboard/orders?search=${encodeURIComponent(customerName)}`}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-black text-slate-700"
            >
              Ver pedidos
            </a>
          </div>
        </div>
      ) : null}
    </article>
  );
}


export default function CentralIA() {
  const [data, setData] = useState<IntelligenceResponse | null>(null);
  const [deliverySummary, setDeliverySummary] = useState<any>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("prioridade");
  const [search, setSearch] = useState("");
  const [deliveryDate, setDeliveryDate] = useState(todayISO());
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [showAllDeliveries, setShowAllDeliveries] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(true);
  const [portfolioOpen, setPortfolioOpen] = useState(false);
  const [activitiesOpen, setActivitiesOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);

  const [portfolioSearch, setPortfolioSearch] = useState("");
  const [portfolioFilter, setPortfolioFilter] = useState("all");
  const [portfolioSaving, setPortfolioSaving] = useState("");

  const [agendaOpen, setAgendaOpen] = useState(false);
  const [agendaCustomers, setAgendaCustomers] = useState<AgendaCustomer[]>([]);
  const [agendaCustomerSearch, setAgendaCustomerSearch] = useState("");
  const [agendaLoadingCustomers, setAgendaLoadingCustomers] = useState(false);
  const [agendaSaving, setAgendaSaving] = useState(false);
  const [agendaForm, setAgendaForm] = useState<AgendaForm>({
    customerId: "",
    customerName: "",
    title: "Retornar contato",
    description: "",
    date: todayISO(),
    time: currentTimeInput(),
  });

  function revealSection(
    id: string,
    openSection?: () => void
  ) {
    openSection?.();

    window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 80);
  }

  async function load() {
    setLoading(true);

    try {
      const [intelRes, deliveryRes, activitiesRes, goalsRes] =
        await Promise.all([
          fetch("/api/crm/customer-intelligence", {
            cache: "no-store",
            credentials: "include",
          }),
          fetch(`/api/crm/delivery-summary?date=${deliveryDate}`, {
            cache: "no-store",
            credentials: "include",
          }),
          fetch("/api/crm/customer-activities?scope=today", {
            cache: "no-store",
            credentials: "include",
          }),
          fetch("/api/crm/goals", {
            cache: "no-store",
            credentials: "include",
          }),
        ]);

      const intelJson = await intelRes.json().catch(() => ({}));
      if (!intelRes.ok) {
        throw new Error(
          intelJson?.error || "Erro ao carregar Central IA"
        );
      }
      setData(intelJson);

      const deliveryJson = await deliveryRes.json().catch(() => ({}));
      if (deliveryRes.ok && !deliveryJson.error) {
        setDeliverySummary(deliveryJson);
      } else {
        setDeliverySummary(null);
      }

      const activitiesJson = await activitiesRes.json().catch(() => ({}));
      if (activitiesRes.ok && !activitiesJson.error) {
        setActivities(activitiesJson.activities || []);
      } else {
        setActivities([]);
      }

      const goalsJson = await goalsRes.json().catch(() => ({}));
      if (goalsRes.ok && !goalsJson.error) {
        setGoals(goalsJson.goals || []);
      } else {
        setGoals([]);
      }
    } catch (error: any) {
      alert(error?.message || "Erro ao carregar Central IA");
    } finally {
      setLoading(false);
    }
  }

  async function updateDeliveryStatus(
    order: any,
    status: "entregue" | "nao_entregue"
  ) {
    let commercial_notes: string | undefined;

    if (status === "nao_entregue") {
      const reason = window.prompt(
        `Por que o pedido ${order.order_number || ""} de ${
          order.customer_name || "cliente"
        } não foi entregue?`
      );

      if (!reason?.trim()) {
        alert("Informe o motivo para marcar como não entregue.");
        return;
      }

      commercial_notes = `Não entregue: ${reason.trim()}`;
    } else {
      const ok = confirm(
        `Marcar pedido ${order.order_number || ""} como entregue?`
      );
      if (!ok) return;
      commercial_notes =
        "Pedido marcado como entregue pela Central IA.";
    }

    const res = await fetch("/api/crm/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        id: order.id,
        status,
        commercial_notes,
      }),
    });

    const response = await res.json().catch(() => ({}));

    if (!res.ok) {
      alert(response.error || "Erro ao atualizar pedido.");
      return;
    }

    await load();
  }

  async function copyText(value: string) {
    if (!value) return false;

    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = value;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand("copy");
        document.body.removeChild(textarea);
        return copied;
      } catch {
        return false;
      }
    }
  }

  async function openPmg(item: PortfolioItem) {
    const pmgId = String(item.customer.internalCode || "").trim();

    if (pmgId) {
      await copyText(pmgId);
    }

    window.open(
      "https://sistema.pmg.com.br/Default.aspx",
      "_blank",
      "noopener,noreferrer"
    );

    window.setTimeout(() => {
      alert(
        pmgId
          ? `Sistema PMG aberto.\n\nID ${pmgId} copiado para a área de transferência.`
          : "Sistema PMG aberto.\n\nEste cliente ainda não possui ID PMG cadastrado."
      );
    }, 120);
  }

  async function registerPortfolioAction(
    item: PortfolioItem,
    action: "activated" | "not_activated"
  ) {
    if (!item.customer.id) {
      alert("Cliente sem ID interno no Zentra.");
      return;
    }

    if (action === "activated") {
      const ok = confirm(
        `Confirma que ${item.customer.name || "o cliente"} foi realmente ativado no PMG?\n\nIsso inicia um novo ciclo de proteção no Zentra.`
      );
      if (!ok) return;
    }

    setPortfolioSaving(`${item.customer.id}:${action}`);

    try {
      const res = await fetch("/api/crm/portfolio-protection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          customerId: item.customer.id,
          action,
          note:
            action === "activated"
              ? "Cliente ativado manualmente no PMG pelo vendedor."
              : "Ativação no PMG não realizada.",
        }),
      });

      const response = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(
          response.error || "Erro ao registrar ação da carteira."
        );
      }

      alert(
        action === "activated"
          ? "Ativação registrada. O novo ciclo de proteção começa agora."
          : "Tentativa registrada. O ciclo de proteção não foi reiniciado."
      );

      await load();
    } catch (error: any) {
      alert(
        error?.message || "Erro ao registrar proteção de carteira."
      );
    } finally {
      setPortfolioSaving("");
    }
  }

  async function loadAgendaCustomers() {
    setAgendaLoadingCustomers(true);

    try {
      const res = await fetch("/api/crm/customers?limit=300", {
        cache: "no-store",
        credentials: "include",
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json?.error || "Erro ao carregar clientes.");
      }

      const list = Array.isArray(json)
        ? json
        : Array.isArray(json.customers)
          ? json.customers
          : [];

      setAgendaCustomers(list);
    } catch (error: any) {
      alert(error?.message || "Erro ao carregar clientes.");
      setAgendaCustomers([]);
    } finally {
      setAgendaLoadingCustomers(false);
    }
  }

  function openAgenda(item?: PortfolioItem) {
    const customerId = String(item?.customer?.id || "");
    const customerName = String(item?.customer?.name || "");

    setAgendaForm({
      customerId,
      customerName,
      title: item
        ? `Retornar contato — ${customerName}`
        : "Retornar contato",
      description: item?.recommendation || "",
      date: todayISO(),
      time: currentTimeInput(),
    });

    setAgendaCustomerSearch(customerName);
    setAgendaOpen(true);

    if (!agendaCustomers.length) {
      void loadAgendaCustomers();
    }
  }

  async function saveAgenda() {
    if (!agendaForm.customerId) {
      alert("Selecione um cliente.");
      return;
    }

    if (!agendaForm.title.trim()) {
      alert("Informe o título da próxima ação.");
      return;
    }

    if (!agendaForm.date || !agendaForm.time) {
      alert("Informe data e hora.");
      return;
    }

    const scheduledAt = new Date(
      `${agendaForm.date}T${agendaForm.time}:00`
    );

    if (Number.isNaN(scheduledAt.getTime())) {
      alert("Data ou hora inválida.");
      return;
    }

    const selectedCustomer = agendaCustomers.find(
      (customer) => customer.id === agendaForm.customerId
    );

    setAgendaSaving(true);

    try {
      const res = await fetch("/api/crm/customer-activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          customer_id: agendaForm.customerId,
          phone:
            selectedCustomer?.whatsapp ||
            selectedCustomer?.phone ||
            null,
          origin: "assistant",
          type: "followup",
          title: agendaForm.title.trim(),
          description: agendaForm.description.trim() || null,
          scheduled_at: scheduledAt.toISOString(),
          priority: "media",
          status: "pendente",
          notify: true,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(
          json?.error || "Erro ao salvar próxima ação."
        );
      }

      alert("Próxima ação salva com sucesso.");
      setAgendaOpen(false);
      await load();
    } catch (error: any) {
      alert(error?.message || "Erro ao salvar próxima ação.");
    } finally {
      setAgendaSaving(false);
    }
  }

  async function completeActivity(id: string) {
    const ok = confirm("Marcar esta ação como concluída?");
    if (!ok) return;

    const res = await fetch("/api/crm/customer-activities", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ id, status: "concluido" }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      alert(json?.error || "Erro ao concluir atividade.");
      return;
    }

    await load();
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryDate]);

  const orders = useMemo(() => {
    return (deliverySummary?.sellers || []).flatMap(
      (seller: any) => seller.orders || []
    );
  }, [deliverySummary]);

  const pendingOrders = useMemo(() => {
    return orders.filter(
      (order: any) =>
        order.status !== "entregue" &&
        order.status !== "nao_entregue"
    );
  }, [orders]);

  const visibleOrders = showAllDeliveries
    ? orders
    : orders.slice(0, 8);

  const portfolioSummary =
    data?.portfolio?.summary || EMPTY_PORTFOLIO_SUMMARY;

  const portfolioItems = useMemo(() => {
    let list = [...(data?.portfolio?.items || [])];

    if (portfolioFilter === "urgent") {
      list = list.filter((item) =>
        ["critical", "d29", "attention", "habit_overdue", "expected_today"].includes(
          String(item.status)
        )
      );
    } else if (portfolioFilter !== "all") {
      list = list.filter(
        (item) => String(item.status) === portfolioFilter
      );
    }

    const term = portfolioSearch.trim().toLowerCase();

    if (term) {
      list = list.filter((item) =>
        [
          item.customer?.name,
          item.customer?.internalCode,
          item.customer?.document,
          item.title,
          item.reason,
          item.rhythm?.dominantWeekday,
          item.rhythm?.cadence,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(term)
      );
    }

    return list;
  }, [data?.portfolio?.items, portfolioFilter, portfolioSearch]);

  const actions = useMemo(() => {
    if (!data) return [];

    let list: Action[] = data.actions || [];

    if (tab === "carteira") list = data.groups?.portfolio || [];
    if (tab === "boleto") list = data.groups?.boletos || [];
    if (tab === "ticket") list = data.groups?.ticket || [];
    if (tab === "mix") list = data.groups?.mix || [];
    if (tab === "cotacoes") list = data.groups?.cotacoes || [];
    if (tab === "pagamento") list = data.groups?.pagamento || [];

    if (search.trim()) {
      const q = search.trim().toLowerCase();

      list = list.filter((action) =>
        [
          action.customer?.name,
          action.customer?.document,
          action.customer?.internalCode,
          action.orderNumber,
          action.reason,
          action.recommendation,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q)
      );
    }

    return list;
  }, [data, tab, search]);

  const topActions = useMemo(() => {
    return (data?.actions || [])
      .filter((action) => action.priority === "alta")
      .slice(0, 5);
  }, [data]);

  const goalTotal = useMemo(() => {
    return goals.reduce(
      (sum, goal) => sum + Number(goal.goal_amount || 0),
      0
    );
  }, [goals]);

  const daySales = Number(deliverySummary?.total_sales || 0);

  const workNow = useMemo(() => {
    const items: Array<{
      id: string;
      label: string;
      title: string;
      helper: string;
      href?: string;
      tone: "red" | "amber" | "blue" | "emerald";
    }> = [];

    activities.slice(0, 3).forEach((activity) => {
      items.push({
        id: `activity-${activity.id}`,
        label: formatTime(activity.scheduled_at),
        title: `${activity.title} — ${getActivityName(activity)}`,
        helper:
          activity.description || activityTypeLabel(activity.type),
        href: activity.customer?.id
          ? `/crm/dashboard/customers?customer=${activity.customer.id}`
          : undefined,
        tone: activity.priority === "alta" ? "red" : "blue",
      });
    });

    pendingOrders.slice(0, 2).forEach((order: any) => {
      items.push({
        id: `order-${order.id}`,
        label: "Pedido",
        title: `${
          order.customer_name || "Cliente"
        } tem entrega prevista`,
        helper: `Pedido ${order.order_number || "-"} • ${brl(
          Number(order.total || 0)
        )}`,
        href: `/crm/dashboard/orders?order=${order.id}`,
        tone: "amber",
      });
    });

    topActions.slice(0, 4).forEach((action) => {
      items.push({
        id: `action-${action.id}`,
        label: typeLabel(action.type),
        title:
          action.customer?.name ||
          action.title ||
          "Ação recomendada",
        helper:
          action.recommendation ||
          action.reason ||
          "Ação comercial recomendada pela IA.",
        href: action.customer?.id
          ? `/crm/dashboard/customers?customer=${action.customer.id}`
          : undefined,
        tone:
          action.priority === "alta" ? "red" : "emerald",
      });
    });

    return items.slice(0, 4);
  }, [activities, pendingOrders, topActions]);

  const assistantSummary = useMemo(() => {
    const highlights: string[] = [];

    if (portfolioSummary.critical) {
      highlights.push(
        `${portfolioSummary.critical} cliente(s) já passaram de 30 dias sem proteção.`
      );
    }

    if (portfolioSummary.d29) {
      highlights.push(
        `${portfolioSummary.d29} cliente(s) estão no D+29 e precisam de ação hoje.`
      );
    }

    if (portfolioSummary.expectedToday) {
      highlights.push(
        `${portfolioSummary.expectedToday} cliente(s) têm compra esperada hoje.`
      );
    }

    if (portfolioSummary.overdueHabit) {
      highlights.push(
        `${portfolioSummary.overdueHabit} cliente(s) atrasaram o padrão habitual de compra.`
      );
    }

    if (activities.length) {
      highlights.push(
        `${activities.length} retorno(s) estão agendados para hoje.`
      );
    }

    if (pendingOrders.length) {
      highlights.push(
        `${pendingOrders.length} pedido(s) precisam de acompanhamento de entrega.`
      );
    }

    if (data?.summary.boletos) {
      highlights.push(
        `${data.summary.boletos} boleto(s) exigem atenção comercial.`
      );
    }

    if (!highlights.length) {
      highlights.push("Nenhuma prioridade crítica identificada agora.");
    }

    return highlights.slice(0, 5);
  }, [
    activities.length,
    data?.summary.boletos,
    pendingOrders.length,
    portfolioSummary,
  ]);

  const filteredAgendaCustomers = useMemo(() => {
    const term = agendaCustomerSearch.trim().toLowerCase();

    if (!term) return agendaCustomers.slice(0, 40);

    return agendaCustomers
      .filter((customer) =>
        [
          customerDisplayName(customer),
          customer.legal_name,
          customer.internal_code,
          customer.erp_code,
          customer.whatsapp,
          customer.phone,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(term)
      )
      .slice(0, 40);
  }, [agendaCustomers, agendaCustomerSearch]);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f6f8fb_0%,#eef6f3_55%,#f8fafc_100%)] p-4 md:p-6">
      <section id="topo-assistente" className="rounded-[30px] border border-slate-200/80 bg-white/95 p-5 shadow-sm md:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-700">
              Copiloto Comercial
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 md:text-4xl">
              Inteligência para vender e proteger a carteira.
            </h1>
            <p className="mt-3 text-sm font-semibold leading-6 text-slate-500">
              A Central IA cruza pedidos reais, cotações, boletos,
              recorrência e ativações manuais do PMG para dizer quem
              precisa de ação agora — sem criar pedido fictício.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void load()}
                className="rounded-2xl bg-emerald-700 px-4 py-2.5 text-xs font-black text-white transition hover:bg-emerald-800"
              >
                Atualizar inteligência
              </button>
              <button
                type="button"
                onClick={() => openAgenda()}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-slate-700 transition hover:bg-slate-50"
              >
                + Próxima ação
              </button>
              <a
                href="#carteira-inteligente"
                className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs font-black text-blue-700 transition hover:bg-blue-100"
              >
                Ver proteção e recorrência
              </a>
            </div>
          </div>

          <div className="w-full rounded-3xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-5 xl:max-w-[360px]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-emerald-700">
                  Meta mensal
                </p>
                <strong className="mt-1 block text-2xl font-black text-slate-950">
                  {goalTotal ? brl(goalTotal) : "Sem meta"}
                </strong>
              </div>
              <span className="rounded-2xl bg-white px-3 py-2 text-xs font-black text-emerald-700 shadow-sm">
                IA ativa
              </span>
            </div>

            <div className="mt-4 h-3 overflow-hidden rounded-full bg-emerald-100">
              <div
                className="h-full rounded-full bg-emerald-700"
                style={{
                  width: goalTotal
                    ? `${Math.min(
                        100,
                        Math.round((daySales / goalTotal) * 100)
                      )}%`
                    : "0%",
                }}
              />
            </div>

            <p className="mt-3 text-xs font-bold leading-5 text-slate-600">
              Vendas da entrega selecionada:{" "}
              <strong className="text-slate-950">{brl(daySales)}</strong>.
              {goalTotal
                ? " A meta continua sendo acompanhada sem alterar sua regra atual."
                : " Cadastre a meta na tela de metas."}
            </p>
          </div>
        </div>
      </section>

      {loading ? (
        <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-6 text-sm font-black text-slate-600 shadow-sm">
          Atualizando pedidos, carteira, cotações e recorrência...
        </section>
      ) : null}

      <section className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <button
          type="button"
          onClick={() =>
            revealSection("carteira-inteligente", () =>
              setPortfolioOpen(true)
            )
          }
          className="group rounded-[22px] border border-orange-100 bg-gradient-to-br from-orange-50 to-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] font-black uppercase tracking-[0.16em] text-orange-700">
              🛡 Carteira
            </span>
            <strong className="text-xl font-black text-orange-700">
              {portfolioSummary.critical + portfolioSummary.d29}
            </strong>
          </div>
          <p className="mt-2 text-xs font-bold text-slate-600">
            D+29 e clientes críticos
          </p>
        </button>

        <button
          type="button"
          onClick={() =>
            revealSection("entregas-dia", () =>
              setDeliveryOpen(true)
            )
          }
          className="group rounded-[22px] border border-sky-100 bg-gradient-to-br from-sky-50 to-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] font-black uppercase tracking-[0.16em] text-sky-700">
              📦 Entregas
            </span>
            <strong className="text-xl font-black text-sky-700">
              {pendingOrders.length}
            </strong>
          </div>
          <p className="mt-2 text-xs font-bold text-slate-600">
            Pedidos aguardando acompanhamento
          </p>
        </button>

        <button
          type="button"
          onClick={() =>
            revealSection("retornos-hoje", () =>
              setActivitiesOpen(true)
            )
          }
          className="group rounded-[22px] border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-700">
              ↩ Retornos
            </span>
            <strong className="text-xl font-black text-indigo-700">
              {activities.length}
            </strong>
          </div>
          <p className="mt-2 text-xs font-bold text-slate-600">
            Compromissos comerciais de hoje
          </p>
        </button>

        <button
          type="button"
          onClick={() =>
            revealSection("acoes-central-ia", () =>
              setActionsOpen(true)
            )
          }
          className="group rounded-[22px] border border-teal-100 bg-gradient-to-br from-teal-50 to-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] font-black uppercase tracking-[0.16em] text-teal-700">
              ✦ Central IA
            </span>
            <strong className="text-xl font-black text-teal-700">
              {data?.summary.totalActions || 0}
            </strong>
          </div>
          <p className="mt-2 text-xs font-bold text-slate-600">
            Recomendações comerciais
          </p>
        </button>
      </section>

      <section
        id="prioridades-agora"
        className="mt-4 scroll-mt-24 rounded-[26px] border border-slate-200/80 bg-white/95 p-4 shadow-sm md:p-5"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-teal-700">
              O que fazer agora
            </p>
            <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950">
              Prioridades do vendedor
            </h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              Só o que precisa de atenção primeiro. O restante fica organizado nas seções abaixo.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setPriorityOpen((value) => !value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-black text-slate-700 transition hover:bg-slate-100"
          >
            {priorityOpen ? "Minimizar" : `Mostrar ${workNow.length} prioridade(s)`}
          </button>
        </div>

        {priorityOpen ? (
          <div className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="grid gap-2">
              {workNow.length ? (
                workNow.map((item) => {
                  const toneMap = {
                    red: "border-rose-100 bg-rose-50",
                    amber: "border-orange-100 bg-orange-50",
                    blue: "border-sky-100 bg-sky-50",
                    emerald: "border-teal-100 bg-teal-50",
                  };

                  return (
                    <div
                      key={item.id}
                      className={`rounded-[18px] border px-4 py-3 ${toneMap[item.tone]}`}
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
                              {item.label}
                            </span>
                            <strong className="truncate text-sm font-black text-slate-950">
                              {item.title}
                            </strong>
                          </div>
                          <p className="mt-1 line-clamp-1 text-[11px] font-semibold text-slate-600">
                            {item.helper}
                          </p>
                        </div>

                        {item.href ? (
                          <a
                            href={item.href}
                            className="shrink-0 rounded-xl bg-white px-3 py-2 text-[10px] font-black text-slate-700 shadow-sm"
                          >
                            Abrir
                          </a>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 p-5 text-xs font-bold text-slate-500">
                  Nenhuma ação imediata encontrada.
                </div>
              )}
            </div>

            <div className="rounded-[22px] border border-indigo-100 bg-gradient-to-br from-indigo-950 to-slate-900 p-4 text-white">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-200">
                Leitura do assistente
              </p>
              <h3 className="mt-1 text-lg font-black">
                Diagnóstico resumido
              </h3>

              <div className="mt-3 grid gap-2">
                {assistantSummary.map((line, index) => (
                  <div
                    key={`${line}-${index}`}
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-semibold leading-5 text-slate-100"
                  >
                    {line}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <section
        id="carteira-inteligente"
        className="mt-4 scroll-mt-24 rounded-[26px] border border-orange-100 bg-white/95 p-4 shadow-sm md:p-5"
      >
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-orange-700">
              🛡 Proteção de carteira
            </p>
            <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950">
              Clientes que precisam de proteção ou recompra
            </h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              D+29, 30+ dias e padrões de compra aparecem aqui sem misturar com boleto, entrega ou cotação.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-xl bg-rose-50 px-3 py-2 text-[11px] font-black text-rose-700">
              {portfolioSummary.critical} críticos
            </span>
            <span className="rounded-xl bg-orange-50 px-3 py-2 text-[11px] font-black text-orange-700">
              {portfolioSummary.d29} no D+29
            </span>
            <span className="rounded-xl bg-sky-50 px-3 py-2 text-[11px] font-black text-sky-700">
              {portfolioSummary.expectedToday} compra hoje
            </span>
            <button
              type="button"
              onClick={() => setPortfolioOpen((value) => !value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-black text-slate-700 transition hover:bg-slate-100"
            >
              {portfolioOpen ? "Minimizar" : "Abrir carteira"}
            </button>
          </div>
        </div>

        {portfolioOpen ? (
          <>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-[18px] border border-rose-100 bg-rose-50/70 px-4 py-3">
                <span className="text-[9px] font-black uppercase tracking-[0.14em] text-rose-500">
                  Críticos
                </span>
                <strong className="mt-1 block text-xl font-black text-rose-700">
                  {portfolioSummary.critical}
                </strong>
                <p className="text-[10px] font-bold text-rose-600">
                  30+ dias
                </p>
              </div>

              <div className="rounded-[18px] border border-orange-100 bg-orange-50/70 px-4 py-3">
                <span className="text-[9px] font-black uppercase tracking-[0.14em] text-orange-500">
                  D+29
                </span>
                <strong className="mt-1 block text-xl font-black text-orange-700">
                  {portfolioSummary.d29}
                </strong>
                <p className="text-[10px] font-bold text-orange-600">
                  Agir hoje
                </p>
              </div>

              <div className="rounded-[18px] border border-sky-100 bg-sky-50/70 px-4 py-3">
                <span className="text-[9px] font-black uppercase tracking-[0.14em] text-sky-500">
                  Compra esperada
                </span>
                <strong className="mt-1 block text-xl font-black text-sky-700">
                  {portfolioSummary.expectedToday}
                </strong>
                <p className="text-[10px] font-bold text-sky-600">
                  Hoje
                </p>
              </div>

              <div className="rounded-[18px] border border-violet-100 bg-violet-50/70 px-4 py-3">
                <span className="text-[9px] font-black uppercase tracking-[0.14em] text-violet-500">
                  Ritmo atrasado
                </span>
                <strong className="mt-1 block text-xl font-black text-violet-700">
                  {portfolioSummary.overdueHabit}
                </strong>
                <p className="text-[10px] font-bold text-violet-600">
                  Reposição pendente
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-2 lg:grid-cols-[1fr_250px_auto]">
              <input
                value={portfolioSearch}
                onChange={(event) => setPortfolioSearch(event.target.value)}
                placeholder="Buscar cliente, ID PMG, documento ou ritmo..."
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 outline-none transition focus:border-orange-300 focus:ring-4 focus:ring-orange-50"
              />

              <select
                value={portfolioFilter}
                onChange={(event) => setPortfolioFilter(event.target.value)}
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 outline-none"
              >
                {PORTFOLIO_FILTERS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => {
                  setPortfolioSearch("");
                  setPortfolioFilter("all");
                }}
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-[11px] font-black text-slate-700 transition hover:bg-slate-50"
              >
                Limpar
              </button>
            </div>

            <div className="mt-4 grid gap-2">
              {portfolioItems.length ? (
                portfolioItems.map((item) => (
                  <PortfolioCard
                    key={item.id}
                    item={item}
                    savingKey={portfolioSaving}
                    onOpenPmg={openPmg}
                    onRegister={registerPortfolioAction}
                    onSchedule={openAgenda}
                  />
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center">
                  <strong className="text-sm font-black text-slate-800">
                    Nenhum cliente neste filtro.
                  </strong>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Quando houver D+29, risco de carteira ou padrão forte de recompra, ele aparece aqui.
                  </p>
                </div>
              )}
            </div>
          </>
        ) : null}
      </section>

      <section id="entregas-dia" className="mt-4 scroll-mt-24 rounded-[26px] border border-sky-100 bg-white/95 p-4 shadow-sm md:p-5">
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-700">
              📦 Controle do dia
            </p>
            <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950">
              Entregas
            </h2>
            <p className="mt-1 max-w-2xl text-xs font-semibold text-slate-500">
              Acompanhe hoje ou amanhã sem poluir a visão principal.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setDeliveryDate(todayISO())}
              className={`rounded-xl px-3 py-2 text-[11px] font-black transition ${
                deliveryDate === todayISO()
                  ? "bg-sky-700 text-white"
                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              Hoje
            </button>
            <button
              onClick={() => setDeliveryDate(todayISO(1))}
              className={`rounded-xl px-3 py-2 text-[11px] font-black transition ${
                deliveryDate === todayISO(1)
                  ? "bg-sky-700 text-white"
                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              Amanhã
            </button>
            <button
              onClick={() => setDeliveryOpen((value) => !value)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-50"
            >
              {deliveryOpen ? "Minimizar" : "Mostrar"}
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-3">
          <div className="rounded-[18px] bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-black uppercase text-slate-400">
              {formatDateLabel(deliveryDate)}
            </p>
            <strong className="text-xl font-black text-slate-950">
              {deliverySummary?.total_orders || 0} pedidos
            </strong>
          </div>
          <div className="rounded-[18px] bg-teal-50 px-4 py-3">
            <p className="text-[11px] font-black uppercase text-emerald-700">
              Valor previsto
            </p>
            <strong className="text-xl font-black text-emerald-700">
              {brl(Number(deliverySummary?.total_sales || 0))}
            </strong>
          </div>
          <div className="rounded-2xl bg-amber-50 px-4 py-3">
            <p className="text-[11px] font-black uppercase text-amber-700">
              Pendentes
            </p>
            <strong className="text-xl font-black text-amber-700">
              {pendingOrders.length}
            </strong>
          </div>
        </div>

        {deliveryOpen ? (
          <div className="mt-5 grid gap-3">
            {visibleOrders.length ? (
              visibleOrders.map((order: any) => (
                <DeliveryRow
                  key={order.id}
                  order={order}
                  onUpdate={updateDeliveryStatus}
                />
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-sm font-bold text-slate-500">
                Nenhum pedido para a data selecionada.
              </div>
            )}

            {orders.length > 8 ? (
              <button
                type="button"
                onClick={() =>
                  setShowAllDeliveries((value) => !value)
                }
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-black text-slate-700"
              >
                {showAllDeliveries
                  ? "Mostrar menos"
                  : `Mostrar todos (${orders.length})`}
              </button>
            ) : null}
          </div>
        ) : null}
      </section>

      <section id="retornos-hoje" className="mt-4 scroll-mt-24 rounded-[26px] border border-indigo-100 bg-white/95 p-4 shadow-sm md:p-5">
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-700">
              ↩ Agenda comercial
            </p>
            <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950">
              Retornos de hoje <span className="text-indigo-600">({activities.length})</span>
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => openAgenda()}
              className="rounded-xl bg-indigo-700 px-3 py-2 text-[11px] font-black text-white transition hover:bg-indigo-800"
            >
              + Agendar
            </button>
            <button
              type="button"
              onClick={() => setActivitiesOpen((value) => !value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-black text-slate-700 transition hover:bg-slate-100"
            >
              {activitiesOpen ? "Minimizar" : "Mostrar retornos"}
            </button>
          </div>
        </div>

        {activitiesOpen ? (
          <div className="mt-4 grid gap-2">
          {activities.length ? (
            activities.map((activity) => {
              const phone = cleanPhone(
                activity.customer?.whatsapp ||
                  activity.customer?.phone ||
                  activity.phone ||
                  activity.lead?.phone
              );

              return (
                <article
                  key={activity.id}
                  className="rounded-2xl border border-blue-100 bg-blue-50 p-4"
                >
                  <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                    <div>
                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full border border-blue-200 bg-white px-3 py-1 text-[10px] font-black uppercase text-blue-700">
                          {activityTypeLabel(activity.type)}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-black uppercase text-slate-600">
                          {activity.priority || "média"}
                        </span>
                      </div>
                      <strong className="mt-3 block text-base font-black text-slate-950">
                        {activity.title}
                      </strong>
                      <p className="mt-1 text-sm font-bold text-slate-600">
                        {getActivityName(activity)} ·{" "}
                        {formatTime(activity.scheduled_at)}
                      </p>
                      {activity.description ? (
                        <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                          {activity.description}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {activity.customer?.id ? (
                        <a
                          href={`/crm/dashboard/customers?customer=${activity.customer.id}`}
                          className="rounded-xl border border-blue-200 bg-white px-3 py-2 text-[11px] font-black text-blue-700"
                        >
                          Cliente
                        </a>
                      ) : null}
                      {phone ? (
                        <a
                          href={`https://wa.me/${phone}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-xl bg-emerald-700 px-3 py-2 text-[11px] font-black text-white"
                        >
                          WhatsApp
                        </a>
                      ) : null}
                      <button
                        type="button"
                        onClick={() =>
                          void completeActivity(activity.id)
                        }
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-black text-slate-700"
                      >
                        Concluir
                      </button>
                    </div>
                  </div>
                </article>
              );
            })
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-sm font-bold text-slate-500">
              Nenhum retorno pendente para hoje.
            </div>
          )}
        </div>
        ) : null}
      </section>

      <section id="acoes-central-ia" className="mt-4 scroll-mt-24 rounded-[26px] border border-teal-100 bg-white/95 p-4 shadow-sm md:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-teal-700">
              ✦ Recomendações comerciais
            </p>
            <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950">
              Ações da Central IA <span className="text-teal-600">({data?.summary.totalActions || 0})</span>
            </h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              Abra somente quando quiser trabalhar as recomendações detalhadas.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setActionsOpen((value) => !value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-black text-slate-700 transition hover:bg-slate-100"
          >
            {actionsOpen ? "Minimizar" : "Abrir recomendações"}
          </button>
        </div>

        {actionsOpen ? (
          <>
            <div className="mt-4">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar cliente, ID, documento ou pedido..."
                className="h-10 w-full rounded-xl border border-slate-200 px-3 text-xs font-semibold outline-none focus:border-teal-400"
              />
            </div>

            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`whitespace-nowrap rounded-2xl px-4 py-2 text-xs font-black transition ${
                tab === item.id
                  ? "bg-slate-950 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === "supervisor" ? (
          <div className="mt-5 grid gap-3">
            {data?.supervisor?.sellers?.length ? (
              data.supervisor.sellers.map((seller) => (
                <div
                  key={seller.seller}
                  className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-4"
                >
                  <strong className="text-sm font-black text-slate-950">
                    {seller.seller}
                  </strong>
                  <span className="text-xs font-bold text-slate-600">
                    {seller.actions} ações
                  </span>
                  <span className="text-xs font-bold text-red-700">
                    {seller.highPriority} alta prioridade
                  </span>
                  <span className="text-xs font-black text-emerald-700">
                    {brl(Number(seller.potential || 0))}
                  </span>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-sm font-bold text-slate-500">
                Sem dados de supervisão para este perfil.
              </div>
            )}
          </div>
        ) : (
          <div className="mt-5 grid gap-4">
            {actions.length ? (
              actions.map((action) => (
                <ActionCard key={action.id} action={action} />
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm font-bold text-slate-500">
                Nenhuma ação encontrada neste filtro.
              </div>
            )}
          </div>
        )}
           </>
        ) : null}
      </section>
      {data?.whatsappSummary ? (
        <details className="mt-4 rounded-[24px] border border-teal-100 bg-teal-950 text-white shadow-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-teal-300">
                Resumo para WhatsApp
              </p>
              <p className="mt-1 text-xs font-semibold text-teal-100/80">
                Abra apenas quando quiser copiar o resumo do dia.
              </p>
            </div>
            <span className="rounded-xl bg-white/10 px-3 py-2 text-[10px] font-black text-white">
              Abrir
            </span>
          </summary>

          <div className="border-t border-white/10 px-4 pb-4">
            <pre className="mt-4 whitespace-pre-wrap font-sans text-xs font-semibold leading-5 text-teal-50">
              {data.whatsappSummary}
            </pre>
            <button
              type="button"
              onClick={() =>
                void copyText(data.whatsappSummary || "").then(
                  (copied) =>
                    copied
                      ? alert("Resumo copiado.")
                      : alert("Não foi possível copiar.")
                )
              }
              className="mt-3 rounded-xl bg-white px-3 py-2 text-[11px] font-black text-teal-950"
            >
              Copiar resumo
            </button>
          </div>
        </details>
      ) : null}

      {agendaOpen ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[30px] border border-slate-200 bg-white p-5 shadow-2xl md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-700">
                  Agenda comercial
                </p>
                <h2 className="mt-1 text-2xl font-black text-slate-950">
                  Nova próxima ação
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setAgendaOpen(false)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600"
              >
                Fechar
              </button>
            </div>

            <div className="mt-5 grid gap-4">
              <label className="grid gap-2">
                <span className="text-xs font-black text-slate-700">
                  Cliente
                </span>
                <input
                  value={agendaCustomerSearch}
                  onChange={(event) => {
                    setAgendaCustomerSearch(event.target.value);
                    if (
                      event.target.value !== agendaForm.customerName
                    ) {
                      setAgendaForm((current) => ({
                        ...current,
                        customerId: "",
                        customerName: "",
                      }));
                    }
                  }}
                  placeholder="Buscar nome, ID PMG ou telefone..."
                  className="h-11 rounded-2xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-blue-400"
                />
              </label>

              {agendaForm.customerId ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-800">
                  Selecionado: {agendaForm.customerName}
                </div>
              ) : (
                <div className="max-h-52 overflow-y-auto rounded-2xl border border-slate-200">
                  {agendaLoadingCustomers ? (
                    <div className="p-4 text-sm font-bold text-slate-500">
                      Carregando clientes...
                    </div>
                  ) : filteredAgendaCustomers.length ? (
                    filteredAgendaCustomers.map((customer) => (
                      <button
                        key={customer.id}
                        type="button"
                        onClick={() => {
                          const name = customerDisplayName(customer);
                          setAgendaForm((current) => ({
                            ...current,
                            customerId: customer.id,
                            customerName: name,
                          }));
                          setAgendaCustomerSearch(name);
                        }}
                        className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 text-left last:border-b-0 hover:bg-slate-50"
                      >
                        <span>
                          <strong className="block text-sm text-slate-900">
                            {customerDisplayName(customer)}
                          </strong>
                          <small className="font-bold text-slate-500">
                            ID{" "}
                            {customer.internal_code ||
                              customer.erp_code ||
                              "não informado"}
                          </small>
                        </span>
                        <span className="text-xs font-black text-blue-700">
                          Selecionar
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="p-4 text-sm font-bold text-slate-500">
                      Nenhum cliente encontrado.
                    </div>
                  )}
                </div>
              )}

              <label className="grid gap-2">
                <span className="text-xs font-black text-slate-700">
                  Título
                </span>
                <input
                  value={agendaForm.title}
                  onChange={(event) =>
                    setAgendaForm((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  className="h-11 rounded-2xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-blue-400"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-xs font-black text-slate-700">
                  Observação
                </span>
                <textarea
                  value={agendaForm.description}
                  onChange={(event) =>
                    setAgendaForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  rows={4}
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-blue-400"
                />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-xs font-black text-slate-700">
                    Data
                  </span>
                  <input
                    type="date"
                    value={agendaForm.date}
                    onChange={(event) =>
                      setAgendaForm((current) => ({
                        ...current,
                        date: event.target.value,
                      }))
                    }
                    className="h-11 rounded-2xl border border-slate-200 px-4 text-sm font-semibold"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-xs font-black text-slate-700">
                    Hora
                  </span>
                  <input
                    type="time"
                    value={agendaForm.time}
                    onChange={(event) =>
                      setAgendaForm((current) => ({
                        ...current,
                        time: event.target.value,
                      }))
                    }
                    className="h-11 rounded-2xl border border-slate-200 px-4 text-sm font-semibold"
                  />
                </label>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setAgendaOpen(false)}
                  className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={agendaSaving}
                  onClick={() => void saveAgenda()}
                  className="rounded-2xl bg-blue-700 px-5 py-3 text-sm font-black text-white disabled:opacity-60"
                >
                  {agendaSaving ? "Salvando..." : "Salvar próxima ação"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
