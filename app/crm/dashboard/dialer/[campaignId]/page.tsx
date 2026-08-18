"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type CampaignData = {
  campaign: {
    id: string;
    name: string;
    status: string;
    total: number;
    processed: number;
    answered: number;
    sales: number;
  };
  current: null | {
    id: string;
    position: number;
    status: string;
    attempts: number;
    lastCallAt?: string | null;
    nextCallAt?: string | null;
    prospect: {
      id: string;
      externalId?: string | null;
      name: string;
      city?: string | null;
      state?: string | null;
      segment?: string | null;
      category?: string | null;
      productInterest?: string | null;
      phone1?: string | null;
      phone2?: string | null;
      lastOrderAt?: string | null;
      creditLimit?: number | null;
      paymentMethod?: string | null;
      source?: "RADAR" | "DIALER_MANUAL";
      responsibleName?: string | null;
      responsibleRole?: string | null;
      whatsapp?: string | null;
      manualNotes?: string | null;
    };
  };
  navigation: {
    previousContactId: string | null;
    nextContactId: string | null;
    isReviewing: boolean;
  };
  history: Array<{
    id: string;
    result: string;
    notes?: string | null;
    phone: string;
    startedAt?: string | null;
    finishedAt?: string | null;
    createdAt: string;
  }>;
  nextCallbackAt?: string | null;
};

type CampaignReport = {
  summary: {
    total: number;
    called: number;
    answered: number;
    sales: number;
    noAnswer: number;
    busy: number;
    voicemail: number;
    callback: number;
    invalid: number;
  };
  items: Array<{
    campaignContactId: string;
    position: number | null;
    attempts: number;
    result: string;
    resultLabel: string;
    notes?: string | null;
    lastCallAt: string;
    prospect: {
      id: string;
      externalId?: string | null;
      name: string;
      phone1?: string | null;
      city?: string | null;
      state?: string | null;
    } | null;
  }>;
};

type DueCallback = {
  id: string;
  campaignId: string;
  position: number;
  nextCallAt: string | null;
  prospect: {
    id: string;
    name: string;
    phone1?: string | null;
    city?: string | null;
    state?: string | null;
  };
  campaign: {
    id: string;
    name: string;
  };
};

const resultOptions = [
  { value: "ANSWERED", label: "Atendeu", icon: "✅" },
  { value: "NO_ANSWER", label: "Não atendeu", icon: "❌" },
  { value: "BUSY", label: "Ocupado", icon: "📞" },
  { value: "VOICEMAIL", label: "Caixa postal", icon: "📭" },
  { value: "CALLBACK", label: "Retornar", icon: "🕐" },
  { value: "SALE", label: "Venda", icon: "💰" },
  { value: "HAS_PMG_SELLER", label: "Já tem vendedor PMG", icon: "👤" },
  { value: "NO_INTEREST", label: "Sem interesse / desligou", icon: "🚫" },
  { value: "BUSINESS_CLOSED", label: "Comércio encerrado", icon: "🏚️" },
  { value: "WHATSAPP_REQUEST", label: "Pediu WhatsApp", icon: "💬" },
  { value: "INVALID_NUMBER", label: "Número inválido", icon: "⚠️" },
];

const resultLabels: Record<string, string> = {
  ANSWERED: "Atendeu",
  NO_ANSWER: "Não atendeu",
  BUSY: "Ocupado",
  VOICEMAIL: "Caixa postal",
  CALLBACK: "Retornar",
  SALE: "Venda",
  INVALID_NUMBER: "Número inválido",
  HAS_PMG_SELLER: "Já tem vendedor PMG",
  NO_INTEREST: "Sem interesse / desligou",
  BUSINESS_CLOSED: "Comércio encerrado",
  WHATSAPP_REQUEST: "Pediu WhatsApp",
};


function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString("pt-BR");
}

function formatMoney(value?: number | null) {
  if (value === null || value === undefined) return "-";
  return Number(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatPhone(value?: string | null) {
  const digits = String(value || "").replace(/\D/g, "");
  const local = digits.startsWith("55") ? digits.slice(2) : digits;

  if (local.length === 11) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  }

  if (local.length === 10) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  }

  return value || "-";
}

function toTelUri(value?: string | null) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return null;
  return `tel:+${digits.startsWith("55") ? digits : `55${digits}`}`;
}

