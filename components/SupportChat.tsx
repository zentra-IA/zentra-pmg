"use client";

import { useState } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

export default function SupportChat() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Olá! Sou o Assistente Zentra. Posso te ajudar com campanhas, WhatsApp, inbox, email marketing, radar e configurações.",
    },
  ]);

  async function send() {
    if (!question.trim()) return;

    const currentQuestion = question;
    setQuestion("");

    setMessages((prev) => [
      ...prev,
      { role: "user", content: currentQuestion },
    ]);

    setLoading(true);

    try {
      const res = await fetch("/api/support-ai", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: currentQuestion,
        }),
      });

      const data = await res.json();

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.success
            ? data.answer
            : data.error || "Erro ao responder.",
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Erro ao falar com o assistente.",
        },
      ]);
    }

    setLoading(false);
  }

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-[9999] rounded-full bg-emerald-600 px-5 py-4 text-sm font-black text-white shadow-2xl hover:bg-emerald-700"
        >
          💬 Ajuda
        </button>
      )}

      {open && (
        <div className="fixed bottom-5 right-5 z-[9999] flex h-[560px] w-[360px] flex-col overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950 text-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-zinc-800 bg-black px-4 py-3">
            <div>
              <h3 className="font-black">Assistente Zentra</h3>
              <p className="text-xs text-zinc-500">Tire dúvidas do sistema</p>
            </div>

            <button
              onClick={() => setOpen(false)}
              className="rounded-xl bg-zinc-900 px-3 py-2 text-sm font-black"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`max-w-[85%] whitespace-pre-line rounded-2xl px-4 py-3 text-sm ${
                  msg.role === "user"
                    ? "ml-auto bg-emerald-600 text-white"
                    : "mr-auto bg-zinc-900 text-zinc-200"
                }`}
              >
                {msg.content}
              </div>
            ))}

            {loading && (
              <div className="mr-auto rounded-2xl bg-zinc-900 px-4 py-3 text-sm text-zinc-400">
                Pensando...
              </div>
            )}
          </div>

          <div className="border-t border-zinc-800 p-3">
            <div className="flex gap-2">
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") send();
                }}
                placeholder="Digite sua dúvida..."
                className="flex-1 rounded-2xl border border-zinc-800 bg-black px-4 py-3 text-sm outline-none focus:border-emerald-500"
              />

              <button
                onClick={send}
                disabled={loading}
                className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black disabled:opacity-50"
              >
                Enviar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}