"use client";

import { useState } from "react";
import {
  Send,
  Sparkles,
} from "lucide-react";

export function AskSupervisorAI({ dashboard }: { dashboard: any }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");

  function ask() {
    const q = question.toLowerCase();

    if (!q.trim()) return;

    const sellers = dashboard?.sellers || [];

    if (q.includes("vende mais") || q.includes("melhor")) {
      const best = [...sellers].sort((a, b) => b.sold - a.sold)[0];

      setAnswer(
        best
          ? `${best.name} é quem mais vende no momento, com ${best.soldFormatted} vendidos e ${best.orders} pedidos.`
          : "Ainda não existem dados suficientes para responder."
      );

      return;
    }

    if (q.includes("vende menos") || q.includes("pior")) {
      const worst = [...sellers].sort((a, b) => a.sold - b.sold)[0];

      setAnswer(
        worst
          ? `${worst.name} é quem vende menos no período, com ${worst.soldFormatted}. Recomendo revisar carteira, atividades e clientes sem contato.`
          : "Ainda não existem dados suficientes para responder."
      );

      return;
    }

    if (q.includes("ajuda") || q.includes("atenção")) {
      const critical = sellers
        .filter((s: any) => s.goalPercent < 50 || s.zentraIndex < 45)
        .sort((a: any, b: any) => a.zentraIndex - b.zentraIndex);

      setAnswer(
        critical.length
          ? `${critical[0].name} precisa de atenção primeiro. O Índice Zentra está em ${critical[0].zentraIndex} e a meta está em ${critical[0].goalPercent}%.`
          : "Nenhum vendedor está em estado crítico agora."
      );

      return;
    }

    if (q.includes("radar")) {
      const lessRadar = [...sellers].sort((a, b) => a.radar - b.radar)[0];

      setAnswer(
        lessRadar
          ? `${lessRadar.name} é quem menos usa o Radar, com ${lessRadar.radar} registros. Pode estar perdendo oportunidades comerciais.`
          : "Ainda não existem dados suficientes sobre Radar."
      );

      return;
    }

    setAnswer(
      "Pelo diagnóstico geral, avalie vendedores abaixo da meta, clientes sem contato recente e baixo uso do Radar. Esses são os principais pontos de atenção."
    );
  }

  return (
    <section className="rounded-3xl border bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-violet-50 p-3 text-violet-600">
          <Sparkles className="h-5 w-5" />
        </div>

        <div>
          <h2 className="text-xl font-bold text-slate-950">
            Pergunte à IA
          </h2>

          <p className="text-sm text-slate-500">
            Faça perguntas simples sobre a operação comercial.
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") ask();
          }}
          placeholder="Ex: quem precisa de ajuda hoje?"
          className="flex-1 rounded-2xl border px-4 py-3 text-sm outline-none focus:border-violet-500"
        />

        <button
          onClick={ask}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-700"
        >
          Perguntar
          <Send className="h-4 w-4" />
        </button>
      </div>

      {answer && (
        <div className="mt-5 rounded-2xl bg-slate-50 p-5 text-sm leading-relaxed text-slate-700">
          {answer}
        </div>
      )}
    </section>
  );
}