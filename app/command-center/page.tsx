"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  RefreshCw,
  Search,
  SlidersHorizontal,
  TrendingUp,
  Users,
  AlertTriangle,
  MessageCircle,
  ShoppingCart,
} from "lucide-react";

import { CommandHeader } from "./components/CommandHeader";
import { CommandAIDiagnosis } from "./components/CommandAIDiagnosis";
import { SellerCommandTable } from "./components/SellerCommandTable";
import { SellerDrawer } from "./components/SellerDrawer";
import { AskCommandAI } from "./components/AskCommandAI";
import { GoalCommissionModal } from "./components/GoalCommissionModal";

type Period = "today" | "week" | "15d" | "30d" | "month";
type Filter =
  | "todos"
  | "atencao"
  | "semPedido"
  | "semCotacao"
  | "semMensagem"
  | "semRadar"
  | "abaixoMeta";

export default function CommandCenterPage() {
  const [dashboard, setDashboard] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("month");
  const [filter, setFilter] = useState<Filter>("todos");
  const [search, setSearch] = useState("");
  const [selectedSeller, setSelectedSeller] = useState<any>(null);
  const [settingsSeller, setSettingsSeller] = useState<any>(null);

  async function loadDashboard() {
    try {
      setLoading(true);

      const response = await fetch(
        `/api/command-center/dashboard?period=${period}`,
        {
          cache: "no-store",
          headers: {
            "x-user-role": "SUPERVISOR",
            "x-company-id": localStorage.getItem("active_company_id") || "",
          },
        }
      );

      const data = await response.json();
      setDashboard(data);
    } catch (error) {
      console.error("[CommandCenterPage]", error);
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

      list = list.filter((seller: any) =>
        `${seller.name} ${seller.email}`.toLowerCase().includes(q)
      );
    }

    if (filter === "atencao") {
      list = list.filter(
        (s: any) =>
          s.zentraIndex < 60 ||
          s.orders === 0 ||
          s.quotes === 0 ||
          s.messagesSent === 0 ||
          s.radarViews === 0 ||
          s.customersWithoutContact > 0
      );
    }

    if (filter === "semPedido") list = list.filter((s: any) => s.orders === 0);
    if (filter === "semCotacao") list = list.filter((s: any) => s.quotes === 0);
    if (filter === "semMensagem") list = list.filter((s: any) => s.messagesSent === 0);
    if (filter === "semRadar") list = list.filter((s: any) => s.radarViews === 0);
    if (filter === "abaixoMeta") list = list.filter((s: any) => s.goalPercent < 70);

    return list;
  }, [dashboard, search, filter]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f4f8f5]">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="h-9 w-9 animate-spin text-emerald-600" />
          <p className="text-sm font-semibold text-slate-500">
            Carregando Centro de Comando...
          </p>
        </div>
      </main>
    );
  }

  if (!dashboard?.ok) {
    return (
      <main className="min-h-screen bg-[#f4f8f5] p-6">
        <div className="rounded-[28px] border border-red-200 bg-red-50 p-6 text-red-700">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5" />

            <div>
              <h1 className="font-black">
                Não foi possível carregar o Command Center.
              </h1>
              <p className="text-sm">
                Verifique empresa ativa, permissão ou API.
              </p>
            </div>
          </div>

          <button
            onClick={loadDashboard}
            className="mt-5 rounded-2xl bg-red-600 px-4 py-3 text-sm font-black text-white"
          >
            Tentar novamente
          </button>
        </div>
      </main>
    );
  }

  const bestSeller = [...(dashboard.sellers || [])].sort(
    (a: any, b: any) => b.sold - a.sold
  )[0];

  const sellersWithoutOrders = (dashboard.sellers || []).filter(
    (s: any) => s.orders === 0
  ).length;

  const sellersBelowGoal = (dashboard.sellers || []).filter(
    (s: any) => s.goalPercent < 70
  ).length;

  return (
    <main className="min-h-screen bg-[#f4f8f5] p-3 sm:p-6">
      <div className="mx-auto max-w-[1600px] space-y-5">
        <CommandHeader
          data={dashboard.header}
          kpis={dashboard.kpis}
          period={dashboard.period}
        />

        <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-[32px] border border-emerald-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-700">
                  Leitura executiva
                </p>

                <h2 className="mt-1 text-2xl font-black text-slate-950">
                  Bom dia, Leandro.
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  A operação foi analisada e os principais pontos já estão destacados.
                </p>
              </div>

              <div className="hidden rounded-2xl bg-emerald-50 p-3 text-emerald-700 sm:block">
                <TrendingUp className="h-5 w-5" />
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <ExecutiveCard
                icon={ShoppingCart}
                label="Pedidos no período"
                value={dashboard.header.orders}
                tone="emerald"
              />

              <ExecutiveCard
                icon={Users}
                label="Vendedores monitorados"
                value={dashboard.header.sellers}
                tone="slate"
              />

              <ExecutiveCard
                icon={AlertTriangle}
                label="Abaixo da meta"
                value={sellersBelowGoal}
                tone="amber"
              />

              <ExecutiveCard
                icon={MessageCircle}
                label="Sem pedido"
                value={sellersWithoutOrders}
                tone="red"
              />
            </div>

            {bestSeller && (
              <div className="mt-5 rounded-3xl bg-gradient-to-br from-emerald-950 to-emerald-800 p-5 text-white">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-200">
                  Destaque comercial
                </p>

                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h3 className="text-2xl font-black">
                      {bestSeller.name}
                    </h3>

                    <p className="text-sm text-emerald-100/80">
                      Lidera com {bestSeller.soldFormatted}, {bestSeller.orders} pedido(s)
                      e Índice Zentra {bestSeller.zentraIndex}.
                    </p>
                  </div>

                  <button
                    onClick={() => setSelectedSeller(bestSeller)}
                    className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-emerald-900"
                  >
                    Ver vendedor
                  </button>
                </div>
              </div>
            )}
          </div>

          <AskCommandAI dashboard={dashboard} />
        </section>

        <CommandAIDiagnosis data={dashboard.ai} />

        <section className="rounded-[32px] border border-emerald-100 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">
                Operação em escala
              </p>

              <h2 className="mt-1 text-2xl font-black text-slate-950">
                Vendedores
              </h2>

              <p className="text-sm text-slate-500">
                Busque, filtre e clique para abrir a visão completa do vendedor.
              </p>
            </div>

            <div className="flex flex-col gap-3 lg:flex-row">
              <div className="relative">
                <Search className="absolute left-4 top-3.5 h-4 w-4 text-slate-400" />

                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar vendedor..."
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm font-semibold outline-none focus:border-emerald-500 lg:w-80"
                />
              </div>

              <div className="relative">
                <CalendarDays className="absolute left-4 top-3.5 h-4 w-4 text-slate-400" />

                <select
                  value={period}
                  onChange={(e) => setPeriod(e.target.value as Period)}
                  className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm font-black outline-none lg:w-44"
                >
                  <option value="today">Hoje</option>
                  <option value="week">7 dias</option>
                  <option value="15d">15 dias</option>
                  <option value="30d">30 dias</option>
                  <option value="month">Este mês</option>
                </select>
              </div>
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
        </section>

        <SellerCommandTable
          sellers={sellers}
          onOpenSeller={setSelectedSeller}
          onEditSettings={setSettingsSeller}
        />

        <SellerDrawer
          seller={selectedSeller}
          onClose={() => setSelectedSeller(null)}
        />

        <GoalCommissionModal
          seller={settingsSeller}
          onClose={() => setSettingsSeller(null)}
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
      className={`inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-black transition ${
        active
          ? "bg-emerald-700 text-white shadow"
          : "border border-emerald-100 bg-white text-slate-600 hover:bg-emerald-50"
      }`}
    >
      <SlidersHorizontal className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function ExecutiveCard({ icon: Icon, label, value, tone }: any) {
  const tones: any = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    red: "bg-red-50 text-red-700 border-red-100",
    slate: "bg-slate-50 text-slate-700 border-slate-100",
  };

  return (
    <div className={`rounded-3xl border p-4 ${tones[tone]}`}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-black uppercase">{label}</p>
        <Icon className="h-5 w-5" />
      </div>

      <p className="mt-4 text-3xl font-black">
        {value}
      </p>
    </div>
  );
}