"use client";

import { useState } from "react";
import { Send, Sparkles } from "lucide-react";

export function AskCommandAI({ dashboard }: { dashboard: any }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");

  function ask() {
    const q = question.toLowerCase();
    const sellers = dashboard?.sellers || [];

    if (!q.trim()) return;

    if (q.includes("vende mais") || q.includes("melhor vendedor")) {
      const best = [...sellers].sort((a, b) => b.sold - a.sold)[0];
      setAnswer(
        best
          ? `${best.name} lidera em vendas com ${best.soldFormatted}, ${best.orders} pedido(s) e Índice Zentra ${best.zentraIndex}.`
          : "Ainda não existem dados suficientes."
      );
      return;
    }

    if (q.includes("sem pedido")) {
      const list = sellers.filter((s: any) => s.orders === 0);
      setAnswer(
        list.length
          ? `${list.length} vendedor(es) estão sem pedidos: ${list.map((s: any) => s.name).join(", ")}.`
          : "Todos os vendedores possuem pedidos no período."
      );
      return;
    }

    if (q.includes("cotação") || q.includes("cotacao")) {
      const list = sellers.filter((s: any) => s.quotes === 0);
      setAnswer(
        list.length
          ? `${list.length} vendedor(es) não geraram cotações: ${list.map((s: any) => s.name).join(", ")}.`
          : "Todos os vendedores possuem cotações no período."
      );
      return;
    }

    if (q.includes("radar")) {
      const list = sellers.filter((s: any) => s.radarViews === 0);
      setAnswer(
        list.length
          ? `${list.length} vendedor(es) não usaram o Radar: ${list.map((s: any) => s.name).join(", ")}.`
          : "Todos os vendedores tiveram uso de Radar no período."
      );
      return;
    }

    if (q.includes("atenção") || q.includes("ajuda")) {
      const critical = [...sellers].sort((a, b) => a.zentraIndex - b.zentraIndex)[0];
      setAnswer(
        critical
          ? `${critical.name} precisa de atenção primeiro. Índice Zentra ${critical.zentraIndex}, ${critical.orders} pedido(s), ${critical.quotes} cotação(ões), ${critical.messagesSent} mensagem(ns) e ${critical.customersWithoutContact} cliente(s) sem contato.`
          : "Nenhum vendedor crítico encontrado."
      );
      return;
    }

    setAnswer(
      "Pontos principais: verifique vendedores sem pedidos, sem cotações, sem uso de Radar, baixa taxa de resposta e clientes sem contato recente."
    );
  }

  return (
    <section className="rounded-[30px] border border-emerald-100 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700">
          <Sparkles className="h-5 w-5" />
        </div>

        <div>
          <h2 className="text-xl font-black text-slate-950">Pergunte à IA</h2>
          <p className="text-sm text-slate-500">
            Pergunte sobre vendas, pedidos, Radar, mensagens, cotações e vendedores em risco.
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask()}
          placeholder="Ex: quem precisa de atenção hoje?"
          className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-emerald-500"
        />

        <button
          onClick={ask}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black text-white hover:bg-emerald-700"
        >
          Perguntar
          <Send className="h-4 w-4" />
        </button>
      </div>

      {answer && (
        <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50 p-5 text-sm font-semibold leading-relaxed text-slate-700">
          {answer}
        </div>
      )}
    </section>
  );
}