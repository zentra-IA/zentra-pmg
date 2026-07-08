import {
  X,
  User,
  Target,
  ShoppingCart,
  FileText,
  MessageCircle,
  Radar,
  Users,
  AlertTriangle,
  Activity,
  Package,
  CreditCard,
} from "lucide-react";

export function SupervisorDrawerV2({
  seller,
  onClose,
}: {
  seller: any | null;
  onClose: () => void;
}) {
  if (!seller) return null;

  const kanbanEntries = Object.entries(seller.kanban || {});

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
        onClick={onClose}
      />

      <aside className="absolute right-0 top-0 h-full w-full max-w-3xl overflow-y-auto bg-[#F6F8FB] shadow-2xl">
        <div className="sticky top-0 z-20 border-b bg-white/95 p-5 backdrop-blur">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-600">
                Visão individual
              </p>

              <h2 className="mt-1 text-2xl font-black text-slate-950">
                {seller.name}
              </h2>

              <p className="text-sm text-slate-500">
                {seller.email}
              </p>
            </div>

            <button
              onClick={onClose}
              className="rounded-2xl border border-slate-200 bg-white p-2 hover:bg-slate-50"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="space-y-5 p-5">
          <section className="rounded-[28px] bg-slate-950 p-6 text-white">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-slate-400">
                  Índice Zentra™
                </p>

                <h3 className="mt-1 text-5xl font-black">
                  {seller.zentraIndex}
                </h3>
              </div>

              <div className="text-right">
                <p className="text-sm text-slate-400">
                  Meta atingida
                </p>

                <p className="mt-1 text-3xl font-black text-emerald-300">
                  {seller.goalPercent}%
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <DarkMetric label="Vendido" value={seller.soldFormatted} />
              <DarkMetric label="Meta" value={seller.goalFormatted} />
              <DarkMetric label="Ticket médio" value={seller.averageTicketFormatted} />
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MiniCard icon={ShoppingCart} label="Pedidos" value={seller.orders} danger={seller.orders === 0} />
            <MiniCard icon={FileText} label="Cotações" value={seller.quotes} danger={seller.quotes === 0} />
            <MiniCard icon={MessageCircle} label="Mensagens" value={seller.messagesSent} danger={seller.messagesSent === 0} />
            <MiniCard icon={Radar} label="Radar" value={seller.radarViews} danger={seller.radarViews === 0} />
            <MiniCard icon={Users} label="Clientes" value={seller.customers} />
            <MiniCard icon={AlertTriangle} label="Sem contato" value={seller.customersWithoutContact} danger={seller.customersWithoutContact > 0} />
            <MiniCard icon={CreditCard} label="Boletos atraso" value={seller.boletoOverdue || 0} danger={(seller.boletoOverdue || 0) > 0} />
            <MiniCard icon={Package} label="Mix produtos" value={seller.productMix || 0} />
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700">
                <Activity className="h-5 w-5" />
              </div>

              <div>
                <h3 className="text-lg font-black text-slate-950">
                  Diagnóstico IA do vendedor
                </h3>

                <p className="text-sm text-slate-500">
                  Pontos que exigem atenção do supervisor.
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {(seller.insights || []).map((item: string, index: number) => (
                <div
                  key={index}
                  className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm font-medium leading-relaxed text-slate-700"
                >
                  {item}
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-black text-slate-950">
              Kanban comercial
            </h3>

            <p className="text-sm text-slate-500">
              Distribuição dos leads por etapa comercial.
            </p>

            {kanbanEntries.length === 0 ? (
              <div className="mt-4 rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">
                Nenhum lead encontrado no período.
              </div>
            ) : (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {kanbanEntries.map(([label, value]) => (
                  <div
                    key={label}
                    className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 p-4"
                  >
                    <span className="text-sm font-bold text-slate-700">
                      {label}
                    </span>

                    <span className="rounded-full bg-white px-3 py-1 text-sm font-black text-slate-950">
                      {String(value)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-lg font-black text-slate-950">
                Mensagens
              </h3>

              <div className="mt-4 space-y-3">
                <Line label="Disparadas" value={seller.messagesSent} />
                <Line label="Respondidas" value={seller.messagesAnswered} />
                <Line label="Não respondidas" value={seller.messagesNotAnswered} />
                <Line label="Taxa de resposta" value={`${seller.messageResponseRate}%`} />
              </div>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-lg font-black text-slate-950">
                Clientes
              </h3>

              <div className="mt-4 space-y-3">
                <Line label="Total" value={seller.customers} />
                <Line label="Ativos" value={seller.customersActive} />
                <Line label="Em risco" value={seller.customersRisk} />
                <Line label="Inativos" value={seller.customersInactive} />
                <Line label="Sem contato" value={seller.customersWithoutContact} />
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-black text-slate-950">
              Últimos pedidos
            </h3>

            <div className="mt-4 space-y-3">
              {(seller.recentOrders || []).length === 0 ? (
                <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
                  Nenhum pedido encontrado no período.
                </p>
              ) : (
                seller.recentOrders.map((order: any) => (
                  <div
                    key={order.id}
                    className="rounded-2xl border border-slate-100 bg-slate-50 p-4"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-black text-slate-950">
                          {order.customer_name || "Cliente"}
                        </p>

                        <p className="text-xs text-slate-500">
                          {order.delivery_date
                            ? new Date(order.delivery_date).toLocaleDateString("pt-BR")
                            : order.created_at
                            ? new Date(order.created_at).toLocaleDateString("pt-BR")
                            : ""}
                        </p>
                      </div>

                      <p className="font-black text-emerald-700">
                        {Number(order.total || 0).toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-black text-slate-950">
              Últimas atividades
            </h3>

            <div className="mt-4 space-y-3">
              {(seller.recentActivities || []).length === 0 ? (
                <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
                  Nenhuma atividade registrada no período.
                </p>
              ) : (
                seller.recentActivities.map((activity: any) => (
                  <div
                    key={activity.id}
                    className="rounded-2xl border border-slate-100 bg-slate-50 p-4"
                  >
                    <p className="font-black text-slate-950">
                      {activity.title || activity.type || "Atividade"}
                    </p>

                    <p className="text-xs text-slate-500">
                      {activity.created_at
                        ? new Date(activity.created_at).toLocaleString("pt-BR")
                        : ""}
                    </p>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}

function DarkMetric({ label, value }: any) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-2 text-lg font-black text-white">{value}</p>
    </div>
  );
}

function MiniCard({ icon: Icon, label, value, danger }: any) {
  return (
    <div
      className={`rounded-[22px] border p-4 shadow-sm ${
        danger
          ? "border-red-100 bg-red-50"
          : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-slate-500">
          {label}
        </p>

        <Icon className={danger ? "h-4 w-4 text-red-600" : "h-4 w-4 text-emerald-600"} />
      </div>

      <p className={danger ? "mt-3 text-2xl font-black text-red-700" : "mt-3 text-2xl font-black text-slate-950"}>
        {value}
      </p>
    </div>
  );
}

function Line({ label, value }: any) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
      <span className="text-sm font-semibold text-slate-600">
        {label}
      </span>

      <span className="font-black text-slate-950">
        {value}
      </span>
    </div>
  );
}