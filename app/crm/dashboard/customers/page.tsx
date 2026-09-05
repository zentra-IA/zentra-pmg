"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import CustomerPmgImporter from "./CustomerPmgImporter";

type Customer = {
  id: string;
  internal_code?: string | null;
  erp_code?: string | null;
  document?: string | null;
  legal_name: string;
  trade_name?: string | null;
  segment?: string | null;
  category?: string | null;
  buyer_name?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  cep?: string | null;
  address?: string | null;
  number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  payment_terms?: string | null;
  weekly_purchase_limit?: string | number | null;
  habitual_purchase_day?: string | null;
  purchase_weekdays?: string[];
  expected_ticket?: string | number | null;
  commercial_notes?: string | null;
  status: string;
  customer_score?: number;
  risk_level?: string;
  price_table?: number | null;
  distance_km?: string | number | null;
  created_at?: string;
  updated_at?: string;
  promotion_link_generated?: boolean;
  promotion_link_active?: boolean;
  promotion_portal_accessed?: boolean;
  promotion_push_enabled?: boolean;
  promotion_status?: "none" | "link" | "accessed" | "push" | string;
  promotion_access_count?: number;
  promotion_last_access_at?: string | null;
  promotion_push_permission?: string | null;
  last_order_at?: string | null;
  recent_order_count?: number;
  last_quote_at?: string | null;
  recent_quote_count?: number;
};

type CustomerActivity = {
  id: string;
  type?: string | null;
  title: string;
  description?: string | null;
  scheduled_at?: string | null;
  priority?: string | null;
  status?: string | null;
  customer_id?: string | null;
};

type PromotionLinkResponse = {
  success?: boolean;
  promotion_url?: string;
  error?: string;
};

type DistanceCalculationResponse = {
  success?: boolean;
  customer?: Customer;
  distance_calculation?: {
    distance_km: number;
    price_table: number;
    geocoded_address?: string;
    source?: "osrm" | "haversine";
  } | null;
  warning?: string | null;
  error?: string;
};

const EMPTY_FORM = {
  internal_code: "",
  erp_code: "",
  document: "",
  legal_name: "",
  trade_name: "",
  segment: "",
  category: "",
  buyer_name: "",
  phone: "",
  whatsapp: "",
  email: "",
  cep: "",
  address: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
  payment_terms: "",
  weekly_purchase_limit: "",
  habitual_purchase_day: "",
  purchase_weekdays: [] as string[],
  expected_ticket: "",
  commercial_notes: "",
  status: "prospect",
};

const WEEKDAYS = [
  "segunda",
  "terça",
  "quarta",
  "quinta",
  "sexta",
  "sábado",
  "domingo",
];

const EMPTY_NEXT_ACTION = {
  title: "Retornar cliente",
  date: "",
  time: "",
  description: "",
};

const STATUS_LABELS: Record<string, string> = {
  prospect: "Prospectando",
  cotacao: "Cotação enviada",
  pedido: "Pedido em andamento",
  ativo: "Compra ativa",
  risco: "Inativo / atenção",
  inativo: "Inativo",
  inadimplente: "Inadimplente",
  bloqueado: "Bloqueado",
};

const COMMERCIAL_KANBAN = [
  {
    id: "prospect",
    label: "Prospectando",
    helper: "Cliente ainda em abordagem",
  },
  {
    id: "cotacao",
    label: "Cotação enviada",
    helper: "Aguardando retorno da cotação",
  },
  {
    id: "pedido",
    label: "Pedido em andamento",
    helper: "Negociação virou pedido",
  },
  {
    id: "ativo",
    label: "Compra ativa",
    helper: "Cliente comprando regularmente",
  },
  {
    id: "inativo",
    label: "Inativo",
    helper: "Sem compra / precisa reativar",
  },
  {
    id: "inadimplente",
    label: "Inadimplente",
    helper: "Pendência financeira",
  },
  {
    id: "bloqueado",
    label: "Bloqueado",
    helper: "Cadastro bloqueado",
  },
];

const PORTAL_KANBAN = [
  { id: "none", label: "Sem link", helper: "Portal ainda não criado" },
  { id: "link", label: "Link gerado", helper: "Link pronto para envio" },
  { id: "accessed", label: "Portal acessado", helper: "Cliente já entrou" },
  { id: "push", label: "Push ativado", helper: "Notificações liberadas" },
];

function money(value: unknown) {
  const num = Number(value || 0);
  if (!Number.isFinite(num) || num <= 0) return "—";

  return num.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatDistance(value: unknown) {
  const distance = Number(value);

  if (!Number.isFinite(distance) || distance < 0) {
    return "Distância não calculada";
  }

  return `${distance.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} km`;
}

function priceTableLabel(value: unknown) {
  const table = Number(value);

  if (!Number.isInteger(table) || table < 0 || table > 5) {
    return "Tabela pendente";
  }

  return `Tabela ${table}`;
}

function normalizePhone(value?: string | null) {
  const digits = String(value || "").replace(/\D/g, "");

  if (!digits) return "";
  if (digits.startsWith("55")) return digits;

  return `55${digits}`;
}

function formatAddress(customer: Customer) {
  const line1 = [
    customer.address,
    customer.number ? `nº ${customer.number}` : "",
  ]
    .filter(Boolean)
    .join(", ");

  const line2 = [
    customer.neighborhood,
    customer.city,
    customer.state,
  ]
    .filter(Boolean)
    .join(" · ");

  return [line1, line2].filter(Boolean).join(" — ") || "Endereço não informado";
}

function commercialStage(customer: Customer) {
  const status = String(customer.status || "").toLowerCase();

  // Compatibilidade com registros antigos "risco".
  if (status === "risco") return "inativo";

  if (
    ["prospect", "cotacao", "pedido", "ativo", "inativo", "inadimplente", "bloqueado"].includes(
      status
    )
  ) {
    return status;
  }

  return "prospect";
}

function daysSince(value?: string | null) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const now = new Date();
  const startNow = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();
  const startDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  ).getTime();

  return Math.max(0, Math.floor((startNow - startDate) / 86400000));
}

