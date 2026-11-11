"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function CadastroPage() {
  const router = useRouter();
  const supabase = createClient();
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    birthDate: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleCadastro(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    // Cria o usuário no Auth do Supabase
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: {
          name: form.name,
          phone: form.phone,
          birth_date: form.birthDate,
          role: "client",
        },
      },
    });

    if (authError) {
      console.error("Erro Supabase Auth:", authError.message);
      setError(authError.message);
      setLoading(false);
      return;
    }

    // Grava ou atualiza a tabela pública 'profiles' se o usuário foi criado com sucesso
    if (authData?.user) {
      const { error: profileError } = await supabase.from("profiles").upsert({
        id: authData.user.id,
        name: form.name,
        phone: form.phone,
        role: "client",
        birth_date: form.birthDate || null,
      });

      if (profileError) {
        console.error("Erro ao salvar perfil público:", profileError.message);
      } else if (form.phone) {
        // Se o telefone foi preenchido, tenta fundir com perfil fantasma (se existir)
        const { data: foiFundido } = await supabase.rpc("merge_ghost_profile", {
          user_phone: form.phone,
        });

        if (foiFundido) {
          alert(
            "Uau! 🎉 Identificamos que você já é de casa. O seu Plano Ativo e o seu Histórico de Cortes foram sincronizados automaticamente com a sua nova conta!",
          );
        }
      }
    }

    // Redireciona o cliente para a Home dele já com tudo carregado
    router.push("/cliente");
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4 py-4">
      <div className="w-full max-w-sm flex flex-col justify-center">
        {/* REDUZIDO: Logo otimizada para liberar espaço vertical */}
        <div className="text-center mb-4">
          <img
            src="/logo aliança1.png"
            alt="Aliança Barber Club"
            className="h-40 w-auto mx-auto mix-blend-lighten"
          />
        </div>

        {/* AJUSTADO: Gap menor entre os campos */}
        <form
          onSubmit={handleCadastro}
          className="bg-zinc-900 rounded-2xl p-5 flex flex-col gap-3 border border-zinc-800 shadow-2xl"
        >
          {/* Mapeando os campos dinamicamente */}
          {[
            {
              label: "Nome completo",
              field: "name",
              type: "text",
              placeholder: "João Silva",
            },
            {
              label: "E-mail",
              field: "email",
              type: "email",
              placeholder: "seu@email.com",
            },
            {
              label: "Celular (WhatsApp)",
              field: "phone",
              type: "tel",
              placeholder: "(24) 99999-0000",
            },
            {
              label: "Data de Nascimento",
              field: "birthDate",
              type: "date",
              placeholder: "",
            },
            {
              label: "Senha",
              field: "password",
              type: "password",
              placeholder: "Mínimo 6 caracteres",
            },
          ].map(({ label, field, type, placeholder }) => (
            <div key={field} className="flex flex-col gap-0.5">
              <label className="text-zinc-400 text-xs font-medium ml-0.5">
                {label}
              </label>
              <input
                type={type}
                required
                value={form[field as keyof typeof form]}
                onChange={(e) => set(field, e.target.value)}
                placeholder={placeholder}
                minLength={field === "password" ? 6 : undefined}
                className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-amber-400 transition-colors [color-scheme:dark]"
              />
            </div>
          ))}

          {error && <p className="text-red-400 text-xs text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="bg-amber-400 text-zinc-950 font-black py-3 rounded-xl hover:bg-amber-300 transition-colors disabled:opacity-50 mt-1 uppercase text-xs tracking-wider"
          >
            {loading ? "Criando conta..." : "Criar conta"}
          </button>
        </form>

        <p className="text-center text-zinc-500 text-xs mt-3">
          Já tem conta?{" "}
          <Link
            href="/login"
            className="text-amber-400 font-semibold hover:underline"
          >
            Entrar
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
