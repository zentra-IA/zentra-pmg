import { AlertTriangle, Brain, CheckCircle2 } from "lucide-react";

export function SupervisorAIDiagnosisV2({ data }: any) {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700">
            <Brain className="h-6 w-6" />
          </div>

          <div>
            <h2 className="text-xl font-black text-slate-950">
              Diagnóstico IA da operação
            </h2>
            <p className="text-sm text-slate-500">
              A IA aponta onde o supervisor deve olhar primeiro.
            </p>
          </div>
        </div>

        <span className="rounded-full bg-emerald-50 px-4 py-2 text-xs font-black uppercase text-emerald-700">
          Leitura automática
        </span>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        {(data?.summary || []).slice(0, 6).map((item: string, index: number) => (
          <div
            key={index}
            className="rounded-2xl border border-slate-100 bg-slate-50 p-4"
          >
            <div className="flex gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              <p className="text-sm font-medium leading-relaxed text-slate-700">
                {item}
              </p>
            </div>
          </div>
        ))}
      </div>

      {data?.recommendations?.length > 0 && (
        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-700" />
            <h3 className="font-black text-amber-900">
              Ações recomendadas agora
            </h3>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            {data.recommendations.slice(0, 4).map((rec: any) => (
              <div key={`${rec.sellerId}-${rec.message}`} className="rounded-xl bg-white p-4">
                <div className="flex items-center gap-2">
                  <span className="font-black text-slate-950">
                    {rec.sellerName}
                  </span>

                  <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-black uppercase text-amber-700">
                    {rec.priority}
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