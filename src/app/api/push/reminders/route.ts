import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, sendPushToUser } from "@/lib/push";

export const runtime = "nodejs";

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

function appointmentTime(date: string, time: string) {
  return new Date(`${date}T${time}:00-03:00`);
}

function localDate(offsetDays: number) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date(Date.now() + offsetDays * 86400000)).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const supabase = createAdminClient();
  const { data: appointments, error } = await supabase
    .from("appointments")
    .select("id, client_id, service, date, time")
    .in("date", [localDate(0), localDate(1)])
    .eq("status", "confirmed");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let sent = 0;
  for (const appointment of appointments ?? []) {
    const { data: preference } = await supabase
      .from("notification_preferences")
      .select("reminder_minutes")
      .eq("user_id", appointment.client_id)
      .maybeSingle();
    const reminderMinutes = preference?.reminder_minutes ?? 60;
    if (reminderMinutes === 0) continue;

    const scheduledFor = new Date(appointmentTime(appointment.date, appointment.time).getTime() - reminderMinutes * 60000);
    const now = new Date();
    if (now < scheduledFor || now.getTime() - scheduledFor.getTime() > 10 * 60000) continue;

    const { data: delivery } = await supabase
      .from("notification_deliveries")
      .insert({ appointment_id: appointment.id, recipient_user_id: appointment.client_id, kind: "appointment_reminder", reminder_minutes: reminderMinutes, scheduled_for: scheduledFor.toISOString() })
      .select("id")
      .maybeSingle();
    if (!delivery) continue;

    try {
      const result = await sendPushToUser(appointment.client_id, {
        title: "Seu horário está chegando",
        body: `${appointment.service} hoje às ${appointment.time}.`,
        url: "/cliente",
        tag: `reminder-${appointment.id}`,
      });
      await supabase.from("notification_deliveries").update({ status: result.sent > 0 ? "sent" : "no_subscription", sent_at: new Date().toISOString() }).eq("id", delivery.id);
      sent += result.sent;
    } catch (sendError) {
      await supabase.from("notification_deliveries").update({ status: "failed", error_message: sendError instanceof Error ? sendError.message : "Falha ao enviar notificação" }).eq("id", delivery.id);
    }
  }
  return NextResponse.json({ sent });
}
