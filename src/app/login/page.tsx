"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (authError) {
      setError("E-mail ou senha incorretos.");
      setLoading(false);
      return;
    }

    // Busca o perfil para saber o role
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user!.id)
      .single();

    router.push(
      profile?.role === "barbers"
        ? "/barbeiro"
        : profile?.role === "admin"
          ? "/admin"
          : "/cliente",
    );
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4 py-4">
      <div className="w-full max-w-sm flex flex-col justify-center">
        {/* REDUZIDO: Logo otimizada para manter consistência com o cadastro */}
        <div className="text-center mb-4">
          <img
            src="/logo aliança1.png"
            alt="Aliança Barber Club"
            className="h-40 w-auto mx-auto mix-blend-lighten"
          />
        </div>

        {/* AJUSTADO: Padding e gaps menores para sumir com a rolagem */}
        <form
          onSubmit={handleLogin}
          className="bg-zinc-900 rounded-2xl p-5 flex flex-col gap-3 border border-zinc-800 shadow-2xl"
        >
          <div className="flex flex-col gap-0.5">
            <label className="text-zinc-400 text-xs font-medium ml-0.5">
              E-mail
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
          <div className="flex flex-col gap-0.5">
            <div className="flex justify-between items-center ml-0.5">
              <label className="text-zinc-400 text-xs font-medium">Senha</label>
              {/* Trocamos o <Link> por um <button> com router.push para blindar contra o <form> */}
              <button
                type="button"
                onClick={() => router.push("/esqueci-senha")}
                className="text-[10px] text-amber-500 font-bold hover:underline bg-transparent border-none p-0"
              >
                Esqueceu a senha?
              </button>
            </div>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-amber-400 transition-colors"
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-red-400 text-xs text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="bg-amber-400 text-zinc-950 font-black py-3 rounded-xl hover:bg-amber-300 transition-colors disabled:opacity-50 mt-1 uppercase text-xs tracking-wider"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <p className="text-center text-zinc-500 text-xs mt-3">
          Não tem conta?{" "}
          <Link
            href="/cadastro"
            className="text-amber-400 font-semibold hover:underline"
          >
            Cadastre-se
          </Link>
        </p>

        {/* ASSINATURA PREMIUM - PADRÃO @SGO */}
        <div className="flex flex-col items-center justify-center gap-1.5 mt-4 pt-3 border-t border-zinc-900/40">
          <p className="text-[9px] tracking-widest text-zinc-600 font-bold uppercase">
            Powered by <span className="text-amber-500/80">@SGO</span>
          </p>

          <div className="flex gap-2 text-[10px] font-bold text-zinc-500 uppercase tracking-tight">
            <a
              href="https://www.github.com/gsilvatech"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-amber-400 transition-colors py-1 px-2.5 rounded-lg bg-zinc-900/30 border border-zinc-900/60 hover:border-zinc-800"
            >
              GitHub
            </a>
            <a
              href="https://www.instagram.com/sougabrieloficial"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-amber-400 transition-colors py-1 px-2.5 rounded-lg bg-zinc-900/30 border border-zinc-900/60 hover:border-zinc-800"
            >
              Instagram
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
