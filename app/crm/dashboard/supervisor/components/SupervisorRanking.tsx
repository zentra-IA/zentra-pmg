import {
  ChevronRight,
  Trophy,
} from "lucide-react";

export function SupervisorRanking({
  data,
  onSelectSeller,
}: {
  data: any[];
  onSelectSeller: (seller: any) => void;
}) {
  return (
    <section className="rounded-3xl border bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b p-6">
        <div className="rounded-2xl bg-violet-50 p-3 text-violet-600">
          <Trophy className="h-5 w-5" />
        </div>

        <div>
          <h2 className="text-xl font-bold text-slate-950">
            Ranking da equipe
          </h2>

          <p className="text-sm text-slate-500">
            Quem vende, quem usa o sistema e quem precisa de atenção.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead>
            <tr className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="p-4">Vendedor</th>
              <th>Meta</th>
              <th>Vendido</th>
              <th>%</th>
              <th>Pedidos</th>
              <th>Conversão</th>
              <th>Radar</th>
              <th>Status</th>
              <th>Índice</th>
              <th />
            </tr>
          </thead>

          <tbody>
            {(data || []).map((seller) => (
              <tr
                key={seller.id}
                onClick={() => onSelectSeller(seller)}
                className="cursor-pointer border-b transition hover:bg-slate-50"
              >
                <td className="p-4">
                  <div className="font-semibold text-slate-950">
                    {seller.name}
                  </div>

                  <div className="text-xs text-slate-500">
                    {seller.email}
                  </div>
                </td>

                <td className="text-sm">{seller.goalFormatted}</td>
                <td className="text-sm font-semibold">{seller.soldFormatted}</td>
                <td className="text-sm">{seller.goalPercent}%</td>
                <td className="text-sm">{seller.orders}</td>
                <td className="text-sm">{seller.conversion}%</td>
                <td className="text-sm">{seller.radar}</td>

                <td>
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-semibold ${
                      seller.status === "online"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {seller.status === "online" ? "Online" : "Offline"}
                  </span>
                </td>

                <td>
                  <span className="rounded-full bg-violet-50 px-3 py-1 text-sm font-bold text-violet-700">
                    {seller.zentraIndex}
                  </span>
                </td>

                <td>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}