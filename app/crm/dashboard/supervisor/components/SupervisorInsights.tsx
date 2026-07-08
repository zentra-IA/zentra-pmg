import {
  Brain,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

export function SupervisorInsights({ data }: any) {
  return (
    <section className="rounded-3xl border bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-violet-50 p-3 text-violet-600">
          <Brain className="h-6 w-6" />
        </div>

        <div>
          <h2 className="text-xl font-bold text-slate-950">
            {data?.title || "Diagnóstico IA"}
          </h2>

          <p className="text-sm text-slate-500">
            A IA analisou riscos, oportunidades e decisões importantes.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {(data?.summary || []).map((item: string, index: number) => (
          <div
            key={index}
            className="rounded-2xl border border-slate-100 bg-slate-50 p-4"
          >
            <div className="flex gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-violet-600" />

              <p className="text-sm leading-relaxed text-slate-700">
                {item}
              </p>
            </div>
          </div>
        ))}
      </div>

      {data?.recommendations?.length > 0 && (
        <div className="mt-6 rounded-2xl border border-amber-100 bg-amber-50 p-5">
          <div className="mb-4 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />

            <h3 className="font-semibold text-amber-900">
              Recomendações prioritárias
            </h3>
          </div>

          <div className="space-y-3">
            {data.recommendations.map((rec: any) => (
              <div
                key={`${rec.sellerId}-${rec.message}`}
                className="rounded-xl bg-white p-4 shadow-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-950">
                    {rec.sellerName}
                  </span>

                  <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-bold uppercase text-amber-700">
                    prioridade {rec.priority}
                  </span>
                </div>

                <p className="mt-1 text-sm text-slate-600">
                  {rec.message}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}