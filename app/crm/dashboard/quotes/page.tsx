"use client";

import { useEffect, useMemo, useState } from "react";

type GeneratedQuote = {
  outputText: string;
  total: number;
  tableDate: string;
  items: any[];
  unresolved?: any[];
};

type CandidateGroup = {
  index: number;
  raw: string;
  parsed: any;
  quantity: number;
  quantityUnit?: string | null;
  discountPercent: number;
  optionCount?: number;
  discoveryMode?: boolean;
  searchText?: string;
  selectedCode?: string | null;
  selectedOptionId?: string | null;
  skipped?: boolean;
  options: any[];
};

type Customer = {
  id: string;
  internal_code?: string | null;
  erp_code?: string | null;
  document?: string | null;
  legal_name: string;
  trade_name?: string | null;
  whatsapp?: string | null;
  city?: string | null;
  state?: string | null;
  segment?: string | null;
};

const unitOptions = [
  ["", "Usar padrão do produto"],
  ["kg", "KG"],
  ["peca", "Peça"],
  ["caixa", "Caixa"],
  ["pacote", "Pacote"],
  ["balde", "Balde"],
  ["bisnaga", "Bisnaga"],
  ["unidade", "Unidade"],
  ["fardo", "Fardo"],
  ["lata", "Lata"],
  ["vidro", "Vidro"],
  ["galao", "Galão"],
  ["barrica", "Barrica"],
  ["bag", "Bag"],
];

const displayModes = [
  {
    value: "client_clean",
    title: "Cliente final limpo",
    desc: "Produto, quantidade, valor e subtotal. Melhor para WhatsApp.",
  },
  {
    value: "unit_and_total",
    title: "Unitário + subtotal",
    desc: "Mostra valor unitário e subtotal por item.",
  },
  {
    value: "kg_unit_box",
    title: "KG + unidade + caixa",
    desc: "Mostra cálculo completo para peça, KG e caixa.",
  },
  {
    value: "box_only",
    title: "Somente caixa",
    desc: "Ideal quando o cliente pediu por caixas.",
  },
  {
    value: "unit_only",
    title: "Somente unitário",
    desc: "Cotação curta com o menor volume de informação.",
  },
];

const DEFAULT_COMPANY_ID =
  process.env.NEXT_PUBLIC_DEFAULT_COMPANY_ID || "11111111-1111-4111-8111-111111111111";

function formatEngineQuoteText(data: any, clientName?: string) {
  const items = Array.isArray(data?.items) ? data.items : [];

  if (!items.length) {
    return "Nenhum item encontrado.";
  }

  const out: string[] = [];

  out.push("📋 *COTAÇÃO*");

  if (clientName) {
    out.push(`👤 Cliente: *${clientName}*`);
  }

  out.push("");

  items.forEach((item: any, index: number) => {
    const product =
      item?.selected?.descricaoOriginal ||
      item?.selected?.descriptionOriginal ||
      item?.selected?.produto ||
      item?.selected?.product ||
      item?.input?.raw ||
      `Item ${index + 1}`;

    const quantity = item?.convertedQuantity || item?.quantity || 1;

    const unit =
      (
        item?.convertedUnit ||
        item?.unit ||
        "UN"
      )
        .toString()
        .replace("PÇ", "peças")
        .replace("UN", "unidades")
        .replace("CX", "caixas")
        .replace("PCT", "pacotes")
        .replace("FD", "fardos")
        .replace("KG", "kg")
        .replace("BIS", "bisnagas")
        .replace("BD", "baldes");

    const unitPrice = Number(item?.unitPrice || 0);
    const subtotal = Number(item?.subtotal || 0);

    out.push("━━━━━━━━━━━━━━━━━━━━━━");

    out.push(`*${product}*`);

    out.push("");

    out.push(`📦 Quantidade: ${quantity} ${unit}`);

    if (unitPrice > 0) {
      out.push(`💲 Valor unitário: ${moneyBR(unitPrice)}`);
    }

    if (subtotal > 0) {
      out.push(`💰 Subtotal: ${moneyBR(subtotal)}`);
    }

    if (item?.needsReview) {
      out.push("⚠️ Confirmar produto");
    }

    out.push("");
  });

  out.push("━━━━━━━━━━━━━━━━━━━━━━");
  out.push("");
  out.push(`💵 *TOTAL DA COTAÇÃO*`);
  out.push(`*${moneyBR(data?.total || 0)}*`);

  if (data?.needsReview) {
    out.push("");
    out.push(
      "⚠️ Existem itens aguardando confirmação antes do envio."
    );
  }

  return out.join("\n");
}


