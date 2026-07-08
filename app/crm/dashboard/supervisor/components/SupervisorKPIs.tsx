import {
  Users,
  ShoppingCart,
  Megaphone,
  Inbox,
  Activity,
  MessageSquare,
  UserRoundX,
  Target,
} from "lucide-react";

export function SupervisorKPIs({ data }: any) {
  const items = [
    ["Clientes", data.customers, Users],
    ["Pedidos", data.orders, ShoppingCart],
    ["Campanhas", data.campaigns, Megaphone],
    ["Inbox", data.inbox, Inbox],
    ["Leads/Radar", data.leads, MessageSquare],
    ["Atividades", data.activities, Activity],
    ["Sem contato", data.customersWithoutContact, UserRoundX],
    ["Meta atingida", `${data.goalPercent}%`, Target],
  ];

  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {items.map(([label, value, Icon]: any) => (
        <div
          key={label}
          className="rounded-2xl border bg-white p-5 shadow-sm transition hover:shadow-md"
        >
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">{label}</p>

            <div className="rounded-xl bg-violet-50 p-2 text-violet-600">
              <Icon className="h-4 w-4" />
            </div>
          </div>

          <h3 className="mt-4 text-2xl font-bold text-slate-950">
            {value}
          </h3>
        </div>
      ))}
    </section>
  );
}