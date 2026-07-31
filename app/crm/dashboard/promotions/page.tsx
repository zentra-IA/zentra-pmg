"use client";

import {
  ChangeEvent,
  DragEvent,
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type PromotionImage = {
  id?: string;
  image_url: string;
  file_name?: string | null;
  mime_type?: string | null;
  file_size?: number | null;
  sort_order?: number;
};

type PromotionTarget = {
  id?: string;
  price_table: number;
};

type PromotionDelivery = {
  id: string;
  status: string;
  queued_at?: string | null;
  sent_at?: string | null;
  accepted_at?: string | null;
  opened_at?: string | null;
  viewed_at?: string | null;
  clicked_at?: string | null;
  whatsapp_clicked_at?: string | null;
  error_message?: string | null;
  customer: {
    id: string;
    legal_name: string;
    trade_name?: string | null;
    price_table?: number | null;
    city?: string | null;
    state?: string | null;
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
  valid_from?: string | null;
  valid_until?: string | null;
  status: string;
  published_at?: string | null;
  created_at: string;
  images: PromotionImage[];
  targets: PromotionTarget[];
  deliveries?: PromotionDelivery[];
  _count?: { deliveries: number };
};

type AudienceTable = {
  price_table: number;
  customer_count: number;
  range_label?: string;
};

type Toast = {
  type: "success" | "error";
  message: string;
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
  valid_from: string;
  valid_until: string;
  price_tables: number[];
  images: PromotionImage[];
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
    "Olá! Vi esta promoção no portal Zentra e gostaria de mais informações.",
  valid_from: "",
  valid_until: "",
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


function deliveryLabel(delivery: PromotionDelivery) {
  const error = String(delivery.error_message || "").toLowerCase();

  if (delivery.clicked_at) return "Clicou na notificação";
  if (delivery.viewed_at) return "Visualizou a promoção";
  if (delivery.opened_at) return "Abriu o portal";
  if (delivery.status === "sent" || delivery.sent_at) return "Recebeu";
  if (delivery.status === "pending") return "Aguardando envio";

  if (
    error.includes("sem inscrição") ||
    error.includes("subscription") ||
    error.includes("push ativo")
  ) {
    return "Não ativou notificações";
  }

  if (error.includes("permission") || error.includes("permiss")) {
    return "Permissão negada";
  }

  if (
    error.includes("expired") ||
    error.includes("410") ||
    error.includes("404")
  ) {
    return "Assinatura expirada";
  }

  return delivery.status === "failed"
    ? "Falha no envio"
    : delivery.status;
}

function deliveryDate(delivery: PromotionDelivery) {
  return (
    delivery.clicked_at ||
    delivery.viewed_at ||
    delivery.opened_at ||
    delivery.sent_at ||
    delivery.queued_at
  );
}

function promotionMetrics(promotion: Promotion) {
  const deliveries = promotion.deliveries || [];
  const total = promotion._count?.deliveries ?? deliveries.length;
  const sent = deliveries.filter(
    (item) => item.status === "sent" || Boolean(item.sent_at)
  ).length;
  const failed = deliveries.filter((item) => item.status === "failed").length;
  const pending = deliveries.filter((item) => item.status === "pending").length;
  const opened = deliveries.filter(
    (item) =>
      Boolean(item.opened_at) ||
      Boolean(item.viewed_at) ||
      Boolean(item.clicked_at)
  ).length;
  const viewed = deliveries.filter(
    (item) => Boolean(item.viewed_at) || Boolean(item.clicked_at)
  ).length;
  const clicked = deliveries.filter(
    (item) => Boolean(item.clicked_at)
  ).length;
  const whatsapp = deliveries.filter(
    (item) => Boolean(item.whatsapp_clicked_at)
  ).length;
  const openRate = sent > 0 ? Math.round((opened / sent) * 100) : 0;
  const clickRate = sent > 0 ? Math.round((clicked / sent) * 100) : 0;

  return {
    total,
    sent,
    failed,
    pending,
    opened,
    viewed,
    clicked,
    whatsapp,
    openRate,
    clickRate,
  };
}

function tableLabel(priceTable: number) {
  if (priceTable === 0) return "Tabela 0 · 0 a 100 km";
  if (priceTable >= 1 && priceTable <= 5) {
    return `Tabela ${priceTable} · ${priceTable * 100} a ${(priceTable + 1) * 100} km`;
  }
  return `Tabela ${priceTable} · acima de 600 km`;
}

function formatDate(value?: string | null) {
  if (!value) return "Sem data";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data inválida";

  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}


function deliveryTimeline(delivery: PromotionDelivery) {
  return [
    { label: "Push enviado", value: delivery.sent_at },
    { label: "Aceito pelo serviço", value: delivery.accepted_at },
    { label: "Clicou na notificação", value: delivery.clicked_at },
    { label: "Abriu o portal", value: delivery.opened_at },
    { label: "Visualizou a promoção", value: delivery.viewed_at },
    { label: "Clicou no WhatsApp", value: delivery.whatsapp_clicked_at },
  ].filter((item) => Boolean(item.value));
}

function toInputDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000)
    .toISOString()
    .slice(0, 16);
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, "").slice(0, 15);
}

