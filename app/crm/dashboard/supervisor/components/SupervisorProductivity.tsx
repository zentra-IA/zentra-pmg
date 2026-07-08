import {
  Activity,
  Radar,
  Inbox,
  Megaphone,
  ShoppingCart,
  FileText,
} from "lucide-react";

export function SupervisorProductivity({ data }: { data: any[] }) {
  return (
    <section className="rounded-3xl border bg-white p-6 shadow-sm">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-950">
          Produtividade operacional
        </h2>

        <p className="text-sm text-slate-500">
          Uso real do sistema por vendedor.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {(data || []).map((seller) => (
          <div
            key={seller.id}
            className="rounded-2xl border border-slate-100 bg-slate-50 p-5"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-950">{seller.name}</h3>

                <p className="text-xs text-slate-500">
                  Última atividade:{" "}
                  {seller.lastActivityAt
                    ? new Date(seller.lastActivityAt).toLocaleString("pt-BR")
                    : "sem registro"}
                </p>
              </div>

              <span className="rounded-full bg-violet-100 px-3 py-1 text-sm font-bold text-violet-700">
                {seller.zentraIndex}
              </span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Mini label="Atividades" value={seller.activities} icon={Activity} />
              <Mini label="Radar" value={seller.radar} icon={Radar} />
              <Mini label="Inbox" value={seller.inbox} icon={Inbox} />
              <Mini label="Campanhas" value={seller.campaigns} icon={Megaphone} />
              <Mini label="Pedidos" value={seller.orders} icon={ShoppingCart} />
              <Mini label="Cotações" value={seller.quotes} icon={FileText} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Mini({ label, value, icon: Icon }: any) {
  return (
    <div className="rounded-xl bg-white p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">{label}</span>
        <Icon className="h-4 w-4 text-violet-500" />
      </div>

      <div className="mt-2 text-lg font-bold text-slate-950">
        {value}
      </div>
    </div>
  );
}