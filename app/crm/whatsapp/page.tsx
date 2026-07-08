"use client";

import { useEffect, useMemo, useState } from "react";

const SESSIONS = [1, 2, 3, 4, 5];

function getCompanyId() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("active_company_id") || "";
}

function buildHeaders() {
  const companyId = getCompanyId();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (companyId) headers["x-company-id"] = companyId;

  return headers;
}

function statusLabel(status?: string) {
  if (status === "online") return "Conectado";
  if (status === "qr_pending") return "Aguardando leitura do QR";
  return "Desconectado";
}

function statusStyle(status?: string) {
  if (status === "online") return styles.onlineBadge;
  if (status === "qr_pending") return styles.pendingBadge;
  return styles.offlineBadge;
}

export default function WhatsAppPage() {
  const [sessions, setSessions] = useState<any>({});
  const [loading, setLoading] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const stats = useMemo(() => {
    const values = SESSIONS.map((id) => sessions[id]?.status || "offline");

    return {
      total: SESSIONS.length,
      online: values.filter((status) => status === "online").length,
      qr: values.filter((status) => status === "qr_pending").length,
      offline: values.filter((status) => status !== "online" && status !== "qr_pending").length,
    };
  }, [sessions]);

  async function callWhatsApp(action: string, sessionId: number) {
    let url = "";
    let method: "GET" | "POST" = "GET";

    if (action === "qr") {
      url = `/api/whatsapp/qr?sessionId=${sessionId}`;
      method = "GET";
    }

    if (action === "start") {
      url = "/api/whatsapp/start";
      method = "POST";
    }

    if (action === "restart") {
      url = "/api/whatsapp/restart";
      method = "POST";
    }

    const res = await fetch(url, {
      method,
      headers: buildHeaders(),
      body:
        method === "POST"
          ? JSON.stringify({
              sessionId: String(sessionId),
            })
          : undefined,
      cache: "no-store",
      credentials: "include",
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data?.error || "Erro na conexão do WhatsApp.");
    }

    return data;
  }

  async function loadQr(sessionId: number) {
    try {
      const data = await callWhatsApp("qr", sessionId);

      setSessions((prev: any) => ({
        ...prev,
        [sessionId]: data,
      }));
    } catch (error: any) {
      setSessions((prev: any) => ({
        ...prev,
        [sessionId]: {
          status: "offline",
          qr: null,
          error: error?.message || "Erro ao carregar sessão.",
        },
      }));
    }
  }

  async function loadAll() {
    setRefreshing(true);

    try {
      await Promise.all(SESSIONS.map((id) => loadQr(id)));
    } finally {
      setRefreshing(false);
    }
  }

  async function gerarQr(sessionId: number) {
    setLoading(sessionId);

    try {
      await callWhatsApp("start", sessionId);

      setTimeout(() => {
        loadQr(sessionId);
        setLoading(null);
      }, 3000);
    } catch (error: any) {
      alert(error?.message || "Erro ao gerar QR.");
      setLoading(null);
    }
  }

  async function resetarSessao(sessionId: number) {
    const ok = confirm(
      `Resetar o WhatsApp ${sessionId}? Isso vai gerar uma nova sessão para esta empresa.`
    );

    if (!ok) return;

    setLoading(sessionId);

    try {
      await callWhatsApp("restart", sessionId);

      setTimeout(() => {
        loadQr(sessionId);
        setLoading(null);
      }, 4000);
    } catch (error: any) {
      alert(error?.message || "Erro ao resetar sessão.");
      setLoading(null);
    }
  }

  useEffect(() => {
    loadAll();

    const interval = setInterval(() => {
      loadAll();
    }, 7000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main style={styles.page}>
      <section style={styles.hero}>
        <div>
          <p style={styles.kicker}>Zentra RH</p>
          <h1 style={styles.title}>Conectar WhatsApp</h1>
          <p style={styles.subtitle}>
            Leia o QR Code para conectar os números usados nos disparos,
            campanhas, inbox e automações de entrevistas. Cada empresa possui
            sessões isoladas.
          </p>
        </div>

        <button style={styles.primaryButton} onClick={loadAll} disabled={refreshing}>
          {refreshing ? "Atualizando..." : "Atualizar tudo"}
        </button>
      </section>

      <section style={styles.statsGrid}>
        <Metric label="Sessões" value={stats.total} />
        <Metric label="Conectados" value={stats.online} />
        <Metric label="Aguardando QR" value={stats.qr} />
        <Metric label="Offline" value={stats.offline} />
      </section>

      <section style={styles.helpCard}>
        <div style={styles.helpIcon}>📲</div>
        <div>
          <strong>Como conectar</strong>
          <p>
            Clique em "Gerar QR", abra o WhatsApp no celular, toque em
            Aparelhos conectados e leia o QR Code. Quando conectar, o status
            muda automaticamente para conectado.
          </p>
        </div>
      </section>

      <section style={styles.grid}>
        {SESSIONS.map((sessionId) => {
          const session = sessions[sessionId];
          const status = session?.status || "offline";
          const qr = session?.qr || null;
          const isOnline = status === "online";
          const isQr = status === "qr_pending";

          return (
            <article key={sessionId} style={styles.card}>
              <div style={styles.cardTop}>
                <div>
                  <p style={styles.cardKicker}>Sessão {sessionId}</p>
                  <h2 style={styles.cardTitle}>WhatsApp {sessionId}</h2>
                </div>

                <span style={statusStyle(status)}>{statusLabel(status)}</span>
              </div>

              <div style={styles.qrBox}>
                {isOnline ? (
                  <div style={styles.center}>
                    <div style={styles.successIcon}>✓</div>
                    <strong style={styles.connectedText}>WhatsApp conectado</strong>

                    {session?.companyId && (
                      <p style={styles.muted}>Empresa: {session.companyId}</p>
                    )}
                  </div>
                ) : qr ? (
                  <div style={styles.center}>
                    <img
                      src={qr}
                      alt={`QR WhatsApp ${sessionId}`}
                      style={styles.qrImage}
                    />

                    <p style={styles.muted}>Leia este QR no WhatsApp</p>
                  </div>
                ) : (
                  <div style={styles.center}>
                    <div style={styles.phoneIcon}>📱</div>
                    <strong>Nenhum QR gerado</strong>

                    {session?.error && (
                      <p style={styles.errorText}>{session.error}</p>
                    )}
                  </div>
                )}
              </div>

              <div style={styles.actions}>
                <button
                  onClick={() => gerarQr(sessionId)}
                  disabled={loading === sessionId}
                  style={styles.primarySmallButton}
                >
                  {loading === sessionId ? "Gerando..." : "Gerar QR"}
                </button>

                <button
                  onClick={() => resetarSessao(sessionId)}
                  disabled={loading === sessionId}
                  style={styles.dangerButton}
                >
                  Resetar
                </button>

                <button
                  onClick={() => loadQr(sessionId)}
                  disabled={loading === sessionId}
                  style={styles.secondaryButton}
                >
                  Atualizar
                </button>
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: any }) {
  return (
    <div style={styles.metric}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    padding: 20,
    background: "linear-gradient(135deg, #eff6ff, #ffffff, #dbeafe)",
    color: "#0f172a",
  },
  hero: {
    background: "#fff",
    border: "1px solid #bfdbfe",
    borderRadius: 28,
    padding: 24,
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
    boxShadow: "0 18px 50px rgba(37,99,235,.08)",
  },
  kicker: {
    margin: 0,
    color: "#2563eb",
    fontWeight: 900,
    letterSpacing: ".22em",
    fontSize: 12,
    textTransform: "uppercase",
  },
  title: {
    margin: "8px 0",
    fontSize: 38,
    fontWeight: 950,
    letterSpacing: "-.04em",
  },
  subtitle: {
    margin: 0,
    color: "#64748b",
    fontSize: 14,
    maxWidth: 760,
    lineHeight: 1.6,
  },
  primaryButton: {
    border: 0,
    borderRadius: 16,
    padding: "13px 18px",
    background: "linear-gradient(135deg, #38bdf8, #2563eb)",
    color: "#fff",
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: "0 12px 24px rgba(37,99,235,.20)",
  },
  statsGrid: {
    marginTop: 16,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 12,
  },
  metric: {
    background: "#fff",
    border: "1px solid #bfdbfe",
    borderRadius: 20,
    padding: 16,
    display: "grid",
    gap: 8,
  },
  helpCard: {
    marginTop: 16,
    display: "flex",
    gap: 14,
    alignItems: "center",
    background: "#fff",
    border: "1px solid #bfdbfe",
    borderRadius: 24,
    padding: 18,
    boxShadow: "0 12px 30px rgba(37,99,235,.06)",
  },
  helpIcon: {
    width: 48,
    height: 48,
    borderRadius: 18,
    display: "grid",
    placeItems: "center",
    background: "#dbeafe",
    fontSize: 24,
  },
  grid: {
    marginTop: 18,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))",
    gap: 16,
  },
  card: {
    background: "#fff",
    border: "1px solid #bfdbfe",
    borderRadius: 28,
    padding: 18,
    boxShadow: "0 18px 50px rgba(37,99,235,.07)",
  },
  cardTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "start",
    gap: 12,
  },
  cardKicker: {
    margin: 0,
    color: "#2563eb",
    fontSize: 11,
    fontWeight: 950,
    textTransform: "uppercase",
    letterSpacing: ".16em",
  },
  cardTitle: {
    margin: "4px 0 0",
    fontSize: 24,
    fontWeight: 950,
  },
  onlineBadge: {
    border: "1px solid #bbf7d0",
    background: "#f0fdf4",
    color: "#15803d",
    borderRadius: 999,
    padding: "7px 10px",
    fontSize: 11,
    fontWeight: 950,
    whiteSpace: "nowrap",
  },
  pendingBadge: {
    border: "1px solid #fde68a",
    background: "#fffbeb",
    color: "#b45309",
    borderRadius: 999,
    padding: "7px 10px",
    fontSize: 11,
    fontWeight: 950,
    whiteSpace: "nowrap",
  },
  offlineBadge: {
    border: "1px solid #fecaca",
    background: "#fff1f2",
    color: "#dc2626",
    borderRadius: 999,
    padding: "7px 10px",
    fontSize: 11,
    fontWeight: 950,
    whiteSpace: "nowrap",
  },
  qrBox: {
    marginTop: 16,
    minHeight: 300,
    borderRadius: 24,
    border: "1px solid #dbeafe",
    background: "linear-gradient(135deg, #f8fafc, #eff6ff)",
    display: "grid",
    placeItems: "center",
    padding: 18,
  },
  center: {
    textAlign: "center",
    display: "grid",
    placeItems: "center",
    gap: 10,
  },
  qrImage: {
    width: 240,
    height: 240,
    borderRadius: 20,
    background: "#fff",
    padding: 12,
    border: "1px solid #bfdbfe",
    boxShadow: "0 14px 34px rgba(15,23,42,.10)",
  },
  successIcon: {
    width: 72,
    height: 72,
    borderRadius: 28,
    background: "#dcfce7",
    color: "#16a34a",
    display: "grid",
    placeItems: "center",
    fontWeight: 950,
    fontSize: 36,
  },
  phoneIcon: {
    width: 72,
    height: 72,
    borderRadius: 28,
    background: "#dbeafe",
    display: "grid",
    placeItems: "center",
    fontSize: 34,
  },
  connectedText: {
    color: "#15803d",
  },
  muted: {
    margin: 0,
    color: "#64748b",
    fontSize: 12,
  },
  errorText: {
    margin: 0,
    color: "#dc2626",
    fontSize: 12,
    maxWidth: 260,
  },
  actions: {
    marginTop: 16,
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  primarySmallButton: {
    border: 0,
    borderRadius: 14,
    padding: "11px 14px",
    background: "#2563eb",
    color: "#fff",
    fontWeight: 950,
    cursor: "pointer",
  },
  secondaryButton: {
    border: "1px solid #bfdbfe",
    borderRadius: 14,
    padding: "10px 12px",
    background: "#fff",
    color: "#2563eb",
    fontWeight: 950,
    cursor: "pointer",
  },
  dangerButton: {
    border: 0,
    borderRadius: 14,
    padding: "11px 14px",
    background: "#ef4444",
    color: "#fff",
    fontWeight: 950,
    cursor: "pointer",
  },
};
