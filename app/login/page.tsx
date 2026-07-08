"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type LoginForm = {
  company: string;
  email: string;
  password: string;
  remember: boolean;
};

export default function LoginPage() {
  const router = useRouter();

  const [form, setForm] = useState<LoginForm>({
    company: "",
    email: "",
    password: "",
    remember: true,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = useMemo(() => {
    return Boolean(form.email.trim() && form.password.trim());
  }, [form.email, form.password]);

  function update<K extends keyof LoginForm>(key: K, value: LoginForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || loading) return;

    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: form.email.trim(),
          password: form.password,
          company: form.company.trim() || undefined,
          companySlug: form.company.trim() || undefined,
          remember: form.remember,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data?.error || "Não foi possível entrar. Verifique seus dados.");
        return;
      }

      if (typeof window !== "undefined") {
        if (data?.company_id) localStorage.setItem("active_company_id", data.company_id);
        if (data?.company?.slug) localStorage.setItem("active_company_slug", data.company.slug);
        if (data?.role) localStorage.setItem("active_company_role", data.role);
        if (data?.roleLabel) localStorage.setItem("active_role_label", data.roleLabel);
      }

      router.push(data?.redirectTo || "/crm/dashboard");
      router.refresh();
    } catch {
      setError("Erro inesperado ao fazer login. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="pmg-login-page">
      <section className="pmg-login-brand">
        <div className="pmg-pill">PMG Atacadista • Zentra Sales AI</div>

        <h1>Inteligência comercial para vender mais com WhatsApp, CRM e IA.</h1>

        <p>
          Controle clientes, campanhas, disparos, inbox, metas, cotações e BI em uma
          plataforma preparada para representantes, supervisores e operação multiempresa.
        </p>

        <div className="pmg-benefits">
          <div>
            <strong>CRM Comercial</strong>
            <span>Kanban, clientes e oportunidades</span>
          </div>
          <div>
            <strong>WhatsApp Ativo</strong>
            <span>Inbox, campanhas e disparos</span>
          </div>
          <div>
            <strong>Gestão por Perfil</strong>
            <span>Vendedor, Supervisor e Geral</span>
          </div>
        </div>
      </section>

      <section className="pmg-login-card" aria-label="Login Zentra Sales AI">
        <div className="pmg-logo-row">
          <div className="pmg-logo">PMG</div>
          <div>
            <strong>Zentra Sales AI</strong>
            <span>Plataforma comercial PMG</span>
          </div>
        </div>

        <h2>Entrar no sistema</h2>
        <p className="pmg-subtitle">
          Acesse sua empresa com o perfil liberado pelo administrador.
        </p>

        <form onSubmit={handleSubmit} className="pmg-form">
          <label>
            Empresa
            <input
              value={form.company}
              onChange={(event) => update("company", event.target.value)}
              placeholder="Ex: pmg, distribuidora-sul ou deixe em branco"
              autoComplete="organization"
            />
            <small>Opcional. Use quando seu e-mail estiver vinculado a mais de uma empresa.</small>
          </label>

          <label>
            E-mail
            <input
              type="email"
              required
              value={form.email}
              onChange={(event) => update("email", event.target.value)}
              placeholder="seuemail@empresa.com"
              autoComplete="email"
            />
          </label>

          <label>
            Senha
            <input
              type="password"
              required
              value={form.password}
              onChange={(event) => update("password", event.target.value)}
              placeholder="Digite sua senha"
              autoComplete="current-password"
            />
          </label>

          <div className="pmg-form-row">
            <label className="pmg-checkbox">
              <input
                type="checkbox"
                checked={form.remember}
                onChange={(event) => update("remember", event.target.checked)}
              />
              Manter conectado
            </label>

            <a href="/login/recuperar-senha">Esqueci minha senha</a>
          </div>

          {error ? <div className="pmg-error">{error}</div> : null}

          <button type="submit" disabled={!canSubmit || loading}>
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <div className="pmg-profile-info">
          <strong>Perfis de acesso</strong>
          <span>Vendedor: operação comercial completa.</span>
          <span>Supervisor: visão da equipe e dados de todos os vendedores.</span>
          <span>Geral: acesso master de todas as empresas.</span>
        </div>
      </section>

      <style jsx>{`
        .pmg-login-page {
          min-height: 100vh;
          display: grid;
          grid-template-columns: minmax(0, 1.05fr) 460px;
          gap: 32px;
          align-items: center;
          padding: 42px;
          background:
            radial-gradient(circle at 8% 8%, rgba(22, 163, 74, 0.10), transparent 30%),
            radial-gradient(circle at 92% 12%, rgba(220, 38, 38, 0.08), transparent 28%),
            linear-gradient(135deg, #f8fafc 0%, #ffffff 45%, #f3f4f6 100%);
          color: #111827;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .pmg-login-brand {
          max-width: 720px;
          padding: 20px;
        }

        .pmg-pill {
          display: inline-flex;
          padding: 10px 14px;
          border-radius: 999px;
          color: #166534;
          background: #dcfce7;
          border: 1px solid rgba(22, 163, 74, 0.20);
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        h1 {
          margin: 22px 0 16px;
          max-width: 760px;
          font-size: clamp(38px, 5vw, 72px);
          line-height: 0.95;
          letter-spacing: -0.07em;
          color: #111827;
        }

        .pmg-login-brand p {
          max-width: 620px;
          margin: 0;
          color: #4b5563;
          font-size: 18px;
          line-height: 1.7;
          font-weight: 500;
        }

        .pmg-benefits {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px;
          margin-top: 28px;
        }

        .pmg-benefits div,
        .pmg-login-card {
          background: rgba(255, 255, 255, 0.92);
          border: 1px solid #e5e7eb;
          box-shadow: 0 20px 60px rgba(17, 24, 39, 0.08);
        }

        .pmg-benefits div {
          padding: 18px;
          border-radius: 22px;
        }

        .pmg-benefits strong,
        .pmg-benefits span {
          display: block;
        }

        .pmg-benefits strong {
          color: #111827;
          font-size: 15px;
          margin-bottom: 5px;
        }

        .pmg-benefits span {
          color: #6b7280;
          font-size: 13px;
          line-height: 1.4;
        }

        .pmg-login-card {
          width: 100%;
          border-radius: 30px;
          padding: 30px;
        }

        .pmg-logo-row {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 24px;
        }

        .pmg-logo {
          width: 58px;
          height: 58px;
          border-radius: 18px;
          display: grid;
          place-items: center;
          color: #ffffff;
          font-weight: 950;
          font-size: 15px;
          background: linear-gradient(135deg, #16a34a, #dc2626);
          box-shadow: 0 16px 30px rgba(22, 163, 74, 0.22);
        }

        .pmg-logo-row strong,
        .pmg-logo-row span {
          display: block;
        }

        .pmg-logo-row strong {
          font-size: 20px;
          letter-spacing: -0.04em;
        }

        .pmg-logo-row span {
          color: #6b7280;
          font-size: 13px;
          font-weight: 700;
        }

        h2 {
          margin: 0;
          font-size: 30px;
          letter-spacing: -0.05em;
        }

        .pmg-subtitle {
          margin: 8px 0 24px;
          color: #6b7280;
          line-height: 1.5;
        }

        .pmg-form {
          display: grid;
          gap: 16px;
        }

        label {
          display: grid;
          gap: 8px;
          color: #111827;
          font-size: 13px;
          font-weight: 900;
        }

        input {
          height: 50px;
          border-radius: 16px;
          border: 1px solid #d1d5db;
          background: #ffffff;
          color: #111827;
          padding: 0 15px;
          outline: none;
          font-size: 14px;
          transition: 160ms ease;
        }

        input:focus {
          border-color: #16a34a;
          box-shadow: 0 0 0 4px rgba(22, 163, 74, 0.12);
        }

        small {
          color: #6b7280;
          font-weight: 600;
        }

        .pmg-form-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .pmg-checkbox {
          display: flex;
          align-items: center;
          grid-template-columns: unset;
          gap: 8px;
          color: #4b5563;
          font-size: 13px;
          font-weight: 800;
        }

        .pmg-checkbox input {
          width: 16px;
          height: 16px;
        }

        a {
          color: #16a34a;
          text-decoration: none;
          font-size: 13px;
          font-weight: 900;
        }

        .pmg-error {
          padding: 12px 14px;
          border-radius: 14px;
          background: #fef2f2;
          color: #b91c1c;
          border: 1px solid #fecaca;
          font-size: 13px;
          font-weight: 800;
        }

        button {
          height: 52px;
          border: 0;
          border-radius: 16px;
          color: #ffffff;
          background: #16a34a;
          font-size: 15px;
          font-weight: 950;
          cursor: pointer;
          box-shadow: 0 16px 30px rgba(22, 163, 74, 0.22);
          transition: 160ms ease;
        }

        button:hover:not(:disabled) {
          background: #15803d;
          transform: translateY(-1px);
        }

        button:disabled {
          opacity: 0.58;
          cursor: not-allowed;
        }

        .pmg-profile-info {
          margin-top: 20px;
          padding: 16px;
          border-radius: 20px;
          background: #f9fafb;
          border: 1px solid #e5e7eb;
        }

        .pmg-profile-info strong,
        .pmg-profile-info span {
          display: block;
        }

        .pmg-profile-info strong {
          margin-bottom: 8px;
          font-size: 13px;
        }

        .pmg-profile-info span {
          color: #6b7280;
          font-size: 12px;
          line-height: 1.5;
        }

        @media (max-width: 980px) {
          .pmg-login-page {
            grid-template-columns: 1fr;
            padding: 18px;
          }

          .pmg-login-brand {
            padding: 0;
          }

          .pmg-benefits {
            grid-template-columns: 1fr;
          }

          .pmg-login-card {
            padding: 22px;
            border-radius: 24px;
          }

          .pmg-form-row {
            align-items: flex-start;
            flex-direction: column;
          }
        }
      `}</style>
    </main>
  );
}
