"use client";

import { useMemo, useState } from "react";

type Prospect = {
  id: string;
  externalId?: string | null;
  name: string;
  city?: string | null;
  state?: string | null;
  segment?: string | null;
  category?: string | null;
  productInterest?: string | null;
  email?: string | null;
  phone1?: string | null;
  phone2?: string | null;
  contactMasked?: string | null;
  emailMasked?: string | null;
  lastTransferAt?: string | null;
  lastActivationAt?: string | null;
  lastOrderAt?: string | null;
  creditLimit?: number | null;
  paymentMethod?: string | null;
  revealed?: boolean;
};

type Usage = {
  used: number;
  limit: number;
  remaining: number;
  month?: string;
};

const styles = {
  page: {
    padding: 24,
    color: "#0f172a",
    background: "#f6f8fb",
    minHeight: "100vh",
  },
  hero: {
    display: "flex",
    justifyContent: "space-between",
    gap: 18,
    alignItems: "center",
    marginBottom: 18,
    padding: "22px 24px",
    borderRadius: 0,
    background: "#ffffff",
    border: "1px solid #edf1f7",
    boxShadow: "0 8px 24px rgba(15,23,42,.04)",
  },
  heroBrand: {
    display: "flex",
    alignItems: "center",
    gap: 14,
  },
  logoMark: {
    width: 46,
    height: 46,
    minWidth: 46,
    borderRadius: 16,
    display: "grid",
    placeItems: "center",
    color: "#ffffff",
    fontSize: 13,
    fontWeight: 950,
    background: "linear-gradient(135deg,#147a3d,#16a34a 55%,#dc2626)",
    boxShadow: "0 12px 24px rgba(22,163,74,.18)",
  },
  kicker: {
    margin: 0,
    color: "#14843f",
    fontWeight: 950,
    fontSize: 12,
    letterSpacing: ".16em",
    textTransform: "uppercase" as const,
  },
  title: {
    margin: "4px 0 6px",
    fontSize: 32,
    lineHeight: 1,
    letterSpacing: "-.045em",
    fontWeight: 950,
    color: "#0f172a",
  },
  subtitle: {
    margin: 0,
    maxWidth: 840,
    color: "#64748b",
    lineHeight: 1.55,
    fontWeight: 650,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
    gap: 14,
    marginBottom: 18,
  },
  card: {
    background: "#fff",
    border: "1px solid rgba(22,163,74,.12)",
    borderRadius: 20,
    padding: 18,
    boxShadow: "0 12px 30px rgba(15,23,42,.045)",
  },
  metricCard: {
    background: "linear-gradient(180deg,#ffffff,#fbfffd)",
    border: "1px solid rgba(22,163,74,.14)",
    borderRadius: 20,
    padding: 18,
    boxShadow: "0 10px 26px rgba(15,23,42,.045)",
  },
  sectionTitle: {
    margin: "0 0 14px",
    fontSize: 18,
    fontWeight: 950,
    letterSpacing: "-.025em",
    color: "#020617",
  },
  input: {
    width: "100%",
    border: "1px solid #dce6f1",
    background: "#fff",
    padding: "12px 14px",
    borderRadius: 14,
    outline: "none",
    fontWeight: 750,
    color: "#0f172a",
    boxShadow: "inset 0 1px 0 rgba(15,23,42,.02)",
  },
  label: {
    display: "block",
    fontSize: 12,
    color: "#475569",
    fontWeight: 950,
    marginBottom: 6,
  },
  primary: {
    border: "1px solid rgba(22,163,74,.18)",
    color: "#fff",
    background: "linear-gradient(135deg,#16a34a,#14843f)",
    padding: "12px 18px",
    borderRadius: 14,
    fontWeight: 950,
    cursor: "pointer",
    boxShadow: "0 12px 24px rgba(22,163,74,.22)",
  },
  secondary: {
    border: "1px solid rgba(22,163,74,.22)",
    color: "#14843f",
    background: "#fff",
    padding: "11px 16px",
    borderRadius: 14,
    fontWeight: 950,
    cursor: "pointer",
    boxShadow: "0 8px 20px rgba(15,23,42,.035)",
  },
  ghostButton: {
    border: "1px solid #e2e8f0",
    color: "#334155",
    background: "#fff",
    padding: "11px 16px",
    borderRadius: 14,
    fontWeight: 950,
    cursor: "pointer",
  },
  tableWrap: {
    overflowX: "auto" as const,
    background: "#fff",
    border: "1px solid rgba(22,163,74,.12)",
    borderRadius: 20,
    boxShadow: "0 12px 30px rgba(15,23,42,.045)",
  },
  table: {
    width: "100%",
    borderCollapse: "separate" as const,
    borderSpacing: 0,
    minWidth: 1280,
  },
  th: {
    textAlign: "left" as const,
    padding: "13px 12px",
    fontSize: 12,
    color: "#475569",
    borderBottom: "1px solid #e2e8f0",
    background: "#f8fbf9",
    fontWeight: 950,
    whiteSpace: "nowrap" as const,
  },
  td: {
    padding: "13px 12px",
    borderBottom: "1px solid #eef2f7",
    fontSize: 13,
    fontWeight: 700,
    color: "#334155",
    whiteSpace: "nowrap" as const,
    background: "#fff",
  },
  badge: {
    display: "inline-flex",
    padding: "6px 10px",
    borderRadius: 999,
    background: "#ecfdf3",
    color: "#14843f",
    fontSize: 12,
    fontWeight: 950,
    border: "1px solid rgba(22,163,74,.14)",
  },
} as const;

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: any;
  hint?: string;
}) {
  return (
    <div style={styles.metricCard}>
      <div style={{ color: "#64748b", fontSize: 12, fontWeight: 950 }}>
        {label}
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: 30,
          fontWeight: 950,
          letterSpacing: "-.045em",
          color: "#0f172a",
        }}
      >
        {value}
      </div>
      {hint ? (
        <div
          style={{
            marginTop: 4,
            color: "#64748b",
            fontSize: 12,
            fontWeight: 750,
          }}
        >
          {hint}
        </div>
      ) : null}
    </div>
  );
}


