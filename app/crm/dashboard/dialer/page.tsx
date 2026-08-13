"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Campaign = {
  id: string;
  name: string;
  status: string;
  total: number;
  processed: number;
  answered: number;
  sales: number;
  createdAt: string;
};

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    READY: "Pronta",
    IN_PROGRESS: "Em andamento",
    COMPLETED: "Concluída",
  };

  return labels[status] || status;
}

export default function DialerPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function loadCampaigns() {
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/crm/dialer/campaigns", {
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Erro ao carregar campanhas.");
      }

      setCampaigns(data.campaigns || []);
    } catch (error: any) {
      setMessage(error?.message || "Erro ao carregar campanhas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCampaigns();
  }, []);

  return (
    <main style={styles.page}>
      <section style={styles.hero}>
        <div>
          <div style={styles.kicker}>ZENTRA SALES AI</div>
          <h1 style={styles.title}>Discador Comercial</h1>
          <p style={styles.subtitle}>
            Ligue usando o chip e a operadora do próprio celular. Cada usuário visualiza somente as próprias campanhas.
          </p>
        </div>

        <Link href="/crm/dashboard/radar" style={styles.primaryLink}>
          + Criar pelo Radar
        </Link>
      </section>

      {message ? <div style={styles.message}>{message}</div> : null}

      <section style={styles.card}>
        <div style={styles.sectionHeader}>
          <div>
            <h2 style={styles.sectionTitle}>Minhas campanhas</h2>
            <p style={styles.sectionText}>Continue de onde parou ou crie uma nova campanha pelo Radar Comercial.</p>
          </div>

          <button type="button" style={styles.secondaryButton} onClick={loadCampaigns}>
            Atualizar
          </button>
        </div>

        {loading ? (
          <div style={styles.empty}>Carregando campanhas...</div>
        ) : !campaigns.length ? (
          <div style={styles.empty}>
            <strong>Nenhuma campanha criada ainda.</strong>
            <span>Abra o Radar, selecione os clientes e clique em “Enviar para Discador”.</span>
          </div>
        ) : (
          <div style={styles.grid}>
            {campaigns.map((campaign) => {
              const progress = campaign.total
                ? Math.round((campaign.processed / campaign.total) * 100)
                : 0;

              return (
                <article key={campaign.id} style={styles.campaignCard}>
                  <div style={styles.cardTop}>
                    <div>
                      <div style={styles.badge}>{statusLabel(campaign.status)}</div>
                      <h3 style={styles.campaignTitle}>{campaign.name}</h3>
                    </div>
                    <div style={styles.progressNumber}>{progress}%</div>
                  </div>

                  <div style={styles.progressTrack}>
                    <div
                      style={{
                        ...styles.progressFill,
                        width: `${Math.min(100, Math.max(0, progress))}%`,
                      }}
                    />
                  </div>

                  <div style={styles.metrics}>
                    <div><strong>{campaign.total}</strong><span>Contatos</span></div>
                    <div><strong>{campaign.processed}</strong><span>Ligados</span></div>
                    <div><strong>{campaign.answered}</strong><span>Atendidos</span></div>
                    <div><strong>{campaign.sales}</strong><span>Vendas</span></div>
                  </div>

                  <Link
                    href={`/crm/dashboard/dialer/${campaign.id}`}
                    style={styles.openLink}
                  >
                    {campaign.status === "COMPLETED" ? "Ver campanha" : "Abrir discador"}
                  </Link>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

const styles: Record<string, any> = {
  page: {
    minHeight: "100vh",
    background: "#f6f8fb",
    color: "#0f172a",
    padding: "24px",
  },
  hero: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 18,
    flexWrap: "wrap",
    background: "#fff",
    border: "1px solid #edf1f7",
    boxShadow: "0 8px 24px rgba(15,23,42,.04)",
    padding: "22px 24px",
    marginBottom: 18,
  },
  kicker: {
    color: "#14843f",
    fontSize: 12,
    letterSpacing: ".16em",
    fontWeight: 950,
  },
  title: {
    margin: "6px 0 8px",
    fontSize: "clamp(28px,5vw,38px)",
    letterSpacing: "-.045em",
    fontWeight: 950,
  },
  subtitle: {
    margin: 0,
    color: "#64748b",
    lineHeight: 1.55,
    fontWeight: 650,
    maxWidth: 760,
  },
  primaryLink: {
    textDecoration: "none",
    background: "linear-gradient(135deg,#16a34a,#14843f)",
    color: "#fff",
    borderRadius: 14,
    padding: "12px 18px",
    fontWeight: 950,
    boxShadow: "0 12px 24px rgba(22,163,74,.22)",
  },
  card: {
    background: "#fff",
    border: "1px solid rgba(22,163,74,.12)",
    borderRadius: 20,
    padding: 18,
    boxShadow: "0 12px 30px rgba(15,23,42,.045)",
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    flexWrap: "wrap",
    marginBottom: 16,
  },
  sectionTitle: {
    margin: 0,
    fontSize: 20,
    fontWeight: 950,
  },
  sectionText: {
    margin: "5px 0 0",
    color: "#64748b",
    fontWeight: 650,
  },
  secondaryButton: {
    border: "1px solid rgba(22,163,74,.22)",
    color: "#14843f",
    background: "#fff",
    padding: "10px 14px",
    borderRadius: 12,
    fontWeight: 900,
    cursor: "pointer",
  },
  message: {
    marginBottom: 16,
    padding: 14,
    borderRadius: 14,
    background: "#fef2f2",
    color: "#991b1b",
    border: "1px solid #fecaca",
    fontWeight: 800,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))",
    gap: 14,
  },
  campaignCard: {
    border: "1px solid #e2e8f0",
    borderRadius: 18,
    padding: 16,
    background: "linear-gradient(180deg,#ffffff,#fbfffd)",
  },
  cardTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
  },
  badge: {
    display: "inline-flex",
    borderRadius: 999,
    background: "#f0fdf4",
    color: "#166534",
    border: "1px solid #bbf7d0",
    padding: "5px 9px",
    fontSize: 11,
    fontWeight: 950,
  },
  campaignTitle: {
    margin: "10px 0 0",
    fontSize: 18,
    fontWeight: 950,
  },
  progressNumber: {
    color: "#14843f",
    fontWeight: 950,
    fontSize: 20,
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    background: "#e2e8f0",
    overflow: "hidden",
    margin: "16px 0",
  },
  progressFill: {
    height: "100%",
    background: "linear-gradient(90deg,#16a34a,#14843f)",
    borderRadius: 999,
  },
  metrics: {
    display: "grid",
    gridTemplateColumns: "repeat(4,1fr)",
    gap: 8,
    marginBottom: 14,
  },
  openLink: {
    display: "block",
    textAlign: "center",
    textDecoration: "none",
    padding: "11px 14px",
    borderRadius: 12,
    color: "#fff",
    background: "#14843f",
    fontWeight: 950,
  },
  empty: {
    minHeight: 180,
    display: "grid",
    placeItems: "center",
    alignContent: "center",
    gap: 8,
    textAlign: "center",
    color: "#64748b",
    fontWeight: 700,
  },
};
