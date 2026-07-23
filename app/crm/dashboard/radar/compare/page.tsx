"use client";

import { useEffect, useMemo, useState } from "react";

type SnapshotInfo = {
  id: string;
  fileName: string;
  status: string;
  isCurrent: boolean;
  createdAt: string;
  finishedAt: string | null;
  processedRows: number;
  validRows: number;
};

type Prospect = {
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
  email?: string | null;
  lastTransferAt?: string | null;
  lastActivationAt?: string | null;
  lastOrderAt?: string | null;
  creditLimit?: number | null;
  paymentMethod?: string | null;
  active?: boolean;
};

type CompareResponse = {
  success: boolean;

  currentSnapshot: SnapshotInfo;
  previousSnapshot: SnapshotInfo;

  summary: {
    currentTotal: number;
    previousTotal: number;
    added: number;
    removed: number;
    unchanged: number;
    netChange: number;
  };

  addedProspects: Prospect[];
  removedProspects: Prospect[];

  pagination: {
    page: number;
    limit: number;

    added: {
      total: number;
      totalPages: number;
    };

    removed: {
      total: number;
      totalPages: number;
    };
  };

  capabilities: {
    membershipComparison: boolean;
    fieldHistoryComparison: boolean;
    note: string;
  };
};

function formatNumber(value: number | null | undefined): string {
  return new Intl.NumberFormat("pt-BR").format(Number(value || 0));
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "-";
  }

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function buildLocation(prospect: Prospect): string {
  const values = [prospect.city, prospect.state].filter(Boolean);
  return values.length > 0 ? values.join(" / ") : "-";
}


