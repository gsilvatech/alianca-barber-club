"use client";

import { Bell, BellOff, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

type ReminderMinutes = 0 | 30 | 60;

function vapidKeyToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from(rawData, (character) => character.charCodeAt(0));
}

export default function NotificationSettings({ isClient }: { isClient: boolean }) {
  const [enabled, setEnabled] = useState(false);
  const [reminderMinutes, setReminderMinutes] = useState<ReminderMinutes>(60);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [subscription, preference] = await Promise.all([
          fetch("/api/push/subscriptions"),
          isClient ? fetch("/api/push/preferences") : Promise.resolve(null),
        ]);
        if (subscription.ok) setEnabled((await subscription.json()).enabled);
        if (preference?.ok) setReminderMinutes((await preference.json()).reminderMinutes);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [isClient]);

  async function enableNotifications() {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) return setMessage("As notificações ainda não foram configuradas no servidor.");
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return setMessage("Este navegador não oferece suporte a notificações.");

    setSaving(true);
    setMessage("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setMessage("Permissão não concedida. Ative-a nas configurações do navegador.");
      const registration = await navigator.serviceWorker.register("/sw.js");
      const subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKeyToUint8Array(publicKey),
      });
      const response = await fetch("/api/push/subscriptions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(subscription) });
      if (!response.ok) throw new Error((await response.json()).error);
      setEnabled(true);
      setMessage("Notificações ativadas neste aparelho.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível ativar as notificações.");
    } finally { setSaving(false); }
  }

  async function disableNotifications() {
    setSaving(true);
    setMessage("");
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        const response = await fetch("/api/push/subscriptions", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint }) });
        if (!response.ok) throw new Error((await response.json()).error);
        await subscription.unsubscribe();
      }
      setEnabled(false);
      setMessage("Notificações desativadas neste aparelho.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível desativar as notificações.");
    } finally { setSaving(false); }
  }

  async function saveReminder(value: ReminderMinutes) {
    setReminderMinutes(value);
    setSaving(true);
    try {
      const response = await fetch("/api/push/preferences", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ reminderMinutes: value }) });
      if (!response.ok) throw new Error((await response.json()).error);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar a preferência.");
    } finally { setSaving(false); }
  }

  if (loading) return null;
  const isIosBrowser = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isInstalledOnIos = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 flex flex-col gap-4 shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
    <div className="flex items-start gap-3"><div className="p-2.5 rounded-xl bg-amber-400/10 text-amber-400"><Bell size={20} /></div><div className="flex-1"><h3 className="font-bold text-zinc-100">Notificações</h3><p className="text-xs text-zinc-500 mt-0.5">{isClient ? "Receba um lembrete antes do seu horário." : "Receba avisos quando um cliente fizer um agendamento."}</p></div></div>
    {isClient && enabled && <div className="flex flex-col gap-2 border-t border-zinc-800 pt-4"><span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Lembrar</span><div className="grid grid-cols-3 gap-2">{([60, 30, 0] as ReminderMinutes[]).map((value) => <button key={value} type="button" disabled={saving} onClick={() => saveReminder(value)} className={`rounded-xl py-2 text-xs font-bold transition-colors ${reminderMinutes === value ? "bg-amber-400 text-zinc-950" : "bg-zinc-800 text-zinc-400 hover:text-white"}`}>{value === 0 ? "Não lembrar" : `${value} min antes`}</button>)}</div></div>}
    <button type="button" onClick={enabled ? disableNotifications : enableNotifications} disabled={saving} className={`w-full py-3 rounded-xl text-xs font-black uppercase tracking-wider flex justify-center items-center gap-2 disabled:opacity-50 ${enabled ? "bg-zinc-800 border border-zinc-700 text-zinc-300" : "bg-amber-400 hover:bg-amber-300 text-zinc-950"}`}>{saving ? <Loader2 size={16} className="animate-spin" /> : enabled ? <BellOff size={16} /> : <Bell size={16} />}{enabled ? "Desativar neste aparelho" : "Ativar notificações"}</button>
    {message && <p className="text-xs text-zinc-400 text-center">{message}</p>}
    {isIosBrowser && !isInstalledOnIos && !enabled && <p className="text-xs text-zinc-500 text-center">No iPhone, toque em Compartilhar e escolha “Adicionar à Tela de Início” antes de ativar.</p>}
  </section>;
}
