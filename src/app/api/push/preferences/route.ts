import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/push";

async function currentUser() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const { data, error } = await createAdminClient()
    .from("notification_preferences")
    .select("reminder_minutes")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reminderMinutes: data?.reminder_minutes ?? 60 });
}

export async function PUT(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const { reminderMinutes } = (await request.json()) as { reminderMinutes?: unknown };
  if (reminderMinutes !== 0 && reminderMinutes !== 30 && reminderMinutes !== 60) {
    return NextResponse.json({ error: "Preferência de lembrete inválida." }, { status: 400 });
  }
  const { error } = await createAdminClient().from("notification_preferences").upsert(
    { user_id: user.id, reminder_minutes: reminderMinutes },
    { onConflict: "user_id" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reminderMinutes });
}
