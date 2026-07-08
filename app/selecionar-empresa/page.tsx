"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Company = {
  id: string;
  name: string;
  slug?: string | null;
  plan?: string | null;
  active?: boolean | null;
  role?: string | null;
};

function normalizeCompanies(payload: any): Company[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.companies)) return payload.companies;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function setClientCookie(name: string, value: string, days = 7) {
  const maxAge = days * 24 * 60 * 60;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

export default function SelecionarEmpresaPage() {
  const router = useRouter();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return companies;

    return companies.filter((company) => {
      return [company.name, company.slug, company.plan]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [companies, search]);

  useEffect(() => {
    loadCompanies();
  }, []);

  async function loadCompanies() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/companies", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(payload?.error || "Não foi possível carregar as empresas.");
        setCompanies([]);
        return;
      }

      const normalized = normalizeCompanies(payload);
      setCompanies(normalized);
    } catch {
      setError("Erro ao carregar empresas. Verifique sua conexão e tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  function selectCompany(company: Company) {
    if (!company?.id) return;

    const role = company.role || "GERAL";

    localStorage.setItem("active_company_id", company.id);
    localStorage.setItem("active_company_slug", company.slug || "");
    localStorage.setItem("active_company_name", company.name || "Empresa");
    localStorage.setItem("active_company_role", role);

    setClientCookie("zentra_company_id", company.id);
    setClientCookie("zentra_company_slug", company.slug || "");
    setClientCookie("zentra_user_role", role);

    router.push("/crm/dashboard");
    router.refresh();
  }

  return (
    <main className="select-page">
      <section className="select-card">
        <header className="select-header">
          <div className="logo">PMG</div>
          <div>
            <span>Zentra Sales AI</span>
            <h1>Selecionar empresa</h1>
            <p>Escolha a operação que deseja gerenciar agora.</p>
          </div>
        </header>

        <div className="toolbar">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar empresa, plano ou slug..."
          />
          <button type="button" onClick={loadCompanies}>
            Atualizar
          </button>
        </div>

        {loading ? (
          <div className="state">Carregando empresas...</div>
        ) : error ? (
          <div className="error">
            <strong>Não foi possível carregar.</strong>
            <span>{error}</span>
            <small>
              Dica: o perfil Geral precisa ter acesso à rota de empresas no admin.
            </small>
          </div>
        ) : filtered.length === 0 ? (
          <div className="state">Nenhuma empresa encontrada.</div>
        ) : (
          <div className="company-grid">
            {filtered.map((company) => (
              <button
                key={company.id}
                type="button"
                className="company-card"
                onClick={() => selectCompany(company)}
              >
                <div>
                  <strong>{company.name}</strong>
                  <span>{company.slug || "sem-slug"}</span>
                </div>

                <div className="meta">
                  <small className={company.active === false ? "inactive" : "active"}>
                    {company.active === false ? "Pausada" : "Ativa"}
                  </small>
                  <small>{company.plan || company.role || "Geral"}</small>
                </div>
              </button>
            ))}
          </div>
        )}

        <footer>
          Perfil Geral: acesso master às empresas. Supervisor e Vendedor entram direto no CRM.
        </footer>
      </section>

      <style jsx>{`
        .select-page {
          min-height: 100vh;
          display: grid;
          place-items: center;
          padding: 28px;
          background:
            radial-gradient(circle at top left, rgba(22, 163, 74, 0.10), transparent 34%),
            radial-gradient(circle at bottom right, rgba(220, 38, 38, 0.07), transparent 30%),
            #f8fafc;
          color: #111827;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .select-card {
          width: min(960px, 100%);
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 32px;
          padding: 28px;
          box-shadow: 0 24px 70px rgba(17, 24, 39, 0.10);
        }

        .select-header {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 24px;
        }

        .logo {
          width: 62px;
          height: 62px;
          flex: 0 0 auto;
          border-radius: 20px;
          display: grid;
          place-items: center;
          color: white;
          font-weight: 950;
          background: linear-gradient(135deg, #16a34a, #dc2626);
          box-shadow: 0 18px 34px rgba(22, 163, 74, 0.20);
        }

        .select-header span {
          color: #16a34a;
          font-size: 12px;
          font-weight: 950;
          letter-spacing: 0.16em;
          text-transform: uppercase;
        }

        h1 {
          margin: 4px 0 4px;
          font-size: clamp(30px, 4vw, 48px);
          letter-spacing: -0.06em;
        }

        p {
          margin: 0;
          color: #6b7280;
          font-weight: 600;
        }

        .toolbar {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 12px;
          margin-bottom: 18px;
        }

        input {
          height: 50px;
          border-radius: 16px;
          border: 1px solid #d1d5db;
          padding: 0 16px;
          outline: none;
          font-size: 14px;
        }

        input:focus {
          border-color: #16a34a;
          box-shadow: 0 0 0 4px rgba(22, 163, 74, 0.12);
        }

        button {
          cursor: pointer;
          transition: 160ms ease;
        }

        .toolbar button {
          border: 0;
          border-radius: 16px;
          background: #16a34a;
          color: #ffffff;
          padding: 0 20px;
          font-weight: 950;
        }

        .toolbar button:hover,
        .company-card:hover {
          transform: translateY(-1px);
        }

        .company-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
        }

        .company-card {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          min-height: 104px;
          text-align: left;
          border: 1px solid #e5e7eb;
          border-radius: 22px;
          padding: 18px;
          background: #ffffff;
          box-shadow: 0 12px 30px rgba(17, 24, 39, 0.06);
        }

        .company-card strong,
        .company-card span,
        .meta small {
          display: block;
        }

        .company-card strong {
          color: #111827;
          font-size: 17px;
          margin-bottom: 4px;
        }

        .company-card span {
          color: #6b7280;
          font-size: 13px;
          font-weight: 700;
        }

        .meta {
          display: grid;
          gap: 8px;
          align-content: start;
          justify-items: end;
        }

        .meta small {
          padding: 6px 9px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 950;
          background: #f3f4f6;
          color: #4b5563;
          white-space: nowrap;
        }

        .meta .active {
          background: #dcfce7;
          color: #166534;
        }

        .meta .inactive {
          background: #fee2e2;
          color: #991b1b;
        }

        .state,
        .error {
          border-radius: 22px;
          border: 1px dashed #d1d5db;
          padding: 28px;
          text-align: center;
          color: #6b7280;
          font-weight: 800;
        }

        .error {
          display: grid;
          gap: 6px;
          background: #fef2f2;
          color: #991b1b;
          border-color: #fecaca;
        }

        .error span,
        .error small {
          color: #b91c1c;
        }

        footer {
          margin-top: 20px;
          color: #6b7280;
          font-size: 13px;
          font-weight: 700;
          text-align: center;
        }

        @media (max-width: 760px) {
          .select-page {
            padding: 16px;
            align-items: start;
          }

          .select-card {
            padding: 20px;
            border-radius: 24px;
          }

          .select-header {
            align-items: flex-start;
          }

          .toolbar,
          .company-grid {
            grid-template-columns: 1fr;
          }

          .toolbar button {
            height: 48px;
          }

          .company-card {
            flex-direction: column;
          }

          .meta {
            display: flex;
            justify-content: flex-start;
          }
        }
      `}</style>
    </main>
  );
}
