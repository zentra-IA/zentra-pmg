"use client";

export default function Page() {
  return (
    <main className="p-4 md:p-6">
      <section className="rounded-[28px] border border-blue-100 bg-gradient-to-br from-white to-sky-50 p-6 shadow-sm md:p-8">
        <p className="text-xs font-black uppercase tracking-[0.25em] text-blue-600">Zentra Sales AI</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 md:text-4xl">Metas</h1>
        <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-slate-500">Controle mensal por representante, projeção de fechamento, média diária necessária e alertas automáticos.</p>
      </section>

      <section className="mt-5 grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-black text-blue-600">Meta mensal</p>
            <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-950">R$ 0,00</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">Definida pelo supervisor.</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-black text-blue-600">Projeção</p>
            <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-950">0%</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">Estimativa de fechamento do mês.</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-black text-blue-600">Ritmo diário</p>
            <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-950">IA</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">Sugestão do que vender hoje.</p>
          </div>
      </section>

      <section className="mt-5 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-black tracking-tight text-slate-950">Próxima etapa</h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
          Este módulo já está reservado na arquitetura. A próxima implementação conectará dados reais do Supabase, regras multiempresa e integração com a Central IA sem quebrar o Kanban, campanhas, inbox ou disparos existentes.
        </p>
      </section>
    </main>
  );
}