export default function DialerCampaignPage() {
  const params = useParams<{ campaignId: string }>();
  const campaignId = String(params?.campaignId || "");

  const [data, setData] = useState<CampaignData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState("");
  const [notes, setNotes] = useState("");
  const [nextCallAt, setNextCallAt] = useState("");
  const [callStartedAt, setCallStartedAt] = useState<string | null>(null);
  const [viewContactId, setViewContactId] = useState<string | null>(null);
  const [retryOpen, setRetryOpen] = useState(false);
  const [retryAt, setRetryAt] = useState("");
  const [retrySaving, setRetrySaving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [manualEditOpen, setManualEditOpen] = useState(false);
  const [manualEditSaving, setManualEditSaving] = useState(false);
  const [manualDraft, setManualDraft] = useState({
    name: "",
    responsibleName: "",
    responsibleRole: "",
    phone1: "",
    whatsapp: "",
    city: "",
    segment: "",
    manualNotes: "",
  });
  const [dueCallbacks, setDueCallbacks] = useState<DueCallback[]>([]);
  const [report, setReport] = useState<CampaignReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [requeueingNoAnswer, setRequeueingNoAnswer] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | "unsupported"
  >(
    typeof window !== "undefined" && "Notification" in window
      ? Notification.permission
      : "unsupported"
  );

  async function enableNotifications() {
    if (!("Notification" in window)) {
      setNotificationPermission("unsupported");
      setMessage("Este navegador não oferece notificações web neste modo.");
      return;
    }

    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);

    if (permission === "granted") {
      setMessage("Avisos de retorno ativados neste aparelho.");
    }
  }

  function notifyDue(callback: DueCallback) {
    if ("vibrate" in navigator) {
      try {
        navigator.vibrate([180, 80, 180]);
      } catch {}
    }

    if (
      "Notification" in window &&
      Notification.permission === "granted"
    ) {
      try {
        new Notification("Retorno de ligação agora", {
          body: `${callback.prospect.name} • ${callback.campaign.name}`,
          tag: `dialer-callback-${callback.id}`,
        });
      } catch {}
    }
  }

  async function loadReport(silent = true) {
    if (!campaignId) return;

    if (!silent) {
      setReportLoading(true);
    }

    try {
      const response = await fetch(
        `/api/crm/dialer/campaigns/${campaignId}/report`,
        { cache: "no-store" }
      );

      const json = await response.json();

      if (!response.ok || !json.success) {
        throw new Error(json.error || "Erro ao carregar relatório.");
      }

      setReport({
        summary: json.summary,
        items: json.items || [],
      });
    } catch (error: any) {
      if (!silent) {
        setMessage(error?.message || "Erro ao carregar relatório.");
      }
    } finally {
      if (!silent) {
        setReportLoading(false);
      }
    }
  }

  async function requeueNoAnswer() {
    if (requeueingNoAnswer) return;

    setRequeueingNoAnswer(true);
    setMessage("");

    try {
      const response = await fetch(
        `/api/crm/dialer/campaigns/${campaignId}/report`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            action: "REQUEUE_NO_ANSWER",
          }),
        }
      );

      const json = await response.json();

      if (!response.ok || !json.success) {
        throw new Error(
          json.error || "Erro ao recolocar não atendidos na fila."
        );
      }

      setReportOpen(false);
      setMessage(
        `${json.requeued} contato(s) que não atenderam voltaram para a fila.`
      );

      await Promise.all([
        loadCampaign(null),
        loadReport(),
      ]);
    } catch (error: any) {
      setMessage(
        error?.message || "Erro ao recolocar não atendidos na fila."
      );
    } finally {
      setRequeueingNoAnswer(false);
    }
  }

  async function loadDueCallbacks(silent = true) {
    if (!campaignId) return;

    try {
      const response = await fetch(
        `/api/crm/dialer/callbacks?campaignId=${encodeURIComponent(campaignId)}`,
        { cache: "no-store" }
      );

      const json = await response.json();

      if (!response.ok || !json.success) {
        throw new Error(json.error || "Erro ao carregar retornos.");
      }

      const nextDue: DueCallback[] = json.due || [];

      setDueCallbacks((previous) => {
        const previousIds = new Set(previous.map((item) => item.id));
        const newlyDue = nextDue.filter((item) => !previousIds.has(item.id));

        if (newlyDue[0]) {
          notifyDue(newlyDue[0]);
        }

        return nextDue;
      });
    } catch (error: any) {
      if (!silent) {
        setMessage(error?.message || "Erro ao carregar retornos.");
      }
    }
  }

  async function loadCampaign(contactId?: string | null) {
    if (!campaignId) return;

    setLoading(true);
    setMessage("");

    try {
      const query = contactId
        ? `?contactId=${encodeURIComponent(contactId)}`
        : "";

      const response = await fetch(`/api/crm/dialer/campaigns/${campaignId}${query}`, {
        cache: "no-store",
      });

      const json = await response.json();

      if (!response.ok || !json.success) {
        throw new Error(json.error || "Erro ao carregar campanha.");
      }

      setData(json);
      setViewContactId(contactId || null);
      setResult("");
      setNotes("");
      setNextCallAt("");
      setCallStartedAt(null);
      setRetryOpen(false);
      setRetryAt("");
      setHistoryOpen(false);
    } catch (error: any) {
      setMessage(error?.message || "Erro ao carregar campanha.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCampaign();
    void loadDueCallbacks();
    void loadReport();

    const timer = window.setInterval(() => {
      void loadDueCallbacks();
    }, 30000);

    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  const progress = useMemo(() => {
    if (!data?.campaign.total) return 0;
    return Math.round((data.campaign.processed / data.campaign.total) * 100);
  }, [data]);

  function callNow() {
    const uri = toTelUri(data?.current?.prospect.phone1);

    if (!uri) {
      setMessage("Este contato não possui telefone válido.");
      return;
    }

    setCallStartedAt(new Date().toISOString());
    window.location.href = uri;
  }

  function openManualEdit() {
    const prospect = data?.current?.prospect;

    if (!prospect || prospect.source !== "DIALER_MANUAL") {
      return;
    }

    setManualDraft({
      name: prospect.name || "",
      responsibleName: prospect.responsibleName || "",
      responsibleRole: prospect.responsibleRole || "",
      phone1: prospect.phone1 || "",
      whatsapp: prospect.whatsapp || "",
      city: prospect.city || "",
      segment: prospect.segment || "",
      manualNotes: prospect.manualNotes || "",
    });

    setManualEditOpen(true);
  }

  async function saveManualLead() {
    if (!data?.current || manualEditSaving) return;

    setManualEditSaving(true);
    setMessage("");

    try {
      const response = await fetch(
        `/api/crm/dialer/contacts/${data.current.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
          body: JSON.stringify({
            campaignId,
            ...manualDraft,
          }),
        }
      );

      const json = await response.json();

      if (!response.ok || !json.success) {
        throw new Error(
          json.error || "Erro ao atualizar dados do contato."
        );
      }

      setManualEditOpen(false);
      setMessage("Dados do lead atualizados.");

      await loadCampaign(viewContactId || null);
    } catch (error: any) {
      setMessage(
        error?.message || "Erro ao atualizar dados do contato."
      );
    } finally {
      setManualEditSaving(false);
    }
  }

  async function scheduleRetry() {
    if (!data?.current || retrySaving) return;

    setRetrySaving(true);
    setMessage("");

    try {
      const response = await fetch(
        `/api/crm/dialer/contacts/${data.current.id}/retry`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            campaignId,
            nextCallAt: retryAt
              ? new Date(retryAt).toISOString()
              : null,
          }),
        }
      );

      const json = await response.json();

      if (!response.ok || !json.success) {
        throw new Error(
          json.error || "Erro ao recolocar contato na fila."
        );
      }

      setMessage(
        retryAt
          ? "Nova tentativa agendada com sucesso."
          : "Contato recolocado na fila."
      );

      setViewContactId(null);
      await Promise.all([
        loadCampaign(null),
        loadDueCallbacks(),
        loadReport(),
      ]);
    } catch (error: any) {
      setMessage(
        error?.message || "Erro ao recolocar contato na fila."
      );
    } finally {
      setRetrySaving(false);
    }
  }

  async function saveAndNext() {
    if (!data?.current || !result || saving) return;

    if (result === "CALLBACK" && !nextCallAt) {
      setMessage("Informe a data e a hora para retornar.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/crm/dialer/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          campaignId,
          campaignContactId: data.current.id,
          result,
          notes,
          nextCallAt: result === "CALLBACK" ? new Date(nextCallAt).toISOString() : null,
          startedAt: callStartedAt,
        }),
      });

      const json = await response.json();

      if (!response.ok || !json.success) {
        throw new Error(json.error || "Erro ao salvar resultado da ligação.");
      }

      setViewContactId(null);

      await Promise.all([
        loadCampaign(null),
        loadDueCallbacks(),
      ]);
    } catch (error: any) {
      setMessage(error?.message || "Erro ao salvar resultado da ligação.");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !data) {
    return <main style={styles.page}><div style={styles.loading}>Carregando discador...</div></main>;
  }

  return (
    <main style={styles.page}>
      <div style={styles.shell}>
        <header style={styles.header}>
          <Link href="/crm/dashboard/dialer" style={styles.backLink}>← Campanhas</Link>
          <div style={styles.kicker}>DISCador comercial</div>
          <h1 style={styles.title}>{data?.campaign.name || "Campanha"}</h1>

          <div style={styles.progressRow}>
            <span>{data?.campaign.processed || 0} de {data?.campaign.total || 0}</span>
            <strong>{progress}%</strong>
          </div>

          <div style={styles.progressTrack}>
            <div style={{ ...styles.progressFill, width: `${Math.min(100, Math.max(0, progress))}%` }} />
          </div>

          <button
            type="button"
            style={styles.headerReportButton}
            onClick={async () => {
              setReportOpen(true);
              await loadReport(false);
            }}
          >
            📊 Relatório
          </button>
        </header>

        {message ? <div style={styles.message}>{message}</div> : null}

        {dueCallbacks.length ? (
          <section style={styles.callbackAlert}>
            <div style={styles.callbackAlertIcon}>⏰</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={styles.callbackAlertKicker}>RETORNO AGENDADO AGORA</div>
              <strong style={styles.callbackAlertName}>
                {dueCallbacks[0].prospect.name}
              </strong>
              <div style={styles.callbackAlertMeta}>
                {dueCallbacks[0].nextCallAt
                  ? new Date(dueCallbacks[0].nextCallAt).toLocaleString("pt-BR")
                  : "Horário agendado atingido"}
              </div>
            </div>
            <button
              type="button"
              style={styles.callbackOpenButton}
              onClick={async () => {
                await loadCampaign();
                await loadDueCallbacks();
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
              Abrir retorno
            </button>
          </section>
        ) : null}

        {notificationPermission !== "granted" &&
        notificationPermission !== "unsupported" ? (
          <button
            type="button"
            style={styles.notificationButton}
            onClick={enableNotifications}
          >
            🔔 Ativar avisos de retorno
          </button>
        ) : null}

        {!data?.current ? (
          <section style={styles.finished}>
            <div style={{ fontSize: 48 }}>✅</div>
            <h2 style={{ margin: "8px 0" }}>
              {data?.campaign.status === "COMPLETED" ? "Campanha concluída" : "Nenhuma ligação pendente agora"}
            </h2>
            <p style={{ margin: 0, color: "#64748b", lineHeight: 1.5 }}>
              {data?.nextCallbackAt
                ? `O próximo retorno está agendado para ${new Date(data.nextCallbackAt).toLocaleString("pt-BR")}.`
                : "Todos os contatos disponíveis desta campanha foram processados."}
            </p>
            <div style={styles.finishedActions}>
              <button
                type="button"
                style={styles.secondaryButton}
                onClick={() => loadCampaign(null)}
              >
                Atualizar
              </button>

              <button
                type="button"
                style={styles.reportButton}
                onClick={async () => {
                  setReportOpen(true);
                  await loadReport(false);
                }}
              >
                📊 Ver relatório da campanha
              </button>
            </div>

            {report?.summary.noAnswer ? (
              <button
                type="button"
                style={styles.requeueButton}
                disabled={requeueingNoAnswer}
                onClick={requeueNoAnswer}
              >
                {requeueingNoAnswer
                  ? "Preparando nova rodada..."
                  : `🔁 Ligar novamente para quem não atendeu (${report.summary.noAnswer})`}
              </button>
            ) : null}
          </section>
        ) : (
          <>
            <div style={styles.navigationRow}>
              <button
                type="button"
                style={{
                  ...styles.navButton,
                  opacity: data.navigation?.previousContactId ? 1 : 0.45,
                }}
                disabled={!data.navigation?.previousContactId}
                onClick={() =>
                  data.navigation?.previousContactId &&
                  loadCampaign(data.navigation.previousContactId)
                }
              >
                ← Cliente anterior
              </button>

              {viewContactId ? (
                <button
                  type="button"
                  style={styles.navPrimaryButton}
                  onClick={() => loadCampaign(null)}
                >
                  Voltar para fila atual →
                </button>
              ) : null}
            </div>

            <section style={styles.contactCard}>
              <div style={styles.position}>Contato {data.current.position} de {data.campaign.total}</div>

              <div style={styles.clientIdBadge}>
                {data.current.prospect.source === "DIALER_MANUAL"
                  ? "Lead manual"
                  : `ID Cliente: ${data.current.prospect.externalId || "Não informado"}`}
              </div>

              <h2 style={styles.customerName}>{data.current.prospect.name}</h2>

              {data.current.prospect.source === "DIALER_MANUAL" ? (
                <button
                  type="button"
                  style={styles.editLeadButton}
                  onClick={openManualEdit}
                >
                  ✏️ Editar dados do lead
                </button>
              ) : null}

              <div style={styles.location}>
                {[data.current.prospect.city, data.current.prospect.state].filter(Boolean).join(" - ") || "Local não informado"}
              </div>

              {data.current.prospect.source === "DIALER_MANUAL" ? (
                <div style={styles.infoGrid}>
                  <div style={styles.infoBox}>
                    <span>Responsável</span>
                    <strong>{data.current.prospect.responsibleName || "-"}</strong>
                  </div>
                  <div style={styles.infoBox}>
                    <span>Cargo / Compras</span>
                    <strong>{data.current.prospect.responsibleRole || "-"}</strong>
                  </div>
                  <div style={styles.infoBox}>
                    <span>WhatsApp</span>
                    <strong>{formatPhone(data.current.prospect.whatsapp)}</strong>
                  </div>
                  <div style={styles.infoBox}>
                    <span>Segmento</span>
                    <strong>{data.current.prospect.segment || "-"}</strong>
                  </div>
                </div>
              ) : (
                <div style={styles.infoGrid}>
                  <div style={styles.infoBox}>
                    <span>Último pedido</span>
                    <strong>{formatDate(data.current.prospect.lastOrderAt)}</strong>
                  </div>
                  <div style={styles.infoBox}>
                    <span>Limite</span>
                    <strong>{formatMoney(data.current.prospect.creditLimit)}</strong>
                  </div>
                  <div style={styles.infoBox}>
                    <span>Pagamento</span>
                    <strong>{data.current.prospect.paymentMethod || "-"}</strong>
                  </div>
                  <div style={styles.infoBox}>
                    <span>Segmento</span>
                    <strong>{data.current.prospect.segment || "-"}</strong>
                  </div>
                </div>
              )}

              {data.current.prospect.source === "DIALER_MANUAL" &&
              data.current.prospect.manualNotes ? (
                <div style={styles.manualNote}>
                  <span>Observação do lead</span>
                  <strong>{data.current.prospect.manualNotes}</strong>
                </div>
              ) : null}

              <div style={styles.phoneLabel}>Telefone</div>
              <div style={styles.phone}>{formatPhone(data.current.prospect.phone1)}</div>

              <button type="button" style={styles.callButton} onClick={callNow}>
                📞 LIGAR AGORA
              </button>

              <div style={styles.callHint}>
                A chamada é feita pelo aplicativo Telefone do próprio celular, usando o chip e a operadora do aparelho.
              </div>
            </section>

            <section style={styles.resultCard}>
              {data.navigation?.isReviewing ? (
                <>
                  <div style={styles.reviewBadge}>HISTÓRICO / CLIENTE ANTERIOR</div>
                  <h3 style={styles.resultTitle}>Este contato já foi processado</h3>
                  <p style={styles.reviewText}>
                    Você pode consultar o histórico abaixo ou recolocar este cliente na fila para uma nova tentativa.
                  </p>

                  <button
                    type="button"
                    style={styles.retryToggle}
                    onClick={() => setRetryOpen((current) => !current)}
                  >
                    🔁 Recolocar na fila / agendar nova tentativa
                  </button>

                  {retryOpen ? (
                    <div style={styles.retryPanel}>
                      <label style={styles.field}>
                        <span>Data e hora (opcional)</span>
                        <input
                          type="datetime-local"
                          value={retryAt}
                          onChange={(event) => setRetryAt(event.target.value)}
                          style={styles.input}
                        />
                      </label>

                      <div style={styles.retryHint}>
                        Sem data: volta para a fila normal. Com data: vira um retorno agendado.
                      </div>

                      <button
                        type="button"
                        style={{
                          ...styles.nextButton,
                          opacity: retrySaving ? 0.55 : 1,
                        }}
                        disabled={retrySaving}
                        onClick={scheduleRetry}
                      >
                        {retrySaving ? "Salvando..." : "CONFIRMAR NOVA TENTATIVA"}
                      </button>
                    </div>
                  ) : null}
                </>
              ) : (
                <>
                  <h3 style={styles.resultTitle}>Resultado da ligação</h3>

                  <div style={styles.resultGrid}>
                    {resultOptions.map((option) => {
                      const active = result === option.value;

                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setResult(option.value)}
                          style={{
                            ...styles.resultButton,
                            ...(active ? styles.resultButtonActive : {}),
                          }}
                        >
                          <span style={{ fontSize: 20 }}>{option.icon}</span>
                          <span>{option.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {result === "CALLBACK" ? (
                    <label style={styles.field}>
                      <span>Data e hora do retorno</span>
                      <input
                        type="datetime-local"
                        value={nextCallAt}
                        onChange={(event) => setNextCallAt(event.target.value)}
                        style={styles.input}
                      />
                    </label>
                  ) : null}

                  <label style={styles.field}>
                    <span>Observações</span>
                    <textarea
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      placeholder="Ex.: pediu tabela de preços, ligar após as 16h..."
                      rows={4}
                      style={{ ...styles.input, resize: "vertical" }}
                    />
                  </label>

                  <button
                    type="button"
                    onClick={saveAndNext}
                    disabled={!result || saving}
                    style={{
                      ...styles.nextButton,
                      opacity: !result || saving ? 0.55 : 1,
                      cursor: !result || saving ? "not-allowed" : "pointer",
                    }}
                  >
                    {saving ? "Salvando..." : "SALVAR E PRÓXIMO →"}
                  </button>
                </>
              )}

              <div style={styles.historyDivider} />

              <button
                type="button"
                style={styles.historyToggle}
                onClick={() => setHistoryOpen((current) => !current)}
              >
                {historyOpen ? "▲ Ocultar histórico" : `🧾 Histórico deste cliente (${data.history?.length || 0})`}
              </button>

              {historyOpen ? (
                <div style={styles.historyList}>
                  {!data.history?.length ? (
                    <div style={styles.historyEmpty}>Nenhuma ligação registrada ainda.</div>
                  ) : (
                    data.history.map((item) => (
                      <article key={item.id} style={styles.historyItem}>
                        <div style={styles.historyTop}>
                          <strong>{resultLabels[item.result] || item.result}</strong>
                          <span>{new Date(item.createdAt).toLocaleString("pt-BR")}</span>
                        </div>

                        {item.notes ? (
                          <div style={styles.historyNotes}>{item.notes}</div>
                        ) : null}
                      </article>
                    ))
                  )}
                </div>
              ) : null}
            </section>
          </>
        )}
        {reportOpen ? (
          <div
            style={styles.modalBackdrop}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setReportOpen(false);
              }
            }}
          >
            <div style={styles.reportModal}>
              <div style={styles.reportModalTop}>
                <div>
                  <div style={styles.editLeadKicker}>RELATÓRIO DA CAMPANHA</div>
                  <h3 style={styles.editLeadTitle}>
                    {data?.campaign.name || "Campanha"}
                  </h3>
                </div>

                <button
                  type="button"
                  style={styles.editLeadClose}
                  onClick={() => setReportOpen(false)}
                >
                  ×
                </button>
              </div>

              {reportLoading && !report ? (
                <div style={styles.reportLoading}>Carregando relatório...</div>
              ) : report ? (
                <>
                  <div style={styles.reportMetrics}>
                    <div><strong>{report.summary.total}</strong><span>Total</span></div>
                    <div><strong>{report.summary.called}</strong><span>Ligados</span></div>
                    <div><strong>{report.summary.answered}</strong><span>Atendidos</span></div>
                    <div><strong>{report.summary.sales}</strong><span>Vendas</span></div>
                    <div><strong>{report.summary.noAnswer}</strong><span>Não atenderam</span></div>
                    <div><strong>{report.summary.busy}</strong><span>Ocupados</span></div>
                  </div>

                  {report.summary.noAnswer > 0 ? (
                    <button
                      type="button"
                      style={styles.requeueButton}
                      disabled={requeueingNoAnswer}
                      onClick={requeueNoAnswer}
                    >
                      {requeueingNoAnswer
                        ? "Preparando..."
                        : `🔁 Nova rodada: não atenderam (${report.summary.noAnswer})`}
                    </button>
                  ) : null}

                  <div style={styles.reportList}>
                    {report.items.map((item) => (
                      <div
                        key={item.campaignContactId}
                        style={styles.reportRow}
                      >
                        <div style={styles.reportRowMain}>
                          <strong>
                            {item.position ? `${item.position}. ` : ""}
                            {item.prospect?.name || "Contato"}
                          </strong>
                          <span>
                            {formatPhone(item.prospect?.phone1)}
                          </span>
                        </div>

                        <div style={styles.reportRowMeta}>
                          <span>{item.resultLabel}</span>
                          <span>{item.attempts} tentativa(s)</span>
                          <span>
                            {new Date(item.lastCallAt).toLocaleString("pt-BR")}
                          </span>
                        </div>

                        {item.notes ? (
                          <div style={styles.reportNotes}>
                            {item.notes}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div style={styles.reportLoading}>
                  Nenhum dado de relatório disponível.
                </div>
              )}
            </div>
          </div>
        ) : null}

        {manualEditOpen && data?.current ? (
          <div
            style={styles.modalBackdrop}
            onMouseDown={(event) => {
              if (
                event.target === event.currentTarget &&
                !manualEditSaving
              ) {
                setManualEditOpen(false);
              }
            }}
          >
            <div style={styles.editLeadModal}>
              <div style={styles.editLeadTop}>
                <div>
                  <div style={styles.editLeadKicker}>QUALIFICAÇÃO DO LEAD</div>
                  <h3 style={styles.editLeadTitle}>Editar dados do contato</h3>
                </div>

                <button
                  type="button"
                  style={styles.editLeadClose}
                  disabled={manualEditSaving}
                  onClick={() => setManualEditOpen(false)}
                >
                  ×
                </button>
              </div>

              <p style={styles.editLeadText}>
                Complete os dados enquanto conversa com o cliente. Essas informações ficam no lead desta prospecção.
              </p>

              <div style={styles.editLeadGrid}>
                <label style={styles.field}>
                  <span>Empresa / Nome</span>
                  <input
                    style={styles.input}
                    value={manualDraft.name}
                    onChange={(event) =>
                      setManualDraft((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                  />
                </label>

                <label style={styles.field}>
                  <span>Telefone</span>
                  <input
                    style={styles.input}
                    inputMode="tel"
                    value={manualDraft.phone1}
                    onChange={(event) =>
                      setManualDraft((current) => ({
                        ...current,
                        phone1: event.target.value,
                      }))
                    }
                  />
                </label>

                <label style={styles.field}>
                  <span>Responsável</span>
                  <input
                    style={styles.input}
                    value={manualDraft.responsibleName}
                    onChange={(event) =>
                      setManualDraft((current) => ({
                        ...current,
                        responsibleName: event.target.value,
                      }))
                    }
                    placeholder="Ex.: João"
                  />
                </label>

                <label style={styles.field}>
                  <span>Cargo / Compras</span>
                  <input
                    style={styles.input}
                    value={manualDraft.responsibleRole}
                    onChange={(event) =>
                      setManualDraft((current) => ({
                        ...current,
                        responsibleRole: event.target.value,
                      }))
                    }
                    placeholder="Ex.: Responsável por compras"
                  />
                </label>

                <label style={styles.field}>
                  <span>WhatsApp</span>
                  <input
                    style={styles.input}
                    inputMode="tel"
                    value={manualDraft.whatsapp}
                    onChange={(event) =>
                      setManualDraft((current) => ({
                        ...current,
                        whatsapp: event.target.value,
                      }))
                    }
                  />
                </label>

                <label style={styles.field}>
                  <span>Cidade</span>
                  <input
                    style={styles.input}
                    value={manualDraft.city}
                    onChange={(event) =>
                      setManualDraft((current) => ({
                        ...current,
                        city: event.target.value,
                      }))
                    }
                  />
                </label>

                <label style={styles.field}>
                  <span>Segmento</span>
                  <input
                    style={styles.input}
                    value={manualDraft.segment}
                    onChange={(event) =>
                      setManualDraft((current) => ({
                        ...current,
                        segment: event.target.value,
                      }))
                    }
                    placeholder="Ex.: Pizzaria"
                  />
                </label>
              </div>

              <label style={styles.field}>
                <span>Observação do lead</span>
                <textarea
                  rows={4}
                  style={{
                    ...styles.input,
                    resize: "vertical",
                  }}
                  value={manualDraft.manualNotes}
                  onChange={(event) =>
                    setManualDraft((current) => ({
                      ...current,
                      manualNotes: event.target.value,
                    }))
                  }
                  placeholder="Ex.: falar com João, compras após as 14h..."
                />
              </label>

              <div style={styles.editLeadActions}>
                <button
                  type="button"
                  style={styles.editLeadCancel}
                  disabled={manualEditSaving}
                  onClick={() => setManualEditOpen(false)}
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  style={styles.editLeadSave}
                  disabled={
                    manualEditSaving ||
                    !manualDraft.name.trim() ||
                    !manualDraft.phone1.trim()
                  }
                  onClick={saveManualLead}
                >
                  {manualEditSaving ? "Salvando..." : "Salvar dados"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

      </div>
    </main>
  );
}

const styles: Record<string, any> = {
  page: {
    minHeight: "100vh",
    background: "#f6f8fb",
    color: "#0f172a",
    padding: "12px",
  },
  shell: {
    width: "100%",
    maxWidth: 620,
    margin: "0 auto",
  },
  header: {
    background: "#fff",
    border: "1px solid #edf1f7",
    borderRadius: 20,
    padding: 18,
    boxShadow: "0 8px 24px rgba(15,23,42,.04)",
    marginBottom: 12,
  },
  backLink: {
    display: "inline-block",
    textDecoration: "none",
    color: "#14843f",
    fontWeight: 900,
    marginBottom: 12,
  },
  kicker: {
    color: "#14843f",
    fontSize: 11,
    letterSpacing: ".15em",
    fontWeight: 950,
    textTransform: "uppercase",
  },
  title: {
    margin: "5px 0 14px",
    fontSize: 26,
    lineHeight: 1.05,
    letterSpacing: "-.04em",
    fontWeight: 950,
  },
  progressRow: {
    display: "flex",
    justifyContent: "space-between",
    color: "#64748b",
    fontSize: 13,
    fontWeight: 900,
  },
  progressTrack: {
    marginTop: 8,
    height: 8,
    borderRadius: 999,
    background: "#e2e8f0",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    background: "linear-gradient(90deg,#16a34a,#14843f)",
    borderRadius: 999,
  },
  contactCard: {
    background: "#fff",
    border: "1px solid rgba(22,163,74,.14)",
    borderRadius: 22,
    padding: 20,
    boxShadow: "0 12px 30px rgba(15,23,42,.05)",
    marginBottom: 12,
    textAlign: "center",
  },
  position: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: 900,
  },
  clientIdBadge: {
    display: "inline-flex",
    marginTop: 8,
    borderRadius: 999,
    padding: "6px 10px",
    background: "#eff6ff",
    border: "1px solid #bfdbfe",
    color: "#1d4ed8",
    fontSize: 11,
    fontWeight: 950,
  },
  editLeadButton: {
    marginTop: 8,
    border: "1px solid #bbf7d0",
    borderRadius: 11,
    padding: "8px 11px",
    background: "#f0fdf4",
    color: "#166534",
    fontWeight: 950,
    cursor: "pointer",
  },
  manualNote: {
    display: "grid",
    gap: 4,
    marginBottom: 16,
    borderRadius: 14,
    padding: 12,
    textAlign: "left",
    background: "#fff7ed",
    border: "1px solid #fed7aa",
    color: "#9a3412",
    fontSize: 11,
  },
  navigationRow: {
    display: "flex",
    gap: 8,
    justifyContent: "space-between",
    marginBottom: 10,
  },
  navButton: {
    border: "1px solid #dbe3ef",
    borderRadius: 12,
    padding: "9px 11px",
    background: "#fff",
    color: "#334155",
    fontWeight: 900,
    cursor: "pointer",
  },
  navPrimaryButton: {
    border: 0,
    borderRadius: 12,
    padding: "9px 11px",
    background: "#14843f",
    color: "#fff",
    fontWeight: 950,
    cursor: "pointer",
  },
  customerName: {
    margin: "9px 0 4px",
    fontSize: 28,
    lineHeight: 1.05,
    fontWeight: 950,
    letterSpacing: "-.04em",
  },
  location: {
    color: "#64748b",
    fontWeight: 800,
    marginBottom: 18,
  },
  infoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2,minmax(0,1fr))",
    gap: 8,
    textAlign: "left",
    marginBottom: 20,
  },
  infoBox: {
    minWidth: 0,
    padding: 12,
    borderRadius: 14,
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
  },
  phoneLabel: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: 900,
  },
  phone: {
    margin: "5px 0 14px",
    fontSize: 28,
    fontWeight: 950,
    letterSpacing: "-.025em",
  },
  callButton: {
    width: "100%",
    minHeight: 58,
    border: 0,
    borderRadius: 16,
    background: "linear-gradient(135deg,#16a34a,#14843f)",
    color: "#fff",
    fontSize: 18,
    fontWeight: 950,
    cursor: "pointer",
    boxShadow: "0 14px 28px rgba(22,163,74,.24)",
  },
  callHint: {
    marginTop: 10,
    color: "#64748b",
    fontSize: 11,
    lineHeight: 1.4,
    fontWeight: 700,
  },
  resultCard: {
    background: "#fff",
    border: "1px solid #edf1f7",
    borderRadius: 22,
    padding: 18,
    boxShadow: "0 12px 30px rgba(15,23,42,.045)",
  },
  resultTitle: {
    margin: "0 0 14px",
    fontSize: 18,
    fontWeight: 950,
  },
  resultGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2,minmax(0,1fr))",
    gap: 8,
  },
  resultButton: {
    minHeight: 58,
    borderRadius: 14,
    border: "1px solid #dce6f1",
    background: "#fff",
    color: "#334155",
    fontWeight: 900,
    cursor: "pointer",
    display: "flex",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  resultButtonActive: {
    border: "1px solid rgba(22,163,74,.55)",
    background: "#f0fdf4",
    color: "#166534",
    boxShadow: "0 0 0 2px rgba(22,163,74,.08)",
  },
  field: {
    display: "grid",
    gap: 6,
    marginTop: 14,
    color: "#475569",
    fontSize: 12,
    fontWeight: 950,
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid #dce6f1",
    background: "#fff",
    padding: "12px 13px",
    borderRadius: 14,
    outline: "none",
    color: "#0f172a",
    fontWeight: 750,
    fontFamily: "inherit",
  },
  nextButton: {
    width: "100%",
    marginTop: 16,
    minHeight: 54,
    border: 0,
    borderRadius: 15,
    background: "#0f172a",
    color: "#fff",
    fontWeight: 950,
  },
  message: {
    padding: 13,
    marginBottom: 12,
    borderRadius: 14,
    background: "#fff7ed",
    border: "1px solid #fed7aa",
    color: "#9a3412",
    fontWeight: 800,
  },
  callbackAlert: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
    padding: 15,
    borderRadius: 18,
    background: "linear-gradient(135deg,#fef3c7,#fff7ed)",
    border: "2px solid #f59e0b",
    boxShadow: "0 14px 30px rgba(245,158,11,.18)",
  },
  callbackAlertIcon: {
    fontSize: 30,
    flex: "0 0 auto",
  },
  callbackAlertKicker: {
    color: "#b45309",
    fontSize: 10,
    fontWeight: 950,
    letterSpacing: ".08em",
  },
  callbackAlertName: {
    display: "block",
    marginTop: 3,
    color: "#7c2d12",
    fontSize: 16,
    fontWeight: 950,
  },
  callbackAlertMeta: {
    marginTop: 2,
    color: "#92400e",
    fontSize: 11,
    fontWeight: 800,
  },
  callbackOpenButton: {
    flex: "0 0 auto",
    border: 0,
    borderRadius: 12,
    padding: "10px 12px",
    background: "#d97706",
    color: "#fff",
    fontWeight: 950,
    cursor: "pointer",
  },
  notificationButton: {
    width: "100%",
    marginBottom: 12,
    border: "1px solid #bbf7d0",
    borderRadius: 14,
    padding: "11px 14px",
    background: "#f0fdf4",
    color: "#166534",
    fontWeight: 950,
    cursor: "pointer",
  },
  finished: {
    background: "#fff",
    border: "1px solid rgba(22,163,74,.14)",
    borderRadius: 22,
    padding: "36px 20px",
    textAlign: "center",
    boxShadow: "0 12px 30px rgba(15,23,42,.045)",
  },
  secondaryButton: {
    marginTop: 18,
    border: "1px solid rgba(22,163,74,.22)",
    color: "#14843f",
    background: "#fff",
    padding: "11px 16px",
    borderRadius: 14,
    fontWeight: 950,
    cursor: "pointer",
  },
  reviewBadge: {
    display: "inline-flex",
    borderRadius: 999,
    padding: "5px 9px",
    background: "#fff7ed",
    border: "1px solid #fed7aa",
    color: "#9a3412",
    fontSize: 10,
    fontWeight: 950,
    letterSpacing: ".06em",
  },
  reviewText: {
    margin: "-5px 0 14px",
    color: "#64748b",
    fontSize: 12,
    fontWeight: 700,
    lineHeight: 1.5,
  },
  retryToggle: {
    width: "100%",
    border: "1px solid #bbf7d0",
    borderRadius: 13,
    padding: "11px 12px",
    background: "#f0fdf4",
    color: "#166534",
    fontWeight: 950,
    cursor: "pointer",
  },
  retryPanel: {
    marginTop: 10,
    padding: 12,
    borderRadius: 14,
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
  },
  retryHint: {
    marginTop: 7,
    color: "#64748b",
    fontSize: 10,
    fontWeight: 700,
  },
  historyDivider: {
    height: 1,
    margin: "18px 0 12px",
    background: "#e2e8f0",
  },
  historyToggle: {
    width: "100%",
    border: 0,
    padding: "10px 0",
    background: "transparent",
    color: "#334155",
    textAlign: "left",
    fontWeight: 950,
    cursor: "pointer",
  },
  historyList: {
    display: "grid",
    gap: 8,
    marginTop: 8,
  },
  historyItem: {
    border: "1px solid #e2e8f0",
    borderRadius: 12,
    padding: 10,
    background: "#f8fafc",
  },
  historyTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 8,
    color: "#334155",
    fontSize: 11,
    fontWeight: 850,
  },
  historyNotes: {
    marginTop: 6,
    color: "#64748b",
    fontSize: 11,
    lineHeight: 1.45,
  },
  historyEmpty: {
    padding: 12,
    borderRadius: 12,
    background: "#f8fafc",
    color: "#64748b",
    fontSize: 11,
    fontWeight: 700,
  },
  modalBackdrop: {
    position: "fixed",
    zIndex: 9999,
    inset: 0,
    display: "grid",
    placeItems: "center",
    padding: 14,
    background: "rgba(15,23,42,.52)",
    backdropFilter: "blur(4px)",
  },
  editLeadModal: {
    width: "min(100%,620px)",
    maxHeight: "92vh",
    overflowY: "auto",
    borderRadius: 22,
    padding: 20,
    background: "#fff",
    border: "1px solid #e2e8f0",
    boxShadow: "0 28px 80px rgba(15,23,42,.25)",
  },
  editLeadTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  editLeadKicker: {
    color: "#14843f",
    fontSize: 10,
    letterSpacing: ".12em",
    fontWeight: 950,
  },
  editLeadTitle: {
    margin: "5px 0 0",
    fontSize: 21,
    color: "#0f172a",
    fontWeight: 950,
  },
  editLeadText: {
    margin: "8px 0 4px",
    color: "#64748b",
    fontSize: 12,
    lineHeight: 1.5,
    fontWeight: 700,
  },
  editLeadClose: {
    width: 36,
    height: 36,
    border: "1px solid #e2e8f0",
    borderRadius: 10,
    background: "#fff",
    color: "#475569",
    fontSize: 22,
    cursor: "pointer",
  },
  editLeadGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2,minmax(0,1fr))",
    gap: "0 10px",
  },
  editLeadActions: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 9,
    marginTop: 16,
  },
  editLeadCancel: {
    border: "1px solid #dbe3ef",
    borderRadius: 12,
    padding: "11px 12px",
    background: "#fff",
    color: "#475569",
    fontWeight: 950,
    cursor: "pointer",
  },
  editLeadSave: {
    border: 0,
    borderRadius: 12,
    padding: "11px 12px",
    background: "#14843f",
    color: "#fff",
    fontWeight: 950,
    cursor: "pointer",
  },
  headerReportButton: {
    width: "100%",
    marginTop: 12,
    border: "1px solid #dbe3ef",
    borderRadius: 12,
    padding: "9px 12px",
    background: "#fff",
    color: "#334155",
    fontWeight: 950,
    cursor: "pointer",
  },
  finishedActions: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  reportButton: {
    marginTop: 18,
    border: "1px solid #dbe3ef",
    color: "#334155",
    background: "#fff",
    padding: "11px 16px",
    borderRadius: 14,
    fontWeight: 950,
    cursor: "pointer",
  },
  requeueButton: {
    width: "100%",
    marginTop: 12,
    border: 0,
    borderRadius: 14,
    padding: "12px 14px",
    background: "#14843f",
    color: "#fff",
    fontWeight: 950,
    cursor: "pointer",
  },
  reportModal: {
    width: "min(100%,720px)",
    maxHeight: "92vh",
    overflowY: "auto",
    borderRadius: 22,
    padding: 20,
    background: "#fff",
    border: "1px solid #e2e8f0",
    boxShadow: "0 28px 80px rgba(15,23,42,.25)",
  },
  reportModalTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
    marginBottom: 14,
  },
  reportMetrics: {
    display: "grid",
    gridTemplateColumns: "repeat(3,minmax(0,1fr))",
    gap: 8,
    marginBottom: 12,
  },
  reportList: {
    display: "grid",
    gap: 8,
    marginTop: 14,
  },
  reportRow: {
    border: "1px solid #e2e8f0",
    borderRadius: 13,
    padding: 11,
    background: "#f8fafc",
  },
  reportRowMain: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
    color: "#0f172a",
    fontSize: 12,
  },
  reportRowMeta: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 6,
    color: "#64748b",
    fontSize: 10,
    fontWeight: 800,
  },
  reportNotes: {
    marginTop: 7,
    color: "#475569",
    fontSize: 11,
    lineHeight: 1.45,
  },
  reportLoading: {
    minHeight: 140,
    display: "grid",
    placeItems: "center",
    color: "#64748b",
    fontWeight: 850,
  },
  loading: {
    minHeight: 220,
    display: "grid",
    placeItems: "center",
    color: "#64748b",
    fontWeight: 900,
  },
};
