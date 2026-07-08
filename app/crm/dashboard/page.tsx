"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import NextActionModal from "@/components/crm/next-action/NextActionModal";

const STAGES = [
  {
    key: "novo",
    label: "Novo lead",
    description: "Clientes e prospects que entraram no funil comercial.",
    color: "from-[#0f7a3a] to-[#16a34a]",
    dot: "bg-[#16a34a]",
    badge: "bg-green-50 text-green-700 border-green-200",
  },
  {
    key: "enviado",
    label: "Mensagem enviada",
    description: "Primeiro contato ou campanha enviada pelo WhatsApp.",
    color: "from-[#16a34a] to-[#65a30d]",
    dot: "bg-lime-500",
    badge: "bg-lime-50 text-lime-700 border-lime-200",
  },
  {
    key: "respondeu",
    label: "Cliente respondeu",
    description: "Clientes que responderam e precisam de atendimento rápido.",
    color: "from-[#0f7a3a] to-[#22c55e]",
    dot: "bg-emerald-500",
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  {
    key: "quer_agendar_entrevista",
    label: "Quer cotação",
    description: "Cliente demonstrou interesse e precisa receber proposta.",
    color: "from-[#f59e0b] to-[#d97706]",
    dot: "bg-amber-500",
    badge: "bg-amber-50 text-amber-700 border-amber-200",
  },
  {
    key: "entrevista_agendada",
    label: "Cotação enviada",
    description: "Cotação enviada aguardando retorno ou negociação.",
    color: "from-[#d71920] to-[#ef4444]",
    dot: "bg-red-500",
    badge: "bg-red-50 text-red-700 border-red-200",
  },
  {
    key: "campanha",
    label: "Em campanha",
    description: "Contato entrou em fluxo automático de disparos comerciais.",
    color: "from-[#0f7a3a] to-[#d71920]",
    dot: "bg-red-500",
    badge: "bg-rose-50 text-rose-700 border-rose-200",
  },
  {
    key: "reagendar_futuro",
    label: "Retomar depois",
    description: "Cliente com potencial para uma nova abordagem futura.",
    color: "from-[#64748b] to-[#0f7a3a]",
    dot: "bg-slate-500",
    badge: "bg-slate-50 text-slate-700 border-slate-200",
  },
  {
    key: "contratado",
    label: "Pedido fechado",
    description: "Venda fechada, pedido realizado ou cliente convertido.",
    color: "from-[#15803d] to-[#22c55e]",
    dot: "bg-green-600",
    badge: "bg-green-50 text-green-800 border-green-200",
  },
  {
    key: "sem_interesse",
    label: "Sem interesse agora",
    description: "Cliente não demonstrou interesse neste momento.",
    color: "from-[#94a3b8] to-[#64748b]",
    dot: "bg-slate-400",
    badge: "bg-gray-50 text-gray-600 border-gray-200",
  },
  {
    key: "nao_aprovado",
    label: "Perdido",
    description: "Negociação perdida, contato inválido ou oportunidade descartada.",
    color: "from-[#d71920] to-[#991b1b]",
    dot: "bg-red-700",
    badge: "bg-red-50 text-red-800 border-red-200",
  },
];

const LEGACY_STATUS_MAP: Record<string, string> = {
  respondido: "respondeu",
  interesse: "quer_agendar_entrevista",
  pedido: "entrevista_agendada",
  entrevista: "entrevista_agendada",
  entrevista_agendada: "entrevista_agendada",
  agendado: "entrevista_agendada",
  contratado: "contratado",
  aprovado: "contratado",
  finalizado: "contratado",
  reativar_futuro: "reagendar_futuro",
  banco_talentos: "reagendar_futuro",
  sem_interesse: "sem_interesse",
  nao_aprovado: "nao_aprovado",
};

function normalizeStatus(status?: string | null) {
  const value = String(status || "novo").trim();
  return LEGACY_STATUS_MAP[value] || value || "novo";
}

function getStage(status?: string | null) {
  const normalized = normalizeStatus(status);
  return STAGES.find((stage) => stage.key === normalized) || STAGES[0];
}

function getLastDate(lead: any) {
  return lead.last_message_at || lead.updated_at || lead.created_at;
}

function daysStopped(lead: any) {
  const date = getLastDate(lead);
  if (!date) return 0;

  const diff = Date.now() - new Date(date).getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

function formatDate(date: string) {
  if (!date) return "-";

  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "-";

  return parsed.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPhone(phone?: string | null) {
  if (!phone) return "-";

  const digits = String(phone).replace(/\D/g, "");

  if (digits.length >= 12 && digits.startsWith("55")) {
    return `+${digits}`;
  }

  return phone;
}

function shortText(text?: string | null, max = 90) {
  if (!text) return "";
  const value = String(text).trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
}

export default function DashboardPage() {
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedStage, setSelectedStage] = useState("todos");
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [nextActionOpen, setNextActionOpen] = useState(false);

  async function loadDashboard() {
    try {
      setLoading(true);

      const res = await fetch("/api/crm/leads", {
        cache: "no-store",
        credentials: "include",
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Erro ao carregar o funil comercial");
      }

      setLeads(Array.isArray(data) ? data : data.leads || []);
    } catch (error: any) {
      console.error("ERRO DASHBOARD:", error);
      alert("Erro ao carregar funil:\n\n" + (error.message || "Erro desconhecido"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();

    const interval = setInterval(() => {
      loadDashboard();
    }, 8000);

    return () => clearInterval(interval);
  }, []);

  const filteredLeads = useMemo(() => {
    const term = search.trim().toLowerCase();

    return leads.filter((lead) => {
      const stage = normalizeStatus(lead.status);

      if (selectedStage !== "todos" && stage !== selectedStage) {
        return false;
      }

      if (!term) return true;

      return [
        lead.name,
        lead.phone,
        lead.email,
        lead.city,
        lead.company,
        lead.last_message,
        lead.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [leads, search, selectedStage]);

  const grouped = useMemo(() => {
    const result: Record<string, any[]> = {};

    STAGES.forEach((stage) => {
      result[stage.key] = [];
    });

    filteredLeads.forEach((lead) => {
      const status = normalizeStatus(lead.status);
      const key = STAGES.some((stage) => stage.key === status) ? status : "novo";
      result[key].push(lead);
    });

    Object.keys(result).forEach((key) => {
      result[key].sort((a, b) => daysStopped(b) - daysStopped(a));
    });

    return result;
  }, [filteredLeads]);

  const stats = useMemo(() => {
    return {
      total: leads.length,
      novo: leads.filter((lead) => normalizeStatus(lead.status) === "novo").length,
      enviado: leads.filter((lead) => normalizeStatus(lead.status) === "enviado").length,
      respondeu: leads.filter((lead) => normalizeStatus(lead.status) === "respondeu").length,
      negociacao: leads.filter((lead) =>
        ["quer_agendar_entrevista", "entrevista_agendada"].includes(
          normalizeStatus(lead.status)
        )
      ).length,
      fechado: leads.filter((lead) => normalizeStatus(lead.status) === "contratado").length,
    };
  }, [leads]);

  async function moveLead(id: string, status: string) {
    try {
      setMovingId(id);

      const res = await fetch("/api/crm/leads/status", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          id,
          status,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Erro ao mover contato");
      }

      setLeads((current) =>
        current.map((lead) => (lead.id === id ? { ...lead, status } : lead))
      );
    } catch (error: any) {
      console.error("ERRO MOVE LEAD:", error);
      alert("Erro ao mover contato:\n\n" + (error.message || "Erro desconhecido"));
    } finally {
      setMovingId(null);
    }
  }

  function openLeadNextAction(lead: any) {
    setSelectedLead(lead);
    setNextActionOpen(true);
  }

  return (
    <main className="min-h-screen text-slate-900">
      <section className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto max-w-[1800px] px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-[#0f7a3a] to-[#d71920] text-sm font-black tracking-tight text-white shadow-lg shadow-red-900/10">
                  PMG
                </div>

                <div>
                  <p className="text-xs font-black uppercase tracking-[0.24em] text-[#0f7a3a]">
                    Zentra Sales AI
                  </p>
                  <h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-4xl">
                    Kanban Comercial
                  </h1>
                </div>
              </div>

              <p className="mt-2 max-w-3xl text-sm font-medium leading-relaxed text-slate-600">
                Controle leads, respostas, cotações, campanhas, pedidos e oportunidades do time comercial PMG.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <HeaderLink href="/crm/dashboard/contacts">Clientes</HeaderLink>
              <HeaderLink href="/crm/dashboard/inbox">Inbox</HeaderLink>
              <HeaderLink href="/crm/dashboard/messages">Mensagens IA</HeaderLink>
              <Link
                className="rounded-2xl bg-gradient-to-r from-[#0f7a3a] to-[#d71920] px-4 py-3 text-center text-sm font-black text-white shadow-lg shadow-red-900/15 transition hover:-translate-y-0.5 hover:brightness-105"
                href="/crm/dashboard/campaigns"
              >
                Campanhas
              </Link>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-[1fr_230px_150px]">
            <input
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400 shadow-sm focus:border-[#0f7a3a] focus:ring-4 focus:ring-green-100"
              placeholder="Buscar por cliente, telefone, e-mail, cidade, empresa ou última mensagem..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />

            <select
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 outline-none shadow-sm focus:border-[#0f7a3a] focus:ring-4 focus:ring-green-100"
              value={selectedStage}
              onChange={(event) => setSelectedStage(event.target.value)}
            >
              <option value="todos">Todos os status</option>

              {STAGES.map((stage) => (
                <option key={stage.key} value={stage.key}>
                  {stage.label}
                </option>
              ))}
            </select>

            <button
              className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-black text-[#0f7a3a] transition hover:bg-green-100 disabled:opacity-60"
              disabled={loading}
              onClick={loadDashboard}
              type="button"
            >
              {loading ? "Atualizando..." : "Atualizar"}
            </button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1800px] px-4 py-5 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <MetricCard title="Total no funil" value={stats.total} tone="green" />
          <MetricCard title="Novos leads" value={stats.novo} tone="green" />
          <MetricCard title="Mensagens enviadas" value={stats.enviado} tone="lime" />
          <MetricCard title="Responderam" value={stats.respondeu} tone="green" />
          <MetricCard title="Em negociação" value={stats.negociacao} tone="amber" />
          <MetricCard title="Pedidos fechados" value={stats.fechado} tone="red" />
        </div>
      </section>

      <section className="mx-auto max-w-[1800px] px-4 pb-8 sm:px-6 lg:px-8">
        <div className="overflow-x-auto pb-4">
          <div className="flex min-w-max gap-4">
            {STAGES.map((stage) => {
              const items = grouped[stage.key] || [];

              return (
                <div
                  key={stage.key}
                  className="w-[310px] shrink-0 overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-xl shadow-slate-900/5 sm:w-[350px]"
                >
                  <div className={`h-1.5 bg-gradient-to-r ${stage.color}`} />

                  <div className="border-b border-slate-100 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full ${stage.dot}`} />
                          <h2 className="text-base font-black text-slate-950">
                            {stage.label}
                          </h2>
                        </div>
                        <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">
                          {stage.description}
                        </p>
                      </div>

                      <span className={`rounded-full border px-2.5 py-1 text-xs font-black ${stage.badge}`}>
                        {items.length}
                      </span>
                    </div>
                  </div>

                  <div className="max-h-[calc(100vh-315px)] min-h-[440px] space-y-3 overflow-y-auto bg-slate-50/70 p-3">
                    {items.map((lead) => (
                      <LeadCard
                        key={lead.id}
                        lead={lead}
                        moving={movingId === lead.id}
                        onMove={moveLead}
                        onNextAction={() => openLeadNextAction(lead)}
                      />
                    ))}

                    {!items.length && (
                      <div className="grid min-h-[220px] place-items-center rounded-3xl border border-dashed border-slate-200 bg-white p-6 text-center">
                        <div>
                          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-green-50 text-xl font-black text-[#0f7a3a]">
                            +
                          </div>
                          <p className="text-sm font-bold text-slate-500">
                            Nenhum cliente aqui.
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            Quando o status mudar, o cliente aparecerá nesta coluna.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <NextActionModal
        open={nextActionOpen}
        onClose={() => setNextActionOpen(false)}
        source="lead"
        leadId={selectedLead?.id || null}
        name={selectedLead?.name || "Contato WhatsApp"}
        phone={selectedLead?.phone || null}
        onSaved={loadDashboard}
      />
    </main>
  );
}

function HeaderLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center text-sm font-black text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-green-200 hover:bg-green-50 hover:text-[#0f7a3a]"
      href={href}
    >
      {children}
    </Link>
  );
}

function MetricCard({
  title,
  value,
  tone,
}: {
  title: string;
  value: any;
  tone: "green" | "lime" | "amber" | "red";
}) {
  const toneMap = {
    green: "from-green-50 to-white text-[#0f7a3a] border-green-100",
    lime: "from-lime-50 to-white text-lime-700 border-lime-100",
    amber: "from-amber-50 to-white text-amber-700 border-amber-100",
    red: "from-red-50 to-white text-[#d71920] border-red-100",
  };

  return (
    <div className={`rounded-3xl border bg-gradient-to-br p-4 shadow-xl shadow-slate-900/5 ${toneMap[tone]}`}>
      <div className="text-[11px] font-black uppercase tracking-widest text-slate-500">
        {title}
      </div>
      <div className="mt-2 text-3xl font-black">{value}</div>
    </div>
  );
}

function LeadCard({
  lead,
  moving,
  onMove,
  onNextAction,
}: {
  lead: any;
  moving: boolean;
  onMove: (id: string, status: string) => void;
  onNextAction: () => void;
}) {
  const stage = getStage(lead.status);
  const stoppedDays = daysStopped(lead);

  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-4 shadow-lg shadow-slate-900/5 transition hover:-translate-y-0.5 hover:border-green-200 hover:shadow-xl">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-black text-slate-950">
            {lead.name || "Contato WhatsApp"}
          </h3>
          <p className="mt-1 text-xs font-bold text-slate-500">
            {formatPhone(lead.phone)}
          </p>
        </div>

        <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-black ${stage.badge}`}>
          {stage.label}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
          <span className="block text-[10px] font-black uppercase tracking-wider text-slate-400">
            Parado há
          </span>
          <strong className={stoppedDays >= 3 ? "text-amber-600" : "text-slate-700"}>
            {stoppedDays} dia(s)
          </strong>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
          <span className="block text-[10px] font-black uppercase tracking-wider text-slate-400">
            Atualizado
          </span>
          <strong className="text-slate-700">{formatDate(getLastDate(lead))}</strong>
        </div>
      </div>

      {normalizeStatus(lead.status) === "campanha" && (
        <div className="mt-3 rounded-2xl border border-red-100 bg-red-50 p-3 text-xs font-bold text-[#d71920]">
          Campanha comercial etapa {lead.campaign_step || 0}
        </div>
      )}

      {normalizeStatus(lead.status) === "reagendar_futuro" && (
        <div className="mt-3 rounded-2xl border border-green-100 bg-green-50 p-3 text-xs font-bold text-[#0f7a3a]">
          Retomar abordagem em oportunidade futura.
        </div>
      )}

      {lead.last_message && (
        <div className="mt-3 rounded-2xl border border-slate-100 bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
          {shortText(lead.last_message, 130)}
        </div>
      )}

      <div className="mt-4">
        <select
          disabled={moving}
          value={normalizeStatus(lead.status)}
          onChange={(event) => onMove(lead.id, event.target.value)}
          className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-800 outline-none disabled:opacity-50 focus:border-[#0f7a3a] focus:ring-4 focus:ring-green-100"
        >
          {STAGES.map((stage) => (
            <option key={stage.key} value={stage.key}>
              {stage.label}
            </option>
          ))}
        </select>
      </div>

      <Link
        href={`/crm/dashboard/inbox?leadId=${lead.id}`}
        className="mt-3 block rounded-2xl bg-gradient-to-r from-[#0f7a3a] to-[#d71920] px-3 py-2.5 text-center text-sm font-black text-white shadow-lg shadow-red-900/10 transition hover:brightness-105"
      >
        Abrir conversa
      </Link>

      <button
        type="button"
        onClick={onNextAction}
        className="mt-2 w-full rounded-2xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm font-black text-blue-700 transition hover:bg-blue-100"
      >
        📅 Próxima ação
      </button>
    </article>
  );
}
