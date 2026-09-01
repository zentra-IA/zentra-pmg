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

function formatExtractedDeliveryDate(value?: string | null) {
  if (!value) return "-";

  const text = String(value).trim();

  // PDF PMG retorna YYYY-MM-DD. Exibimos no padrão brasileiro
  // sem converter por timezone e sem alterar o valor salvo.
  const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);

  if (isoDate) {
    const [, year, month, day] = isoDate;
    return `${day}/${month}/${year}`;
  }

  // O espelho em imagem já pode retornar DD/MM/YYYY.
  // Nesse caso preservamos exatamente como veio.
  return text;
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

function normalizeOrderSearch(value: any) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(
      /\b(mussarela|mucarela|mozarela|mozzarella)\b/g,
      "mucarela"
    )
    .replace(/\s+/g, " ")
    .trim();
}

function smartSearchPrefix(value: string) {
  const raw = String(value || "").trim();
  const match = raw.match(
    /^(produto|item|cliente|pedido|vendedor)\s*[:#-]?\s+(.+)$/i
  );

  if (!match) {
    return {
      scope: "",
      value: raw,
    };
  }

  const scopeMap: Record<string, string> = {
    produto: "product",
    item: "product",
    cliente: "customer",
    pedido: "order",
    vendedor: "seller",
  };

  return {
    scope:
      scopeMap[match[1].toLowerCase()] || "",
    value: match[2].trim(),
  };
}

function matchedOrderItems(
  order: any,
  appliedFilters: any
) {
  const items =
    order?.items ||
    order?.SalesOrderItem ||
    [];

  const explicitProduct = String(
    appliedFilters?.product || ""
  ).trim();

  const productCode = String(
    appliedFilters?.productCode || ""
  ).trim();

  const smart = smartSearchPrefix(
    String(appliedFilters?.q || "")
  );

  const selectedScope = String(
    appliedFilters?.searchIn || "all"
  );

  let smartProductQuery = "";

  if (smart.scope === "product") {
    smartProductQuery = smart.value;
  } else if (
    !smart.scope &&
    ["all", "product"].includes(selectedScope)
  ) {
    smartProductQuery = smart.value;
  }

  const productQuery =
    explicitProduct || smartProductQuery;

  if (!productQuery && !productCode) {
    return [];
  }

  const terms = normalizeOrderSearch(productQuery)
    .split(/\s+/)
    .filter(Boolean);

  const normalizedCode =
    normalizeOrderSearch(productCode);

  return items.filter((item: any) => {
    const name = normalizeOrderSearch(
      item?.name ||
        item?.product_name ||
        ""
    );

    const code = normalizeOrderSearch(
      item?.code ||
        item?.product_code ||
        ""
    );

    const haystack = `${name} ${code}`.trim();

    const matchesProduct =
      !terms.length ||
      terms.every((term) =>
        haystack.includes(term)
      );

    const matchesCode =
      !normalizedCode ||
      code.includes(normalizedCode);

    return matchesProduct && matchesCode;
  });
}

export default function OrdersPage() {
  const [file, setFile] = useState<File | null>(null);
  const [typedOrder, setTypedOrder] = useState("");
  const [extracted, setExtracted] = useState<ExtractedOrder | null>(null);
  const [comparison, setComparison] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [performance, setPerformance] = useState<any>(null);
  const [performancePeriod, setPerformancePeriod] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [goalEditing, setGoalEditing] = useState(false);
  const [goalValue, setGoalValue] = useState("");
  const [savingGoal, setSavingGoal] = useState(false);
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
    searchIn: "all",
    status: "",
    orderBy: "created_desc",
    customer: "",
    seller: "",
    product: "",
    productCode: "",
    payment: "",
    minTotal: "",
    maxTotal: "",
    limit: "80",
  });

  const [advancedFiltersOpen, setAdvancedFiltersOpen] =
    useState(false);

  const [ordersSummary, setOrdersSummary] = useState({
    order_count: 0,
    total_sales: 0,
    average_ticket: 0,
  });

  const [appliedFilters, setAppliedFilters] =
    useState(filters);

  const totalItems = useMemo(() => extracted?.items?.length || 0, [extracted]);

  const activeAdvancedFilters = useMemo(() => {
    return [
      filters.customer,
      filters.seller,
      filters.product,
      filters.productCode,
      filters.payment,
      filters.minTotal,
      filters.maxTotal,
    ].filter((value) => String(value || "").trim()).length;
  }, [
    filters.customer,
    filters.seller,
    filters.product,
    filters.productCode,
    filters.payment,
    filters.minTotal,
    filters.maxTotal,
  ]);

  async function loadOrders() {
    setLoadingOrders(true);

    try {
      const params = new URLSearchParams();

      Object.entries(filters).forEach(
        ([key, value]) => {
          if (String(value || "").trim()) {
            params.set(key, String(value));
          }
        }
      );

      const res = await fetch(
        `/api/crm/orders?${params.toString()}`,
        { cache: "no-store" }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data.error ||
            "Erro ao carregar pedidos."
        );
      }

      setOrders(
        Array.isArray(data.orders)
          ? data.orders
          : []
      );

      setOrdersSummary({
        order_count: Number(
          data?.summary?.order_count || 0
        ),
        total_sales: Number(
          data?.summary?.total_sales || 0
        ),
        average_ticket: Number(
          data?.summary?.average_ticket || 0
        ),
      });

      setAppliedFilters({ ...filters });
    } catch (error: any) {
      console.error(
        "ERRO AO FILTRAR PEDIDOS:",
        error
      );

      setOrders([]);
      setOrdersSummary({
        order_count: 0,
        total_sales: 0,
        average_ticket: 0,
      });

      alert(
        error?.message ||
          "Erro ao carregar pedidos."
      );
    } finally {
      setLoadingOrders(false);
    }
  }

  function clearOrderFilters() {
    setFilters({
      period: "",
      from: "",
      to: "",
      q: "",
      searchIn: "all",
      status: "",
      orderBy: "created_desc",
      customer: "",
      seller: "",
      product: "",
      productCode: "",
      payment: "",
      minTotal: "",
      maxTotal: "",
      limit: "80",
    });
  }

  async function loadPerformance(period = performancePeriod) {
    const [year, month] = period.split("-").map(Number);

    const params = new URLSearchParams({
      year: String(year),
      month: String(month),
    });

    const res = await fetch(`/api/crm/performance?${params.toString()}`, {
      cache: "no-store",
    });

    const data = await res.json();

    if (!data.error) {
      setPerformance(data);
      setGoalValue(String(Number(data?.seller?.goal_amount || 0)));
    }
  }

  async function saveMonthlyGoal() {
    const [year, month] = performancePeriod.split("-").map(Number);
    const normalized = Number(
      String(goalValue || "0").replace(/\./g, "").replace(",", ".")
    );

    if (!Number.isFinite(normalized) || normalized < 0) {
      alert("Informe uma meta válida.");
      return;
    }

    setSavingGoal(true);

    try {
      const res = await fetch("/api/crm/performance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year,
          month,
          goal_amount: normalized,
          seller_id: performance?.scope?.seller_id || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || "Erro ao salvar meta.");
      }

      setGoalEditing(false);
      await loadPerformance(performancePeriod);
    } catch (error: any) {
      alert(error?.message || "Erro ao salvar meta.");
    } finally {
      setSavingGoal(false);
    }
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
    loadPerformance(performancePeriod);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [performancePeriod]);

  useEffect(() => {
    loadDeliverySummary();
  }, []);

  async function analyzeOcr() {
    if (!file) {
      alert("Selecione a imagem do espelho ou o PDF do pedido PMG.");
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
  const selectedPeriodStatus = String(seller.period_status || "current");
  const history = Array.isArray(performance?.history) ? performance.history : [];

  const performancePeriodOptions = useMemo(() => {
    const options: Array<{ value: string; label: string }> = [];
    const now = new Date();

    for (let i = 0; i < 12; i += 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const label = date.toLocaleDateString("pt-BR", {
        month: "long",
        year: "numeric",
      });

      options.push({
        value,
        label: label.charAt(0).toUpperCase() + label.slice(1),
      });
    }

    return options;
  }, []);

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

        <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">
                Performance mensal
              </p>
              <h2 className="mt-1 text-lg font-black text-slate-950">
                Meta e evolução de vendas
              </h2>
              <p className="mt-1 text-sm font-medium text-slate-500">
                Consulte o mês atual ou meses anteriores e acompanhe quanto da meta foi atingido.
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <select
                value={performancePeriod}
                onChange={(e) => {
                  setPerformancePeriod(e.target.value);
                  setGoalEditing(false);
                }}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 outline-none focus:border-emerald-400"
              >
                {performancePeriodOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => {
                  setGoalValue(String(Number(seller.goal_amount || 0)));
                  setGoalEditing((current) => !current);
                }}
                className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black text-white transition hover:bg-emerald-700"
              >
                {goalEditing ? "Cancelar" : "Definir minha meta"}
              </button>
            </div>
          </div>

          {goalEditing && (
            <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 sm:flex-row sm:items-end">
              <label className="grid flex-1 gap-1">
                <span className="text-xs font-black uppercase text-emerald-700">
                  Meta do mês selecionado
                </span>
                <input
                  value={goalValue}
                  onChange={(e) => setGoalValue(e.target.value)}
                  inputMode="decimal"
                  placeholder="100000"
                  className="rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm font-black text-slate-900 outline-none focus:border-emerald-500"
                />
              </label>

              <button
                type="button"
                onClick={saveMonthlyGoal}
                disabled={savingGoal}
                className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {savingGoal ? "Salvando..." : "Salvar meta"}
              </button>
            </div>
          )}
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
            <p className="text-xs font-black uppercase text-slate-400">
              {Number(seller.exceeded || 0) > 0 ? "Meta superada" : selectedPeriodStatus === "past" ? "Faltou para meta" : "Falta vender"}
            </p>
            <strong
              className={`mt-2 block text-2xl font-black ${
                Number(seller.exceeded || 0) > 0
                  ? "text-emerald-700"
                  : "text-red-600"
              }`}
            >
              {money(
                Number(seller.exceeded || 0) > 0
                  ? seller.exceeded
                  : seller.remaining
              )}
            </strong>
            <p className="mt-1 text-xs font-bold text-slate-500">
              {selectedPeriodStatus === "current"
                ? `Necessário/dia: ${money(seller.daily_needed)}`
                : selectedPeriodStatus === "past"
                  ? "Resultado fechado do período"
                  : "Mês futuro"}
            </p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase text-slate-400">
              {selectedPeriodStatus === "current" ? "Projeção do mês" : "Resultado do mês"}
            </p>
            <strong className="mt-2 block text-2xl font-black text-emerald-700">
              {money(
                selectedPeriodStatus === "current"
                  ? seller.projected_month_total
                  : seller.total_sales
              )}
            </strong>
            <p className="mt-1 text-xs font-bold text-slate-500">
              Média diária: {money(seller.daily_average)}
            </p>
          </div>
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">
              Evolução
            </p>
            <h2 className="mt-1 text-lg font-black text-slate-950">
              Meta batida nos últimos meses
            </h2>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            {history.map((item: any) => {
              const label = new Date(item.year, item.month - 1, 1).toLocaleDateString(
                "pt-BR",
                { month: "short", year: "2-digit" }
              );

              const itemPercent = Number(item.percent || 0);
              const hit = itemPercent >= 100;

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setPerformancePeriod(item.key)}
                  className={`rounded-2xl border p-4 text-left transition ${
                    item.key === performancePeriod
                      ? "border-emerald-300 bg-emerald-50"
                      : "border-slate-100 bg-slate-50 hover:border-emerald-200"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-black uppercase text-slate-500">
                      {label}
                    </span>
                    <span
                      className={`rounded-full px-2 py-1 text-[10px] font-black ${
                        hit
                          ? "bg-emerald-100 text-emerald-700"
                          : item.goal_amount > 0
                            ? "bg-amber-100 text-amber-700"
                            : "bg-slate-200 text-slate-500"
                      }`}
                    >
                      {hit ? "Meta batida" : item.goal_amount > 0 ? "Em evolução" : "Sem meta"}
                    </span>
                  </div>

                  <strong className="mt-3 block text-xl font-black text-slate-950">
                    {itemPercent.toFixed(1)}%
                  </strong>

                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
                    <div
                      className="h-full rounded-full bg-emerald-600"
                      style={{ width: `${Math.min(itemPercent, 100)}%` }}
                    />
                  </div>

                  <div className="mt-3 text-[11px] font-bold leading-5 text-slate-500">
                    <div>Vendido: {money(item.total_sales)}</div>
                    <div>Meta: {money(item.goal_amount)}</div>
                  </div>
                </button>
              );
            })}
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
              Envie a imagem do espelho ou o PDF completo do pedido PMG. O sistema mantém o mesmo fluxo e valida os produtos pelo catálogo PMG antes de salvar.
            </p>

            <label className="mt-5 flex cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50 p-6 text-center transition hover:border-emerald-300 hover:bg-emerald-50/40">
              <span className="text-sm font-black text-slate-900">
                {file ? file.name : "Clique para selecionar a imagem ou PDF"}
              </span>
              <span className="mt-1 text-xs font-bold text-slate-500">
                PNG, JPG, JPEG, WEBP ou PDF do pedido PMG
              </span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp,application/pdf,.pdf"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </label>

            <button
              onClick={analyzeOcr}
              disabled={loadingOcr}
              className="mt-4 w-full rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
            >
              {loadingOcr ? "Lendo pedido..." : "Ler pedido com IA"}
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
                  <Info label="Entrega" value={formatExtractedDeliveryDate(extracted.delivery_date)} />
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


                    {comparison.reviewItems?.length > 0 && (
                      <div className="mt-5">
                        <h4 className="text-sm font-black text-amber-800">
                          🔎 Itens que exigem revisão manual
                        </h4>
                        <div className="mt-2 grid gap-2">
                          {comparison.reviewItems.map((item: any, index: number) => (
                            <div
                              key={index}
                              className="rounded-2xl border border-amber-200 bg-white p-4 text-sm"
                            >
                              <strong className="block text-slate-950">
                                {item.productName || item.product || "Produto não identificado"}
                              </strong>
                              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                <span className="font-bold text-slate-600">
                                  Digitado: {item.typedQuantity || item.quantity || "-"}
                                </span>
                                <span className="font-bold text-slate-600">
                                  Espelho: {item.mirrorQuantity || "-"}
                                </span>
                              </div>
                              {item.message && (
                                <p className="mt-2 font-bold text-amber-700">
                                  {item.message}
                                </p>
                              )}
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
          <div className="flex flex-col gap-5">
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-black text-slate-950">
                    Histórico de pedidos
                  </h2>

                  {activeAdvancedFilters > 0 && (
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-black text-emerald-700">
                      {activeAdvancedFilters} filtro(s) avançado(s)
                    </span>
                  )}
                </div>

                <p className="mt-1 text-sm font-medium text-slate-500">
                  Busca inteligente por pedido, cliente, vendedor e produtos comprados.
                </p>

                <p className="mt-1 text-xs font-bold text-slate-400">
                  Exemplos: “muçarela imperador”, “produto: farinha 101”, “cliente: Trevo”, “vendedor: Emilia” ou “pedido: 12345”.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setAdvancedFiltersOpen(
                      (current) => !current
                    )
                  }
                  className={`rounded-2xl border px-4 py-2.5 text-xs font-black transition ${
                    advancedFiltersOpen
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  ⚙ Filtros avançados
                  {activeAdvancedFilters > 0
                    ? ` (${activeAdvancedFilters})`
                    : ""}
                </button>

                <button
                  type="button"
                  onClick={clearOrderFilters}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-slate-600 transition hover:bg-slate-50"
                >
                  Limpar filtros
                </button>
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[170px_170px_170px_190px_1fr_130px]">
              <select
                value={filters.period}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    period: e.target.value,
                    from: "",
                    to: "",
                  })
                }
                className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold outline-none focus:border-emerald-400"
              >
                <option value="">Todo período</option>
                <option value="today">Hoje</option>
                <option value="yesterday">Ontem</option>
                <option value="7d">Últimos 7 dias</option>
                <option value="month">Este mês</option>
              </select>

              <input
                type="date"
                title="Entrega a partir de"
                value={filters.from}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    from: e.target.value,
                    period: "",
                  })
                }
                className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold outline-none focus:border-emerald-400"
              />

              <input
                type="date"
                title="Entrega até"
                value={filters.to}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    to: e.target.value,
                    period: "",
                  })
                }
                className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold outline-none focus:border-emerald-400"
              />

              <select
                value={filters.status}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    status: e.target.value,
                  })
                }
                className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold outline-none focus:border-emerald-400"
              >
                <option value="">Todos os status</option>
                <option value="registrado">Registrado</option>
                <option value="conferido">Conferido</option>
                <option value="entregue">Entregue</option>
                <option value="nao_entregue">Não entregue</option>
                <option value="cancelado">Cancelado</option>
              </select>

              <select
                value={filters.orderBy}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    orderBy: e.target.value,
                  })
                }
                className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold outline-none focus:border-emerald-400"
              >
                <option value="created_desc">Mais recentes</option>
                <option value="oldest">Mais antigos</option>
                <option value="value_desc">Maior valor</option>
                <option value="value_asc">Menor valor</option>
              </select>

              <select
                value={filters.limit}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    limit: e.target.value,
                  })
                }
                className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold outline-none focus:border-emerald-400"
              >
                <option value="40">40 resultados</option>
                <option value="80">80 resultados</option>
                <option value="120">120 resultados</option>
                <option value="200">200 resultados</option>
              </select>
            </div>

            <div className="grid gap-2 md:grid-cols-[190px_1fr_140px]">
              <select
                value={filters.searchIn}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    searchIn: e.target.value,
                  })
                }
                className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-black text-slate-700 outline-none focus:border-emerald-400"
              >
                <option value="all">🔎 Buscar em tudo</option>
                <option value="product">📦 Só produtos</option>
                <option value="customer">👤 Só clientes</option>
                <option value="order">🧾 Só nº pedido</option>
                <option value="seller">💼 Só vendedor</option>
              </select>

              <div className="relative">
                <input
                  value={filters.q}
                  onChange={(e) =>
                    setFilters({
                      ...filters,
                      q: e.target.value,
                    })
                  }
                  onKeyDown={(e) =>
                    e.key === "Enter" &&
                    loadOrders()
                  }
                  placeholder="Busca inteligente: produto, cliente, vendedor, nº do pedido, documento, pagamento..."
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 pr-12 text-sm font-bold outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-50"
                />

                {filters.q && (
                  <button
                    type="button"
                    aria-label="Limpar busca"
                    onClick={() =>
                      setFilters({
                        ...filters,
                        q: "",
                      })
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full px-2 py-1 text-xs font-black text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    ×
                  </button>
                )}
              </div>

              <button
                onClick={loadOrders}
                disabled={loadingOrders}
                className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {loadingOrders
                  ? "Buscando..."
                  : "Filtrar"}
              </button>
            </div>

            {advancedFiltersOpen && (
              <div className="rounded-3xl border border-emerald-100 bg-emerald-50/40 p-4">
                <div className="mb-3">
                  <strong className="text-sm font-black text-slate-900">
                    Filtros avançados
                  </strong>
                  <p className="mt-1 text-xs font-bold text-slate-500">
                    Combine vários campos. Ex.: produto “muçarela imperador” + cliente “Trevo” + valor mínimo R$ 500.
                  </p>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <label className="grid gap-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                      Produto
                    </span>
                    <input
                      value={filters.product}
                      onChange={(e) =>
                        setFilters({
                          ...filters,
                          product: e.target.value,
                        })
                      }
                      onKeyDown={(e) =>
                        e.key === "Enter" &&
                        loadOrders()
                      }
                      placeholder="Ex: muçarela imperador"
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold outline-none focus:border-emerald-400"
                    />
                  </label>

                  <label className="grid gap-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                      Código do produto
                    </span>
                    <input
                      value={filters.productCode}
                      onChange={(e) =>
                        setFilters({
                          ...filters,
                          productCode: e.target.value,
                        })
                      }
                      onKeyDown={(e) =>
                        e.key === "Enter" &&
                        loadOrders()
                      }
                      placeholder="Código / SKU"
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold outline-none focus:border-emerald-400"
                    />
                  </label>

                  <label className="grid gap-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                      Cliente
                    </span>
                    <input
                      value={filters.customer}
                      onChange={(e) =>
                        setFilters({
                          ...filters,
                          customer: e.target.value,
                        })
                      }
                      onKeyDown={(e) =>
                        e.key === "Enter" &&
                        loadOrders()
                      }
                      placeholder="Nome, ID ou documento"
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold outline-none focus:border-emerald-400"
                    />
                  </label>

                  <label className="grid gap-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                      Vendedor
                    </span>
                    <input
                      value={filters.seller}
                      onChange={(e) =>
                        setFilters({
                          ...filters,
                          seller: e.target.value,
                        })
                      }
                      onKeyDown={(e) =>
                        e.key === "Enter" &&
                        loadOrders()
                      }
                      placeholder="Nome ou código"
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold outline-none focus:border-emerald-400"
                    />
                  </label>

                  <label className="grid gap-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                      Pagamento
                    </span>
                    <input
                      value={filters.payment}
                      onChange={(e) =>
                        setFilters({
                          ...filters,
                          payment: e.target.value,
                        })
                      }
                      onKeyDown={(e) =>
                        e.key === "Enter" &&
                        loadOrders()
                      }
                      placeholder="Ex: boleto 28 dias"
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold outline-none focus:border-emerald-400"
                    />
                  </label>

                  <label className="grid gap-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                      Valor mínimo
                    </span>
                    <input
                      value={filters.minTotal}
                      onChange={(e) =>
                        setFilters({
                          ...filters,
                          minTotal: e.target.value,
                        })
                      }
                      onKeyDown={(e) =>
                        e.key === "Enter" &&
                        loadOrders()
                      }
                      inputMode="decimal"
                      placeholder="Ex: 500"
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold outline-none focus:border-emerald-400"
                    />
                  </label>

                  <label className="grid gap-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                      Valor máximo
                    </span>
                    <input
                      value={filters.maxTotal}
                      onChange={(e) =>
                        setFilters({
                          ...filters,
                          maxTotal: e.target.value,
                        })
                      }
                      onKeyDown={(e) =>
                        e.key === "Enter" &&
                        loadOrders()
                      }
                      inputMode="decimal"
                      placeholder="Ex: 5000"
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold outline-none focus:border-emerald-400"
                    />
                  </label>

                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={loadOrders}
                      disabled={loadingOrders}
                      className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-emerald-700 disabled:opacity-60"
                    >
                      Aplicar combinação
                    </button>
                  </div>
                </div>

                <div className="mt-3 rounded-2xl border border-emerald-100 bg-white/80 px-4 py-3 text-xs font-bold leading-5 text-slate-500">
                  💡 A busca de produto considera os termos juntos no mesmo item e reconhece variações comuns como muçarela, mussarela e mucarela.
                </div>
              </div>
            )}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              <span className="text-xs font-black uppercase text-slate-400">Pedidos filtrados</span>
              <strong className="mt-1 block text-xl font-black text-slate-950">{ordersSummary.order_count}</strong>
              {ordersSummary.order_count > orders.length && (
                <span className="mt-1 block text-[11px] font-bold text-slate-400">
                  Exibindo {orders.length} nesta consulta
                </span>
              )}
            </div>
            <div className="rounded-2xl bg-emerald-50 p-4">
              <span className="text-xs font-black uppercase text-emerald-700">Valor filtrado</span>
              <strong className="mt-1 block text-xl font-black text-emerald-800">
                {money(ordersSummary.total_sales)}
              </strong>
            </div>
            <div className="rounded-2xl bg-red-50 p-4">
              <span className="text-xs font-black uppercase text-red-700">Ticket médio filtrado</span>
              <strong className="mt-1 block text-xl font-black text-red-700">
                {money(ordersSummary.average_ticket)}
              </strong>
            </div>
          </div>

          <div className="mt-5 grid gap-3">
            {loadingOrders && (
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-6 text-center text-sm font-bold text-slate-500">
                Carregando pedidos...
              </div>
            )}

            {!loadingOrders && orders.map((order) => {
              const matchedItems = matchedOrderItems(
                order,
                appliedFilters
              );

              return (
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

                {matchedItems.length > 0 && (
                  <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700">
                        🔎 Produto encontrado
                      </span>

                      {matchedItems
                        .slice(0, 4)
                        .map((item: any, index: number) => (
                          <span
                            key={
                              item.id ||
                              `${order.id}-match-${index}`
                            }
                            className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-black text-emerald-800"
                          >
                            {item.name ||
                              item.product_name ||
                              "Produto"}
                            {(item.code ||
                              item.product_code)
                              ? ` • ${
                                  item.code ||
                                  item.product_code
                                }`
                              : ""}
                          </span>
                        ))}

                      {matchedItems.length > 4 && (
                        <span className="text-xs font-black text-emerald-700">
                          +{matchedItems.length - 4}
                        </span>
                      )}
                    </div>
                  </div>
                )}

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
              );
            })}

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
