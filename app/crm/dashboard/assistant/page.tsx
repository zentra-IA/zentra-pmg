"use client";

import { useEffect, useMemo, useState } from "react";

type Action = {
  id: string;
  type: "boleto" | "ticket" | "mix" | "pagamento" | string;
  title?: string;
  priority: "alta" | "media" | "baixa" | string;
  score?: number;
  customer?: {
    id?: string | null;
    internalCode?: string | null;
    name?: string;
    document?: string | null;
    sellerName?: string;
  };
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
  products?: Array<{
    code?: string;
    name: string;
    averageValue?: number;
  }>;
  message?: string;
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

const tabs = [
  { id: "prioridade", label: "Prioridade" },
  { id: "boleto", label: "Boletos" },
  { id: "ticket", label: "Ticket" },
  { id: "mix", label: "Mix perdido" },
  { id: "pagamento", label: "Pagamento" },
  { id: "supervisor", label: "Supervisor" },
];

function brl(value: number) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function todayISO(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
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

function formatTime(value?: string | null) {
  if (!value) return "Sem horário";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sem horário";

  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function priorityStyle(priority?: string) {
  const p = String(priority || "").toLowerCase();
  if (p === "alta") return "border-red-200 bg-red-50 text-red-700";
  if (p === "media") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function typeLabel(type?: string) {
  if (type === "boleto") return "Boleto";
  if (type === "ticket") return "Ticket";
  if (type === "mix") return "Mix";
  if (type === "pagamento") return "Pagamento";
  if (type === "cotacao") return "Cotação";
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

function getActivityPhone(activity: Activity) {
  return (
    activity.customer?.whatsapp ||
    activity.customer?.phone ||
    activity.phone ||
    activity.lead?.phone ||
    ""
  );
}

function cleanPhone(value?: string | null) {
  return String(value || "").replace(/\D/g, "");
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
      <p className="text-[11px] font-black uppercase tracking-[0.16em] opacity-70">{label}</p>
      <strong className="mt-2 block text-2xl font-black tracking-tight">{value}</strong>
      <p className="mt-1 text-xs font-bold opacity-70">{helper}</p>
    </div>
  );
}

function ActionCard({ action }: { action: Action }) {
  const [copied, setCopied] = useState(false);

  async function copyMessage() {
    await navigator.clipboard.writeText(action.message || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }

  const customerName = action.customer?.name || "Cliente não informado";

  const clientUrl = action.customer?.id
    ? `/crm/dashboard/customers?customer=${action.customer.id}`
    : `/crm/dashboard/customers?search=${encodeURIComponent(customerName)}`;

  const ordersUrl = action.orderId
    ? `/crm/dashboard/orders?order=${action.orderId}`
    : `/crm/dashboard/orders?search=${encodeURIComponent(customerName)}`;

  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-emerald-700">
              {typeLabel(action.type)}
            </span>
            <span className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] ${priorityStyle(action.priority)}`}>
              {action.priority || "média"}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-black text-slate-600">
              Score {Math.round(action.score || 0)}
            </span>
          </div>

          <h3 className="mt-3 text-xl font-black tracking-tight text-slate-950">{customerName}</h3>
          <p className="mt-1 text-xs font-bold text-slate-500">
            {action.customer?.internalCode ? `ID ${action.customer.internalCode}` : "Sem ID"}
            {action.customer?.document ? ` • ${action.customer.document}` : ""}
            {action.customer?.sellerName ? ` • Vendedor: ${action.customer.sellerName}` : ""}
          </p>
        </div>

        <div className="rounded-2xl bg-slate-50 px-4 py-3 text-right">
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Potencial</p>
          <p className="text-lg font-black text-emerald-700">
            {action.estimatedValueFormatted || action.valueFormatted || "—"}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">O que aconteceu</p>
          <p className="mt-2 text-sm font-bold leading-6 text-slate-800">{action.reason || "Sem diagnóstico detalhado."}</p>
        </div>

        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-emerald-700">Recomendação</p>
          <p className="mt-2 text-sm font-bold leading-6 text-emerald-950">{action.recommendation || "Fazer contato comercial."}</p>
        </div>
      </div>

      {action.type === "boleto" && (
        <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-bold text-red-900">
          Vencimento: {action.dueDate} {action.valueFormatted ? `• Valor: ${action.valueFormatted}` : ""}
        </div>
      )}

      {action.type === "ticket" && (
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-black text-slate-500">Atual</p>
            <p className="text-lg font-black text-slate-950">{action.currentTicketFormatted || "—"}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-black text-slate-500">Média</p>
            <p className="text-lg font-black text-slate-950">{action.averageTicketFormatted || "—"}</p>
          </div>
          <div className="rounded-2xl bg-red-50 p-4">
            <p className="text-xs font-black text-red-500">Queda</p>
            <p className="text-lg font-black text-red-700">{action.dropPercent || 0}%</p>
          </div>
        </div>
      )}

      {!!action.products?.length && (
        <div className="mt-4 rounded-2xl border border-slate-200 p-4">
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
            Produtos para trabalhar
          </p>
          <div className="mt-3 grid gap-2">
            {action.products.map((product) => (
              <div key={`${product.code}-${product.name}`} className="flex flex-col justify-between gap-1 rounded-2xl bg-slate-50 px-4 py-3 md:flex-row md:items-center">
                <span className="text-sm font-black text-slate-900">
                  {product.code ? `${product.code} • ` : ""}{product.name}
                </span>
                {product.averageValue ? (
                  <span className="text-sm font-black text-emerald-700">{brl(product.averageValue)}</span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}

      {action.message ? (
        <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
            Mensagem sugerida
          </p>
          <p className="mt-2 whitespace-pre-line text-sm font-semibold leading-6 text-slate-700">
            {action.message}
          </p>
        </div>
      ) : null}

      <div className="mt-5 flex flex-col gap-3 md:flex-row">
        {action.message ? (
          <button
            onClick={copyMessage}
            className="rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-emerald-800"
          >
            {copied ? "Mensagem copiada" : "Copiar mensagem WhatsApp"}
          </button>
        ) : null}

        <a
          href={clientUrl}
          className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-center text-sm font-black text-slate-800 transition hover:bg-slate-50"
        >
          Abrir cliente
        </a>
        <a
          href={ordersUrl}
          className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-center text-sm font-black text-slate-800 transition hover:bg-slate-50"
        >
          Ver pedidos
        </a>
      </div>
    </article>
  );
}

function ActivityMiniCard({ activity }: { activity: Activity }) {
  const name = getActivityName(activity);
  const phone = getActivityPhone(activity);

  return (
    <article className="rounded-3xl border border-blue-100 bg-white p-4 shadow-sm">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-blue-700">
              {activityTypeLabel(activity.type)}
            </span>
            <span className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] ${priorityStyle(activity.priority)}`}>
              {activity.priority || "média"}
            </span>
          </div>

          <h3 className="mt-3 text-base font-black tracking-tight text-slate-950">{activity.title}</h3>
          <p className="mt-1 text-sm font-bold text-slate-500">{name}</p>

          {activity.description ? (
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">{activity.description}</p>
          ) : null}
        </div>

        <div className="rounded-2xl bg-blue-50 px-4 py-3 text-center md:min-w-[104px]">
          <p className="text-[11px] font-black uppercase text-blue-500">Horário</p>
          <strong className="text-lg font-black text-blue-700">{formatTime(activity.scheduled_at)}</strong>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 md:flex-row">
        {activity.customer?.id ? (
          <a
            href={`/crm/dashboard/customers?customer=${activity.customer.id}`}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-center text-xs font-black text-slate-700 transition hover:bg-slate-50"
          >
            Abrir cliente
          </a>
        ) : null}

        {phone ? (
          <a
            href={`https://wa.me/${cleanPhone(phone)}`}
            target="_blank"
            className="rounded-2xl bg-emerald-700 px-4 py-2 text-center text-xs font-black text-white transition hover:bg-emerald-800"
          >
            Abrir WhatsApp
          </a>
        ) : null}
      </div>
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
      className={`rounded-3xl border p-4 ${
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
            Pedido {order.order_number || "-"} · {brl(Number(order.total || 0))} · Vendedor: {order.seller_name || "-"}
          </p>
          {order.commercial_notes ? (
            <p className="mt-1 text-xs font-bold text-red-700">{order.commercial_notes}</p>
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
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-50"
          >
            Ver pedido
          </a>
        </div>
      </div>
    </div>
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
  const [deliveryOpen, setDeliveryOpen] = useState(true);
  const [showAllDeliveries, setShowAllDeliveries] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [intelRes, deliveryRes, activitiesRes, goalsRes] = await Promise.all([
        fetch("/api/crm/customer-intelligence", { cache: "no-store" }),
        fetch(`/api/crm/delivery-summary?date=${deliveryDate}`, { cache: "no-store" }),
        fetch("/api/crm/customer-activities?scope=today", { cache: "no-store" }),
        fetch("/api/crm/goals", { cache: "no-store" }),
      ]);

      const intelJson = await intelRes.json();
      if (!intelRes.ok) throw new Error(intelJson?.error || "Erro ao carregar Central IA");
      setData(intelJson);

      const deliveryJson = await deliveryRes.json();
      if (deliveryRes.ok && !deliveryJson.error) setDeliverySummary(deliveryJson);
      else setDeliverySummary(null);

      const activitiesJson = await activitiesRes.json();
      if (activitiesRes.ok && !activitiesJson.error) setActivities(activitiesJson.activities || []);
      else setActivities([]);

      const goalsJson = await goalsRes.json();
      if (goalsRes.ok && !goalsJson.error) setGoals(goalsJson.goals || []);
      else setGoals([]);
    } catch (error: any) {
      alert(error?.message || "Erro ao carregar Central IA");
    } finally {
      setLoading(false);
    }
  }

  async function updateDeliveryStatus(order: any, status: "entregue" | "nao_entregue") {
    let commercial_notes: string | undefined;

    if (status === "nao_entregue") {
      const reason = window.prompt(`Por que o pedido ${order.order_number || ""} de ${order.customer_name || "cliente"} não foi entregue?`);
      if (!reason?.trim()) {
        alert("Informe o motivo para marcar como não entregue.");
        return;
      }

      commercial_notes = `Não entregue: ${reason.trim()}`;
    } else {
      const ok = confirm(`Marcar pedido ${order.order_number || ""} como entregue?`);
      if (!ok) return;
      commercial_notes = "Pedido marcado como entregue pela Central IA.";
    }

    const res = await fetch("/api/crm/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: order.id, status, commercial_notes }),
    });

    const response = await res.json();

    if (!res.ok) {
      alert(response.error || "Erro ao atualizar pedido.");
      return;
    }

    await load();
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryDate]);

  const orders = useMemo(() => {
    return (deliverySummary?.sellers || []).flatMap((seller: any) => seller.orders || []);
  }, [deliverySummary]);

  const pendingOrders = useMemo(() => {
    return orders.filter((order: any) => order.status !== "entregue" && order.status !== "nao_entregue");
  }, [orders]);

  const visibleOrders = showAllDeliveries ? orders : orders.slice(0, 8);

  const actions = useMemo(() => {
    if (!data) return [];

    let list: Action[] = data.actions || [];

    if (tab === "boleto") list = data.groups?.boletos || [];
    if (tab === "ticket") list = data.groups?.ticket || [];
    if (tab === "mix") list = data.groups?.mix || [];
    if (tab === "pagamento") list = data.groups?.pagamento || [];

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((a) => {
        return (
          a.customer?.name?.toLowerCase().includes(q) ||
          a.customer?.document?.toLowerCase().includes(q) ||
          a.customer?.internalCode?.toLowerCase().includes(q) ||
          a.orderNumber?.toLowerCase().includes(q)
        );
      });
    }

    return list;
  }, [data, tab, search]);

  const topActions = useMemo(() => {
    return (data?.actions || [])
      .filter((action) => action.priority === "alta")
      .slice(0, 4);
  }, [data]);

  const goalTotal = useMemo(() => {
    return goals.reduce((sum, goal) => sum + Number(goal.goal_amount || 0), 0);
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
        helper: activity.description || activityTypeLabel(activity.type),
        href: activity.customer?.id ? `/crm/dashboard/customers?customer=${activity.customer.id}` : undefined,
        tone: activity.priority === "alta" ? "red" : "blue",
      });
    });

    pendingOrders.slice(0, 2).forEach((order: any) => {
      items.push({
        id: `order-${order.id}`,
        label: "Pedido",
        title: `${order.customer_name || "Cliente"} tem entrega prevista`,
        helper: `Pedido ${order.order_number || "-"} • ${brl(Number(order.total || 0))}`,
        href: `/crm/dashboard/orders?order=${order.id}`,
        tone: "amber",
      });
    });

    topActions.slice(0, 3).forEach((action) => {
      items.push({
        id: `action-${action.id}`,
        label: typeLabel(action.type),
        title: action.customer?.name || action.title || "Ação recomendada",
        helper: action.recommendation || action.reason || "Ação comercial recomendada pela IA.",
        href: action.customer?.id ? `/crm/dashboard/customers?customer=${action.customer.id}` : undefined,
        tone: action.priority === "alta" ? "red" : "emerald",
      });
    });

    return items.slice(0, 6);
  }, [activities, pendingOrders, topActions]);

  const assistantSummary = useMemo(() => {
    const totalActions = data?.summary.totalActions || 0;
    const boletos = data?.summary.boletos || 0;
    const mix = data?.summary.mix || 0;
    const ticket = data?.summary.ticket || 0;

    const lines = [
      activities.length ? `Você tem ${activities.length} retorno(s) agendado(s) para hoje.` : "Nenhum retorno agendado para hoje.",
      pendingOrders.length ? `${pendingOrders.length} pedido(s) ainda precisam de acompanhamento.` : "Nenhum pedido pendente na agenda de entrega selecionada.",
      boletos ? `${boletos} boleto(s) exigem atenção comercial.` : "Nenhum boleto crítico identificado.",
      mix ? `${mix} cliente(s) com oportunidade de mix perdido.` : "Nenhum alerta forte de mix perdido no momento.",
      ticket ? `${ticket} cliente(s) com queda de ticket.` : "Nenhuma queda forte de ticket no momento.",
      totalActions ? `A IA encontrou ${totalActions} ação(ões) comerciais recomendadas.` : "A IA não encontrou ações críticas agora.",
    ];

    return lines;
  }, [activities.length, data, pendingOrders.length]);

  return (
    <main className="min-h-screen bg-[#f7f8fa] p-4 md:p-6">
      <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm md:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-700">
              Copiloto Comercial
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 md:text-4xl">
              Bom dia. Vamos organizar seu dia.
            </h1>
            <p className="mt-3 text-sm font-semibold leading-6 text-slate-500">
              A Central IA lê pedidos, boletos, mix, ticket, entregas e próximas ações para mostrar o que o vendedor precisa fazer agora.
            </p>
          </div>

          <div className="w-full rounded-3xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-5 xl:max-w-[360px]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-emerald-700">Meta mensal</p>
                <strong className="mt-1 block text-2xl font-black text-slate-950">
                  {goalTotal ? brl(goalTotal) : "Sem meta"}
                </strong>
              </div>
              <span className="rounded-2xl bg-white px-3 py-2 text-xs font-black text-emerald-700 shadow-sm">
                Supervisor
              </span>
            </div>

            <div className="mt-4 h-3 overflow-hidden rounded-full bg-emerald-100">
              <div
                className="h-full rounded-full bg-emerald-700"
                style={{ width: goalTotal ? `${Math.min(100, Math.round((daySales / goalTotal) * 100))}%` : "0%" }}
              />
            </div>

            <p className="mt-3 text-xs font-bold leading-5 text-slate-600">
              Vendas do dia selecionado: <strong className="text-slate-950">{brl(daySales)}</strong>.
              {goalTotal ? " A evolução mensal completa depende do endpoint de realizado mensal." : " Cadastre a meta na tela de metas."}
            </p>
          </div>
        </div>
      </section>

      {loading ? (
        <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-6 text-sm font-black text-slate-600 shadow-sm">
          Carregando inteligência comercial...
        </section>
      ) : null}

      {data ? (
        <>
          <section className="mt-5 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
              <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-red-700">
                    O que fazer agora
                  </p>
                  <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
                    Prioridades do vendedor
                  </h2>
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
                    Retornos, pedidos pendentes e ações comerciais mais importantes do dia.
                  </p>
                </div>

                <button
                  onClick={load}
                  className="rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-emerald-800"
                >
                  Atualizar
                </button>
              </div>

              <div className="mt-5 grid gap-3">
                {workNow.length ? (
                  workNow.map((item) => (
                    <a
                      key={item.id}
                      href={item.href || "#"}
                      className={`rounded-3xl border p-4 transition hover:-translate-y-0.5 hover:shadow-md ${
                        item.tone === "red"
                          ? "border-red-100 bg-red-50"
                          : item.tone === "amber"
                            ? "border-amber-100 bg-amber-50"
                            : item.tone === "blue"
                              ? "border-blue-100 bg-blue-50"
                              : "border-emerald-100 bg-emerald-50"
                      }`}
                    >
                      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                        <div>
                          <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
                            {item.label}
                          </span>
                          <h3 className="mt-1 text-base font-black text-slate-950">{item.title}</h3>
                          <p className="mt-1 text-sm font-bold leading-5 text-slate-600">{item.helper}</p>
                        </div>
                        <span className="rounded-2xl bg-white px-4 py-2 text-xs font-black text-slate-700 shadow-sm">
                          Abrir
                        </span>
                      </div>
                    </a>
                  ))
                ) : (
                  <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm font-bold text-slate-500">
                    Nenhuma prioridade crítica agora.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-[32px] border border-emerald-100 bg-emerald-50 p-5 shadow-sm md:p-6">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-700">
                Leitura da IA
              </p>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
                Diagnóstico rápido
              </h2>
              <div className="mt-5 grid gap-3">
                {assistantSummary.map((line) => (
                  <div key={line} className="rounded-2xl bg-white px-4 py-3 text-sm font-bold leading-6 text-slate-700 shadow-sm">
                    {line}
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <KpiCard label="Ações IA" value={data.summary.totalActions} helper="Clientes com recomendação" />
            <KpiCard label="Retornos" value={activities.length} helper="Agendados para hoje" tone="blue" />
            <KpiCard label="Entregas" value={deliverySummary?.total_orders || 0} helper="Dia selecionado" tone="amber" />
            <KpiCard label="Boletos" value={data.summary.boletos} helper="Vencendo em até 7 dias" tone="red" />
            <KpiCard label="Mix" value={data.summary.mix} helper="Produtos ausentes" tone="emerald" />
            <KpiCard label="Potencial" value={data.summary.potentialFormatted || "—"} helper="Estimado pela IA" tone="emerald" />
          </section>

          <section className="mt-5 rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-600">
                  Controle do dia
                </p>
                <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
                  Entregas
                </h2>
                <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-500">
                  Área colapsável para não poluir a tela quando houver muitos pedidos. Mostre hoje ou amanhã e abra a lista só quando precisar.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setDeliveryDate(todayISO())}
                  className={`rounded-2xl px-4 py-2 text-xs font-black transition ${
                    deliveryDate === todayISO()
                      ? "bg-slate-950 text-white"
                      : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  Hoje
                </button>
                <button
                  onClick={() => setDeliveryDate(todayISO(1))}
                  className={`rounded-2xl px-4 py-2 text-xs font-black transition ${
                    deliveryDate === todayISO(1)
                      ? "bg-slate-950 text-white"
                      : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  Amanhã
                </button>
                <button
                  onClick={() => setDeliveryOpen((v) => !v)}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-50"
                >
                  {deliveryOpen ? "Minimizar" : "Mostrar"}
                </button>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <p className="text-[11px] font-black uppercase text-slate-400">{formatDateLabel(deliveryDate)}</p>
                <strong className="text-xl font-black text-slate-950">{deliverySummary?.total_orders || 0} pedidos</strong>
              </div>
              <div className="rounded-2xl bg-emerald-50 px-4 py-3">
                <p className="text-[11px] font-black uppercase text-emerald-700">Valor previsto</p>
                <strong className="text-xl font-black text-emerald-700">{brl(Number(deliverySummary?.total_sales || 0))}</strong>
              </div>
              <div className="rounded-2xl bg-amber-50 px-4 py-3">
                <p className="text-[11px] font-black uppercase text-amber-700">Pendentes</p>
                <strong className="text-xl font-black text-amber-700">{pendingOrders.length}</strong>
              </div>
            </div>

            {deliveryOpen ? (
              <div className="mt-5 grid gap-3">
                {visibleOrders.map((order: any) => (
                  <DeliveryRow key={order.id} order={order} onUpdate={updateDeliveryStatus} />
                ))}

                {orders.length > 8 ? (
                  <button
                    onClick={() => setShowAllDeliveries((v) => !v)}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50"
                  >
                    {showAllDeliveries ? "Mostrar menos" : `Mostrar todos os ${orders.length} pedidos`}
                  </button>
                ) : null}

                {!orders.length ? (
                  <div className="rounded-3xl border border-dashed border-slate-200 p-6 text-center text-sm font-bold text-slate-400">
                    Nenhuma entrega prevista para {deliveryDate === todayISO() ? "hoje" : "amanhã"}.
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="mt-5 grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
            <div className="rounded-[32px] border border-blue-100 bg-blue-50 p-5 shadow-sm md:p-6">
              <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-700">
                    Próximas ações
                  </p>
                  <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
                    Agenda de hoje
                  </h2>
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                    Retornos cadastrados pelo vendedor no Kanban ou na ficha do cliente.
                  </p>
                </div>

                <div className="rounded-2xl bg-white px-5 py-4 text-center shadow-sm">
                  <p className="text-[11px] font-black uppercase text-blue-500">Atividades</p>
                  <strong className="text-3xl font-black text-blue-700">{activities.length}</strong>
                </div>
              </div>

              <div className="mt-5 grid gap-3">
                {activities.length ? (
                  activities.slice(0, 6).map((activity) => <ActivityMiniCard key={activity.id} activity={activity} />)
                ) : (
                  <div className="rounded-3xl border border-dashed border-blue-200 bg-white/70 p-6 text-center text-sm font-bold text-slate-500">
                    Nenhuma próxima ação para hoje.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-700">
                    Inteligência comercial
                  </p>
                  <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
                    Insights e mensagens prontas
                  </h2>
                </div>

                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar cliente, CNPJ, ID ou pedido..."
                  className="min-h-[44px] w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold outline-none transition focus:border-emerald-500 md:w-[340px]"
                />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {tabs.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setTab(item.id)}
                    className={`rounded-2xl px-4 py-2 text-xs font-black transition ${
                      tab === item.id
                        ? "bg-emerald-700 text-white shadow-sm"
                        : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {tab === "supervisor" ? (
                <div className="mt-5 grid gap-3">
                  {data.supervisor?.sellers?.length ? (
                    data.supervisor.sellers.map((seller) => (
                      <div key={seller.seller} className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-4 md:items-center">
                        <div>
                          <p className="text-sm font-black text-slate-950">{seller.seller}</p>
                          <p className="text-xs font-bold text-slate-500">Vendedor</p>
                        </div>
                        <div>
                          <p className="text-lg font-black text-slate-950">{seller.actions}</p>
                          <p className="text-xs font-bold text-slate-500">Ações</p>
                        </div>
                        <div>
                          <p className="text-lg font-black text-red-700">{seller.highPriority}</p>
                          <p className="text-xs font-bold text-slate-500">Alta prioridade</p>
                        </div>
                        <div>
                          <p className="text-lg font-black text-emerald-700">{brl(seller.potential)}</p>
                          <p className="text-xs font-bold text-slate-500">Potencial</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="rounded-2xl bg-slate-50 p-5 text-sm font-bold text-slate-500">
                      Nenhum vendedor com ação no momento.
                    </p>
                  )}
                </div>
              ) : (
                <div className="mt-5 grid gap-4">
                  {actions.length ? (
                    actions.map((action) => <ActionCard key={action.id} action={action} />)
                  ) : (
                    <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
                      <h3 className="text-xl font-black text-slate-950">Nenhuma ação encontrada</h3>
                      <p className="mt-2 text-sm font-semibold text-slate-500">
                        Não há clientes nessa categoria agora.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          {data.whatsappSummary ? (
            <section className="mt-5 rounded-3xl border border-emerald-100 bg-emerald-50 p-5 shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">
                Resumo para WhatsApp
              </p>
              <p className="mt-3 whitespace-pre-line text-sm font-bold leading-6 text-emerald-950">
                {data.whatsappSummary}
              </p>
              <button
                onClick={() => navigator.clipboard.writeText(data.whatsappSummary || "")}
                className="mt-4 rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-emerald-800"
              >
                Copiar resumo
              </button>
            </section>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
