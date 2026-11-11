"use client";
import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function EsqueciSenhaPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    // Dispara o e-mail de recuperação e redireciona para a tela de criar nova senha
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `https://aliancabarberclub.com.br/auth/callback?next=/atualizar-senha`,
    });

    if (error) {
      setError("Erro ao enviar o link. Verifique se o e-mail está correto.");
    } else {
      setMessage(
        "Link de recuperação enviado! Verifique sua caixa de entrada (e o Spam).",
      );
      setEmail("");
    }
    setLoading(false);
  }

  return (
    <main className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4 py-4">
      <div className="w-full max-w-sm flex flex-col justify-center">
        <div className="text-center mb-6">
          <img
            src="/logo aliança1.png"
            alt="Aliança Barber Club"
            className="h-32 w-auto mx-auto mix-blend-lighten"
          />
          <h1 className="text-xl font-bold text-white mt-4 italic">
            Recuperar Senha
          </h1>
          <p className="text-zinc-500 text-xs mt-1">
            Digite seu e-mail para receber o link.
          </p>
        </div>

        <form
          onSubmit={handleReset}
          className="bg-zinc-900 rounded-2xl p-5 flex flex-col gap-4 border border-zinc-800 shadow-2xl"
        >
          <div className="flex flex-col gap-0.5">
            <label className="text-zinc-400 text-xs font-medium ml-0.5">
              E-mail cadastrado
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-amber-400 transition-colors"
              placeholder="seu@email.com"
            />
          </div>

          {error && (
            <p className="text-red-400 text-xs text-center font-medium">
              {error}
            </p>
          )}
          {message && (
            <p className="text-emerald-400 text-xs text-center font-medium">
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="bg-amber-400 text-zinc-950 font-black py-3 rounded-xl hover:bg-amber-300 transition-colors disabled:opacity-50 mt-1 uppercase text-xs tracking-wider"
          >
            {loading ? "Enviando..." : "Enviar link"}
          </button>
        </form>

        <p className="text-center text-zinc-500 text-xs mt-4">
          Lembrou a senha?{" "}
          <Link
            href="/login"
            className="text-amber-400 font-semibold hover:underline"
          >
            Voltar ao Login
          </Link>
        </p>

        <div className="flex flex-col items-center justify-center gap-1.5 mt-6 pt-3 border-t border-zinc-900/40">
          <p className="text-[9px] tracking-widest text-zinc-600 font-bold uppercase">
            Powered by <span className="text-amber-500/80">@SGO</span>
          </p>
        </div>
      </div>
    </main>
  );
}
