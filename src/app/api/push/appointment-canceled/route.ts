import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient, sendPushToUser } from "@/lib/push";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await createServerSupabaseClient();
  const {
    data: { user },
  } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const { appointmentId } = (await request.json()) as { appointmentId?: unknown };
  if (typeof appointmentId !== "string") {
    return NextResponse.json({ error: "Agendamento inválido." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: appointment, error } = await admin
    .from("appointments")
    .select("id, client_id, service, date, time, barbers(user_id), profiles(name)")
    .eq("id", appointmentId)
    .eq("status", "canceled")
    .single();

  if (error || !appointment || appointment.client_id !== user.id) {
    return NextResponse.json({ error: "Agendamento não encontrado." }, { status: 404 });
  }

  const barber = appointment.barbers as unknown as { user_id: string } | null;
  const client = appointment.profiles as unknown as { name: string } | null;
  if (!barber?.user_id) return NextResponse.json({ sent: 0 });

  const { data: event, error: rawEventError } = await admin
    .from("push_notification_events")
    .insert({
      appointment_id: appointment.id,
      recipient_user_id: barber.user_id,
      event_type: "appointment_canceled",
    })
    .select("id")
    .maybeSingle();

  const eventError = rawEventError as { code?: string; message?: string } | null;
  if (eventError?.code === "23505" || !event) return NextResponse.json({ sent: 0 });
  if (eventError) return NextResponse.json({ error: eventError.message ?? "Erro ao registrar a notificação." }, { status: 500 });

  try {
    const result = await sendPushToUser(barber.user_id, {
      title: "Agendamento cancelado",
      body: `${client?.name ?? "Cliente"} cancelou ${appointment.service} de ${appointment.date.split("-").reverse().join("/")} às ${appointment.time}.`,
      url: "/barbeiro",
      tag: `canceled-${appointment.id}`,
    });
    await admin.from("push_notification_events").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", event.id);
    return NextResponse.json(result);
  } catch (sendError) {
    await admin.from("push_notification_events").update({ status: "failed", error_message: sendError instanceof Error ? sendError.message : "Falha ao enviar notificação" }).eq("id", event.id);
    return NextResponse.json({ error: "Não foi possível enviar a notificação." }, { status: 502 });
  }
}
