"use client";

import { useEffect, useRef, useState } from "react";

const CAMPAIGN_INTENTS = [
  {
    value: "PROSPECCAO",
    label: "Prospecção",
    desc: "Primeira abordagem para novos clientes, mercados, padarias, restaurantes e distribuidores.",
  },
  {
    value: "REATIVACAO",
    label: "Reativação",
    desc: "Mensagem para clientes que pararam de comprar ou estão há muitos dias sem pedido.",
  },
  {
    value: "PROMOCAO",
    label: "Promoção",
    desc: "Divulgação de ofertas, condições especiais, combos e oportunidades da semana.",
  },
  {
    value: "LANCAMENTO",
    label: "Lançamento",
    desc: "Apresentação de novos produtos, linhas, marcas ou campanhas comerciais.",
  },
  {
    value: "POS_VENDA",
    label: "Pós-venda",
    desc: "Acompanhamento depois do pedido para gerar recompra, confiança e relacionamento.",
  },
  {
    value: "COBRANCA_LEMBRETE",
    label: "Lembrete comercial",
    desc: "Avisos internos ou mensagens de acompanhamento sobre boleto, entrega, pedido ou cotação.",
  },
  {
    value: "OFERTA_PERSONALIZADA",
    label: "Oferta personalizada",
    desc: "Mensagem baseada no perfil, histórico, produtos comprados ou oportunidade detectada pela IA.",
  },
];

const AI_INTENTS = [
  {
    value: "OPENING",
    label: "Primeiro atendimento",
    desc: "Quando o cliente chama pela primeira vez no WhatsApp.",
  },
  {
    value: "FAQ_CUSTOM",
    label: "Resposta automática personalizada",
    desc: "Quando o cliente escrever uma das palavras configuradas, a IA responde automaticamente.",
  },
  {
    value: "CLIENTE_QUER_COMPRAR",
    label: "Cliente quer comprar",
    desc: "Quando o cliente demonstra intenção de comprar, pedir preço, fazer orçamento ou fechar pedido.",
  },
  {
    value: "COTACAO",
    label: "Pedido de cotação",
    desc: "Quando o cliente pede orçamento, tabela, catálogo, preço ou condições comerciais.",
  },
  {
    value: "NEGOCIACAO",
    label: "Negociação",
    desc: "Quando o cliente pede desconto, prazo, condição de pagamento ou contraproposta.",
  },
  {
    value: "ENTREGA",
    label: "Entrega / logística",
    desc: "Quando o cliente pergunta sobre prazo, rota, entrega, endereço ou disponibilidade.",
  },
  {
    value: "PAGAMENTO",
    label: "Pagamento / boleto",
    desc: "Quando o cliente pergunta sobre boleto, pix, prazo, parcelas ou vencimento.",
  },
  {
    value: "TRANSFERIR_VENDEDOR",
    label: "Transferir para vendedor",
    desc: "Quando a conversa precisa ser assumida por um representante ou supervisor.",
  },
  {
    value: "SEM_INTERESSE",
    label: "Sem interesse",
    desc: "Quando o cliente informa que não quer comprar agora ou não deseja receber contato.",
  },
  {
    value: "DEFAULT",
    label: "Resposta padrão",
    desc: "Quando a IA não encontrar uma regra específica.",
  },
];

const KANBAN_STATUS = [
  { value: "", label: "Não alterar etapa" },
  { value: "novo", label: "Novo lead" },
  { value: "enviado", label: "Mensagem enviada" },
  { value: "respondeu", label: "Respondeu" },
  { value: "primeiro_contato", label: "Primeiro contato" },
  { value: "em_negociacao", label: "Em negociação" },
  { value: "cotacao_enviada", label: "Cotação enviada" },
  { value: "pedido_fechado", label: "Pedido fechado" },
  { value: "pos_venda", label: "Pós-venda" },
  { value: "cliente_ativo", label: "Cliente ativo" },
  { value: "cliente_inativo", label: "Cliente inativo" },
  { value: "sem_interesse", label: "Sem interesse" },
  { value: "perdido", label: "Perdido" },
];

