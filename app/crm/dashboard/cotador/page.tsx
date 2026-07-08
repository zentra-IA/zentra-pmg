"use client";

export default function Page() {
  return (
    <main className="p-4 md:p-6">
      <section className="rounded-[28px] border border-blue-100 bg-gradient-to-br from-white to-sky-50 p-6 shadow-sm md:p-8">
        <p className="text-xs font-black uppercase tracking-[0.25em] text-blue-600">Zentra Sales AI</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 md:text-4xl">Cotador IA</h1>
        <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-slate-500">Acesse o Cotador IA hospedado na Vercel e prepare a integração para salvar cotações no histórico do cliente.</p>
      </section>

      <section className="mt-5 grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-black text-blue-600">Status</p>
            <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Externo</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">Cotador preservado no Vercel.</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-black text-blue-600">Integração</p>
            <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Webhook/API</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">Próxima etapa: salvar cotações no CRM.</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-black text-blue-600">Histórico</p>
            <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Cliente</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">Cotações vinculadas ao cliente.</p>
          </div>
      </section>

      <section className="mt-5 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-black tracking-tight text-slate-950">Próxima etapa</h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
          Este módulo já está reservado na arquitetura. A próxima implementação conectará dados reais do Supabase, regras multiempresa e integração com a Central IA sem quebrar o Kanban, campanhas, inbox ou disparos existentes.
        </p>
      </section>
      <a href="https://cotador-pmg-web-indol.vercel.app" target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-500 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-500/20">
        Abrir Cotador IA
      </a>
    </main>
  );
}
