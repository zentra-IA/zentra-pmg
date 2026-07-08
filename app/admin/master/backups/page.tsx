"use client";

const backups = [
  { label: "Empresas", type: "companies" },
  { label: "Clientes", type: "customers" },
  { label: "Pedidos", type: "orders" },
  { label: "Produtos", type: "products" },
];

export default function MasterBackupsPage() {
  function download(type: string) {
    window.open(`/api/admin/backups/export?type=${type}`, "_blank");
  }

  return (
    <main className="min-h-screen bg-black px-4 py-6 text-white">
      <div className="mx-auto max-w-5xl">
        <section className="rounded-[2rem] border border-zinc-800 bg-gradient-to-br from-zinc-950 to-emerald-950 p-6">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-300">
            Zentra Master
          </p>

          <h1 className="mt-2 text-3xl font-black md:text-5xl">
            Backups administrativos
          </h1>

          <p className="mt-2 text-sm text-zinc-400">
            Exporte dados importantes em CSV antes de alterações grandes.
          </p>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-2">
          {backups.map((item) => (
            <button
              key={item.type}
              onClick={() => download(item.type)}
              className="rounded-[2rem] border border-zinc-800 bg-zinc-950 p-6 text-left transition hover:border-emerald-500"
            >
              <h2 className="text-xl font-black">{item.label}</h2>
              <p className="mt-2 text-sm text-zinc-500">
                Baixar CSV de {item.label.toLowerCase()}.
              </p>
              <div className="mt-4 text-sm font-black text-emerald-400">
                Exportar →
              </div>
            </button>
          ))}
        </section>
      </div>
    </main>
  );
}