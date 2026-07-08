"use client";

export default function BiIngredientsLegacyPage() {
  return (
    <main style={{
      minHeight: "100vh",
      padding: 20,
      background: "linear-gradient(135deg, #eff6ff, #ffffff, #dbeafe)",
      color: "#0f172a",
    }}>
      <section style={{
        background: "#ffffff",
        border: "1px solid #bfdbfe",
        borderRadius: 28,
        padding: 24,
        boxShadow: "0 18px 50px rgba(37,99,235,.08)",
      }}>
        <p style={{
          margin: 0,
          color: "#2563eb",
          fontWeight: 900,
          letterSpacing: ".22em",
          fontSize: 12,
          textTransform: "uppercase",
        }}>
          Zentra RH
        </p>

        <h1 style={{ margin: "8px 0", fontSize: 34, fontWeight: 950 }}>
          BI de RH
        </h1>

        <p style={{ color: "#64748b", lineHeight: 1.6 }}>
          Este módulo de ingredientes pertencia ao sistema anterior. Para o RH,
          os indicadores principais estão no painel de BI com vagas, candidatos,
          mensagens, entrevistas e contratações.
        </p>

        <a
          href="/crm/dashboard/bi"
          style={{
            display: "inline-block",
            marginTop: 16,
            borderRadius: 16,
            padding: "13px 18px",
            background: "linear-gradient(135deg, #38bdf8, #2563eb)",
            color: "#ffffff",
            fontWeight: 900,
            textDecoration: "none",
          }}
        >
          Abrir BI de RH
        </a>
      </section>
    </main>
  );
}
