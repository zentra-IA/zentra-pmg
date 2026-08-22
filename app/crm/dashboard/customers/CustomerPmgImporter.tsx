"use client";

import { ChangeEvent, useRef, useState } from "react";

type ImportSummary = {
  processed: number;
  created: number;
  updated: number;
  unchanged: number;
  ignored: number;
  errors: number;
};

type Props = {
  onImported?: () => void | Promise<void>;
};

export default function CustomerPmgImporter({ onImported }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState("");

  function openFilePicker() {
    setError("");
    setSummary(null);
    inputRef.current?.click();
  }

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    event.target.value = "";
    if (!selected) return;

    const name = selected.name.toLowerCase();

    if (!name.endsWith(".xlsx") && !name.endsWith(".xls")) {
      setError("Selecione uma planilha Excel (.xlsx ou .xls).");
      setOpen(true);
      return;
    }

    setFile(selected);
    setSummary(null);
    setError("");
    setOpen(true);
  }

  function closeModal() {
    if (importing) return;
    setOpen(false);
    setFile(null);
    setSummary(null);
    setError("");
  }

  async function importCustomers() {
    if (!file) {
      setError("Selecione a planilha do sistema PMG.");
      return;
    }

    try {
      setImporting(true);
      setError("");
      setSummary(null);

      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/crm/customers/import", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Erro ao importar clientes.");
      }

      setSummary(data.summary);

      if (onImported) {
        await onImported();
      }
    } catch (err: any) {
      setError(err?.message || "Não foi possível importar a planilha.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        onChange={handleFile}
        className="hidden"
      />

      <button
        type="button"
        onClick={openFilePicker}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700 active:scale-[0.98] sm:w-auto"
      >
        <span className="text-lg">↓</span>
        Importar clientes do sistema PMG
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeModal();
          }}
        >
          <div className="w-full max-w-lg rounded-[28px] border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">
                  Importação PMG
                </p>
                <h2 className="mt-2 text-xl font-black text-slate-950 sm:text-2xl">
                  Importar clientes
                </h2>
                <p className="mt-2 text-sm font-medium leading-6 text-slate-500">
                  Selecione a planilha exportada pelo sistema PMG.
                </p>
              </div>

              <button
                type="button"
                disabled={importing}
                onClick={closeModal}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 font-black text-slate-600 transition hover:bg-slate-200 disabled:opacity-50"
              >
                ×
              </button>
            </div>

            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Arquivo selecionado
              </p>
              <p className="mt-1 break-all text-sm font-black text-slate-900">
                {file?.name || "Nenhuma planilha selecionada"}
              </p>

              <button
                type="button"
                disabled={importing}
                onClick={openFilePicker}
                className="mt-3 text-sm font-black text-emerald-700 hover:text-emerald-800 disabled:opacity-50"
              >
                Trocar planilha
              </button>
            </div>

            <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-4">
              <p className="text-sm font-black text-blue-950">Importação segura</p>
              <p className="mt-1 text-xs font-medium leading-5 text-blue-800">
                Clientes existentes são identificados pelo ID ou Nome Fantasia.
                Endereço, CEP, distância, tabela e outros dados cadastrados
                manualmente serão preservados.
              </p>
            </div>

            {error && (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
                {error}
              </div>
            )}

            {summary && (
              <div className="mt-5">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="font-black text-emerald-900">✓ Importação concluída</p>
                  <p className="mt-1 text-xs font-medium text-emerald-700">
                    A carteira foi atualizada.
                  </p>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <Metric label="Processados" value={summary.processed} />
                  <Metric label="Novos" value={summary.created} />
                  <Metric label="Atualizados" value={summary.updated} />
                  <Metric label="Sem alteração" value={summary.unchanged} />
                  <Metric label="Ignorados" value={summary.ignored} />
                  <Metric label="Erros" value={summary.errors} />
                </div>
              </div>
            )}

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={importing}
                onClick={closeModal}
                className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 sm:w-auto"
              >
                {summary ? "Fechar" : "Cancelar"}
              </button>

              {!summary && (
                <button
                  type="button"
                  disabled={importing || !file}
                  onClick={importCustomers}
                  className="w-full rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                >
                  {importing ? "Importando..." : "Importar clientes"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <p className="text-xl font-black text-slate-950">{value}</p>
      <p className="mt-1 text-[11px] font-bold text-slate-500">{label}</p>
    </div>
  );
}
