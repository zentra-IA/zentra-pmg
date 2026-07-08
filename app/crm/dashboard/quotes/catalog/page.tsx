"use client";

import { useEffect, useMemo, useState } from "react";

type CatalogStats = {
  success: boolean;
  total?: number;
  active?: number;
  categories?: Array<{ category: string; total: number }>;
  samples?: Array<{
    code: string;
    official_name: string;
    category?: string | null;
    brand?: string | null;
    package_type?: string | null;
    default_sell_unit?: string | null;
  }>;
  error?: string;
};

type UploadResult = CatalogStats & {
  rows?: number;
  created?: number;
  updated?: number;
  ignored?: number;
  ignoredSamples?: Array<{ row: number; reason: string; data: any }>;
};


const DEFAULT_COMPANY_ID =
  process.env.NEXT_PUBLIC_DEFAULT_COMPANY_ID || "11111111-1111-4111-8111-111111111111";

export default function QuoteCatalogPage() {
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [stats, setStats] = useState<CatalogStats | null>(null);

  async function loadStats() {
    try {
      const res = await fetch(
        `/api/quotes/catalog?companyId=${encodeURIComponent(DEFAULT_COMPANY_ID)}`,
        { cache: "no-store" }
      );

      const data = await res.json();

      if (!res.ok || data.error) {
        setStats({
          success: false,
          error: data.error || "Erro ao carregar catálogo.",
        });
        return;
      }

      const products = data.products || [];

      const categoryMap = new Map<string, number>();

      products.forEach((p: any) => {
        const category = p.category || p.categoria || "Sem categoria";
        categoryMap.set(category, (categoryMap.get(category) || 0) + 1);
      });

      setStats({
        success: true,
        total: products.length,
        active: products.filter((p: any) => p.active !== false).length,
        categories: Array.from(categoryMap.entries()).map(([category, total]) => ({
          category,
          total,
        })),
        samples: products.slice(0, 20).map((p: any) => ({
          code: p.code,
          official_name:
            p.descriptionOriginal ||
            p.descricaoOriginal ||
            p.product ||
            p.produto ||
            "-",
          category: p.category || p.categoria || null,
          brand: p.brand || p.marca || null,
          package_type: p.package || p.embalagem || null,
          default_sell_unit: p.soldBy || p.vendePor || null,
        })),
      });
    } catch (err: any) {
      setStats({
        success: false,
        error: err?.message || "Erro ao carregar catálogo.",
      });
    }
  }

  useEffect(() => {
    loadStats();
  }, []);

  async function upload(file: File) {
    const form = new FormData();
    form.append("companyId", DEFAULT_COMPANY_ID);
    form.append("file", file);

    setLoading(true);
    setResult(null);
    setStatus(`Importando ${file.name}... aguarde.`);

    try {
      const res = await fetch("/api/quotes/catalog/upload", { method: "POST", body: form });
      const data: UploadResult = await res.json();
      setResult(data);

      if (data.success) {
        setStatus(
          `Catálogo importado. Total: ${data.total || data.rows || 0}. Criados: ${data.created || 0}. Atualizados: ${data.updated || 0}. Ignorados: ${data.ignored || 0}.`
        );
        await loadStats();
      } else {
        setStatus(data.error || "Erro ao importar.");
      }
    } catch (err: any) {
      setStatus(err?.message || "Erro ao importar.");
    } finally {
      setLoading(false);
    }
  }

  const categories = useMemo(() => stats?.categories || [], [stats]);

  return (
    <main className="min-h-screen bg-[#f5f7f4] p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-3xl border border-emerald-100 bg-white p-6 shadow-sm">
          <div className="mb-2 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            Master / Supervisor
          </div>
          <h1 className="text-3xl font-bold text-slate-950">Catálogo Inteligente PMG</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">
            Importe o Excel base com códigos, nomes, categorias, embalagens, sinônimos e palavras proibidas.
            Depois da importação, esta tela mostra exatamente o que entrou no sistema.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase text-slate-500">Produtos no catálogo</p>
            <p className="mt-2 text-3xl font-black text-slate-950">{stats?.total ?? 0}</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase text-slate-500">Ativos</p>
            <p className="mt-2 text-3xl font-black text-emerald-700">{stats?.active ?? 0}</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase text-slate-500">Categorias</p>
            <p className="mt-2 text-3xl font-black text-slate-950">{categories.length}</p>
          </div>
          <button
            onClick={loadStats}
            className="rounded-3xl border border-emerald-200 bg-emerald-600 p-5 text-left font-bold text-white shadow-sm transition hover:bg-emerald-700"
          >
            Atualizar visão do catálogo
          </button>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-950">Importar Excel base</h2>
          <p className="mt-2 text-sm text-slate-500">
            Colunas aceitas: Código/COD/ID, Nome Oficial/Produto/Descrição, Categoria, Subcategoria, Marca,
            Embalagem, Vendido Por, Sinônimos e Palavras Proibidas.
          </p>

          <label className={`mt-6 flex cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed p-10 text-center transition ${
            loading ? "border-slate-200 bg-slate-50" : "border-emerald-200 bg-emerald-50/40 hover:bg-emerald-50"
          }`}>
            <span className="text-lg font-bold text-emerald-800">
              {loading ? "Importando..." : "Selecionar Excel"}
            </span>
            <span className="mt-1 text-sm text-emerald-700">.xlsx ou .xls</span>
            <input
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              disabled={loading}
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
            />
          </label>

          {status && (
            <div className={`mt-6 rounded-2xl p-4 text-sm ${
              result?.success === false ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"
            }`}>
              {status}
            </div>
          )}

          {result?.ignoredSamples?.length ? (
            <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <h3 className="font-bold text-amber-900">Linhas ignoradas para revisar</h3>
              <div className="mt-3 space-y-2 text-xs text-amber-900">
                {result.ignoredSamples.map((item, index) => (
                  <div key={index} className="rounded-xl bg-white/70 p-3">
                    <b>Linha {item.row}:</b> {item.reason}
                    <pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap">{JSON.stringify(item.data, null, 2)}</pre>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-950">Produtos carregados</h2>
            <p className="mt-1 text-sm text-slate-500">Amostra dos últimos itens salvos no catálogo.</p>

            <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="p-3">Código</th>
                    <th className="p-3">Produto</th>
                    <th className="p-3">Categoria</th>
                    <th className="p-3">Un.</th>
                  </tr>
                </thead>
                <tbody>
                  {(stats?.samples || []).map((p) => (
                    <tr key={p.code} className="border-t border-slate-100">
                      <td className="p-3 font-bold text-slate-900">{p.code}</td>
                      <td className="p-3 text-slate-700">{p.official_name}</td>
                      <td className="p-3 text-slate-500">{p.category || "-"}</td>
                      <td className="p-3 text-slate-500">{p.default_sell_unit || "-"}</td>
                    </tr>
                  ))}
                  {!stats?.samples?.length && (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-slate-500">
                        Nenhum produto encontrado no catálogo ainda.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-950">Categorias detectadas</h2>
            <p className="mt-1 text-sm text-slate-500">Ajuda a validar se o Excel foi interpretado corretamente.</p>

            <div className="mt-5 space-y-2">
              {categories.map((c) => (
                <div key={c.category} className="flex items-center justify-between rounded-2xl bg-slate-50 p-3">
                  <span className="font-semibold text-slate-700">{c.category || "Sem categoria"}</span>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-600">{c.total}</span>
                </div>
              ))}
              {!categories.length && (
                <div className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">
                  Nenhuma categoria carregada ainda.
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
