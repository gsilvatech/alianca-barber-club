import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  // Chamada pelo agendador externo (sem sessão de usuário). A própria rota
  // valida o header Authorization com o CRON_SECRET.
  if (request.nextUrl.pathname === "/api/push/reminders") {
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name) {
          return request.cookies.get(name)?.value;
        },
        set(name, value, options) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          response.cookies.set({ name, value, ...options });
        },
        remove(name, options) {
          request.cookies.set({ name, value: "", ...options });
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          response.cookies.set({ name, value: "", ...options });
        },
      },
    },
  );

  const { data } = await supabase.auth.getUser();
  const user = data?.user || null;
  const path = request.nextUrl.pathname;

  console.log(`[MIDDLEWARE] Acessando: ${path} | User logado: ${!!user}`);

  // 1. ROTAS TOTALMENTE PÚBLICAS (Qualquer um acessa, com ou sem login)
  const publicRoutes = [
    "/login",
    "/cadastro",
    "/esqueci-senha",
    "/atualizar-senha",
    "/auth/callback",
  ];

  // Se NÃO estiver logado e NÃO for rota pública, chuta pro login
  if (!user && !publicRoutes.includes(path)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // 2. LÓGICA PARA USUÁRIOS LOGADOS
  if (user) {
    const role = user.user_metadata?.role;
    const isBarber = role === "barbers" || role === "barber";

    // ROTAS PROIBIDAS PARA QUEM JÁ ESTÁ LOGADO
    const authRoutesToBlock = ["/login", "/cadastro", "/esqueci-senha"];

    if (authRoutesToBlock.includes(path)) {
      const target = isBarber ? "/barbeiro" : "/cliente";
      return NextResponse.redirect(new URL(target, request.url));
    }

    // Proteção de rota de cliente (Barbeiro não entra aqui)
    if (path === "/cliente" && isBarber) {
      return NextResponse.redirect(new URL("/barbeiro", request.url));
    }

    // Proteção de rota de barbeiro (Quem não é barbeiro não entra aqui)
    if (path.startsWith("/barbeiro") && !isBarber) {
      return NextResponse.redirect(new URL("/cliente", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons/|manifest.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
