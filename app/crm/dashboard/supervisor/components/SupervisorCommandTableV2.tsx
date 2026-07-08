import {
  ChevronRight,
  Edit3,
  FileText,
  MessageCircle,
  Radar,
  ShoppingCart,
  Target,
  Users,
} from "lucide-react";

export function SupervisorCommandTableV2({
  sellers,
  onOpenSeller,
  onEditGoal,
}: {
  sellers: any[];
  onOpenSeller: (seller: any) => void;
  onEditGoal: (seller: any) => void;
}) {
  return (
    <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-5">
        <h2 className="text-xl font-black text-slate-950">
          Ranking operacional
        </h2>
        <p className="text-sm text-slate-500">
          Tabela feita para supervisão em escala: 10, 50 ou 100 vendedores.
        </p>
      </div>

      <div className="max-h-[720px] overflow-auto">
        <table className="w-full min-w-[1450px]">
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr className="border-b border-slate-200 text-left text-[11px] font-black uppercase tracking-wide text-slate-500">
              <th className="p-4">Vendedor</th>
              <th>Meta</th>
              <th>Vendido</th>
              <th>% Meta</th>
              <th>Pedidos</th>
              <th>Ticket</th>
              <th>Cotações</th>
              <th>Mensagens</th>
              <th>Respostas</th>
              <th>Radar</th>
              <th>Clientes</th>
              <th>Sem contato</th>
              <th>Índice</th>
              <th>Ações</th>
            </tr>
          </thead>

          <tbody>
            {sellers.map((seller) => {
              const risk =
                seller.zentraIndex < 60 ||
                seller.orders === 0 ||
                seller.quotes === 0 ||
                seller.messagesSent === 0 ||
                seller.radarViews === 0 ||
                seller.customersWithoutContact > 0;

              return (
                <tr
                  key={seller.id}
                  className={`border-b border-slate-100 transition hover:bg-slate-50 ${
                    risk ? "bg-amber-50/40" : ""
                  }`}
                >
                  <td className="p-4">
                    <button
                      onClick={() => onOpenSeller(seller)}
                      className="flex items-center gap-3 text-left"
                    >
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-sm font-black text-white">
                        {seller.name?.charAt(0)?.toUpperCase() || "V"}
                      </div>

                      <div>
                        <p className="font-black text-slate-950">{seller.name}</p>
                        <p className="text-xs text-slate-500">{seller.email}</p>
                      </div>
                    </button>
                  </td>

                  <td>
                    <p className="font-black text-slate-900">{seller.goalFormatted}</p>
                    <button
                      onClick={() => onEditGoal(seller)}
                      className="mt-1 inline-flex items-center gap-1 text-xs font-black text-emerald-700 hover:underline"
                    >
                      <Edit3 className="h-3 w-3" />
                      Editar
                    </button>
                  </td>

                  <td className="font-black text-slate-950">{seller.soldFormatted}</td>

                  <td>
                    <GoalProgress value={seller.goalPercent} />
                  </td>

                  <Metric icon={ShoppingCart} value={seller.orders} danger={seller.orders === 0} />
                  <td className="font-bold">{seller.averageTicketFormatted}</td>
                  <Metric icon={FileText} value={seller.quotes} danger={seller.quotes === 0} />
                  <Metric icon={MessageCircle} value={seller.messagesSent} danger={seller.messagesSent === 0} />
                  <td className="font-bold">{seller.messagesAnswered} ({seller.messageResponseRate}%)</td>
                  <Metric icon={Radar} value={seller.radarViews} danger={seller.radarViews === 0} />
                  <Metric icon={Users} value={seller.customers} />
                  <Metric icon={Target} value={seller.customersWithoutContact} danger={seller.customersWithoutContact > 0} />

                  <td>
                    <Index value={seller.zentraIndex} />
                  </td>

                  <td>
                    <button
                      onClick={() => onOpenSeller(seller)}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-black text-slate-700 hover:bg-slate-50"
                    >
                      Ver
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {sellers.length === 0 && (
        <div className="p-10 text-center text-sm font-semibold text-slate-500">
          Nenhum vendedor encontrado com esse filtro.
        </div>
      )}
    </section>
  );
}

function Metric({ icon: Icon, value, danger }: any) {
  return (
    <td>
      <span
        className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-black ${
          danger ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-700"
        }`}
      >
        <Icon className="h-4 w-4" />
        {value}
      </span>
    </td>
  );
}

function GoalProgress({ value }: { value: number }) {
  return (
    <div className="w-36">
      <div className="mb-1 text-xs font-black text-slate-700">{value}%</div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${
            value >= 100 ? "bg-emerald-600" : value >= 70 ? "bg-blue-600" : "bg-amber-500"
          }`}
          style={{ width: `${Math.min(Number(value || 0), 100)}%` }}
        />
      </div>
    </div>
  );
}

function Index({ value }: { value: number }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-sm font-black ${
        value >= 80
          ? "bg-emerald-50 text-emerald-700"
          : value >= 60
          ? "bg-blue-50 text-blue-700"
          : "bg-red-50 text-red-700"
      }`}
    >
      {value}
    </span>
  );
}