import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const ALLOWED_ROLES = new Set(["client", "barber", "barbers", "admin"]);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId, newRole } = body;

    if (
      typeof userId !== "string" ||
      typeof newRole !== "string" ||
      !ALLOWED_ROLES.has(newRole)
    ) {
      return NextResponse.json(
        { error: "Dados de função inválidos" },
        { status: 400 },
      );
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user: requestingUser },
    } = await supabase.auth.getUser();

    if (!requestingUser) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Uses the service role only after the caller's session and server-side
    // profile have been checked. Client-provided roles must never authorize
    // privileged actions.
    const { data: requesterProfile, error: requesterError } =
      await supabaseAdmin
        .from("profiles")
        .select("role")
        .eq("id", requestingUser.id)
        .single();

    if (requesterError || requesterProfile?.role !== "admin") {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    // Keep the role in Auth metadata for routing, and in profiles for RLS.
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { user_metadata: { role: newRole } },
    );

    if (authError) throw authError;

    // 2. Atualiza o Profile
    const { error: profError } = await supabaseAdmin
      .from("profiles")
      .update({ role: newRole })
      .eq("id", userId);

    if (profError) throw profError;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("ERRO NA API:", error);
    return NextResponse.json(
      { error: error.message || "Erro interno no servidor" },
      { status: 500 },
    );
  }
}