function normalizeQuoteText(input: any): string {
  return String(input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ç/g, "c")
    .replace(/Ç/g, "C")
    .toLowerCase()
    .replace(/[^\w\s%.,/x-]/g, " ")
    .replace(/\bmussarela\b/g, "mucarela")
    .replace(/\bmuçarela\b/g, "mucarela")
    .replace(/\bmozarela\b/g, "mucarela")
    .replace(/\bmozzarella\b/g, "mucarela")
    .replace(/\bpepperi\b/g, "peperi")
    .replace(/\bpepery\b/g, "peperi")
    .replace(/\bperir\b/g, "peperi")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanSearchText(raw: string): string {
  let q = normalizeQuoteText(raw);
  q = q.replace(/desconto\s*(?:de)?\s*\d+(?:[,.]\d+)?\s*%?/g, " ");
  q = q.replace(/\b(mais barato|mais barata|mais baratos|mais baratas|mais vendido|mais vendida|mais vendidos|mais vendidas|menor preco|menor preço)\b/g, " ");
  q = q.replace(/^\s*\d+(?:[,.]\d+)?\s*/, "");
  q = q.replace(/^(kg|kilo|kilos|quilo|quilos|peca|pecas|pc|pç|bisnaga|bisnagas|bis|caixa|caixas|cx|pacote|pacotes|pct|balde|baldes|bd|unidade|unidades|un|fardo|fardos|fd|lata|latas|lt|vidro|vidros|vd|galao|gl)\s+/, "");
  return q.replace(/\s+/g, " ").trim();
}

function productHaystack(option: any): string {
  return normalizeQuoteText([
    option?.official_name,
    option?.product_name_from_pdf,
    option?.normalized_name,
    option?.category,
    option?.subcategory,
    option?.brand,
    option?.package_type,
    option?.sell_unit,
    option?.default_sell_unit,
    ...(option?.synonyms || []),
  ].join(" "));
}

function levenshteinClient(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[a.length][b.length];
}

function looseClientMatch(hay: string, token: string): boolean {
  const t = normalizeQuoteText(token);
  if (!t) return true;
  if (hay.includes(t)) return true;
  return hay.split(/\s+/).some((w) => {
    if (!w) return false;
    if (w === t) return true;
    if (t.length >= 4 && (w.startsWith(t) || t.startsWith(w))) return true;
    return t.length >= 5 && Math.abs(w.length - t.length) <= 2 && levenshteinClient(w, t) <= 2;
  });
}

function locallyFilterOptions(options: any[], query: string) {
  const cleaned = cleanSearchText(query);
  if (!cleaned) return options;
  const tokens = cleaned
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !["de", "da", "do", "das", "dos", "com", "sem", "mais", "barato", "barata", "desconto"].includes(t));
  if (!tokens.length) return options;

  return options
    .map((option) => {
      const hay = productHaystack(option);
      const score = tokens.reduce((acc, token) => acc + (looseClientMatch(hay, token) ? 1 : -3), 0);
      return { option, score };
    })
    .filter((x) => x.score >= Math.max(1, Math.ceil(tokens.length * 0.45)))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.option);
}

function moneyBR(value: any) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function customerLabel(c: Customer) {
  const name = c.trade_name || c.legal_name;
  const code = c.internal_code || c.erp_code || "";
  return `${name}${code ? ` • ID ${code}` : ""}${c.whatsapp ? ` • ${c.whatsapp}` : ""}`;
}

function optionSubtitle(option: any) {
  const parts = [
    option.code ? `Cód. ${option.code}` : null,
    option.brand ? `Marca: ${option.brand}` : null,
    option.category ? `Categoria: ${option.category}` : null,
    option.sell_unit ? `Vend. por: ${option.sell_unit}` : null,
  ].filter(Boolean);
  return parts.join(" • ");
}

