import {
  AlertTriangle,
  BarChart3,
  FileText,
  MessageCircle,
  Radar,
  ShoppingCart,
  Target,
  Users,
} from "lucide-react";

export function CommandHeader({ data, kpis, period }: any) {
  const cards = [
    ["Vendedores", data.sellers, Users],
    ["Vendido", data.revenueFormatted, BarChart3],
    ["Pedidos", data.orders, ShoppingCart],
    ["Cotações", data.quotes, FileText],
    ["Mensagens", data.messagesSent, MessageCircle],
    ["Radar", data.radarViews, Radar],
    ["% Meta", `${data.goalPercent}%`, Target],
    ["Alertas IA", data.aiAlerts, AlertTriangle],
  ];

  return (
    <section className="overflow-hidden rounded-[36px] bg-[#062017] text-white shadow-xl ring-1 ring-emerald-900/20">
      <div className="relative p-5 sm:p-7">
        <div className="absolute right-0 top-0 h-64 w-64 rounded-full bg-emerald-400/20 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-52 w-52 rounded-full bg-lime-300/10 blur-3xl" />

        <div className="relative flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-300">
              Zentra Command Center™ • {period?.label}
            </p>

            <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">
              Centro de Comando Comercial
            </h1>

            <p className="mt-3 max-w-3xl text-sm font-medium leading-relaxed text-emerald-50/70">
              Supervisão premium para acompanhar vendas, metas, pedidos,
              mensagens, Radar, clientes, comissões e oportunidades da equipe.
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm font-black text-emerald-200">
            IA operacional ativa
          </div>
        </div>

        <div className="relative mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          {cards.map(([label, value, Icon]: any) => (
            <div
              key={label}
              className="rounded-3xl border border-white/10 bg-white/10 p-4 backdrop-blur-md transition hover:bg-white/15"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase text-emerald-50/60">
                  {label}
                </span>

                <Icon className="h-4 w-4 text-emerald-300" />
              </div>

              <div className="mt-4 truncate text-2xl font-black">
                {value}
              </div>
            </div>
          ))}
        </div>

        <div className="relative mt-4 grid gap-3 sm:grid-cols-3">
          <Mini label="Ticket médio" value={kpis.averageTicketFormatted} />
          <Mini label="Taxa resposta" value={`${kpis.messageResponseRate}%`} />
          <Mini
            label="Clientes sem contato"
            value={data.customersWithoutContact}
            danger
          />
        </div>
      </div>
    </section>
  );
}

function Mini({ label, value, danger }: any) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 px-4 py-4">
      <p className="text-xs font-bold text-emerald-50/50">
        {label}
      </p>

      <p
        className={
          danger
            ? "mt-1 text-xl font-black text-red-300"
            : "mt-1 text-xl font-black text-white"
        }
      >
        {value}
      </p>
    </div>
  );
}