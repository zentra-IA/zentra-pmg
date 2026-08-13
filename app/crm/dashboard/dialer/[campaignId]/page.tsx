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
    };
  };
  nextCallbackAt?: string | null;
};

const resultOptions = [
  { value: "ANSWERED", label: "Atendeu", icon: "✅" },
  { value: "NO_ANSWER", label: "Não atendeu", icon: "❌" },
  { value: "BUSY", label: "Ocupado", icon: "📞" },
  { value: "VOICEMAIL", label: "Caixa postal", icon: "📭" },
  { value: "CALLBACK", label: "Retornar", icon: "🕐" },
  { value: "SALE", label: "Venda", icon: "💰" },
  { value: "INVALID_NUMBER", label: "Número inválido", icon: "⚠️" },
];

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

  async function loadCampaign() {
    if (!campaignId) return;

    setLoading(true);
    setMessage("");

    try {
      const response = await fetch(`/api/crm/dialer/campaigns/${campaignId}`, {
        cache: "no-store",
      });

      const json = await response.json();

      if (!response.ok || !json.success) {
        throw new Error(json.error || "Erro ao carregar campanha.");
      }

      setData(json);
      setResult("");
      setNotes("");
      setNextCallAt("");
      setCallStartedAt(null);
    } catch (error: any) {
      setMessage(error?.message || "Erro ao carregar campanha.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCampaign();
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

      await loadCampaign();
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
        </header>

        {message ? <div style={styles.message}>{message}</div> : null}

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
            <button type="button" style={styles.secondaryButton} onClick={loadCampaign}>Atualizar</button>
          </section>
        ) : (
          <>
            <section style={styles.contactCard}>
              <div style={styles.position}>Contato {data.current.position} de {data.campaign.total}</div>
              <h2 style={styles.customerName}>{data.current.prospect.name}</h2>

              <div style={styles.location}>
                {[data.current.prospect.city, data.current.prospect.state].filter(Boolean).join(" - ") || "Local não informado"}
              </div>

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
            </section>
          </>
        )}
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
  loading: {
    minHeight: 220,
    display: "grid",
    placeItems: "center",
    color: "#64748b",
    fontWeight: 900,
  },
};
