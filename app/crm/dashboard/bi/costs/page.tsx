"use client";

import { useEffect, useState } from "react";

function formatMoney(value: any) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default function CostsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    title: "",
    category: "divulgacao",
    amount: "",
    notes: "",
  });

  async function loadCosts() {
    setLoading(true);

    try {
      const res = await fetch("/api/bi/costs", {
        cache: "no-store",
        credentials: "include",
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setItems(data.costs || []);
        setSummary(data.summary || {});
      }
    } finally {
      setLoading(false);
    }
  }

  async function saveCost() {
    if (!form.title.trim()) {
      alert("Informe o título do custo.");
      return;
    }

    setSaving(true);

    try {
      const res = await fetch("/api/bi/costs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(form),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        alert(data.error || "Erro ao salvar custo.");
        return;
      }

      setForm({ title: "", category: "divulgacao", amount: "", notes: "" });
      await loadCosts();
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    loadCosts();
  }, []);

  return (
    <main style={styles.page}>
      <section style={styles.hero}>
        <div>
          <p style={styles.kicker}>Zentra RH</p>
          <h1 style={styles.title}>Custos de Recrutamento</h1>
          <p style={styles.subtitle}>
            Controle custos por vaga, campanha, divulgação e contratação.
          </p>
        </div>

        <button style={styles.primaryButton} onClick={loadCosts}>Atualizar</button>
      </section>

      <section style={styles.statsGrid}>
        <div style={styles.metric}>
          <span>Total investido</span>
          <strong>{formatMoney(summary.total)}</strong>
        </div>
        <div style={styles.metric}>
          <span>Lançamentos</span>
          <strong>{summary.count || 0}</strong>
        </div>
      </section>

      <section style={styles.card}>
        <h2 style={styles.sectionTitle}>Novo custo</h2>

        <div style={styles.formGrid}>
          <input style={styles.input} placeholder="Título. Ex: Anúncio vaga vendedor" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <select style={styles.input} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            <option value="divulgacao">Divulgação</option>
            <option value="campanha">Campanha WhatsApp</option>
            <option value="anuncio">Anúncio pago</option>
            <option value="plataforma">Plataforma</option>
            <option value="outros">Outros</option>
          </select>
          <input style={styles.input} placeholder="Valor" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <input style={styles.input} placeholder="Observações" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>

        <button style={styles.primaryButton} onClick={saveCost} disabled={saving}>
          {saving ? "Salvando..." : "Salvar custo"}
        </button>
      </section>

      <section style={styles.card}>
        <h2 style={styles.sectionTitle}>Histórico</h2>

        {loading && <p>Carregando...</p>}
        {!loading && !items.length && <div style={styles.empty}>Nenhum custo lançado.</div>}

        <div style={styles.list}>
          {items.map((item) => (
            <div key={item.id} style={styles.row}>
              <div>
                <strong>{item.title}</strong>
                <p>{item.category} • {item.notes || "-"}</p>
              </div>
              <strong>{formatMoney(item.amount)}</strong>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", padding: 20, background: "linear-gradient(135deg, #eff6ff, #ffffff, #dbeafe)", color: "#0f172a" },
  hero: { background: "#fff", border: "1px solid #bfdbfe", borderRadius: 28, padding: 24, display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", boxShadow: "0 18px 50px rgba(37,99,235,.08)" },
  kicker: { margin: 0, color: "#2563eb", fontWeight: 950, letterSpacing: ".22em", fontSize: 12, textTransform: "uppercase" },
  title: { margin: "8px 0", fontSize: 36, fontWeight: 950 },
  subtitle: { margin: 0, color: "#64748b", fontSize: 14 },
  primaryButton: { border: 0, borderRadius: 16, padding: "13px 18px", background: "linear-gradient(135deg, #38bdf8, #2563eb)", color: "#fff", fontWeight: 950, cursor: "pointer" },
  statsGrid: { marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 },
  metric: { background: "#fff", border: "1px solid #bfdbfe", borderRadius: 20, padding: 16, display: "grid", gap: 8 },
  card: { marginTop: 18, background: "#fff", border: "1px solid #bfdbfe", borderRadius: 28, padding: 22, boxShadow: "0 18px 50px rgba(37,99,235,.06)" },
  sectionTitle: { margin: 0, fontSize: 22, fontWeight: 950 },
  formGrid: { marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 },
  input: { width: "100%", boxSizing: "border-box", borderRadius: 16, border: "1px solid #bfdbfe", background: "#f8fafc", padding: "13px 14px", outline: "none", fontSize: 14, color: "#0f172a" },
  empty: { marginTop: 16, border: "1px dashed #93c5fd", borderRadius: 20, padding: 24, textAlign: "center", color: "#64748b" },
  list: { marginTop: 16, display: "grid", gap: 10 },
  row: { border: "1px solid #dbeafe", background: "#f8fafc", borderRadius: 18, padding: 14, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" },
};
