"use client";

import { useState } from "react";

export default function RadarUploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  async function handleUpload() {
    if (!file) {
      alert("Selecione uma planilha.");
      return;
    }

    try {
      setLoading(true);
      setResult(null);

      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/radar/import", {
        method: "POST",
        body: formData,
      });

      const text = await res.text();

      let data: any;

      try {
        data = JSON.parse(text);
      } catch {
        alert("A API não retornou JSON. Erro do servidor:\n\n" + text);
        return;
      }

      if (!res.ok || data.success === false) {
        alert(data.error || "Erro ao importar planilha.");
        return;
      }

      setResult(data);
    } catch (error: any) {
      alert(error.message || "Erro inesperado ao importar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950 p-8">
      <div className="mx-auto max-w-4xl">
        <button onClick={() => window.location.href = "/crm/dashboard/radar"} className="mb-6 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700">← Voltar para o Radar</button>

        <h1 className="text-4xl font-bold">Radar Local</h1>

        <p className="mt-2 text-slate-500">
          Importe sua base de contatos para prospecção local.
        </p>

        <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <input
            type="file"
            accept=".xlsx,.csv"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="block w-full rounded-xl border border-slate-300 bg-white p-3"
          />

          {file && (
            <p className="mt-4 text-green-400">
              Arquivo selecionado: {file.name}
            </p>
          )}

          <button
            onClick={handleUpload}
            disabled={loading}
            className="mt-6 rounded-xl bg-blue-600 px-6 py-3 font-bold text-white disabled:opacity-50"
          >
            {loading ? "Processando base..." : "Processar base"}
          </button>
        </div>

        {result && (
          <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3">
            <Metric title="Linhas lidas" value={result.totalRows} />
            <Metric title="Criados" value={result.created} />
            <Metric title="Atualizados" value={result.updated} />
            <Metric title="Duplicados" value={result.duplicated} />
            <Metric title="Telefones inválidos" value={result.invalidPhone} />
            <Metric title="Menores removidos" value={result.underAge} />
          </div>
        )}
      </div>
    </main>
  );
}

function Metric({ title, value }: { title: string; value: any }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">{title}</p>
      <p className="mt-1 text-3xl font-bold">{value ?? 0}</p>
    </div>
  );
}