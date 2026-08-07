"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { FormEvent } from "react";

type AudienceMode = "table" | "campaign";

type PromotionImage = {
  id?: string;
  image_url: string;
  file_name?: string | null;
  mime_type?: string | null;
  file_size?: number | null;
  sort_order?: number;
};

type AudienceTable = {
  price_table: number;
  customer_count: number;
  range_label: string;
};

type AudienceList = {
  id: string;
  name: string;
  description?: string | null;
  status: "active" | "archived";
  member_count: number;
  promotion_count: number;
  created_at?: string;
  updated_at?: string;
};

type Customer = {
  id: string;
  legal_name: string;
  trade_name?: string | null;
  document?: string | null;
  buyer_name?: string | null;
  whatsapp?: string | null;
  phone?: string | null;
  city?: string | null;
  state?: string | null;
  segment?: string | null;
  category?: string | null;
  distance_km?: string | number | null;
  price_table?: number | null;
  status?: string;
};

type AudienceMember = {
  id: string;
  created_at: string;
  customer: Customer;
};

type Delivery = {
  id: string;
  customer_id: string;
  status: string;
  queued_at?: string | null;
  sent_at?: string | null;
  accepted_at?: string | null;
  opened_at?: string | null;
  viewed_at?: string | null;
  clicked_at?: string | null;
  whatsapp_clicked_at?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  customer?: {
    id: string;
    legal_name: string;
    trade_name?: string | null;
  };
};

type Promotion = {
  id: string;
  internal_title?: string | null;
  title: string;
  description?: string | null;
  ai_prompt?: string | null;
  push_title?: string | null;
  push_message?: string | null;
  portal_text?: string | null;
  call_to_action?: string | null;
  contact_whatsapp?: string | null;
  whatsapp_message?: string | null;
  scheduled_at?: string | null;
  valid_from?: string | null;
  valid_until?: string | null;
  status: string;
  audience_mode?: AudienceMode;
  audience_list_id?: string | null;
  audienceList?: {
    id: string;
    name: string;
    description?: string | null;
    status: string;
    _count?: {
      members: number;
    };
  } | null;
  targets: Array<{
    price_table: number;
  }>;
  images: PromotionImage[];
  deliveries?: Delivery[];
  created_at?: string;
  updated_at?: string;
};

type FormState = {
  internal_title: string;
  title: string;
  description: string;
  ai_prompt: string;
  push_title: string;
  push_message: string;
  portal_text: string;
  call_to_action: string;
  contact_whatsapp: string;
  whatsapp_message: string;
  scheduled_at: string;
  valid_from: string;
  valid_until: string;
  audience_mode: AudienceMode;
  audience_list_id: string;
  price_tables: number[];
  images: PromotionImage[];
};

type Toast = {
  type: "success" | "error";
  message: string;
};

const EMPTY_FORM: FormState = {
  internal_title: "",
  title: "",
  description: "",
  ai_prompt: "",
  push_title: "",
  push_message: "",
  portal_text: "",
  call_to_action: "Entrar em contato",
  contact_whatsapp: "",
  whatsapp_message:
    "Olá! Vi esta oferta no portal e gostaria de mais informações.",
  scheduled_at: "",
  valid_from: "",
  valid_until: "",
  audience_mode: "table",
  audience_list_id: "",
  price_tables: [],
  images: [],
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  scheduled: "Agendada",
  published: "Publicada",
  expired: "Expirada",
  cancelled: "Cancelada",
};

function normalizeWhatsAppForLink(value: string) {
  const digits = String(value || "").replace(/\D/g, "");

  if (!digits) return "";
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;

  return digits;
}

function buildWhatsappUrl(number: string, message: string) {
  const normalized = normalizeWhatsAppForLink(number);
  if (!normalized) return "#";

  const query = message.trim()
    ? `?text=${encodeURIComponent(message.trim())}`
    : "";

  return `https://wa.me/${normalized}${query}`;
}

function toInputDate(value?: string | null) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const local = new Date(
    date.getTime() - date.getTimezoneOffset() * 60_000
  );

  return local.toISOString().slice(0, 10);
}

function customerName(customer: Customer) {
  return customer.trade_name || customer.legal_name;
}

function customerLocation(customer: Customer) {
  return [customer.city, customer.state].filter(Boolean).join(" / ") || "Cidade não informada";
}

function formatDeliveryDateTime(value?: string | null) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function promotionMetrics(promotion: Promotion) {
  const deliveries = promotion.deliveries || [];
  const total = deliveries.length;

  const sent = deliveries.filter(
    (item) =>
      Boolean(item.sent_at) ||
      ["sent", "opened", "viewed", "clicked"].includes(item.status)
  ).length;

  const opened = deliveries.filter(
    (item) => Boolean(item.opened_at)
  ).length;

  const viewed = deliveries.filter(
    (item) => Boolean(item.viewed_at)
  ).length;

  const clicked = deliveries.filter(
    (item) => Boolean(item.clicked_at)
  ).length;

  const whatsapp = deliveries.filter(
    (item) => Boolean(item.whatsapp_clicked_at)
  ).length;

  const failed = deliveries.filter(
    (item) => item.status === "failed"
  ).length;

  return {
    total,
    sent,
    opened,
    viewed,
    clicked,
    whatsapp,
    failed,
    openRate: sent ? Math.round((opened / sent) * 100) : 0,
    clickRate: sent ? Math.round((clicked / sent) * 100) : 0,
  };
}