function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("pt-BR");
}

function formatMoney(value?: number | null) {
  if (value === null || value === undefined) return "-";
  return Number(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function getContact(p: Prospect) {
  return p.phone1 || p.contactMasked || "Oculto";
}

function getEmail(p: Prospect) {
  return p.email || p.emailMasked || "Oculto";
}

function SortButton({
  label,
  field,
  sortBy,
  sortDir,
  onSort,
}: {
  label: string;
  field: string;
  sortBy: string;
  sortDir: string;
  onSort: (field: string) => void;
}) {
  const active = sortBy === field;

  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      style={{
        border: 0,
        background: "transparent",
        padding: 0,
        color: active ? "#14843f" : "#64748b",
        fontWeight: 950,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
      title="Ordenar como Excel"
    >
      {label} {active ? (sortDir === "asc" ? "A-Z ↑" : "Z-A ↓") : "↕"}
    </button>
  );
}

export default function RadarPage() {
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [name, setName] = useState("");
  const [externalId, setExternalId] = useState("");
  const [segment, setSegment] = useState("");
  const [category, setCategory] = useState("");
  const [product, setProduct] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [view, setView] = useState("NEW");
  const [limit, setLimit] = useState(100);
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortDir, setSortDir] = useState("desc");

  const [loading, setLoading] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [usage, setUsage] = useState<Usage>({ used: 0, limit: 0, remaining: 0 });
  const [message, setMessage] = useState("");

  const selectedProspects = useMemo(
    () => prospects.filter((p) => selected.includes(p.id)),
    [prospects, selected]
  );

  const visualized = prospects.filter((p) => p.revealed).length;
  const notVisualized = prospects.filter((p) => !p.revealed).length;

  function toggleSort(field: string) {
    if (sortBy === field) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortBy(field);
    setSortDir("asc");
  }

  async function search() {
    setLoading(true);
    setMessage("");

    try {
      const params = new URLSearchParams({
        city,
        state,
        name,
        externalId,
        segment,
        category,
        product,
        paymentMethod,
        view,
        limit: String(limit),
        sortBy,
        sortDir,
      });

      const response = await fetch(`/api/radar/search?${params.toString()}`, {
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Erro ao buscar oportunidades.");
      }

      setProspects(data.prospects || []);
      setUsage(data.usage || { used: 0, limit: 0, remaining: 0 });
      setSelected([]);
    } catch (error: any) {
      setMessage(error?.message || "Erro ao buscar oportunidades.");
    } finally {
      setLoading(false);
    }
  }

  async function revealSelected() {
    if (!selected.length) return;

    setRevealing(true);
    setMessage("");

    try {
      const response = await fetch("/api/radar/reveal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ ids: selected }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Erro ao visualizar contatos.");
      }

      const revealedMap = new Map<string, Prospect>(
        (data.revealed || []).map((item: Prospect) => [item.id, item])
      );

      setProspects((current) =>
        current.map((item) => revealedMap.get(item.id) || item)
      );

      setUsage(data.usage || usage);
      setSelected([]);
      setMessage("Contato(s) visualizado(s) com sucesso.");
    } catch (error: any) {
      setMessage(error?.message || "Erro ao visualizar contatos.");
    } finally {
      setRevealing(false);
    }
  }

  async function copyText(text: string) {
    await navigator.clipboard.writeText(text);
    setMessage("Copiado para a área de transferência.");
  }

  function copyContact(p: Prospect) {
    if (!p.revealed || !p.phone1) {
      setMessage("Visualize o contato antes de copiar.");
      return;
    }

    copyText(`${p.name}, ${p.phone1}`);
  }

  function copySelectedForCampaign() {
    const rows = selectedProspects
      .filter((p) => p.revealed && p.phone1)
      .map((p) => `${p.name}, ${p.phone1}`)
      .join("\n");

    if (!rows) {
      setMessage("Selecione contatos já visualizados para copiar.");
      return;
    }

    copyText(rows);
  }

  function exportCsv() {
    const header = [
      "ID Cliente",
      "Empresa",
      "Cidade",
      "Segmento",
      "Contato",
      "E-mail",
      "Último Pedido",
      "Limite Prazo",
      "Forma Pagamento",
      "Status",
    ];

    const rows = prospects.map((p) => [
      p.externalId || "",
      p.name,
      p.city || "",
      p.segment || "",
      p.revealed ? p.phone1 || "" : "Oculto",
      p.revealed ? p.email || "" : "Oculto",
      formatDate(p.lastOrderAt),
      p.creditLimit ?? "",
      p.paymentMethod || "",
      p.revealed ? "Visualizado" : "Não visualizado",
    ]);

    const csv = [header, ...rows]
      .map((row) =>
        row
          .map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
          .join(";")
      )
      .join("\n");

    const blob = new Blob(["\ufeff" + csv], {
      type: "text/csv;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "radar-comercial.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main style={styles.page}>
      <div style={styles.hero}>
        <div style={styles.heroBrand}>
          <div style={styles.logoMark}>PMG</div>
          <div>
            <p style={styles.kicker}>Zentra Sales AI</p>
            <h1 style={styles.title}>Radar Comercial</h1>
            <p style={styles.subtitle}>
              Encontre clientes da base comercial, visualize contatos sob demanda
              e filtre informações como no Excel.
            </p>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button
            style={styles.secondary}
            onClick={() => {
              window.location.href = "/crm/dashboard/radar/upload";
            }}
          >
            Importar base
          </button>

          <button style={styles.primary} onClick={search} disabled={loading}>
            {loading ? "Buscando..." : "Buscar oportunidades"}
          </button>
        </div>
      </div>

      <section style={styles.grid}>
        <Metric
          label="Encontrados"
          value={prospects.length}
          hint={`${prospects.length} no resultado`}
        />
        <Metric label="Visualizados" value={visualized} />
        <Metric label="Não visualizados" value={notVisualized} />
        <Metric
          label="Limite mensal"
          value={usage.remaining}
          hint={`${usage.used} usados de ${usage.limit}`}
        />
      </section>

      <section style={{ ...styles.card, marginBottom: 16 }}>
        <h2 style={styles.sectionTitle}>Filtros comerciais</h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5,minmax(130px,1fr))",
            gap: 10,
          }}
        >
          <div>
            <label style={styles.label}>ID Cliente</label>
            <input
              style={styles.input}
              value={externalId}
              onChange={(e) => setExternalId(e.target.value)}
              placeholder="174998"
            />
          </div>

          <div>
            <label style={styles.label}>Empresa</label>
            <input
              style={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome do cliente"
            />
          </div>

          <div>
            <label style={styles.label}>Cidade / Zona</label>
            <input
              style={styles.input}
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="AMPARO"
            />
          </div>

          <div>
            <label style={styles.label}>Estado</label>
            <input
              style={styles.input}
              value={state}
              onChange={(e) => setState(e.target.value)}
              placeholder="SP"
            />
          </div>

          <div>
            <label style={styles.label}>Forma pagamento</label>
            <input
              style={styles.input}
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              placeholder="Boleto 21 dias"
            />
          </div>

          <div>
            <label style={styles.label}>Segmento</label>
            <input
              style={styles.input}
              value={segment}
              onChange={(e) => setSegment(e.target.value)}
              placeholder="Mercado, padaria..."
            />
          </div>

          <div>
            <label style={styles.label}>Categoria</label>
            <input
              style={styles.input}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Alimentos, bebidas..."
            />
          </div>

          <div>
            <label style={styles.label}>Produto</label>
            <input
              style={styles.input}
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              placeholder="Muçarela, requeijão..."
            />
          </div>

          <div>
            <label style={styles.label}>Status</label>
            <select
              style={styles.input}
              value={view}
              onChange={(e) => setView(e.target.value)}
            >
              <option value="NEW">Não visualizados</option>
              <option value="REVEALED">Visualizados</option>
              <option value="ALL">Todos</option>
            </select>
          </div>

          <div>
            <label style={styles.label}>Quantidade</label>
            <input
              style={styles.input}
              type="number"
              min={1}
              max={500}
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
          <button style={styles.primary} onClick={search} disabled={loading}>
            {loading ? "Buscando..." : "Buscar"}
          </button>

          <button
            style={styles.secondary}
            onClick={revealSelected}
            disabled={!selected.length || revealing}
          >
            {revealing
              ? "Visualizando..."
              : `Visualizar selecionados (${selected.length})`}
          </button>

          <button style={styles.secondary} onClick={copySelectedForCampaign}>
            Copiar selecionados
          </button>

          <button style={styles.secondary} onClick={exportCsv}>
            Exportar CSV
          </button>
        </div>

        {message ? (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 16,
              background: "#f0fdf4",
              border: "1px solid rgba(22,163,74,.18)",
              color: "#166534",
              fontWeight: 800,
            }}
          >
            {message}
          </div>
        ) : null}
      </section>

      <section style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>
                <input
                  type="checkbox"
                  checked={!!prospects.length && selected.length === prospects.length}
                  onChange={(e) =>
                    setSelected(e.target.checked ? prospects.map((p) => p.id) : [])
                  }
                />
              </th>

              <th style={styles.th}>
                <SortButton
                  label="ID"
                  field="externalId"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
              </th>

              <th style={styles.th}>
                <SortButton
                  label="Empresa / Cliente"
                  field="name"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
              </th>

              <th style={styles.th}>
                <SortButton
                  label="Cidade"
                  field="city"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
              </th>

              <th style={styles.th}>Segmento</th>
              <th style={styles.th}>Contato</th>
              <th style={styles.th}>E-mail</th>

              <th style={styles.th}>
                <SortButton
                  label="Último pedido"
                  field="lastOrderAt"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
              </th>

              <th style={styles.th}>
                <SortButton
                  label="Limite prazo"
                  field="creditLimit"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
              </th>

              <th style={styles.th}>
                <SortButton
                  label="Forma pagto."
                  field="paymentMethod"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
              </th>

              <th style={styles.th}>Status</th>
              <th style={styles.th}>Ações</th>
            </tr>
          </thead>

          <tbody>
            {!prospects.length ? (
              <tr>
                <td style={styles.td} colSpan={12}>
                  Use os filtros para encontrar oportunidades.
                </td>
              </tr>
            ) : (
              prospects.map((p) => (
                <tr key={p.id}>
                  <td style={styles.td}>
                    <input
                      type="checkbox"
                      checked={selected.includes(p.id)}
                      onChange={(e) =>
                        setSelected((current) =>
                          e.target.checked
                            ? [...current, p.id]
                            : current.filter((id) => id !== p.id)
                        )
                      }
                    />
                  </td>

                  <td style={styles.td}>{p.externalId || "-"}</td>
                  <td style={styles.td}>
                    <div style={{ fontWeight: 950 }}>{p.name}</div>
                    <div style={{ color: "#94a3b8", fontSize: 12 }}>
                      {p.category || "-"}
                    </div>
                  </td>
                  <td style={styles.td}>{p.city || "-"}</td>
                  <td style={styles.td}>{p.segment || "-"}</td>
                  <td style={styles.td}>{getContact(p)}</td>
                  <td style={styles.td}>{getEmail(p)}</td>
                  <td style={styles.td}>{formatDate(p.lastOrderAt)}</td>
                  <td style={styles.td}>{formatMoney(p.creditLimit)}</td>
                  <td style={styles.td}>{p.paymentMethod || "-"}</td>
                  <td style={styles.td}>
                    <span style={styles.badge}>
                      {p.revealed ? "Visualizado" : "Não visualizado"}
                    </span>
                  </td>
                  <td style={styles.td}>
                    <button
                      type="button"
                      style={{
                        ...styles.secondary,
                        padding: "8px 10px",
                        borderRadius: 12,
                      }}
                      onClick={() => copyContact(p)}
                    >
                      Copiar contato
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