function statusPillClasses(status?: string | null) {
  const normalized = String(status || "").toLowerCase();

  if (normalized === "prospect") {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }

  if (normalized === "cotacao") {
    return "border-violet-200 bg-violet-50 text-violet-700";
  }

  if (normalized === "pedido") {
    return "border-cyan-200 bg-cyan-50 text-cyan-700";
  }

  if (normalized === "ativo") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (normalized === "inativo" || normalized === "risco") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  if (normalized === "inadimplente") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  return "border-slate-200 bg-slate-100 text-slate-700";
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Customer | null>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [activities, setActivities] = useState<CustomerActivity[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [nextActionCustomer, setNextActionCustomer] =
    useState<Customer | null>(null);
  const [nextActionForm, setNextActionForm] =
    useState(EMPTY_NEXT_ACTION);
  const [savingNextAction, setSavingNextAction] = useState(false);

  const [generatingLinkFor, setGeneratingLinkFor] =
    useState<string | null>(null);
  const [promotionLinks, setPromotionLinks] =
    useState<Record<string, string>>({});
  const [recalculatingDistances, setRecalculatingDistances] =
    useState(false);
  const [recalculateProgress, setRecalculateProgress] = useState({
    completed: 0,
    total: 0,
  });

  const [filters, setFilters] = useState({
    q: "",
    status: "",
    segment: "",
  });

  const [viewMode, setViewMode] = useState<"cards" | "kanban">("cards");
  const [kanbanMode, setKanbanMode] = useState<"commercial" | "portal">(
    "commercial"
  );
  const [portalFilter, setPortalFilter] = useState("");
  const [draggingCustomerId, setDraggingCustomerId] = useState<string | null>(
    null
  );
  const [movingCustomerId, setMovingCustomerId] = useState<string | null>(
    null
  );

  async function loadCustomers() {
    setLoading(true);

    try {
      const params = new URLSearchParams();

      if (filters.q) params.set("q", filters.q);
      if (filters.status) params.set("status", filters.status);
      if (filters.segment) params.set("segment", filters.segment);

      const res = await fetch(
        `/api/crm/customers?${params.toString()}`,
        {
          cache: "no-store",
          credentials: "include",
        }
      );

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        alert(data.error || "Erro ao carregar clientes.");
        return;
      }

      setCustomers(
        Array.isArray(data.customers) ? data.customers : []
      );
    } finally {
      setLoading(false);
    }
  }

  async function clearPortfolioFilters() {
    setFilters({
      q: "",
      status: "",
      segment: "",
    });
    setPortalFilter("");
    setLoading(true);

    try {
      const res = await fetch("/api/crm/customers", {
        cache: "no-store",
        credentials: "include",
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        alert(data.error || "Erro ao limpar filtros.");
        return;
      }

      setCustomers(
        Array.isArray(data.customers) ? data.customers : []
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => {
    const total = customers.length;
    const prospects = customers.filter(
      (item) => commercialStage(item) === "prospect"
    ).length;
    const cotacoes = customers.filter(
      (item) => commercialStage(item) === "cotacao"
    ).length;
    const pedidos = customers.filter(
      (item) => commercialStage(item) === "pedido"
    ).length;
    const ativos = customers.filter(
      (item) => commercialStage(item) === "ativo"
    ).length;
    const inativos = customers.filter(
      (item) => commercialStage(item) === "inativo"
    ).length;
    const inadimplentes = customers.filter(
      (item) => commercialStage(item) === "inadimplente"
    ).length;
    const bloqueados = customers.filter(
      (item) => commercialStage(item) === "bloqueado"
    ).length;

    return {
      total,
      prospects,
      cotacoes,
      pedidos,
      ativos,
      inativos,
      inadimplentes,
      bloqueados,
    };
  }, [customers]);

  const segments = useMemo(() => {
    return Array.from(
      new Set(
        customers
          .map((item) => item.segment)
          .filter(Boolean) as string[]
      )
    ).sort();
  }, [customers]);

  const visibleCustomers = useMemo(() => {
    if (!portalFilter) return customers;

    return customers.filter(
      (customer) => promotionStage(customer) === portalFilter
    );
  }, [customers, portalFilter]);

  const kanbanColumns = useMemo(() => {
    const base =
      kanbanMode === "commercial"
        ? COMMERCIAL_KANBAN
        : PORTAL_KANBAN;

    return base.map((column) => ({
      ...column,
      customers: visibleCustomers.filter((customer) =>
        kanbanMode === "commercial"
          ? commercialStage(customer) === column.id
          : promotionStage(customer) === column.id
      ),
    }));
  }, [kanbanMode, visibleCustomers]);

  function updateField(name: string, value: string) {
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  function toggleWeekday(day: string) {
    setForm((prev) => {
      const exists = prev.purchase_weekdays.includes(day);

      return {
        ...prev,
        purchase_weekdays: exists
          ? prev.purchase_weekdays.filter((item) => item !== day)
          : [...prev.purchase_weekdays, day],
      };
    });
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
  }

  function editCustomer(customer: Customer) {
    setEditingId(customer.id);
    setSelected(customer);

    setForm({
      internal_code: customer.internal_code || "",
      erp_code: customer.erp_code || "",
      document: customer.document || "",
      legal_name: customer.legal_name || "",
      trade_name: customer.trade_name || "",
      segment: customer.segment || "",
      category: customer.category || "",
      buyer_name: customer.buyer_name || "",
      phone: customer.phone || "",
      whatsapp: customer.whatsapp || "",
      email: customer.email || "",
      cep: customer.cep || "",
      address: customer.address || "",
      number: customer.number || "",
      complement: customer.complement || "",
      neighborhood: customer.neighborhood || "",
      city: customer.city || "",
      state: customer.state || "",
      payment_terms: customer.payment_terms || "",
      weekly_purchase_limit: String(
        customer.weekly_purchase_limit || ""
      ),
      habitual_purchase_day:
        customer.habitual_purchase_day || "",
      purchase_weekdays: customer.purchase_weekdays || [],
      expected_ticket: String(customer.expected_ticket || ""),
      commercial_notes: customer.commercial_notes || "",
      status:
        customer.status === "risco"
          ? "inativo"
          : customer.status || "prospect",
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveCustomer(event: FormEvent) {
    event.preventDefault();

    if (!form.legal_name.trim()) {
      alert("Informe a razão social ou nome do cliente.");
      return;
    }

    setSaving(true);

    try {
      const payload = editingId
        ? { id: editingId, ...form }
        : form;

      const res = await fetch("/api/crm/customers", {
        method: editingId ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        alert(data.error || "Erro ao salvar cliente.");
        return;
      }

      resetForm();
      await loadCustomers();

      const result = data as DistanceCalculationResponse;
      const calculation = result.distance_calculation;

      if (calculation) {
        alert(
          `${
            editingId
              ? "Cliente atualizado"
              : "Cliente cadastrado"
          } com sucesso.\n\n${priceTableLabel(
            calculation.price_table
          )} · ${formatDistance(calculation.distance_km)}`
        );
      } else {
        alert(
          `${
            editingId
              ? "Cliente atualizado"
              : "Cliente cadastrado"
          } com sucesso.\n\nA tabela de preço ainda não foi calculada.${
            result.warning ? `\n${result.warning}` : ""
          }`
        );
      }
    } finally {
      setSaving(false);
    }
  }

  async function recalculateCustomerDistance(
    customer: Customer
  ) {
    const res = await fetch("/api/crm/customers", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        customer_id: customer.id,
      }),
    });

    const data =
      (await res
        .json()
        .catch(() => ({}))) as DistanceCalculationResponse;

    if (!res.ok || !data.customer) {
      throw new Error(
        data.error ||
          `Não foi possível calcular a distância de ${
            customer.trade_name || customer.legal_name
          }.`
      );
    }

    setCustomers((current) =>
      current.map((item) =>
        item.id === data.customer!.id ? data.customer! : item
      )
    );

    setSelected((current) =>
      current?.id === data.customer!.id
        ? data.customer!
        : current
    );

    return data;
  }

  async function recalculateAllDistances() {
    if (recalculatingDistances) return;

    const eligibleCustomers = customers.filter((customer) =>
      Boolean(
        customer.cep ||
          customer.address ||
          customer.city
      )
    );

    if (!eligibleCustomers.length) {
      alert(
        "Nenhum cliente possui CEP ou endereço suficiente para o cálculo."
      );
      return;
    }

    const confirmed = window.confirm(
      `Recalcular distância e tabela de ${eligibleCustomers.length} cliente(s)?\n\nO cálculo considera a rota rodoviária a partir da PMG em Itapecerica da Serra.`
    );

    if (!confirmed) return;

    setRecalculatingDistances(true);
    setRecalculateProgress({
      completed: 0,
      total: eligibleCustomers.length,
    });

    let successCount = 0;
    const failures: string[] = [];

    try {
      for (
        let index = 0;
        index < eligibleCustomers.length;
        index += 1
      ) {
        const customer = eligibleCustomers[index];

        try {
          await recalculateCustomerDistance(customer);
          successCount += 1;
        } catch (error) {
          failures.push(
            `${
              customer.trade_name || customer.legal_name
            }: ${
              error instanceof Error
                ? error.message
                : "erro desconhecido"
            }`
          );
        }

        setRecalculateProgress({
          completed: index + 1,
          total: eligibleCustomers.length,
        });

        if (index < eligibleCustomers.length - 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, 1100)
          );
        }
      }

      await loadCustomers();

      alert(
        [
          `Cálculo concluído: ${successCount} cliente(s) atualizado(s).`,
          failures.length
            ? `${failures.length} falha(s):\n${failures
                .slice(0, 8)
                .join("\n")}`
            : "Todos os clientes foram classificados.",
        ].join("\n\n")
      );
    } finally {
      setRecalculatingDistances(false);
    }
  }

  async function deleteCustomer(customer: Customer) {
    const ok = confirm(
      `Remover ${customer.trade_name || customer.legal_name}?`
    );

    if (!ok) return;

    const res = await fetch(
      `/api/crm/customers?id=${customer.id}`,
      {
        method: "DELETE",
        credentials: "include",
      }
    );

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      alert(data.error || "Erro ao remover cliente.");
      return;
    }

    if (selected?.id === customer.id) {
      setSelected(null);
    }

    setPromotionLinks((prev) => {
      const next = { ...prev };
      delete next[customer.id];
      return next;
    });

    await loadCustomers();
  }

  async function requestPromotionLink(
    customer: Customer,
    regenerate = false
  ) {
    setGeneratingLinkFor(customer.id);

    try {
      const res = await fetch(
        `/api/crm/customers/${customer.id}/promotion-link`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ regenerate }),
        }
      );

      const data =
        (await res
          .json()
          .catch(() => ({}))) as PromotionLinkResponse;

      if (!res.ok || !data.promotion_url) {
        throw new Error(
          data.error || "Não foi possível gerar o link."
        );
      }

      setPromotionLinks((prev) => ({
        ...prev,
        [customer.id]: data.promotion_url!,
      }));

      setCustomers((current) =>
        current.map((item) =>
          item.id === customer.id
            ? {
                ...item,
                promotion_link_generated: true,
                promotion_link_active: true,
                promotion_status:
                  item.promotion_status === "none" ||
                  !item.promotion_status
                    ? "link"
                    : item.promotion_status,
              }
            : item
        )
      );

      return data.promotion_url;
    } finally {
      setGeneratingLinkFor(null);
    }
  }

  async function copyText(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";

      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();

      const copied = document.execCommand("copy");
      document.body.removeChild(textarea);

      return copied;
    }
  }

  async function openPmgCustomer(customer: Customer) {
    const pmgId = String(
      customer.internal_code || customer.erp_code || ""
    ).trim();

    if (pmgId) {
      await copyText(pmgId);
    }

    window.open(
      "https://sistema.pmg.com.br/Default.aspx",
      "_blank",
      "noopener,noreferrer"
    );

    if (pmgId) {
      window.setTimeout(() => {
        alert(
          `Sistema PMG aberto.\n\nID ${pmgId} copiado para a área de transferência.`
        );
      }, 120);
    } else {
      window.setTimeout(() => {
        alert(
          "Sistema PMG aberto.\n\nEste cliente ainda não possui ID PMG cadastrado."
        );
      }, 120);
    }
  }

  async function updateCustomerStatusOnly(
    customer: Customer,
    status: string
  ) {
    if (!customer.id || customer.status === status) return;

    setMovingCustomerId(customer.id);

    const previousStatus = customer.status;

    setCustomers((current) =>
      current.map((item) =>
        item.id === customer.id ? { ...item, status } : item
      )
    );

    setSelected((current) =>
      current?.id === customer.id
        ? { ...current, status }
        : current
    );

    try {
      const res = await fetch("/api/crm/customers", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          id: customer.id,
          status,
          status_only: true,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(
          data.error || "Erro ao atualizar status do cliente."
        );
      }
    } catch (error) {
      setCustomers((current) =>
        current.map((item) =>
          item.id === customer.id
            ? { ...item, status: previousStatus }
            : item
        )
      );

      setSelected((current) =>
        current?.id === customer.id
          ? { ...current, status: previousStatus }
          : current
      );

      alert(
        error instanceof Error
          ? error.message
          : "Erro ao atualizar status do cliente."
      );
    } finally {
      setMovingCustomerId(null);
      setDraggingCustomerId(null);
    }
  }

  function promotionStage(customer: Customer) {
    if (customer.promotion_push_enabled) return "push";
    if (customer.promotion_portal_accessed) return "accessed";
    if (customer.promotion_link_generated) return "link";
    return "none";
  }

  function promotionStageLabel(customer: Customer) {
    const stage = promotionStage(customer);

    if (stage === "push") return "Push ativado";
    if (stage === "accessed") return "Portal acessado";
    if (stage === "link") return "Link gerado";
    return "Sem link";
  }

  async function generatePromotionLink(customer: Customer) {
    try {
      const hasCurrentLink = Boolean(
        promotionLinks[customer.id] ||
          customer.promotion_link_generated
      );

      if (
        hasCurrentLink &&
        !window.confirm(
          "Deseja revogar o link atual e gerar outro? O link antigo deixará de funcionar."
        )
      ) {
        return;
      }

      const link = await requestPromotionLink(
        customer,
        hasCurrentLink
      );

      const copied = await copyText(link);

      alert(
        copied
          ? `Link gerado e copiado:\n\n${link}`
          : `Link gerado:\n\n${link}`
      );
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Erro ao gerar o link."
      );
    }
  }

  async function openPromotionPortal(customer: Customer) {
    try {
      const link =
        promotionLinks[customer.id] ||
        (await requestPromotionLink(customer));

      window.open(link, "_blank", "noopener,noreferrer");
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Erro ao abrir o portal."
      );
    }
  }

  async function copyPromotionLink(customer: Customer) {
    try {
      const link =
        promotionLinks[customer.id] ||
        (await requestPromotionLink(customer));

      const copied = await copyText(link);

      alert(
        copied
          ? "Link copiado com sucesso."
          : `Copie o link manualmente:\n\n${link}`
      );
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Erro ao copiar o link."
      );
    }
  }

  async function sendPromotionWhatsApp(customer: Customer) {
    try {
      const link =
        promotionLinks[customer.id] ||
        (await requestPromotionLink(customer));

      const phone = normalizePhone(
        customer.whatsapp || customer.phone
      );

      if (!phone) {
        alert(
          "Este cliente não possui WhatsApp ou telefone cadastrado."
        );
        return;
      }

      const customerName =
        customer.trade_name || customer.legal_name;

      const message = [
        `Olá, ${customerName}!`,
        "",
        "Criamos um portal exclusivo para você acompanhar nossas promoções:",
        "",
        link,
        "",
        "Ao abrir, ative as notificações para receber novas ofertas.",
      ].join("\n");

      window.open(
        `https://wa.me/${phone}?text=${encodeURIComponent(
          message
        )}`,
        "_blank",
        "noopener,noreferrer"
      );
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Erro ao preparar o envio pelo WhatsApp."
      );
    }
  }

  async function loadCustomerActivities(customerId: string) {
    if (!customerId) return;

    setLoadingActivities(true);

    try {
      const params = new URLSearchParams();
      params.set("customer_id", customerId);

      const res = await fetch(
        `/api/crm/customer-activities?${params.toString()}`,
        {
          cache: "no-store",
          credentials: "include",
        }
      );

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        console.error(
          data.error || "Erro ao carregar agenda do cliente."
        );
        setActivities([]);
        return;
      }

      setActivities(
        Array.isArray(data.activities) ? data.activities : []
      );
    } finally {
      setLoadingActivities(false);
    }
  }

  function openCustomer(customer: Customer) {
    setSelected(customer);
    loadCustomerActivities(customer.id);
  }

  function openNextAction(customer: Customer) {
    setNextActionCustomer(customer);
    setNextActionForm(EMPTY_NEXT_ACTION);
  }

  function closeNextAction() {
    setNextActionCustomer(null);
    setNextActionForm(EMPTY_NEXT_ACTION);
  }

  function updateNextActionField(
    name: string,
    value: string
  ) {
    setNextActionForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  async function saveNextAction(event: FormEvent) {
    event.preventDefault();

    if (!nextActionCustomer) return;

    if (!nextActionForm.title.trim()) {
      alert("Informe o título da próxima ação.");
      return;
    }

    if (!nextActionForm.date) {
      alert("Informe a data do retorno.");
      return;
    }

    const time = nextActionForm.time || "09:00";
    const scheduledAt = new Date(
      `${nextActionForm.date}T${time}:00`
    );

    setSavingNextAction(true);

    try {
      const res = await fetch(
        "/api/crm/customer-activities",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            customer_id: nextActionCustomer.id,
            phone:
              nextActionCustomer.whatsapp ||
              nextActionCustomer.phone ||
              "",
            origin: "customer",
            type: "followup",
            title: nextActionForm.title,
            description: nextActionForm.description,
            scheduled_at: scheduledAt.toISOString(),
            priority: "media",
            status: "pendente",
            notify: true,
          }),
        }
      );

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        alert(
          data.error || "Erro ao salvar próxima ação."
        );
        return;
      }

      alert("Próxima ação salva com sucesso.");

      if (selected?.id === nextActionCustomer.id) {
        await loadCustomerActivities(
          nextActionCustomer.id
        );
      }

      closeNextAction();
    } finally {
      setSavingNextAction(false);
    }
  }

  async function completeActivity(activityId: string) {
    const res = await fetch(
      "/api/crm/customer-activities",
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          id: activityId,
          status: "concluido",
        }),
      }
    );

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      alert(data.error || "Erro ao concluir atividade.");
      return;
    }

    if (selected) {
      await loadCustomerActivities(selected.id);
    }
  }

  function formatActivityDate(value?: string | null) {
    if (!value) return "Sem data";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "Sem data";
    }

    return date.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function renderCustomerCard(customer: Customer) {
    const generatedLink = promotionLinks[customer.id];
    const linkLoading = generatingLinkFor === customer.id;
    const hasPortal =
      Boolean(generatedLink) || Boolean(customer.promotion_link_generated);
    const pmgId =
      customer.internal_code ||
      customer.erp_code ||
      "Não informado";
    const lastOrderDays = daysSince(customer.last_order_at);
    const lastQuoteDays = daysSince(customer.last_quote_at);
    const stage = commercialStage(customer);

    return (
      <article
        key={customer.id}
        className="relative overflow-hidden rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md"
        onClick={() => openCustomer(customer)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <strong className="block break-words text-[15px] font-black leading-5 text-slate-950">
              {customer.trade_name || customer.legal_name}
            </strong>
            <span className="mt-1 block break-words text-[11px] font-bold leading-4 text-slate-500">
              {customer.legal_name}
            </span>
          </div>

          <span
            className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black ${statusPillClasses(
              stage
            )}`}
          >
            {STATUS_LABELS[stage] || stage}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
          <span className="text-[11px] font-bold text-slate-500">
            ID PMG:
          </span>
          <strong className="text-[11px] font-black text-slate-950">
            {pmgId}
          </strong>

          <span
            className={`ml-auto rounded-full px-2 py-1 text-[10px] font-black ${
              customer.promotion_push_enabled
                ? "bg-emerald-100 text-emerald-700"
                : customer.promotion_portal_accessed
                  ? "bg-blue-100 text-blue-700"
                  : hasPortal
                    ? "bg-amber-100 text-amber-700"
                    : "bg-slate-200 text-slate-600"
            }`}
          >
            {promotionStageLabel(customer)}
          </span>
        </div>

        <div className="mt-3 grid gap-1.5 text-[11px] font-semibold leading-4 text-slate-600">
          <span>
            <strong className="text-slate-800">Documento:</strong>{" "}
            {customer.document || "Não informado"}
          </span>
          <span>
            <strong className="text-slate-800">Comprador:</strong>{" "}
            {customer.buyer_name || "Não informado"}
          </span>
          <span>
            <strong className="text-slate-800">WhatsApp:</strong>{" "}
            {customer.whatsapp || customer.phone || "Não informado"}
          </span>

          <div className="mt-1 flex flex-wrap gap-1.5">
            <span className="rounded-full bg-emerald-50 px-2 py-1 font-black text-emerald-700">
              {priceTableLabel(customer.price_table)} ·{" "}
              {formatDistance(customer.distance_km)}
            </span>

            {lastOrderDays !== null ? (
              <span className="rounded-full bg-cyan-50 px-2 py-1 font-black text-cyan-700">
                📦 Último pedido há {lastOrderDays}d
              </span>
            ) : (
              <span className="rounded-full bg-slate-100 px-2 py-1 font-black text-slate-500">
                📦 Sem pedido recente
              </span>
            )}

            {lastQuoteDays !== null ? (
              <span className="rounded-full bg-violet-50 px-2 py-1 font-black text-violet-700">
                🧾 Cotação há {lastQuoteDays}d
              </span>
            ) : null}

            {customer.habitual_purchase_day ? (
              <span className="rounded-full bg-amber-50 px-2 py-1 font-black text-amber-700">
                📅 {customer.habitual_purchase_day}
              </span>
            ) : null}

            {customer.promotion_push_enabled ? (
              <span className="rounded-full bg-emerald-50 px-2 py-1 font-black text-emerald-700">
                🔔 Push ativo
              </span>
            ) : hasPortal ? (
              <span className="rounded-full bg-amber-50 px-2 py-1 font-black text-amber-700">
                🔔 Push pendente
              </span>
            ) : null}
          </div>
        </div>

        <div className="mt-3 border-t border-slate-100 pt-3">
          <label
            className="grid gap-1"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">
              Fase comercial
            </span>
            <select
              value={stage}
              disabled={movingCustomerId === customer.id}
              onChange={(event) =>
                void updateCustomerStatusOnly(
                  customer,
                  event.target.value
                )
              }
              className="relative z-10 min-h-[36px] w-full rounded-xl border border-slate-200 bg-white px-3 text-[11px] font-black text-slate-700 outline-none focus:border-emerald-500"
            >
              {COMMERCIAL_KANBAN.map((column) => (
                <option key={column.id} value={column.id}>
                  {column.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="relative z-10 mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            className="min-h-[36px] rounded-xl border border-emerald-200 bg-emerald-50 px-2 text-[11px] font-black text-emerald-800"
            onClick={(e) => {
              e.stopPropagation();
              void openPmgCustomer(customer);
            }}
          >
            Abrir PMG
          </button>

          <button
            type="button"
            disabled={linkLoading}
            className="min-h-[36px] rounded-xl border border-slate-200 bg-slate-50 px-2 text-[11px] font-black text-slate-700 disabled:opacity-50"
            onClick={(e) => {
              e.stopPropagation();
              void generatePromotionLink(customer);
            }}
          >
            {linkLoading
              ? "Gerando..."
              : hasPortal
                ? "Atualizar link"
                : "Gerar link"}
          </button>

          <button
            type="button"
            disabled={linkLoading}
            className="min-h-[36px] rounded-xl border border-slate-200 bg-white px-2 text-[11px] font-black text-slate-700 disabled:opacity-50"
            onClick={(e) => {
              e.stopPropagation();
              void openPromotionPortal(customer);
            }}
          >
            Abrir portal
          </button>

          <button
            type="button"
            disabled={linkLoading}
            className="min-h-[36px] rounded-xl border border-slate-200 bg-white px-2 text-[11px] font-black text-slate-700 disabled:opacity-50"
            onClick={(e) => {
              e.stopPropagation();
              void copyPromotionLink(customer);
            }}
          >
            Copiar link
          </button>

          <button
            type="button"
            disabled={linkLoading}
            className="min-h-[36px] rounded-xl border border-emerald-200 bg-white px-2 text-[11px] font-black text-emerald-700 disabled:opacity-50"
            onClick={(e) => {
              e.stopPropagation();
              void sendPromotionWhatsApp(customer);
            }}
          >
            WhatsApp
          </button>

          <button
            type="button"
            className="min-h-[36px] rounded-xl border border-blue-200 bg-blue-50 px-2 text-[11px] font-black text-blue-700"
            onClick={(e) => {
              e.stopPropagation();
              openNextAction(customer);
            }}
          >
            Próxima ação
          </button>

          <button
            type="button"
            className="min-h-[36px] rounded-xl border border-slate-200 bg-white px-2 text-[11px] font-black text-slate-700"
            onClick={(e) => {
              e.stopPropagation();
              editCustomer(customer);
            }}
          >
            Editar
          </button>

          <button
            type="button"
            className="min-h-[36px] rounded-xl border border-red-200 bg-red-50 px-2 text-[11px] font-black text-red-700"
            onClick={(e) => {
              e.stopPropagation();
              void deleteCustomer(customer);
            }}
          >
            Excluir
          </button>
        </div>
      </article>
    );
  }

  return (
    <div className="customers-page">
      <section className="hero">
        <div>
          <span>ZENTRA SALES AI · PMG ATACADISTA</span>
          <h1>Clientes</h1>
          <p>
            Cadastre a carteira comercial por vendedor,
            acompanhe dados de compra e prepare a base para
            pedidos, OCR, BI, promoções e IA comercial.
          </p>
        </div>

        <div className="hero-actions">
          <CustomerPmgImporter onImported={loadCustomers} />
          <button
            type="button"
            className="secondary-button"
            disabled={recalculatingDistances}
            onClick={recalculateAllDistances}
          >
            {recalculatingDistances
              ? `Calculando ${recalculateProgress.completed}/${recalculateProgress.total}`
              : "Recalcular tabelas"}
          </button>

          <button
            type="button"
            className="primary-button"
            onClick={() =>
              window.scrollTo({
                top: 320,
                behavior: "smooth",
              })
            }
          >
            Novo cliente
          </button>
        </div>
      </section>

      <section className="stats-grid">
        <div className="stat-card">
          <span>Total</span>
          <strong>{stats.total}</strong>
        </div>

        <div className="stat-card">
          <span>Prospectando</span>
          <strong>{stats.prospects}</strong>
        </div>

        <div className="stat-card warn">
          <span>Cotação enviada</span>
          <strong>{stats.cotacoes}</strong>
        </div>

        <div className="stat-card">
          <span>Pedido em andamento</span>
          <strong>{stats.pedidos}</strong>
        </div>

        <div className="stat-card good">
          <span>Compra ativa</span>
          <strong>{stats.ativos}</strong>
        </div>

        <div className="stat-card danger">
          <span>Inativos</span>
          <strong>{stats.inativos}</strong>
        </div>

        <div className="stat-card overdue">
          <span>Inadimplentes</span>
          <strong>{stats.inadimplentes}</strong>
        </div>

        <div className="stat-card blocked">
          <span>Bloqueados</span>
          <strong>{stats.bloqueados}</strong>
        </div>
      </section>

      <form
        className="panel form-panel"
        onSubmit={saveCustomer}
      >
        <div className="section-title">
          <span>
            {editingId ? "EDITAR CLIENTE" : "NOVO CLIENTE"}
          </span>
          <h2>
            {editingId
              ? "Atualizar cadastro"
              : "Cadastrar cliente"}
          </h2>
        </div>

        <div className="form-grid">
          <label>
            <span>ID do cliente / Código interno</span>
            <input
              value={form.internal_code}
              onChange={(e) =>
                updateField(
                  "internal_code",
                  e.target.value
                )
              }
              placeholder="Ex: 10293"
            />
          </label>

          <label>
            <span>CNPJ / CPF</span>
            <input
              value={form.document}
              onChange={(e) =>
                updateField("document", e.target.value)
              }
              placeholder="00.000.000/0000-00"
            />
          </label>

          <label className="wide">
            <span>Razão social *</span>
            <input
              value={form.legal_name}
              onChange={(e) =>
                updateField("legal_name", e.target.value)
              }
              placeholder="Razão social do cliente"
            />
          </label>

          <label>
            <span>Nome fantasia</span>
            <input
              value={form.trade_name}
              onChange={(e) =>
                updateField("trade_name", e.target.value)
              }
              placeholder="Nome comercial"
            />
          </label>

          <label>
            <span>Segmento</span>
            <input
              value={form.segment}
              onChange={(e) =>
                updateField("segment", e.target.value)
              }
              placeholder="Mercado, padaria, pizzaria..."
            />
          </label>

          <label>
            <span>Categoria</span>
            <input
              value={form.category}
              onChange={(e) =>
                updateField("category", e.target.value)
              }
              placeholder="A, B, C, estratégico..."
            />
          </label>

          <label>
            <span>Nome do comprador</span>
            <input
              value={form.buyer_name}
              onChange={(e) =>
                updateField("buyer_name", e.target.value)
              }
              placeholder="Responsável pela compra"
            />
          </label>

          <label>
            <span>Celular</span>
            <input
              value={form.phone}
              onChange={(e) =>
                updateField("phone", e.target.value)
              }
              placeholder="(00) 00000-0000"
            />
          </label>

          <label>
            <span>WhatsApp</span>
            <input
              value={form.whatsapp}
              onChange={(e) =>
                updateField("whatsapp", e.target.value)
              }
              placeholder="(00) 00000-0000"
            />
          </label>

          <label>
            <span>E-mail</span>
            <input
              type="email"
              value={form.email}
              onChange={(e) =>
                updateField("email", e.target.value)
              }
              placeholder="cliente@email.com"
            />
          </label>

          <div className="wide address-section">
            <div className="address-section-title">
              <strong>Endereço comercial</strong>
              <small>
                Dados usados para segmentação regional e
                tabela de preço.
              </small>
            </div>
          </div>

          <label>
            <span>CEP</span>
            <input
              value={form.cep}
              onChange={(e) =>
                updateField("cep", e.target.value)
              }
              placeholder="00000-000"
              inputMode="numeric"
              autoComplete="postal-code"
            />
          </label>

          <label className="wide">
            <span>Endereço</span>
            <input
              value={form.address}
              onChange={(e) =>
                updateField("address", e.target.value)
              }
              placeholder="Rua, avenida, estrada..."
              autoComplete="street-address"
            />
          </label>

          <label>
            <span>Número</span>
            <input
              value={form.number}
              onChange={(e) =>
                updateField("number", e.target.value)
              }
              placeholder="Ex: 125"
            />
          </label>

          <label>
            <span>Complemento</span>
            <input
              value={form.complement}
              onChange={(e) =>
                updateField("complement", e.target.value)
              }
              placeholder="Sala, bloco, referência..."
            />
          </label>

          <label>
            <span>Bairro</span>
            <input
              value={form.neighborhood}
              onChange={(e) =>
                updateField(
                  "neighborhood",
                  e.target.value
                )
              }
              placeholder="Bairro"
            />
          </label>

          <label>
            <span>Cidade</span>
            <input
              value={form.city}
              onChange={(e) =>
                updateField("city", e.target.value)
              }
              placeholder="Cidade"
              autoComplete="address-level2"
            />
          </label>

          <label>
            <span>Estado</span>
            <input
              value={form.state}
              onChange={(e) =>
                updateField(
                  "state",
                  e.target.value.toUpperCase().slice(0, 2)
                )
              }
              placeholder="UF"
              maxLength={2}
              autoComplete="address-level1"
            />
          </label>

          <label className="wide">
            <span>Forma de pagamento</span>
            <input
              value={form.payment_terms}
              onChange={(e) =>
                updateField(
                  "payment_terms",
                  e.target.value
                )
              }
              placeholder="Ex: boleto 7/14/21 dias, PIX, à vista."
            />
          </label>

          <label>
            <span>Limite de compra semanal</span>
            <input
              value={form.weekly_purchase_limit}
              onChange={(e) =>
                updateField(
                  "weekly_purchase_limit",
                  e.target.value
                )
              }
              placeholder="Ex: 5000"
              inputMode="decimal"
            />
          </label>

          <label>
            <span>Dia habitual de compra</span>
            <input
              value={form.habitual_purchase_day}
              onChange={(e) =>
                updateField(
                  "habitual_purchase_day",
                  e.target.value
                )
              }
              placeholder="Ex: terça-feira"
            />
          </label>

          <label>
            <span>Ticket esperado</span>
            <input
              value={form.expected_ticket}
              onChange={(e) =>
                updateField(
                  "expected_ticket",
                  e.target.value
                )
              }
              placeholder="Ex: 1200"
              inputMode="decimal"
            />
          </label>

          <label>
            <span>Status</span>
            <select
              value={form.status}
              onChange={(e) =>
                updateField("status", e.target.value)
              }
            >
              <option value="prospect">Prospectando</option>
              <option value="cotacao">Cotação enviada</option>
              <option value="pedido">Pedido em andamento</option>
              <option value="ativo">Compra ativa</option>
              <option value="inativo">Inativo / reativar</option>
              <option value="inadimplente">Inadimplente</option>
              <option value="bloqueado">Bloqueado</option>
            </select>
          </label>

          <div className="wide">
            <span className="field-title">
              Dias que costuma comprar
            </span>

            <div className="weekday-list">
              {WEEKDAYS.map((day) => (
                <button
                  key={day}
                  type="button"
                  className={
                    form.purchase_weekdays.includes(day)
                      ? "weekday active"
                      : "weekday"
                  }
                  onClick={() => toggleWeekday(day)}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>

          <label className="wide">
            <span>Observações</span>
            <textarea
              value={form.commercial_notes}
              onChange={(e) =>
                updateField(
                  "commercial_notes",
                  e.target.value
                )
              }
              placeholder="Preferências, restrições, horários, mix de produtos, detalhes de negociação..."
            />
          </label>
        </div>

        <div className="actions">
          <button
            className="primary-button"
            disabled={saving}
          >
            {saving
              ? "Salvando..."
              : editingId
                ? "Salvar alterações"
                : "Cadastrar cliente"}
          </button>

          {editingId && (
            <button
              className="secondary-button"
              type="button"
              onClick={resetForm}
            >
              Cancelar edição
            </button>
          )}
        </div>
      </form>

      <section className="panel">
        <div className="table-header">
          <div>
            <span>CARTEIRA COMERCIAL</span>
            <h2>Clientes cadastrados</h2>
          </div>

          <button
            className="secondary-button"
            onClick={loadCustomers}
            disabled={loading}
          >
            {loading ? "Atualizando..." : "Atualizar"}
          </button>
        </div>

        <div className="filters">
          <input
            value={filters.q}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                q: e.target.value,
              }))
            }
            placeholder="Buscar por nome, ID PMG, CNPJ, WhatsApp, cidade..."
          />

          <select
            value={filters.status}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                status: e.target.value,
              }))
            }
          >
            <option value="">Todas as fases</option>
            <option value="prospect">Prospectando</option>
            <option value="cotacao">Cotação enviada</option>
            <option value="pedido">Pedido em andamento</option>
            <option value="ativo">Compra ativa</option>
            <option value="inativo">Inativos</option>
            <option value="inadimplente">Inadimplentes</option>
            <option value="bloqueado">Bloqueados</option>
          </select>

          <select
            value={filters.segment}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                segment: e.target.value,
              }))
            }
          >
            <option value="">Todos os segmentos</option>

            {segments.map((segment) => (
              <option key={segment} value={segment}>
                {segment}
              </option>
            ))}
          </select>

          <button
            className="primary-button"
            onClick={loadCustomers}
          >
            Filtrar
          </button>
        </div>

        <div className="portfolio-toolbar">
          <div className="view-switch">
            <button
              type="button"
              className={viewMode === "cards" ? "active" : ""}
              onClick={() => setViewMode("cards")}
            >
              ▦ Cards
            </button>
            <button
              type="button"
              className={viewMode === "kanban" ? "active" : ""}
              onClick={() => setViewMode("kanban")}
            >
              ▤ Kanban
            </button>
          </div>

          <div className="portfolio-tools">
            {viewMode === "kanban" ? (
              <select
                value={kanbanMode}
                onChange={(e) =>
                  setKanbanMode(
                    e.target.value as "commercial" | "portal"
                  )
                }
              >
                <option value="commercial">
                  Kanban por fase comercial
                </option>
                <option value="portal">
                  Kanban por portal de promoções
                </option>
              </select>
            ) : null}

            <select
              value={portalFilter}
              onChange={(e) => setPortalFilter(e.target.value)}
            >
              <option value="">Todos os portais</option>
              <option value="none">Sem link</option>
              <option value="link">Link gerado</option>
              <option value="accessed">Portal acessado</option>
              <option value="push">Push ativado</option>
            </select>

            <button
              type="button"
              className="secondary-button"
              onClick={() => void clearPortfolioFilters()}
            >
              Limpar visual
            </button>
          </div>
        </div>

        {viewMode === "cards" ? (
          <div className="customers-grid">
            {!loading &&
              visibleCustomers.map((customer) =>
                renderCustomerCard(customer)
              )}

            {loading && (
              <div className="empty-state">
                <strong>Carregando clientes...</strong>
              </div>
            )}

            {!loading && visibleCustomers.length === 0 && (
              <div className="empty-state">
                <strong>Nenhum cliente encontrado.</strong>
                <span>
                  Ajuste os filtros ou cadastre o primeiro cliente.
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="kanban-shell">
            <div className="kanban-guide">
              {kanbanMode === "commercial" ? (
                <>
                  <strong>Funil da carteira</strong>
                  <span>
                    Prospect → cotação → pedido → compra ativa. Arraste o card
                    para atualizar somente a fase comercial.
                  </span>
                </>
              ) : (
                <>
                  <strong>Portal de promoções</strong>
                  <span>
                    As colunas refletem dados reais do portal e do Push.
                    Nesta visão os cards não são arrastáveis.
                  </span>
                </>
              )}
            </div>

            <div className="kanban-board">
              {kanbanColumns.map((column) => (
                <section
                  key={`${kanbanMode}-${column.id}`}
                  className={`kanban-column column-${column.id}`}
                  onDragOver={(event) => {
                    if (kanbanMode === "commercial") {
                      event.preventDefault();
                    }
                  }}
                  onDrop={(event) => {
                    if (kanbanMode !== "commercial") return;

                    event.preventDefault();

                    const customerId =
                      draggingCustomerId ||
                      event.dataTransfer.getData("text/customer-id");

                    const customer = customers.find(
                      (item) => item.id === customerId
                    );

                    if (customer) {
                      void updateCustomerStatusOnly(
                        customer,
                        column.id
                      );
                    }
                  }}
                >
                  <div className="kanban-column-head">
                    <div>
                      <strong>{column.label}</strong>
                      <span>{column.helper}</span>
                    </div>
                    <em>{column.customers.length}</em>
                  </div>

                  <div className="kanban-column-body">
                    {column.customers.map((customer) => {
                      const pmgId =
                        customer.internal_code ||
                        customer.erp_code ||
                        "Sem ID";

                      const hasPortal =
                        customer.promotion_link_generated ||
                        Boolean(promotionLinks[customer.id]);

                      return (
                        <article
                          key={customer.id}
                          className={`kanban-card ${
                            draggingCustomerId === customer.id
                              ? "dragging"
                              : ""
                          } ${
                            movingCustomerId === customer.id
                              ? "moving"
                              : ""
                          }`}
                          draggable={kanbanMode === "commercial"}
                          onDragStart={(event) => {
                            if (kanbanMode !== "commercial") return;
                            setDraggingCustomerId(customer.id);
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData(
                              "text/customer-id",
                              customer.id
                            );
                          }}
                          onDragEnd={() =>
                            setDraggingCustomerId(null)
                          }
                          onClick={() => openCustomer(customer)}
                        >
                          <div className="kanban-card-top">
                            <div>
                              <strong>
                                {customer.trade_name ||
                                  customer.legal_name}
                              </strong>
                              <span>ID PMG: {pmgId}</span>
                            </div>

                            <span
                              className={`mini-status ${commercialStage(
                                customer
                              )}`}
                            >
                              {STATUS_LABELS[commercialStage(customer)] ||
                                commercialStage(customer)}
                            </span>
                          </div>

                          <div className="kanban-card-details">
                            <span>
                              👤{" "}
                              {customer.buyer_name ||
                                "Comprador não informado"}
                            </span>
                            <span>
                              💬{" "}
                              {customer.whatsapp ||
                                customer.phone ||
                                "Sem WhatsApp"}
                            </span>
                            <span>
                              🏷{" "}
                              {customer.segment ||
                                customer.category ||
                                "Sem segmento"}
                            </span>

                            {customer.habitual_purchase_day ? (
                              <span>
                                📅 Compra:{" "}
                                {customer.habitual_purchase_day}
                              </span>
                            ) : null}
                          </div>

                          <div className="kanban-card-badges">
                            <span
                              className={`portal-badge portal-${promotionStage(
                                customer
                              )}`}
                            >
                              {promotionStageLabel(customer)}
                            </span>

                            {customer.promotion_push_enabled ? (
                              <span className="tiny-good">
                                🔔 Push ativo
                              </span>
                            ) : hasPortal ? (
                              <span className="tiny-neutral">
                                Push pendente
                              </span>
                            ) : null}
                          </div>

                          <div className="kanban-card-actions">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                void openPmgCustomer(customer);
                              }}
                            >
                              PMG
                            </button>

                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                void sendPromotionWhatsApp(customer);
                              }}
                            >
                              WhatsApp
                            </button>

                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                openNextAction(customer);
                              }}
                            >
                              Próxima ação
                            </button>

                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                editCustomer(customer);
                              }}
                            >
                              Editar
                            </button>
                          </div>
                        </article>
                      );
                    })}

                    {!column.customers.length ? (
                      <div className="kanban-empty">
                        Nenhum cliente nesta etapa.
                      </div>
                    ) : null}
                  </div>
                </section>
              ))}
            </div>
          </div>
        )}
      </section>

      {selected && (
        <aside className="drawer">
          <button
            className="drawer-close"
            onClick={() => setSelected(null)}
          >
            ×
          </button>

          <span>CLIENTE</span>
          <h2>
            {selected.trade_name || selected.legal_name}
          </h2>
          <p>{selected.legal_name}</p>

          <div className="drawer-grid">
            <div>
              <small>ID PMG</small>
              <strong>
                {selected.internal_code ||
                  selected.erp_code ||
                  "Não informado"}
              </strong>
            </div>

            <div>
              <small>Portal de promoções</small>
              <strong>{promotionStageLabel(selected)}</strong>
            </div>

            <div>
              <small>Documento</small>
              <strong>
                {selected.document || "Não informado"}
              </strong>
            </div>

            <div>
              <small>Comprador</small>
              <strong>
                {selected.buyer_name || "Não informado"}
              </strong>
            </div>

            <div>
              <small>WhatsApp</small>
              <strong>
                {selected.whatsapp ||
                  selected.phone ||
                  "Não informado"}
              </strong>
            </div>

            <div>
              <small>CEP</small>
              <strong>
                {selected.cep || "Não informado"}
              </strong>
            </div>

            <div>
              <small>Tabela de preço</small>
              <strong>
                {priceTableLabel(selected.price_table)}
              </strong>
            </div>

            <div>
              <small>Distância da PMG</small>
              <strong>
                {formatDistance(selected.distance_km)}
              </strong>
            </div>

            <div>
              <small>Endereço</small>
              <strong>{formatAddress(selected)}</strong>
            </div>

            <div>
              <small>Ticket esperado</small>
              <strong>
                {money(selected.expected_ticket)}
              </strong>
            </div>

            <div>
              <small>Forma de pagamento</small>
              <strong>
                {selected.payment_terms ||
                  "Não informado"}
              </strong>
            </div>
          </div>

          {selected.commercial_notes && (
            <div className="drawer-notes">
              <small>Observações</small>
              <p>{selected.commercial_notes}</p>
            </div>
          )}

          <div className="drawer-agenda">
            <div className="drawer-agenda-head">
              <div>
                <small>AGENDA COMERCIAL</small>
                <strong>Próximas ações</strong>
              </div>

              <button
                type="button"
                onClick={() => openNextAction(selected)}
              >
                Nova ação
              </button>
            </div>

            {loadingActivities && (
              <p>Carregando agenda...</p>
            )}

            {!loadingActivities &&
              activities.length === 0 && (
                <p>Nenhuma próxima ação cadastrada.</p>
              )}

            {!loadingActivities &&
              activities.map((activity) => (
                <div
                  key={activity.id}
                  className={`agenda-item ${
                    activity.status === "concluido"
                      ? "done"
                      : ""
                  }`}
                >
                  <div>
                    <strong>{activity.title}</strong>
                    <span>
                      {formatActivityDate(
                        activity.scheduled_at
                      )}
                    </span>
                  </div>

                  {activity.description && (
                    <p>{activity.description}</p>
                  )}

                  {activity.status !== "concluido" && (
                    <button
                      type="button"
                      onClick={() =>
                        completeActivity(activity.id)
                      }
                    >
                      Concluir
                    </button>
                  )}
                </div>
              ))}
          </div>

          <div className="drawer-actions">
            <button
              className="pmg-action-button"
              onClick={() => void openPmgCustomer(selected)}
            >
              Abrir PMG + copiar ID
            </button>

            <button
              className="primary-button"
              onClick={() => openNextAction(selected)}
            >
              Próxima ação
            </button>

            <button
              className="promotion-button"
              onClick={() =>
                generatePromotionLink(selected)
              }
            >
              Gerar link de promoções
            </button>

            <button
              className="secondary-button"
              onClick={() =>
                sendPromotionWhatsApp(selected)
              }
            >
              Enviar pelo WhatsApp
            </button>

            <button
              className="secondary-button"
              onClick={() => editCustomer(selected)}
            >
              Editar cliente
            </button>

            <button
              className="secondary-button"
              onClick={() =>
                alert(
                  "Integração com pedidos/OCR será conectada na próxima etapa."
                )
              }
            >
              Ver pedidos
            </button>
          </div>
        </aside>
      )}

      {nextActionCustomer && (
        <div
          className="modal-backdrop"
          onClick={closeNextAction}
        >
          <form
            className="next-action-modal"
            onSubmit={saveNextAction}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="drawer-close"
              onClick={closeNextAction}
            >
              ×
            </button>

            <span>PRÓXIMA AÇÃO</span>
            <h2>
              {nextActionCustomer.trade_name ||
                nextActionCustomer.legal_name}
            </h2>

            <p>
              {nextActionCustomer.whatsapp ||
                nextActionCustomer.phone ||
                "Telefone não informado"}
            </p>

            <label>
              <span>Título</span>
              <input
                value={nextActionForm.title}
                onChange={(e) =>
                  updateNextActionField(
                    "title",
                    e.target.value
                  )
                }
                placeholder="Ex: Retornar cliente"
              />
            </label>

            <div className="next-action-date-grid">
              <label>
                <span>Data</span>
                <input
                  type="date"
                  value={nextActionForm.date}
                  onChange={(e) =>
                    updateNextActionField(
                      "date",
                      e.target.value
                    )
                  }
                />
              </label>

              <label>
                <span>Hora</span>
                <input
                  type="time"
                  value={nextActionForm.time}
                  onChange={(e) =>
                    updateNextActionField(
                      "time",
                      e.target.value
                    )
                  }
                />
              </label>
            </div>

            <label>
              <span>Observação</span>
              <textarea
                value={nextActionForm.description}
                onChange={(e) =>
                  updateNextActionField(
                    "description",
                    e.target.value
                  )
                }
                placeholder="Ex: Cliente pediu para chamar sobre muçarela na segunda de manhã."
              />
            </label>

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={closeNextAction}
              >
                Cancelar
              </button>

              <button
                className="primary-button"
                disabled={savingNextAction}
              >
                {savingNextAction
                  ? "Salvando..."
                  : "Salvar próxima ação"}
              </button>
            </div>
          </form>
        </div>
      )}

      <style jsx>{`
        .customers-page {
          display: grid;
          gap: 16px;
          max-width: 1180px;
          margin: 0 auto;
        }

        .hero,
        .panel,
        .stat-card {
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 24px;
          box-shadow: 0 18px 45px rgba(15, 23, 42, 0.06);
        }

        .hero {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          padding: 28px;
        }

        .hero-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
          flex-wrap: wrap;
        }

        .hero-actions button:disabled {
          cursor: wait;
          opacity: 0.7;
        }

        .hero span,
        .section-title span,
        .table-header span,
        .drawer > span,
        .next-action-modal > span {
          display: block;
          color: #15803d;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.16em;
          text-transform: uppercase;
        }

        .hero h1,
        .section-title h2,
        .table-header h2,
        .drawer h2,
        .next-action-modal h2 {
          margin: 6px 0;
          color: #111827;
          font-size: clamp(26px, 3vw, 38px);
          line-height: 1;
          letter-spacing: -0.05em;
        }

        .hero p {
          max-width: 760px;
          margin: 0;
          color: #64748b;
          font-weight: 600;
          line-height: 1.6;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 12px;
        }

        .stat-card {
          padding: 18px;
        }

        .stat-card span {
          display: block;
          color: #64748b;
          font-size: 12px;
          font-weight: 800;
        }

        .stat-card strong {
          display: block;
          margin-top: 6px;
          color: #111827;
          font-size: 30px;
          font-weight: 950;
        }

        .stat-card.good strong {
          color: #15803d;
        }

        .stat-card.warn strong {
          color: #d97706;
        }

        .stat-card.danger strong {
          color: #dc2626;
        }

        .stat-card.overdue strong {
          color: #b91c1c;
        }

        .stat-card.blocked strong {
          color: #334155;
        }

        .panel {
          padding: 18px;
        }

        .form-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
          margin-top: 18px;
        }

        label,
        .wide {
          display: grid;
          gap: 7px;
        }

        .wide {
          grid-column: 1 / -1;
        }

        label span,
        .field-title {
          color: #334155;
          font-size: 12px;
          font-weight: 900;
        }

        input,
        select,
        textarea,
        button {
          min-height: 42px;
          border: 1px solid #dbe3ea;
          border-radius: 12px;
          font: inherit;
        }

        input,
        select,
        textarea {
          width: 100%;
          background: #fff;
          color: #111827;
          padding: 0 12px;
          outline: none;
        }

        input:focus,
        select:focus,
        textarea:focus {
          border-color: #16a34a;
          box-shadow: 0 0 0 3px rgba(22, 163, 74, 0.1);
        }

        textarea {
          min-height: 90px;
          padding-top: 12px;
          resize: vertical;
        }

        button {
          padding: 0 14px;
          cursor: pointer;
          font-weight: 900;
          transition: 0.18s ease;
        }

        button:hover:not(:disabled) {
          transform: translateY(-1px);
        }

        button:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .primary-button {
          border-color: #15803d;
          background: #15803d;
          color: #fff;
        }

        .secondary-button {
          background: #fff;
          color: #111827;
          padding: 0 16px;
        }

        .promotion-button {
          border-color: #166534;
          background: #f0fdf4;
          color: #166534;
        }

        .pmg-action-button {
          border-color: #15803d;
          background: #052e16;
          color: #fff;
        }

        .address-section {
          margin-top: 6px;
          border-top: 1px solid #eef2f7;
          padding-top: 16px;
        }

        .address-section-title {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 12px;
        }

        .address-section-title strong {
          color: #111827;
          font-size: 14px;
        }

        .address-section-title small {
          color: #64748b;
          font-weight: 700;
        }

        .weekday-list {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .weekday {
          min-height: 34px;
          border-radius: 999px;
          background: #f8fafc;
          color: #475569;
        }

        .weekday.active {
          border-color: #86efac;
          background: #dcfce7;
          color: #166534;
        }

        .actions,
        .table-header,
        .filters {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          margin-top: 16px;
        }

        .table-header {
          justify-content: space-between;
          margin-top: 0;
        }

        .filters {
          display: grid;
          grid-template-columns: 1fr 190px 190px auto;
        }

        .customers-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
          margin-top: 16px;
        }

        .customer-card {
          border: 1px solid #e5e7eb;
          border-radius: 20px;
          padding: 16px;
          background: #fff;
          cursor: pointer;
          transition: 0.18s ease;
        }

        .customer-card:hover {
          border-color: #16a34a;
          transform: translateY(-2px);
          box-shadow: 0 18px 35px rgba(15, 23, 42, 0.08);
        }

        .customer-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
        }

        .customer-top strong {
          display: block;
          color: #111827;
          font-size: 16px;
          font-weight: 950;
        }

        .customer-top span,
        .customer-meta span,
        .customer-bottom small {
          color: #64748b;
          font-size: 12px;
          font-weight: 700;
        }

        .status {
          border-radius: 999px;
          padding: 5px 9px;
          background: #f1f5f9;
          color: #475569;
          font-size: 11px;
          font-style: normal;
          font-weight: 950;
          white-space: nowrap;
        }

        .status.prospect,
        .mini-status.prospect {
          background: #dbeafe;
          color: #1d4ed8;
        }

        .status.cotacao,
        .mini-status.cotacao {
          background: #ede9fe;
          color: #6d28d9;
        }

        .status.pedido,
        .mini-status.pedido {
          background: #cffafe;
          color: #0e7490;
        }

        .status.ativo {
          background: #dcfce7;
          color: #166534;
        }

        .status.risco {
          background: #fef3c7;
          color: #92400e;
        }

        .status.inativo {
          background: #fee2e2;
          color: #991b1b;
        }

        .status.inadimplente {
          background: #fff1f2;
          color: #be123c;
        }

        .status.bloqueado {
          background: #e5e7eb;
          color: #111827;
        }

        .customer-id-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          flex-wrap: wrap;
          margin-top: 12px;
          padding: 9px 10px;
          border-radius: 12px;
          background: #f8fafc;
          color: #475569;
          font-size: 11px;
          font-weight: 800;
        }

        .customer-id-row strong {
          color: #0f172a;
          font-weight: 950;
        }

        .customer-meta {
          display: grid;
          gap: 6px;
          margin-top: 14px;
        }

        .customer-commercial-flags {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          margin-top: 10px;
        }

        .customer-commercial-flags span {
          border-radius: 999px;
          background: #f8fafc;
          color: #475569;
          padding: 5px 8px;
          font-size: 10px;
          font-weight: 900;
        }

        .customer-commercial-flags .flag-good {
          background: #ecfdf5;
          color: #047857;
        }

        .portal-badge {
          display: inline-flex;
          align-items: center;
          width: fit-content;
          border-radius: 999px;
          padding: 5px 8px;
          font-size: 10px;
          font-weight: 950;
          white-space: nowrap;
        }

        .portal-none {
          background: #f1f5f9;
          color: #64748b;
        }

        .portal-link {
          background: #eff6ff;
          color: #1d4ed8;
        }

        .portal-accessed {
          background: #fef3c7;
          color: #92400e;
        }

        .portal-push {
          background: #dcfce7;
          color: #166534;
        }

        .distance-preview {
          width: fit-content;
          border: 1px solid #bbf7d0;
          border-radius: 999px;
          background: #f0fdf4;
          color: #166534 !important;
          padding: 5px 9px;
          font-size: 11px !important;
          font-weight: 950 !important;
        }

        .address-preview {
          min-height: 32px;
          line-height: 1.4;
        }

        .customer-bottom {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: 14px;
          padding-top: 12px;
          border-top: 1px solid #f1f5f9;
        }

        .customer-bottom strong {
          color: #15803d;
          font-weight: 950;
        }

        .link-ready {
          margin-top: 10px;
          border: 1px solid #bbf7d0;
          border-radius: 10px;
          background: #f0fdf4;
          color: #166534;
          padding: 8px 10px;
          font-size: 11px;
          font-weight: 900;
          text-align: center;
        }

        .card-actions {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
          margin-top: 12px;
        }

        .card-actions button {
          min-height: 36px;
          background: #f8fafc;
          color: #111827;
          padding: 0 8px;
          font-size: 11px;
        }

        .card-actions .danger-button {
          color: #dc2626;
        }

        .card-actions .pmg-button {
          border-color: #bbf7d0;
          background: #f0fdf4;
          color: #166534;
        }

        .portfolio-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          margin-top: 16px;
          padding: 10px;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          background: #f8fafc;
        }

        .view-switch {
          display: flex;
          gap: 6px;
          padding: 4px;
          border-radius: 14px;
          background: #fff;
          border: 1px solid #e2e8f0;
        }

        .view-switch button {
          min-height: 36px;
          border: 0;
          background: transparent;
          color: #64748b;
        }

        .view-switch button.active {
          background: #15803d;
          color: #fff;
        }

        .portfolio-tools {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          align-items: center;
        }

        .portfolio-tools select {
          width: auto;
          min-width: 185px;
        }

        .kanban-shell {
          margin-top: 16px;
        }

        .kanban-guide {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
          margin-bottom: 10px;
          padding: 12px 14px;
          border: 1px solid #dbeafe;
          border-radius: 14px;
          background: #eff6ff;
        }

        .kanban-guide strong {
          color: #1e3a8a;
          font-size: 12px;
        }

        .kanban-guide span {
          color: #64748b;
          font-size: 11px;
          font-weight: 700;
        }

        .kanban-board {
          display: grid;
          grid-auto-flow: column;
          grid-auto-columns: minmax(270px, 1fr);
          gap: 12px;
          overflow-x: auto;
          padding-bottom: 8px;
        }

        .kanban-column {
          min-height: 420px;
          border: 1px solid #e2e8f0;
          border-radius: 18px;
          background: #f8fafc;
          overflow: hidden;
        }

        .kanban-column-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
          padding: 13px 14px;
          border-bottom: 1px solid #e2e8f0;
          background: #fff;
        }

        .kanban-column-head strong {
          display: block;
          color: #0f172a;
          font-size: 13px;
          font-weight: 950;
        }

        .kanban-column-head span {
          display: block;
          margin-top: 2px;
          color: #94a3b8;
          font-size: 10px;
          font-weight: 700;
        }

        .kanban-column-head em {
          min-width: 28px;
          height: 28px;
          display: grid;
          place-items: center;
          border-radius: 999px;
          background: #e2e8f0;
          color: #334155;
          font-size: 11px;
          font-style: normal;
          font-weight: 950;
        }

        .column-prospect .kanban-column-head {
          border-top: 3px solid #3b82f6;
        }

        .column-cotacao .kanban-column-head {
          border-top: 3px solid #8b5cf6;
        }

        .column-pedido .kanban-column-head {
          border-top: 3px solid #06b6d4;
        }

        .column-ativo .kanban-column-head {
          border-top: 3px solid #22c55e;
        }

        .column-risco .kanban-column-head,
        .column-accessed .kanban-column-head {
          border-top: 3px solid #f59e0b;
        }

        .column-inativo .kanban-column-head,
        .column-inadimplente .kanban-column-head {
          border-top: 3px solid #ef4444;
        }

        .column-bloqueado .kanban-column-head,
        .column-none .kanban-column-head {
          border-top: 3px solid #64748b;
        }

        .column-link .kanban-column-head {
          border-top: 3px solid #3b82f6;
        }

        .column-push .kanban-column-head {
          border-top: 3px solid #16a34a;
        }

        .kanban-column-body {
          display: grid;
          gap: 9px;
          align-content: start;
          padding: 10px;
          min-height: 360px;
        }

        .kanban-card {
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          background: #fff;
          padding: 12px;
          cursor: pointer;
          box-shadow: 0 6px 18px rgba(15, 23, 42, 0.04);
          transition: 0.18s ease;
        }

        .kanban-card[draggable="true"] {
          cursor: grab;
        }

        .kanban-card[draggable="true"]:active {
          cursor: grabbing;
        }

        .kanban-card:hover {
          border-color: #86efac;
          transform: translateY(-1px);
        }

        .kanban-card.dragging {
          opacity: 0.45;
        }

        .kanban-card.moving {
          opacity: 0.6;
          pointer-events: none;
        }

        .kanban-card-top {
          display: flex;
          justify-content: space-between;
          gap: 8px;
          align-items: flex-start;
        }

        .kanban-card-top > div > strong {
          display: block;
          color: #0f172a;
          font-size: 12px;
          font-weight: 950;
          line-height: 1.35;
        }

        .kanban-card-top > div > span {
          display: block;
          margin-top: 3px;
          color: #64748b;
          font-size: 10px;
          font-weight: 800;
        }

        .mini-status {
          border-radius: 999px;
          padding: 4px 7px;
          background: #f1f5f9;
          color: #475569;
          font-size: 9px;
          font-weight: 950;
          white-space: nowrap;
        }

        .mini-status.ativo {
          background: #dcfce7;
          color: #166534;
        }

        .mini-status.risco {
          background: #fef3c7;
          color: #92400e;
        }

        .mini-status.inativo,
        .mini-status.inadimplente {
          background: #fee2e2;
          color: #991b1b;
        }

        .mini-status.bloqueado {
          background: #e2e8f0;
          color: #334155;
        }

        .kanban-card-details {
          display: grid;
          gap: 5px;
          margin-top: 10px;
          color: #64748b;
          font-size: 10px;
          font-weight: 700;
        }

        .kanban-card-badges {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          margin-top: 9px;
        }

        .tiny-good,
        .tiny-neutral {
          border-radius: 999px;
          padding: 5px 7px;
          font-size: 9px;
          font-weight: 900;
        }

        .tiny-good {
          background: #ecfdf5;
          color: #047857;
        }

        .tiny-neutral {
          background: #f1f5f9;
          color: #64748b;
        }

        .kanban-card-actions {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 6px;
          margin-top: 10px;
          padding-top: 10px;
          border-top: 1px solid #f1f5f9;
        }

        .kanban-card-actions button {
          min-height: 31px;
          padding: 0 6px;
          background: #f8fafc;
          color: #334155;
          font-size: 9px;
        }

        .kanban-empty {
          min-height: 80px;
          display: grid;
          place-items: center;
          border: 1px dashed #cbd5e1;
          border-radius: 14px;
          color: #94a3b8;
          font-size: 10px;
          font-weight: 800;
          text-align: center;
          padding: 12px;
        }

        .empty-state {
          grid-column: 1 / -1;
          border: 1px dashed #dbe3ea;
          border-radius: 20px;
          padding: 32px;
          text-align: center;
          color: #64748b;
        }

        .empty-state strong {
          display: block;
          color: #111827;
          font-size: 18px;
        }

        .drawer {
          position: fixed;
          right: 18px;
          top: 18px;
          bottom: 18px;
          width: min(440px, calc(100vw - 36px));
          z-index: 90;
          overflow: auto;
          border: 1px solid #e5e7eb;
          border-radius: 28px;
          background: #fff;
          padding: 24px;
          box-shadow: 0 30px 80px rgba(15, 23, 42, 0.18);
        }

        .drawer-close {
          position: absolute;
          right: 18px;
          top: 16px;
          width: 38px;
          height: 38px;
          border: 1px solid #e5e7eb;
          border-radius: 999px;
          background: #fff;
          cursor: pointer;
          font-size: 24px;
        }

        .drawer p {
          color: #64748b;
          font-weight: 700;
        }

        .drawer-grid {
          display: grid;
          gap: 10px;
          margin-top: 18px;
        }

        .drawer-grid div,
        .drawer-notes {
          padding: 14px;
          border: 1px solid #f1f5f9;
          border-radius: 16px;
          background: #f8fafc;
        }

        .drawer-grid small,
        .drawer-notes small {
          display: block;
          color: #64748b;
          font-size: 11px;
          font-weight: 900;
          text-transform: uppercase;
        }

        .drawer-grid strong {
          display: block;
          margin-top: 4px;
          color: #111827;
          font-weight: 950;
        }

        .drawer-actions {
          display: grid;
          gap: 10px;
          margin-top: 16px;
        }

        .drawer-agenda {
          margin-top: 16px;
          display: grid;
          gap: 10px;
        }

        .drawer-agenda-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 14px;
          border: 1px solid #dcfce7;
          border-radius: 18px;
          background: #f0fdf4;
        }

        .drawer-agenda-head small {
          display: block;
          color: #15803d;
          font-size: 11px;
          font-weight: 900;
        }

        .drawer-agenda-head strong {
          display: block;
          margin-top: 2px;
          color: #111827;
        }

        .drawer-agenda-head button,
        .agenda-item button {
          min-height: 34px;
          border: 1px solid #bbf7d0;
          border-radius: 999px;
          background: #f0fdf4;
          color: #166534;
          padding: 0 12px;
          cursor: pointer;
          font-weight: 950;
        }

        .agenda-item {
          border: 1px solid #e5e7eb;
          border-radius: 16px;
          background: #fff;
          padding: 14px;
        }

        .agenda-item.done {
          opacity: 0.65;
        }

        .agenda-item > div {
          display: grid;
          gap: 3px;
        }

        .agenda-item span {
          color: #64748b;
          font-size: 12px;
          font-weight: 800;
        }

        .agenda-item p {
          margin: 8px 0;
        }

        .modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 120;
          display: grid;
          place-items: center;
          padding: 18px;
          background: rgba(15, 23, 42, 0.45);
          backdrop-filter: blur(4px);
        }

        .next-action-modal {
          position: relative;
          width: min(520px, 100%);
          display: grid;
          gap: 12px;
          border: 1px solid #e5e7eb;
          border-radius: 28px;
          background: #fff;
          padding: 24px;
          box-shadow: 0 30px 80px rgba(15, 23, 42, 0.24);
        }

        .next-action-modal p {
          margin: 0;
          color: #64748b;
          font-weight: 700;
        }

        .next-action-date-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }

        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 4px;
        }

        @media (max-width: 980px) {
          .customers-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .filters {
            grid-template-columns: 1fr 1fr;
          }
        }

        @media (max-width: 720px) {
          .hero {
            align-items: stretch;
            flex-direction: column;
          }

          .hero-actions {
            justify-content: stretch;
          }

          .hero-actions button {
            flex: 1;
          }

          .stats-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .form-grid,
          .customers-grid,
          .filters,
          .next-action-date-grid {
            grid-template-columns: 1fr;
          }

          .address-section-title {
            align-items: flex-start;
            flex-direction: column;
          }

          .card-actions {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .modal-actions {
            flex-direction: column-reverse;
          }

          .modal-actions button {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
