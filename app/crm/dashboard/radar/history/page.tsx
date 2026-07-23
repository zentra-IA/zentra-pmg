"use client";

import { useEffect, useState } from "react";

type Snapshot = {
  id: string;
  fileName: string;
  status: string;
  normalizedStatus: string;
  isCurrent: boolean;
  processedRows: number;
  validRows: number;
  created: number;
  updated: number;
  removed: number;
  duplicated: number;
  invalid: number;
  linkedProspects: number;
  previousSnapshotId: string | null;
  finishedAt: string | null;
  createdAt: string;
  error: string | null;
};

type ResponseData = {
  success: boolean;
  currentSnapshot: {
    id: string;
    fileName: string;
    createdAt: string;
    processedRows: number;
    validRows: number;
  } | null;
  snapshots: Snapshot[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value || 0);
}

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function statusLabel(status: string) {
  switch (status) {
    case "COMPLETED":
      return "Concluído";
    case "PROCESSING":
      return "Processando";
    case "PENDING":
      return "Pendente";
    case "FAILED":
      return "Falhou";
    default:
      return status;
  }
}

export default function RadarHistoryPage() {
  const [data, setData] = useState<ResponseData | null>(null);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadHistory() {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: "20",
      });

      if (status) {
        params.set("status", status);
      }

      const response = await fetch(
        `/api/radar/snapshots?${params.toString()}`,
        {
          cache: "no-store",
        }
      );

      const json = await response.json();

      if (!response.ok) {
        throw new Error(
          json?.error ||
            "Não foi possível carregar o histórico."
        );
      }

      setData(json);
    } catch (historyError) {
      setError(
        historyError instanceof Error
          ? historyError.message
          : "Erro inesperado."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadHistory();
  }, [page, status]);

  return (
    <main style={styles.page}>
      <section style={styles.container}>
        <header style={styles.header}>
          <div>
            <span style={styles.eyebrow}>ZENTRA SALES AI</span>
            <h1 style={styles.title}>Histórico do Radar</h1>
            <p style={styles.subtitle}>
              Consulte todas as bases importadas e identifique o snapshot atual.
            </p>
          </div>

          <div style={styles.actions}>
            <a href="/crm/dashboard/radar/upload-v2" style={styles.secondaryLink}>
              Importar nova base
            </a>
            <a href="/crm/dashboard/radar" style={styles.primaryLink}>
              Voltar ao Radar
            </a>
          </div>
        </header>

        {data?.currentSnapshot && (
          <section style={styles.currentCard}>
            <div>
              <span style={styles.currentBadge}>BASE ATUAL</span>
              <h2 style={styles.currentTitle}>
                {data.currentSnapshot.fileName}
              </h2>
              <p style={styles.currentDate}>
                Ativada em {formatDate(data.currentSnapshot.createdAt)}
              </p>
            </div>

            <div style={styles.currentMetrics}>
              <div>
                <span style={styles.metricLabel}>Processados</span>
                <strong style={styles.metricValue}>
                  {formatNumber(data.currentSnapshot.processedRows)}
                </strong>
              </div>
              <div>
                <span style={styles.metricLabel}>Válidos</span>
                <strong style={styles.metricValue}>
                  {formatNumber(data.currentSnapshot.validRows)}
                </strong>
              </div>
            </div>
          </section>
        )}

        <section style={styles.toolbar}>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            style={styles.select}
          >
            <option value="">Todos os status</option>
            <option value="completed">Concluídos</option>
            <option value="processing">Processando</option>
            <option value="pending">Pendentes</option>
            <option value="failed">Com falha</option>
          </select>

          <button
            type="button"
            onClick={loadHistory}
            disabled={loading}
            style={styles.refreshButton}
          >
            {loading ? "Atualizando..." : "Atualizar"}
          </button>
        </section>

        {error && <div style={styles.error}>{error}</div>}

        {loading && !data && (
          <div style={styles.empty}>Carregando histórico...</div>
        )}

        {!loading && data?.snapshots.length === 0 && (
          <div style={styles.empty}>Nenhum snapshot encontrado.</div>
        )}

        <section style={styles.list}>
          {data?.snapshots.map((snapshot) => (
            <article
              key={snapshot.id}
              style={{
                ...styles.card,
                ...(snapshot.isCurrent ? styles.cardCurrent : {}),
              }}
            >
              <div style={styles.cardTop}>
                <div>
                  <div style={styles.badges}>
                    {snapshot.isCurrent && (
                      <span style={styles.currentMiniBadge}>Atual</span>
                    )}
                    <span style={styles.statusBadge}>
                      {statusLabel(snapshot.normalizedStatus)}
                    </span>
                  </div>

                  <h2 style={styles.cardTitle}>{snapshot.fileName}</h2>
                  <p style={styles.cardDate}>
                    {formatDate(snapshot.createdAt)}
                  </p>
                </div>

                <div style={styles.linkedCount}>
                  <span style={styles.metricLabel}>Clientes vinculados</span>
                  <strong style={styles.metricValue}>
                    {formatNumber(snapshot.linkedProspects)}
                  </strong>
                </div>
              </div>

              <div style={styles.metricsGrid}>
                <Metric label="Processados" value={snapshot.processedRows} />
                <Metric label="Criados" value={snapshot.created} />
                <Metric label="Atualizados" value={snapshot.updated} />
                <Metric label="Removidos" value={snapshot.removed} />
                <Metric label="Inválidos" value={snapshot.invalid} />
                <Metric label="Duplicados" value={snapshot.duplicated} />
              </div>

              <div style={styles.footer}>
                <span>
                  Snapshot: <strong>{snapshot.id}</strong>
                </span>
                <span>
                  Snapshot anterior:{" "}
                  <strong>{snapshot.previousSnapshotId || "-"}</strong>
                </span>
                <span>
                  Conclusão: <strong>{formatDate(snapshot.finishedAt)}</strong>
                </span>
              </div>

              {snapshot.error && (
                <div style={styles.snapshotError}>{snapshot.error}</div>
              )}
            </article>
          ))}
        </section>

        {data && data.pagination.totalPages > 1 && (
          <footer style={styles.pagination}>
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              style={styles.pageButton}
            >
              Anterior
            </button>

            <span>
              Página {data.pagination.page} de {data.pagination.totalPages}
            </span>

            <button
              type="button"
              disabled={
                page >= data.pagination.totalPages || loading
              }
              onClick={() => setPage((current) => current + 1)}
              style={styles.pageButton}
            >
              Próxima
            </button>
          </footer>
        )}
      </section>
    </main>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div style={styles.metricCard}>
      <span style={styles.metricLabel}>{label}</span>
      <strong style={styles.smallMetricValue}>
        {formatNumber(value)}
      </strong>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    padding: "32px 20px 64px",
    background:
      "linear-gradient(135deg, rgba(236,253,245,0.96), rgba(248,250,252,0.98))",
    color: "#172033",
  },
  container: {
    width: "100%",
    maxWidth: 1120,
    margin: "0 auto",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 24,
    marginBottom: 24,
  },
  actions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  eyebrow: {
    color: "#15803d",
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: "0.14em",
  },
  title: {
    margin: "8px 0 0",
    fontSize: 32,
  },
  subtitle: {
    margin: "10px 0 0",
    color: "#64748b",
  },
  primaryLink: {
    padding: "11px 16px",
    borderRadius: 12,
    background: "#16a34a",
    color: "#fff",
    fontWeight: 800,
    textDecoration: "none",
  },
  secondaryLink: {
    padding: "11px 16px",
    border: "1px solid #bbf7d0",
    borderRadius: 12,
    background: "#fff",
    color: "#15803d",
    fontWeight: 800,
    textDecoration: "none",
  },
  currentCard: {
    display: "flex",
    justifyContent: "space-between",
    gap: 24,
    marginBottom: 20,
    padding: 24,
    border: "1px solid #86efac",
    borderRadius: 20,
    background: "#f0fdf4",
  },
  currentBadge: {
    display: "inline-block",
    padding: "6px 9px",
    borderRadius: 999,
    background: "#166534",
    color: "#fff",
    fontSize: 11,
    fontWeight: 900,
  },
  currentTitle: {
    margin: "12px 0 0",
  },
  currentDate: {
    color: "#64748b",
  },
  currentMetrics: {
    display: "flex",
    gap: 32,
  },
  toolbar: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 18,
    padding: 18,
    border: "1px solid #dbe5df",
    borderRadius: 16,
    background: "#fff",
  },
  select: {
    minWidth: 220,
    padding: "10px 12px",
    border: "1px solid #cbd5e1",
    borderRadius: 10,
  },
  refreshButton: {
    padding: "11px 16px",
    border: "1px solid #bbf7d0",
    borderRadius: 10,
    background: "#fff",
    color: "#15803d",
    fontWeight: 800,
  },
  error: {
    marginBottom: 18,
    padding: 14,
    border: "1px solid #fca5a5",
    borderRadius: 12,
    background: "#fee2e2",
    color: "#991b1b",
  },
  empty: {
    padding: 32,
    border: "1px solid #dbe5df",
    borderRadius: 16,
    background: "#fff",
    textAlign: "center",
  },
  list: {
    display: "grid",
    gap: 16,
  },
  card: {
    padding: 22,
    border: "1px solid #dbe5df",
    borderRadius: 18,
    background: "#fff",
  },
  cardCurrent: {
    borderColor: "#86efac",
  },
  cardTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 18,
  },
  badges: {
    display: "flex",
    gap: 8,
  },
  currentMiniBadge: {
    padding: "6px 10px",
    borderRadius: 999,
    background: "#166534",
    color: "#fff",
    fontSize: 11,
    fontWeight: 900,
  },
  statusBadge: {
    padding: "6px 10px",
    border: "1px solid #cbd5e1",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 900,
  },
  cardTitle: {
    margin: "12px 0 0",
  },
  cardDate: {
    margin: "5px 0 0",
    color: "#64748b",
  },
  linkedCount: {
    textAlign: "right",
  },
  metricLabel: {
    display: "block",
    color: "#64748b",
    fontSize: 12,
    fontWeight: 700,
  },
  metricValue: {
    display: "block",
    marginTop: 4,
    fontSize: 26,
  },
  metricsGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(130px, 1fr))",
    gap: 10,
    marginTop: 20,
  },
  metricCard: {
    padding: 14,
    border: "1px solid #e2e8f0",
    borderRadius: 12,
    background: "#f8fafc",
  },
  smallMetricValue: {
    display: "block",
    marginTop: 4,
    fontSize: 20,
  },
  footer: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 10,
    marginTop: 18,
    paddingTop: 16,
    borderTop: "1px solid #e2e8f0",
    color: "#64748b",
    fontSize: 12,
    wordBreak: "break-word",
  },
  snapshotError: {
    marginTop: 14,
    padding: 12,
    border: "1px solid #fca5a5",
    borderRadius: 10,
    background: "#fee2e2",
    color: "#991b1b",
  },
  pagination: {
    display: "flex",
    justifyContent: "center",
    gap: 14,
    marginTop: 20,
  },
  pageButton: {
    padding: "10px 14px",
    border: "1px solid #cbd5e1",
    borderRadius: 10,
    background: "#fff",
  },
};
