import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient, sendPushToUser } from "@/lib/push";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await createServerSupabaseClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const { appointmentId } = (await request.json()) as { appointmentId?: unknown };
  if (typeof appointmentId !== "string") {
    return NextResponse.json({ error: "Agendamento inválido." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: appointment, error } = await admin
    .from("appointments")
    .select("id, client_id, barber_id, service, date, time, barbers(user_id, display_name), profiles(name)")
    .eq("id", appointmentId)
    .single();

  if (error || !appointment || appointment.client_id !== user.id) {
    return NextResponse.json({ error: "Agendamento não encontrado." }, { status: 404 });
  }

  const barber = appointment.barbers as unknown as { user_id: string; display_name: string } | null;
  const client = appointment.profiles as unknown as { name: string } | null;
  if (!barber?.user_id) return NextResponse.json({ sent: 0 });

  const result = await sendPushToUser(barber.user_id, {
    title: "Novo agendamento",
    body: `${client?.name ?? "Cliente"}: ${appointment.service} em ${appointment.date.split("-").reverse().join("/")} às ${appointment.time}.`,
    url: "/barbeiro",
    tag: `appointment-${appointment.id}`,
  });
  return NextResponse.json(result);
}