const VARIABLES = [
  { label: "Cliente", value: "{cliente}" },
  { label: "Nome", value: "{nome}" },
  { label: "Telefone", value: "{telefone}" },
  { label: "Empresa", value: "{empresa}" },
  { label: "CNPJ/CPF", value: "{cnpj}" },
  { label: "Cidade", value: "{cidade}" },
  { label: "Estado", value: "{estado}" },
  { label: "Representante", value: "{representante}" },
  { label: "Produto", value: "{produto}" },
  { label: "Categoria", value: "{categoria}" },
  { label: "Valor", value: "{valor}" },
  { label: "Desconto", value: "{desconto}" },
  { label: "Forma pagamento", value: "{forma_pagamento}" },
  { label: "Data entrega", value: "{data_entrega}" },
  { label: "Pedido", value: "{pedido}" },
  { label: "Cotação", value: "{cotacao}" },
  { label: "Ticket médio", value: "{ticket_medio}" },
  { label: "Última compra", value: "{ultima_compra}" },
  { label: "Última mensagem", value: "{ultima_mensagem}" },
  { label: "Link WhatsApp", value: "{link_whatsapp}" },
  { label: "Link Cotador", value: "{link_cotador}" },
];

const DEFAULT_NOTIFY_MESSAGE = `🚨 Novo atendimento comercial

Cliente: {cliente}
Telefone: {telefone}

Última mensagem:
{ultima_mensagem}

Abrir conversa:
{link_whatsapp}`;

function hasFeature(data: any, feature: string) {
  const fromPlan = data?.features?.some(
    (item: any) => item.feature === feature && item.enabled
  );

  const fromGrant = data?.grants?.some((item: any) => {
    if (item.feature !== feature || !item.active) return false;
    if (!item.expires_at) return true;
    return new Date(item.expires_at) > new Date();
  });

  return Boolean(fromPlan || fromGrant);
}

function formatTriggers(value: any) {
  if (Array.isArray(value)) return value.join("\n");
  return "";
}

function getTemplateTriggers(item: any) {
  return formatTriggers(
    item?.trigger_text ??
      item?.trigger_keywords ??
      item?.keywords ??
      item?.trigger_words ??
      ""
  );
}

function formatVariations(value: any) {
  if (Array.isArray(value)) {
    return value
      .map((item) => item?.content || "")
      .filter(Boolean)
      .join("\n");
  }

  return "";
}

function flowModeLabel(value: any) {
  return value === "sequence" ? "Fluxo em ordem" : "Resposta avulsa";
}

export default function MessagesPage() {
  const messageRef = useRef<HTMLTextAreaElement | null>(null);
  const notifyRef = useRef<HTMLTextAreaElement | null>(null);

  const [companyData, setCompanyData] = useState<any>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [previewProductId, setPreviewProductId] = useState("");
  const [previewName, setPreviewName] = useState("Mercado São João");
  const [editingId, setEditingId] = useState<string | null>(null);

  const [type, setType] = useState<"campaign" | "ai">("campaign");
  const [name, setName] = useState("");
  const [intent, setIntent] = useState("OPENING");
  const [baseMessage, setBaseMessage] = useState("");
  const [messageVariations, setMessageVariations] = useState("");
  const [triggerKeywords, setTriggerKeywords] = useState("");
  const [matchType, setMatchType] = useState("contains");
  const [kanbanStatus, setKanbanStatus] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaType, setMediaType] = useState("text");

  const [flowMode, setFlowMode] = useState("global");
  const [flowStep, setFlowStep] = useState("");
  const [nextStep, setNextStep] = useState("");

  const [notifyEnabled, setNotifyEnabled] = useState(false);
  const [notifyNumber, setNotifyNumber] = useState("");
  const [notifyMessage, setNotifyMessage] = useState(DEFAULT_NOTIFY_MESSAGE);

  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