export default function RadarComparePage() {
  const [data, setData] = useState<CompareResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();

    params.set("page", String(page));
    params.set("limit", "100");

    if (typeof window !== "undefined") {
      const currentUrl = new URL(window.location.href);

      const currentSnapshotId =
        currentUrl.searchParams.get("currentSnapshotId");

      const previousSnapshotId =
        currentUrl.searchParams.get("previousSnapshotId");

      if (currentSnapshotId) {
        params.set("currentSnapshotId", currentSnapshotId);
      }

      if (previousSnapshotId) {
        params.set("previousSnapshotId", previousSnapshotId);
      }
    }

    return params.toString();
  }, [page]);

  async function loadComparison() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/radar/snapshots/compare?${queryString}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const json = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          json?.error ||
            "Não foi possível comparar os snapshots."
        );
      }

      setData(json as CompareResponse);
    } catch (comparisonError) {
      setError(
        comparisonError instanceof Error
          ? comparisonError.message
          : "Erro inesperado ao carregar a comparação."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadComparison();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString]);


  return (
    <main style={styles.page}>
      <section style={styles.container}>
        <header style={styles.header}>
          <div>
            <span style={styles.eyebrow}>ZENTRA SALES AI</span>

            <h1 style={styles.title}>Comparação de snapshots</h1>

            <p style={styles.subtitle}>
              Veja quantos clientes novos entraram e quantos permaneceram entre duas importações do Radar.
            </p>
          </div>

          <div style={styles.headerActions}>
            <a
              href="/crm/dashboard/radar/history"
              style={styles.secondaryLink}
            >
              Voltar ao histórico
            </a>

            <a
              href="/crm/dashboard/radar"
              style={styles.primaryLink}
            >
              Voltar ao Radar
            </a>
          </div>
        </header>

        {error && <div style={styles.errorAlert}>{error}</div>}

        {loading && !data && (
          <div style={styles.loadingCard}>Carregando comparação...</div>
        )}

        {data && (
          <>
            <section style={styles.snapshotComparison}>
              <SnapshotCard
                label="Base anterior"
                snapshot={data.previousSnapshot}
              />

              <div style={styles.versus}>VS</div>

              <SnapshotCard
                label="Base atual"
                snapshot={data.currentSnapshot}
                current
              />
            </section>

            <section style={styles.summaryGrid}>
              <SummaryCard
                label="Base anterior"
                value={data.summary.previousTotal}
              />

              <SummaryCard
                label="Base atual"
                value={data.summary.currentTotal}
              />

              <SummaryCard
                label="Novos clientes"
                value={data.summary.added}
                tone="positive"
              />

              <SummaryCard
                label="Permaneceram"
                value={data.summary.unchanged}
              />
            </section>

            <section style={styles.note}>
              <strong>Escopo atual da comparação:</strong>{" "}
              {data.capabilities.note}
            </section>

            <section style={styles.contentCard}>
              <div style={styles.listHeader}>
                <div>
                  <h2 style={styles.listTitle}>Novos clientes encontrados</h2>
                  <p style={styles.listSubtitle}>
                    Clientes presentes na base atual que não existiam na base anterior.
                  </p>
                </div>

                <span style={styles.newCountBadge}>
                  {formatNumber(data.summary.added)} novo(s)
                </span>
              </div>

              {data.addedProspects.length === 0 ? (
                <div style={styles.emptyState}>
                  Nenhum cliente novo nesta comparação.
                </div>
              ) : (
                <div style={styles.tableWrapper}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>ID</th>
                        <th style={styles.th}>Cliente</th>
                        <th style={styles.th}>Cidade / Estado</th>
                        <th style={styles.th}>Segmento</th>
                        <th style={styles.th}>Categoria</th>
                        <th style={styles.th}>Limite</th>
                        <th style={styles.th}>Pagamento</th>
                        <th style={styles.th}>Último pedido</th>
                      </tr>
                    </thead>

                    <tbody>
                      {data.addedProspects.map((prospect) => (
                        <tr key={prospect.id}>
                          <td style={styles.td}>
                            {prospect.externalId || "-"}
                          </td>

                          <td style={styles.tdStrong}>
                            {prospect.name}
                          </td>

                          <td style={styles.td}>
                            {buildLocation(prospect)}
                          </td>

                          <td style={styles.td}>
                            {prospect.segment || "-"}
                          </td>

                          <td style={styles.td}>
                            {prospect.category || "-"}
                          </td>

                          <td style={styles.td}>
                            {formatMoney(prospect.creditLimit)}
                          </td>

                          <td style={styles.td}>
                            {prospect.paymentMethod || "-"}
                          </td>

                          <td style={styles.td}>
                            {formatDate(prospect.lastOrderAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {data.pagination.added.totalPages > 1 && (
                <footer style={styles.pagination}>
                  <button
                    type="button"
                    disabled={page <= 1 || loading}
                    onClick={() =>
                      setPage((current) =>
                        Math.max(1, current - 1)
                      )
                    }
                    style={styles.pageButton}
                  >
                    Anterior
                  </button>

                  <span style={styles.pageInfo}>
                    Página {page} de {data.pagination.added.totalPages}
                  </span>

                  <button
                    type="button"
                    disabled={
                      page >= data.pagination.added.totalPages ||
                      loading
                    }
                    onClick={() =>
                      setPage((current) => current + 1)
                    }
                    style={styles.pageButton}
                  >
                    Próxima
                  </button>
                </footer>
              )}
            </section>
          </>
        )}
      </section>
    </main>
  );
}

function SnapshotCard({
  label,
  snapshot,
  current = false,
}: {
  label: string;
  snapshot: SnapshotInfo;
  current?: boolean;
}) {
  return (
    <article
      style={{
        ...styles.snapshotCard,
        ...(current ? styles.snapshotCardCurrent : {}),
      }}
    >
      <span style={styles.snapshotLabel}>{label}</span>

      <h2 style={styles.snapshotName}>{snapshot.fileName}</h2>

      <p style={styles.snapshotDate}>
        {formatDate(snapshot.createdAt)}
      </p>

      <div style={styles.snapshotMetrics}>
        <div>
          <span style={styles.metricLabel}>Processados</span>
          <strong style={styles.metricValue}>
            {formatNumber(snapshot.processedRows)}
          </strong>
        </div>

        <div>
          <span style={styles.metricLabel}>Válidos</span>
          <strong style={styles.metricValue}>
            {formatNumber(snapshot.validRows)}
          </strong>
        </div>
      </div>

      <p style={styles.snapshotId}>Snapshot: {snapshot.id}</p>
    </article>
  );
}

function SummaryCard({
  label,
  value,
  customValue,
  tone = "neutral",
}: {
  label: string;
  value: number;
  customValue?: string;
  tone?: "positive" | "negative" | "neutral";
}) {
  const toneStyles =
    tone === "positive"
      ? styles.summaryPositive
      : tone === "negative"
        ? styles.summaryNegative
        : styles.summaryNeutral;

  return (
    <article
      style={{
        ...styles.summaryCard,
        ...toneStyles,
      }}
    >
      <span style={styles.summaryLabel}>{label}</span>

      <strong style={styles.summaryValue}>
        {customValue || formatNumber(value)}
      </strong>
    </article>
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
    maxWidth: 1180,
    margin: "0 auto",
  },

  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 24,
    marginBottom: 24,
  },

  headerActions: {
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
    lineHeight: 1.6,
  },

  primaryLink: {
    padding: "11px 16px",
    borderRadius: 12,
    background: "#16a34a",
    color: "#ffffff",
    fontWeight: 800,
    textDecoration: "none",
  },

  secondaryLink: {
    padding: "11px 16px",
    border: "1px solid #bbf7d0",
    borderRadius: 12,
    background: "#ffffff",
    color: "#15803d",
    fontWeight: 800,
    textDecoration: "none",
  },

  errorAlert: {
    marginBottom: 18,
    padding: 14,
    border: "1px solid #fca5a5",
    borderRadius: 12,
    background: "#fee2e2",
    color: "#991b1b",
    fontWeight: 700,
  },

  loadingCard: {
    padding: 32,
    border: "1px solid #dbe5df",
    borderRadius: 16,
    background: "#ffffff",
    textAlign: "center",
    color: "#64748b",
  },

  snapshotComparison: {
    display: "grid",
    gridTemplateColumns: "1fr auto 1fr",
    alignItems: "center",
    gap: 18,
    marginBottom: 20,
  },

  snapshotCard: {
    padding: 22,
    border: "1px solid #dbe5df",
    borderRadius: 18,
    background: "#ffffff",
  },

  snapshotCardCurrent: {
    borderColor: "#86efac",
    background: "#f0fdf4",
  },

  snapshotLabel: {
    display: "inline-block",
    color: "#64748b",
    fontSize: 12,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },

  snapshotName: {
    margin: "10px 0 0",
    fontSize: 21,
  },

  snapshotDate: {
    margin: "6px 0 0",
    color: "#64748b",
    fontSize: 13,
  },

  snapshotMetrics: {
    display: "flex",
    gap: 28,
    marginTop: 18,
  },

  snapshotId: {
    margin: "18px 0 0",
    color: "#94a3b8",
    fontSize: 11,
    wordBreak: "break-word",
  },

  versus: {
    width: 44,
    height: 44,
    display: "grid",
    placeItems: "center",
    borderRadius: 999,
    background: "#172033",
    color: "#ffffff",
    fontSize: 12,
    fontWeight: 900,
  },

  summaryGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 12,
    marginBottom: 18,
  },

  summaryCard: {
    padding: 18,
    border: "1px solid",
    borderRadius: 16,
  },

  summaryNeutral: {
    borderColor: "#dbe5df",
    background: "#ffffff",
  },

  summaryPositive: {
    borderColor: "#86efac",
    background: "#f0fdf4",
  },

  summaryNegative: {
    borderColor: "#fca5a5",
    background: "#fff1f2",
  },

  summaryLabel: {
    display: "block",
    color: "#64748b",
    fontSize: 12,
    fontWeight: 800,
  },

  summaryValue: {
    display: "block",
    marginTop: 7,
    fontSize: 28,
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
    fontSize: 24,
  },

  note: {
    marginBottom: 18,
    padding: "14px 16px",
    border: "1px solid #bfdbfe",
    borderRadius: 14,
    background: "#eff6ff",
    color: "#1e40af",
    fontSize: 13,
    lineHeight: 1.55,
  },

  contentCard: {
    padding: 22,
    border: "1px solid #dbe5df",
    borderRadius: 18,
    background: "#ffffff",
  },



  listHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "center",
    marginBottom: 18,
    flexWrap: "wrap",
  },

  listTitle: {
    margin: 0,
    fontSize: 20,
    color: "#172033",
  },

  listSubtitle: {
    margin: "6px 0 0",
    color: "#64748b",
    fontSize: 13,
  },

  newCountBadge: {
    padding: "8px 12px",
    borderRadius: 999,
    background: "#dcfce7",
    color: "#166534",
    fontSize: 12,
    fontWeight: 900,
  },

  tabs: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    marginBottom: 18,
  },

  tabButton: {
    padding: "10px 14px",
    border: "1px solid #cbd5e1",
    borderRadius: 10,
    background: "#ffffff",
    color: "#475569",
    fontWeight: 800,
    cursor: "pointer",
  },

  tabButtonActive: {
    borderColor: "#16a34a",
    background: "#16a34a",
    color: "#ffffff",
  },

  emptyState: {
    padding: 30,
    border: "1px dashed #cbd5e1",
    borderRadius: 14,
    background: "#f8fafc",
    color: "#64748b",
    textAlign: "center",
  },

  tableWrapper: {
    overflowX: "auto",
  },

  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: 900,
  },

  th: {
    padding: "12px 10px",
    borderBottom: "1px solid #e2e8f0",
    color: "#64748b",
    fontSize: 12,
    textAlign: "left",
  },

  td: {
    padding: "13px 10px",
    borderBottom: "1px solid #f1f5f9",
    color: "#475569",
    fontSize: 13,
  },

  tdStrong: {
    padding: "13px 10px",
    borderBottom: "1px solid #f1f5f9",
    color: "#172033",
    fontSize: 13,
    fontWeight: 800,
  },

  pagination: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    marginTop: 20,
  },

  pageButton: {
    padding: "10px 14px",
    border: "1px solid #cbd5e1",
    borderRadius: 10,
    background: "#ffffff",
    cursor: "pointer",
  },

  pageInfo: {
    color: "#475569",
    fontSize: 13,
    fontWeight: 700,
  },
};
