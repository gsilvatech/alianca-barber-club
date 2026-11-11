"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import DailyWord from "@/components/DailyWord";
import { HOURS } from "@/lib/constant";
import {
  Home as HomeIcon,
  Clock,
  PlusCircle,
  Award,
  User,
  MapPin,
  ChevronLeft,
  LogOut,
  AlertTriangle,
  Edit2,
  CreditCard,
  Lock,
} from "lucide-react";

// funções de data e hora
const getLocalDateStr = (d = new Date()) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const timeToMinutes = (timeStr: string): number => {
  const [hours, minutes] = timeStr.split(":").map(Number);
  return hours * 60 + minutes;
};

const isPast = (dateStr: string, timeStr: string) => {
  if (!dateStr || !timeStr) return false;
  const now = new Date();
  const cleanDate = dateStr.split("T")[0];
  const [year, month, day] = cleanDate.split("-").map(Number);
  const [hours, minutes] = timeStr.split(":").map(Number);
  const apptDate = new Date(year, month - 1, day, hours, minutes + 30);
  return now > apptDate;
};

// --- HELPER DE DURAÇÃO SEGURA ---
const getServiceDuration = (
  serviceString: string,
  servicesList: any[],
  savedDuration?: number | null,
): number => {
  const persistedDuration = Number(savedDuration);
  if (Number.isFinite(persistedDuration) && persistedDuration > 0) {
    return persistedDuration;
  }

  if (!serviceString) return 60;

  let cleanName = serviceString.trim();

  if (cleanName.startsWith("MANUAL:")) {
    cleanName = cleanName.split(" - ")[1]?.trim() || cleanName;
  }

  const isPlanUsage = cleanName.startsWith("PLANO: ");
  const isPlanAcquisition = cleanName.startsWith("Aquisição de Plano:");
  const isPlan = isPlanUsage || isPlanAcquisition;

  if (isPlanUsage) {
    cleanName = cleanName.replace("PLANO: ", "").trim();
  } else if (isPlanAcquisition) {
    cleanName = cleanName.replace("Aquisição de Plano:", "").trim();
  }

  const nameLower = cleanName.toLowerCase();

  // O cadastro do barbeiro é a fonte da verdade. As regras abaixo são apenas
  // um fallback para históricos cujo serviço não exista mais.
  const svc = servicesList.find(
    (s) => s.name.trim().toLowerCase() === nameLower,
  );
  if (svc?.duration) return Number(svc.duration);

  const temCabelo = nameLower.includes("cabelo") || nameLower.includes("corte");
  const temBarba = nameLower.includes("barba");
  const temQuimica =
    nameLower.includes("nevou") ||
    nameLower.includes("luzes") ||
    nameLower.includes("selagem") ||
    nameLower.includes("platinado");

  if (temQuimica) return 120;
  if (temCabelo && temBarba) return 60;

  if (isPlan) {
    if (temCabelo) return 40;
    if (temBarba) return 30;
  }

  return 60;
};

type Barber = { id: string; display_name: string; whatsapp: string };
type Appointment = {
  id: string;
  service: string;
  date: string;
  time: string;
  status: string;
  barber_id: string;
  duration_applied?: number | null;
  client_plan_id?: string;
  barbers: { display_name: string };
};
type BarberService = {
  id: string;
  name: string;
  price: number;
  duration: number;
};