function normalizeWhatsAppForLink(value: string) {
  const digits = onlyDigits(value);

  if (!digits) return "";
  if (digits.startsWith("55")) return digits;

  // Número brasileiro informado com DDD.
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }

  return digits;
}

function formatWhatsappInput(value: string) {
  const digits = onlyDigits(value);

  if (!digits) return "";
  if (digits.startsWith("55") && digits.length > 2) {
    const country = digits.slice(0, 2);
    const ddd = digits.slice(2, 4);
    const number = digits.slice(4);

    if (!ddd) return `+${country}`;
    if (number.length <= 4) return `+${country} (${ddd}) ${number}`;
    if (number.length <= 8) {
      return `+${country} (${ddd}) ${number.slice(0, 4)}-${number.slice(4)}`;
    }
    return `+${country} (${ddd}) ${number.slice(0, 5)}-${number.slice(5, 9)}`;
  }

  if (digits.length <= 2) return `(${digits}`;
  const ddd = digits.slice(0, 2);
  const number = digits.slice(2);

  if (number.length <= 4) return `(${ddd}) ${number}`;
  if (number.length <= 8) {
    return `(${ddd}) ${number.slice(0, 4)}-${number.slice(4)}`;
  }
  return `(${ddd}) ${number.slice(0, 5)}-${number.slice(5, 9)}`;
}

function buildWhatsappUrl(number: string, message: string) {
  const normalized = normalizeWhatsAppForLink(number);
  if (!normalized) return "#";

  const query = message.trim()
    ? `?text=${encodeURIComponent(message.trim())}`
    : "";

  return `https://wa.me/${normalized}${query}`;
}

function imageName(image: PromotionImage, index: number) {
  return image.file_name || `Imagem ${index + 1}`;
}

