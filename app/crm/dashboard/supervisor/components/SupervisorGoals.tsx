import {
  Target,
  Edit3,
} from "lucide-react";

export function SupervisorGoals({ sellers }: { sellers: any[] }) {
  return (
    <section className="rounded-3xl border bg-white p-6 shadow-sm">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-950">
            Metas da equipe
          </h2>

          <p className="text-sm text-slate-500">
            Acompanhe o avanço mensal por vendedor.
          </p>
        </div>

        <button className="inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-semibold hover:bg-slate-50">
          <Edit3 className="h-4 w-4" />
          Editar metas
        </button>
      </div>

      <div className="space-y-4">
        {(sellers || []).map((seller) => (
          <div
            key={seller.id}
            className="rounded-2xl border border-slate-100 p-4"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-slate-950">{seller.name}</p>

                <p className="text-xs text-slate-500">
                  {seller.soldFormatted} de {seller.goalFormatted}
                </p>
              </div>

              <div className="flex items-center gap-2 text-sm font-bold text-violet-700">
                <Target className="h-4 w-4" />
                {seller.goalPercent}%
              </div>
            </div>

            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-violet-600"
                style={{
                  width: `${Math.min(Number(seller.goalPercent || 0), 100)}%`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}