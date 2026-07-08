import {
  ChevronRight,
  FileText,
  MessageCircle,
  Radar,
  Settings,
  ShoppingCart,
  Target,
  Users,
} from "lucide-react";

export function SellerCommandTable({
  sellers,
  onOpenSeller,
  onEditSettings,
}: {
  sellers: any[];
  onOpenSeller: (seller: any) => void;
  onEditSettings: (seller: any) => void;
}) {
  return (
    <section className="overflow-hidden rounded-[32px] border border-emerald-100 bg-white/95 shadow-[0_18px_70px_rgba(15,118,82,0.09)] backdrop-blur">
      <div className="flex flex-col justify-between gap-4 border-b border-slate-100 bg-gradient-to-r from-white via-white to-emerald-50/70 p-5 lg:flex-row lg:items-center">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-700">
            Performance da equipe
          </p>
          <h2 className="mt-1 text-2xl font-black text-slate-950">
            Ranking operacional
          </h2>
          <p className="text-sm font-medium text-slate-500">
            Vendas, pedidos, cotações, mensagens, Radar, comissão, clientes e Índice Zentra por vendedor.
          </p>
        </div>

        <div className="w-fit rounded-2xl border border-emerald-100 bg-white px-4 py-3 text-sm font-black text-emerald-800 shadow-sm">
          {sellers?.length || 0} vendedor(es)
        </div>
      </div>

      <div className="block p-4 lg:hidden">
        <div className="space-y-4">
          {(sellers || []).map((seller) => (
            <SellerMobileCard
              key={seller.id}
              seller={seller}
              onOpenSeller={onOpenSeller}
              onEditSettings={onEditSettings}
            />
          ))}
        </div>
      </div>

      <div className="hidden max-h-[740px] overflow-auto lg:block">
        <table className="w-full min-w-[1500px]">
          <thead className="sticky top-0 z-10 bg-[#F4FBF7]">
            <tr className="border-b border-slate-200 text-left text-[11px] font-black uppercase tracking-wide text-slate-500">
              <th className="p-4">Vendedor</th>
              <th>Vendido</th>
              <th>% Meta</th>
              <th>Comissão</th>
              <th>Pedidos</th>
              <th>Ticket</th>
              <th>Cotações</th>
              <th>Mensagens</th>
              <th>Respostas</th>
              <th>Radar</th>
              <th>Clientes</th>
              <th>Sem contato</th>
              <th>Índice</th>
              <th>Ação</th>
            </tr>
          </thead>

          <tbody>
            {(sellers || []).map((seller) => {
              const risk = isRisk(seller);

              return (
                <tr
                  key={seller.id}
                  className={`border-b border-slate-100 transition hover:bg-emerald-50/40 ${
                    risk ? "bg-amber-50/40" : ""
                  }`}
                >
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => onOpenSeller(seller)}
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-700 to-slate-950 text-sm font-black text-white shadow"
                      >
                        {seller.name?.charAt(0)?.toUpperCase() || "V"}
                      </button>

                      <div>
                        <button
                          onClick={() => onOpenSeller(seller)}
                          className="text-left font-black text-slate-950 hover:text-emerald-700"
                        >
                          {seller.name}
                        </button>
                        <p className="text-xs text-slate-500">{seller.email}</p>

                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            onEditSettings(seller);
                          }}
                          className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700 hover:bg-emerald-100"
                        >
                          <Settings className="h-3 w-3" />
                          Meta / Comissão
                        </button>
                      </div>
                    </div>
                  </td>

                  <td className="font-black text-slate-950">{seller.soldFormatted}</td>

                  <td>
                    <GoalProgress value={seller.goalPercent} />
                  </td>

                  <td className="font-black text-emerald-700">
                    {seller.commissionPercent || 0}%
                    <span className="block text-xs font-bold text-slate-500">
                      {seller.commissionValueFormatted || "R$ 0,00"}
                    </span>
                  </td>

                  <Metric icon={ShoppingCart} value={seller.orders} danger={seller.orders === 0} />

                  <td className="font-bold text-slate-700">
                    {seller.averageTicketFormatted}
                  </td>

                  <Metric icon={FileText} value={seller.quotes} danger={seller.quotes === 0} />
                  <Metric icon={MessageCircle} value={seller.messagesSent} danger={seller.messagesSent === 0} />

                  <td className="font-bold text-slate-700">
                    {seller.messagesAnswered} ({seller.messageResponseRate}%)
                  </td>

                  <Metric icon={Radar} value={seller.radarViews} danger={seller.radarViews === 0} />
                  <Metric icon={Users} value={seller.customers} />
                  <Metric icon={Target} value={seller.customersWithoutContact} danger={seller.customersWithoutContact > 0} />

                  <td>
                    <Index value={seller.zentraIndex} />
                  </td>

                  <td>
                    <button
                      onClick={() => onOpenSeller(seller)}
                      className="inline-flex items-center gap-2 rounded-xl border border-emerald-100 px-3 py-2 text-sm font-black text-emerald-800 hover:bg-emerald-50"
                    >
                      Ver
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {(!sellers || sellers.length === 0) && (
        <div className="p-10 text-center text-sm font-semibold text-slate-500">
          Nenhum vendedor encontrado com esse filtro.
        </div>
      )}
    </section>
  );
}

function SellerMobileCard({
  seller,
  onOpenSeller,
  onEditSettings,
}: {
  seller: any;
  onOpenSeller: (seller: any) => void;
  onEditSettings: (seller: any) => void;
}) {
  const risk = isRisk(seller);

  return (
    <article
      className={`overflow-hidden rounded-[28px] border bg-white shadow-sm ${
        risk ? "border-amber-200" : "border-emerald-100"
      }`}
    >
      <div className="flex items-start justify-between gap-3 p-4">
        <button onClick={() => onOpenSeller(seller)} className="flex min-w-0 items-center gap-3 text-left">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-700 to-slate-950 text-sm font-black text-white">
            {seller.name?.charAt(0)?.toUpperCase() || "V"}
          </div>
          <div className="min-w-0">
            <p className="truncate font-black text-slate-950">{seller.name}</p>
            <p className="truncate text-xs text-slate-500">{seller.email}</p>
          </div>
        </button>

        <Index value={seller.zentraIndex} />
      </div>

      <div className="grid grid-cols-2 gap-3 px-4 pb-4">
        <SmallStat label="Vendido" value={seller.soldFormatted} />
        <SmallStat label="Meta" value={`${seller.goalPercent}%`} />
        <SmallStat label="Pedidos" value={seller.orders} danger={seller.orders === 0} />
        <SmallStat label="Ticket" value={seller.averageTicketFormatted} />
        <SmallStat label="Comissão" value={seller.commissionValueFormatted || "R$ 0,00"} />
        <SmallStat label="Mensagens" value={seller.messagesSent} danger={seller.messagesSent === 0} />
        <SmallStat label="Radar" value={seller.radarViews} danger={seller.radarViews === 0} />
        <SmallStat label="Sem contato" value={seller.customersWithoutContact} danger={seller.customersWithoutContact > 0} />
      </div>

      <div className="flex gap-2 border-t border-slate-100 bg-slate-50 p-3">
        <button
          onClick={() => onOpenSeller(seller)}
          className="flex-1 rounded-2xl bg-emerald-700 px-4 py-3 text-sm font-black text-white"
        >
          Ver detalhes
        </button>

        <button
          onClick={() => onEditSettings(seller)}
          className="flex-1 rounded-2xl border border-emerald-100 bg-white px-4 py-3 text-sm font-black text-emerald-700"
        >
          Meta / Comissão
        </button>
      </div>
    </article>
  );
}

function isRisk(seller: any) {
  return (
    seller.zentraIndex < 60 ||
    seller.orders === 0 ||
    seller.quotes === 0 ||
    seller.messagesSent === 0 ||
    seller.radarViews === 0 ||
    seller.customersWithoutContact > 0
  );
}

function Metric({ icon: Icon, value, danger }: any) {
  return (
    <td>
      <span
        className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-black ${
          danger ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-700"
        }`}
      >
        <Icon className="h-4 w-4" />
        {value}
      </span>
    </td>
  );
}

function SmallStat({ label, value, danger }: any) {
  return (
    <div className={danger ? "rounded-2xl bg-red-50 p-3" : "rounded-2xl bg-slate-50 p-3"}>
      <p className="text-[11px] font-black uppercase text-slate-500">{label}</p>
      <p className={danger ? "mt-1 font-black text-red-700" : "mt-1 font-black text-slate-950"}>
        {value}
      </p>
    </div>
  );
}

function GoalProgress({ value }: { value: number }) {
  return (
    <div className="w-36">
      <div className="mb-1 text-xs font-black text-slate-700">
        {value}%
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${
            value >= 100
              ? "bg-emerald-600"
              : value >= 70
              ? "bg-blue-600"
              : "bg-amber-500"
          }`}
          style={{ width: `${Math.min(Number(value || 0), 100)}%` }}
        />
      </div>
    </div>
  );
}

function Index({ value }: { value: number }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-sm font-black ${
        value >= 80
          ? "bg-emerald-50 text-emerald-700"
          : value >= 60
          ? "bg-blue-50 text-blue-700"
          : "bg-red-50 text-red-700"
      }`}
    >
      {value}
    </span>
  );
}