export default function PromotionsPage() {
  const formRef = useRef<HTMLFormElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [tableAudience, setTableAudience] = useState<AudienceTable[]>([]);
  const [campaigns, setCampaigns] = useState<AudienceList[]>([]);
  const [members, setMembers] = useState<AudienceMember[]>([]);
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingStatus, setEditingStatus] = useState<string | null>(null);
  const [filters, setFilters] = useState({ q: "", status: "" });
  const [tone, setTone] = useState("comercial");
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [newCampaignName, setNewCampaignName] = useState("");
  const [newCampaignDescription, setNewCampaignDescription] = useState("");

  const [loading, setLoading] = useState(true);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [savingCampaign, setSavingCampaign] = useState(false);
  const [savingMembers, setSavingMembers] = useState(false);
  const [savingMode, setSavingMode] = useState<"draft" | "published" | null>(null);
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const audienceLocked = editingStatus === "published";

  const selectedCampaign = useMemo(
    () => campaigns.find((item) => item.id === form.audience_list_id) || null,
    [campaigns, form.audience_list_id]
  );

  const memberIds = useMemo(
    () => new Set(members.map((item) => item.customer.id)),
    [members]
  );

  const availableCustomerCount = useMemo(
    () =>
      tableAudience.reduce(
        (sum, item) => sum + Number(item.customer_count || 0),
        0
      ),
    [tableAudience]
  );

  const selectedCustomerCount = useMemo(() => {
    if (form.audience_mode === "campaign") {
      return selectedCampaign?.member_count ?? members.length;
    }

    return tableAudience
      .filter((item) => form.price_tables.includes(item.price_table))
      .reduce((sum, item) => sum + item.customer_count, 0);
  }, [
    form.audience_mode,
    form.price_tables,
    selectedCampaign,
    members.length,
    tableAudience,
  ]);

  const previewImage = form.images[0]?.image_url || "";
  const whatsappUrl = useMemo(
    () => buildWhatsappUrl(form.contact_whatsapp, form.whatsapp_message),
    [form.contact_whatsapp, form.whatsapp_message]
  );

  function notify(type: Toast["type"], message: string) {
    setToast({ type, message });
    window.setTimeout(() => setToast(null), 4600);
  }

  function updateField<K extends keyof FormState>(
    key: K,
    value: FormState[K]
  ) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function apiJson(
    input: RequestInfo | URL,
    init?: RequestInit
  ) {
    const response = await fetch(input, {
      credentials: "include",
      cache: "no-store",
      ...init,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || "Não foi possível concluir a operação.");
    }

    return data;
  }

  async function loadPromotions() {
    setLoading(true);

    try {
      const params = new URLSearchParams();

      if (filters.q.trim()) params.set("q", filters.q.trim());
      if (filters.status) params.set("status", filters.status);

      const data = await apiJson(
        `/api/crm/promotions?${params.toString()}`
      );

      setPromotions(
        Array.isArray(data.promotions) ? data.promotions : []
      );
    } catch (error) {
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "Erro ao carregar promoções."
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadTableAudience() {
    try {
      const data = await apiJson("/api/crm/promotions/audience");

      setTableAudience(
        Array.isArray(data.tables) ? data.tables : []
      );
    } catch (error) {
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "Erro ao carregar público automático."
      );
    }
  }

  async function loadCampaigns(preferredId?: string) {
    setLoadingCampaigns(true);

    try {
      const data = await apiJson("/api/crm/promotion-audiences");
      const next = Array.isArray(data.lists) ? data.lists : [];

      setCampaigns(next);

      if (preferredId) {
        setForm((current) => ({
          ...current,
          audience_mode: "campaign",
          audience_list_id: preferredId,
        }));
      }
    } catch (error) {
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "Erro ao carregar campanhas."
      );
    } finally {
      setLoadingCampaigns(false);
    }
  }

  async function loadMembers(audienceId: string) {
    if (!audienceId) {
      setMembers([]);
      return;
    }

    setLoadingMembers(true);

    try {
      const data = await apiJson(
        `/api/crm/promotion-audiences/${encodeURIComponent(
          audienceId
        )}/members`
      );

      setMembers(Array.isArray(data.members) ? data.members : []);
    } catch (error) {
      setMembers([]);
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "Erro ao carregar clientes da campanha."
      );
    } finally {
      setLoadingMembers(false);
    }
  }

  async function searchCustomers() {
    if (!form.audience_list_id) {
      notify("error", "Selecione uma campanha primeiro.");
      return;
    }

    setLoadingCustomers(true);

    try {
      const params = new URLSearchParams();
      if (customerSearch.trim()) {
        params.set("q", customerSearch.trim());
      }
      params.set("limit", "80");

      const data = await apiJson(
        `/api/crm/promotion-audiences/customers?${params.toString()}`
      );

      setCustomerResults(
        Array.isArray(data.customers) ? data.customers : []
      );
    } catch (error) {
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "Erro ao buscar clientes."
      );
    } finally {
      setLoadingCustomers(false);
    }
  }

  useEffect(() => {
    void Promise.all([
      loadPromotions(),
      loadTableAudience(),
      loadCampaigns(),
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setSelectedCustomerIds([]);
    setCustomerResults([]);

    if (
      form.audience_mode === "campaign" &&
      form.audience_list_id
    ) {
      void loadMembers(form.audience_list_id);
    } else {
      setMembers([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.audience_mode, form.audience_list_id]);

  function resetForm() {
    setForm({
      ...EMPTY_FORM,
      images: [],
      price_tables: [],
    });
    setEditingId(null);
    setEditingStatus(null);
    setTone("comercial");
    setMembers([]);
    setCustomerResults([]);
    setCustomerSearch("");
    setSelectedCustomerIds([]);
  }

  function startNewPromotion() {
    resetForm();

    window.setTimeout(() => {
      formRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 50);
  }

  function toggleTable(priceTable: number) {
    if (audienceLocked) return;

    setForm((current) => ({
      ...current,
      price_tables: current.price_tables.includes(priceTable)
        ? current.price_tables.filter((item) => item !== priceTable)
        : [...current.price_tables, priceTable].sort((a, b) => a - b),
    }));
  }

  async function createCampaign() {
    if (newCampaignName.trim().length < 3) {
      notify("error", "Informe um nome para a campanha.");
      return;
    }

    setSavingCampaign(true);

    try {
      const data = await apiJson("/api/crm/promotion-audiences", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newCampaignName,
          description: newCampaignDescription,
        }),
      });

      const id = data?.list?.id;

      setNewCampaignName("");
      setNewCampaignDescription("");
      await loadCampaigns(id);

      notify("success", "Campanha criada. Agora selecione os clientes.");
    } catch (error) {
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "Erro ao criar campanha."
      );
    } finally {
      setSavingCampaign(false);
    }
  }

  async function editCampaign(campaign: AudienceList) {
    const name = window.prompt("Nome da campanha:", campaign.name);
    if (name === null) return;

    const description = window.prompt(
      "Descrição da campanha:",
      campaign.description || ""
    );
    if (description === null) return;

    try {
      await apiJson("/api/crm/promotion-audiences", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: campaign.id,
          name,
          description,
          status: campaign.status,
        }),
      });

      await loadCampaigns();
      notify("success", "Campanha atualizada.");
    } catch (error) {
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "Erro ao atualizar campanha."
      );
    }
  }

  async function archiveCampaign(campaign: AudienceList) {
    const nextStatus =
      campaign.status === "active" ? "archived" : "active";

    const confirmed = window.confirm(
      nextStatus === "archived"
        ? `Arquivar a campanha "${campaign.name}"? As promoções antigas e métricas serão preservadas.`
        : `Reativar a campanha "${campaign.name}"?`
    );

    if (!confirmed) return;

    try {
      await apiJson("/api/crm/promotion-audiences", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: campaign.id,
          name: campaign.name,
          description: campaign.description,
          status: nextStatus,
        }),
      });

      if (
        nextStatus === "archived" &&
        form.audience_list_id === campaign.id &&
        !audienceLocked
      ) {
        updateField("audience_list_id", "");
      }

      await loadCampaigns();
      notify(
        "success",
        nextStatus === "archived"
          ? "Campanha arquivada."
          : "Campanha reativada."
      );
    } catch (error) {
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "Erro ao alterar campanha."
      );
    }
  }

  function toggleCustomer(customerId: string) {
    if (memberIds.has(customerId)) return;

    setSelectedCustomerIds((current) =>
      current.includes(customerId)
        ? current.filter((id) => id !== customerId)
        : [...current, customerId]
    );
  }

  async function addSelectedCustomers() {
    if (!form.audience_list_id) {
      notify("error", "Selecione uma campanha.");
      return;
    }

    if (!selectedCustomerIds.length) {
      notify("error", "Selecione pelo menos um cliente.");
      return;
    }

    setSavingMembers(true);

    try {
      const data = await apiJson(
        `/api/crm/promotion-audiences/${encodeURIComponent(
          form.audience_list_id
        )}/members`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            customer_ids: selectedCustomerIds,
          }),
        }
      );

      setSelectedCustomerIds([]);
      await Promise.all([
        loadMembers(form.audience_list_id),
        loadCampaigns(),
      ]);

      notify(
        "success",
        `${data.added || 0} cliente(s) adicionado(s) à campanha.`
      );
    } catch (error) {
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "Erro ao adicionar clientes."
      );
    } finally {
      setSavingMembers(false);
    }
  }

  async function removeMember(member: AudienceMember) {
    if (!form.audience_list_id) return;

    const confirmed = window.confirm(
      `Remover "${customerName(member.customer)}" desta campanha? Promoções já publicadas não serão alteradas.`
    );

    if (!confirmed) return;

    try {
      await apiJson(
        `/api/crm/promotion-audiences/${encodeURIComponent(
          form.audience_list_id
        )}/members`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            customer_id: member.customer.id,
          }),
        }
      );

      await Promise.all([
        loadMembers(form.audience_list_id),
        loadCampaigns(),
      ]);

      notify("success", "Cliente removido da campanha.");
    } catch (error) {
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "Erro ao remover cliente."
      );
    }
  }

  async function generateWithAI() {
    if (form.ai_prompt.trim().length < 8) {
      notify("error", "Descreva melhor a intenção da promoção.");
      return;
    }

    setGenerating(true);

    try {
      const data = await apiJson("/api/crm/promotions/ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          objective: form.ai_prompt,
          tone,
        }),
      });

      const content = data.content || {};

      setForm((current) => ({
        ...current,
        title: content.title || current.title,
        description: content.description || current.description,
        push_title: content.push_title || current.push_title,
        push_message: content.push_message || current.push_message,
        portal_text: content.portal_text || current.portal_text,
        call_to_action:
          content.call_to_action || current.call_to_action,
        whatsapp_message:
          content.whatsapp_message || current.whatsapp_message,
      }));

      notify("success", "Conteúdo gerado. Revise antes de publicar.");
    } catch (error) {
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "Erro ao gerar conteúdo."
      );
    } finally {
      setGenerating(false);
    }
  }

  async function uploadFiles(files: FileList | File[]) {
    const availableSlots = Math.max(0, 10 - form.images.length);
    const selected = Array.from(files).slice(0, availableSlots);

    if (!selected.length) {
      notify("error", "O limite é de 10 imagens por promoção.");
      return;
    }

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
    ];

    const invalid = selected.find(
      (file) => !allowedTypes.includes(file.type)
    );

    if (invalid) {
      notify("error", `Formato não permitido: ${invalid.name}`);
      return;
    }

    setUploading(true);

    try {
      const uploaded: PromotionImage[] = [];

      for (const file of selected) {
        const payload = new FormData();
        payload.append("file", file);
        payload.append("folder", "promotions");

        const response = await fetch("/api/upload", {
          method: "POST",
          credentials: "include",
          body: payload,
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            data.error || `Erro ao enviar ${file.name}.`
          );
        }

        const imageUrl =
          data.url ||
          data.image_url ||
          data.publicUrl ||
          data.public_url;

        if (!imageUrl) {
          throw new Error(
            `O upload de ${file.name} não retornou uma URL.`
          );
        }

        uploaded.push({
          image_url: imageUrl,
          file_name: file.name,
          mime_type: file.type,
          file_size: file.size,
          sort_order: form.images.length + uploaded.length,
        });
      }

      setForm((current) => ({
        ...current,
        images: [...current.images, ...uploaded].map(
          (item, index) => ({
            ...item,
            sort_order: index,
          })
        ),
      }));

      notify("success", `${uploaded.length} imagem(ns) adicionada(s).`);
    } catch (error) {
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "Erro ao enviar imagens."
      );
    } finally {
      setUploading(false);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  function removeImage(index: number) {
    setForm((current) => ({
      ...current,
      images: current.images
        .filter((_, itemIndex) => itemIndex !== index)
        .map((item, itemIndex) => ({
          ...item,
          sort_order: itemIndex,
        })),
    }));
  }

  function validate(status: "draft" | "published") {
    if (!form.internal_title.trim()) {
      return "Informe o nome interno da promoção.";
    }

    if (!form.title.trim()) {
      return "Informe o título que o cliente verá.";
    }

    if (
      form.audience_mode === "table" &&
      !form.price_tables.length
    ) {
      return "Selecione pelo menos uma tabela.";
    }

    if (
      form.audience_mode === "campaign" &&
      !form.audience_list_id
    ) {
      return "Selecione ou crie uma campanha personalizada.";
    }

    if (status === "published") {
      if (selectedCustomerCount === 0) {
        return "O público escolhido não possui clientes ativos.";
      }

      if (!form.images.length) {
        return "Adicione pelo menos uma imagem.";
      }

      if (!form.portal_text.trim()) {
        return "Informe o texto do portal.";
      }

      if (
        normalizeWhatsAppForLink(form.contact_whatsapp).length < 12
      ) {
        return "Informe um WhatsApp válido com DDD.";
      }

      if (!form.call_to_action.trim()) {
        return "Informe o texto do botão.";
      }
    }

    return null;
  }

  async function savePromotion(
    event: FormEvent,
    status: "draft" | "published"
  ) {
    event.preventDefault();

    const validationError = validate(status);

    if (validationError) {
      notify("error", validationError);
      return;
    }

    if (status === "published") {
      const confirmed = window.confirm(
        `${editingId ? "Atualizar" : "Publicar"} "${
          form.internal_title
        }" para ${selectedCustomerCount} cliente(s)?`
      );

      if (!confirmed) return;
    }

    setSavingMode(status);

    try {
      const data = await apiJson("/api/crm/promotions", {
        method: editingId ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: editingId,
          ...form,
          contact_whatsapp: normalizeWhatsAppForLink(
            form.contact_whatsapp
          ),
          status,
        }),
      });

      if (status === "published") {
        const push = data?.push;

        notify(
          push?.error ? "error" : "success",
          push?.error
            ? `Promoção publicada, mas o Push falhou: ${push.error}`
            : `Promoção publicada para ${data?.queued ?? selectedCustomerCount} cliente(s). Push processado.`
        );
      } else {
        notify(
          "success",
          editingId ? "Rascunho atualizado." : "Rascunho salvo."
        );
      }

      resetForm();
      await Promise.all([
        loadPromotions(),
        loadCampaigns(),
      ]);
    } catch (error) {
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "Erro ao salvar promoção."
      );
    } finally {
      setSavingMode(null);
    }
  }

  function editPromotion(promotion: Promotion) {
    setEditingId(promotion.id);
    setEditingStatus(promotion.status);

    setForm({
      internal_title:
        promotion.internal_title || promotion.title || "",
      title: promotion.title || "",
      description: promotion.description || "",
      ai_prompt: promotion.ai_prompt || "",
      push_title: promotion.push_title || "",
      push_message: promotion.push_message || "",
      portal_text: promotion.portal_text || "",
      call_to_action:
        promotion.call_to_action || "Entrar em contato",
      contact_whatsapp: promotion.contact_whatsapp || "",
      whatsapp_message:
        promotion.whatsapp_message ||
        EMPTY_FORM.whatsapp_message,
      scheduled_at: toInputDate(promotion.scheduled_at),
      valid_from: toInputDate(promotion.valid_from),
      valid_until: toInputDate(promotion.valid_until),
      audience_mode:
        promotion.audience_mode === "campaign"
          ? "campaign"
          : "table",
      audience_list_id:
        promotion.audience_list_id ||
        promotion.audienceList?.id ||
        "",
      price_tables: (promotion.targets || [])
        .map((item) => item.price_table)
        .sort((a, b) => a - b),
      images: promotion.images || [],
    });

    window.setTimeout(() => {
      formRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 50);
  }

  async function resendPush(promotion: Promotion) {
    const confirmed = window.confirm(
      `Reprocessar o Push de "${promotion.title}"? Entregas já concluídas não serão duplicadas.`
    );

    if (!confirmed) return;

    try {
      const data = await apiJson("/api/push/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          promotion_id: promotion.id,
        }),
      });

      notify(
        "success",
        data.message || "Reenvio de Push processado."
      );

      await loadPromotions();
    } catch (error) {
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "Erro ao reenviar Push."
      );
    }
  }

  async function removePromotion(promotion: Promotion) {
    const confirmed = window.confirm(
      `Excluir definitivamente "${promotion.title}"?\n\nEsta ação também remove o histórico de entregas ligado à publicação.`
    );

    if (!confirmed) return;

    try {
      await apiJson(
        `/api/crm/promotions?id=${encodeURIComponent(
          promotion.id
        )}`,
        {
          method: "DELETE",
        }
      );

      if (editingId === promotion.id) {
        resetForm();
      }

      notify("success", "Promoção excluída.");
      await Promise.all([
        loadPromotions(),
        loadCampaigns(),
      ]);
    } catch (error) {
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "Erro ao excluir promoção."
      );
    }
  }

  return (
    <main className="page-shell">
      {toast && (
        <div className={`toast toast-${toast.type}`} role="status">
          {toast.message}
        </div>
      )}

      <header className="page-header">
        <div>
          <p className="overline">CRM · PROMOÇÕES</p>
          <h1>Promoções</h1>
          <p className="subtitle">
            Publique por tabela ou crie campanhas direcionadas para clientes específicos.
          </p>

          <div className="feature-pills" aria-label="Recursos da promoção">
            <span>⚡ Automático por tabela</span>
            <span>🎯 Campanhas direcionadas</span>
            <span>🔔 Push + portal do cliente</span>
          </div>
        </div>

        <button
          className="button button-primary"
          type="button"
          onClick={startNewPromotion}
        >
          Nova promoção
        </button>
      </header>

      <form
        ref={formRef}
        className="workspace"
        onSubmit={(event) =>
          void savePromotion(
            event,
            editingStatus === "published" ? "published" : "draft"
          )
        }
      >
        <div className="editor-column">
          <section className="section-card">
            <div className="section-title-row">
              <div>
                <p className="section-kicker">
                  {editingId ? "EDITANDO" : "NOVA PUBLICAÇÃO"}
                </p>
                <h2>
                  {editingId
                    ? "Atualizar promoção"
                    : "Configurar promoção"}
                </h2>
              </div>

              {editingId && (
                <button
                  className="text-button"
                  type="button"
                  onClick={resetForm}
                >
                  Cancelar edição
                </button>
              )}
            </div>

            <div className="section-block">
              <div className="block-heading">
                <h3>Público</h3>
                <p>
                  Mantenha o disparo automático por tabela ou use uma campanha personalizada.
                </p>
              </div>

              <div className="mode-selector">
                <button
                  type="button"
                  className={
                    form.audience_mode === "table" ? "active" : ""
                  }
                  disabled={audienceLocked}
                  onClick={() => {
                    updateField("audience_mode", "table");
                    updateField("audience_list_id", "");
                  }}
                >
                  <strong>Seleção automática</strong>
                  <span>Clientes classificados por tabela e distância.</span>
                </button>

                <button
                  type="button"
                  className={
                    form.audience_mode === "campaign" ? "active" : ""
                  }
                  disabled={audienceLocked}
                  onClick={() => {
                    updateField("audience_mode", "campaign");
                    updateField("price_tables", []);
                  }}
                >
                  <strong>Campanha personalizada</strong>
                  <span>Escolha clientes individualmente, sem depender do raio.</span>
                </button>
              </div>

              {audienceLocked && (
                <div className="lock-note">
                  O público está bloqueado porque a promoção já foi publicada. Isso preserva as entregas e métricas históricas.
                </div>
              )}

              {form.audience_mode === "table" ? (
                <div className="audience-list">
                  {[0, 1, 2, 3, 4, 5].map((priceTable) => {
                    const item = tableAudience.find(
                      (row) => row.price_table === priceTable
                    );
                    const selected =
                      form.price_tables.includes(priceTable);

                    return (
                      <button
                        key={priceTable}
                        type="button"
                        disabled={audienceLocked}
                        className={`audience-item ${
                          selected ? "selected" : ""
                        }`}
                        onClick={() => toggleTable(priceTable)}
                        aria-pressed={selected}
                      >
                        <span className="audience-check">
                          {selected ? "✓" : ""}
                        </span>

                        <span>
                          <strong>Tabela {priceTable}</strong>
                          <span>
                            {item?.range_label ||
                              (priceTable === 0
                                ? "0 a 100 km"
                                : priceTable === 5
                                  ? "Acima de 500 km"
                                  : `${priceTable * 100} a ${
                                      (priceTable + 1) * 100
                                    } km`)}
                          </span>
                          <small className="audience-count">
                            <b>{item?.customer_count || 0}</b>{" "}
                            {(item?.customer_count || 0) === 1
                              ? "cliente disponível"
                              : "clientes disponíveis"}
                          </small>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="campaign-area">
                  <div className="campaign-select-row">
                    <label>
                      <span>Campanha de clientes</span>
                      <select
                        value={form.audience_list_id}
                        disabled={audienceLocked || loadingCampaigns}
                        onChange={(event) =>
                          updateField(
                            "audience_list_id",
                            event.target.value
                          )
                        }
                      >
                        <option value="">
                          {loadingCampaigns
                            ? "Carregando..."
                            : "Selecione uma campanha"}
                        </option>

                        {campaigns.map((campaign) => (
                          <option
                            key={campaign.id}
                            value={campaign.id}
                            disabled={
                              campaign.status === "archived" &&
                              campaign.id !== form.audience_list_id
                            }
                          >
                            {campaign.name} · {campaign.member_count} cliente(s)
                            {campaign.status === "archived"
                              ? " · arquivada"
                              : ""}
                          </option>
                        ))}
                      </select>
                    </label>

                    {selectedCampaign && (
                      <div className="campaign-actions">
                        <button
                          type="button"
                          onClick={() => void editCampaign(selectedCampaign)}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => void archiveCampaign(selectedCampaign)}
                        >
                          {selectedCampaign.status === "active"
                            ? "Arquivar"
                            : "Reativar"}
                        </button>
                      </div>
                    )}
                  </div>

                  {!audienceLocked && (
                    <details className="new-campaign-box">
                      <summary>+ Criar nova campanha</summary>

                      <div className="new-campaign-grid">
                        <label>
                          <span>Nome</span>
                          <input
                            value={newCampaignName}
                            onChange={(event) =>
                              setNewCampaignName(event.target.value)
                            }
                            placeholder="Ex: Clientes VIP"
                          />
                        </label>

                        <label>
                          <span>Descrição</span>
                          <input
                            value={newCampaignDescription}
                            onChange={(event) =>
                              setNewCampaignDescription(event.target.value)
                            }
                            placeholder="Ex: Clientes estratégicos para lançamentos"
                          />
                        </label>

                        <button
                          className="button button-secondary"
                          type="button"
                          disabled={savingCampaign}
                          onClick={() => void createCampaign()}
                        >
                          {savingCampaign ? "Criando..." : "Criar campanha"}
                        </button>
                      </div>
                    </details>
                  )}

                  {selectedCampaign && (
                    <div className="campaign-manager">
                      <div className="campaign-summary">
                        <div>
                          <strong>{selectedCampaign.name}</strong>
                          <span>
                            {selectedCampaign.description ||
                              "Sem descrição"}
                          </span>
                        </div>
                        <b>{selectedCampaign.member_count} cliente(s)</b>
                      </div>

                      {!audienceLocked &&
                        selectedCampaign.status === "active" && (
                          <>
                            <div className="customer-search-row">
                              <input
                                value={customerSearch}
                                onChange={(event) =>
                                  setCustomerSearch(event.target.value)
                                }
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    event.preventDefault();
                                    void searchCustomers();
                                  }
                                }}
                                placeholder="Buscar por nome, CNPJ, WhatsApp, cidade ou segmento"
                              />

                              <button
                                className="button button-secondary"
                                type="button"
                                disabled={loadingCustomers}
                                onClick={() => void searchCustomers()}
                              >
                                {loadingCustomers ? "Buscando..." : "Buscar clientes"}
                              </button>
                            </div>

                            {customerResults.length > 0 && (
                              <div className="customer-results">
                                {customerResults.map((customer) => {
                                  const alreadyMember = memberIds.has(customer.id);
                                  const selected = selectedCustomerIds.includes(
                                    customer.id
                                  );

                                  return (
                                    <label
                                      key={customer.id}
                                      className={
                                        alreadyMember ? "already-member" : ""
                                      }
                                    >
                                      <input
                                        type="checkbox"
                                        disabled={alreadyMember}
                                        checked={alreadyMember || selected}
                                        onChange={() =>
                                          toggleCustomer(customer.id)
                                        }
                                      />

                                      <span>
                                        <strong>{customerName(customer)}</strong>
                                        <small>
                                          {customer.document || "Documento não informado"} ·{" "}
                                          {customer.whatsapp ||
                                            customer.phone ||
                                            "Telefone não informado"} ·{" "}
                                          {customerLocation(customer)}
                                        </small>
                                      </span>

                                      <em>
                                        {alreadyMember ? "Já adicionado" : "Selecionar"}
                                      </em>
                                    </label>
                                  );
                                })}

                                <button
                                  className="button button-primary add-selected"
                                  type="button"
                                  disabled={
                                    savingMembers ||
                                    selectedCustomerIds.length === 0
                                  }
                                  onClick={() => void addSelectedCustomers()}
                                >
                                  {savingMembers
                                    ? "Adicionando..."
                                    : `Adicionar selecionados (${selectedCustomerIds.length})`}
                                </button>
                              </div>
                            )}
                          </>
                        )}

                      <div className="members-box">
                        <div className="members-title">
                          <strong>Clientes da campanha</strong>
                          <span>
                            O histórico de promoções publicadas permanece intacto mesmo se a lista mudar depois.
                          </span>
                        </div>

                        {loadingMembers ? (
                          <p className="muted">Carregando clientes...</p>
                        ) : members.length === 0 ? (
                          <p className="muted">
                            Nenhum cliente adicionado ainda.
                          </p>
                        ) : (
                          <div className="member-list">
                            {members.map((member) => (
                              <div key={member.id}>
                                <span>
                                  <strong>
                                    {customerName(member.customer)}
                                  </strong>
                                  <small>
                                    {member.customer.whatsapp ||
                                      member.customer.phone ||
                                      "Telefone não informado"}{" "}
                                    · {customerLocation(member.customer)}
                                  </small>
                                </span>

                                {!audienceLocked &&
                                  selectedCampaign.status === "active" && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void removeMember(member)
                                      }
                                    >
                                      Remover
                                    </button>
                                  )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="audience-summary-row">
                <div className="audience-total available">
                  <strong>{availableCustomerCount}</strong>
                  <span>cliente(s) disponíveis na sua carteira</span>
                </div>

                <div className="audience-total selected-total">
                  <strong>{selectedCustomerCount}</strong>
                  <span>cliente(s) no público atual</span>
                </div>
              </div>
            </div>

            <div className="section-block">
              <div className="block-heading">
                <h3>Assistente de conteúdo</h3>
                <p>
                  Descreva a oferta. A IA cria os textos, mas você continua no controle.
                </p>
              </div>

              <label>
                <span>Objetivo da promoção</span>
                <textarea
                  value={form.ai_prompt}
                  onChange={(event) =>
                    updateField("ai_prompt", event.target.value)
                  }
                  placeholder="Ex: campanha de lançamento de muçarela para pizzarias, com tom urgente e condição especial"
                />
              </label>

              <div className="inline-actions">
                <label className="tone-field">
                  <span>Tom</span>
                  <select
                    value={tone}
                    onChange={(event) => setTone(event.target.value)}
                  >
                    <option value="comercial">Comercial</option>
                    <option value="direto">Direto</option>
                    <option value="consultivo">Consultivo</option>
                    <option value="urgente">Urgente</option>
                  </select>
                </label>

                <button
                  className="button button-secondary"
                  type="button"
                  disabled={generating}
                  onClick={() => void generateWithAI()}
                >
                  {generating ? "Gerando..." : "Gerar textos com IA"}
                </button>
              </div>
            </div>

            <div className="section-block">
              <div className="block-heading">
                <h3>Conteúdo</h3>
                <p>Revise o que será mostrado no portal e na notificação.</p>
              </div>

              <div className="form-grid">
                <label>
                  <span>Nome interno</span>
                  <input
                    value={form.internal_title}
                    onChange={(event) =>
                      updateField("internal_title", event.target.value)
                    }
                    placeholder="Ex: Campanha agosto pizzarias"
                  />
                </label>

                <label>
                  <span>Título público</span>
                  <input
                    value={form.title}
                    onChange={(event) =>
                      updateField("title", event.target.value)
                    }
                    placeholder="Ex: Oferta especial para sua empresa"
                  />
                </label>
              </div>

              <label>
                <span>Descrição interna/opcional</span>
                <textarea
                  value={form.description}
                  onChange={(event) =>
                    updateField("description", event.target.value)
                  }
                  placeholder="Anotação interna para sua equipe. Este texto não precisa aparecer para o cliente."
                />
              </label>

              <div className="form-grid">
                <label>
                  <span>Título do Push</span>
                  <input
                    value={form.push_title}
                    onChange={(event) =>
                      updateField("push_title", event.target.value)
                    }
                    placeholder="Ex: Oferta exclusiva para você"
                  />
                </label>

                <label>
                  <span>Mensagem do Push</span>
                  <input
                    value={form.push_message}
                    onChange={(event) =>
                      updateField("push_message", event.target.value)
                    }
                    placeholder="Ex: Condição especial disponível por tempo limitado"
                  />
                </label>
              </div>

              <label>
                <span>Texto do portal</span>
                <textarea
                  value={form.portal_text}
                  onChange={(event) =>
                    updateField("portal_text", event.target.value)
                  }
                  placeholder="Texto principal que o cliente verá ao abrir a oferta no portal."
                />
              </label>

              <div className="form-grid">
                <label>
                  <span>Texto do botão</span>
                  <input
                    value={form.call_to_action}
                    onChange={(event) =>
                      updateField("call_to_action", event.target.value)
                    }
                  />
                </label>

                <label>
                  <span>WhatsApp do vendedor</span>
                  <input
                    value={form.contact_whatsapp}
                    onChange={(event) =>
                      updateField("contact_whatsapp", event.target.value)
                    }
                    placeholder="5511999999999"
                  />
                </label>
              </div>

              <label>
                <span>Mensagem automática do WhatsApp</span>
                <textarea
                  value={form.whatsapp_message}
                  onChange={(event) =>
                    updateField("whatsapp_message", event.target.value)
                  }
                />
              </label>

              <div className="form-grid form-grid-three">
                <label>
                  <span>Agendar para</span>
                  <input
                    type="date"
                    value={form.scheduled_at}
                    onChange={(event) =>
                      updateField("scheduled_at", event.target.value)
                    }
                  />
                </label>

                <label>
                  <span>Válida a partir de</span>
                  <input
                    type="date"
                    value={form.valid_from}
                    onChange={(event) =>
                      updateField("valid_from", event.target.value)
                    }
                  />
                </label>

                <label>
                  <span>Válida até</span>
                  <input
                    type="date"
                    value={form.valid_until}
                    onChange={(event) =>
                      updateField("valid_until", event.target.value)
                    }
                  />
                </label>
              </div>
            </div>

            <div className="section-block">
              <div className="block-heading">
                <h3>Imagens</h3>
                <p>Envie até 10 artes. A primeira será usada no Push quando suportado.</p>
              </div>

              <input
                ref={fileInputRef}
                hidden
                multiple
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={(event) => {
                  if (event.target.files) {
                    void uploadFiles(event.target.files);
                  }
                }}
              />

              <button
                className="upload-box"
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                <strong>
                  {uploading ? "Enviando imagens..." : "Selecionar imagens"}
                </strong>
                <span>JPG, PNG, WEBP ou GIF</span>
              </button>

              {form.images.length > 0 && (
                <div className="image-list">
                  {form.images.map((image, index) => (
                    <div key={`${image.image_url}-${index}`}>
                      <img
                        src={image.image_url}
                        alt={`Arte ${index + 1}`}
                      />
                      <span>
                        <strong>
                          {image.file_name || `Imagem ${index + 1}`}
                        </strong>
                        <small>
                          {index === 0 ? "Imagem principal" : `Posição ${index + 1}`}
                        </small>
                      </span>
                      <button
                        type="button"
                        onClick={() => removeImage(index)}
                      >
                        Remover
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>

        <aside className="preview-column">
          <section className="section-card sticky-preview">
            <div className="block-heading">
              <h3>Pré-visualização</h3>
              <p>O cliente verá esta comunicação em seu portal exclusivo.</p>
            </div>

            <div className="push-preview">
              <small>NOTIFICAÇÃO PUSH</small>
              <strong>{form.push_title || form.title || "Título da promoção"}</strong>
              <p>
                {form.push_message ||
                  form.portal_text ||
                  "A mensagem da notificação aparecerá aqui."}
              </p>
            </div>

            <div className="portal-preview">
              <div className="portal-image">
                {previewImage ? (
                  <img src={previewImage} alt="" />
                ) : (
                  <span>Imagem da promoção</span>
                )}
              </div>

              <div className="portal-content">
                <small>OFERTA SELECIONADA PARA VOCÊ</small>
                <h4>{form.title || "Título da promoção"}</h4>
                <p>
                  {form.portal_text ||
                    form.description ||
                    "O texto da oferta aparecerá aqui."}
                </p>

                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={`portal-button ${
                    whatsappUrl === "#" ? "disabled" : ""
                  }`}
                  onClick={(event) => {
                    if (whatsappUrl === "#") {
                      event.preventDefault();
                    }
                  }}
                >
                  {form.call_to_action || "Entrar em contato"}
                </a>

                <small className="contact-preview">
                  {normalizeWhatsAppForLink(form.contact_whatsapp) ||
                    "WhatsApp ainda não informado"}
                </small>
              </div>
            </div>

            <div className="preview-audience">
              <small>PÚBLICO</small>
              <strong>
                {form.audience_mode === "table"
                  ? form.price_tables.length
                    ? `Tabela(s) ${form.price_tables.join(", ")}`
                    : "Nenhuma tabela selecionada"
                  : selectedCampaign?.name ||
                    "Nenhuma campanha selecionada"}
              </strong>
              <span>{selectedCustomerCount} cliente(s)</span>
            </div>

            <div className="save-actions">
              <button
                className="button button-secondary"
                type="submit"
                disabled={savingMode !== null}
              >
                {savingMode === "draft"
                  ? "Salvando..."
                  : editingId
                    ? "Salvar alterações"
                    : "Salvar rascunho"}
              </button>

              <button
                className="button button-primary"
                type="button"
                disabled={savingMode !== null}
                onClick={(event) =>
                  void savePromotion(
                    event as unknown as FormEvent,
                    "published"
                  )
                }
              >
                {savingMode === "published"
                  ? "Publicando..."
                  : editingId
                    ? "Atualizar publicação"
                    : "Publicar"}
              </button>
            </div>
          </section>
        </aside>
      </form>

      <section className="history-section">
        <div className="history-header">
          <div>
            <p className="overline">HISTÓRICO</p>
            <h2>Publicações</h2>
          </div>

          <div className="filters">
            <input
              value={filters.q}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  q: event.target.value,
                }))
              }
              placeholder="Buscar promoção ou campanha"
            />

            <select
              value={filters.status}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  status: event.target.value,
                }))
              }
            >
              <option value="">Todos os status</option>
              <option value="draft">Rascunho</option>
              <option value="published">Publicada</option>
              <option value="scheduled">Agendada</option>
              <option value="expired">Expirada</option>
              <option value="cancelled">Cancelada</option>
            </select>

            <button
              className="button button-secondary"
              type="button"
              onClick={() => void loadPromotions()}
            >
              Filtrar
            </button>
          </div>
        </div>

        {loading ? (
          <div className="empty-state">Carregando promoções...</div>
        ) : promotions.length === 0 ? (
          <div className="empty-state">
            Nenhuma promoção encontrada.
          </div>
        ) : (
          <div className="promotion-table-wrap">
            <table className="promotion-table">
              <thead>
                <tr>
                  <th>Promoção</th>
                  <th>Público</th>
                  <th>Status</th>
                  <th>Entregas</th>
                  <th>Atualização</th>
                  <th aria-label="Ações" />
                </tr>
              </thead>

              <tbody>
                {promotions.map((promotion) => {
                  const metrics = promotionMetrics(promotion);
                  const isCampaign =
                    promotion.audience_mode === "campaign";

                  return (
                    <tr key={promotion.id}>
                      <td>
                        <div className="promotion-cell">
                          <div className="table-thumb">
                            {promotion.images?.[0]?.image_url ? (
                              <img
                                src={promotion.images[0].image_url}
                                alt=""
                              />
                            ) : (
                              <span>—</span>
                            )}
                          </div>

                          <div>
                            <strong>
                              {promotion.internal_title || promotion.title}
                            </strong>
                            <small>Cliente vê: {promotion.title}</small>
                          </div>
                        </div>
                      </td>

                      <td>
                        <span className={`audience-badge ${
                          isCampaign ? "manual" : "automatic"
                        }`}>
                          {isCampaign ? "Personalizada" : "Automática"}
                        </span>
                        <small className="audience-description">
                          {isCampaign
                            ? promotion.audienceList?.name ||
                              "Campanha removida"
                            : promotion.targets
                                .map((item) => `Tabela ${item.price_table}`)
                                .join(", ") || "—"}
                        </small>
                      </td>

                      <td>
                        <span
                          className={`status-badge status-${promotion.status}`}
                        >
                          {STATUS_LABELS[promotion.status] ||
                            promotion.status}
                        </span>
                      </td>

                      <td>
                        <details className="delivery-details">
                          <summary>
                            {metrics.sent}/{metrics.total} entregue(s)
                          </summary>

                          <div className="delivery-metrics">
                            <span>Enviados: <b>{metrics.sent}</b></span>
                            <span>Abertos: <b>{metrics.opened}</b></span>
                            <span>Visualizados: <b>{metrics.viewed}</b></span>
                            <span>Cliques no Push: <b>{metrics.clicked}</b></span>
                            <span>WhatsApp: <b>{metrics.whatsapp}</b></span>
                            <span>Falhas: <b>{metrics.failed}</b></span>
                            <span>Taxa de abertura: <b>{metrics.openRate}%</b></span>
                            <span>CTR Push: <b>{metrics.clickRate}%</b></span>
                          </div>

                          <div className="delivery-list">
                            {(promotion.deliveries || []).length === 0 ? (
                              <span>Nenhuma entrega criada.</span>
                            ) : (
                              promotion.deliveries?.slice(0, 100).map(
                                (delivery) => {
                                  const queuedAt = formatDeliveryDateTime(delivery.queued_at);
                                  const sentAt = formatDeliveryDateTime(delivery.sent_at);
                                  const acceptedAt = formatDeliveryDateTime(delivery.accepted_at);
                                  const clickedAt = formatDeliveryDateTime(delivery.clicked_at);
                                  const openedAt = formatDeliveryDateTime(delivery.opened_at);
                                  const viewedAt = formatDeliveryDateTime(delivery.viewed_at);
                                  const whatsappAt = formatDeliveryDateTime(
                                    delivery.whatsapp_clicked_at
                                  );

                                  return (
                                    <div
                                      key={delivery.id}
                                      className="delivery-history-card"
                                    >
                                      <div className="delivery-history-head">
                                        <span>
                                          {delivery.customer?.trade_name ||
                                            delivery.customer?.legal_name ||
                                            delivery.customer_id}
                                        </span>

                                        <b
                                          className={`delivery-status delivery-status-${delivery.status}`}
                                        >
                                          {delivery.status}
                                        </b>
                                      </div>

                                      <div className="delivery-timeline">
                                        {queuedAt && (
                                          <span><b>Na fila:</b> {queuedAt}</span>
                                        )}

                                        {sentAt && (
                                          <span><b>Push enviado:</b> {sentAt}</span>
                                        )}

                                        {acceptedAt && (
                                          <span>
                                            <b>Aceito pelo serviço:</b> {acceptedAt}
                                          </span>
                                        )}

                                        {clickedAt && (
                                          <span>
                                            <b>Clicou na notificação:</b> {clickedAt}
                                          </span>
                                        )}

                                        {openedAt && (
                                          <span><b>Abriu o portal:</b> {openedAt}</span>
                                        )}

                                        {viewedAt && (
                                          <span>
                                            <b>Visualizou a promoção:</b> {viewedAt}
                                          </span>
                                        )}

                                        {whatsappAt && (
                                          <span>
                                            <b>Clicou no WhatsApp:</b> {whatsappAt}
                                          </span>
                                        )}

                                        {delivery.status === "failed" &&
                                          (delivery.error_message ||
                                            delivery.error_code) && (
                                            <span className="delivery-error">
                                              <b>Motivo da falha:</b>{" "}
                                              {delivery.error_message ||
                                                delivery.error_code}
                                            </span>
                                          )}

                                        {!queuedAt &&
                                          !sentAt &&
                                          !acceptedAt &&
                                          !clickedAt &&
                                          !openedAt &&
                                          !viewedAt &&
                                          !whatsappAt && (
                                            <span className="delivery-muted">
                                              Ainda não há eventos registrados para esta entrega.
                                            </span>
                                          )}
                                      </div>
                                    </div>
                                  );
                                }
                              )
                            )}
                          </div>
                        </details>
                      </td>

                      <td>
                        {promotion.updated_at
                          ? new Date(promotion.updated_at).toLocaleString(
                              "pt-BR"
                            )
                          : "—"}
                      </td>

                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            onClick={() => editPromotion(promotion)}
                          >
                            Editar
                          </button>

                          {promotion.status === "published" && (
                            <button
                              type="button"
                              onClick={() => void resendPush(promotion)}
                            >
                              Reenviar Push
                            </button>
                          )}

                          <button
                            type="button"
                            className="danger-link"
                            onClick={() =>
                              void removePromotion(promotion)
                            }
                          >
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <style jsx>{`
        :global(*) {
          box-sizing: border-box;
        }

        :global(body) {
          margin: 0;
          background:
            radial-gradient(circle at 10% 0%, rgba(16, 185, 129, 0.10), transparent 26%),
            radial-gradient(circle at 88% 8%, rgba(99, 102, 241, 0.10), transparent 28%),
            #f5f8f7;
          color: #14221b;
        }

        button,
        input,
        textarea,
        select {
          font: inherit;
        }

        .page-shell {
          --brand: #118b52;
          --brand-dark: #08663a;
          --brand-soft: #eaf8f0;
          --blue: #2563eb;
          --blue-soft: #edf4ff;
          --violet: #6d4ed8;
          --violet-soft: #f2eeff;
          --amber: #d97706;
          --amber-soft: #fff7e8;
          --danger: #d63b45;
          --ink: #14221b;
          --muted: #6c7a73;
          --line: #dfe9e3;
          --surface: #ffffff;

          width: min(1520px, calc(100% - 34px));
          margin: 0 auto;
          padding: 28px 0 68px;
          color: var(--ink);
        }

        .page-header,
        .history-header,
        .section-title-row,
        .inline-actions,
        .save-actions,
        .campaign-select-row,
        .campaign-summary {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }

        .page-header {
          position: relative;
          overflow: hidden;
          margin-bottom: 22px;
          border: 1px solid rgba(17, 139, 82, 0.16);
          border-radius: 24px;
          background:
            linear-gradient(120deg, rgba(232, 250, 240, 0.98), rgba(255, 255, 255, 0.98) 48%, rgba(240, 238, 255, 0.96));
          padding: 25px 28px;
          box-shadow: 0 22px 55px rgba(26, 61, 43, 0.08);
        }

        .page-header::after {
          content: "";
          position: absolute;
          top: -68px;
          right: -32px;
          width: 190px;
          height: 190px;
          border-radius: 999px;
          background: linear-gradient(135deg, rgba(17, 139, 82, 0.16), rgba(109, 78, 216, 0.13));
          pointer-events: none;
        }

        .page-header > * {
          position: relative;
          z-index: 1;
        }

        .page-header h1,
        .history-header h2,
        .section-title-row h2 {
          margin: 3px 0 0;
          letter-spacing: -0.038em;
        }

        .page-header h1 {
          font-size: clamp(30px, 3vw, 42px);
          font-weight: 900;
        }

        .subtitle {
          max-width: 780px;
          margin: 8px 0 0;
          color: #5f7067;
          font-size: 14px;
          line-height: 1.55;
        }

        .feature-pills {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 15px;
        }

        .feature-pills span {
          display: inline-flex;
          align-items: center;
          min-height: 30px;
          border: 1px solid rgba(17, 139, 82, 0.13);
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.82);
          padding: 6px 11px;
          color: #3e5548;
          font-size: 11px;
          font-weight: 800;
          box-shadow: 0 4px 12px rgba(28, 67, 44, 0.04);
        }

        .overline,
        .section-kicker {
          margin: 0;
          color: var(--brand);
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.15em;
        }

        .workspace {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 410px;
          gap: 22px;
          align-items: start;
        }

        .editor-column {
          min-width: 0;
        }

        .section-card,
        .history-section {
          border: 1px solid var(--line);
          border-radius: 22px;
          background: rgba(255, 255, 255, 0.98);
          box-shadow: 0 20px 55px rgba(31, 61, 45, 0.07);
        }

        .section-card {
          padding: 24px;
        }

        .section-title-row {
          border-bottom: 1px solid #edf2ef;
          padding-bottom: 18px;
        }

        .section-title-row h2 {
          font-size: 22px;
        }

        .section-block {
          position: relative;
          margin-top: 16px;
          border: 1px solid #e5ece8;
          border-radius: 18px;
          background: #fbfdfc;
          padding: 20px;
        }

        .section-block:first-of-type {
          margin-top: 18px;
        }

        .section-card > .section-block:nth-of-type(1) {
          border-color: #cfeadc;
          background: linear-gradient(180deg, #f3fcf7 0%, #ffffff 44%);
        }

        .section-card > .section-block:nth-of-type(2) {
          border-color: #ddd5fb;
          background: linear-gradient(180deg, #f7f4ff 0%, #ffffff 45%);
        }

        .section-card > .section-block:nth-of-type(3) {
          border-color: #d4e3ff;
          background: linear-gradient(180deg, #f4f8ff 0%, #ffffff 44%);
        }

        .section-card > .section-block:nth-of-type(4) {
          border-color: #f3dfb8;
          background: linear-gradient(180deg, #fff9ee 0%, #ffffff 44%);
        }

        .block-heading {
          margin-bottom: 16px;
        }

        .block-heading h3 {
          display: flex;
          align-items: center;
          gap: 9px;
          margin: 0;
          font-size: 16px;
          font-weight: 900;
          color: #1b2a22;
        }

        .section-card > .section-block .block-heading h3::before {
          display: inline-grid;
          width: 27px;
          height: 27px;
          place-items: center;
          border-radius: 9px;
          color: #fff;
          font-size: 11px;
          font-weight: 900;
          box-shadow: 0 6px 15px rgba(31, 61, 45, 0.12);
        }

        .section-card > .section-block:nth-of-type(1) .block-heading h3::before {
          content: "1";
          background: linear-gradient(135deg, #118b52, #0bb66a);
        }

        .section-card > .section-block:nth-of-type(2) .block-heading h3::before {
          content: "2";
          background: linear-gradient(135deg, #6d4ed8, #8a6ff0);
        }

        .section-card > .section-block:nth-of-type(3) .block-heading h3::before {
          content: "3";
          background: linear-gradient(135deg, #2563eb, #3b82f6);
        }

        .section-card > .section-block:nth-of-type(4) .block-heading h3::before {
          content: "4";
          background: linear-gradient(135deg, #d97706, #f59e0b);
        }

        .block-heading p {
          margin: 6px 0 0 36px;
          color: #718078;
          font-size: 12px;
          line-height: 1.55;
        }

        label {
          display: grid;
          gap: 7px;
          margin-top: 14px;
        }

        label > span,
        .tone-field > span {
          color: #394c42;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.015em;
        }

        input,
        textarea,
        select {
          width: 100%;
          min-height: 45px;
          border: 1px solid #d7e3dc;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.96);
          padding: 11px 13px;
          color: #17251d;
          outline: none;
          transition:
            border-color 160ms ease,
            box-shadow 160ms ease,
            background 160ms ease,
            transform 160ms ease;
        }

        input::placeholder,
        textarea::placeholder {
          color: #99a69f;
        }

        textarea {
          min-height: 112px;
          resize: vertical;
          line-height: 1.5;
        }

        input:hover,
        textarea:hover,
        select:hover {
          border-color: #bdcec4;
          background: #fff;
        }

        input:focus,
        textarea:focus,
        select:focus {
          border-color: var(--brand);
          background: #fff;
          box-shadow: 0 0 0 4px rgba(17, 139, 82, 0.10);
        }

        button {
          transition:
            transform 160ms ease,
            box-shadow 160ms ease,
            border-color 160ms ease,
            background 160ms ease;
        }

        button:not(:disabled):active {
          transform: translateY(1px);
        }

        button:disabled {
          cursor: not-allowed;
          opacity: 0.55;
        }

        .button {
          min-height: 44px;
          border: 0;
          border-radius: 12px;
          padding: 10px 17px;
          font-size: 12px;
          font-weight: 900;
          cursor: pointer;
        }

        .button-primary {
          background: linear-gradient(135deg, var(--brand), #10a861);
          color: #fff;
          box-shadow: 0 9px 20px rgba(17, 139, 82, 0.22);
        }

        .button-primary:not(:disabled):hover {
          box-shadow: 0 12px 24px rgba(17, 139, 82, 0.28);
          transform: translateY(-1px);
        }

        .button-secondary {
          border: 1px solid #d7e2dc;
          background: #fff;
          color: #2e4337;
          box-shadow: 0 5px 14px rgba(31, 61, 45, 0.05);
        }

        .button-secondary:not(:disabled):hover {
          border-color: #aac5b5;
          background: #f7fbf9;
        }

        .text-button,
        .delivery-history-card {
          display: grid;
          gap: 8px;
          border: 1px solid #e4e9e6;
          border-radius: 12px;
          background: #ffffff;
          padding: 10px 11px;
          box-shadow: 0 5px 16px rgba(20, 55, 37, 0.05);
        }

        .delivery-history-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding-bottom: 7px;
          border-bottom: 1px solid #edf1ef;
        }

        .delivery-history-head > span {
          color: #18251e;
          font-size: 11px;
          font-weight: 900;
        }

        .delivery-status {
          border-radius: 999px;
          background: #eef2f7;
          padding: 4px 7px;
          color: #536172;
          font-size: 8px;
          font-weight: 900;
          text-transform: uppercase;
        }

        .delivery-status-sent,
        .delivery-status-opened,
        .delivery-status-viewed,
        .delivery-status-clicked {
          background: #eaf8ef;
          color: #137a3f;
        }

        .delivery-status-failed {
          background: #fff0f0;
          color: #c62828;
        }

        .delivery-timeline {
          display: grid;
          gap: 4px;
        }

        .delivery-timeline > span {
          display: block;
          color: #53635a;
          font-size: 9px;
          line-height: 1.45;
        }

        .delivery-timeline > span b {
          color: #22372b;
          font-weight: 900;
        }

        .delivery-timeline .delivery-error {
          margin-top: 3px;
          border-radius: 8px;
          background: #fff5f5;
          padding: 6px 7px;
          color: #b42318;
        }

        .delivery-muted {
          color: #87948d !important;
          font-style: italic;
        }

        .row-actions button,
        .campaign-actions button,
        .member-list button,
        .image-list button {
          border: 0;
          background: transparent;
          color: var(--brand);
          font-size: 11px;
          font-weight: 900;
          cursor: pointer;
        }

        .mode-selector {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .mode-selector > button {
          position: relative;
          display: grid;
          gap: 6px;
          min-height: 108px;
          overflow: hidden;
          border: 1px solid #dce7e1;
          border-radius: 16px;
          background: #fff;
          padding: 18px;
          color: #17251d;
          text-align: left;
          cursor: pointer;
        }

        .mode-selector > button:first-child {
          background: linear-gradient(145deg, #f4fcf7, #ffffff);
        }

        .mode-selector > button:last-child {
          background: linear-gradient(145deg, #f7f4ff, #ffffff);
        }

        .mode-selector > button::after {
          content: "";
          position: absolute;
          right: -24px;
          bottom: -34px;
          width: 90px;
          height: 90px;
          border-radius: 999px;
          opacity: 0.15;
        }

        .mode-selector > button:first-child::after {
          background: #10a861;
        }

        .mode-selector > button:last-child::after {
          background: #6d4ed8;
        }

        .mode-selector > button.active:first-child {
          border-color: #52ba82;
          box-shadow: 0 0 0 4px rgba(17, 139, 82, 0.10);
        }

        .mode-selector > button.active:last-child {
          border-color: #8c76de;
          box-shadow: 0 0 0 4px rgba(109, 78, 216, 0.10);
        }

        .mode-selector strong {
          position: relative;
          z-index: 1;
          font-size: 14px;
          font-weight: 900;
        }

        .mode-selector > button:first-child strong {
          color: #087143;
        }

        .mode-selector > button:last-child strong {
          color: #5b3fc2;
        }

        .mode-selector span {
          position: relative;
          z-index: 1;
          max-width: 300px;
          color: #718078;
          font-size: 11px;
          line-height: 1.5;
        }

        .lock-note {
          margin-top: 12px;
          border: 1px solid #efd7a1;
          border-radius: 12px;
          background: #fff8e9;
          padding: 12px 13px;
          color: #835b13;
          font-size: 11px;
          line-height: 1.55;
        }

        .audience-list {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 11px;
          margin-top: 14px;
        }

        .audience-item {
          position: relative;
          display: flex;
          gap: 10px;
          min-height: 92px;
          overflow: hidden;
          border: 1px solid #dfe8e3;
          border-radius: 14px;
          background: #fff;
          padding: 14px;
          color: #17251d;
          text-align: left;
          cursor: pointer;
        }

        .audience-item::before {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          width: 4px;
          height: 100%;
          background: #b9c8c0;
        }

        .audience-item:nth-child(1)::before { background: #10a861; }
        .audience-item:nth-child(2)::before { background: #3b82f6; }
        .audience-item:nth-child(3)::before { background: #6d4ed8; }
        .audience-item:nth-child(4)::before { background: #d97706; }
        .audience-item:nth-child(5)::before { background: #e65d71; }
        .audience-item:nth-child(6)::before { background: #64748b; }

        .audience-item:not(:disabled):hover {
          border-color: #b9cbc1;
          box-shadow: 0 8px 20px rgba(31, 61, 45, 0.07);
          transform: translateY(-1px);
        }

        .audience-item.selected {
          border-color: #57b684;
          background: linear-gradient(145deg, #eefaf3, #ffffff);
          box-shadow: 0 0 0 3px rgba(17, 139, 82, 0.08);
        }

        .audience-check {
          display: grid;
          flex: 0 0 22px;
          width: 22px;
          height: 22px;
          place-items: center;
          border: 1px solid #c7d5ce;
          border-radius: 7px;
          background: #fff;
          color: var(--brand);
          font-size: 12px;
          font-weight: 900;
        }

        .audience-item.selected .audience-check {
          border-color: var(--brand);
          background: var(--brand);
          color: #fff;
        }

        .audience-item > span:last-child {
          display: grid;
          gap: 3px;
        }

        .audience-item strong {
          font-size: 13px;
        }

        .audience-item span span {
          color: #74837b;
          font-size: 10px;
        }

        .audience-item small,
        .audience-count {
          display: inline-flex;
          align-items: center;
          width: fit-content;
          margin-top: 6px;
          border: 1px solid #cdeedb;
          border-radius: 999px;
          background: #eaf9f0;
          padding: 5px 9px;
          color: #166534;
          font-size: 10px;
          font-weight: 800;
          line-height: 1;
        }

        .audience-count b {
          margin-right: 3px;
          color: #047857;
          font-size: 12px;
        }

        .audience-summary-row {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          margin-top: 14px;
        }

        .audience-total.available {
          border-color: #bbf7d0;
          background: linear-gradient(135deg, #f0fdf4, #ecfdf5);
        }

        .audience-total.selected-total {
          border-color: #c7d2fe;
          background: linear-gradient(135deg, #eef2ff, #f5f3ff);
        }

        .campaign-area {
          display: grid;
          gap: 14px;
          margin-top: 14px;
          border-radius: 16px;
          background: linear-gradient(180deg, rgba(109, 78, 216, 0.045), transparent);
          padding: 2px;
        }

        .campaign-select-row {
          align-items: end;
        }

        .campaign-select-row > label {
          flex: 1;
          margin: 0;
        }

        .campaign-actions {
          display: flex;
          gap: 6px;
          padding-bottom: 2px;
        }

        .campaign-actions button {
          min-height: 34px;
          border: 1px solid #ddd5fb;
          border-radius: 9px;
          background: #fff;
          padding: 7px 10px;
          color: #6549c4;
        }

        .new-campaign-box,
        .campaign-manager {
          border: 1px solid #ded6fb;
          border-radius: 15px;
          background: rgba(255, 255, 255, 0.92);
          padding: 16px;
          box-shadow: 0 8px 20px rgba(75, 52, 145, 0.05);
        }

        .new-campaign-box summary {
          color: #6044c3;
          font-size: 12px;
          font-weight: 900;
          cursor: pointer;
        }

        .new-campaign-grid {
          display: grid;
          grid-template-columns: 1fr 1.4fr auto;
          gap: 10px;
          align-items: end;
          margin-top: 12px;
        }

        .new-campaign-grid label {
          margin: 0;
        }

        .campaign-manager {
          display: grid;
          gap: 14px;
        }

        .campaign-summary {
          border-bottom: 1px solid #eee9ff;
          padding-bottom: 13px;
        }

        .campaign-summary strong,
        .campaign-summary span {
          display: block;
        }

        .campaign-summary strong {
          color: #3b2a72;
        }

        .campaign-summary span {
          margin-top: 4px;
          color: #7c7393;
          font-size: 11px;
        }

        .campaign-summary b {
          display: inline-flex;
          align-items: center;
          min-height: 30px;
          border-radius: 999px;
          background: var(--violet-soft);
          padding: 5px 10px;
          color: #5c41bb;
          font-size: 11px;
          white-space: nowrap;
        }

        .customer-search-row {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 9px;
        }

        .customer-results,
        .member-list {
          display: grid;
          gap: 8px;
          max-height: 350px;
          overflow-y: auto;
          padding-right: 3px;
        }

        .customer-results > label {
          display: flex;
          align-items: center;
          gap: 10px;
          margin: 0;
          border: 1px solid #e3e8e5;
          border-radius: 12px;
          background: #fff;
          padding: 11px;
          cursor: pointer;
        }

        .customer-results > label:hover {
          border-color: #c7bdf2;
          background: #fbfaff;
        }

        .customer-results > label.already-member {
          border-color: #cde9da;
          background: #f1faf5;
        }

        .customer-results input[type="checkbox"] {
          width: 17px;
          min-height: auto;
          height: 17px;
          padding: 0;
          accent-color: var(--violet);
        }

        .customer-results label > span {
          display: grid;
          flex: 1;
          gap: 3px;
        }

        .customer-results strong,
        .member-list strong {
          color: #17251d;
          font-size: 11px;
        }

        .customer-results small,
        .member-list small {
          color: #77877e;
          font-size: 9px;
          line-height: 1.45;
        }

        .customer-results em {
          border-radius: 999px;
          background: #f1edff;
          padding: 4px 7px;
          color: #694dc8;
          font-size: 9px;
          font-style: normal;
          font-weight: 900;
        }

        .add-selected {
          position: sticky;
          bottom: 0;
          width: 100%;
        }

        .members-box {
          display: grid;
          gap: 10px;
          border-top: 1px solid #ece7fb;
          padding-top: 14px;
        }

        .members-title strong,
        .members-title span {
          display: block;
        }

        .members-title strong {
          color: #3e2d73;
          font-size: 12px;
        }

        .members-title span {
          margin-top: 3px;
          color: #817794;
          font-size: 9px;
          line-height: 1.45;
        }

        .member-list > div {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          border: 1px solid #e7e2f5;
          border-radius: 11px;
          background: #fff;
          padding: 10px;
        }

        .member-list > div > span {
          display: grid;
          gap: 3px;
        }

        .member-list button {
          color: var(--danger);
        }

        .muted {
          margin: 0;
          color: #7b8982;
          font-size: 11px;
        }

        .audience-total {
          display: flex;
          align-items: center;
          gap: 8px;
          width: fit-content;
          margin-top: 14px;
          border: 1px solid #cae8d7;
          border-radius: 13px;
          background: #effaf4;
          padding: 9px 12px;
          color: #5f7469;
          font-size: 11px;
          font-weight: 700;
        }

        .audience-total strong {
          color: var(--brand);
          font-size: 22px;
          line-height: 1;
        }

        .form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .form-grid-three {
          grid-template-columns: repeat(3, 1fr);
        }

        .inline-actions {
          align-items: end;
          margin-top: 12px;
          border-radius: 13px;
          background: rgba(109, 78, 216, 0.055);
          padding: 10px;
        }

        .tone-field {
          flex: 1;
          margin: 0;
        }

        .upload-box {
          display: grid;
          width: 100%;
          min-height: 116px;
          place-items: center;
          gap: 5px;
          border: 1px dashed #d7af64;
          border-radius: 15px;
          background: linear-gradient(145deg, #fffaf0, #ffffff);
          color: #b26408;
          cursor: pointer;
        }

        .upload-box:hover {
          border-color: #c48228;
          background: #fff7e9;
        }

        .upload-box span {
          color: #8d7a61;
          font-size: 10px;
        }

        .image-list {
          display: grid;
          gap: 8px;
          margin-top: 12px;
        }

        .image-list > div {
          display: flex;
          align-items: center;
          gap: 10px;
          border: 1px solid #eadfcb;
          border-radius: 11px;
          background: #fff;
          padding: 9px;
        }

        .image-list img {
          width: 54px;
          height: 54px;
          border-radius: 9px;
          object-fit: cover;
        }

        .image-list span {
          display: grid;
          flex: 1;
          gap: 2px;
        }

        .image-list strong {
          font-size: 11px;
        }

        .image-list small {
          color: #847a69;
          font-size: 9px;
        }

        .image-list button {
          color: var(--danger);
        }

        .sticky-preview {
          position: sticky;
          top: 18px;
          display: grid;
          gap: 15px;
          overflow: hidden;
          border-color: #d8e6de;
          background:
            linear-gradient(180deg, #f3faf6 0%, #ffffff 26%);
        }

        .sticky-preview .block-heading {
          margin-bottom: 0;
          border-bottom: 1px solid #e3ede7;
          padding-bottom: 14px;
        }

        .sticky-preview .block-heading h3::before {
          content: "👁";
          display: inline-grid;
          width: 28px;
          height: 28px;
          place-items: center;
          border-radius: 9px;
          background: #e9f7ef;
          font-size: 13px;
        }

        .sticky-preview .block-heading p {
          margin-left: 0;
        }

        .push-preview,
        .preview-audience {
          border: 1px solid #dce8e1;
          border-radius: 14px;
          background: #fff;
          padding: 14px;
          box-shadow: 0 7px 18px rgba(31, 61, 45, 0.05);
        }

        .push-preview {
          border-color: #d5e4ff;
          background: linear-gradient(145deg, #f1f6ff, #ffffff);
        }

        .push-preview small,
        .preview-audience small {
          color: var(--blue);
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 0.12em;
        }

        .preview-audience small {
          color: var(--brand);
        }

        .push-preview strong,
        .preview-audience strong,
        .preview-audience span {
          display: block;
        }

        .push-preview strong {
          margin-top: 6px;
          font-size: 13px;
        }

        .push-preview p {
          margin: 5px 0 0;
          color: #68776f;
          font-size: 11px;
          line-height: 1.5;
        }

        .preview-audience {
          border-color: #cfe8da;
          background: #f3fbf6;
        }

        .preview-audience strong {
          margin-top: 6px;
          color: #1d5135;
          font-size: 12px;
        }

        .preview-audience span {
          margin-top: 4px;
          color: #697a70;
          font-size: 10px;
        }

        .portal-preview {
          overflow: hidden;
          border: 1px solid #dfe7e2;
          border-radius: 16px;
          background: #fff;
          box-shadow: 0 12px 28px rgba(31, 61, 45, 0.08);
        }

        .portal-image {
          height: 195px;
          display: grid;
          place-items: center;
          background:
            linear-gradient(135deg, #eef5f1, #f4f0ff);
          color: #8b9b92;
          font-size: 11px;
        }

        .portal-image img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .portal-content {
          padding: 18px;
        }

        .portal-content > small {
          color: var(--brand);
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 0.1em;
        }

        .portal-content h4 {
          margin: 7px 0 0;
          color: #15231b;
          font-size: 19px;
          letter-spacing: -0.025em;
        }

        .portal-content p {
          margin: 8px 0 14px;
          color: #68776f;
          font-size: 12px;
          line-height: 1.55;
          white-space: pre-wrap;
        }

        .portal-button {
          display: flex;
          min-height: 44px;
          align-items: center;
          justify-content: center;
          border-radius: 11px;
          background: linear-gradient(135deg, #159b5a, #1bb66c);
          color: #fff;
          font-size: 12px;
          font-weight: 900;
          text-decoration: none;
          box-shadow: 0 8px 18px rgba(21, 155, 90, 0.20);
        }

        .portal-button.disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }

        .contact-preview {
          display: block;
          margin-top: 9px;
          color: #87948d !important;
          text-align: center;
          letter-spacing: normal !important;
        }

        .save-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 9px;
          border-top: 1px solid #e2ece6;
          padding-top: 14px;
        }

        .history-section {
          margin-top: 28px;
          padding: 24px;
          background: linear-gradient(180deg, #ffffff, #fbfdfc);
        }

        .history-header {
          border-bottom: 1px solid #e5ece8;
          padding-bottom: 17px;
        }

        .history-header h2 {
          font-size: 23px;
        }

        .filters {
          display: grid;
          grid-template-columns: minmax(190px, 280px) 175px auto;
          gap: 10px;
        }

        .promotion-table-wrap {
          overflow-x: auto;
          margin-top: 16px;
          border: 1px solid #e2eae6;
          border-radius: 14px;
        }

        .promotion-table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          overflow: hidden;
          font-size: 12px;
        }

        .promotion-table th {
          padding: 12px 11px;
          border-bottom: 1px solid #dfe9e3;
          background: #f3f8f5;
          color: #64756b;
          font-size: 9px;
          font-weight: 900;
          text-align: left;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .promotion-table td {
          padding: 13px 11px;
          border-bottom: 1px solid #edf2ef;
          background: #fff;
          vertical-align: middle;
        }

        .promotion-table tr:last-child td {
          border-bottom: 0;
        }

        .promotion-table tbody tr:hover td {
          background: #fbfdfc;
        }

        .promotion-cell {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 230px;
        }

        .promotion-cell strong,
        .promotion-cell small {
          display: block;
        }

        .promotion-cell strong {
          color: #1b2a22;
        }

        .promotion-cell small {
          margin-top: 4px;
          color: #7c8982;
          font-size: 9px;
        }

        .table-thumb {
          display: grid;
          flex: 0 0 44px;
          width: 44px;
          height: 44px;
          place-items: center;
          overflow: hidden;
          border: 1px solid #e2e9e5;
          border-radius: 10px;
          background: linear-gradient(135deg, #eef6f1, #f3efff);
          color: #87958d;
        }

        .table-thumb img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .audience-badge,
        .status-badge {
          display: inline-flex;
          align-items: center;
          min-height: 25px;
          border-radius: 999px;
          padding: 5px 9px;
          font-size: 9px;
          font-weight: 900;
        }

        .audience-badge.manual {
          background: #eee9ff;
          color: #6042c0;
        }

        .audience-badge.automatic {
          background: #e8f7ef;
          color: #087343;
        }

        .audience-description {
          display: block;
          max-width: 190px;
          margin-top: 5px;
          color: #738179;
          font-size: 9px;
        }

        .status-draft {
          background: #eef2f0;
          color: #5d6963;
        }

        .status-published {
          background: #dcf7e8;
          color: #157242;
        }

        .status-scheduled {
          background: #fff1d6;
          color: #8a5e11;
        }

        .status-expired,
        .status-cancelled {
          background: #fde7ea;
          color: #ad3342;
        }

        .delivery-details {
          min-width: 170px;
        }

        .delivery-details summary {
          color: var(--blue);
          font-size: 10px;
          font-weight: 900;
          cursor: pointer;
        }

        .delivery-metrics {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px;
          min-width: 300px;
          margin-top: 10px;
          border: 1px solid #dde7e1;
          border-radius: 11px;
          background: #f8fbf9;
          padding: 10px;
          color: #63736a;
          font-size: 9px;
        }

        .delivery-list {
          display: grid;
          gap: 5px;
          max-height: 180px;
          overflow-y: auto;
          min-width: 300px;
          margin-top: 7px;
        }

        .delivery-list > div {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          border-bottom: 1px solid #edf2ef;
          padding: 6px 2px;
          color: #65766c;
          font-size: 9px;
        }

        .row-actions {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 6px;
          min-width: 150px;
        }

        .row-actions button {
          min-height: 30px;
          border: 1px solid #d9e4de;
          border-radius: 8px;
          background: #fff;
          padding: 5px 8px;
        }

        .danger-link {
          color: var(--danger) !important;
          border-color: #f0c9ce !important;
        }

        .empty-state {
          margin-top: 18px;
          border: 1px dashed #cfdcd5;
          border-radius: 14px;
          background: #f9fcfa;
          padding: 34px;
          color: #718078;
          text-align: center;
        }

        .toast {
          position: fixed;
          z-index: 1000;
          top: 18px;
          right: 18px;
          max-width: min(430px, calc(100% - 36px));
          border-radius: 13px;
          padding: 14px 17px;
          color: #fff;
          font-size: 12px;
          font-weight: 900;
          box-shadow: 0 18px 50px rgba(20, 30, 50, 0.25);
        }

        .toast-success {
          background: linear-gradient(135deg, #12844c, #19a960);
        }

        .toast-error {
          background: linear-gradient(135deg, #c63543, #e54a56);
        }

        @media (max-width: 1120px) {
          .workspace {
            grid-template-columns: 1fr;
          }

          .sticky-preview {
            position: static;
          }

          .preview-column {
            order: -1;
          }
        }

        @media (max-width: 780px) {
          .page-shell {
            width: min(100% - 18px, 1520px);
            padding-top: 14px;
          }

          .page-header {
            align-items: stretch;
            flex-direction: column;
            padding: 20px;
          }

          .page-header .button {
            width: 100%;
          }

          .page-header,
          .history-header,
          .section-title-row,
          .inline-actions,
          .campaign-select-row,
          .campaign-summary {
            align-items: stretch;
            flex-direction: column;
          }

          .section-card,
          .history-section {
            padding: 14px;
            border-radius: 17px;
          }

          .section-block {
            padding: 15px;
          }

          .mode-selector,
          .audience-list,
          .form-grid,
          .form-grid-three,
          .new-campaign-grid,
          .customer-search-row,
          .filters {
            grid-template-columns: 1fr;
          }

          .block-heading p {
            margin-left: 0;
          }

          .campaign-actions,
          .save-actions {
            width: 100%;
          }

          .save-actions {
            grid-template-columns: 1fr;
          }

          .campaign-actions button {
            flex: 1;
          }

          .promotion-table-wrap {
            margin-inline: -14px;
            border-right: 0;
            border-left: 0;
            border-radius: 0;
          }
        }

        @media (max-width: 720px) {
          .audience-summary-row {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}
