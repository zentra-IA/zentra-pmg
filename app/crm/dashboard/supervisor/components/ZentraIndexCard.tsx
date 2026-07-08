import {
  Gauge,
} from "lucide-react";

export function ZentraIndexCard({ sellers }: { sellers: any[] }) {
  const average =
    sellers?.length > 0
      ? Math.round(
          sellers.reduce((acc, seller) => acc + Number(seller.zentraIndex || 0), 0) /
            sellers.length
        )
      : 0;

  let status = "Operação saudável";
  let description = "A equipe está mantendo uma boa cadência comercial.";

  if (average < 50) {
    status = "Operação em atenção";
    description =
      "Existem sinais de baixa atividade, baixa conversão ou pouco uso do sistema.";
  }

  if (average >= 80) {
    status = "Operação forte";
    description =
      "A equipe está com boa performance, uso consistente do sistema e boa proximidade da meta.";
  }

  return (
    <section className="rounded-3xl border bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-violet-50 p-3 text-violet-600">
          <Gauge className="h-6 w-6" />
        </div>

        <div>
          <h2 className="text-xl font-bold text-slate-950">
            Índice Zentra™
          </h2>

          <p className="text-sm text-slate-500">
            Indicador proprietário de saúde comercial da equipe.
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-center">
        <div className="flex h-32 w-32 items-center justify-center rounded-full border-8 border-violet-100 bg-violet-50">
          <span className="text-4xl font-black text-violet-700">
            {average}
          </span>
        </div>

        <div>
          <h3 className="text-lg font-bold text-slate-950">
            {status}
          </h3>

          <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-600">
            {description}
          </p>
        </div>
      </div>
    </section>
  );
}