export default function PromotionsPage() {
  const formRef = useRef<HTMLFormElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [audience, setAudience] = useState<AudienceTable[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filters, setFilters] = useState({ q: "", status: "" });
  const [tone, setTone] = useState("comercial");
  const [loading, setLoading] = useState(true);
  const [savingMode, setSavingMode] = useState<
    "draft" | "published" | null
  >(null);
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  function notify(type: Toast["type"], message: string) {
    setToast({ type, message });
    window.setTimeout(() => setToast(null), 4200);
  }

  async function loadPromotions() {
    setLoading(true);

    try {
      const params = new URLSearchParams();

      if (filters.q.trim()) params.set("q", filters.q.trim());
      if (filters.status) params.set("status", filters.status);

      const response = await fetch(
        `/api/crm/promotions?${params.toString()}`,
        {
          cache: "no-store",
          credentials: "include",
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Erro ao carregar promoções.");
      }

      setPromotions(Array.isArray(data.promotions) ? data.promotions : []);
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

  async function loadAudience() {
    try {
      const response = await fetch("/api/crm/promotions/audience", {
        cache: "no-store",
        credentials: "include",
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Erro ao carregar público.");
      }

      setAudience(Array.isArray(data.tables) ? data.tables : []);
    } catch (error) {
      notify(
        "error",
        error instanceof Error ? error.message : "Erro ao carregar público."
      );
    }
  }

  useEffect(() => {
    void Promise.all([loadPromotions(), loadAudience()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedCustomerCount = useMemo(() => {
    return audience
      .filter((item) => form.price_tables.includes(item.price_table))
      .reduce((sum, item) => sum + item.customer_count, 0);
  }, [audience, form.price_tables]);

  const previewImage = form.images[0]?.image_url || "";
  const whatsappUrl = useMemo(
    () => buildWhatsappUrl(form.contact_whatsapp, form.whatsapp_message),
    [form.contact_whatsapp, form.whatsapp_message]
  );

  function updateField<K extends keyof FormState>(
    key: K,
    value: FormState[K]
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function resetForm() {
    setForm({ ...EMPTY_FORM, images: [], price_tables: [] });
    setEditingId(null);
    setTone("comercial");
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
    setForm((current) => ({
      ...current,
      price_tables: current.price_tables.includes(priceTable)
        ? current.price_tables.filter((item) => item !== priceTable)
        : [...current.price_tables, priceTable].sort((a, b) => a - b),
    }));
  }

  async function generateWithAI() {
    if (form.ai_prompt.trim().length < 8) {
      notify("error", "Descreva melhor a intenção da promoção.");
      return;
    }

    setGenerating(true);

    try {
      const response = await fetch("/api/crm/promotions/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          objective: form.ai_prompt,
          tone,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Erro ao gerar conteúdo.");
      }

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
        error instanceof Error ? error.message : "Erro ao gerar conteúdo."
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
            data.error ||
              data.details ||
              `Erro ao enviar ${file.name}.`
          );
        }

        const imageUrl =
          data.imageUrl || data.fileUrl || data.mediaUrl || data.url;

        if (!imageUrl) {
          throw new Error(
            `O upload de ${file.name} não retornou uma URL.`
          );
        }

        uploaded.push({
          image_url: imageUrl,
          file_name: data.name || file.name,
          mime_type: data.mimeType || file.type,
          file_size: data.size || file.size,
        });
      }

      setForm((current) => ({
        ...current,
        images: [...current.images, ...uploaded].slice(0, 10),
      }));

      notify(
        "success",
        uploaded.length === 1
          ? "Imagem adicionada."
          : `${uploaded.length} imagens adicionadas.`
      );
    } catch (error) {
      notify(
        "error",
        error instanceof Error ? error.message : "Erro ao enviar imagens."
      );
    } finally {
      setUploading(false);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) {
      void uploadFiles(event.target.files);
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);

    if (event.dataTransfer.files?.length) {
      void uploadFiles(event.dataTransfer.files);
    }
  }

  function moveImage(index: number, direction: -1 | 1) {
    setForm((current) => {
      const next = [...current.images];
      const destination = index + direction;

      if (destination < 0 || destination >= next.length) {
        return current;
      }

      [next[index], next[destination]] = [
        next[destination],
        next[index],
      ];

      return { ...current, images: next };
    });
  }

  function removeImage(index: number) {
    setForm((current) => ({
      ...current,
      images: current.images.filter(
        (_, itemIndex) => itemIndex !== index
      ),
    }));
  }

  function validate(status: "draft" | "published") {
    if (!form.internal_title.trim()) {
      return "Informe o título interno da campanha.";
    }

    if (!form.title.trim()) {
      return "Informe o título da promoção.";
    }

    if (!form.price_tables.length) {
      return "Selecione pelo menos uma tabela comercial.";
    }

    if (
      form.valid_from &&
      form.valid_until &&
      new Date(form.valid_until) <= new Date(form.valid_from)
    ) {
      return "O fim da validade deve ser posterior ao início.";
    }

    if (status === "published") {
      if (!form.images.length) {
        return "Adicione pelo menos uma imagem antes de publicar.";
      }

      if (!form.portal_text.trim()) {
        return "Informe o texto do portal antes de publicar.";
      }

      const normalizedWhatsapp = normalizeWhatsAppForLink(
        form.contact_whatsapp
      );

      if (normalizedWhatsapp.length < 12) {
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
        `${editingId ? "Atualizar" : "Publicar"} "${form.internal_title}" para ${selectedCustomerCount} cliente(s)?`
      );

      if (!confirmed) return;
    }

    setSavingMode(status);

    try {
      const response = await fetch("/api/crm/promotions", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          id: editingId,
          ...form,
          contact_whatsapp: normalizeWhatsAppForLink(
            form.contact_whatsapp
          ),
          status,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Erro ao salvar promoção.");
      }

      if (status === "published" && data?.promotion?.id) {
        const pushResponse = await fetch("/api/push/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            promotion_id: data.promotion.id,
            url: "/",
          }),
        });

        const pushData = await pushResponse.json().catch(() => ({}));

        notify(
          pushResponse.ok ? "success" : "error",
          pushResponse.ok
            ? `${editingId ? "Publicação atualizada" : "Promoção publicada"}. ${pushData.message || "Push processado."}`
            : `Promoção salva, mas o Push falhou: ${pushData.error || "erro desconhecido"}`
        );
      } else {
        notify(
          "success",
          editingId ? "Rascunho atualizado." : "Rascunho salvo."
        );
      }

      resetForm();
      await loadPromotions();
    } catch (error) {
      notify(
        "error",
        error instanceof Error ? error.message : "Erro ao salvar promoção."
      );
    } finally {
      setSavingMode(null);
    }
  }

  function editPromotion(promotion: Promotion) {
    setEditingId(promotion.id);

    setForm({
      internal_title: promotion.internal_title || promotion.title || "",
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
      valid_from: toInputDate(promotion.valid_from),
      valid_until: toInputDate(promotion.valid_until),
      price_tables: promotion.targets
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


  async function resendPromotionPush(promotion: Promotion) {
    const metrics = promotionMetrics(promotion);
    const confirmed = window.confirm(
      `Reenviar o Push da campanha "${promotion.internal_title || promotion.title}"?\n\nO sistema tentará novamente para clientes elegíveis.`
    );

    if (!confirmed) return;

    try {
      const response = await fetch("/api/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ promotion_id: promotion.id }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Erro ao reenviar Push.");
      }

      notify(
        "success",
        data.message ||
          `Reenvio concluído. ${metrics.failed} falha(s) anteriores.`
      );
      await loadPromotions();
    } catch (error) {
      notify(
        "error",
        error instanceof Error ? error.message : "Erro ao reenviar Push."
      );
    }
  }

  async function removePromotion(promotion: Promotion) {
    const confirmed = window.confirm(
      `Excluir definitivamente "${promotion.title}"?\n\nEsta ação também remove o histórico de entregas ligado à publicação.`
    );

    if (!confirmed) return;

    try {
      const response = await fetch(
        `/api/crm/promotions?id=${encodeURIComponent(promotion.id)}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Erro ao excluir promoção.");
      }

      if (editingId === promotion.id) {
        resetForm();
      }

      notify("success", "Promoção excluída.");
      await loadPromotions();
    } catch (error) {
      notify(
        "error",
        error instanceof Error ? error.message : "Erro ao excluir promoção."
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
            Crie, visualize e publique comunicações para o portal do
            cliente.
          </p>
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
        onSubmit={(event) => void savePromotion(event, "draft")}
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
                <p>Escolha as tabelas que receberão a publicação.</p>
              </div>

              <div className="audience-list">
                {[0, 1, 2, 3, 4, 5].map((priceTable) => {
                  const item = audience.find(
                    (row) => row.price_table === priceTable
                  );
                  const selected =
                    form.price_tables.includes(priceTable);

                  return (
                    <button
                      key={priceTable}
                      type="button"
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
                                : `${priceTable * 100} a ${(priceTable + 1) * 100} km`)}
                        </span>
                        <small>
                          {item?.customer_count || 0} clientes
                        </small>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="section-block">
              <div className="block-heading">
                <h3>Assistente de conteúdo</h3>
                <p>
                  Descreva a oferta. A IA cria os textos, mas você
                  continua no controle.
                </p>
              </div>

              <label className="field">
                <span>Objetivo da promoção</span>
                <textarea
                  value={form.ai_prompt}
                  onChange={(event) =>
                    updateField("ai_prompt", event.target.value)
                  }
                  placeholder="Ex.: Divulgar muçarela e calabresa para pizzarias, sem informar preços."
                />
              </label>

              <div className="inline-actions">
                <div className="segmented">
                  {["curta", "comercial", "criativa"].map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={tone === item ? "active" : ""}
                      onClick={() => setTone(item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => void generateWithAI()}
                  disabled={generating}
                >
                  {generating ? "Gerando..." : "Gerar com IA"}
                </button>
              </div>
            </div>

            <div className="section-block">
              <div className="block-heading">
                <h3>Conteúdo</h3>
                <p>Textos do portal e da notificação push.</p>
              </div>

              <div className="form-grid">
                <label className="field field-wide">
                  <span>Título interno da campanha *</span>
                  <input
                    value={form.internal_title}
                    maxLength={120}
                    onChange={(event) =>
                      updateField("internal_title", event.target.value)
                    }
                    placeholder="Ex.: Disparo Tabela 0 · 30/07"
                  />
                  <small>
                    Visível somente no CRM. O cliente nunca verá este título.
                  </small>
                </label>

                <label className="field field-wide">
                  <span>Título público da promoção *</span>
                  <input
                    value={form.title}
                    maxLength={90}
                    onChange={(event) =>
                      updateField("title", event.target.value)
                    }
                    placeholder="Ex.: Seleção especial para sua pizzaria"
                  />
                  <small>
                    Exibido no portal do cliente e usado como conteúdo público.
                  </small>
                </label>

                <label className="field field-wide">
                  <span>Descrição interna</span>
                  <textarea
                    value={form.description}
                    onChange={(event) =>
                      updateField("description", event.target.value)
                    }
                    placeholder="Anotação para o time comercial."
                  />
                </label>

                <label className="field field-wide">
                  <span>Texto do portal *</span>
                  <textarea
                    value={form.portal_text}
                    onChange={(event) =>
                      updateField("portal_text", event.target.value)
                    }
                    placeholder="Mensagem que o cliente verá dentro do portal."
                  />
                </label>

                <label className="field">
                  <span>Título do push</span>
                  <input
                    value={form.push_title}
                    maxLength={45}
                    onChange={(event) =>
                      updateField("push_title", event.target.value)
                    }
                    placeholder="Novidade para você"
                  />
                  <small>{form.push_title.length}/45</small>
                </label>

                <label className="field">
                  <span>Mensagem do push</span>
                  <input
                    value={form.push_message}
                    maxLength={110}
                    onChange={(event) =>
                      updateField("push_message", event.target.value)
                    }
                    placeholder="Veja as condições no portal."
                  />
                  <small>{form.push_message.length}/110</small>
                </label>
              </div>
            </div>

            <div className="section-block">
              <div className="block-heading">
                <h3>Contato da promoção</h3>
                <p>
                  O número é definido em cada publicação e não fica
                  preso ao cadastro do vendedor.
                </p>
              </div>

              <div className="form-grid">
                <label className="field">
                  <span>WhatsApp do vendedor *</span>
                  <input
                    inputMode="tel"
                    value={formatWhatsappInput(
                      form.contact_whatsapp
                    )}
                    onChange={(event) =>
                      updateField(
                        "contact_whatsapp",
                        onlyDigits(event.target.value)
                      )
                    }
                    placeholder="(62) 99999-9999"
                  />
                  <small>
                    O sistema adiciona o código 55 quando necessário.
                  </small>
                </label>

                <label className="field">
                  <span>Texto do botão *</span>
                  <input
                    value={form.call_to_action}
                    maxLength={30}
                    onChange={(event) =>
                      updateField(
                        "call_to_action",
                        event.target.value
                      )
                    }
                    placeholder="Entrar em contato"
                  />
                </label>

                <label className="field field-wide">
                  <span>Mensagem pronta do WhatsApp</span>
                  <textarea
                    value={form.whatsapp_message}
                    onChange={(event) =>
                      updateField(
                        "whatsapp_message",
                        event.target.value
                      )
                    }
                    placeholder="Mensagem enviada ao abrir o WhatsApp."
                  />
                </label>
              </div>
            </div>

            <div className="section-block">
              <div className="block-heading">
                <h3>Imagens</h3>
                <p>
                  A primeira imagem será usada como destaque no portal
                  e no preview do push.
                </p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                hidden
                onChange={onFileChange}
              />

              <div
                className={`dropzone ${dragging ? "dragging" : ""}`}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
              >
                <p>
                  {uploading
                    ? "Enviando imagens..."
                    : "Arraste imagens para cá ou selecione no computador."}
                </p>
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Selecionar imagens
                </button>
                <small>JPG, PNG, WEBP ou GIF. Até 10 imagens.</small>
              </div>

              {form.images.length > 0 && (
                <div className="image-list">
                  {form.images.map((image, index) => (
                    <article
                      className="image-row"
                      key={`${image.image_url}-${index}`}
                    >
                      <img
                        src={image.image_url}
                        alt={imageName(image, index)}
                      />

                      <div className="image-meta">
                        <strong>{imageName(image, index)}</strong>
                        <small>
                          {index === 0
                            ? "Imagem principal"
                            : `Posição ${index + 1}`}
                        </small>
                      </div>

                      <div className="row-actions">
                        <button
                          type="button"
                          aria-label="Mover imagem para a esquerda"
                          disabled={index === 0}
                          onClick={() => moveImage(index, -1)}
                        >
                          ←
                        </button>
                        <button
                          type="button"
                          aria-label="Mover imagem para a direita"
                          disabled={index === form.images.length - 1}
                          onClick={() => moveImage(index, 1)}
                        >
                          →
                        </button>
                        <button
                          type="button"
                          className="danger-link"
                          onClick={() => removeImage(index)}
                        >
                          Remover
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>

            <div className="section-block">
              <div className="block-heading">
                <h3>Validade</h3>
                <p>Opcional. Controle o período da oferta.</p>
              </div>

              <div className="form-grid">
                <label className="field">
                  <span>Início</span>
                  <input
                    type="datetime-local"
                    value={form.valid_from}
                    onChange={(event) =>
                      updateField("valid_from", event.target.value)
                    }
                  />
                </label>

                <label className="field">
                  <span>Fim</span>
                  <input
                    type="datetime-local"
                    value={form.valid_until}
                    onChange={(event) =>
                      updateField("valid_until", event.target.value)
                    }
                  />
                </label>
              </div>
            </div>
          </section>
        </div>

        <aside className="preview-column">
          <div className="preview-sticky">
            <section className="summary-card">
              <div>
                <span>Público estimado</span>
                <strong>{selectedCustomerCount}</strong>
                <small>clientes ativos</small>
              </div>
              <div>
                <span>Status</span>
                <strong>
                  {editingId ? "Editando" : "Nova"}
                </strong>
                <small>
                  {form.price_tables.length
                    ? `Tabelas ${form.price_tables.join(", ")}`
                    : "Sem público"}
                </small>
              </div>
            </section>

            <section className="preview-card">
              <div className="preview-heading">
                <h3>Preview do push</h3>
                <span>Visual aproximado</span>
              </div>

              <div className="push-preview">
                <div className="push-app">
                  <img
  className="push-logo-image"
  src="/logo-pmg.png"
  alt="Logo PMG"
/>
                  <div>
                    <strong>PMG</strong>
                    <small>agora</small>
                  </div>
                </div>

                <div className="push-copy">
                  <strong>
                    {form.push_title ||
                      form.title ||
                      "Título da notificação"}
                  </strong>
                  <p>
                    {form.push_message ||
                      "A mensagem do push aparecerá aqui."}
                  </p>
                </div>

                {previewImage && (
                  <img
                    className="push-image"
                    src={previewImage}
                    alt="Preview da notificação"
                  />
                )}
              </div>
            </section>

            <section className="preview-card">
              <div className="preview-heading">
                <h3>Preview do portal</h3>
                <span>Atualização em tempo real</span>
              </div>

              <div className="portal-preview">
                <div className="portal-image">
                  {previewImage ? (
                    <img
                      src={previewImage}
                      alt="Preview da promoção"
                    />
                  ) : (
                    <span>Imagem da promoção</span>
                  )}
                </div>

                <div className="portal-content">
                  <small>OFERTA ESPECIAL</small>
                  <h4>
                    {form.title || "Título da promoção"}
                  </h4>
                  <p>
                    {form.portal_text ||
                      "O texto que o cliente verá aparece aqui."}
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
                    {form.call_to_action ||
                      "Entrar em contato"}
                  </a>

                  <small className="contact-preview">
                    {normalizeWhatsAppForLink(
                      form.contact_whatsapp
                    ) || "WhatsApp ainda não informado"}
                  </small>
                </div>
              </div>
            </section>

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
                  void savePromotion(event as unknown as FormEvent, "published")
                }
              >
                {savingMode === "published"
                  ? "Publicando..."
                  : editingId
                    ? "Atualizar publicação"
                    : "Publicar"}
              </button>
            </div>
          </div>
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
              placeholder="Buscar promoção"
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
                {promotions.map((promotion) => (
                  <tr key={promotion.id}>
                    <td>
                      <div className="promotion-cell">
                        <div className="table-thumb">
                          {promotion.images?.[0]?.image_url ? (
                            <img
                              src={
                                promotion.images[0].image_url
                              }
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
                          <small>
                            Cliente vê: {promotion.title}
                          </small>
                        </div>
                      </div>
                    </td>

                    <td>
                      {promotion.targets
                        .map((item) => item.price_table)
                        .join(", ") || "—"}
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
                      {(() => {
                        const metrics = promotionMetrics(promotion);

                        return (
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
                                <small>Nenhuma entrega registrada.</small>
                              ) : (
                                (promotion.deliveries || []).map((delivery) => (
                                  <div key={delivery.id} className="delivery-item">
                                    <strong>
                                      {delivery.customer.trade_name ||
                                        delivery.customer.legal_name}
                                    </strong>
                                    <span>
                                      Tabela {delivery.customer.price_table ?? "—"} ·{" "}
                                      {deliveryLabel(delivery)}
                                    </span>
                                    <div className="delivery-timeline">
                                      {deliveryTimeline(delivery).length ? (
                                        deliveryTimeline(delivery).map((event) => (
                                          <small key={event.label}>
                                            <b>{event.label}:</b>{" "}
                                            {formatDate(event.value)}
                                          </small>
                                        ))
                                      ) : (
                                        <small>Sem atualização</small>
                                      )}
                                    </div>

                                    {delivery.error_message && (
                                      <small title={delivery.error_message}>
                                        Motivo: {deliveryLabel(delivery)}
                                      </small>
                                    )}
                                  </div>
                                ))
                              )}
                            </div>
                          </details>
                        );
                      })()}
                    </td>

                    <td>{formatDate(promotion.created_at)}</td>

                    <td>
                      <div className="table-actions">
                        <button
                          type="button"
                          onClick={() =>
                            editPromotion(promotion)
                          }
                        >
                          Editar
                        </button>
                        {promotion.status === "published" && (
                          <button
                            type="button"
                            onClick={() =>
                              void resendPromotionPush(promotion)
                            }
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
                ))}
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
          background: #f6f7f9;
        }

        .page-shell {
          width: min(1500px, calc(100% - 32px));
          margin: 0 auto;
          padding: 32px 0 64px;
          color: #172033;
        }

        .page-header,
        .history-header,
        .section-title-row,
        .inline-actions,
        .save-actions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }

        .page-header {
          margin-bottom: 24px;
        }

        .page-header h1,
        .history-header h2,
        .section-title-row h2 {
          margin: 3px 0 0;
          letter-spacing: -0.035em;
        }

        .page-header h1 {
          font-size: clamp(28px, 3vw, 40px);
        }

        .subtitle {
          margin: 8px 0 0;
          color: #687086;
        }

        .overline,
        .section-kicker {
          margin: 0;
          color: #657085;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.12em;
        }

        .workspace {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 390px;
          gap: 24px;
          align-items: start;
        }

        .section-card,
        .preview-card,
        .summary-card,
        .history-section {
          background: #ffffff;
          border: 1px solid #e6e9ef;
          border-radius: 16px;
          box-shadow: 0 8px 30px rgba(28, 39, 60, 0.04);
        }

        .section-card {
          padding: 26px;
        }

        .section-block {
          padding: 26px 0;
          border-top: 1px solid #edf0f4;
        }

        .section-block:first-of-type {
          margin-top: 22px;
        }

        .block-heading {
          margin-bottom: 16px;
        }

        .block-heading h3,
        .preview-heading h3 {
          margin: 0;
          font-size: 16px;
        }

        .block-heading p,
        .preview-heading span {
          margin: 5px 0 0;
          color: #737b8f;
          font-size: 13px;
        }

        .audience-list {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
        }

        .audience-item {
          display: flex;
          align-items: center;
          gap: 10px;
          min-height: 66px;
          padding: 12px;
          border: 1px solid #e1e5ec;
          border-radius: 12px;
          background: #fff;
          color: inherit;
          text-align: left;
          cursor: pointer;
        }

        .audience-item.selected {
          border-color: #315efb;
          background: #f5f7ff;
        }

        .audience-check {
          width: 20px;
          height: 20px;
          display: grid;
          place-items: center;
          border: 1px solid #cbd1dc;
          border-radius: 6px;
          color: #fff;
          font-size: 12px;
          background: #fff;
        }

        .audience-item.selected .audience-check {
          border-color: #315efb;
          background: #315efb;
        }

        .audience-item strong,
        .audience-item small {
          display: block;
        }

        .audience-item small {
          margin-top: 3px;
          color: #798196;
          font-size: 12px;
        }

        .form-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
        }

        .field {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .field-wide {
          grid-column: 1 / -1;
        }

        .field > span {
          font-size: 13px;
          font-weight: 700;
        }

        .field small {
          color: #858c9c;
          font-size: 11px;
        }

        input,
        textarea,
        select {
          width: 100%;
          border: 1px solid #dfe3ea;
          border-radius: 10px;
          background: #fff;
          color: #172033;
          font: inherit;
          outline: none;
          transition: border-color 0.18s ease, box-shadow 0.18s ease;
        }

        input,
        select {
          min-height: 43px;
          padding: 0 12px;
        }

        textarea {
          min-height: 96px;
          padding: 12px;
          resize: vertical;
        }

        input:focus,
        textarea:focus,
        select:focus {
          border-color: #315efb;
          box-shadow: 0 0 0 3px rgba(49, 94, 251, 0.11);
        }

        .inline-actions {
          margin-top: 13px;
        }

        .segmented {
          display: inline-flex;
          padding: 3px;
          border-radius: 10px;
          background: #f0f2f6;
        }

        .segmented button {
          padding: 8px 12px;
          border: 0;
          border-radius: 8px;
          background: transparent;
          color: #667086;
          font-size: 12px;
          cursor: pointer;
          text-transform: capitalize;
        }

        .segmented button.active {
          background: #fff;
          color: #172033;
          box-shadow: 0 2px 7px rgba(26, 34, 49, 0.08);
        }

        .button {
          min-height: 42px;
          padding: 0 16px;
          border: 1px solid transparent;
          border-radius: 10px;
          font: inherit;
          font-size: 13px;
          font-weight: 750;
          cursor: pointer;
        }

        .button:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .button-primary {
          background: #315efb;
          color: #fff;
        }

        .button-secondary {
          border-color: #dfe3ea;
          background: #fff;
          color: #273046;
        }

        .text-button,
        .table-actions button,
        .row-actions button {
          border: 0;
          background: transparent;
          color: #315efb;
          font: inherit;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }

        .dropzone {
          display: grid;
          justify-items: center;
          gap: 10px;
          padding: 28px 18px;
          border: 1px dashed #cfd5df;
          border-radius: 12px;
          background: #fafbfc;
          text-align: center;
        }

        .dropzone.dragging {
          border-color: #315efb;
          background: #f5f7ff;
        }

        .dropzone p {
          margin: 0;
          color: #4d566b;
          font-size: 13px;
        }

        .dropzone small {
          color: #8a91a0;
        }

        .image-list {
          display: grid;
          gap: 8px;
          margin-top: 14px;
        }

        .image-row {
          display: grid;
          grid-template-columns: 52px minmax(0, 1fr) auto;
          gap: 12px;
          align-items: center;
          padding: 8px;
          border: 1px solid #e8ebf0;
          border-radius: 10px;
        }

        .image-row img,
        .table-thumb img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .image-row img {
          width: 52px;
          height: 52px;
          border-radius: 8px;
        }

        .image-meta strong,
        .image-meta small {
          display: block;
        }

        .image-meta strong {
          overflow: hidden;
          font-size: 13px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .image-meta small {
          margin-top: 3px;
          color: #858c9b;
          font-size: 11px;
        }

        .delivery-details summary {
          cursor: pointer;
          color: #315efb;
          font-weight: 800;
        }

        .delivery-metrics {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 6px 12px;
          padding: 12px;
          border-bottom: 1px solid #e5e7eb;
          background: #f8fafc;
          font-size: 12px;
          color: #475569;
        }

        .delivery-metrics b {
          color: #172033;
        }

        .delivery-timeline {
          display: grid;
          gap: 3px;
          margin-top: 5px;
          padding-left: 10px;
          border-left: 2px solid #e5e7eb;
        }

        .delivery-timeline small {
          color: #64748b;
          line-height: 1.35;
        }

        .delivery-timeline b {
          color: #334155;
        }

        .delivery-list {
          min-width: 260px;
          max-height: 240px;
          margin-top: 10px;
          overflow: auto;
          padding: 10px;
          border: 1px solid #e8ebf0;
          border-radius: 10px;
          background: #ffffff;
          box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
        }

        .delivery-item {
          display: grid;
          gap: 3px;
          padding: 8px 0;
          border-bottom: 1px solid #eef0f4;
        }

        .delivery-item:last-child {
          border-bottom: 0;
        }

        .delivery-item span {
          color: #7b8394;
          font-size: 11px;
        }

        .row-actions,
        .table-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .row-actions button:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }

        .danger-link {
          color: #d54545 !important;
        }

        .preview-sticky {
          position: sticky;
          top: 20px;
          display: grid;
          gap: 14px;
        }

        .summary-card {
          display: grid;
          grid-template-columns: 1fr 1fr;
          padding: 18px;
          gap: 18px;
        }

        .summary-card div {
          min-width: 0;
        }

        .summary-card span,
        .summary-card strong,
        .summary-card small {
          display: block;
        }

        .summary-card span {
          color: #858c9c;
          font-size: 11px;
        }

        .summary-card strong {
          margin-top: 4px;
          font-size: 24px;
        }

        .summary-card small {
          margin-top: 2px;
          overflow: hidden;
          color: #747c8f;
          font-size: 11px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .preview-card {
          padding: 18px;
        }

        .preview-heading {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 14px;
        }

        .push-preview {
          overflow: hidden;
          padding: 14px;
          border-radius: 15px;
          background: linear-gradient(145deg, #f1f3f7, #e9edf3);
          box-shadow: inset 0 0 0 1px rgba(23, 32, 51, 0.05);
        }

        .push-app {
          display: flex;
          align-items: center;
          gap: 9px;
        }

        .push-logo-image {
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  border-radius: 9px;
  background: #ffffff;
  object-fit: contain;
}

        .push-app strong,
        .push-app small {
          display: block;
        }

        .push-app strong {
          font-size: 12px;
        }

        .push-app small {
          margin-top: 2px;
          color: #7d8596;
          font-size: 10px;
        }

        .push-copy {
          margin-top: 12px;
        }

        .push-copy strong {
          font-size: 14px;
        }

        .push-copy p {
          margin: 5px 0 0;
          color: #555f72;
          font-size: 12px;
          line-height: 1.4;
        }

        .push-image {
          width: 100%;
          height: 120px;
          margin-top: 12px;
          border-radius: 10px;
          object-fit: cover;
        }

        .portal-preview {
          overflow: hidden;
          border: 1px solid #e7eaf0;
          border-radius: 14px;
        }

        .portal-image {
          height: 170px;
          display: grid;
          place-items: center;
          background: #f2f4f7;
          color: #9aa1af;
          font-size: 12px;
        }

        .portal-image img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .portal-content {
          padding: 17px;
        }

        .portal-content > small {
          color: #315efb;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.1em;
        }

        .portal-content h4 {
          margin: 7px 0 0;
          font-size: 19px;
          letter-spacing: -0.025em;
        }

        .portal-content p {
          margin: 8px 0 14px;
          color: #677084;
          font-size: 13px;
          line-height: 1.5;
          white-space: pre-wrap;
        }

        .portal-button {
          display: flex;
          min-height: 42px;
          align-items: center;
          justify-content: center;
          border-radius: 10px;
          background: #24a967;
          color: #fff;
          font-size: 13px;
          font-weight: 800;
          text-decoration: none;
        }

        .portal-button.disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }

        .contact-preview {
          display: block;
          margin-top: 9px;
          color: #868d9d !important;
          text-align: center;
          letter-spacing: normal !important;
        }

        .save-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
        }

        .history-section {
          margin-top: 28px;
          padding: 24px;
        }

        .filters {
          display: grid;
          grid-template-columns: minmax(180px, 260px) 170px auto;
          gap: 10px;
        }

        .promotion-table-wrap {
          overflow-x: auto;
          margin-top: 18px;
        }

        .promotion-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }

        .promotion-table th {
          padding: 11px 10px;
          border-bottom: 1px solid #e8ebf0;
          color: #7b8394;
          font-size: 11px;
          text-align: left;
          text-transform: uppercase;
        }

        .promotion-table td {
          padding: 13px 10px;
          border-bottom: 1px solid #eef0f4;
          vertical-align: middle;
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

        .promotion-cell small {
          margin-top: 4px;
          color: #848b9b;
        }

        .table-thumb {
          width: 42px;
          height: 42px;
          overflow: hidden;
          display: grid;
          flex: 0 0 auto;
          place-items: center;
          border-radius: 9px;
          background: #f0f2f5;
          color: #a0a6b2;
        }

        .status-badge {
          display: inline-flex;
          padding: 5px 9px;
          border-radius: 999px;
          background: #eef1f5;
          color: #566074;
          font-size: 11px;
          font-weight: 750;
        }

        .status-published {
          background: #e8f8ef;
          color: #177847;
        }

        .status-draft {
          background: #fff5dc;
          color: #916500;
        }

        .status-cancelled,
        .status-expired {
          background: #f2f3f5;
          color: #6f7786;
        }

        .empty-state {
          margin-top: 18px;
          padding: 34px;
          border: 1px dashed #d8dde5;
          border-radius: 12px;
          color: #7d8595;
          text-align: center;
        }

        .toast {
          position: fixed;
          z-index: 100;
          top: 18px;
          right: 18px;
          max-width: min(390px, calc(100% - 36px));
          padding: 13px 16px;
          border-radius: 10px;
          color: #fff;
          font-size: 13px;
          font-weight: 700;
          box-shadow: 0 12px 34px rgba(0, 0, 0, 0.18);
        }

        .toast-success {
          background: #177847;
        }

        .toast-error {
          background: #bd3535;
        }

        @media (max-width: 1080px) {
          .workspace {
            grid-template-columns: 1fr;
          }

          .preview-sticky {
            position: static;
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .summary-card,
          .save-actions {
            grid-column: 1 / -1;
          }
        }

        @media (max-width: 760px) {
          .page-shell {
            width: min(100% - 20px, 1500px);
            padding-top: 18px;
          }

          .page-header,
          .history-header,
          .section-title-row,
          .inline-actions {
            align-items: stretch;
            flex-direction: column;
          }

          .section-card,
          .history-section {
            padding: 18px;
          }

          .audience-list,
          .form-grid,
          .preview-sticky,
          .filters {
            grid-template-columns: 1fr;
          }

          .field-wide {
            grid-column: auto;
          }

          .audience-list {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .summary-card,
          .save-actions {
            grid-column: auto;
          }

          .image-row {
            grid-template-columns: 48px minmax(0, 1fr);
          }

          .row-actions {
            grid-column: 1 / -1;
            justify-content: flex-end;
          }

          .history-header {
            gap: 18px;
          }

          .save-actions {
            position: sticky;
            bottom: 8px;
            z-index: 5;
            padding: 8px;
            border: 1px solid #e2e6ec;
            border-radius: 12px;
            background: rgba(255, 255, 255, 0.96);
            backdrop-filter: blur(10px);
          }
        }
      `}</style>
    </main>
  );
}