const canUseChatbot = true;
  const intents = type === "campaign" ? CAMPAIGN_INTENTS : AI_INTENTS;
  const selectedIntent = intents.find((item) => item.value === intent);
  const isCustomTrigger = type === "ai" && intent === "FAQ_CUSTOM";

  async function loadCompany() {
    const res = await fetch("/api/company/current", {
      cache: "no-store",
      credentials: "include",
    });

    const data = await res.json();
    if (data?.success) setCompanyData(data);
  }

  async function loadTemplates() {
    const res = await fetch("/api/crm/message-templates", {
      credentials: "include",
      cache: "no-store",
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Erro ao carregar mensagens");
      return;
    }

    setTemplates(data || []);
  }

  async function loadProducts() {
    const res = await fetch("/api/crm/products?active=true", {
      credentials: "include",
      cache: "no-store",
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      setProducts(data.products || data.data || []);
    }
  }

  useEffect(() => {
    loadCompany();
    loadTemplates();
    loadProducts();
  }, []);


  function formatMoney(value: any) {
    const number = Number(value || 0);
    if (!Number.isFinite(number) || number <= 0) return "";

    return number.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  }

  function salaryText(job: any) {
    if (!job) return "";

    if (job.salary) return String(job.salary);
    if (job.salaryRange) return String(job.salaryRange);
    if (job.salary_range) return String(job.salary_range);

    const min = formatMoney(job.salaryMin || job.salary_min);
    const max = formatMoney(job.salaryMax || job.salary_max);

    if (min && max) return `${min} a ${max}`;
    if (min) return `A partir de ${min}`;
    if (max) return `Até ${max}`;

    return "";
  }

  function jobLocal(job: any) {
    if (!job) return "";

    return [
      job.neighborhood,
      job.city,
      job.state,
    ]
      .filter(Boolean)
      .join(" / ");
  }

  function jobShift(job: any) {
    return (
      job?.shift ||
      job?.requirements?.shift ||
      job?.filters?.shift ||
      job?.workSchedule ||
      job?.work_schedule ||
      ""
    );
  }

  function jobBenefits(job: any) {
    const value =
      job?.benefits ||
      job?.requirements?.benefits ||
      job?.filters?.benefits ||
      job?.aiCriteria?.benefits ||
      "";

    if (Array.isArray(value)) return value.join(", ");
    return String(value || "");
  }
function buildPreviewMessage() {
  const product = products.find((item) => String(item.id) === String(previewProductId));

 const origin =
  typeof window !== "undefined"
    ? window.location.origin
    : "http://localhost:3000";

const quoteLink = `${origin}/crm/dashboard/cotador`;

    const replacements: Record<string, string> = {
      "{cliente}": previewName || "Mercado São João",
      "{nome}": previewName || "Mercado São João",
      "{telefone}": "5511999999999",
      "{empresa}": companyData?.company?.name || companyData?.name || "PMG Atacadista",
      "{cnpj}": "00.000.000/0001-00",
      "{cidade}": product?.city || "São Paulo",
      "{estado}": product?.state || "SP",
      "{representante}": "Equipe Comercial",
      "{produto}": product?.name || product?.title || "Muçarela PMG",
      "{categoria}": product?.category || "Laticínios",
      "{valor}": product?.price ? formatMoney(product.price) : "Consulte condição especial",
      "{desconto}": "Condição especial da semana",
      "{forma_pagamento}": "Boleto, PIX ou combinado",
      "{data_entrega}": "Próxima rota disponível",
      "{pedido}": "Pedido em aberto",
      "{cotacao}": "Cotação inteligente",
      "{ticket_medio}": "R$ 1.850,00",
      "{ultima_compra}": "Há 30 dias",
      "{ultima_mensagem}": "Quero saber o preço",
      "{link_whatsapp}": "https://wa.me/5511999999999",
      "{link_cotador}": quoteLink,
      "{link}": quoteLink,
    };

    let result = baseMessage || "Digite uma mensagem principal para visualizar.";

    Object.entries(replacements).forEach(([key, value]) => {
      result = result.split(key).join(value || "");
    });

    return result.trim();
  }

  function resetForm() {
    setEditingId(null);
    setType("campaign");
    setName("");
    setIntent("OPENING");
    setBaseMessage("");
    setMessageVariations("");
    setTriggerKeywords("");
    setMatchType("contains");
    setKanbanStatus("");
    setMediaUrl("");
    setMediaType("text");
    setFlowMode("global");
    setFlowStep("");
    setNextStep("");
    setNotifyEnabled(false);
    setNotifyNumber("");
    setNotifyMessage(DEFAULT_NOTIFY_MESSAGE);
    setPreviewProductId("");
    setPreviewName("Mercado São João");
  }

  function changeType(nextType: "campaign" | "ai") {
    if (nextType === "ai" && !canUseChatbot) {
      alert("Resposta automática com IA está bloqueada no seu plano atual.");
      return;
    }

    setType(nextType);
    setIntent("OPENING");
    setTriggerKeywords("");
    setKanbanStatus("");
    setMessageVariations("");
    setFlowMode("global");
    setFlowStep("");
    setNextStep("");
  }

  function insertVariable(target: "message" | "notify", variable: string) {
    if (target === "message") {
      const textarea = messageRef.current;
      const start = textarea?.selectionStart ?? baseMessage.length;
      const end = textarea?.selectionEnd ?? baseMessage.length;
      const next =
        baseMessage.slice(0, start) + variable + baseMessage.slice(end);

      setBaseMessage(next);

      setTimeout(() => {
        textarea?.focus();
        textarea?.setSelectionRange(
          start + variable.length,
          start + variable.length
        );
      }, 0);
    }

    if (target === "notify") {
      const textarea = notifyRef.current;
      const start = textarea?.selectionStart ?? notifyMessage.length;
      const end = textarea?.selectionEnd ?? notifyMessage.length;
      const next =
        notifyMessage.slice(0, start) + variable + notifyMessage.slice(end);

      setNotifyMessage(next);

      setTimeout(() => {
        textarea?.focus();
        textarea?.setSelectionRange(
          start + variable.length,
          start + variable.length
        );
      }, 0);
    }
  }

  async function uploadFile(file: File) {
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "message-templates");

      const res = await fetch("/api/upload", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || data.details || "Erro ao enviar arquivo");
        return;
      }

      setMediaUrl(data.mediaUrl || data.url);
      setMediaType(data.mediaType || "file");
    } finally {
      setUploading(false);
    }
  }

  function editTemplate(item: any) {
    setEditingId(item.id);
    setType(item.type || "campaign");
    setName(item.name || "");
    setIntent(item.intent || "OPENING");
    setBaseMessage(item.base_message || "");

    setMessageVariations(
      Array.isArray(item.message_variations)
        ? item.message_variations.map((v: any) => v.content).join("\n")
        : ""
    );

    /*
      Recarrega o texto salvo ao editar.
      Funciona quando o banco retorna string ou array.
    */
    setTriggerKeywords(getTemplateTriggers(item));

    setMatchType(item.match_type || "contains");
    setKanbanStatus(item.kanban_status || "");
    setMediaUrl(item.media_url || "");
    setMediaType(item.media_type || "text");
    setFlowMode(item.flow_mode || "global");
    setFlowStep(item.flow_step ? String(item.flow_step) : "");
    setNextStep(item.next_step ? String(item.next_step) : "");
    setNotifyEnabled(Boolean(item.notify_enabled));
    setNotifyNumber(item.notify_number || "");
    setNotifyMessage(item.notify_message || DEFAULT_NOTIFY_MESSAGE);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  async function saveTemplate() {
    if (type === "ai" && !canUseChatbot) {
      alert("Resposta automática com IA está bloqueada no seu plano atual.");
      return;
    }

    if (!name.trim() || !baseMessage.trim()) {
      alert("Preencha nome da automação e mensagem principal.");
      return;
    }

    if (isCustomTrigger && !triggerKeywords.trim()) {
      alert("Preencha pelo menos uma frase que o cliente pode escrever.");
      return;
    }

    if (isCustomTrigger && flowMode === "sequence" && !flowStep.trim()) {
      alert("Informe a etapa atual do fluxo.");
      return;
    }

    if (notifyEnabled && !notifyNumber.trim()) {
      alert("Informe o WhatsApp interno que receberá a notificação.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/crm/message-templates", {
        method: editingId ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId,
          type,
          name,
          intent,
          base_message: baseMessage,
          message_variations: messageVariations,
          trigger_keywords: triggerKeywords,
          trigger_text: triggerKeywords,
          keywords: triggerKeywords,
          trigger_words: formatTriggers(triggerKeywords)
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean),
          match_type: matchType,
          media_url: mediaUrl || null,
          media_type: mediaUrl ? mediaType : "text",
          kanban_status: kanbanStatus || null,
          flow_mode: isCustomTrigger ? flowMode : "global",
          flow_step: isCustomTrigger && flowMode === "sequence" ? flowStep : null,
          next_step: isCustomTrigger && flowMode === "sequence" ? nextStep || null : null,
          notify_enabled: notifyEnabled,
          notify_number: notifyNumber,
          notify_message: notifyMessage,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Erro ao salvar mensagem");
        return;
      }

      resetForm();
      await loadTemplates();
    } finally {
      setLoading(false);
    }
  }

  async function deleteTemplate(id: string) {
    if (!confirm("Excluir esta mensagem?")) return;

    const res = await fetch(`/api/crm/message-templates?id=${id}`, {
      method: "DELETE",
      credentials: "include",
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Erro ao excluir mensagem");
      return;
    }

    await loadTemplates();
  }

  async function toggleTemplate(item: any) {
    const res = await fetch("/api/crm/message-templates", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: item.id,
        active: !item.active,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Erro ao atualizar mensagem");
      return;
    }

    await loadTemplates();
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-white via-red-50/40 to-green-50 px-4 py-5 text-slate-900 md:px-6">
      <div className="mx-auto max-w-6xl">
        <section className="rounded-[2rem] border border-green-100 bg-white p-5 shadow-xl shadow-green-100/70 md:p-8">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-red-700">
            Zentra Sales AI
          </p>

          <h1 className="mt-2 text-3xl font-black md:text-5xl">
            Mensagens comerciais e automações IA
          </h1>

          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Crie mensagens de prospecção, reativação, promoção, pós-venda, respostas automáticas, fluxos de WhatsApp, mídia e movimentação no Kanban comercial.
          </p>
        </section>

        <section className="mt-5 rounded-[2rem] border border-green-100 bg-white p-5 shadow-xl shadow-green-100/60">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-black">
              {editingId ? "Editar mensagem / automação" : "Nova mensagem / automação"}
            </h2>

            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-xs font-black text-green-700 hover:bg-green-100"
              >
                Cancelar edição
              </button>
            )}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <select
              value={type}
              onChange={(e) => changeType(e.target.value as "campaign" | "ai")}
              className="input"
            >
              <option value="campaign">Campanha / disparo comercial</option>
              <option value="ai">
                Resposta automática no WhatsApp {canUseChatbot ? "" : "🔒"}
              </option>
            </select>

            <select
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              className="input"
            >
              {intents.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>

            {selectedIntent && (
              <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-800 md:col-span-2">
                <strong>{selectedIntent.label}:</strong> {selectedIntent.desc}
              </div>
            )}

            {isCustomTrigger && (
              <>
                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-black">
                    O que o cliente pode escrever
                  </label>
                  <textarea
                    value={triggerKeywords}
                    onChange={(e) => setTriggerKeywords(e.target.value)}
                    placeholder={`Digite uma opção por linha.\nEx:\nsim\nquero\ntenho interesse\nonde pegou meu contato`}
                    className="input min-h-32"
                  />
                  <p className="mt-2 text-xs text-slate-500">
                    Se o cliente enviar qualquer uma dessas frases, a IA envia a resposta configurada abaixo.
                  </p>
                </div>

                <div className="rounded-2xl border border-green-100 bg-red-50 p-4 md:col-span-2">
                  <label className="mb-2 block text-sm font-black">
                    Tipo de resposta
                  </label>

                  <div className="grid gap-3 md:grid-cols-3">
                    <select
                      value={flowMode}
                      onChange={(e) => {
                        setFlowMode(e.target.value);
                        if (e.target.value === "global") {
                          setFlowStep("");
                          setNextStep("");
                        }
                      }}
                      className="input"
                    >
                      <option value="global">Resposta avulsa</option>
                      <option value="sequence">Fluxo em ordem</option>
                    </select>

                    {flowMode === "sequence" && (
                      <>
                        <input
                          type="number"
                          min="1"
                          value={flowStep}
                          onChange={(e) => setFlowStep(e.target.value)}
                          placeholder="Etapa atual. Ex: 1"
                          className="input"
                        />

                        <input
                          type="number"
                          min="1"
                          value={nextStep}
                          onChange={(e) => setNextStep(e.target.value)}
                          placeholder="Próxima etapa. Ex: 2"
                          className="input"
                        />
                      </>
                    )}
                  </div>

                  <p className="mt-2 text-xs text-slate-500">
                    Resposta avulsa funciona a qualquer momento. Fluxo em ordem
                    só responde quando o cliente estiver na etapa configurada.
                  </p>
                </div>

                <select
                  value={matchType}
                  onChange={(e) => setMatchType(e.target.value)}
                  className="input"
                >
                  <option value="contains">
                    Palavra em qualquer lugar da mensagem
                  </option>
                  <option value="exact">Mensagem igual exatamente</option>
                  <option value="starts_with">Mensagem começa com</option>
                </select>

                <select
                  value={kanbanStatus}
                  onChange={(e) => setKanbanStatus(e.target.value)}
                  className="input"
                >
                  {KANBAN_STATUS.map((item) => (
                    <option key={item.value || "none"} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </>
            )}

            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome da mensagem. Ex: Prospecção mercados, Oferta muçarela, Reativação 30 dias"
              className="input md:col-span-2"
            />

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-black">
                Mensagem principal
              </label>

              <textarea
                ref={messageRef}
                value={baseMessage}
                onChange={(e) => setBaseMessage(e.target.value)}
                placeholder="Ex: Olá {cliente}, tudo bem? Aqui é {representante} da {empresa}. Temos uma condição especial para {produto}. Posso te enviar uma cotação?"
                className="input min-h-36"
              />

              <div className="mt-3 flex flex-wrap gap-2">
                {VARIABLES.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => insertVariable("message", item.value)}
                    className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-xs font-black text-green-700 hover:bg-green-100"
                  >
                    + {item.label}
                  </button>
                ))}
              </div>

              <div className="mt-3 rounded-2xl border border-green-100 bg-green-50 p-4 text-xs text-green-900">
                <p className="font-black">Variáveis comerciais</p>
                <p className="mt-1">
                  No disparo real, o sistema substitui automaticamente os dados do cliente, representante, produto, condição comercial, pedido, cotação e link do cotador.
                </p>
              </div>

              <div className="mt-4 rounded-[1.5rem] border border-green-100 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-3 md:flex-row md:items-end">
                  <div className="flex-1">
                    <label className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-red-700">
                      Pré-visualização comercial
                    </label>
                    <select
                      value={previewProductId}
                      onChange={(e) => setPreviewProductId(e.target.value)}
                      className="input"
                    >
                      <option value="">Usar exemplo padrão</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name || product.title} {product.category ? `• ${product.category}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="w-full md:w-48">
                    <label className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-red-700">
                      Cliente teste
                    </label>
                    <input
                      value={previewName}
                      onChange={(e) => setPreviewName(e.target.value)}
                      className="input"
                      placeholder="Nome"
                    />
                  </div>
                </div>

                <div className="mt-4 whitespace-pre-wrap rounded-2xl border border-dashed border-green-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">
                  {buildPreviewMessage()}
                </div>

                <p className="mt-2 text-xs text-slate-500">
                  Essa prévia é só para você testar. No envio real, o sistema usa os dados do cliente e da campanha.
                </p>
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-black">
                Variações da mensagem
              </label>

              <textarea
                value={messageVariations}
                onChange={(e) => setMessageVariations(e.target.value)}
                placeholder={`Digite uma variação por linha.\nEx:\nOi {nome}, tudo bem?\nOlá {nome}, tudo certo?\nOpa {nome}, posso te mandar uma informação?`}
                className="input min-h-40"
              />

              <p className="mt-2 text-xs text-slate-500">
                O sistema escolhe uma versão aleatória em cada disparo ou resposta.
              </p>
            </div>

            <div className="rounded-2xl border border-green-100 bg-slate-50 p-4 md:col-span-2">
              <p className="text-sm font-black">Mídia opcional</p>
              <p className="mt-1 text-xs text-slate-500">
                Anexe áudio, imagem, catálogo, PDF ou vídeo para enviar junto com a resposta.
              </p>

              <input
                type="file"
                accept="image/*,audio/*,video/*,.pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadFile(file);
                }}
                className="mt-3 block w-full text-sm text-slate-700"
              />

              {uploading && (
                <p className="mt-2 text-xs text-yellow-300">
                  Enviando arquivo...
                </p>
              )}

              {mediaUrl && (
                <div className="mt-3 rounded-xl border border-green-100 bg-white p-3 text-xs text-slate-700">
                  <p>
                    <strong>Arquivo:</strong> {mediaType}
                  </p>
                  <p className="mt-1 break-all text-slate-500">{mediaUrl}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setMediaUrl("");
                      setMediaType("text");
                    }}
                    className="mt-2 rounded-lg bg-red-600 px-3 py-2 text-xs font-black text-white"
                  >
                    Remover mídia
                  </button>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-green-200 bg-green-50 p-4 md:col-span-2">
              <label className="flex items-center gap-3 text-sm font-black">
                <input
                  type="checkbox"
                  checked={notifyEnabled}
                  onChange={(e) => setNotifyEnabled(e.target.checked)}
                />
                Avisar alguém da equipe quando essa automação disparar
              </label>

              <p className="mt-2 text-xs text-slate-500">
                Use isso para mandar um alerta interno para outro WhatsApp, como
                representante, atendente, supervisor ou equipe comercial.
              </p>

              {notifyEnabled && (
                <div className="mt-4 grid gap-3">
                  <input
                    value={notifyNumber}
                    onChange={(e) => setNotifyNumber(e.target.value)}
                    placeholder="WhatsApp da equipe. Ex: 5511999999999"
                    className="input"
                  />

                  <textarea
                    ref={notifyRef}
                    value={notifyMessage}
                    onChange={(e) => setNotifyMessage(e.target.value)}
                    placeholder="Mensagem que a equipe vai receber"
                    className="input min-h-36"
                  />

                  <div className="flex flex-wrap gap-2">
                    {VARIABLES.map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => insertVariable("notify", item.value)}
                        className="rounded-xl border border-green-200 bg-white px-3 py-2 text-xs font-black text-green-700 hover:bg-green-100"
                      >
                        + {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={saveTemplate}
            disabled={loading || uploading}
            className="mt-4 w-full rounded-2xl bg-gradient-to-r from-green-700 to-red-600 px-5 py-4 text-sm font-black text-white shadow-lg shadow-red-200/40 hover:brightness-110 disabled:opacity-50 md:w-auto"
          >
            {loading
              ? "Salvando..."
              : editingId
              ? "Atualizar automação"
              : "Salvar automação"}
          </button>
        </section>

        <section className="mt-5 grid gap-4">
          {templates.map((item) => (
            <article
              key={item.id}
              className="rounded-[2rem] border border-green-100 bg-white p-5 shadow-xl shadow-green-100/50"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h3 className="text-lg font-black">{item.name}</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {item.type === "campaign" ? "Campanha" : "Chatbot"} ·{" "}
                    {item.intent} · {item.active ? "Ativa" : "Inativa"}
                  </p>

                  <p className="mt-2 text-xs text-slate-500">
                    Tipo: <strong>{flowModeLabel(item.flow_mode)}</strong>
                    {item.flow_mode === "sequence" && (
                      <>
                        {" "}· Etapa atual: <strong>{item.flow_step || 1}</strong>
                        {" "}· Próxima etapa: <strong>{item.next_step || "não avança"}</strong>
                      </>
                    )}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => editTemplate(item)}
                    className="rounded-xl bg-green-700 px-4 py-2 text-xs font-black text-white hover:bg-green-800"
                  >
                    Editar
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleTemplate(item)}
                    className="rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-xs font-black text-green-700 hover:bg-green-100"
                  >
                    {item.active ? "Desativar" : "Ativar"}
                  </button>

                  <button
                    type="button"
                    onClick={() => deleteTemplate(item.id)}
                    className="rounded-xl bg-red-600 px-4 py-2 text-xs font-black text-white hover:bg-red-700"
                  >
                    Excluir
                  </button>
                </div>
              </div>

              {getTemplateTriggers(item) && (
                <div className="mt-4 rounded-2xl border border-green-100 bg-green-50 p-4 text-sm text-green-800">
                  <strong>Cliente pode escrever:</strong>
                  <pre className="mt-2 whitespace-pre-wrap text-xs">
                    {getTemplateTriggers(item)}
                  </pre>
                </div>
              )}

              <div className="mt-4 whitespace-pre-wrap rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                {item.base_message}
              </div>

              {item.message_variations?.length > 0 && (
                <div className="mt-4 rounded-2xl border border-green-100 bg-green-50 p-4 text-sm text-green-800">
                  <strong>Variações:</strong>
                  <pre className="mt-2 whitespace-pre-wrap text-xs">
                    {formatVariations(item.message_variations)}
                  </pre>
                </div>
              )}

              {item.notify_enabled && (
                <div className="mt-4 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
                  <p>
                    <strong>Avisa equipe:</strong> {item.notify_number}
                  </p>
                  {item.notify_message && (
                    <pre className="mt-2 whitespace-pre-wrap text-xs text-green-700">
                      {item.notify_message}
                    </pre>
                  )}
                </div>
              )}

              {item.media_url && (
                <div className="mt-4 rounded-2xl border border-green-100 bg-slate-50 p-4 text-sm text-slate-700">
                  <p>
                    <strong>Mídia:</strong> {item.media_type}
                  </p>
                  <a
                    href={item.media_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 block break-all text-red-700"
                  >
                    {item.media_url}
                  </a>
                </div>
              )}

              {item.kanban_status && (
                <p className="mt-3 text-xs text-slate-500">
                  Move cliente para: <strong>{item.kanban_status}</strong>
                </p>
              )}
            </article>
          ))}
        </section>
      </div>

      <style jsx>{`
        .input {
          width: 100%;
          border-radius: 16px;
          border: 1px solid #bbf7d0;
          background: #f8fafc;
          padding: 13px 14px;
          color: #0f172a;
          outline: none;
          font-size: 14px;
        }

        .input:focus {
          border-color: #15803d;
          box-shadow: 0 0 0 4px rgba(21, 128, 61, 0.14);
        }

        .input::placeholder {
          color: #94a3b8;
        }
      `}</style>
    </main>
  );
}