function optionPrices(option: any) {
  const parts = [
    option.labelPrice ? `Unit.: ${option.labelPrice}` : null,
    option.labelKg ? `KG: ${option.labelKg}` : null,
    option.labelBox ? `Caixa: ${option.labelBox}` : null,
  ].filter(Boolean);
  return parts.join(" | ");
}

export default function QuotesPage() {
  const [clientName, setClientName] = useState("");
  const [clientId, setClientId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [quickCustomerOpen, setQuickCustomerOpen] = useState(false);
  const [quickCustomerName, setQuickCustomerName] = useState("");
  const [quickCustomerDocument, setQuickCustomerDocument] = useState("");

  const [requestText, setRequestText] = useState(
    "3 peças mussarela imperador\n2 fardos farinha anaconda pizza\n3 requeijão coronata com amido\n2 requeijão scala\n1 presunto peperi\n2 bisnagas chocolate ao leite confeiteiro"
  );
  const [displayMode, setDisplayMode] = useState("client_clean");
  const [loading, setLoading] = useState(false);
  const [quote, setQuote] = useState<GeneratedQuote | null>(null);
  const [tableDate, setTableDate] = useState("");
  const [candidateGroups, setCandidateGroups] = useState<CandidateGroup[]>([]);
  const [autoItems, setAutoItems] = useState<any[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [currentConfirmIndex, setCurrentConfirmIndex] = useState(0);
  const [manualSearch, setManualSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [status, setStatus] = useState("");
  const [savedStatus, setSavedStatus] = useState("");
  const [priceUploading, setPriceUploading] = useState(false);
  const [priceUploadStatus, setPriceUploadStatus] = useState("");

  useEffect(() => {
    fetchCustomers();
  }, []);

  async function fetchCustomers(q = "") {
    try {
      const res = await fetch(`/api/crm/customers${q ? `?q=${encodeURIComponent(q)}` : ""}`, { cache: "no-store" });
      const data = await res.json();
      setCustomers(data.customers || data.rows || []);
    } catch {
      setCustomers([]);
    }
  }

  const customerSuggestions = useMemo(() => {
    const q = normalizeQuoteText(customerSearch);
    if (!q) return customers.slice(0, 8);
    return customers
      .filter((c) => normalizeQuoteText([c.legal_name, c.trade_name, c.internal_code, c.erp_code, c.document, c.whatsapp].join(" ")).includes(q))
      .slice(0, 10);
  }, [customerSearch, customers]);

  const currentGroup = candidateGroups[currentConfirmIndex];
  const filteredCurrentOptions = useMemo(() => {
    if (!currentGroup) return [];
    return locallyFilterOptions(currentGroup.options || [], manualSearch || currentGroup.searchText || "");
  }, [currentGroup, manualSearch]);

  const progress = candidateGroups.length ? Math.round(((currentConfirmIndex + 1) / candidateGroups.length) * 100) : 0;

  function selectCustomer(c: Customer) {
    setCustomerId(c.id);
    setClientName(c.trade_name || c.legal_name || "");
    setClientId(c.internal_code || c.erp_code || "");
    setCustomerSearch(customerLabel(c));
  }

  async function quickCreateCustomer() {
    const legalName = quickCustomerName.trim() || customerSearch.trim();
    if (!legalName) {
      alert("Informe o nome ou empresa do cliente.");
      return;
    }

    try {
      const res = await fetch("/api/crm/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          legal_name: legalName,
          trade_name: legalName,
          document: quickCustomerDocument || null,
        }),
      });
      const data = await res.json();
      const created = data.customer || data;
      if (created?.id) {
        selectCustomer(created);
        setQuickCustomerOpen(false);
        setQuickCustomerName("");
        setQuickCustomerDocument("");
        await fetchCustomers();
      } else {
        setClientName(legalName);
        setClientId("");
        setCustomerSearch(legalName);
        setQuickCustomerOpen(false);
      }
    } catch {
      setClientName(legalName);
      setClientId("");
      setCustomerSearch(legalName);
      setQuickCustomerOpen(false);
    }
  }

  async function uploadPriceTablePdf(file: File | null) {
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setPriceUploadStatus("Envie um arquivo PDF da tabela de preços.");
      return;
    }

    setPriceUploading(true);
    setPriceUploadStatus("Carregando e lendo PDF do dia... isso pode levar alguns segundos.");
    setStatus("");

    try {
      const form = new FormData();
      form.append("companyId", DEFAULT_COMPANY_ID);
      form.append("file", file);

      const res = await fetch("/api/quotes/price-table/upload", {
        method: "POST",
        body: form,
      });

      const data = await res.json();

      if (!data.success) {
        setPriceUploadStatus(data.error || "Erro ao carregar a tabela de preços.");
        return;
      }

      setTableDate(data.tableDate || "");
      setPriceUploadStatus(
        `Tabela atualizada: ${data.updated || data.parsed || 0} preços lidos` +
          (data.unmatched ? ` • ${data.unmatched} códigos sem vínculo no catálogo` : "")
      );
    } catch (err: any) {
      setPriceUploadStatus(err?.message || "Erro ao carregar PDF.");
    } finally {
      setPriceUploading(false);
    }
  }

  async function generateQuote() {
    if (!tableDate && !priceUploadStatus) {
      setPriceUploadStatus("Atenção: carregue o PDF do dia para garantir preços atualizados antes de finalizar a cotação.");
    }

    setLoading(true);
    setQuote(null);
    setStatus("Interpretando pedido com IA e consultando a tabela PMG...");
    setSavedStatus("");

    try {
      const res = await fetch("/api/quotes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: DEFAULT_COMPANY_ID,
          customerId: customerId || null,
          rawText: requestText,
          requestText,
          clientName,
          clientId,
          displayMode,
        }),
      });
      const data = await res.json();

      if (!data.success) {
        setStatus(data.error || "Erro ao gerar cotação.");
        return;
      }

      if (Array.isArray(data.items)) {
        const normalizedQuote: GeneratedQuote = {
          ...data,
          outputText: data.outputText || formatEngineQuoteText(data, clientName),
          total: Number(data.total || 0),
          tableDate: data.tableDate || tableDate || "Dia atual",
          items: data.items || [],
          unresolved: data.items?.filter((item: any) => item.needsReview) || [],
        };

        setQuote(normalizedQuote);
        setTableDate(normalizedQuote.tableDate || "");
        setStatus(
          data.needsReview
            ? "Cotação gerada com itens para revisar."
            : "Cotação gerada com sucesso."
        );
        return;
      }

      setTableDate(data.tableDate || "");

      if (data.mode === "confirm") {
        setCandidateGroups(data.candidateGroups || []);
        setAutoItems(data.autoItems || []);
        setCurrentConfirmIndex(0);
        setManualSearch(data.candidateGroups?.[0]?.searchText || "");
        setConfirmOpen(true);
        setStatus("Revise os produtos sugeridos. Confirme item por item.");
        return;
      }

      setQuote(data);
      setStatus("Cotação gerada com sucesso.");
    } catch (err: any) {
      setStatus(err?.message || "Erro ao gerar cotação.");
    } finally {
      setLoading(false);
    }
  }

  function updateCurrentGroup(patch: Partial<CandidateGroup>) {
    setCandidateGroups((prev) =>
      prev.map((g, idx) => (idx === currentConfirmIndex ? { ...g, ...patch } : g))
    );
  }

  function goNextConfirmation() {
    if (currentConfirmIndex < candidateGroups.length - 1) {
      const next = currentConfirmIndex + 1;
      setCurrentConfirmIndex(next);
      setManualSearch(candidateGroups[next]?.searchText || "");
    } else {
      finalizeConfirmedQuote();
    }
  }

  function goPrevConfirmation() {
    if (currentConfirmIndex <= 0) return;
    const prev = currentConfirmIndex - 1;
    setCurrentConfirmIndex(prev);
    setManualSearch(candidateGroups[prev]?.searchText || "");
  }

  async function searchCatalog() {
    if (!currentGroup) return;
    const q = manualSearch.trim();
    if (!q) return;

    setSearching(true);
    try {
      const res = await fetch("/api/quotes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: DEFAULT_COMPANY_ID, rawText: q, requestText: q, searchOnly: true, query: q, limit: 80 }),
      });
      const data = await res.json();
      if (data.success) {
        updateCurrentGroup({
          options: data.options || [],
          selectedCode: data.options?.[0]?.code || null,
          selectedOptionId: data.options?.[0]?.id || null,
          searchText: q,
          skipped: false,
        });
      } else {
        alert(data.error || "Não encontrei produtos.");
      }
    } catch (err: any) {
      alert(err?.message || "Erro ao pesquisar.");
    } finally {
      setSearching(false);
    }
  }

  async function finalizeConfirmedQuote() {
    setConfirming(true);
    try {
      const confirmedItems = candidateGroups.map((g) => ({
        raw: g.raw,
        code: g.selectedCode,
        optionId: g.selectedOptionId || null,
        quantity: g.quantity,
        quantityUnit: g.quantityUnit,
        discountPercent: g.discountPercent,
        skipped: g.skipped || !g.selectedCode,
      }));

      const res = await fetch("/api/quotes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: DEFAULT_COMPANY_ID,
          rawText: requestText,
          requestText,
          customerId: customerId || null,
          confirmedItems,
          autoItems,
          clientName,
          clientId,
          displayMode,
          tableDate,
        }),
      });
      const data = await res.json();

      if (!data.success) {
        alert(data.error || "Erro ao finalizar cotação.");
        return;
      }

      setQuote(data);
      setConfirmOpen(false);
      setStatus("Cotação final gerada com sucesso.");
    } catch (err: any) {
      alert(err?.message || "Erro ao finalizar.");
    } finally {
      setConfirming(false);
    }
  }

  async function copyQuote() {
    if (!quote?.outputText) return;
    await navigator.clipboard.writeText(quote.outputText);
    setStatus("Cotação copiada. Agora é só colar no WhatsApp.");
  }

  async function saveQuote() {
    if (!quote) return;
    setSavedStatus("Salvando histórico...");
    try {
      const res = await fetch("/api/quotes/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: DEFAULT_COMPANY_ID,
          customerId: customerId || null,
          customerInternalCode: clientId || null,
          clientId: clientId || null,
          customerName: clientName,
          clientName,
          title: `Cotação ${clientName || "PMG"}`,
          requestText,
          outputText: quote.outputText,
          total: quote.total,
          priceDisplayMode: displayMode,
          tableDate: quote.tableDate || tableDate || null,
          items: quote.items || [],
          metadata: {
            customerId,
            customerInternalCode: clientId,
            clientId,
            displayMode,
            tableDate: quote.tableDate || tableDate,
          },
        }),
      });
      const data = await res.json();
      setSavedStatus(data.success ? "Histórico salvo com sucesso." : data.error || "Erro ao salvar.");
    } catch (err: any) {
      setSavedStatus(err?.message || "Erro ao salvar.");
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-3 py-4 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-5 p-5 sm:p-7 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-3 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-black uppercase tracking-wide text-emerald-700">
                Cotador IA PMG
              </div>
              <h1 className="text-2xl font-black tracking-tight sm:text-4xl">
                Cotações rápidas, bonitas e vinculadas ao CRM
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                Cole o pedido do cliente, confirme os produtos sugeridos e gere uma cotação profissional pronta para WhatsApp.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 rounded-3xl bg-slate-50 p-3 text-sm sm:min-w-[360px]">
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <p className="text-xs font-bold uppercase text-slate-400">Tabela</p>
                <p className="mt-1 font-black text-slate-900">{tableDate || "Dia atual"}</p>
              </div>
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <p className="text-xs font-bold uppercase text-slate-400">Tempo alvo</p>
                <p className="mt-1 font-black text-emerald-700">menos cliques</p>
              </div>
            </div>
          </div>
        </header>

        <section className="rounded-[2rem] border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="inline-flex rounded-full bg-white px-3 py-1 text-xs font-black uppercase tracking-wide text-emerald-700 shadow-sm">
                Tabela de preços do dia
              </div>
              <h2 className="mt-3 text-xl font-black text-slate-950 sm:text-2xl">
                Carregue o PDF diário antes de gerar as cotações
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                O catálogo continua sendo a base oficial dos produtos. Este PDF atualiza somente preço, unidade de venda e informações comerciais do dia.
              </p>
              <div className="mt-3 text-sm font-semibold text-slate-700">
                Status: <span className={tableDate ? "text-emerald-700" : "text-amber-700"}>{tableDate ? `tabela carregada em ${tableDate}` : "aguardando PDF do dia"}</span>
              </div>
              {priceUploadStatus && (
                <div className="mt-3 rounded-2xl border border-emerald-100 bg-white px-4 py-3 text-sm font-semibold text-emerald-800 shadow-sm">
                  {priceUploadStatus}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
              <input
                id="price-table-pdf-input"
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(e) => {
                  uploadPriceTablePdf(e.target.files?.[0] || null);
                  e.currentTarget.value = "";
                }}
              />
              <label
                htmlFor="price-table-pdf-input"
                className={`inline-flex cursor-pointer items-center justify-center rounded-2xl px-6 py-4 text-sm font-black text-white shadow-sm transition ${
                  priceUploading ? "bg-slate-400" : "bg-emerald-600 hover:bg-emerald-700"
                }`}
              >
                {priceUploading ? "Lendo PDF..." : "Carregar PDF do dia"}
              </label>
              <a
                href="/crm/dashboard/quotes/catalog"
                className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm font-black text-slate-800 transition hover:bg-slate-50"
              >
                Ver catálogo PMG
              </a>
            </div>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)_420px]">
          <aside className="space-y-5">
            <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-black">Cliente</h2>
                <button
                  onClick={() => setQuickCustomerOpen(true)}
                  className="rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white transition hover:bg-emerald-700"
                >
                  Novo
                </button>
              </div>

              <label className="mt-4 block text-xs font-bold uppercase text-slate-500">
                Buscar cliente cadastrado
              </label>
              <input
                value={customerSearch}
                onChange={(e) => {
                  setCustomerSearch(e.target.value);
                  fetchCustomers(e.target.value);
                }}
                placeholder="Nome, ID, CNPJ ou WhatsApp"
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:bg-white"
              />

              <div className="mt-3 max-h-56 space-y-2 overflow-auto pr-1">
                {customerSuggestions.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => selectCustomer(c)}
                    className={`w-full rounded-2xl border p-3 text-left text-sm transition ${
                      customerId === c.id ? "border-emerald-400 bg-emerald-50" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <div className="font-black text-slate-900">{c.trade_name || c.legal_name}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {[c.internal_code || c.erp_code, c.whatsapp, c.document].filter(Boolean).join(" • ") || "Cliente cadastrado"}
                    </div>
                  </button>
                ))}
                {!customerSuggestions.length && (
                  <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                    Nenhum cliente encontrado. Use o botão Novo para cadastrar rápido.
                  </div>
                )}
              </div>

              <div className="mt-4 grid gap-3">
                <input
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Nome que aparecerá na cotação"
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                />
                <input
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="ID interno opcional"
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-black">Preferência de envio</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Define como o cliente verá a cotação. O sistema continua calculando tudo internamente.
              </p>
              <div className="mt-4 space-y-2">
                {displayModes.map((mode) => (
                  <button
                    key={mode.value}
                    onClick={() => setDisplayMode(mode.value)}
                    className={`w-full rounded-2xl border p-3 text-left transition ${
                      displayMode === mode.value
                        ? "border-emerald-400 bg-emerald-50"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <div className="text-sm font-black">{mode.title}</div>
                    <div className="mt-1 text-xs text-slate-500">{mode.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-xl font-black">Pedido do cliente</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Uma linha por item. Exemplo: 3 peças mussarela imperador desconto 2%.
                </p>
              </div>
              <button
                onClick={() => setRequestText("")}
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                Limpar
              </button>
            </div>

            <textarea
              value={requestText}
              onChange={(e) => setRequestText(e.target.value)}
              className="mt-5 min-h-[440px] w-full resize-y rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5 text-base leading-7 outline-none transition focus:border-emerald-500 focus:bg-white"
              placeholder={`Cole aqui o pedido recebido pelo WhatsApp:\n3 peças mussarela imperador\n5 caixas mussarela camila desconto 2%\n10 requeijão sem amido bisnaga mais barato desconto 2,5%`}
            />

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-slate-500">
                {requestText.split(/\n/).filter((x) => x.trim()).length} linhas no pedido
              </div>
              <button
                disabled={loading}
                onClick={generateQuote}
                className="rounded-2xl bg-emerald-600 px-6 py-4 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Processando..." : "Buscar e confirmar produtos"}
              </button>
            </div>

            {status && (
              <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
                {status}
              </div>
            )}
          </section>

          <aside className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black">Cotação pronta</h2>
                <p className="mt-1 text-sm text-slate-500">Preview para copiar e enviar.</p>
              </div>
              {quote?.total ? (
                <div className="rounded-2xl bg-slate-950 px-4 py-3 text-right text-white">
                  <p className="text-[10px] font-bold uppercase text-slate-300">Total</p>
                  <p className="text-sm font-black">{moneyBR(quote.total)}</p>
                </div>
              ) : null}
            </div>

            <div className="mt-5 min-h-[480px] rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
              {quote?.outputText ? (
                <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6 text-slate-800">
                  {quote.outputText}
                </pre>
              ) : (
                <div className="flex min-h-[420px] flex-col items-center justify-center text-center">
                  <div className="rounded-full bg-white px-4 py-2 text-xs font-black uppercase text-slate-400 shadow-sm">
                    Aguardando cotação
                  </div>
                  <p className="mt-4 max-w-xs text-sm leading-6 text-slate-500">
                    Depois da confirmação, a cotação aparece aqui em formato limpo e profissional.
                  </p>
                </div>
              )}
            </div>

            <div className="mt-4 grid gap-3">
              <button
                disabled={!quote?.outputText}
                onClick={copyQuote}
                className="rounded-2xl bg-slate-950 px-5 py-4 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Copiar cotação
              </button>
              <button
                disabled={!quote?.outputText}
                onClick={saveQuote}
                className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-black text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Salvar histórico
              </button>
              {savedStatus && <p className="text-center text-xs font-semibold text-slate-500">{savedStatus}</p>}
            </div>
          </aside>
        </section>
      </div>

      {quickCustomerOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-950/40 p-3 backdrop-blur-sm sm:items-center sm:justify-center">
          <div className="w-full max-w-md rounded-[2rem] bg-white p-5 shadow-2xl">
            <h3 className="text-xl font-black">Cadastrar cliente rápido</h3>
            <p className="mt-1 text-sm text-slate-500">Depois você pode completar os dados na tela de clientes.</p>
            <div className="mt-5 grid gap-3">
              <input
                value={quickCustomerName}
                onChange={(e) => setQuickCustomerName(e.target.value)}
                placeholder="Nome ou empresa"
                className="rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-emerald-500"
              />
              <input
                value={quickCustomerDocument}
                onChange={(e) => setQuickCustomerDocument(e.target.value)}
                placeholder="CNPJ/CPF opcional"
                className="rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-emerald-500"
              />
            </div>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setQuickCustomerOpen(false)}
                className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 font-bold text-slate-600"
              >
                Cancelar
              </button>
              <button
                onClick={quickCreateCustomer}
                className="flex-1 rounded-2xl bg-emerald-600 px-4 py-3 font-black text-white"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmOpen && currentGroup && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 p-3 backdrop-blur-sm">
          <div className="mx-auto my-4 max-w-5xl rounded-[2rem] bg-white shadow-2xl">
            <div className="border-b border-slate-100 p-5 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase text-emerald-700">
                    Confirmação {currentConfirmIndex + 1} de {candidateGroups.length}
                  </p>
                  <h3 className="mt-1 text-2xl font-black">Confirme o produto correto</h3>
                  <p className="mt-2 text-sm text-slate-500">
                    Pedido original: <span className="font-bold text-slate-800">{currentGroup.raw}</span>
                  </p>
                </div>
                <button
                  onClick={() => setConfirmOpen(false)}
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600"
                >
                  Fechar
                </button>
              </div>
              <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-emerald-600" style={{ width: `${progress}%` }} />
              </div>
            </div>

            <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[300px_minmax(0,1fr)]">
              <aside className="space-y-4">
                <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                  <label className="text-xs font-black uppercase text-slate-500">Quantidade</label>
                  <input
                    type="number"
                    value={currentGroup.quantity}
                    onChange={(e) => updateCurrentGroup({ quantity: Number(e.target.value || 1) })}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-500"
                  />
                  <label className="mt-4 block text-xs font-black uppercase text-slate-500">Tipo/unidade</label>
                  <select
                    value={currentGroup.quantityUnit || ""}
                    onChange={(e) => updateCurrentGroup({ quantityUnit: e.target.value || null })}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-500"
                  >
                    {unitOptions.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>

                  <label className="mt-4 block text-xs font-black uppercase text-slate-500">Desconto interno</label>
                  <div className="mt-2 flex items-center rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <input
                      type="number"
                      step="0.1"
                      value={currentGroup.discountPercent || 0}
                      onChange={(e) => updateCurrentGroup({ discountPercent: Number(e.target.value || 0) })}
                      className="w-full bg-transparent text-sm outline-none"
                    />
                    <span className="text-sm font-bold text-slate-400">%</span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">Esse desconto não aparece para o cliente.</p>
                </div>

                <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4">
                  <label className="text-xs font-black uppercase text-slate-500">Buscar no catálogo</label>
                  <textarea
                    value={manualSearch}
                    onChange={(e) => setManualSearch(e.target.value)}
                    rows={3}
                    className="mt-2 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:bg-white"
                  />
                  <button
                    onClick={searchCatalog}
                    disabled={searching}
                    className="mt-3 w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white disabled:opacity-50"
                  >
                    {searching ? "Buscando..." : "Pesquisar novamente"}
                  </button>
                </div>

                <button
                  onClick={() => {
                    updateCurrentGroup({ skipped: true, selectedCode: null, selectedOptionId: null });
                    goNextConfirmation();
                  }}
                  className="w-full rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-black text-red-700"
                >
                  Pular este item
                </button>
              </aside>

              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-black">Produtos encontrados</h4>
                  <span className="text-xs font-bold text-slate-500">{filteredCurrentOptions.length} opções</span>
                </div>

                <div className="max-h-[560px] space-y-3 overflow-y-auto pr-1">
                  {filteredCurrentOptions.map((option) => {
                    const selected = currentGroup.selectedOptionId ? currentGroup.selectedOptionId === option.id : currentGroup.selectedCode === option.code;
                    return (
                      <button
                        key={`${option.id || option.code}-${option.official_name}`}
                        onClick={() => updateCurrentGroup({ selectedCode: option.code, selectedOptionId: option.id, skipped: false })}
                        className={`w-full rounded-[1.5rem] border p-4 text-left transition ${
                          selected
                            ? "border-emerald-500 bg-emerald-50 shadow-sm"
                            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="text-sm font-black text-slate-950">{option.official_name}</div>
                            <div className="mt-1 text-xs text-slate-500">{optionSubtitle(option)}</div>
                            <div className="mt-2 text-xs font-bold text-emerald-700">{optionPrices(option)}</div>
                          </div>
                          <div className={`rounded-full px-3 py-1 text-xs font-black ${selected ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-500"}`}>
                            {selected ? "Selecionado" : "Selecionar"}
                          </div>
                        </div>
                      </button>
                    );
                  })}

                  {!filteredCurrentOptions.length && (
                    <div className="rounded-[1.5rem] border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                      Nenhum produto encontrado. Ajuste o campo de busca e clique em Pesquisar novamente.
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    onClick={goPrevConfirmation}
                    disabled={currentConfirmIndex === 0}
                    className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-600 disabled:opacity-40"
                  >
                    Voltar
                  </button>
                  <button
                    onClick={goNextConfirmation}
                    disabled={confirming || (!currentGroup.selectedCode && !currentGroup.skipped)}
                    className="rounded-2xl bg-emerald-600 px-6 py-3 text-sm font-black text-white disabled:opacity-40"
                  >
                    {currentConfirmIndex === candidateGroups.length - 1
                      ? confirming ? "Gerando..." : "Finalizar cotação"
                      : "Confirmar e próximo"}
                  </button>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
