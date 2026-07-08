"use client";

import { useEffect, useMemo, useState } from "react";

type OrderItem = {
  code?: string;
  name: string;
  original_code?: string | null;
  original_name?: string | null;
  unit?: string | null;
  quantity: number;
  unit_price: number;
  discount: number;
  total: number;
  catalog_match?: {
    matched: boolean;
    method: string;
    confidence: number;
    needs_review: boolean;
    message: string;
  };
};

type ExtractedOrder = {
  order_number?: string;
  customer_id?: string;
  customer_name?: string;
  document?: string;
  seller_name?: string;
  seller_code?: string;
  payment_terms?: string;
  installments?: number;
  delivery_date?: string;
  address?: string;
  items?: OrderItem[];
  discount_total?: number;
  tax_total?: number;
  total?: number;
  confidence?: number;
  raw_text?: string;
  ai_summary?: string;
  catalog_validation?: {
    total: number;
    exact: number;
    normalized: number;
    fuzzy: number;
    review: number;
    score: number;
    safe_to_save: boolean;
  };
};

const money = (value: any) =>
  Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

function dateInput(value?: string | Date | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function formatDate(value?: string | Date | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("pt-BR");
}

function catalogBadge(item: OrderItem) {
  const match = item.catalog_match;

  if (!match) {
    return {
      label: "Sem validação",
      className: "bg-slate-100 text-slate-600 border-slate-200",
    };
  }

  if (match.method === "codigo_exato" || match.method === "codigo_normalizado") {
    return {
      label: `Confirmado ${match.confidence}%`,
      className: "bg-emerald-50 text-emerald-700 border-emerald-200",
    };
  }

  if (match.method === "similaridade_nome" && !match.needs_review) {
    return {
      label: `Corrigido ${match.confidence}%`,
      className: "bg-blue-50 text-blue-700 border-blue-200",
    };
  }

  if (match.method === "similaridade_nome" && match.needs_review) {
    return {
      label: `Revisar ${match.confidence}%`,
      className: "bg-amber-50 text-amber-700 border-amber-200",
    };
  }

  return {
    label: "Revisar",
    className: "bg-red-50 text-red-700 border-red-200",
  };
}

export default function OrdersPage() {
  const [file, setFile] = useState<File | null>(null);
  const [typedOrder, setTypedOrder] = useState("");
  const [extracted, setExtracted] = useState<ExtractedOrder | null>(null);
  const [comparison, setComparison] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [performance, setPerformance] = useState<any>(null);
  const [deliverySummary, setDeliverySummary] = useState<any>(null);
  const [loadingOcr, setLoadingOcr] = useState(false);
  const [saving, setSaving] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [editingOrder, setEditingOrder] = useState<any | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [nonDeliveryOrder, setNonDeliveryOrder] = useState<any | null>(null);
  const [nonDeliveryReason, setNonDeliveryReason] = useState("");
  const [editForm, setEditForm] = useState({
    order_number: "",
    customer_name: "",
    payment_terms: "",
    delivery_date: "",
    total: "",
    status: "registrado",
  });

  const [filters, setFilters] = useState({
    period: "today",
    from: "",
    to: "",
    q: "",
    status: "",
    orderBy: "created_desc",
    limit: "80",
  });

  const totalItems = useMemo(() => extracted?.items?.length || 0, [extracted]);

  async function loadOrders() {
    setLoadingOrders(true);

    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });

    const res = await fetch(`/api/crm/orders?${params.toString()}`, { cache: "no-store" });
    const data = await res.json();
    setOrders(Array.isArray(data.orders) ? data.orders : []);
    setLoadingOrders(false);
  }

  async function loadPerformance() {
    const res = await fetch("/api/crm/performance", { cache: "no-store" });
    const data = await res.json();
    if (!data.error) setPerformance(data);
  }

  async function loadDeliverySummary() {
    const today = new Date().toISOString().slice(0, 10);
    const res = await fetch(`/api/crm/delivery-summary?date=${today}`, { cache: "no-store" });
    const data = await res.json();
    if (!data.error) setDeliverySummary(data);
  }

  useEffect(() => {
    loadOrders();
  }, [filters.period, filters.from, filters.to, filters.status, filters.orderBy, filters.limit]);

  useEffect(() => {
    loadPerformance();
    loadDeliverySummary();
  }, []);

  async function analyzeOcr() {
    if (!file) {
      alert("Selecione a imagem do espelho do pedido.");
      return;
    }

    setLoadingOcr(true);
    setExtracted(null);
    setComparison(null);

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/crm/orders/ocr", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Erro ao ler o espelho.");
      setLoadingOcr(false);
      return;
    }

    setExtracted(data.order || data.extracted || data);
    setLoadingOcr(false);
  }

  async function compareOrder() {
    if (!extracted || !typedOrder.trim()) {
      alert("Cole o pedido digitado para fazer a conferência.");
      return;
    }

    setComparing(true);

    const res = await fetch("/api/crm/orders/compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ extracted, typedOrder }),
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Erro ao comparar pedido.");
      setComparing(false);
      return;
    }

    setComparison(data.comparison || data);
    setComparing(false);
  }

  async function saveOrder() {
    if (!extracted) return;

    const reviewItems = extracted.items?.filter((item) => item.catalog_match?.needs_review) || [];

    if (reviewItems.length > 0) {
      const ok = confirm(
        `Existem ${reviewItems.length} produto(s) com baixa confiança no catálogo. Deseja salvar mesmo assim?`
      );

      if (!ok) return;
    }

    setSaving(true);

    const res = await fetch("/api/crm/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ extracted }),
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Erro ao salvar pedido.");
      setSaving(false);
      return;
    }

    setSaving(false);
    setExtracted(null);
    setFile(null);
    setTypedOrder("");
    setComparison(null);
    await Promise.all([loadOrders(), loadPerformance(), loadDeliverySummary()]);
    alert("Pedido salvo com sucesso.");
  }

  function startEdit(order: any) {
    setEditingOrder(order);
    setEditForm({
      order_number: order.order_number || "",
      customer_name: order.customer_name || "",
      payment_terms: order.payment_terms || "",
      delivery_date: dateInput(order.delivery_date),
      total: String(order.total || ""),
      status: order.status || "registrado",
    });
  }

  async function updateOrder() {
    if (!editingOrder) return;

    const res = await fetch("/api/crm/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editingOrder.id,
        ...editForm,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Erro ao editar pedido.");
      return;
    }

    setEditingOrder(null);
    await Promise.all([loadOrders(), loadPerformance(), loadDeliverySummary()]);
  }

  async function updateOrderStatus(order: any, status: string, reason?: string) {
    if (status === "nao_entregue" && !reason?.trim()) {
      setNonDeliveryOrder(order);
      setNonDeliveryReason("");
      return;
    }

    if (status === "entregue") {
      const ok = confirm(`Marcar pedido ${order.order_number || ""} como entregue?`);
      if (!ok) return;
    }

    const res = await fetch("/api/crm/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: order.id,
        status,
        commercial_notes:
          status === "nao_entregue"
            ? `Não entregue: ${reason?.trim()}`
            : status === "entregue"
              ? "Pedido marcado como entregue."
              : undefined,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Erro ao atualizar status do pedido.");
      return;
    }

    setNonDeliveryOrder(null);
    setNonDeliveryReason("");
    await Promise.all([loadOrders(), loadPerformance(), loadDeliverySummary()]);
  }

  async function deleteOrder(order: any) {
    const ok = confirm(`Excluir o pedido ${order.order_number || ""}?`);
    if (!ok) return;

    const res = await fetch(`/api/crm/orders?id=${order.id}`, {
      method: "DELETE",
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Erro ao excluir pedido.");
      return;
    }

    await Promise.all([loadOrders(), loadPerformance(), loadDeliverySummary()]);
  }

  async function generateDeliveryNotifications() {
    const ok = confirm("Gerar notificações do WhatsApp para os pedidos de entrega de hoje?");
    if (!ok) return;

    const today = new Date().toISOString().slice(0, 10);

    const res = await fetch("/api/crm/delivery-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: today }),
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Erro ao gerar notificações.");
      return;
    }

    alert("Resumo gerado. O Worker/WhatsApp pode enviar os logs pendentes.");
  }

  const seller = performance?.seller || {};
  const progress = Number(seller.percent || 0);

  return (
    <main className="min-h-screen bg-[#F7F8FA] p-4 md:p-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">
                Pedidos e Performance
              </p>
              <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950 md:text-4xl">
                Gestão de pedidos PMG
              </h1>
              <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-slate-500">
                Leia o espelho com IA, valide os produtos pelo catálogo PMG, acompanhe pedidos do dia,
                faturamento mensal, meta e agenda de entregas.
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                onClick={() => {
                  setFilters({ ...filters, period: "today", from: "", to: "" });
                  loadDeliverySummary();
                }}
                className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700"
              >
                Pedidos de hoje
              </button>
              <button
                onClick={generateDeliveryNotifications}
                className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm font-black text-red-700 transition hover:bg-red-100"
              >
                Gerar aviso WhatsApp
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase text-slate-400">Vendido no mês</p>
            <strong className="mt-2 block text-2xl font-black text-slate-950">{money(seller.total_sales)}</strong>
            <p className="mt-1 text-xs font-bold text-slate-500">{seller.order_count || 0} pedidos no mês</p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase text-slate-400">Meta do mês</p>
            <strong className="mt-2 block text-2xl font-black text-slate-950">{money(seller.goal_amount)}</strong>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-emerald-600"
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>
            <p className="mt-2 text-xs font-bold text-slate-500">{progress.toFixed(1)}% atingido</p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase text-slate-400">Falta vender</p>
            <strong className="mt-2 block text-2xl font-black text-red-600">{money(seller.remaining)}</strong>
            <p className="mt-1 text-xs font-bold text-slate-500">
              Necessário/dia: {money(seller.daily_needed)}
            </p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase text-slate-400">Projeção do mês</p>
            <strong className="mt-2 block text-2xl font-black text-emerald-700">
              {money(seller.projected_month_total)}
            </strong>
            <p className="mt-1 text-xs font-bold text-slate-500">
              Média diária: {money(seller.daily_average)}
            </p>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">
                  Operação do dia
                </p>
                <h2 className="mt-1 text-xl font-black text-slate-950">Pedidos para entrega hoje</h2>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  Marque como entregue ou não entregue sem sair da tela. Se não entregar, a observação fica registrada no pedido.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-2xl bg-slate-50 px-3 py-2">
                  <p className="text-[11px] font-black uppercase text-slate-400">Pedidos</p>
                  <strong className="text-lg font-black text-slate-950">{deliverySummary?.total_orders || 0}</strong>
                </div>
                <div className="rounded-2xl bg-emerald-50 px-3 py-2">
                  <p className="text-[11px] font-black uppercase text-emerald-700">Valor</p>
                  <strong className="text-sm font-black text-emerald-700">{money(deliverySummary?.total_sales || 0)}</strong>
                </div>
                <div className="rounded-2xl bg-amber-50 px-3 py-2">
                  <p className="text-[11px] font-black uppercase text-amber-700">Pend.</p>
                  <strong className="text-lg font-black text-amber-700">
                    {(deliverySummary?.sellers || []).reduce((sum: number, s: any) => {
                      return sum + (s.orders || []).filter((o: any) => o.status !== "entregue").length;
                    }, 0)}
                  </strong>
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-4">
              {(deliverySummary?.sellers || []).map((seller: any) => (
                <div key={seller.seller_id || seller.seller_name} className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
                  <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                    <div>
                      <strong className="text-sm font-black text-slate-900">{seller.seller_name}</strong>
                      <p className="text-xs font-bold text-slate-500">
                        {seller.order_count} pedidos · {money(seller.total_sales)}
                      </p>
                    </div>
                    <button
                      onClick={generateDeliveryNotifications}
                      className="rounded-2xl border border-emerald-200 bg-white px-4 py-2 text-xs font-black text-emerald-700 transition hover:bg-emerald-50"
                    >
                      Gerar aviso
                    </button>
                  </div>

                  <div className="mt-4 grid gap-2">
                    {(seller.orders || []).slice(0, 10).map((order: any) => {
                      const delivered = order.status === "entregue";
                      const failed = order.status === "nao_entregue";

                      return (
                        <div
                          key={order.id}
                          className={`rounded-2xl border p-3 ${
                            delivered
                              ? "border-emerald-100 bg-emerald-50"
                              : failed
                                ? "border-red-100 bg-red-50"
                                : "border-slate-200 bg-white"
                          }`}
                        >
                          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <strong className="text-sm font-black text-slate-950">
                                  {order.customer_name || "Cliente sem nome"}
                                </strong>
                                <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${
                                  delivered
                                    ? "bg-emerald-100 text-emerald-700"
                                    : failed
                                      ? "bg-red-100 text-red-700"
                                      : "bg-amber-100 text-amber-700"
                                }`}>
                                  {delivered ? "Entregue" : failed ? "Não entregue" : "Pendente"}
                                </span>
                              </div>
                              <p className="mt-1 text-xs font-bold text-slate-500">
                                Pedido {order.order_number || "-"} · {money(order.total)} · {formatDate(order.delivery_date)}
                              </p>
                              {order.commercial_notes && (
                                <p className="mt-1 text-xs font-bold text-red-700">{order.commercial_notes}</p>
                              )}
                            </div>

                            <div className="flex flex-wrap gap-2">
                              {!delivered && (
                                <button
                                  onClick={() => updateOrderStatus(order, "entregue")}
                                  className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white transition hover:bg-emerald-700"
                                >
                                  Entregue
                                </button>
                              )}
                              {!failed && (
                                <button
                                  onClick={() => updateOrderStatus(order, "nao_entregue")}
                                  className="rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-black text-red-700 transition hover:bg-red-50"
                                >
                                  Não entregue
                                </button>
                              )}
                              <button
                                onClick={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)}
                                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-50"
                              >
                                Ver produtos
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {(seller.orders || []).length > 10 && (
                      <div className="rounded-2xl bg-white p-3 text-center text-xs font-black text-slate-500">
                        +{(seller.orders || []).length - 10} pedidos. Use o filtro “Hoje” no histórico para ver todos.
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {(!deliverySummary?.sellers || deliverySummary.sellers.length === 0) && (
                <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm font-bold text-slate-400">
                  Nenhum pedido com entrega hoje.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black text-slate-950">Ranking da equipe</h2>
            <p className="text-sm font-medium text-slate-500">Visão do supervisor por vendedor.</p>

            <div className="mt-4 grid gap-3">
              {(performance?.supervisor?.ranking || []).slice(0, 6).map((item: any, index: number) => (
                <div key={item.seller_id || item.seller_name} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white p-3">
                  <div className="flex items-center gap-3">
                    <div className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-sm font-black text-slate-700">
                      {index + 1}
                    </div>
                    <div>
                      <strong className="block text-sm font-black text-slate-900">{item.seller_name}</strong>
                      <span className="text-xs font-bold text-slate-500">{item.order_count} pedidos</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <strong className="block text-sm font-black text-emerald-700">{money(item.total_sales)}</strong>
                    <span className="text-xs font-bold text-slate-500">{Number(item.goal_percent || 0).toFixed(1)}%</span>
                  </div>
                </div>
              ))}

              {(!performance?.supervisor?.ranking || performance.supervisor.ranking.length === 0) && (
                <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm font-bold text-slate-400">
                  Sem vendas no mês para montar ranking.
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black text-slate-950">Ler espelho com IA</h2>
            <p className="mt-1 text-sm font-medium text-slate-500">
              Envie a imagem do espelho. O sistema valida produtos pelo catálogo PMG antes de salvar.
            </p>

            <label className="mt-5 flex cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50 p-6 text-center transition hover:border-emerald-300 hover:bg-emerald-50/40">
              <span className="text-sm font-black text-slate-900">
                {file ? file.name : "Clique para selecionar a imagem"}
              </span>
              <span className="mt-1 text-xs font-bold text-slate-500">
                PNG, JPG ou JPEG do espelho do pedido
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </label>

            <button
              onClick={analyzeOcr}
              disabled={loadingOcr}
              className="mt-4 w-full rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
            >
              {loadingOcr ? "Lendo espelho..." : "Ler espelho com IA"}
            </button>

            <textarea
              value={typedOrder}
              onChange={(e) => setTypedOrder(e.target.value)}
              placeholder="Opcional: cole aqui o pedido digitado para comparar com o espelho..."
              className="mt-4 min-h-[130px] w-full rounded-2xl border border-slate-200 bg-white p-4 text-sm font-medium outline-none focus:border-emerald-400"
            />

            <button
              onClick={compareOrder}
              disabled={comparing || !extracted}
              className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-800 transition hover:bg-slate-50 disabled:opacity-60"
            >
              {comparing ? "Conferindo..." : "Conferir pedido digitado x espelho"}
            </button>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-slate-950">Resultado do OCR</h2>
                <p className="text-sm font-medium text-slate-500">
                  Revise produtos marcados em amarelo/vermelho antes de salvar.
                </p>
              </div>

              {extracted && (
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
                  {totalItems} itens
                </span>
              )}
            </div>

            {!extracted && (
              <div className="mt-5 rounded-3xl border border-dashed border-slate-200 p-10 text-center text-sm font-bold text-slate-400">
                O resultado da leitura aparecerá aqui.
              </div>
            )}

            {extracted && (
              <div className="mt-5 space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <Info label="Pedido" value={extracted.order_number || "-"} />
                  <Info label="Cliente" value={extracted.customer_name || "-"} />
                  <Info label="Total" value={money(extracted.total)} />
                  <Info label="ID Cliente" value={extracted.customer_id || "-"} />
                  <Info label="Entrega" value={extracted.delivery_date || "-"} />
                  <Info label="Pagamento" value={extracted.payment_terms || "-"} />
                </div>

                {extracted.catalog_validation && (
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <strong className="text-sm font-black text-slate-900">Validação do Catálogo PMG</strong>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs font-bold text-slate-600 md:grid-cols-5">
                      <span>Total: {extracted.catalog_validation.total}</span>
                      <span>Exatos: {extracted.catalog_validation.exact}</span>
                      <span>Corrigidos: {extracted.catalog_validation.fuzzy}</span>
                      <span>Revisar: {extracted.catalog_validation.review}</span>
                      <span>Score: {extracted.catalog_validation.score}%</span>
                    </div>
                  </div>
                )}

                <div className="max-h-[420px] overflow-auto rounded-2xl border border-slate-100">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Código</th>
                        <th className="px-4 py-3">Produto</th>
                        <th className="px-4 py-3">Qtd</th>
                        <th className="px-4 py-3">Unit.</th>
                        <th className="px-4 py-3">Total</th>
                        <th className="px-4 py-3">Validação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(extracted.items || []).map((item, index) => {
                        const badge = catalogBadge(item);
                        return (
                          <tr key={`${item.code}-${index}`} className="border-t border-slate-100">
                            <td className="px-4 py-3 font-bold text-slate-700">{item.code || "-"}</td>
                            <td className="px-4 py-3">
                              <strong className="block text-slate-950">{item.name}</strong>
                              {item.original_name && item.original_name !== item.name && (
                                <span className="text-xs font-bold text-slate-400">
                                  OCR leu: {item.original_name}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 font-bold">{item.quantity}</td>
                            <td className="px-4 py-3 font-bold">{money(item.unit_price)}</td>
                            <td className="px-4 py-3 font-black">{money(item.total)}</td>
                            <td className="px-4 py-3">
                              <span className={`rounded-full border px-3 py-1 text-xs font-black ${badge.className}`}>
                                {badge.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {comparison && (
                  <div className={`rounded-3xl border p-5 ${
                    comparison.status === "aprovado"
                      ? "border-emerald-200 bg-emerald-50"
                      : comparison.status === "bloqueado"
                        ? "border-red-200 bg-red-50"
                        : "border-amber-200 bg-amber-50"
                  }`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                          Conferência pedido digitado x espelho
                        </p>
                        <h3 className={`mt-1 text-lg font-black ${
                          comparison.status === "aprovado"
                            ? "text-emerald-800"
                            : comparison.status === "bloqueado"
                              ? "text-red-800"
                              : "text-amber-800"
                        }`}>
                          {comparison.summary || "Resultado da conferência"}
                        </h3>
                        <p className="mt-1 text-sm font-bold text-slate-600">
                          O sistema compara apenas produtos e quantidades usando o Catálogo PMG como referência.
                        </p>
                      </div>

                      <span className={`rounded-full px-4 py-2 text-sm font-black ${
                        comparison.status === "aprovado"
                          ? "bg-emerald-600 text-white"
                          : comparison.status === "bloqueado"
                            ? "bg-red-600 text-white"
                            : "bg-amber-500 text-white"
                      }`}>
                        Score {comparison.score || 0}%
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-4">
                      <Info label="Itens conferidos" value={comparison.totals?.checked ?? 0} />
                      <Info label="OK" value={comparison.totals?.ok ?? 0} />
                      <Info label="Divergências" value={comparison.totals?.divergences ?? 0} />
                      <Info label="Faltando/Sobrando" value={(comparison.totals?.missing || 0) + (comparison.totals?.extra || 0)} />
                    </div>

                    {comparison.quantityDivergences?.length > 0 && (
                      <div className="mt-5">
                        <h4 className="text-sm font-black text-red-800">⚠ Quantidades divergentes</h4>
                        <div className="mt-2 space-y-2">
                          {comparison.quantityDivergences.map((item: any, index: number) => (
                            <div key={index} className="rounded-2xl border border-red-200 bg-white p-4 text-sm">
                              <strong className="block text-slate-950">{item.productName}</strong>
                              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                                <span className="font-bold text-slate-600">Digitado: {item.typedQuantity}</span>
                                <span className="font-bold text-slate-600">Espelho: {item.mirrorQuantity}</span>
                                <span className="font-black text-red-700">Diferença: {item.difference}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {comparison.missingInMirror?.length > 0 && (
                      <div className="mt-5">
                        <h4 className="text-sm font-black text-red-800">❌ Está no pedido digitado, mas não apareceu no espelho</h4>
                        <div className="mt-2 grid gap-2">
                          {comparison.missingInMirror.map((item: any, index: number) => (
                            <div key={index} className="rounded-2xl border border-red-200 bg-white p-4 text-sm">
                              <strong className="text-slate-950">{item.productName}</strong>
                              <span className="ml-2 font-bold text-slate-500">Qtd: {item.quantity}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {comparison.extraInMirror?.length > 0 && (
                      <div className="mt-5">
                        <h4 className="text-sm font-black text-amber-800">➕ Está no espelho, mas não estava no pedido digitado</h4>
                        <div className="mt-2 grid gap-2">
                          {comparison.extraInMirror.map((item: any, index: number) => (
                            <div key={index} className="rounded-2xl border border-amber-200 bg-white p-4 text-sm">
                              <strong className="text-slate-950">{item.productName}</strong>
                              <span className="ml-2 font-bold text-slate-500">Qtd: {item.quantity}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {comparison.okItems?.length > 0 && (
                      <details className="mt-5 rounded-2xl border border-emerald-200 bg-white p-4">
                        <summary className="cursor-pointer text-sm font-black text-emerald-800">
                          ✅ Ver itens conferidos corretamente ({comparison.okItems.length})
                        </summary>
                        <div className="mt-3 grid gap-2">
                          {comparison.okItems.map((item: any, index: number) => (
                            <div key={index} className="flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">
                              <span>{item.productName}</span>
                              <span>Qtd: {item.quantity}</span>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}

                    {comparison.recommendation && (
                      <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
                        <strong className="text-sm font-black text-slate-950">Ação recomendada</strong>
                        <p className="mt-1 text-sm font-bold text-slate-600">{comparison.recommendation}</p>
                      </div>
                    )}
                  </div>
                )}

                <button
                  onClick={saveOrder}
                  disabled={saving}
                  className="w-full rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
                >
                  {saving ? "Salvando..." : "Salvar pedido"}
                </button>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <h2 className="text-xl font-black text-slate-950">Histórico de pedidos</h2>
              <p className="text-sm font-medium text-slate-500">
                Filtre por data, cliente, vendedor, produto, status e valor.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
              <select
                value={filters.period}
                onChange={(e) => setFilters({ ...filters, period: e.target.value, from: "", to: "" })}
                className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold outline-none focus:border-emerald-400"
              >
                <option value="">Todos</option>
                <option value="today">Hoje</option>
                <option value="yesterday">Ontem</option>
                <option value="7d">Últimos 7 dias</option>
                <option value="month">Este mês</option>
              </select>

              <input
                type="date"
                value={filters.from}
                onChange={(e) => setFilters({ ...filters, from: e.target.value, period: "" })}
                className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold outline-none focus:border-emerald-400"
              />

              <input
                type="date"
                value={filters.to}
                onChange={(e) => setFilters({ ...filters, to: e.target.value, period: "" })}
                className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold outline-none focus:border-emerald-400"
              />

              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold outline-none focus:border-emerald-400"
              >
                <option value="">Status</option>
                <option value="registrado">Registrado</option>
                <option value="conferido">Conferido</option>
                <option value="entregue">Entregue</option>
                <option value="nao_entregue">Não entregue</option>
                <option value="cancelado">Cancelado</option>
              </select>

              <select
                value={filters.orderBy}
                onChange={(e) => setFilters({ ...filters, orderBy: e.target.value })}
                className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold outline-none focus:border-emerald-400"
              >
                <option value="created_desc">Mais recentes</option>
                <option value="oldest">Mais antigos</option>
                <option value="value_desc">Maior valor</option>
                <option value="value_asc">Menor valor</option>
              </select>

              <input
                value={filters.q}
                onChange={(e) => setFilters({ ...filters, q: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && loadOrders()}
                placeholder="Buscar..."
                className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold outline-none focus:border-emerald-400"
              />

              <button
                onClick={loadOrders}
                className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800"
              >
                Filtrar
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              <span className="text-xs font-black uppercase text-slate-400">Pedidos filtrados</span>
              <strong className="mt-1 block text-xl font-black text-slate-950">{orders.length}</strong>
            </div>
            <div className="rounded-2xl bg-emerald-50 p-4">
              <span className="text-xs font-black uppercase text-emerald-700">Valor filtrado</span>
              <strong className="mt-1 block text-xl font-black text-emerald-800">
                {money(orders.reduce((sum, o) => sum + Number(o.total || 0), 0))}
              </strong>
            </div>
            <div className="rounded-2xl bg-red-50 p-4">
              <span className="text-xs font-black uppercase text-red-700">Ticket médio filtrado</span>
              <strong className="mt-1 block text-xl font-black text-red-700">
                {money(orders.length ? orders.reduce((sum, o) => sum + Number(o.total || 0), 0) / orders.length : 0)}
              </strong>
            </div>
          </div>

          <div className="mt-5 grid gap-3">
            {loadingOrders && (
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-6 text-center text-sm font-bold text-slate-500">
                Carregando pedidos...
              </div>
            )}

            {!loadingOrders && orders.map((order) => (
              <article
                key={order.id}
                className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-emerald-200 hover:shadow-md"
              >
                <div className="grid gap-4 lg:grid-cols-[1.2fr_0.7fr_0.7fr_0.7fr_auto] lg:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="text-base font-black text-slate-950">
                        Pedido {order.order_number || "-"}
                      </strong>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
                        {order.status || "registrado"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-bold text-slate-600">{order.customer_name || "Cliente sem nome"}</p>
                    <p className="text-xs font-bold text-slate-400">
                      ID {order.customer_internal_code || "-"} · {order.document || "-"}
                    </p>
                  </div>

                  <div>
                    <span className="text-xs font-black uppercase text-slate-400">Entrega</span>
                    <strong className="block text-sm font-black text-slate-900">{formatDate(order.delivery_date)}</strong>
                  </div>

                  <div>
                    <span className="text-xs font-black uppercase text-slate-400">Pagamento</span>
                    <strong className="block text-sm font-black text-slate-900">{order.payment_terms || "-"}</strong>
                  </div>

                  <div>
                    <span className="text-xs font-black uppercase text-slate-400">Valor</span>
                    <strong className="block text-lg font-black text-emerald-700">{money(order.total)}</strong>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)}
                      className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-black text-emerald-700 transition hover:bg-emerald-100"
                    >
                      {expandedOrderId === order.id ? "Ocultar" : "Ver produtos"}
                    </button>
                    <button
                      onClick={() => updateOrderStatus(order, "entregue")}
                      className="rounded-2xl bg-emerald-600 px-4 py-2 text-xs font-black text-white transition hover:bg-emerald-700"
                    >
                      Entregue
                    </button>
                    <button
                      onClick={() => updateOrderStatus(order, "nao_entregue")}
                      className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-black text-amber-700 transition hover:bg-amber-100"
                    >
                      Não entregue
                    </button>
                    <button
                      onClick={() => startEdit(order)}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-50"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => deleteOrder(order)}
                      className="rounded-2xl bg-red-50 px-4 py-2 text-xs font-black text-red-700 transition hover:bg-red-100"
                    >
                      Excluir
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-xs font-black text-slate-500">
                  <span className="rounded-full bg-slate-50 px-3 py-1">
                    Produtos: {(order.items || order.SalesOrderItem || []).length}
                  </span>
                  <span className="rounded-full bg-slate-50 px-3 py-1">
                    Vendedor: {order.seller_name || "-"}
                  </span>
                  <span className="rounded-full bg-slate-50 px-3 py-1">
                    Boleto: {order.boleto_due_date ? formatDate(order.boleto_due_date) : "sem vencimento"}
                  </span>
                </div>

                {expandedOrderId === order.id && (
                  <div className="mt-4 rounded-3xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                      <div>
                        <h3 className="text-sm font-black text-slate-950">Produtos comprados neste pedido</h3>
                        <p className="text-xs font-bold text-slate-500">
                          Estes itens alimentam histórico do cliente, ticket médio, mix comprado e comparação com cotações.
                        </p>
                      </div>
                      <strong className="text-sm font-black text-emerald-700">
                        {(order.items || order.SalesOrderItem || []).length} itens
                      </strong>
                    </div>

                    <div className="mt-4 overflow-x-auto">
                      <table className="min-w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 text-[11px] font-black uppercase tracking-wide text-slate-400">
                            <th className="py-2 pr-3">Código</th>
                            <th className="py-2 pr-3">Produto</th>
                            <th className="py-2 pr-3 text-right">Qtd</th>
                            <th className="py-2 pr-3 text-right">Valor</th>
                            <th className="py-2 pr-3 text-right">Desc.</th>
                            <th className="py-2 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(order.items || order.SalesOrderItem || []).map((item: any, index: number) => (
                            <tr key={item.id || `${order.id}-${index}`} className="border-b border-slate-100 last:border-0">
                              <td className="py-3 pr-3 font-black text-slate-700">{item.code || item.product_code || "-"}</td>
                              <td className="py-3 pr-3 font-black text-slate-950">{item.name || item.product_name || "Produto sem nome"}</td>
                              <td className="py-3 pr-3 text-right font-bold text-slate-700">{Number(item.quantity || 0).toLocaleString("pt-BR")}</td>
                              <td className="py-3 pr-3 text-right font-bold text-slate-700">{money(item.unit_price)}</td>
                              <td className="py-3 pr-3 text-right font-bold text-slate-700">{money(item.discount)}</td>
                              <td className="py-3 text-right font-black text-emerald-700">{money(item.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {(order.items || order.SalesOrderItem || []).length === 0 && (
                      <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-white p-5 text-center text-xs font-bold text-slate-400">
                        Nenhum produto salvo neste pedido. Refaça o OCR e salve novamente para alimentar o histórico do cliente.
                      </div>
                    )}
                  </div>
                )}
              </article>
            ))}

            {!loadingOrders && orders.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-sm font-bold text-slate-400">
                Nenhum pedido encontrado com os filtros atuais.
              </div>
            )}
          </div>
        </section>
      </div>

      {editingOrder && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4">
          <div className="w-full max-w-xl rounded-[28px] bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-black text-slate-950">Editar pedido</h3>
                <p className="text-sm font-medium text-slate-500">
                  Ajuste os principais dados do pedido.
                </p>
              </div>
              <button
                onClick={() => setEditingOrder(null)}
                className="rounded-full bg-slate-100 px-3 py-2 text-sm font-black text-slate-600"
              >
                X
              </button>
            </div>

            <div className="mt-5 grid gap-3">
              <Input label="Número do pedido" value={editForm.order_number} onChange={(v) => setEditForm({ ...editForm, order_number: v })} />
              <Input label="Cliente" value={editForm.customer_name} onChange={(v) => setEditForm({ ...editForm, customer_name: v })} />
              <Input label="Forma de pagamento" value={editForm.payment_terms} onChange={(v) => setEditForm({ ...editForm, payment_terms: v })} />
              <Input label="Data de entrega" type="date" value={editForm.delivery_date} onChange={(v) => setEditForm({ ...editForm, delivery_date: v })} />
              <Input label="Total" value={editForm.total} onChange={(v) => setEditForm({ ...editForm, total: v })} />

              <label className="grid gap-1">
                <span className="text-xs font-black uppercase text-slate-400">Status</span>
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-emerald-400"
                >
                  <option value="registrado">Registrado</option>
                  <option value="conferido">Conferido</option>
                  <option value="entregue">Entregue</option>
                  <option value="nao_entregue">Não entregue</option>
                  <option value="cancelado">Cancelado</option>
                </select>
              </label>
            </div>

            <div className="mt-5 rounded-3xl border border-slate-100 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-black text-slate-950">Produtos do pedido</h4>
                  <p className="text-xs font-bold text-slate-500">Itens lidos no OCR e salvos no histórico do cliente.</p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-600">
                  {(editingOrder.items || editingOrder.SalesOrderItem || []).length} itens
                </span>
              </div>

              <div className="mt-3 max-h-56 overflow-auto rounded-2xl bg-white">
                {(editingOrder.items || editingOrder.SalesOrderItem || []).map((item: any, index: number) => (
                  <div key={item.id || index} className="grid grid-cols-[1fr_auto] gap-3 border-b border-slate-100 p-3 last:border-0">
                    <div>
                      <strong className="block text-xs font-black text-slate-950">
                        {item.code || item.product_code || "-"} · {item.name || item.product_name || "Produto sem nome"}
                      </strong>
                      <span className="text-[11px] font-bold text-slate-400">
                        Qtd {Number(item.quantity || 0).toLocaleString("pt-BR")} · Unit. {money(item.unit_price)}
                      </span>
                    </div>
                    <strong className="text-xs font-black text-emerald-700">{money(item.total)}</strong>
                  </div>
                ))}

                {(editingOrder.items || editingOrder.SalesOrderItem || []).length === 0 && (
                  <div className="p-4 text-center text-xs font-bold text-slate-400">
                    Nenhum produto vinculado a este pedido.
                  </div>
                )}
              </div>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <button
                onClick={() => setEditForm({ ...editForm, status: "entregue" })}
                className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white transition hover:bg-emerald-700"
              >
                Marcar como entregue
              </button>
              <button
                onClick={() => setEditForm({ ...editForm, status: "nao_entregue" })}
                className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-black text-amber-700 transition hover:bg-amber-100"
              >
                Marcar como não entregue
              </button>
            </div>

            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setEditingOrder(null)}
                className="flex-1 rounded-2xl border border-slate-200 px-5 py-3 text-sm font-black text-slate-700"
              >
                Cancelar
              </button>
              <button
                onClick={updateOrder}
                className="flex-1 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black text-white"
              >
                Salvar alterações
              </button>
            </div>
          </div>
        </div>
      )}

      {nonDeliveryOrder && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-[28px] bg-white p-6 shadow-2xl">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-red-600">Pedido não entregue</p>
            <h3 className="mt-2 text-2xl font-black text-slate-950">
              {nonDeliveryOrder.customer_name || "Cliente sem nome"}
            </h3>
            <p className="mt-1 text-sm font-bold text-slate-500">
              Pedido {nonDeliveryOrder.order_number || "-"} · {money(nonDeliveryOrder.total)}
            </p>

            <label className="mt-5 grid gap-2">
              <span className="text-xs font-black uppercase text-slate-400">Motivo obrigatório</span>
              <textarea
                value={nonDeliveryReason}
                onChange={(e) => setNonDeliveryReason(e.target.value)}
                placeholder="Ex: cliente fechado, mercadoria recusada, endereço errado, reagendar entrega..."
                className="min-h-[130px] rounded-2xl border border-slate-200 p-4 text-sm font-bold outline-none focus:border-red-400"
              />
            </label>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={() => {
                  setNonDeliveryOrder(null);
                  setNonDeliveryReason("");
                }}
                className="flex-1 rounded-2xl border border-slate-200 px-5 py-3 text-sm font-black text-slate-700"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (!nonDeliveryReason.trim()) {
                    alert("Informe o motivo para marcar como não entregue.");
                    return;
                  }
                  updateOrderStatus(nonDeliveryOrder, "nao_entregue", nonDeliveryReason);
                }}
                className="flex-1 rounded-2xl bg-red-600 px-5 py-3 text-sm font-black text-white"
              >
                Salvar como não entregue
              </button>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}

function Info({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <span className="text-xs font-black uppercase text-slate-400">{label}</span>
      <strong className="mt-1 block break-words text-sm font-black text-slate-950">{value}</strong>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-xs font-black uppercase text-slate-400">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-emerald-400"
      />
    </label>
  );
}
