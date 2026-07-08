import { AlertTriangle, Brain, CheckCircle2 } from "lucide-react";

export function CommandAIDiagnosis({ data }: any) {
  const summary = data?.summary || [];
  const recommendations = data?.recommendations || [];

  return (
    <section className="rounded-[32px] border border-emerald-100 bg-white/95 p-5 shadow-[0_18px_60px_rgba(15,118,82,0.08)] backdrop-blur sm:p-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div className="flex items-center gap-3">
          <div className="rounded-3xl bg-emerald-50 p-4 text-emerald-700 ring-1 ring-emerald-100">
            <Brain className="h-6 w-6" />
          </div>

          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">
              Diagnóstico automático
            </p>
            <h2 className="mt-1 text-2xl font-black text-slate-950">
              IA da operação
            </h2>
            <p className="text-sm font-medium text-slate-500">
              O sistema destaca riscos, oportunidades e prioridades antes do supervisor procurar.
            </p>
          </div>
        </div>

        <span className="w-fit rounded-full bg-emerald-50 px-4 py-2 text-xs font-black uppercase text-emerald-700">
          Leitura automática
        </span>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {summary.map((item: string, index: number) => (
          <div
            key={index}
            className="rounded-3xl border border-slate-100 bg-slate-50/80 p-4 transition hover:border-emerald-100 hover:bg-emerald-50/50"
          >
            <div className="flex gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              <p className="text-sm font-semibold leading-relaxed text-slate-700">
                {item}
              </p>
            </div>
          </div>
        ))}
      </div>

      {recommendations.length > 0 && (
        <div className="mt-5 rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-700" />
            <h3 className="font-black text-amber-900">
              Ações recomendadas agora
            </h3>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            {recommendations.map((rec: any) => (
              <div
                key={`${rec.sellerId}-${rec.message}`}
                className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-amber-100"
              >
                <div className="flex items-center gap-2">
                  <span className="font-black text-slate-950">{rec.sellerName}</span>
                  <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-black uppercase text-amber-700">
                    {rec.priority}
                  </span>
                </div>

                <p className="mt-1 text-sm font-medium leading-relaxed text-slate-600">
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
