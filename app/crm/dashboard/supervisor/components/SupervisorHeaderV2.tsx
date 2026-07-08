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

export function SupervisorHeaderV2({ data, kpis, period }: any) {
  const main = [
    {
      label: "Vendedores",
      value: data.sellers,
      icon: Users,
    },
    {
      label: "Vendido",
      value: data.revenueFormatted,
      icon: BarChart3,
    },
    {
      label: "Pedidos",
      value: data.orders,
      icon: ShoppingCart,
    },
    {
      label: "Cotações",
      value: data.quotes,
      icon: FileText,
    },
    {
      label: "Mensagens",
      value: data.messagesSent,
      icon: MessageCircle,
    },
    {
      label: "Radar",
      value: data.radarViews,
      icon: Radar,
    },
    {
      label: "% Meta",
      value: `${data.goalPercent}%`,
      icon: Target,
    },
    {
      label: "Alertas IA",
      value: data.aiAlerts,
      icon: AlertTriangle,
      danger: true,
    },
  ];

  return (
    <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-slate-950 text-white shadow-xl">
      <div className="bg-[radial-gradient(circle_at_top_right,#16a34a33,transparent_35%),linear-gradient(135deg,#020617,#0f172a)] p-6">
        <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-400">
              Central Supervisor • {period?.label || "Período"}
            </p>

            <h1 className="mt-2 text-3xl font-black tracking-tight">
              Comando comercial da equipe
            </h1>

            <p className="mt-2 max-w-3xl text-sm text-slate-300">
              Uma visão única para acompanhar vendas, mensagens, cotações, Radar, clientes e metas de todos os vendedores.
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm font-bold text-emerald-200">
            IA monitorando a operação em tempo real
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          {main.map((item) => {
            const Icon = item.icon;

            return (
              <div
                key={item.label}
                className={`rounded-2xl border p-4 ${
                  item.danger
                    ? "border-red-400/20 bg-red-400/10"
                    : "border-white/10 bg-white/10"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase text-slate-300">
                    {item.label}
                  </span>

                  <Icon className={item.danger ? "h-4 w-4 text-red-300" : "h-4 w-4 text-emerald-300"} />
                </div>

                <div className="mt-3 truncate text-xl font-black">
                  {item.value}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Mini label="Ticket médio" value={kpis.averageTicketFormatted} />
          <Mini label="Clientes" value={kpis.customers} />
          <Mini label="Clientes sem contato" value={kpis.customersWithoutContact} danger />
          <Mini label="Taxa resposta" value={`${kpis.messageResponseRate}%`} />
        </div>
      </div>
    </section>
  );
}

function Mini({ label, value, danger }: any) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className={danger ? "mt-1 text-lg font-black text-red-300" : "mt-1 text-lg font-black text-white"}>
        {value}
      </p>
    </div>
  );
}