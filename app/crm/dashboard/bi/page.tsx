"use client";

import { useEffect, useMemo, useState } from "react";

function formatMoney(value: any) {
  const number = Number(value || 0);
  return number.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function percent(value: any) {
  const number = Number(value || 0);
  return `${number.toFixed(1)}%`;
}

function statusName(status: string) {
  const map: Record<string, string> = {
    novo: "Novo",
    enviado: "Enviado",
    respondeu: "Respondeu",
    quer_agendar_entrevista: "Quer cotação",
    entrevista_agendada: "Negociação agendada",
    confirmed: "Confirmada",
    approved: "Venda aprovada",
    rejected: "Perdido",
    no_show: "Sem retorno",
    pending_documents: "Pendência comercial",
    documents_review: "Docs em análise",
    documents_approved: "Docs aprovados",
    hired: "Contrato ativo",
    finished: "Finalizado",
    terminated: "Rescindido",
  };

  return map[status] || status || "-";
}

export default function BiPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("30");

  async function loadBI() {
    setLoading(true);

    try {
      const res = await fetch(`/api/bi/overview?period=${period}`, {
        cache: "no-store",
        credentials: "include",
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        alert(json.error || "Erro ao carregar BI.");
        return;
      }

      setData(json);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBI();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const funnel = useMemo(() => data?.funnel || [], [data]);
  const maxFunnel = Math.max(...funnel.map((item: any) => Number(item.value || 0)), 1);

  return (
    <main style={styles.page}>
      <section style={styles.hero}>
        <div>
          <p style={styles.kicker}>Zentra RH</p>
          <h1 style={styles.title}>BI Comercial Inteligente</h1>
          <p style={styles.subtitle}>
            Visão executiva de clientes, campanhas, WhatsApp, pedidos, cotações, metas e oportunidades comerciais.
          </p>
        </div>

        <div style={styles.heroActions}>
          <select style={styles.select} value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="7">Últimos 7 dias</option>
            <option value="30">Últimos 30 dias</option>
            <option value="90">Últimos 90 dias</option>
            <option value="365">Últimos 12 meses</option>
          </select>

          <button style={styles.primaryButton} onClick={loadBI}>
            Atualizar
          </button>
        </div>
      </section>

      {loading && <div style={styles.empty}>Carregando indicadores...</div>}

      {!loading && data && (
        <>
          <section style={styles.statsGrid}>
            <Metric icon="👥" label="Clientes" value={data.metrics?.candidates || 0} />
            <Metric icon="💼" label="Oportunidades abertas" value={data.metrics?.openJobs || 0} />
            <Metric icon="📅" label="Negociações" value={data.metrics?.interviews || 0} />
            <Metric icon="✅" label="Confirmadas" value={data.metrics?.confirmedInterviews || 0} />
            <Metric icon="🎯" label="Aprovados" value={data.metrics?.approved || 0} />
            <Metric icon="❌" label="Reprovados" value={data.metrics?.rejected || 0} />
            <Metric icon="🚫" label="Não compareceu" value={data.metrics?.noShow || 0} />
            <Metric icon="📑" label="Admissões" value={data.metrics?.hirings || 0} />
            <Metric icon="⏳" label="Docs pendentes" value={data.metrics?.pendingDocs || 0} />
            <Metric icon="⚠️" label="Docs atrasados" value={data.metrics?.lateDocs || 0} />
            <Metric icon="📋" label="Contratos ativos" value={data.metrics?.activeContracts || 0} />
            <Metric icon="⏰" label="Contratos vencendo" value={data.metrics?.endingContracts || 0} />
          </section>

          <section style={styles.gridTwo}>
            <div style={styles.card}>
              <div style={styles.cardHeader}>
                <div>
                  <h2 style={styles.sectionTitle}>Funil RH</h2>
                  <p style={styles.smallText}>Da captação até admissão.</p>
                </div>
                <span style={styles.badge}>Conversão: {percent(data.metrics?.conversionRate || 0)}</span>
              </div>

              <div style={styles.funnel}>
                {funnel.map((item: any) => (
                  <div key={item.label} style={styles.funnelRow}>
                    <div style={styles.funnelTop}>
                      <strong>{item.label}</strong>
                      <span>{item.value}</span>
                    </div>
                    <div style={styles.bar}>
                      <div style={{ ...styles.barFill, width: `${Math.max(4, (Number(item.value || 0) / maxFunnel) * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={styles.card}>
              <div style={styles.cardHeader}>
                <div>
                  <h2 style={styles.sectionTitle}>WhatsApp e Campanhas</h2>
                  <p style={styles.smallText}>Volume e resposta do CRM.</p>
                </div>
              </div>

              <div style={styles.miniGrid}>
                <Metric compact icon="📤" label="Enviadas" value={data.whatsapp?.sent || 0} />
                <Metric compact icon="📥" label="Recebidas" value={data.whatsapp?.received || 0} />
                <Metric compact icon="💬" label="Taxa resposta" value={percent(data.whatsapp?.responseRate || 0)} />
                <Metric compact icon="🚀" label="Fila pendente" value={data.whatsapp?.queuePending || 0} />
                <Metric compact icon="⏸️" label="IA pausada" value={data.whatsapp?.paused || 0} />
                <Metric compact icon="📭" label="Sem resposta" value={data.whatsapp?.noResponse || 0} />
              </div>
            </div>
          </section>

          <section style={styles.gridThree}>
            <ListCard
              title="Top oportunidades"
              subtitle="Oportunidades com maior movimento."
              rows={(data.topJobs || []).map((item: any) => ({
                left: item.title || "Vaga",
                right: `${item.total || 0}`,
                meta: `${item.approved || 0} aprovados • ${item.hired || 0} admitidos`,
              }))}
            />

            <ListCard
              title="Documentos"
              subtitle="Situação da documentação admissional."
              rows={(data.documents || []).map((item: any) => ({
                left: statusName(item.status),
                right: `${item.total || 0}`,
                meta: item.status === "expired" ? "Atrasados" : "Checklist admissional",
              }))}
            />

            <ListCard
              title="Contratos"
              subtitle="Gestão de vínculo e vencimentos."
              rows={(data.contracts || []).map((item: any) => ({
                left: statusName(item.status),
                right: `${item.total || 0}`,
                meta: item.status === "hired" ? "Ativos" : "Status contratual",
              }))}
            />
          </section>

          <section style={styles.gridTwo}>
            <div style={styles.card}>
              <h2 style={styles.sectionTitle}>Indicadores de eficiência</h2>
              <div style={styles.miniGrid}>
                <Metric compact icon="📈" label="Comparecimento" value={percent(data.efficiency?.attendanceRate || 0)} />
                <Metric compact icon="🎯" label="Aprovação" value={percent(data.efficiency?.approvalRate || 0)} />
                <Metric compact icon="📑" label="Admissão" value={percent(data.efficiency?.hiringRate || 0)} />
                <Metric compact icon="⏱️" label="Tempo médio" value={`${data.efficiency?.avgDaysToHire || 0} dias`} />
              </div>
            </div>

            <div style={styles.card}>
              <h2 style={styles.sectionTitle}>Alertas inteligentes</h2>

              <div style={styles.alertList}>
                {(data.alerts || []).length === 0 && (
                  <div style={styles.emptySmall}>Nenhum alerta crítico agora.</div>
                )}

                {(data.alerts || []).map((alert: any, index: number) => (
                  <div key={index} style={styles.alertItem}>
                    <span>{alert.icon || "⚠️"}</span>
                    <div>
                      <strong>{alert.title}</strong>
                      <p>{alert.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </>
      )}
    </main>
  );
}

function Metric({ icon, label, value, compact }: { icon: string; label: string; value: any; compact?: boolean }) {
  return (
    <div style={compact ? styles.metricCompact : styles.metric}>
      <span style={styles.metricIcon}>{icon}</span>
      <div>
        <span style={styles.metricLabel}>{label}</span>
        <strong style={styles.metricValue}>{value}</strong>
      </div>
    </div>
  );
}

function ListCard({ title, subtitle, rows }: { title: string; subtitle: string; rows: any[] }) {
  return (
    <div style={styles.card}>
      <h2 style={styles.sectionTitle}>{title}</h2>
      <p style={styles.smallText}>{subtitle}</p>

      <div style={styles.list}>
        {!rows.length && <div style={styles.emptySmall}>Sem dados ainda.</div>}

        {rows.map((row, index) => (
          <div key={index} style={styles.listRow}>
            <div>
              <strong>{row.left}</strong>
              <p>{row.meta}</p>
            </div>
            <span>{row.right}</span>
          </div>
        ))}
      </div>
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
    fontWeight: 950,
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
  heroActions: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap",
  },
  select: {
    border: "1px solid #bfdbfe",
    borderRadius: 16,
    padding: "12px 14px",
    background: "#f8fafc",
    color: "#0f172a",
    fontWeight: 850,
  },
  primaryButton: {
    border: 0,
    borderRadius: 16,
    padding: "13px 18px",
    background: "linear-gradient(135deg, #38bdf8, #2563eb)",
    color: "#fff",
    fontWeight: 950,
    cursor: "pointer",
    boxShadow: "0 12px 24px rgba(37,99,235,.20)",
  },
  statsGrid: {
    marginTop: 16,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
    gap: 12,
  },
  metric: {
    background: "#fff",
    border: "1px solid #bfdbfe",
    borderRadius: 22,
    padding: 16,
    display: "flex",
    alignItems: "center",
    gap: 12,
    boxShadow: "0 12px 30px rgba(37,99,235,.05)",
  },
  metricCompact: {
    background: "#f8fafc",
    border: "1px solid #dbeafe",
    borderRadius: 20,
    padding: 14,
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  metricIcon: {
    width: 42,
    height: 42,
    borderRadius: 16,
    display: "grid",
    placeItems: "center",
    background: "#dbeafe",
    fontSize: 20,
  },
  metricLabel: {
    display: "block",
    color: "#64748b",
    fontSize: 12,
    fontWeight: 800,
  },
  metricValue: {
    display: "block",
    fontSize: 22,
    fontWeight: 950,
    marginTop: 2,
  },
  gridTwo: {
    marginTop: 18,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: 18,
  },
  gridThree: {
    marginTop: 18,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: 18,
  },
  card: {
    background: "#fff",
    border: "1px solid #bfdbfe",
    borderRadius: 28,
    padding: 22,
    boxShadow: "0 18px 50px rgba(37,99,235,.06)",
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "start",
    flexWrap: "wrap",
  },
  sectionTitle: {
    margin: 0,
    fontSize: 22,
    fontWeight: 950,
  },
  smallText: {
    margin: "4px 0 0",
    color: "#64748b",
    fontSize: 12,
  },
  badge: {
    border: "1px solid #bfdbfe",
    background: "#eff6ff",
    color: "#1d4ed8",
    borderRadius: 999,
    padding: "7px 11px",
    fontSize: 12,
    fontWeight: 950,
  },
  funnel: {
    marginTop: 16,
    display: "grid",
    gap: 14,
  },
  funnelRow: {
    display: "grid",
    gap: 7,
  },
  funnelTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 8,
    fontSize: 14,
  },
  bar: {
    height: 12,
    borderRadius: 999,
    background: "#dbeafe",
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 999,
    background: "linear-gradient(135deg, #38bdf8, #2563eb)",
  },
  miniGrid: {
    marginTop: 14,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 10,
  },
  list: {
    marginTop: 14,
    display: "grid",
    gap: 10,
  },
  listRow: {
    border: "1px solid #dbeafe",
    background: "#f8fafc",
    borderRadius: 18,
    padding: 13,
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
  },
  alertList: {
    marginTop: 14,
    display: "grid",
    gap: 10,
  },
  alertItem: {
    border: "1px solid #fed7aa",
    background: "#fff7ed",
    borderRadius: 18,
    padding: 13,
    display: "flex",
    gap: 10,
    alignItems: "start",
    color: "#9a3412",
  },
  empty: {
    marginTop: 18,
    border: "1px dashed #93c5fd",
    borderRadius: 22,
    padding: 24,
    color: "#64748b",
    textAlign: "center",
    background: "#fff",
  },
  emptySmall: {
    border: "1px dashed #bfdbfe",
    borderRadius: 18,
    padding: 16,
    color: "#64748b",
    textAlign: "center",
    background: "#f8fafc",
  },
};