export default function ClientePage() {
  const router = useRouter();
  const supabase = createClient();

  const [activeTab, setActiveTab] = useState<
    "home" | "historico" | "agendar" | "planos" | "perfil"
  >("home");

  // Dados do Banco
  const [profile, setProfile] = useState<{
    id?: string;
    name: string;
    birth_date?: string;
    phone?: string;
    require_password_change?: boolean;
  } | null>(null);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [pastAppointments, setPastAppointments] = useState<Appointment[]>([]);
  const [blockedDates, setBlockedDates] = useState<string[]>([]);
  const [takenSlots, setTakenSlots] = useState<string[]>([]);
  const [servicesList, setServicesList] = useState<BarberService[]>([]);

  // ESTADO DO DASHBOARD VIP (PLANO ATIVO)
  const [activePlan, setActivePlan] = useState<any>(null);

  // Form state do Novo Agendamento
  const [barberId, setBarberId] = useState("");
  const [service, setService] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // Estado de erro dos Calendários
  const [dateError, setDateError] = useState("");
  const [editDateError, setEditDateError] = useState("");

  // CONTROLE DO FLUXO VIP DE RECORRÊNCIA
  const [bookingViaPlan, setBookingViaPlan] = useState(false);
  const [planToBuy, setPlanToBuy] = useState<{
    nome: string;
    preco: number;
  } | null>(null);

  // LÓGICA DA TRAVA DE PLANOS
  let isPlanFullyActive = false;
  let activePlanBarberName = "";

  if (activePlan) {
    const sd = activePlan.start_date
      ? activePlan.start_date.split("T")[0]
      : activePlan.created_at.split("T")[0];
    const [py, pm, pd] = sd.split("-").map(Number);
    const expDate = new Date(py, pm - 1, pd);
    expDate.setDate(expDate.getDate() + 30);
    const diffDays = Math.ceil(
      (expDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24),
    );
    const remainingCuts = activePlan.cuts_allowed - activePlan.cuts_used;

    // Só trava se ainda tiver cortes disponíveis E o prazo não tiver vencido
    if (remainingCuts > 0 && diffDays > 0) {
      isPlanFullyActive = true;
      activePlanBarberName =
        barbers.find((b) => b.id === activePlan.barber_id)?.display_name ||
        "seu barbeiro";
    }
  }

  const [cancelConfirm, setCancelConfirm] = useState<{
    id: string;
    barber: string;
    service: string;
    date: string;
    time: string;
    client_plan_id?: string;
  } | null>(null);

  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editPhone, setEditPhone] = useState("");
  const [editBirthDate, setEditBirthDate] = useState("");
  const [loadingProfile, setLoadingProfile] = useState(false);

  const [editingAppointment, setEditingAppointment] =
    useState<Appointment | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [editTakenSlots, setEditTakenSlots] = useState<string[]>([]);

  function handleOpenMaps() {
    const endereco =
      "Aliança Barber Club, Rua 50, 65 - Vila Santa Cecília, Volta Redonda - RJ, 27261-040";
    const urlUniversal = `https://www.google.com/maps/search/?api=1&query=$$$${encodeURIComponent(endereco)}`;
    window.open(urlUniversal, "_blank");
  }

  async function cancelAppointment(
    id: string,
    barber: string,
    service: string,
    date: string,
    time: string,
    client_plan_id?: string,
  ) {
    setCancelConfirm({ id, barber, service, date, time, client_plan_id });
  }

  async function confirmCancel() {
    if (!cancelConfirm) return;

    const { error } = await supabase
      .from("appointments")
      .update({ status: "canceled" })
      .eq("id", cancelConfirm.id);

    if (!error) {
      setAppointments((prev) => prev.filter((a) => a.id !== cancelConfirm.id));

      if (cancelConfirm.client_plan_id) {
        const { data: pData } = await supabase
          .from("client_plans")
          .select("cuts_used")
          .eq("id", cancelConfirm.client_plan_id)
          .single();

        if (pData && pData.cuts_used > 0) {
          const { error: estornoError } = await supabase
            .from("client_plans")
            .update({ cuts_used: pData.cuts_used - 1 })
            .eq("id", cancelConfirm.client_plan_id);

          if (estornoError) {
            console.error("Erro RLS ao devolver corte:", estornoError);
          } else if (
            activePlan &&
            activePlan.id === cancelConfirm.client_plan_id
          ) {
            setActivePlan((prev: any) => ({
              ...prev,
              cuts_used: pData.cuts_used - 1,
            }));
          }
        }
      }

      const barber = barbers.find(
        (b) => b.display_name === cancelConfirm.barber,
      );
      if (barber) {
        const msg = encodeURIComponent(
          `Olá ${cancelConfirm.barber}! Precisei cancelar meu agendamento de *${cancelConfirm.service}* do dia *${cancelConfirm.date}* às *${cancelConfirm.time}*. Nome: ${profile?.name}`,
        );
        const urlCancel = `https://api.whatsapp.com/send?phone=55${barber.whatsapp}&text=${msg}`;
        window.location.href = urlCancel;
      }
    }
    setCancelConfirm(null);
  }

  async function handleReschedule() {
    if (!editingAppointment || !editDate || !editTime) return;
    setIsUpdating(true);

    const { error } = await supabase
      .from("appointments")
      .update({ date: editDate, time: editTime })
      .eq("id", editingAppointment.id);

    if (!error) {
      const barber = barbers.find((b) => b.id === editingAppointment.barber_id);
      if (barber) {
        const [y, m, d] = editDate.split("-");
        const msg = encodeURIComponent(
          `Olá ${barber.display_name}! Remarquei meu agendamento de *${editingAppointment.service}* para o dia *${d}/${m}/${y}* às *${editTime}*. Nome: ${profile?.name}`,
        );
        const urlWhatsapp = `https://api.whatsapp.com/send?phone=55${barber.whatsapp}&text=${msg}`;
        setTimeout(() => {
          window.location.href = urlWhatsapp;
        }, 100);
      }

      const todayStr = getLocalDateStr();
      const { data: updatedAppts } = await supabase
        .from("appointments")
        .select(
          "id, service, date, time, status, barber_id, duration_applied, barbers(display_name)",
        )
        .eq("client_id", profile!.id)
        .eq("status", "confirmed")
        .gte("date", todayStr)
        .order("date")
        .order("time")
        .limit(5);

      setAppointments((updatedAppts as any) || []);
      setEditingAppointment(null);
    } else {
      alert("Erro ao remarcar. Tente novamente.");
    }
    setIsUpdating(false);
  }

  async function handleAgendar() {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      let appliedPrice = 0;
      let finalServiceTag = service;

      if (bookingViaPlan && activePlan) {
        appliedPrice = 0;
        finalServiceTag = `PLANO: ${activePlan.plan_name}`;
      } else if (planToBuy) {
        appliedPrice = planToBuy.preco;
        finalServiceTag = `Aquisição de Plano: ${planToBuy.nome}`;
      } else {
        const svcDetails = servicesList.find((s) => s.name === service);
        if (!svcDetails) {
          alert("Erro ao identificar o serviço.");
          setLoading(false);
          return;
        }
        appliedPrice = svcDetails.price;
      }

      const durationApplied = getServiceDuration(finalServiceTag, servicesList);

      const { error } = await supabase.from("appointments").insert({
        client_id: user!.id,
        barber_id: barberId,
        service: finalServiceTag,
        date,
        time,
        status: "confirmed",
        price_applied: appliedPrice,
        duration_applied: durationApplied,
        client_plan_id: bookingViaPlan ? activePlan.id : null,
      });

      if (!error) {
        if (bookingViaPlan && activePlan) {
          const { error: planError } = await supabase
            .from("client_plans")
            .update({ cuts_used: activePlan.cuts_used + 1 })
            .eq("id", activePlan.id);
          if (planError) {
            console.error("Erro RLS ao descontar corte:", planError);
          } else {
            setActivePlan((prev: any) => ({
              ...prev,
              cuts_used: activePlan.cuts_used + 1,
            }));
          }
        }

        const barber = barbers.find((b) => b.id === barberId)!;
        const [y, m, d] = date.split("-");

        const textoMensagem = `Olá ${barber.display_name}! Acabei de agendar um *${bookingViaPlan ? activePlan.plan_name : service}* para o dia *${d}/${m}/${y}* às *${time}*. ${bookingViaPlan ? "Debitado do meu Plano Ativo" : `Valor: R$ ${appliedPrice.toFixed(2).replace(".", ",")}`}. Nome: ${profile?.name}`;
        const urlWorkspace = `https://api.whatsapp.com/send?phone=55${barber.whatsapp}&text=${encodeURIComponent(textoMensagem)}`;

        setSuccess(true);
        setStep(1);
        setBarberId("");
        setService("");
        setDate("");
        setTime("");
        setBookingViaPlan(false);
        setActiveTab("home");

        setTimeout(() => {
          window.location.href = urlWorkspace;
        }, 100);
      } else {
        alert(`Não foi possível concluir o agendamento: ${error.message}`);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // CARREGAMENTO INICIAL COM INTERCEPTAÇÃO DE SENHA PROVISÓRIA
  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      const todayStr = getLocalDateStr();

      const [
        { data: prof },
        { data: barb },
        { data: upcomingAppts },
        { data: pastAppts },
        { data: planData },
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, name, birth_date, phone, require_password_change")
          .eq("id", user.id)
          .single(),
        supabase.from("barbers").select("id, display_name, whatsapp"),
        supabase
          .from("appointments")
          .select(
            "id, service, date, time, status, barber_id, duration_applied, client_plan_id, barbers(display_name)",
          )
          .eq("client_id", user.id)
          .eq("status", "confirmed")
          .gte("date", todayStr)
          .order("date")
          .order("time")
          .limit(5),
        supabase
          .from("appointments")
          .select(
            "id, service, date, time, status, barber_id, duration_applied, barbers(display_name)",
          )
          .eq("client_id", user.id)
          .eq("status", "confirmed")
          .lt("date", todayStr)
          .order("date", { ascending: false })
          .limit(10),
        supabase
          .from("client_plans")
          .select(
            "id, plan_name, price_paid, cuts_allowed, cuts_used, status, start_date, barber_id, created_at",
          )
          .eq("client_id", user.id)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(1),
      ]);

      if (prof?.require_password_change) {
        router.push("/atualizar-senha?forced=true");
        return;
      }

      setProfile(prof);
      setBarbers(barb || []);
      setAppointments((upcomingAppts as any) || []);
      setPastAppointments((pastAppts as any) || []);
      setActivePlan(planData && planData.length > 0 ? planData[0] : null);

      if (prof) {
        setEditPhone(prof.phone || "");
        setEditBirthDate(prof.birth_date || "");
      }
    }
    load();
  }, [activeTab]);

  useEffect(() => {
    setDate("");
    setTime("");
    setTakenSlots([]);

    if (!barberId) {
      setServicesList([]);
      return;
    }

    let cancelled = false;

    async function loadBarberServices() {
      const { data } = await supabase
        .from("services")
        .select("*")
        .eq("barber_id", barberId)
        .order("name");
      if (!cancelled) setServicesList(data || []);
    }

    loadBarberServices();
    return () => {
      cancelled = true;
    };
  }, [barberId]);

  useEffect(() => {
    if (!barberId) return;
    async function loadBlocked() {
      const { data } = await supabase
        .from("blocked_dates")
        .select("date")
        .eq("barber_id", barberId);
      setBlockedDates((data || []).map((d: any) => d.date));
    }
    loadBlocked();
  }, [barberId]);

  useEffect(() => {
    if (!barberId || !date || !service || servicesList.length === 0) return;

    async function loadSlots() {
      const { data } = await supabase
        .from("appointments")
        .select("time, service, duration_applied")
        .eq("barber_id", barberId)
        .eq("date", date)
        .eq("status", "confirmed");

      const existingAppts = data || [];
      const blocked: string[] = [];
      const closingTime = timeToMinutes("19:00");
      const maxStartTime = timeToMinutes("18:00");
      const lunchStart = timeToMinutes("12:00");
      const lunchEnd = timeToMinutes("13:00");

      const finalServiceTag =
        bookingViaPlan && activePlan
          ? `PLANO: ${activePlan.plan_name}`
          : service;
      const duration = getServiceDuration(finalServiceTag, servicesList);

      HOURS.forEach((slot) => {
        const slotStart = timeToMinutes(slot);
        const slotEnd = slotStart + duration;

        if (slotStart > maxStartTime || slotEnd > closingTime) {
          blocked.push(slot);
          return;
        }
        if (
          (slotStart >= lunchStart && slotStart < lunchEnd) ||
          (slotStart < lunchStart && slotEnd > lunchStart)
        ) {
          blocked.push(slot);
          return;
        }

        const nomeServicoTratado = finalServiceTag.toLowerCase();
        if (
          nomeServicoTratado.includes("nevou") &&
          slotStart > timeToMinutes("15:00")
        ) {
          blocked.push(slot);
          return;
        }
        if (
          nomeServicoTratado.includes("selagem") &&
          slotStart > timeToMinutes("16:00")
        ) {
          blocked.push(slot);
          return;
        }

        const hasConflict = existingAppts.some((appt: any) => {
          const apptStart = timeToMinutes(appt.time);

          const apptDuration = getServiceDuration(
            appt.service,
            servicesList,
            appt.duration_applied,
          );

          const apptEnd = apptStart + apptDuration;
          return slotStart < apptEnd && slotEnd > apptStart;
        });

        if (hasConflict) blocked.push(slot);
      });
      setTakenSlots(blocked);
    }
    loadSlots();
  }, [barberId, date, service, servicesList, bookingViaPlan]);

  useEffect(() => {
    if (!editingAppointment || !editDate || servicesList.length === 0) return;

    async function loadEditSlots() {
      const { data } = await supabase
        .from("appointments")
        .select("time, service, duration_applied")
        .eq("barber_id", editingAppointment!.barber_id)
        .eq("date", editDate)
        .eq("status", "confirmed");

      const existingAppts = data || [];
      const blocked: string[] = [];
      const closingTime = timeToMinutes("19:00");
      const limitNevouClient = timeToMinutes("15:00");
      const lunchStart = timeToMinutes("12:00");
      const lunchEnd = timeToMinutes("13:00");

      const duration = getServiceDuration(
        editingAppointment!.service,
        servicesList,
        editingAppointment!.duration_applied,
      );

      HOURS.forEach((slot) => {
        const slotStart = timeToMinutes(slot);
        const slotEnd = slotStart + duration;

        if (
          editDate === editingAppointment!.date &&
          slot === editingAppointment!.time
        ) {
          return;
        }
        if (slotEnd > closingTime) {
          blocked.push(slot);
          return;
        }
        if (
          editingAppointment!.service.toLowerCase().includes("nevou") &&
          slotStart > limitNevouClient
        ) {
          blocked.push(slot);
          return;
        }
        if (
          (slotStart >= lunchStart && slotStart < lunchEnd) ||
          (slotStart < lunchStart && slotEnd > lunchStart)
        ) {
          blocked.push(slot);
          return;
        }

        const hasConflict = existingAppts.some((appt: any) => {
          if (
            appt.time === editingAppointment!.time &&
            editDate === editingAppointment!.date
          )
            return false;
          const apptStart = timeToMinutes(appt.time);

          const apptDuration = getServiceDuration(
            appt.service,
            servicesList,
            appt.duration_applied,
          );

          const apptEnd = apptStart + apptDuration;
          return slotStart < apptEnd && slotEnd > apptStart;
        });

        if (hasConflict) blocked.push(slot);
      });
      setEditTakenSlots(blocked);
    }
    loadEditSlots();
  }, [editDate, editingAppointment, servicesList]);

  async function handleUpdateProfile() {
    if (!profile) return;
    setLoadingProfile(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from("profiles")
      .update({ phone: editPhone, birth_date: editBirthDate || null })
      .eq("id", user.id);

    if (!error) {
      let foiFundido = false;
      if (editPhone) {
        const { data: mergeResult } = await supabase.rpc(
          "merge_ghost_profile",
          { user_phone: editPhone },
        );
        foiFundido = mergeResult;
      }

      setProfile((prev: any) => ({
        ...prev,
        phone: editPhone,
        birth_date: editBirthDate,
      }));
      setIsEditingProfile(false);

      if (foiFundido) {
        alert(
          "Uau! 🎉 Identificamos que você já é de casa. O seu Plano Ativo e o seu Histórico de Cortes foram sincronizados automaticamente com a sua nova conta!",
        );
      } else {
        alert(
          "Perfil atualizado com sucesso! 💎 Seja muito bem-vindo à Aliança Barber Club.",
        );
      }

      window.location.reload();
    } else {
      alert("Erro ao atualizar o perfil.");
    }
    setLoadingProfile(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  const minDate = getLocalDateStr();
  const isDateBlocked = (d: string) => {
    if (!d) return false;
    const day = new Date(d + "T12:00:00").getDay();

    // Bloqueia Domingos (0) ou datas que estão na lista de bloqueio
    if (day === 0 || blockedDates.includes(d)) return true;

    // Bloqueio dos sábados que o 01 pediu
    const ID_01DoCorte = "04e1c5c9-2245-438b-a20c-f15f6b2d33b1";
    if (day === 6 && bookingViaPlan && barberId === ID_01DoCorte) {
      return true;
    }

    return false;
  };

  const isEditDateBlocked = (d: string) => {
    if (!d) return false;
    const day = new Date(d + "T12:00:00").getDay();

    if (day === 0 || blockedDates.includes(d)) return true;

    const ID_01DoCorte = "04e1c5c9-2245-438b-a20c-f15f6b2d33b1";
    const isPlanAppointment = !!editingAppointment?.client_plan_id;

    if (
      day === 6 &&
      isPlanAppointment &&
      editingAppointment?.barber_id === ID_01DoCorte
    ) {
      return true;
    }

    return false;
  };

  const NavButton = ({ icon: Icon, label, tabId }: any) => (
    <button
      onClick={() => {
        setActiveTab(tabId);
        setPlanToBuy(null);
        setBookingViaPlan(false);
        setStep(1);
        setBarberId("");
        setService("");
      }}
      className={`flex flex-col items-center justify-center gap-1 transition-all ${activeTab === tabId ? "text-amber-400 scale-110" : "text-zinc-500 hover:text-zinc-300"}`}
    >
      <Icon size={20} />
      <span className="text-[10px] font-bold uppercase tracking-tighter">
        {label}
      </span>
    </button>
  );

  return (
    <main className="min-h-screen bg-zinc-950 text-white pb-28">
      <header className="bg-zinc-900/50 backdrop-blur-md border-b border-zinc-800 px-4 py-6 sticky top-0 z-40">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="w-16" />
          <img
            src="/logo aliança1.png"
            alt="Aliança Barber Club"
            className="absolute left-1/2 -translate-x-1/2 -translate-y-1 h-24 w-auto mix-blend-lighten pointer-events-none"
          />
          <button
            onClick={handleLogout}
            className="text-zinc-500 text-xs font-bold hover:text-red-400 transition-colors w-16 text-right"
          >
            Sair
          </button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-6">
        {/* HOME */}
        {activeTab === "home" && (
          <div className="flex flex-col gap-6 animate-in fade-in duration-500">
            <div>
              <h2 className="text-2xl font-bold italic tracking-tight">
                Olá, {profile?.name?.split(" ")[0]}! 👋
              </h2>
              <p className="text-zinc-500 text-sm mt-1">
                Bem-vindo de volta à Aliança.
              </p>
            </div>

            {/* DASHBOARD CARD VIP DO CLIENTE COM ALERTA DE RENOVAÇÃO */}
            {activePlan &&
              (() => {
                const sd = activePlan.start_date
                  ? activePlan.start_date.split("T")[0]
                  : activePlan.created_at.split("T")[0];
                const [y, m, d] = sd.split("-").map(Number);
                const expDate = new Date(y, m - 1, d);
                expDate.setDate(expDate.getDate() + 30);
                const diffTime = expDate.getTime() - new Date().getTime();
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                const remainingCuts =
                  activePlan.cuts_allowed - activePlan.cuts_used;

                let cardStyle = "border-amber-500/30";
                let badgeStyle =
                  "bg-amber-400/10 text-amber-400 border-amber-400/20";
                let badgeText = "MEMBRO BARBER CLUB";

                if (remainingCuts <= 0 || diffDays <= 0) {
                  cardStyle = "border-red-500/50 bg-red-950/10";
                  badgeStyle = "bg-red-500/10 text-red-400 border-red-500/20";
                  badgeText = "🔴 ESGOTADO";
                } else if (remainingCuts === 1 || diffDays <= 7) {
                  cardStyle = "border-orange-500/50 bg-orange-950/10";
                  badgeStyle =
                    "bg-orange-500/10 text-orange-400 border-orange-500/20";
                  badgeText = `🟡 ATENÇÃO (${diffDays} dias ou ${remainingCuts} corte rest.)`;
                }

                return (
                  <div
                    className={`bg-zinc-900 border p-5 rounded-3xl flex flex-col gap-3 shadow-[0_4px_25px_rgba(251,191,36,0.04)] animate-in slide-in-from-top-4 duration-300 ${cardStyle}`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest block mb-0.5">
                          Sua Assinatura Ativa
                        </span>
                        <h4 className="font-black italic text-base text-white">
                          {activePlan.plan_name}
                        </h4>
                      </div>
                      <span
                        className={`text-[9px] font-black uppercase px-2 py-1 rounded tracking-wider border ${badgeStyle}`}
                      >
                        {badgeText}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1.5 mt-1">
                      <div className="w-full bg-zinc-950 rounded-full h-2 overflow-hidden border border-zinc-800">
                        <div
                          className="bg-amber-400 h-2 rounded-full transition-all duration-500"
                          style={{
                            width: `${((activePlan.cuts_allowed - remainingCuts) / activePlan.cuts_allowed) * 100}%`,
                          }}
                        ></div>
                      </div>
                      <div className="flex justify-between text-[10px] font-bold text-zinc-500 uppercase mt-0.5">
                        <span>Saldo de Cortes</span>
                        <span className="text-zinc-300">
                          {remainingCuts} de {activePlan.cuts_allowed}{" "}
                          disponíveis
                        </span>
                      </div>
                    </div>
                    <div className="text-[10px] text-zinc-500 border-t border-zinc-800/60 pt-2.5 flex justify-between items-center font-mono">
                      <span>
                        Barbeiro Oficial:{" "}
                        <strong className="text-zinc-300">
                          {barbers.find((b) => b.id === activePlan.barber_id)
                            ?.display_name || "Carregando..."}
                        </strong>
                      </span>
                      <span>
                        Renovação:{" "}
                        {expDate
                          .toISOString()
                          .split("T")[0]
                          .split("-")
                          .reverse()
                          .join("/")}
                      </span>
                    </div>
                  </div>
                );
              })()}

            <DailyWord />

            {success && (
              <div className="bg-emerald-900/40 border border-emerald-600 rounded-xl px-4 py-3 text-emerald-400 text-sm font-medium flex items-center gap-2 animate-in fade-in">
                ✓ Agendamento confirmado! O WhatsApp do barbeiro foi aberto.
                <button
                  onClick={() => setSuccess(false)}
                  className="ml-auto text-emerald-600"
                >
                  ✕
                </button>
              </div>
            )}

            <section>
              <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-3">
                Seus Próximos Agendamentos
              </h3>
              <div className="flex flex-col gap-3">
                {appointments.length === 0 ? (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-6 text-center text-zinc-500 text-sm italic">
                    Nenhum agendamento confirmado. Clique no botão de "+" abaixo
                    para marcar!
                  </div>
                ) : (
                  appointments.map((a) => {
                    const [y, m, d] = a.date.split("-");
                    return (
                      <div
                        key={a.id}
                        className="bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-4 flex flex-col gap-3 shadow-[0_4px_20px_rgba(0,0,0,0.2)]"
                      >
                        <div className="flex items-center gap-4">
                          <div className="bg-amber-400 text-zinc-950 rounded-xl px-3 py-2 text-center min-w-[56px]">
                            <div className="text-xs font-bold leading-none">
                              {d}/{m}
                            </div>
                            <div className="text-base font-black mt-1 leading-none">
                              {a.time}
                            </div>
                          </div>
                          <div className="flex-1">
                            <div className="font-bold text-zinc-100 text-sm">
                              {a.service}
                            </div>
                            <div className="text-zinc-500 text-xs mt-0.5">
                              {(a.barbers as any)?.display_name}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2 border-t border-zinc-800/60 pt-3">
                          <button
                            onClick={() => {
                              setEditingAppointment(a);
                              setEditDate(a.date);
                              setEditTime(a.time);
                            }}
                            className="flex-1 flex items-center justify-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 bg-zinc-950/30 hover:bg-zinc-800 transition-colors font-bold border border-zinc-800 px-2 py-2 rounded-lg"
                          >
                            <Edit2 size={14} /> Remarcar
                          </button>
                          <button
                            onClick={() =>
                              cancelAppointment(
                                a.id,
                                (a.barbers as any)?.display_name,
                                a.service,
                                `${d}/${m}`,
                                a.time,
                                a.client_plan_id,
                              )
                            }
                            className="flex-1 flex items-center justify-center gap-1.5 text-xs text-red-400 hover:text-red-300 bg-zinc-950/30 hover:bg-zinc-800 transition-colors font-bold border border-zinc-800 px-2 py-2 rounded-lg"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            <section>
              <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-3">
                Onde Estamos?
              </h3>
              <div
                onClick={handleOpenMaps}
                className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-center justify-between cursor-pointer hover:border-zinc-700 transition-all active:scale-[0.98] shadow-[0_4px_20px_rgba(0,0,0,0.1)]"
              >
                <div className="flex items-center gap-3">
                  <div className="bg-zinc-800 p-3 rounded-xl text-amber-400">
                    <MapPin size={20} />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-zinc-100">
                      Aliança Barber Club
                    </h4>
                    <p className="text-zinc-400 text-xs mt-0.5">
                      Rua 50, Nº 65 - Vila Santa Cecília
                    </p>
                    <p className="text-zinc-500 text-[10px] mt-0.5">
                      Clique para abrir rotas no GPS (Maps, Waze)
                    </p>
                  </div>
                </div>
                <span className="text-xs text-amber-400 font-bold ml-2">
                  Como Chegar →
                </span>
              </div>
            </section>
          </div>
        )}

        {/* HISTÓRICO */}
        {activeTab === "historico" && (
          <div className="flex flex-col gap-4 animate-in fade-in duration-500">
            <div>
              <h2 className="text-xl font-bold italic">Seu Histórico</h2>
              <p className="text-zinc-500 text-xs">
                Acompanhe suas últimas visitas à Aliança.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              {pastAppointments.length === 0 ? (
                <p className="text-zinc-600 text-sm italic text-center py-8">
                  Nenhum corte passado registrado.
                </p>
              ) : (
                pastAppointments.map((a) => {
                  const [y, m, d] = a.date.split("-");
                  return (
                    <div
                      key={a.id}
                      className="bg-zinc-900/50 border border-zinc-900 px-4 py-3 rounded-xl flex justify-between items-center opacity-70"
                    >
                      <div>
                        <h4 className="font-semibold text-sm text-zinc-300">
                          {a.service}
                        </h4>
                        <p className="text-zinc-500 text-xs">
                          {(a.barbers as any)?.display_name}
                        </p>
                      </div>
                      <span className="text-zinc-400 font-bold text-xs">
                        {d}/{m}/{y} - {a.time}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* AGENDAR */}
        {activeTab === "agendar" && (
          <div className="flex flex-col gap-6 animate-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center gap-2">
              {step > 1 && (
                <button
                  onClick={() => {
                    if (bookingViaPlan) {
                      setBookingViaPlan(false);
                      setBarberId("");
                      setService("");
                      setStep(1);
                    } else if (planToBuy) {
                      setPlanToBuy(null);
                      setService("");
                      setBarberId("");
                      setStep(1);
                    } else {
                      setStep((prev) => prev - 1);
                    }
                  }}
                  className="p-1.5 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-400 hover:text-white transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
              )}
              <div>
                <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">
                  Novo Agendamento
                </h3>
                <p className="text-zinc-500 text-xs">Passo {step} de 3</p>
              </div>
            </div>

            <div className="flex gap-2 mb-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={`flex-1 h-1 rounded-full transition-colors ${step > i ? "bg-amber-400" : "bg-zinc-800"}`}
                />
              ))}
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 flex flex-col gap-5 shadow-[0_10px_30px_rgba(0,0,0,0.3)]">
              {step === 1 && (
                <div className="flex flex-col gap-3 animate-in fade-in duration-300">
                  {/* TRAVA ANTI-PREJUÍZO */}
                  {activePlan &&
                    (() => {
                      const sd = activePlan.start_date
                        ? activePlan.start_date.split("T")[0]
                        : activePlan.created_at.split("T")[0];
                      const [py, pm, pd] = sd.split("-").map(Number);
                      const expDate = new Date(py, pm - 1, pd);
                      expDate.setDate(expDate.getDate() + 30);
                      const diffDays = Math.ceil(
                        (expDate.getTime() - new Date().getTime()) /
                          (1000 * 60 * 60 * 24),
                      );
                      const remainingCuts =
                        activePlan.cuts_allowed - activePlan.cuts_used;

                      if (remainingCuts > 0 && diffDays > 0) {
                        return (
                          <button
                            onClick={() => {
                              setPlanToBuy(null);
                              setBookingViaPlan(true);
                              setBarberId(activePlan.barber_id);
                              setService(`PLANO: ${activePlan.plan_name}`);
                              setStep(3);
                            }}
                            className="w-full bg-gradient-to-r from-zinc-900 to-zinc-800 border border-amber-400/40 p-4 rounded-2xl flex items-center justify-between hover:border-amber-400 transition-all text-left group shadow-xl mb-2"
                          >
                            <div className="flex items-center gap-3">
                              <div className="bg-amber-400 p-2.5 rounded-xl text-zinc-950 group-hover:scale-110 transition-transform">
                                <CreditCard size={18} strokeWidth={2.5} />
                              </div>
                              <div>
                                <h4 className="font-bold text-white text-sm">
                                  Utilizar Meu Plano
                                </h4>
                                <p className="text-[10px] text-amber-400 font-bold uppercase mt-0.5 tracking-wider">
                                  {activePlan.plan_name} ({remainingCuts}{" "}
                                  restantes)
                                </p>
                              </div>
                            </div>
                            <span className="text-[10px] font-black bg-amber-400 text-zinc-950 px-2 py-1 rounded-md">
                              R$ 0,00
                            </span>
                          </button>
                        );
                      }
                      return null;
                    })()}

                  <label className="text-zinc-500 text-[10px] font-bold uppercase tracking-wider pl-1">
                    Ou escolha um profissional para atendimento avulso:
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {barbers.map((b) => (
                      <button
                        key={b.id}
                        onClick={() => {
                          setBarberId(b.id);
                          setService("");
                          if (planToBuy) {
                            setService(`Aquisição de Plano: ${planToBuy.nome}`);
                            setStep(3);
                          } else {
                            setStep(2);
                          }
                        }}
                        className={`py-4 px-4 rounded-xl text-sm font-bold border transition-all text-left ${barberId === b.id ? "bg-amber-400 text-zinc-950 border-amber-400" : "bg-zinc-800 border-zinc-700 text-white hover:border-amber-400"}`}
                      >
                        {b.display_name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="flex flex-col gap-3 animate-in fade-in duration-300">
                  <label className="text-zinc-400 text-xs font-bold uppercase tracking-wider">
                    Selecione o Serviço
                  </label>
                  <div className="flex flex-col gap-2">
                    {servicesList
                      .filter((s) => !s.name.toLowerCase().includes("plano"))
                      .map((s) => (
                        <button
                          key={s.id}
                          onClick={() => {
                            setService(s.name);
                            setStep(3);
                          }}
                          className={`py-4 px-4 rounded-xl text-sm border font-bold transition-all flex justify-between items-center text-left ${service === s.name ? "bg-amber-400 text-zinc-950 border-amber-400" : "bg-zinc-800 border-zinc-700 text-white hover:border-amber-400"}`}
                        >
                          <span>{s.name}</span>
                          <span
                            className={
                              service === s.name
                                ? "text-zinc-950 font-black"
                                : "text-amber-400 font-black"
                            }
                          >
                            R$ {s.price.toFixed(2).replace(".", ",")}
                          </span>
                        </button>
                      ))}
                    {servicesList.length === 0 && (
                      <p className="py-4 text-center text-xs text-zinc-500">
                        Este barbeiro ainda não cadastrou serviços.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="flex flex-col gap-4 animate-in fade-in duration-300">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-zinc-400 text-xs font-bold uppercase tracking-wider">
                      Selecione o Dia
                    </label>
                    <input
                      type="date"
                      min={minDate}
                      value={date}
                      onChange={(e) => {
                        const d = e.target.value;
                        if (!isDateBlocked(d)) {
                          setDate(d);
                          setTime("");
                          setDateError("");
                        } else {
                          setDate("");
                          // Verifica se o bloqueio foi causado pela regra do sábado no plano do 01
                          const day = new Date(d + "T12:00:00").getDay();
                          const ID_01DoCorte =
                            "04e1c5c9-2245-438b-a20c-f15f6b2d33b1";

                          if (
                            day === 6 &&
                            bookingViaPlan &&
                            barberId === ID_01DoCorte
                          ) {
                            setDateError(
                              "O seu Plano VIP é válido apenas de segunda a sexta-feira.",
                            );
                          } else {
                            setDateError(
                              "Domingos ou datas bloqueadas não estão disponíveis.",
                            );
                          }
                        }
                      }}
                      className={`bg-zinc-800 border ${dateError ? "border-red-500" : "border-zinc-700"} rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-amber-400 transition-colors [color-scheme:dark]`}
                    />

                    {dateError && (
                      <p className="text-red-400 text-xs font-bold px-1 animate-in fade-in">
                        ⚠️ {dateError}
                      </p>
                    )}
                  </div>

                  {date && !isDateBlocked(date) && (
                    <div className="flex flex-col gap-2 animate-in zoom-in-95 duration-200">
                      <label className="text-zinc-400 text-xs font-bold uppercase tracking-wider">
                        Horários Disponíveis
                      </label>
                      <div className="grid grid-cols-4 gap-2">
                        {HOURS.filter((h) => !takenSlots.includes(h)).map(
                          (h) => (
                            <button
                              key={h}
                              onClick={() => setTime(h)}
                              className={`py-3 rounded-xl text-xs font-bold border transition-all ${time === h ? "bg-amber-400 text-zinc-950 border-amber-400" : "bg-zinc-800 border-zinc-700 text-white hover:border-amber-400"}`}
                            >
                              {h}
                            </button>
                          ),
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {barberId && date && time && step === 3 && (
                <div className="border-t border-zinc-800 pt-4 flex flex-col gap-3 animate-in zoom-in-95 duration-300">
                  <div className="text-xs text-zinc-400 flex flex-col gap-1.5 bg-zinc-950/50 p-4 rounded-xl border border-zinc-800/60 font-medium">
                    <div>
                      Barbeiro:{" "}
                      <span className="text-white font-bold">
                        {barbers.find((b) => b.id === barberId)?.display_name}
                      </span>
                    </div>
                    <div>
                      Serviço:{" "}
                      <span className="text-white font-bold">
                        {bookingViaPlan ? activePlan.plan_name : service}
                      </span>
                    </div>
                    <div>
                      Data e Hora:{" "}
                      <span className="text-amber-400 font-bold">
                        {date.split("-").reverse().join("/")} às {time}
                      </span>
                    </div>
                    <div>
                      Total:{" "}
                      <span className="text-white font-black">
                        {bookingViaPlan
                          ? "R$ 0,00 (Assinatura VIP)"
                          : `R$ ${servicesList
                              .find((s) => s.name === service)
                              ?.price.toFixed(2)
                              .replace(".", ",")}`}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={handleAgendar}
                    disabled={loading}
                    className="bg-amber-400 text-zinc-950 font-black py-4 rounded-xl hover:bg-amber-300 transition-all disabled:opacity-50 flex items-center justify-center gap-2 uppercase tracking-wider text-xs shadow-[0_10px_25px_rgba(251,191,36,0.15)]"
                  >
                    {loading ? "Agendando..." : "✓ Confirmar e Notificar"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* CLUBE DE VANTAGENS / PLANOS */}
        {activeTab === "planos" && (
          <div className="flex flex-col gap-6 animate-in fade-in duration-500">
            <div className="text-center mt-2">
              <h2 className="text-2xl font-black italic text-amber-400">
                Assinaturas VIP
              </h2>
              <p className="text-zinc-400 text-xs mt-1">
                Cabelo e barba impecáveis o mês todo!
              </p>
            </div>

            {/* AVISO DA TRAVA SE TIVER PLANO ATIVO */}
            {isPlanFullyActive && (
              <div className="bg-amber-900/20 border border-amber-500/30 rounded-2xl p-4 text-center animate-in zoom-in-95">
                <p className="text-amber-400 text-sm font-bold">
                  ⚠️ Você já possui uma assinatura com {activePlanBarberName}!
                </p>
                <p className="text-zinc-400 text-xs mt-1.5 leading-relaxed">
                  Para evitar conflitos, você poderá adquirir um novo plano
                  apenas quando utilizar todos os cortes ou a assinatura atual
                  expirar.
                </p>
              </div>
            )}

            <div className="flex flex-col gap-6">
              {/* Card Plano Cabelo */}
              <div
                className={`bg-zinc-900 border border-zinc-800 rounded-3xl p-6 relative overflow-hidden shadow-xl transition-all ${isPlanFullyActive ? "opacity-40 grayscale pointer-events-none" : ""}`}
              >
                <div className="absolute top-0 right-0 bg-zinc-800 text-amber-500 text-[10px] font-black px-3 py-1 rounded-bl-xl uppercase tracking-widest">
                  Essencial
                </div>
                <h3 className="text-xl font-bold text-white mb-1">
                  Plano Cabelo
                </h3>
                <div className="flex items-baseline gap-1 mb-4">
                  <span className="text-3xl font-black text-amber-400">
                    R$150,00
                  </span>
                  <span className="text-xs text-zinc-500 font-bold">/mês</span>
                </div>
                <ul className="text-xs text-zinc-400 flex flex-col gap-2 mb-6">
                  <li className="flex gap-2 items-center">
                    <span className="text-amber-400">✓</span> 4 Cortes no mês
                  </li>
                </ul>
                <button
                  onClick={() => {
                    setPlanToBuy({ preco: 150, nome: "Plano Cabelo" });
                    setActiveTab("agendar");
                    setStep(1);
                  }}
                  className="w-full py-3 rounded-xl border border-amber-400 text-amber-400 hover:bg-amber-400 hover:text-zinc-950 font-bold text-sm transition-all"
                >
                  Adquirir Plano
                </button>
              </div>

              {/* Card Plano Cabelo e Barba */}
              <div
                className={`bg-gradient-to-br from-amber-500 to-amber-700 rounded-3xl p-6 relative shadow-[0_10px_30px_rgba(245,158,11,0.2)] transform transition-transform ${isPlanFullyActive ? "opacity-40 grayscale pointer-events-none" : "hover:scale-[1.02]"}`}
              >
                <div className="absolute top-0 right-0 bg-zinc-950 text-amber-400 text-[10px] font-black px-3 py-1 rounded-bl-xl uppercase tracking-widest">
                  Mais Vendido
                </div>
                <h3 className="text-xl font-bold text-zinc-950 mb-1">
                  Plano Cabelo e Barba
                </h3>
                <div className="flex items-baseline gap-1 mb-4 text-zinc-950">
                  <span className="text-3xl font-black">R$200,00</span>
                  <span className="text-xs font-bold opacity-80">/mês</span>
                </div>
                <ul className="text-xs text-zinc-900 font-medium flex flex-col gap-2 mb-6">
                  <li className="flex gap-2 items-center">
                    <span className="text-zinc-950 font-black">✓</span> 4 Cortes
                    no mês
                  </li>
                  <li className="flex gap-2 items-center">
                    <span className="text-zinc-950 font-black">✓</span> 4 Barbas
                    no mês
                  </li>
                </ul>
                <button
                  onClick={() => {
                    setPlanToBuy({ preco: 200, nome: "Plano Cabelo e Barba" });
                    setActiveTab("agendar");
                    setStep(1);
                  }}
                  className="w-full py-3 rounded-xl bg-zinc-950 text-amber-400 hover:bg-zinc-900 font-black text-sm transition-all shadow-lg"
                >
                  Adquirir Plano
                </button>
              </div>
            </div>
          </div>
        )}

        {/* PERFIL */}
        {activeTab === "perfil" && (
          <div className="flex flex-col gap-6 animate-in fade-in duration-500">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold italic">Seu Perfil</h2>
                <p className="text-zinc-500 text-xs">
                  Suas informações cadastradas.
                </p>
              </div>
              {!isEditingProfile && (
                <button
                  onClick={() => setIsEditingProfile(true)}
                  className="text-xs font-bold text-amber-400 border border-zinc-800 hover:border-amber-400/40 px-4 py-2 rounded-xl transition-all"
                >
                  Editar Perfil
                </button>
              )}
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 flex flex-col gap-4 shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-zinc-500 uppercase">
                  Nome completo
                </span>
                <span className="text-sm font-bold text-zinc-300 bg-zinc-950/20 px-1 py-1 rounded">
                  {profile?.name || "Não informado"}
                </span>
              </div>
              <div className="flex flex-col gap-1 border-t border-zinc-800/60 pt-3">
                <span className="text-[10px] font-bold text-zinc-500 uppercase">
                  WhatsApp
                </span>
                {isEditingProfile ? (
                  <input
                    type="text"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="(24) 99999-0000"
                    className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-amber-400 mt-1 transition-colors"
                  />
                ) : (
                  <span className="text-sm font-bold text-zinc-200">
                    {profile?.phone || "Não informado"}
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-1 border-t border-zinc-800/60 pt-3">
                <span className="text-[10px] font-bold text-zinc-500 uppercase">
                  Data de Nascimento
                </span>
                {isEditingProfile ? (
                  <input
                    type="date"
                    value={editBirthDate}
                    onChange={(e) => setEditBirthDate(e.target.value)}
                    className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-amber-400 outline-none focus:border-amber-400 mt-1 [color-scheme:dark]"
                  />
                ) : (
                  <span className="text-sm font-bold text-amber-400">
                    {profile?.birth_date
                      ? profile.birth_date.split("-").reverse().join("/")
                      : "Não informada"}
                  </span>
                )}
              </div>

              {isEditingProfile && (
                <div className="flex gap-3 mt-2 border-t border-zinc-800/60 pt-4 animate-in zoom-in-95 duration-200">
                  <button
                    onClick={() => {
                      setEditPhone(profile?.phone || "");
                      setEditBirthDate(profile?.birth_date || "");
                      setIsEditingProfile(false);
                    }}
                    disabled={loadingProfile}
                    className="flex-1 py-3 rounded-xl border border-zinc-800 text-zinc-400 hover:text-white text-xs font-bold uppercase tracking-wider"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleUpdateProfile}
                    disabled={loadingProfile}
                    className="flex-1 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-zinc-950 text-xs font-black uppercase tracking-wider disabled:opacity-50"
                  >
                    {loadingProfile ? "Salvando..." : "Salvar"}
                  </button>
                </div>
              )}

              {/* BOTÃO DE ALTERAR SENHA */}
              {!isEditingProfile && (
                <div className="flex flex-col gap-1 border-t border-zinc-800/60 pt-4 mt-2">
                  <button
                    onClick={() => router.push("/atualizar-senha")}
                    className="w-full py-3 rounded-xl bg-zinc-800 border border-zinc-700 hover:border-amber-400 text-white text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2"
                  >
                    <Lock size={16} className="text-amber-400" /> Alterar Minha
                    Senha
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* MODAIS DE AÇÃO */}

      {editingAppointment && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-4 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-sm flex flex-col gap-5">
            <div>
              <h3 className="font-bold text-lg italic text-amber-400">
                Remarcar Horário
              </h3>
              <p className="text-zinc-500 text-xs mt-1">
                Serviço:{" "}
                <span className="text-white font-medium">
                  {editingAppointment.service}
                </span>
              </p>
            </div>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-zinc-400 text-xs font-bold uppercase tracking-wider">
                  Nova Data
                </label>
                <input
                  type="date"
                  min={minDate}
                  value={editDate}
                  onChange={(e) => {
                    const d = e.target.value;
                    if (!isEditDateBlocked(d)) {
                      setEditDate(d);
                      setEditTime("");
                      setEditDateError("");
                    } else {
                      setEditDate("");
                      const day = new Date(d + "T12:00:00").getDay();
                      const ID_01DoCorte =
                        "04e1c5c9-2245-438b-a20c-f15f6b2d33b1";
                      const isPlanAppointment =
                        !!editingAppointment?.client_plan_id;

                      if (
                        day === 6 &&
                        isPlanAppointment &&
                        editingAppointment?.barber_id === ID_01DoCorte
                      ) {
                        setEditDateError(
                          "Remarcações do Plano VIP ocorrem apenas de segunda a sexta.",
                        );
                      } else {
                        setEditDateError(
                          "Esta data cai em um domingo ou está bloqueada.",
                        );
                      }
                    }
                  }}
                  className={`bg-zinc-800 border ${editDateError ? "border-red-500" : "border-zinc-700"} rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-amber-400 [color-scheme:dark]`}
                />

                {editDateError && (
                  <p className="text-red-400 text-xs font-bold px-1 animate-in fade-in">
                    ⚠️ {editDateError}
                  </p>
                )}
              </div>
              {editDate && !isEditDateBlocked(editDate) && (
                <div className="flex flex-col gap-1.5 animate-in zoom-in-95 duration-200">
                  <label className="text-zinc-400 text-xs font-bold uppercase tracking-wider">
                    Novo Horário
                  </label>
                  <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                    {HOURS.filter((h) => !editTakenSlots.includes(h)).map(
                      (h) => (
                        <button
                          key={h}
                          onClick={() => setEditTime(h)}
                          className={`py-3 rounded-xl text-xs font-bold border transition-all ${
                            editTime === h
                              ? "bg-amber-400 text-zinc-950 border-amber-400"
                              : "bg-zinc-800 border-zinc-700 text-white hover:border-amber-400"
                          }`}
                        >
                          {h}
                        </button>
                      ),
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-2 border-t border-zinc-800 pt-4">
              <button
                onClick={() => setEditingAppointment(null)}
                className="flex-1 py-3 rounded-xl border border-zinc-700 text-zinc-400 hover:text-white font-bold text-xs uppercase"
              >
                Voltar
              </button>
              <button
                onClick={handleReschedule}
                disabled={!editDate || !editTime || isUpdating}
                className="flex-1 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-zinc-950 font-black text-xs uppercase disabled:opacity-50"
              >
                {isUpdating ? "Salvando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {cancelConfirm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-4 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-sm flex flex-col gap-4">
            <h3 className="font-bold text-lg text-red-400 italic">
              Cancelar agendamento?
            </h3>
            <div className="bg-zinc-950 rounded-xl p-4 flex flex-col gap-1.5 text-xs border border-zinc-800">
              <span className="text-zinc-500">
                Barbeiro:{" "}
                <span className="text-white font-medium">
                  {cancelConfirm.barber}
                </span>
              </span>
              <span className="text-zinc-500">
                Serviço:{" "}
                <span className="text-white font-medium">
                  {cancelConfirm.service}
                </span>
              </span>
              <span className="text-zinc-500">
                Data e Hora:{" "}
                <span className="text-white font-medium">
                  {cancelConfirm.date} às {cancelConfirm.time}
                </span>
              </span>
            </div>
            <div className="flex gap-3 mt-1">
              <button
                onClick={() => setCancelConfirm(null)}
                className="flex-1 py-3 rounded-xl border border-zinc-700 text-zinc-400 hover:text-white font-bold text-xs uppercase"
              >
                Voltar
              </button>
              <button
                onClick={confirmCancel}
                className="flex-1 py-3 rounded-xl bg-red-500 hover:bg-red-400 text-white font-bold text-xs uppercase"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NAVIGATION BAR */}
      <nav className="fixed bottom-0 left-0 right-0 bg-zinc-900/80 backdrop-blur-xl border-t border-zinc-800/50 px-4 pt-3 pb-8 flex justify-between items-center z-50">
        <NavButton icon={HomeIcon} label="Início" tabId="home" />
        <NavButton icon={Clock} label="Histórico" tabId="historico" />
        <button
          onClick={() => {
            setActiveTab("agendar");
            setStep(1);
            setPlanToBuy(null);
            setBookingViaPlan(false);
            setBarberId("");
            setService("");
          }}
          className={`p-4 rounded-2xl -mt-14 shadow-[0_10px_25px_rgba(251,191,36,0.3)] transition-all active:scale-90 ${activeTab === "agendar" ? "bg-amber-400 text-zinc-950 scale-105" : "bg-zinc-800 text-amber-400 hover:bg-zinc-700"}`}
        >
          <PlusCircle size={28} strokeWidth={2.5} />
        </button>
        <NavButton icon={Award} label="Planos" tabId="planos" />
        <NavButton icon={User} label="Perfil" tabId="perfil" />
      </nav>
    </main>
  );
}
