"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CadastroPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("PMG Distribuidora");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, companyName, email, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Erro ao cadastrar");
      return;
    }

    alert("Usuário criado com sucesso!");
    router.push("/login");
  }

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <div style={styles.logo}>Z</div>
        <p style={styles.brand}>Zentra Sales AI</p>
        <h1 style={styles.title}>Criar acesso</h1>

        <form onSubmit={handleSubmit} style={styles.form}>
          <input style={styles.input} placeholder="Seu nome" value={name} onChange={(e) => setName(e.target.value)} />
          <input style={styles.input} placeholder="Nome da empresa" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
          <input style={styles.input} placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input style={styles.input} type="password" placeholder="Senha" value={password} onChange={(e) => setPassword(e.target.value)} />

          <button style={styles.button}>Criar usuário</button>
        </form>
      </section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #eff6ff, #ffffff, #dbeafe)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    fontFamily: "Arial, sans-serif",
  },
  card: {
    width: "100%",
    maxWidth: 440,
    background: "#fff",
    border: "1px solid #bfdbfe",
    borderRadius: 28,
    padding: 32,
    boxShadow: "0 24px 70px rgba(37,99,235,.14)",
    textAlign: "center",
  },
  logo: {
    width: 68,
    height: 68,
    margin: "0 auto 18px",
    borderRadius: 22,
    background: "linear-gradient(135deg, #38bdf8, #2563eb)",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 34,
    fontWeight: 900,
  },
  brand: {
    color: "#2563eb",
    fontWeight: 900,
    letterSpacing: ".22em",
    textTransform: "uppercase",
    fontSize: 13,
  },
  title: {
    color: "#0f172a",
    fontSize: 30,
    fontWeight: 900,
  },
  form: {
    display: "grid",
    gap: 14,
  },
  input: {
    border: "1px solid #cbd5e1",
    background: "#f8fafc",
    borderRadius: 16,
    padding: "15px 16px",
    fontSize: 15,
  },
  button: {
    border: 0,
    borderRadius: 16,
    padding: "16px 18px",
    background: "linear-gradient(135deg, #38bdf8, #2563eb)",
    color: "#fff",
    fontWeight: 900,
    cursor: "pointer",
  },
};