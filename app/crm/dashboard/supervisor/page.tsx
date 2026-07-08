"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Bot,
  CalendarDays,
  MessageCircle,
  RefreshCw,
  Search,
  Sparkles,
  Target,
  Users,
} from "lucide-react";

import { AskSupervisorAI } from "./components/AskSupervisorAI";
import { SupervisorHeaderV2 } from "./components/SupervisorHeaderV2";
import { SupervisorAIDiagnosisV2 } from "./components/SupervisorAIDiagnosisV2";
import { SupervisorCommandTableV2 } from "./components/SupervisorCommandTableV2";
import { SupervisorDrawerV2 } from "./components/SupervisorDrawerV2";
import { SupervisorGoalsModal } from "./components/SupervisorGoalsModal";

type Period = "today" | "week" | "15d" | "30d" | "month";

type Filter =
  | "todos"
  | "atencao"
  | "semPedido"
  | "semCotacao"
  | "semMensagem"
  | "semRadar"
  | "abaixoMeta";

const PERIOD_LABELS: Record<Period, string> = {
  today: "Hoje",
  week: "7 dias",
  "15d": "15 dias",
  "30d": "30 dias",
  month: "Este mês",
};

export default function SupervisorPage() {
  const [dashboard, setDashboard] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("month");
  const [filter, setFilter] = useState<Filter>("todos");
  const [search, setSearch] = useState("");
  const [selectedSeller, setSelectedSeller] = useState<any>(null);
  const [goalSeller, setGoalSeller] = useState<any>(null);

  async function loadDashboard() {
    try {
      setLoading(true);

      const response = await fetch(`/api/crm/supervisor/dashboard?period=${period}`, {
        cache: "no-store",
        headers: {
          "x-user-role": "SUPERVISOR",
          "x-company-id": localStorage.getItem("active_company_id") || "",
        },
      });

      const data = await response.json();
      setDashboard(data);
    } catch (error) {
      console.error("[SupervisorPage]", error);
      setDashboard(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, [period]);

  const sellers = useMemo(() => {
    let list = dashboard?.sellers || [];

    if (search.trim()) {
      const q = search.toLowerCase();

      list = list.filter((s: any) =>
        `${s.name} ${s.email}`.toLowerCase().includes(q)
      );
    }

    if (filter === "atencao") {
      list = list.filter(
        (s: any) =>
          Number(s.zentraIndex || 0) < 60 ||
          Number(s.customersWithoutContact || 0) > 0
      );
    }

    if (filter === "semPedido") {
      list = list.filter((s: any) => Number(s.orders || 0) === 0);
    }

    if (filter === "semCotacao") {
      list = list.filter((s: any) => Number(s.quotes || 0) === 0);
    }

    if (filter === "semMensagem") {
      list = list.filter((s: any) => Number(s.messagesSent || 0) === 0);
    }

    if (filter === "semRadar") {
      list = list.filter((s: any) => Number(s.radarViews || 0) === 0);
    }

    if (filter === "abaixoMeta") {
      list = list.filter((s: any) => Number(s.goalPercent || 0) < 70);
    }

    return list;
  }, [dashboard, search, filter]);

  const summary = useMemo(() => {
    const all = dashboard?.sellers || [];

    return {
      total: all.length,
      filtered: sellers.length,
      attention: all.filter(
        (s: any) =>
          Number(s.zentraIndex || 0) < 60 ||
          Number(s.customersWithoutContact || 0) > 0
      ).length,
      belowGoal: all.filter((s: any) => Number(s.goalPercent || 0) < 70).length,
      withoutMessage: all.filter((s: any) => Number(s.messagesSent || 0) === 0).length,
    };
  }, [dashboard, sellers]);

  if (loading) {
    return (
      <main className="flex h-[70vh] items-center justify-center bg-[#F4F8F3]">
        <div className="rounded-3xl border border-emerald-100 bg-white p-8 text-center shadow-sm">
          <RefreshCw className="mx-auto h-8 w-8 animate-spin text-[#118442]" />
          <p className="mt-4 text-sm font-bold text-slate-700">
            Carregando Central Supervisor...
          </p>
        </div>
      </main>
    );
  }

  if (!dashboard?.ok) {
    return (
      <main className="min-h-screen bg-[#F4F8F3] p-6">
        <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-red-700">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5" />

            <div>
              <h1 className="font-black">
                Não foi possível carregar a Central Supervisor.
              </h1>

              <p className="text-sm">
                Verifique empresa ativa, permissão ou endpoint.
              </p>
            </div>
          </div>

          <button
            onClick={loadDashboard}
            className="mt-5 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white"
          >
            Tentar novamente
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F4F8F3] p-4 sm:p-6">
      <div className="mx-auto max-w-[1600px] space-y-5">
        <SupervisorHeaderV2
          data={dashboard.header}
          kpis={dashboard.kpis}
          period={dashboard.period}
        />

        <section className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
          <SupervisorAIDiagnosisV2 data={dashboard.ai} />

          <div className="rounded-[28px] border border-[#D8EBDD] bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-[#E8F7EC] p-3 text-[#118442]">
                <Bot className="h-6 w-6" />
              </div>

              <div>
                <h2 className="text-xl font-black text-slate-950">
                  Pergunte à IA
                </h2>

                <p className="text-sm text-slate-500">
                  Faça perguntas sobre vendedores, metas, pedidos e riscos.
                </p>
              </div>
            </div>

            <div className="mt-5">
              <AskSupervisorAI dashboard={dashboard} />
            </div>
          </div>
        </section>

        <section className="rounded-[30px] border border-[#D8EBDD] bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-5 2xl:flex-row 2xl:items-center 2xl:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-[#E8F7EC] px-3 py-1 text-xs font-black uppercase tracking-wide text-[#118442]">
                <Sparkles className="h-3.5 w-3.5" />
                Controle operacional
              </div>

              <h2 className="mt-3 text-2xl font-black text-slate-950">
                Operação por vendedor
              </h2>

              <p className="mt-1 max-w-3xl text-sm text-slate-500">
                Veja em uma única visão quem vendeu, quem cotou, quem disparou mensagem,
                quem usou o Radar e quem precisa de acompanhamento agora.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <QuickStat icon={Users} label="Vendedores" value={summary.total} />
              <QuickStat icon={Target} label="Abaixo da meta" value={summary.belowGoal} />
              <QuickStat icon={MessageCircle} label="Sem mensagem" value={summary.withoutMessage} />
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-3.5 h-4 w-4 text-slate-400" />

              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar vendedor por nome ou e-mail..."
                className="w-full rounded-2xl border border-[#D8EBDD] bg-[#F8FBF8] py-3 pl-10 pr-4 text-sm font-semibold outline-none transition focus:border-[#118442] focus:bg-white"
              />
            </div>

            <div className="flex items-center gap-3">
              <div className="inline-flex items-center gap-2 rounded-2xl border border-[#D8EBDD] bg-white px-4 py-3 text-sm font-black text-slate-700">
                <CalendarDays className="h-4 w-4 text-[#118442]" />
                Período
              </div>

              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value as Period)}
                className="rounded-2xl border border-[#D8EBDD] bg-white px-4 py-3 text-sm font-black text-slate-700 outline-none focus:border-[#118442]"
              >
                <option value="today">Hoje</option>
                <option value="week">7 dias</option>
                <option value="15d">15 dias</option>
                <option value="30d">30 dias</option>
                <option value="month">Este mês</option>
              </select>
            </div>
          </div>

          <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
            <FilterButton label="Todos" value="todos" filter={filter} setFilter={setFilter} />
            <FilterButton label="Atenção IA" value="atencao" filter={filter} setFilter={setFilter} />
            <FilterButton label="Sem pedido" value="semPedido" filter={filter} setFilter={setFilter} />
            <FilterButton label="Sem cotação" value="semCotacao" filter={filter} setFilter={setFilter} />
            <FilterButton label="Sem mensagem" value="semMensagem" filter={filter} setFilter={setFilter} />
            <FilterButton label="Sem Radar" value="semRadar" filter={filter} setFilter={setFilter} />
            <FilterButton label="Abaixo da meta" value="abaixoMeta" filter={filter} setFilter={setFilter} />
          </div>

          <p className="mt-3 text-xs font-semibold text-slate-500">
            Mostrando {summary.filtered} de {summary.total} vendedores • {PERIOD_LABELS[period]}
          </p>
        </section>

        <SupervisorCommandTableV2
          sellers={sellers}
          onOpenSeller={setSelectedSeller}
          onEditGoal={setGoalSeller}
        />

        <SupervisorDrawerV2
          seller={selectedSeller}
          onClose={() => setSelectedSeller(null)}
        />

        <SupervisorGoalsModal
          seller={goalSeller}
          onClose={() => setGoalSeller(null)}
          onSaved={loadDashboard}
        />
      </div>
    </main>
  );
}

function FilterButton({ label, value, filter, setFilter }: any) {
  const active = filter === value;

  return (
    <button
      onClick={() => setFilter(value)}
      className={`shrink-0 rounded-full px-4 py-2 text-sm font-black transition ${
        active
          ? "bg-[#118442] text-white shadow-sm"
          : "border border-[#D8EBDD] bg-white text-slate-600 hover:bg-[#F4F8F3]"
      }`}
    >
      {label}
    </button>
  );
}

function QuickStat({ icon: Icon, label, value }: any) {
  return (
    <div className="rounded-2xl border border-[#D8EBDD] bg-[#F8FBF8] px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs font-black uppercase text-slate-500">{label}</p>
        <Icon className="h-4 w-4 text-[#118442]" />
      </div>

      <p className="mt-2 text-2xl font-black text-slate-950">
        {value}
      </p>
    </div>
  );
}
