"use client";

import { useEffect, useState } from "react";

type ProductCatalog = {
  id: string;
  code: string;
  name: string;
  unit?: string | null;
  updated_at?: string;
};

export default function CatalogPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<ProductCatalog[]>([]);
  const [query, setQuery] = useState("");
  const [summary, setSummary] = useState<any>(null);

  async function loadProducts() {
    const res = await fetch(`/api/catalog/products?q=${encodeURIComponent(query)}&limit=80`, {
      cache: "no-store",
    });
    const data = await res.json();
    if (data.ok) setProducts(data.items || []);
  }

  useEffect(() => {
    loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function importCatalog() {
    if (!file) {
      alert("Selecione uma planilha XLSX.");
      return;
    }

    setLoading(true);
    setSummary(null);

    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch("/api/catalog/import-xlsx", {
        method: "POST",
        body: form,
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Erro ao importar.");

      setSummary(data.summary);
      setFile(null);
      await loadProducts();
      alert("Catálogo PMG importado com sucesso.");
    } catch (error: any) {
      alert(error?.message || "Erro ao importar catálogo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ padding: 24 }}>
      <section className="pmg-page-hero">
        <span>CATÁLOGO PMG</span>
        <h1>Produtos oficiais</h1>
        <p>
          Importe a planilha oficial uma vez e o OCR dos pedidos passa a corrigir código e nome dos produtos automaticamente.
        </p>
      </section>

      <section className="pmg-card" style={{ marginTop: 18 }}>
        <h2>Importar planilha de produtos</h2>
        <p style={{ color: "#64748b", marginTop: 4 }}>
          Use XLSX. O sistema salva código, nome e unidade. O preço é ignorado porque muda diariamente.
        </p>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16 }}>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="pmg-input"
          />
          <button onClick={importCatalog} disabled={loading} className="pmg-btn-primary">
            {loading ? "Importando..." : "Importar catálogo"}
          </button>
        </div>

        {summary && (
          <div className="pmg-kpi-grid" style={{ marginTop: 16 }}>
            <div className="pmg-kpi"><small>Importados</small><strong>{summary.imported}</strong></div>
            <div className="pmg-kpi"><small>Atualizados</small><strong>{summary.updated}</strong></div>
            <div className="pmg-kpi"><small>Ignorados</small><strong>{summary.skipped}</strong></div>
          </div>
        )}
      </section>

      <section className="pmg-card" style={{ marginTop: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <span className="pmg-eyebrow">BASE INTERNA</span>
            <h2>Produtos cadastrados</h2>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por código ou produto..."
              className="pmg-input"
              style={{ minWidth: 280 }}
            />
            <button onClick={loadProducts} className="pmg-btn-secondary">Buscar</button>
          </div>
        </div>

        <div style={{ overflowX: "auto", marginTop: 16 }}>
          <table className="pmg-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Produto</th>
                <th>Unidade</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id}>
                  <td><strong>{product.code}</strong></td>
                  <td>{product.name}</td>
                  <td>{product.unit || "-"}</td>
                </tr>
              ))}

              {!products.length && (
                <tr>
                  <td colSpan={3} style={{ textAlign: "center", padding: 24, color: "#64748b" }}>
                    Nenhum produto importado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <style jsx>{`
        .pmg-page-hero {
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 24px;
          padding: 28px;
          box-shadow: 0 12px 32px rgba(15, 23, 42, 0.06);
        }
        .pmg-page-hero span,
        .pmg-eyebrow {
          display: block;
          color: #15803d;
          font-weight: 900;
          letter-spacing: 0.14em;
          font-size: 11px;
        }
        .pmg-page-hero h1,
        .pmg-card h2 {
          margin: 6px 0 0;
          color: #111827;
          font-weight: 950;
        }
        .pmg-page-hero p {
          color: #64748b;
          max-width: 760px;
          line-height: 1.6;
        }
        .pmg-card {
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 24px;
          padding: 24px;
          box-shadow: 0 12px 32px rgba(15, 23, 42, 0.05);
        }
        .pmg-input {
          height: 46px;
          border: 1px solid #d1d5db;
          border-radius: 14px;
          padding: 0 14px;
          background: #fff;
          color: #111827;
          font-weight: 700;
        }
        .pmg-btn-primary,
        .pmg-btn-secondary {
          height: 46px;
          border-radius: 14px;
          padding: 0 18px;
          font-weight: 900;
          cursor: pointer;
          border: 1px solid transparent;
        }
        .pmg-btn-primary {
          background: #15803d;
          color: #fff;
          box-shadow: 0 10px 24px rgba(21, 128, 61, 0.18);
        }
        .pmg-btn-secondary {
          background: #fff;
          color: #111827;
          border-color: #d1d5db;
        }
        .pmg-kpi-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
        }
        .pmg-kpi {
          border: 1px solid #e5e7eb;
          border-radius: 18px;
          padding: 16px;
          background: #f9fafb;
        }
        .pmg-kpi small {
          color: #64748b;
          font-weight: 800;
        }
        .pmg-kpi strong {
          display: block;
          margin-top: 6px;
          font-size: 24px;
          color: #15803d;
        }
        .pmg-table {
          width: 100%;
          border-collapse: collapse;
          min-width: 700px;
        }
        .pmg-table th {
          text-align: left;
          background: #f3f4f6;
          color: #475569;
          font-size: 12px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          padding: 12px;
        }
        .pmg-table td {
          padding: 13px 12px;
          border-bottom: 1px solid #e5e7eb;
          color: #111827;
          font-weight: 700;
        }
        @media (max-width: 768px) {
          main { padding: 14px !important; }
          .pmg-page-hero, .pmg-card { padding: 18px; border-radius: 20px; }
          .pmg-kpi-grid { grid-template-columns: 1fr; }
          .pmg-input, .pmg-btn-primary, .pmg-btn-secondary { width: 100%; }
        }
      `}</style>
    </main>
  );
}
