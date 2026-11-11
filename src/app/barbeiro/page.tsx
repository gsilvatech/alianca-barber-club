"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import DailyWord from "@/components/DailyWord";
import { HOURS } from "@/lib/constant";
import {
  Home,
  Calendar,
  DollarSign,
  Users,
  PlusCircle,
  LogOut,
  Trash2,
  Edit2,
  XCircle,
  Briefcase,
  ChevronLeft,
  Package,
  MinusCircle,
  Clock,
  TrendingUp,
  TrendingDown,
  Target,
  CreditCard,
  UserPlus,
  BarChart3,
  Scissors,
  CheckCircle2,
  User,
  Camera,
  Wallet,
  AtSign,
  Info,
  Loader2,
  Lock,
  ShieldCheck,
  MessageCircle,
  Phone,
  X,
} from "lucide-react";

// --- HELPER DE DATA LOCAL (CORRIGE O FUSO HORÁRIO DO BRASIL) ---
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
  const apptDate = new Date(year, month - 1, day, hours, minutes + 20);
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
  const isPlan = cleanName.startsWith("PLANO: ");
  if (isPlan) {
    cleanName = cleanName.replace("PLANO: ", "").trim();
  }

  const nameLower = cleanName.toLowerCase();

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

const getNextWeekDate = (dateStr: string, weeksToAdd: number) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + 7 * weeksToAdd);
  return getLocalDateStr(date);
};

function groupAppointments(appts: any[]) {
  const grouped: any[] = [];
  let currentGroup: any = null;

  appts.forEach((appt) => {
    const isBlock = appt.service?.startsWith("BLOQUEIO");

    if (isBlock) {
      if (!currentGroup) {
        currentGroup = {
          ...appt,
          isGroupedBlock: true,
          blockIds: [appt.id],
          endTime: appt.time,
        };
      } else if (
        currentGroup.date === appt.date &&
        currentGroup.service === appt.service
      ) {
        currentGroup.blockIds.push(appt.id);
        currentGroup.endTime = appt.time;
      } else {
        grouped.push(currentGroup);
        currentGroup = {
          ...appt,
          isGroupedBlock: true,
          blockIds: [appt.id],
          endTime: appt.time,
        };
      }
    } else {
      if (currentGroup) {
        grouped.push(currentGroup);
        currentGroup = null;
      }
      grouped.push(appt);
    }
  });

  if (currentGroup) grouped.push(currentGroup);
  return grouped;
}

function renderGrowth(current: number, past: number) {
  if (past === 0 && current === 0) return null;
  const pct = past === 0 ? 100 : ((current - past) / past) * 100;
  const isPositive = pct >= 0;
  return (
    <div
      className={`flex items-center gap-1 text-[9px] font-bold w-fit px-1.5 py-0.5 rounded-md ${isPositive ? "text-emerald-400 bg-emerald-400/10" : "text-red-400 bg-red-400/10"}`}
    >
      {isPositive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {isPositive ? "+" : ""}
      {pct.toFixed(0)}%
    </div>
  );
}

type Appointment = {
  id: string;
  client_id: string;
  client_plan_id?: string;
  service: string;
  date: string;
  time: string;
  status: string;
  price_applied?: number;
  duration_applied?: number | null;
  profiles: { name: string; phone: string };
};
type Product = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  category: string;
  updated_at?: string;
  profiles?: { name: string };
};
type BarberService = {
  id: string;
  name: string;
  price: number;
  duration: number;
};
type BarberGoal = {
  id: string;
  title: string;
  target_value: number;
  is_completed: boolean;
  created_at: string;
};

export default function BarbeiroPage() {
  const router = useRouter();
  const supabase = createClient();

  const [profile, setProfile] = useState<{ name: string; id: string } | null>(
    null,
  );

  const [barberId, setBarberId] = useState<string | null>(null);
  const [today, setToday] = useState<Appointment[]>([]);
  const [week, setWeek] = useState<Appointment[]>([]);
  const [blockedDates, setBlockedDates] = useState<
    { id: string; date: string; reason: string }[]
  >([]);
  const [newBlockDate, setNewBlockDate] = useState("");
  const [newBlockReason, setNewBlockReason] = useState("");
  const [loadingBlock, setLoadingBlock] = useState(false);
  const [tab, setTab] = useState<"semana" | "mes">("semana");

  const [isFullDay, setIsFullDay] = useState(true);
  const [selectedTimes, setSelectedTimes] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<
    "home" | "agenda" | "financeiro" | "gestao" | "novo"
  >("home");

  const [chartView, setChartView] = useState<"diario" | "mensal" | "anual">(
    "diario",
  );
  const [chartViewGlobal, setChartViewGlobal] = useState<
    "diario" | "mensal" | "anual"
  >("diario");

  const todayStr = getLocalDateStr();
  const weekEnd = new Date();
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndStr = getLocalDateStr(weekEnd);
  const monthEnd = new Date();
  monthEnd.setDate(monthEnd.getDate() + 30);
  const monthEndStr = getLocalDateStr(monthEnd);
  const [manualActivePlan, setManualActivePlan] = useState<any>(null);
  const [manualClientId, setManualClientId] = useState("AVULSO");
  const [manualCustomer, setManualCustomer] = useState("");
  const [manualService, setManualService] = useState("");
  const [manualPrice, setManualPrice] = useState("");
  const [manualDate, setManualDate] = useState(todayStr);
  const [manualTime, setManualTime] = useState("");
  const [usePlan, setUsePlan] = useState(false);

  const [isVipDiscount, setIsVipDiscount] = useState(false);
  const [vipPrice, setVipPrice] = useState("");

  const [isSaving, setIsSaving] = useState(false);
  const [manualTakenSlots, setManualTakenSlots] = useState<string[]>([]);

  const [editingAppointment, setEditingAppointment] =
    useState<Appointment | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [editTakenSlots, setEditTakenSlots] = useState<string[]>([]);

  const [gestaoView, setGestaoView] = useState<
    "menu" | "estoque" | "crm" | "servicos"
  >("menu");
  const [products, setProducts] = useState<Product[]>([]);
  const [estoqueTab, setEstoqueTab] = useState<"barbearia" | "geladeira">(
    "barbearia",
  );
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [productName, setProductName] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [productQuantity, setProductQuantity] = useState("");
  const [productCategory, setProductCategory] = useState<
    "barbearia" | "geladeira"
  >("barbearia");
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const [isEditProductModalOpen, setIsEditProductModalOpen] = useState(false);
  const [editProductId, setEditProductId] = useState("");
  const [editProductName, setEditProductName] = useState("");
  const [editProductPrice, setEditProductPrice] = useState("");
  const [editProductQuantity, setEditProductQuantity] = useState("");
  const [editProductCategory, setEditProductCategory] = useState<
    "barbearia" | "geladeira"
  >("barbearia");
  const [isUpdatingProduct, setIsUpdatingProduct] = useState(false);
  const [isSellModalOpen, setIsSellModalOpen] = useState(false);
  const [sellProductId, setSellProductId] = useState("");
  const [sellQuantity, setSellQuantity] = useState(1);
  const [isSelling, setIsSelling] = useState(false);
  const [servicesList, setServicesList] = useState<BarberService[]>([]);
  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const [isEditServiceModalOpen, setIsEditServiceModalOpen] = useState(false);
  const [svcName, setSvcName] = useState("");
  const [svcPrice, setSvcPrice] = useState("");
  const [svcDuration, setSvcDuration] = useState("");
  const [svcId, setSvcId] = useState("");
  const [isSavingSvc, setIsSavingSvc] = useState(false);

  const [goals, setGoals] = useState<BarberGoal[]>([]);

  // --- ESTADOS FINANCEIROS ---
  const [transactions, setTransactions] = useState<any[]>([]);
  const [financeKPIs, setFinanceKPIs] = useState({
    entradasMes: 0,
    saidasMes: 0,
    saldoMes: 0,
    clientesHoje: 0,
    clientesMes: 0,
    chartMensal: [] as any[],
    maxMensal: 1,
  });
  const [isTransModalOpen, setIsTransModalOpen] = useState(false);
  const [transType, setTransType] = useState<"entrada" | "saida">("entrada");
  const [transDesc, setTransDesc] = useState("");
  const [transAmount, setTransAmount] = useState("");
  const [transDate, setTransDate] = useState(todayStr);
  const [isSavingTrans, setIsSavingTrans] = useState(false);

  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [goalTitle, setGoalTitle] = useState("");
  const [goalTarget, setGoalTarget] = useState("");
  const [isSavingGoal, setIsSavingGoal] = useState(false);

  // --- CRM ESTADOS ---
  const [crmTab, setCrmTab] = useState<"assinaturas" | "clientes">(
    "assinaturas",
  );
  const [clientPlans, setClientPlans] = useState<any[]>([]);
  const [crmClients, setCrmClients] = useState<any[]>([]);
  const [isNewClientModalOpen, setIsNewClientModalOpen] = useState(false);

  // Estado para a busca de clientes
  const [clientSearch, setClientSearch] = useState("");
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [formProfile, setFormProfile] = useState({
    display_name: "",
    instagram_handle: "",
    bio: "",
    pix_type: "CPF",
    pix_key: "",
    avatar_url: "",
    whatsapp: "",
  });

  // --- UPLOAD DE IMAGEM ---
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  async function handleAvatarUpload(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    try {
      setUploadingAvatar(true);
      const file = event.target.files?.[0];
      if (!file) return;

      // Limita o tamanho para 2MB
      if (file.size > 2 * 1024 * 1024) {
        alert("A imagem é muito pesada. Escolha uma foto de até 2MB.");
        setUploadingAvatar(false);
        return;
      }

      // Cria um nome único para o arquivo
      const fileExt = file.name.split(".").pop();
      const fileName = `${barberId}_${Math.random()}.${fileExt}`;

      // Faz o upload da foto para o bucket "avatars" no Supabase
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(fileName);

      // Atualiza a foto na tela
      setFormProfile({ ...formProfile, avatar_url: publicUrl });
    } catch (error: any) {
      alert("Erro ao enviar a imagem: " + error.message);
    } finally {
      setUploadingAvatar(false);
    }
  }

  // --- FUNÇÃO PARA SALVAR O PERFIL ---
  async function handleSaveProfile() {
    if (!barberId) return;
    setSavingProfile(true);

    const { error } = await supabase
      .from("barbers")
      .update({
        display_name: formProfile.display_name,
        instagram_handle: formProfile.instagram_handle.replace("@", ""),
        bio: formProfile.bio,
        pix_type: formProfile.pix_type,
        pix_key: formProfile.pix_key,
        avatar_url: formProfile.avatar_url,
        whatsapp: formProfile.whatsapp.replace(/\D/g, ""),
      })
      .eq("id", barberId);

    if (error) {
      alert("Erro ao atualizar perfil: " + error.message);
    } else {
      alert("Seu perfil sócio foi atualizado com sucesso! 💎");
      setIsProfileOpen(false);
    }
    setSavingProfile(false);
  }

  // Excluir Cliente (Forçado via RPC)
  async function handleDeleteClient(clientId: string, clientName: string) {
    if (
      !confirm(
        `Tem certeza que deseja excluir o cliente "${clientName}"? Essa ação apagará também os agendamentos amarrados a este perfil e não pode ser desfeita.`,
      )
    )
      return;

    // Dispara a função no banco de dados que quebra a trava de segurança e limpa tudo
    const { error } = await supabase.rpc("force_delete_client", {
      target_client_id: clientId,
    });

    if (error) {
      alert("Erro ao tentar excluir a conta. Tente novamente.");
      console.error(error);
    } else {
      alert("Conta excluída e CRM limpo com sucesso! 🧹");
      loadCRMData();
    }
  }

  // --- ESTADOS: RESET DE SENHA (CRM) ---
  const [showResetModal, setShowResetModal] = useState(false);
  const [selectedUserForReset, setSelectedUserForReset] = useState<any | null>(
    null,
  );
  const [resetLoading, setResetLoading] = useState(false);
  const [resetResultLink, setResetResultLink] = useState("");
  const [showPassMessage, setShowPassMessage] = useState(false);

  async function handleResetAction(
    type: "whatsapp_link" | "temporary_password",
  ) {
    if (!selectedUserForReset) return;
    setResetLoading(true);
    try {
      const res = await fetch("/api/admin/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUserForReset.id,
          actionType: type,
        }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      if (type === "whatsapp_link") {
        setResetResultLink(data.link);
      } else {
        setShowPassMessage(true);
      }
    } catch (error: any) {
      alert("Erro ao processar: " + error.message);
    } finally {
      setResetLoading(false);
    }
  }

  // --- ESTADOS DE RECORRÊNCIA (MÓDULO VIP E BLOQUEIOS) ---
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringWeeks, setRecurringWeeks] = useState("4");

  // Vender Plano
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [planClientId, setPlanClientId] = useState("");
  const [newClientName, setNewClientName] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [planName, setPlanName] = useState("");
  const [planPrice, setPlanPrice] = useState("");
  const [planCuts, setPlanCuts] = useState("4");
  const [planStartDate, setPlanStartDate] = useState(todayStr);
  const [isSavingPlan, setIsSavingPlan] = useState(false);
  const [isMigratedPlan, setIsMigratedPlan] = useState(false);
  const [migratedCutsUsed, setMigratedCutsUsed] = useState("0");
  const [absorbTodayCut, setAbsorbTodayCut] = useState(false);
  const [appointmentToAbsorb, setAppointmentToAbsorb] = useState("");
  const [isSavingGhost, setIsSavingGhost] = useState(false);

  // Modal de detalhes do cliente (celular) na agenda
  const [clientDetail, setClientDetail] = useState<{
    name: string;
    phone: string | null;
    service: string;
    date: string;
    time: string;
  } | null>(null);

  // Editar Plano
  const [isEditPlanModalOpen, setIsEditPlanModalOpen] = useState(false);
  const [editPlanId, setEditPlanId] = useState("");
  const [editPlanCutsUsed, setEditPlanCutsUsed] = useState("");
  const [editPlanCutsAllowed, setEditPlanCutsAllowed] = useState("");
  const [editPlanPrice, setEditPlanPrice] = useState("");
  const [editPlanStartDate, setEditPlanStartDate] = useState(todayStr);
  const [isUpdatingPlan, setIsUpdatingPlan] = useState(false);

  // Renovar Plano
  const [isRenewPlanModalOpen, setIsRenewPlanModalOpen] = useState(false);
  const [renewPlanData, setRenewPlanData] = useState<any>(null);
  const [renewPlanPrice, setRenewPlanPrice] = useState("");
  const [renewPlanCuts, setRenewPlanCuts] = useState("");
  const [renewStartDate, setRenewStartDate] = useState(todayStr);
  const [isRenewingPlan, setIsRenewingPlan] = useState(false);
  const [renewPlanName, setRenewPlanName] = useState("");

  async function loadAppts() {
    if (!barberId) return;
    let endDate = tab === "semana" ? weekEndStr : monthEndStr;
    const [{ data: todayAppts }, { data: weekAppts }, { data: blocked }] =
      await Promise.all([
        supabase
          .from("appointments")
          .select(
            "id, client_id, client_plan_id, service, date, time, status, duration_applied, profiles(name, phone)",
          )
          .eq("barber_id", barberId)
          .eq("date", todayStr)
          .in("status", ["confirmed", "canceled", "no-show"])
          .order("time"),
        supabase
          .from("appointments")
          .select(
            "id, client_id, client_plan_id, service, date, time, status, duration_applied, profiles(name, phone)",
          )
          .eq("barber_id", barberId)
          .gte("date", todayStr)
          .lte("date", endDate)
          .in("status", ["confirmed"])
          .order("date")
          .order("time"),
        supabase
          .from("blocked_dates")
          .select("id, date, reason")
          .eq("barber_id", barberId)
          .gte("date", todayStr)
          .order("date"),
      ]);
    setToday((todayAppts as any) || []);
    setWeek((weekAppts as any) || []);
    setBlockedDates(blocked || []);
  }

  async function loadFinancesAndGoals() {
    if (!barberId) return;

    const { data: gData } = await supabase
      .from("barber_goals")
      .select("*")
      .eq("barber_id", barberId)
      .order("created_at", { ascending: false });
    setGoals(gData || []);

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = String(now.getMonth() + 1).padStart(2, "0");
    const firstDayThisMonth = `${currentYear}-${currentMonth}-01`;
    const firstDayThisYear = `${currentYear}-01-01`; 

    const { data: transData } = await supabase
      .from("financial_transactions")
      .select("*")
      .eq("barber_id", barberId)
      .gte("reference_date", firstDayThisYear)
      .order("reference_date", { ascending: false });

    const trans = transData || [];
    setTransactions(trans.filter((t) => t.reference_date >= firstDayThisMonth));

    const { data: apptsData } = await supabase
      .from("appointments")
      .select("id, date, time, status, service, duration_applied")
      .eq("barber_id", barberId)
      .gte("date", firstDayThisYear)
      .in("status", ["confirmed", "completed"]);

    const appts = apptsData || [];

    let chartData = [
      { name: "Jan", receita: 0, clientes: 0 },
      { name: "Fev", receita: 0, clientes: 0 },
      { name: "Mar", receita: 0, clientes: 0 },
      { name: "Abr", receita: 0, clientes: 0 },
      { name: "Mai", receita: 0, clientes: 0 },
      { name: "Jun", receita: 0, clientes: 0 },
      { name: "Jul", receita: 0, clientes: 0 },
      { name: "Ago", receita: 0, clientes: 0 },
      { name: "Set", receita: 0, clientes: 0 },
      { name: "Out", receita: 0, clientes: 0 },
      { name: "Nov", receita: 0, clientes: 0 },
      { name: "Dez", receita: 0, clientes: 0 },
    ];

    let inMes = 0;
    let outMes = 0;

    trans.forEach((t) => {
      const tMonth = parseInt(t.reference_date.split("-")[1]) - 1;

      if (t.type === "entrada") {
        chartData[tMonth].receita += Number(t.amount);
      }

      if (t.reference_date >= firstDayThisMonth) {
        if (t.type === "entrada") inMes += Number(t.amount);
        if (t.type === "saida") outMes += Number(t.amount);
      }
    });

    let cHoje = 0;
    let cMes = 0;

    appts.forEach((a) => {
      const aMonth = parseInt(a.date.split("-")[1]) - 1;
      const timeHasPassed = isPast(a.date, a.time);
      const isCompleted =
        a.status === "completed" || (a.status === "confirmed" && timeHasPassed);

      if (
        isCompleted &&
        a.service &&
        !a.service.startsWith("BLOQUEIO") &&
        !a.service.startsWith("ADMIN:")
      ) {
        chartData[aMonth].clientes++; 

        if (a.date >= firstDayThisMonth) {
          cMes++;
          if (a.date === todayStr) cHoje++;
        }
      }
    });

    const maxReceita = Math.max(...chartData.map((d) => d.receita), 1);

    setFinanceKPIs({
      entradasMes: inMes,
      saidasMes: outMes,
      saldoMes: inMes - outMes,
      clientesHoje: cHoje,
      clientesMes: cMes,
      chartMensal: chartData,
      maxMensal: maxReceita,
    });
  }

  async function handleSaveTransaction() {
    if (!transDesc || !transAmount || !transDate) {
      alert("Preencha descrição, valor e data.");
      return;
    }
    setIsSavingTrans(true);
    const { error } = await supabase.from("financial_transactions").insert({
      barber_id: barberId,
      type: transType,
      description: transDesc,
      amount: parseFloat(transAmount.replace(",", ".")),
      reference_date: transDate,
    });

    if (error) {
      alert("Erro ao salvar lançamento: " + error.message);
    } else {
      setIsTransModalOpen(false);
      setTransDesc("");
      setTransAmount("");
      setTransDate(todayStr);
      loadFinancesAndGoals();
    }
    setIsSavingTrans(false);
  }

  async function loadCRMData() {
    if (!barberId) return;
    const { data: plans } = await supabase
      .from("client_plans")
      .select("*, profiles(name, phone)")
      .eq("barber_id", barberId)
      .order("created_at", { ascending: false });
    setClientPlans(plans || []);
    const { data: clientsData } = await supabase
      .from("profiles")
      .select("id, name, phone, birth_date, is_ghost")
      .in("role", ["client", "cliente"])
      .order("name");
    setCrmClients(clientsData || []);
  }

  async function loadProducts() {
    if (!barberId) return;
    const { data, error } = await supabase
      .from("products")
      .select(
        `
        *,
        profiles!updated_by (name)
      `,
      )
      .order("name");
    setProducts((data as any) || []);
  }
  async function loadServicesFromDB() {
    if (!barberId) return;
    const { data } = await supabase
      .from("services")
      .select("*")
      .eq("barber_id", barberId)
      .order("name");
    setServicesList(data || []);
  }

  useEffect(() => {
    async function loadInitial() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return router.push("/login");
      const { data: prof } = await supabase
        .from("profiles")
        .select("id, name, role")
        .eq("id", user.id)
        .single();
      if (
        prof?.role !== "barbers" &&
        prof?.role !== "barber" &&
        prof?.role !== "admin"
      )
        return router.push("/cliente");
      setProfile({ ...prof, id: user.id });
      const { data: barber } = await supabase
        .from("barbers")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (barber) {
        setBarberId(barber.id);
        setFormProfile({
          display_name: barber.display_name || "",
          instagram_handle: barber.instagram_handle || "",
          bio: barber.bio || "",
          pix_type: barber.pix_type || "CPF",
          pix_key: barber.pix_key || "",
          avatar_url: barber.avatar_url || "",
          whatsapp: barber.whatsapp || "",
        });
      }
    }
    loadInitial();
  }, []);

  useEffect(() => {
    if (barberId) {
      loadAppts();
      loadProducts();
      loadServicesFromDB();
      loadFinancesAndGoals();
      loadCRMData();
      const interval = setInterval(() => {
        loadAppts();
        loadFinancesAndGoals();
      }, 60000);
      return () => clearInterval(interval);
    }
  }, [barberId, tab]);

  useEffect(() => {
    if (
      !barberId ||
      !editDate ||
      !editingAppointment ||
      servicesList.length === 0
    )
      return;
    async function loadEditSlots() {
      const { data } = await supabase
        .from("appointments")
        .select("time, service, duration_applied")
        .eq("barber_id", barberId)
        .eq("date", editDate)
        .eq("status", "confirmed");
      const existingAppts = data || [];
      const blocked: string[] = [];
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
        )
          return;

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
  }, [barberId, editDate, editingAppointment, servicesList]);

  useEffect(() => {
    if (
      !barberId ||
      !manualDate ||
      !manualService ||
      servicesList.length === 0
    ) {
      setManualTakenSlots([]);
      return;
    }
    async function loadManualSlots() {
      const { data } = await supabase
        .from("appointments")
        .select("time, service, duration_applied")
        .eq("barber_id", barberId)
        .eq("date", manualDate)
        .eq("status", "confirmed");
      const existingAppts = data || [];
      const blocked: string[] = [];

      const duration = getServiceDuration(manualService, servicesList);

      HOURS.forEach((slot) => {
        const slotStart = timeToMinutes(slot);
        const slotEnd = slotStart + duration;

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
      setManualTakenSlots(blocked);
    }
    loadManualSlots();
  }, [barberId, manualDate, manualService, servicesList]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.refresh();
    router.push("/login");
  }

  async function handleSmartBlock() {
    if (!newBlockDate || !barberId) return;
    setLoadingBlock(true);

    // Verifica se vai repetir
    const loops = isRecurring ? parseInt(recurringWeeks) : 1;

    if (isFullDay) {
      const fullDayBlocks: any[] = [];

      for (let i = 0; i < loops; i++) {
        fullDayBlocks.push({
          barber_id: barberId,
          date: getNextWeekDate(newBlockDate, i),
          reason: newBlockReason || "Folga",
        });
      }
      // Dispara todos os dias de uma vez para o banco
      await supabase.from("blocked_dates").insert(fullDayBlocks);
    } else {
      const motivoFinal = newBlockReason
        ? `BLOQUEIO: ${newBlockReason}`
        : "BLOQUEIO INDISPONÍVEL";

      const timeBlocks: any[] = [];

      for (let i = 0; i < loops; i++) {
        const nextDate = getNextWeekDate(newBlockDate, i);

        // Pega todos os horários que o barbeiro clicou e injeta nessa data específica
        selectedTimes.forEach((time) => {
          timeBlocks.push({
            barber_id: barberId,
            client_id: profile?.id,
            date: nextDate,
            time: time,
            service: motivoFinal,
            status: "confirmed",
            price_applied: 0,
            duration_applied: 10,
          });
        });
      }
      await supabase.from("appointments").insert(timeBlocks);
    }

    setIsRecurring(false);
    setRecurringWeeks("4");
    loadAppts();
    setNewBlockDate("");
    setNewBlockReason("");
    setSelectedTimes([]);
    setIsRecurring(false);
    setRecurringWeeks("4");
    setLoadingBlock(false);
  }

  async function deleteAppointment(ids: string | string[]) {
    if (!confirm("Remover este bloqueio?")) return;

    const idsToDelete = Array.isArray(ids) ? ids : [ids];

    await supabase.from("appointments").delete().in("id", idsToDelete);
    loadAppts();
  }

  async function deleteFullDayBlock(id: string) {
    if (!confirm("Remover bloqueio do dia inteiro?")) return;
    await supabase.from("blocked_dates").delete().eq("id", id);
    loadAppts();
  }

  async function handleCancelByBarber(id: string) {
    if (
      !confirm(
        "Cancelar agendamento? (Se for plano, o corte é devolvido ao cliente)",
      )
    )
      return;
    const apptToCancel = [...today, ...week].find((a) => a.id === id);
    await supabase
      .from("appointments")
      .update({ status: "canceled" })
      .eq("id", id);
    if (apptToCancel?.client_plan_id) {
      const { data: planData } = await supabase
        .from("client_plans")
        .select("id, cuts_used")
        .eq("id", apptToCancel.client_plan_id)
        .limit(1);
      const plan = planData ? planData[0] : null;

      if (plan && plan.cuts_used > 0) {
        await supabase
          .from("client_plans")
          .update({ cuts_used: plan.cuts_used - 1 })
          .eq("id", plan.id);
      }
    }
    loadAppts();
    loadFinancesAndGoals();
    loadCRMData();
  }

  async function handleNoShow(id: string) {
    if (
      !confirm(
        "Registrar FURO? O plano NÃO devolve cota em caso de falta do cliente.",
      )
    )
      return;
    await supabase
      .from("appointments")
      .update({ status: "no-show" })
      .eq("id", id);
    loadAppts();
    loadFinancesAndGoals();
  }

  // --- CRM: FUNÇÕES DE PLANO ---
  async function handleCreateGhostClient() {
    if (!newClientName || !newClientPhone)
      return alert("Preencha Nome e Telefone!");
    setIsSavingGhost(true);
    const { error } = await supabase.from("profiles").insert({
      name: newClientName,
      phone: newClientPhone,
      role: "client",
      is_ghost: true,
    });
    if (!error) {
      setNewClientName("");
      setNewClientPhone("");
      setIsNewClientModalOpen(false);
      loadCRMData();
    } else {
      alert("Erro ao criar perfil.");
    }
    setIsSavingGhost(false);
  }

  async function handleCreatePlan() {
    if (!planClientId || !planName || !planCuts || !planStartDate)
      return alert("Preencha todos os campos do plano!");
    if (planClientId === "NEW" && (!newClientName || !newClientPhone))
      return alert("Preencha o Nome e WhatsApp!");
    if (!isMigratedPlan && !planPrice)
      return alert("Planos novos precisam de valor de venda!");
    setIsSavingPlan(true);
    let finalClientId = planClientId;

    if (planClientId === "NEW") {
      const { data: newProfile, error: ghostErr } = await supabase
        .from("profiles")
        .insert({
          name: newClientName,
          phone: newClientPhone,
          role: "client",
          is_ghost: true,
        })
        .select()
        .single();
      if (ghostErr) {
        alert("Erro ao cadastrar cliente.");
        setIsSavingPlan(false);
        return;
      }
      finalClientId = newProfile.id;
    }

    let finalPrice = isMigratedPlan
      ? 0
      : parseFloat(planPrice.replace(",", "."));
    let initialCutsUsed = isMigratedPlan
      ? parseInt(migratedCutsUsed)
      : absorbTodayCut && appointmentToAbsorb !== "NO_APPT"
        ? 1
        : 0;
    if (absorbTodayCut && appointmentToAbsorb === "NO_APPT")
      initialCutsUsed = 1;

    const { data: newPlan, error } = await supabase
      .from("client_plans")
      .insert({
        client_id: finalClientId,
        barber_id: barberId,
        plan_name: planName,
        price_paid: finalPrice,
        cuts_allowed: parseInt(planCuts),
        cuts_used: initialCutsUsed,
        status: "active",
        start_date: planStartDate,
      })
      .select()
      .single();

    if (!error) {
      if (
        absorbTodayCut &&
        appointmentToAbsorb &&
        appointmentToAbsorb !== "NO_APPT"
      ) {
        await supabase
          .from("appointments")
          .update({
            client_plan_id: newPlan.id,
            service: `PLANO: ${planName}`,
            price_applied: 0,
            duration_applied: getServiceDuration(
              `PLANO: ${planName}`,
              servicesList,
            ),
          })
          .eq("id", appointmentToAbsorb);
      }
      setIsPlanModalOpen(false);
      setPlanClientId("");
      setPlanName("");
      setPlanPrice("");
      setPlanCuts("4");
      setNewClientName("");
      setNewClientPhone("");
      setIsMigratedPlan(false);
      setMigratedCutsUsed("0");
      setAbsorbTodayCut(false);
      setAppointmentToAbsorb("");
      setPlanStartDate(todayStr);
      loadCRMData();
      loadAppts();
      loadFinancesAndGoals();
    }
    setIsSavingPlan(false);
  }

  function openEditPlanModal(plan: any) {
    setEditPlanId(plan.id);
    setEditPlanCutsUsed(plan.cuts_used.toString());
    setEditPlanCutsAllowed(plan.cuts_allowed.toString());
    setEditPlanPrice(plan.price_paid.toFixed(2).replace(".", ","));
    setEditPlanStartDate(
      plan.start_date
        ? plan.start_date.split("T")[0]
        : plan.created_at.split("T")[0],
    );
    setIsEditPlanModalOpen(true);
  }

  async function handleUpdatePlan() {
    setIsUpdatingPlan(true);
    await supabase
      .from("client_plans")
      .update({
        cuts_used: parseInt(editPlanCutsUsed),
        cuts_allowed: parseInt(editPlanCutsAllowed),
        price_paid: parseFloat(editPlanPrice.replace(",", ".")),
        start_date: editPlanStartDate,
      })
      .eq("id", editPlanId);
    setIsEditPlanModalOpen(false);
    loadCRMData();
    loadFinancesAndGoals();
    setIsUpdatingPlan(false);
  }

  async function handleDeletePlan(id: string) {
    if (!confirm("Tem certeza que deseja excluir esta assinatura?")) return;
    await supabase.from("client_plans").delete().eq("id", id);
    loadCRMData();
    loadFinancesAndGoals();
  }

  function openRenewModal(plan: any) {
    setRenewPlanData(plan);
    setRenewPlanName(plan.plan_name);

    const svc = servicesList.find((s) => s.name === plan.plan_name);

    if (svc) {
      setRenewPlanPrice(svc.price.toFixed(2).replace(".", ","));
    } else {
      setRenewPlanPrice(
        plan.price_paid > 0 ? plan.price_paid.toFixed(2).replace(".", ",") : "",
      );
    }

    setRenewPlanCuts(plan.cuts_allowed.toString());
    setRenewStartDate(todayStr);
    setIsRenewPlanModalOpen(true);
  }

  async function handleRenewPlan() {
    if (!renewPlanName || !renewPlanPrice || !renewPlanCuts) {
      return alert(
        "Por favor, selecione um plano válido e preencha a quantidade de cortes.",
      );
    }

    setIsRenewingPlan(true);
    await supabase
      .from("client_plans")
      .update({ status: "expired" })
      .eq("id", renewPlanData.id);

    await supabase.from("client_plans").insert({
      client_id: renewPlanData.client_id,
      barber_id: renewPlanData.barber_id,
      plan_name: renewPlanName,
      price_paid: parseFloat(renewPlanPrice.replace(",", ".")),
      cuts_allowed: parseInt(renewPlanCuts),
      cuts_used: 0,
      status: "active",
      start_date: renewStartDate,
    });

    setIsRenewPlanModalOpen(false);
    loadCRMData();
    loadFinancesAndGoals();
    setIsRenewingPlan(false);
  }

  const clientTodayAppts = today.filter((a) => {
    if (a.status !== "confirmed" || a.service.startsWith("BLOQUEIO"))
      return false;
    if (a.client_id === planClientId) return true;
    if (planClientId === "NEW" && a.service.startsWith("MANUAL:")) return true;
    return false;
  });

  async function handleAddGoal() {
    if (!goalTitle || !goalTarget) return;
    setIsSavingGoal(true);
    await supabase.from("barber_goals").insert({
      barber_id: barberId,
      title: goalTitle,
      target_value: parseFloat(goalTarget.replace(",", ".")),
    });
    setGoalTitle("");
    setGoalTarget("");
    setIsGoalModalOpen(false);
    loadFinancesAndGoals();
    setIsSavingGoal(false);
  }
  async function handleDeleteGoal(id: string) {
    if (!confirm("Remover?")) return;
    await supabase.from("barber_goals").delete().eq("id", id);
    loadFinancesAndGoals();
  }
  function openEditModal(appt: Appointment) {
    setEditingAppointment(appt);
    setEditDate(appt.date);
    setEditTime(appt.time);
  }
  async function handleReschedule() {
    if (!editingAppointment || !editDate || !editTime) return;
    setIsUpdating(true);
    await supabase
      .from("appointments")
      .update({ date: editDate, time: editTime })
      .eq("id", editingAppointment.id);
    setEditingAppointment(null);
    loadAppts();
    setIsUpdating(false);
  }
  async function handleAddProduct() {
    if (!productName || !productPrice || !productQuantity) return;
    setIsSavingProduct(true);
    await supabase.from("products").insert({
      barber_id: barberId,
      name: productName,
      price: parseFloat(productPrice.replace(",", ".")),
      quantity: parseInt(productQuantity),
      category: productCategory,
    });
    setProductName("");
    setProductPrice("");
    setProductQuantity("");
    setIsProductModalOpen(false);
    loadProducts();
    setIsSavingProduct(false);
  }
  function openEditProductModal(product: Product) {
    setEditProductId(product.id);
    setEditProductName(product.name);
    setEditProductPrice(product.price.toFixed(2).replace(".", ","));
    setEditProductQuantity(product.quantity.toString());
    setEditProductCategory(product.category as any);
    setIsEditProductModalOpen(true);
  }
  async function handleUpdateProduct() {
    setIsUpdatingProduct(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase
      .from("products")
      .update({
        name: editProductName,
        price: parseFloat(editProductPrice.replace(",", ".")),
        quantity: parseInt(editProductQuantity),
        category: editProductCategory,
        updated_by: user?.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", editProductId);

    setIsEditProductModalOpen(false);
    loadProducts();
    setIsUpdatingProduct(false);
  }
  async function handleDeleteProduct(id: string) {
    if (!confirm("Remover?")) return;
    await supabase.from("products").delete().eq("id", id);
    loadProducts();
  }
  async function handleSellProduct() {
    const product = products.find((p) => p.id === sellProductId);
    if (!product || product.quantity < sellQuantity) return;
    setIsSelling(true);
    const totalPrice = product.price * sellQuantity;
    await supabase
      .from("products")
      .update({ quantity: product.quantity - sellQuantity })
      .eq("id", sellProductId);
    await supabase.from("product_sales").insert({
      barber_id: barberId,
      product_name: product.name,
      quantity: sellQuantity,
      unit_price: product.price,
      total_price: totalPrice,
    });
    setIsSellModalOpen(false);
    setSellProductId("");
    setSellQuantity(1);
    loadProducts();
    loadFinancesAndGoals();
    setIsSelling(false);
  }
  async function handleAddService() {
    if (!svcName || !svcPrice || !svcDuration) return;
    setIsSavingSvc(true);
    await supabase.from("services").insert({
      barber_id: barberId,
      name: svcName,
      price: parseFloat(svcPrice.replace(",", ".")),
      duration: parseInt(svcDuration),
    });
    setSvcName("");
    setSvcPrice("");
    setSvcDuration("");
    setIsServiceModalOpen(false);
    loadServicesFromDB();
    setIsSavingSvc(false);
  }
  function openEditServiceModal(s: BarberService) {
    setSvcId(s.id);
    setSvcName(s.name);
    setSvcPrice(s.price.toFixed(2).replace(".", ","));
    setSvcDuration(s.duration.toString());
    setIsEditServiceModalOpen(true);
  }
  async function handleUpdateService() {
    setIsSavingSvc(true);
    await supabase
      .from("services")
      .update({
        name: svcName,
        price: parseFloat(svcPrice.replace(",", ".")),
        duration: parseInt(svcDuration),
      })
      .eq("id", svcId)
      .eq("barber_id", barberId);
    setIsEditServiceModalOpen(false);
    loadServicesFromDB();
    setIsSavingSvc(false);
  }
  async function handleDeleteService(id: string) {
    if (!confirm("Deseja excluir?")) return;
    await supabase
      .from("services")
      .delete()
      .eq("id", id)
      .eq("barber_id", barberId);
    loadServicesFromDB();
  }

  function renderCustomerName(a: Appointment) {
    if (a.service?.startsWith("MANUAL:"))
      return a.service.split(" - ")[0].replace("MANUAL: ", "");
    return a.profiles?.name || "Cliente sem nome";
  }
  function renderServiceDescription(a: Appointment) {
    if (a.service?.startsWith("MANUAL:"))
      return a.service.split(" - ")[1] || "Serviço Manual";
    return a.service;
  }

  function openClientDetail(a: Appointment) {
    setClientDetail({
      name: renderCustomerName(a),
      phone: a.profiles?.phone ?? null,
      service: renderServiceDescription(a),
      date: a.date,
      time: a.time,
    });
  }

  const activeClientPlan =
    manualClientId !== "AVULSO"
      ? clientPlans.find(
          (p) => p.client_id === manualClientId && p.status === "active",
        )
      : null;

  async function handleManualSchedule() {
    const isAvulso = manualClientId === "AVULSO";
    const nomeCliente = isAvulso
      ? manualCustomer
      : crmClients.find((c) => c.id === manualClientId)?.name;

    if (!nomeCliente || !manualService || !manualDate || !manualTime) {
      alert("Preencha todos os campos! (Nome, Serviço, Data e Hora)");
      return;
    }

    setIsSaving(true);
    console.log("Iniciando salvamento...");

    const ID_DO_CLIENTE_CORINGA = "3fd8009d-b6b9-4b7b-a6b0-3d59e07303ec";

    // Se for avulso, envia o ID do Coringa para não dar erro de coluna nula. Se não, envia o ID real.
    const finalClientIdParaOBanco = isAvulso
      ? ID_DO_CLIENTE_CORINGA
      : manualClientId;

    let finalPrice = 0;
    let finalServiceTag = manualService;
    let planId = null;

    // Lógica de definição de plano
    if (usePlan && manualActivePlan) {
      finalPrice = 0;
      finalServiceTag = `PLANO: ${manualActivePlan.plan_name}`;
      planId = manualActivePlan.id;
    } else if (isVipDiscount) {
      finalPrice = parseFloat(vipPrice.replace(",", ".")) || 0;
      if (isAvulso)
        finalServiceTag = `MANUAL: ${manualCustomer} - ${manualService}`;
    } else {
      const svc = servicesList.find((s) => s.name === manualService);
      finalPrice = svc ? svc.price : 0;
      if (isAvulso)
        // Adiciona o nome do avulso direto no nome do serviço para aparecer na agenda
        finalServiceTag = `MANUAL: ${manualCustomer} - ${manualService}`;
    }

    const loops = isRecurring ? parseInt(recurringWeeks) : 1;
    const durationApplied = getServiceDuration(finalServiceTag, servicesList);
    const appointmentsToInsert = [];

    for (let i = 0; i < loops; i++) {
      const nextDate = getNextWeekDate(manualDate, i);
      appointmentsToInsert.push({
        barber_id: barberId,
        client_id: finalClientIdParaOBanco,
        client_plan_id: planId,
        date: nextDate,
        time: manualTime,
        service: finalServiceTag,
        status: "confirmed",
        price_applied: finalPrice,
        duration_applied: durationApplied,
      });
    }

    const { error } = await supabase
      .from("appointments")
      .insert(appointmentsToInsert);

    if (error) {
      console.error("Erro do Supabase ao agendar:", error);
      alert("❌ O sistema barrou o agendamento: " + error.message);
      setIsSaving(false);
      return;
    }

    // Lógica para debitar os cortes do plano
    if (usePlan && planId && manualActivePlan) {
      await supabase
        .from("client_plans")
        .update({
          cuts_used: (manualActivePlan.cuts_used || 0) + loops,
        })
        .eq("id", planId);
      console.log("Corte debitado com sucesso!");
    }

    // Limpeza e recarga dos dados só acontece se der sucesso
    setManualClientId("AVULSO");
    setManualCustomer("");
    setManualService("");
    setActiveTab("agenda");
    setIsRecurring(false);
    setRecurringWeeks("4");
    loadAppts();
    loadFinancesAndGoals();
    setIsSaving(false);
    alert("✅ Agendamento confirmado com sucesso!");
  }

  const NavButton = ({ icon: Icon, label, tabId }: any) => (
    <button
      onClick={() => setActiveTab(tabId)}
      className={`flex flex-col items-center justify-center gap-1 transition-all ${activeTab === tabId ? "text-amber-400 scale-110" : "text-zinc-500 hover:text-zinc-300"}`}
    >
      <Icon size={20} strokeWidth={activeTab === tabId ? 2.5 : 2} />
      <span className="text-[10px] font-bold uppercase tracking-tighter">
        {label}
      </span>
    </button>
  );

  return (
    <main className="min-h-screen bg-zinc-950 text-white pb-28">
      {/* 1. HEADER REFACTORADO (SIMÉTRICO E CENTRALIZADO) */}
      <header className="bg-zinc-900/50 backdrop-blur-md border-b border-zinc-800 px-4 py-4 sticky top-0 z-40">
        <div className="max-w-3xl mx-auto flex items-center justify-between relative h-12">
          <button
            onClick={() => setIsProfileOpen(true)}
            className="flex items-center gap-2 text-zinc-500 hover:text-amber-400 font-bold text-xs uppercase transition-colors p-2 rounded-xl border border-transparent hover:border-zinc-800"
          >
            <User size={18} strokeWidth={2.5} />
            <span className="hidden sm:inline">Perfil</span>
          </button>

          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <img
              src="/logo.png"
              alt="Aliança Barber Club"
              className="h-11 w-auto mix-blend-lighten"
            />
          </div>

          <button
            onClick={handleLogout}
            className="p-2 text-zinc-500 hover:text-red-400 transition-colors rounded-xl border border-transparent hover:border-zinc-800"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* HOME */}
        {activeTab === "home" && (
          <div className="flex flex-col gap-8 animate-in fade-in duration-500">
            <div>
              <h2 className="text-2xl font-bold italic tracking-tight">
                Olá, {profile?.name?.split(" ")[0]}! ✂️
              </h2>
              <p className="text-zinc-500 text-sm mt-1">
                Sua jornada de hoje começa aqui.
              </p>
            </div>
            <DailyWord />
            <section>
              <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-4">
                Agenda de Hoje
              </h3>
              <div className="flex flex-col gap-3">
                {today.length === 0 ? (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-10 text-center text-zinc-600 text-sm italic">
                    Nenhum compromisso agendado.
                  </div>
                ) : (
                  groupAppointments(today).map((a) => {
                    const isBlock = a.service.startsWith("BLOQUEIO");
                    const isCanceled = a.status === "canceled";
                    const isNoShow = a.status === "no-show";
                    const timeHasPassed = isPast(a.date, a.time);
                    const autoCompleted =
                      !isBlock &&
                      !isCanceled &&
                      !isNoShow &&
                      (a.status === "completed" || timeHasPassed);

                    return (
                      <div
                        key={a.id}
                        className={`bg-zinc-900 border rounded-2xl px-4 py-4 flex flex-col gap-2 transition-all ${isCanceled || isNoShow ? "opacity-40 border-zinc-800 grayscale" : autoCompleted ? "border-emerald-500/30 bg-emerald-950/10" : isBlock ? "border-red-900/30" : "border-zinc-800"}`}
                      >
                        <div className="flex items-center gap-4">
                          <div
                            className={`rounded-xl px-3 py-2 text-center min-w-[60px] ${isBlock ? "bg-red-500 text-white" : autoCompleted ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-400 text-zinc-950"}`}
                          >
                            <div
                              className={`text-lg font-black leading-none ${a.isGroupedBlock && a.time !== a.endTime ? "text-[11px]" : "text-lg"}`}
                            >
                              {a.isGroupedBlock && a.time !== a.endTime
                                ? `${a.time} às ${a.endTime}`
                                : a.time}
                            </div>
                          </div>
                          <div className="flex-1">
                            <div
                              className={`font-bold italic flex items-center gap-2 ${isBlock ? "text-red-400" : autoCompleted ? "text-emerald-400" : "text-zinc-100"}`}
                            >
                              {isBlock ? (
                                "HORÁRIO BLOQUEADO"
                              ) : (
                                <button
                                  onClick={() => openClientDetail(a)}
                                  title="Ver celular do cliente"
                                  className="text-left hover:text-amber-400 transition-colors underline decoration-zinc-700 underline-offset-4 cursor-pointer"
                                >
                                  {renderCustomerName(a)}
                                </button>
                              )}
                              {autoCompleted && (
                                <CheckCircle2
                                  size={14}
                                  className="text-emerald-500"
                                />
                              )}
                            </div>
                            <div className="text-zinc-500 text-xs font-medium mt-0.5 flex items-center gap-2">
                              {isBlock
                                ? a.service.replace("BLOQUEIO: ", "")
                                : renderServiceDescription(a)}
                              {isNoShow && (
                                <span className="bg-red-500/20 text-red-400 text-[10px] px-2 py-0.5 rounded uppercase tracking-wider">
                                  Furo
                                </span>
                              )}
                              {autoCompleted && (
                                <span className="text-emerald-500/70 text-[10px] uppercase tracking-wider">
                                  Concluído
                                </span>
                              )}
                            </div>
                          </div>
                          {!isBlock &&
                            !isCanceled &&
                            !isNoShow &&
                            !autoCompleted && (
                              <div className="flex items-center gap-2 border-l border-zinc-800 pl-3">
                                <button
                                  onClick={() => openEditModal(a)}
                                  className="text-zinc-500 hover:text-amber-400 p-1.5 transition-colors"
                                >
                                  <Edit2 size={16} />
                                </button>
                                <button
                                  onClick={() => handleCancelByBarber(a.id)}
                                  className="text-zinc-500 hover:text-red-400 p-1.5 transition-colors"
                                >
                                  <XCircle size={16} />
                                </button>
                                <button
                                  onClick={() => handleNoShow(a.id)}
                                  title="Registrar Furo"
                                  className="bg-orange-500/10 text-orange-400 border border-orange-500/20 px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider hover:bg-orange-500 hover:text-zinc-950 transition-all whitespace-nowrap"
                                >
                                  Faltou
                                </button>
                              </div>
                            )}
                          {autoCompleted && !isNoShow && (
                            <button
                              onClick={() => handleNoShow(a.id)}
                              title="Foi erro? Registrar Furo"
                              className="text-zinc-600 hover:text-orange-500 p-2"
                            >
                              <XCircle size={16} />
                            </button>
                          )}
                          {isBlock && !isCanceled && !isNoShow && (
                            <button
                              onClick={() =>
                                deleteAppointment(
                                  a.isGroupedBlock ? a.blockIds : a.id,
                                )
                              }
                              className="text-zinc-600 hover:text-red-400 p-2"
                            >
                              <Trash2 size={18} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          </div>
        )}

        {/* AGENDA */}
        {activeTab === "agenda" && (
          <div className="flex flex-col gap-8 animate-in slide-in-from-bottom-4 duration-500">
            <section>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold italic">Sua Agenda</h3>
              </div>
              <div className="flex gap-2 bg-zinc-900 p-1 rounded-xl mb-6 border border-zinc-800">
                <button
                  onClick={() => setTab("semana")}
                  className={`flex-1 py-2.5 text-xs font-bold uppercase rounded-lg transition-all ${tab === "semana" ? "bg-zinc-800 text-amber-400" : "text-zinc-500 hover:text-white"}`}
                >
                  Próximos 7 Dias
                </button>
                <button
                  onClick={() => setTab("mes")}
                  className={`flex-1 py-2.5 text-xs font-bold uppercase rounded-lg transition-all ${tab === "mes" ? "bg-zinc-800 text-amber-400" : "text-zinc-500 hover:text-white"}`}
                >
                  Próximos 30 Dias
                </button>
              </div>
              <div className="flex flex-col gap-3">
                {(() => {
                  const upcomingAppointments = week.filter(
                    (a) => !isPast(a.date, a.time),
                  );
                  if (upcomingAppointments.length === 0) {
                    return (
                      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-10 text-center text-zinc-600 text-sm italic">
                        Nenhum compromisso futuro agendado para o período.
                      </div>
                    );
                  }
                  return groupAppointments(upcomingAppointments).map((a) => {
                    const isBlock = a.service.startsWith("BLOQUEIO");
                    return (
                      <div
                        key={a.id}
                        className="bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-4 flex flex-col gap-2"
                      >
                        <div className="flex items-center gap-4">
                          <div
                            className={`rounded-xl px-3 py-2 text-center min-w-[64px] ${isBlock ? "bg-red-900/20 border border-red-900/50" : "bg-zinc-800 border border-zinc-700"}`}
                          >
                            <div
                              className={`font-black text-sm ${isBlock ? "text-red-400" : "text-zinc-100"}`}
                            >
                              {a.date
                                .split("-")
                                .reverse()
                                .slice(0, 2)
                                .join("/")}
                            </div>
                            <div
                              className={`text-sm font-black leading-none ${a.isGroupedBlock && a.time !== a.endTime ? "text-[11px]" : "text-lg"}`}
                            >
                              {a.isGroupedBlock && a.time !== a.endTime
                                ? `${a.time} às ${a.endTime}`
                                : a.time}
                            </div>
                          </div>
                          <div className="flex-1">
                            <div
                              className={`font-bold text-sm italic ${isBlock ? "text-red-400" : "text-zinc-100"}`}
                            >
                              {isBlock ? (
                                "HORÁRIO BLOQUEADO"
                              ) : (
                                <button
                                  onClick={() => openClientDetail(a)}
                                  title="Ver celular do cliente"
                                  className="text-left hover:text-amber-400 transition-colors underline decoration-zinc-700 underline-offset-4 cursor-pointer"
                                >
                                  {renderCustomerName(a)}
                                </button>
                              )}
                            </div>
                            <div className="text-zinc-500 text-xs mt-0.5">
                              {isBlock
                                ? a.service.replace("BLOQUEIO: ", "")
                                : renderServiceDescription(a)}
                            </div>
                          </div>
                          {!isBlock && (
                            <div className="flex items-center gap-2 border-l border-zinc-800 pl-3">
                              <button
                                onClick={() => openEditModal(a)}
                                className="text-zinc-500 hover:text-amber-400 p-1.5 transition-colors"
                              >
                                <Edit2 size={16} />
                              </button>
                              <button
                                onClick={() => handleCancelByBarber(a.id)}
                                className="text-zinc-500 hover:text-red-400 p-1.5 transition-colors"
                              >
                                <XCircle size={16} />
                              </button>
                            </div>
                          )}
                          {isBlock && (
                            <button
                              onClick={() =>
                                deleteAppointment(
                                  a.isGroupedBlock ? a.blockIds : a.id,
                                )
                              }
                              className="text-zinc-600 hover:text-red-400 p-2"
                            >
                              <Trash2 size={18} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </section>

            <section className="mt-2">
              <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-4">
                Gerenciar Bloqueios
              </h3>
              <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 flex flex-col gap-4 shadow-lg">
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="date"
                    min={todayStr}
                    value={newBlockDate}
                    onChange={(e) => setNewBlockDate(e.target.value)}
                    className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm focus:border-amber-400 outline-none [color-scheme:dark]"
                  />
                  <input
                    type="text"
                    placeholder="Motivo (Ex: Reunião)"
                    value={newBlockReason}
                    onChange={(e) => setNewBlockReason(e.target.value)}
                    className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm focus:border-amber-400 outline-none"
                  />
                </div>
                <div className="flex bg-zinc-800 p-1 rounded-xl border border-zinc-700">
                  <button
                    onClick={() => {
                      setIsFullDay(true);
                      setSelectedTimes([]);
                    }}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${isFullDay ? "bg-zinc-700 text-amber-400" : "text-zinc-500 hover:text-white"}`}
                  >
                    DIA INTEIRO
                  </button>
                  <button
                    onClick={() => setIsFullDay(false)}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${!isFullDay ? "bg-zinc-700 text-amber-400" : "text-zinc-500 hover:text-white"}`}
                  >
                    ESCOLHER HORÁRIOS
                  </button>
                </div>
                {!isFullDay && (
                  <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                    {HOURS.map((h) => {
                      const isSelected = selectedTimes.includes(h);
                      return (
                        <button
                          key={h}
                          onClick={() => {
                            if (
                              selectedTimes.length === 0 ||
                              selectedTimes.length > 1
                            ) {
                              setSelectedTimes([h]);
                            } else if (selectedTimes.length === 1) {
                              const startIdx = HOURS.indexOf(selectedTimes[0]);
                              const endIdx = HOURS.indexOf(h);
                              const minIdx = Math.min(startIdx, endIdx);
                              const maxIdx = Math.max(startIdx, endIdx);

                              const newSelection = HOURS.slice(
                                minIdx,
                                maxIdx + 1,
                              );
                              setSelectedTimes(newSelection);
                            }
                          }}
                          className={`py-2 rounded-lg text-[10px] font-bold border transition-all ${isSelected ? "bg-amber-400 border-amber-400 text-zinc-950" : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500"}`}
                        >
                          {h}
                        </button>
                      );
                    })}
                  </div>
                )}
                <div className="flex flex-col gap-3 mt-2 border-t border-zinc-800/60 pt-3 mb-2">
                  <label className="flex items-center gap-3 text-sm font-bold text-amber-400 cursor-pointer pl-1">
                    <input
                      type="checkbox"
                      checked={isRecurring}
                      onChange={(e) => setIsRecurring(e.target.checked)}
                      className="w-5 h-5 rounded border-amber-500/50 text-amber-400 focus:ring-amber-400 bg-zinc-950"
                    />
                    Repetir Bloqueio Semanalmente
                  </label>
                  {isRecurring && (
                    <div className="flex items-center gap-3 bg-amber-400/10 border border-amber-400/20 p-3 rounded-xl animate-in zoom-in-95">
                      <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider w-full">
                        Por quantas semanas?
                      </span>
                      <input
                        type="number"
                        min="2"
                        max="52"
                        value={recurringWeeks}
                        onChange={(e) => setRecurringWeeks(e.target.value)}
                        className="w-20 bg-zinc-950 border border-amber-500/30 rounded-lg px-3 py-2 text-amber-400 font-black text-center outline-none"
                      />
                    </div>
                  )}
                </div>
                <button
                  onClick={handleSmartBlock}
                  disabled={
                    !newBlockDate ||
                    (!isFullDay && selectedTimes.length === 0) ||
                    loadingBlock
                  }
                  className="bg-amber-400 text-zinc-950 font-black py-4 rounded-xl uppercase text-xs tracking-widest disabled:opacity-30 hover:bg-amber-300 transition-colors"
                >
                  Confirmar Bloqueio
                </button>
              </div>

              {blockedDates.length > 0 && (
                <div className="mt-6 flex flex-col gap-3">
                  <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-1">
                    Dias Inteiros Bloqueados
                  </h4>
                  {blockedDates.map((b) => (
                    <div
                      key={b.id}
                      className="bg-zinc-900 border border-red-900/30 p-4 rounded-2xl flex justify-between items-center shadow-md"
                    >
                      <div className="flex items-center gap-3">
                        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-2.5 rounded-xl">
                          <Calendar size={20} />
                        </div>
                        <div>
                          <div className="font-black text-white text-sm">
                            {b.date.split("-").reverse().join("/")}
                          </div>
                          <div className="text-zinc-500 text-xs mt-0.5">
                            {b.reason || "Sem descrição"}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => deleteFullDayBlock(b.id)}
                        className="text-zinc-500 hover:text-red-400 p-2 bg-zinc-950 rounded-xl transition-colors border border-zinc-800 hover:border-red-900/50"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {/* --- NOVO AGENDAMENTO E DESCONTO VIP --- */}
        {activeTab === "novo" && (
          <div className="flex flex-col gap-6 animate-in fade-in duration-500">
            <header>
              <h1 className="text-2xl font-black italic uppercase">
                Novo Agendamento
              </h1>
            </header>
            <div className="flex flex-col gap-4 bg-zinc-900/50 border border-zinc-800 p-6 rounded-3xl shadow-lg">
              <select
                value={manualClientId}
                onChange={async (e) => {
                  const cId = e.target.value;
                  setManualClientId(cId);

                  // Busca se o cliente tem um plano ativo
                  if (cId) {
                    const { data: planData } = await supabase
                      .from("client_plans")
                      .select("*")
                      .eq("client_id", cId)
                      .eq("status", "active")
                      .single();
                    setManualActivePlan(planData || null);
                  } else {
                    setManualActivePlan(null);
                  }
                }}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white outline-none"
              >
                <option value="AVULSO">
                  👤 Cliente Avulso (Digitar nome...)
                </option>
                <optgroup
                  label="Clientes CRM"
                  className="text-zinc-400 font-normal"
                >
                  {crmClients.map((c) => (
                    <option key={c.id} value={c.id} className="text-white">
                      {c.name} {c.is_ghost ? "(Balcão)" : ""}
                    </option>
                  ))}
                </optgroup>
              </select>
              {manualClientId === "AVULSO" && (
                <input
                  type="text"
                  placeholder="Nome do Cliente (Avulso)"
                  value={manualCustomer}
                  onChange={(e) => setManualCustomer(e.target.value)}
                  className="bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 text-white outline-none animate-in fade-in focus:border-amber-400 transition-colors"
                />
              )}

              <div className="grid grid-cols-2 gap-4">
                <select
                  value={manualService}
                  onChange={(e) => {
                    const s = e.target.value;
                    setManualService(s);

                    // Lógica para definir o preço automaticamente
                    if (s.startsWith("PLANO:")) {
                      setManualPrice("R$ 0,00");
                      setUsePlan(true);
                    } else {
                      setUsePlan(false);
                      const sD = servicesList.find((sv) => sv.name === s);
                      if (sD) {
                        setManualPrice(
                          `R$ ${sD.price.toFixed(2).replace(".", ",")}`,
                        );
                      }
                    }
                  }}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 text-white outline-none appearance-none focus:border-amber-400 transition-colors"
                >
                  <option value="">Serviço...</option>

                  {/* Opção do Plano */}
                  {manualActivePlan &&
                    manualActivePlan.cuts_used <
                      manualActivePlan.cuts_allowed && (
                      <option value={`PLANO: ${manualActivePlan.plan_name}`}>
                        💳 USAR PLANO: {manualActivePlan.plan_name} (
                        {manualActivePlan.cuts_allowed -
                          manualActivePlan.cuts_used}{" "}
                        restantes)
                      </option>
                    )}

                  {/* Serviços normais */}
                  {servicesList
                    .filter((s) => !s.name.toLowerCase().includes("plano"))
                    .map((s) => (
                      <option key={s.id} value={s.name}>
                        {s.name} - R$ {s.price.toFixed(2).replace(".", ",")}
                      </option>
                    ))}
                </select>
                {isVipDiscount ? (
                  <input
                    type="number"
                    placeholder="Valor (Ex: 25,00)"
                    value={vipPrice}
                    onChange={(e) => setVipPrice(e.target.value)}
                    className="bg-zinc-950 border border-amber-500/50 rounded-2xl px-4 py-3 font-black text-amber-400 outline-none animate-in fade-in"
                  />
                ) : (
                  <input
                    type="text"
                    value={usePlan ? "R$ 0,00" : manualPrice}
                    readOnly
                    className={`bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 font-bold outline-none ${usePlan ? "text-amber-400" : "text-zinc-500"}`}
                  />
                )}
              </div>

              <div className="flex flex-col gap-3 mt-1 border-t border-zinc-800/60 pt-4">
                {activeClientPlan && (
                  <div className="bg-zinc-950/50 p-4 rounded-2xl border border-amber-500/30 flex flex-col gap-2 shadow-[0_0_15px_rgba(251,191,36,0.05)] transition-all">
                    <label className="flex items-center gap-3 text-sm font-bold text-zinc-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={usePlan}
                        onChange={(e) => {
                          setUsePlan(e.target.checked);
                          setIsVipDiscount(false);
                        }}
                        className="w-5 h-5 rounded border-zinc-700 text-amber-400 focus:ring-amber-400 bg-zinc-800"
                      />
                      Descontar do Plano Ativo
                    </label>
                    <p className="text-[10px] text-amber-400 font-bold uppercase ml-8 tracking-wider">
                      {activeClientPlan.plan_name} •{" "}
                      {activeClientPlan.cuts_used}/
                      {activeClientPlan.cuts_allowed} usados
                    </p>
                  </div>
                )}
                <label className="flex items-center gap-3 text-sm font-bold text-zinc-300 cursor-pointer pl-1">
                  <input
                    type="checkbox"
                    checked={isVipDiscount}
                    onChange={(e) => {
                      setIsVipDiscount(e.target.checked);
                      setUsePlan(false);
                      setVipPrice("");
                    }}
                    className="w-5 h-5 rounded border-zinc-700 text-amber-400 focus:ring-amber-400 bg-zinc-800"
                  />
                  Aplicar Desconto VIP (Preço Flexível)
                </label>
              </div>

              <input
                type="date"
                value={manualDate}
                onChange={(e) => {
                  setManualDate(e.target.value);
                  setManualTime("");
                }}
                className="bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 mt-2 text-white [color-scheme:dark] focus:border-amber-400 transition-colors"
              />
              <select
                value={manualTime}
                onChange={(e) => setManualTime(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 text-white outline-none appearance-none focus:border-amber-400 transition-colors"
              >
                <option value="">Horário...</option>
                {HOURS.filter((h) => !manualTakenSlots.includes(h)).map(
                  (h, i) => (
                    <option key={i} value={h}>
                      {h}
                    </option>
                  ),
                )}
              </select>
              {/* CHECKBOX DA RECORRÊNCIA */}
              <div className="flex flex-col gap-3 mt-2 border-t border-zinc-800/60 pt-3">
                <label className="flex items-center gap-3 text-sm font-bold text-amber-400 cursor-pointer pl-1">
                  <input
                    type="checkbox"
                    checked={isRecurring}
                    onChange={(e) => setIsRecurring(e.target.checked)}
                    className="w-5 h-5 rounded border-amber-500/50 text-amber-400 focus:ring-amber-400 bg-zinc-950"
                  />
                  Repetir Semanalmente (Recorrente)
                </label>
                {isRecurring && (
                  <div className="flex items-center gap-3 bg-amber-400/10 border border-amber-400/20 p-3 rounded-xl animate-in zoom-in-95">
                    <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider w-full">
                      Por quantas semanas?
                    </span>
                    <input
                      type="number"
                      min="2"
                      max="52"
                      value={recurringWeeks}
                      onChange={(e) => setRecurringWeeks(e.target.value)}
                      className="w-20 bg-zinc-950 border border-amber-500/30 rounded-lg px-3 py-2 text-amber-400 font-black text-center outline-none"
                    />
                  </div>
                )}
              </div>
              <button
                onClick={handleManualSchedule}
                disabled={isSaving || !manualTime}
                className="bg-amber-400 hover:bg-amber-300 text-zinc-950 font-black py-4 rounded-2xl uppercase tracking-widest disabled:opacity-30 transition-colors"
              >
                {isSaving ? "Salvando..." : "Confirmar Agenda"}
              </button>
            </div>
          </div>
        )}

        {/* --- FINANÇAS (BI MANUAL TURBINADO) --- */}
        {activeTab === "financeiro" && (
          <div className="flex flex-col gap-6 animate-in fade-in duration-500">
            <header className="flex justify-between items-end mb-2">
              <div>
                <h1 className="text-2xl font-black italic uppercase">
                  Meu Caixa
                </h1>
                <p className="text-zinc-500 text-sm mt-1">
                  Fechamentos e Despesas
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setTransType("saida");
                    setIsTransModalOpen(true);
                  }}
                  className="bg-red-500/10 text-red-500 p-3 rounded-xl hover:bg-red-500 hover:text-white transition-colors border border-red-500/20"
                >
                  <TrendingDown size={20} strokeWidth={2.5} />
                </button>
                <button
                  onClick={() => {
                    setTransType("entrada");
                    setIsTransModalOpen(true);
                  }}
                  className="bg-emerald-500/10 text-emerald-400 p-3 rounded-xl hover:bg-emerald-500 hover:text-zinc-950 transition-colors border border-emerald-500/20"
                >
                  <PlusCircle size={20} strokeWidth={2.5} />
                </button>
              </div>
            </header>

            {/* CARDS DE RESUMO (BI) */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-3xl flex flex-col gap-2 shadow-lg">
                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <Wallet size={12} className="text-amber-400" /> Saldo Líquido
                  (Mês)
                </span>
                <span
                  className={`text-2xl font-black ${financeKPIs.saldoMes >= 0 ? "text-emerald-400" : "text-red-400"}`}
                >
                  R$ {financeKPIs.saldoMes.toFixed(2).replace(".", ",")}
                </span>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-3xl flex flex-col gap-2 shadow-lg">
                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <Scissors size={12} className="text-amber-400" /> Clientes
                  Atendidos
                </span>
                <span className="text-2xl font-black text-white">
                  {financeKPIs.clientesMes}{" "}
                  <span className="text-[10px] text-amber-400 lowercase font-normal">
                    ({financeKPIs.clientesHoje} hoje)
                  </span>
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-zinc-950 border border-emerald-500/20 p-4 rounded-2xl flex flex-col">
                <span className="text-[10px] text-emerald-500 font-bold uppercase mb-1">
                  Entradas Acumuladas
                </span>
                <span className="text-lg font-bold text-white">
                  R$ {financeKPIs.entradasMes.toFixed(2).replace(".", ",")}
                </span>
              </div>
              <div className="bg-zinc-950 border border-red-500/20 p-4 rounded-2xl flex flex-col">
                <span className="text-[10px] text-red-500 font-bold uppercase mb-1">
                  Despesas / Saídas
                </span>
                <span className="text-lg font-bold text-white">
                  R$ {financeKPIs.saidasMes.toFixed(2).replace(".", ",")}
                </span>
              </div>
            </div>
            {/* GRÁFICO ANUAL */}
            <section className="bg-zinc-900 border border-zinc-800 p-5 rounded-3xl flex flex-col mt-2 shadow-lg">
              <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-4">
                Sua Evolução Anual
              </h3>
              <div className="flex justify-between gap-1 h-32">
                {financeKPIs.chartMensal?.map((data, idx) => {
                  const isCurrent = idx === new Date().getMonth();
                  const height = `${(data.receita / financeKPIs.maxMensal) * 100}%`;
                  const barColor = isCurrent
                    ? "bg-amber-400"
                    : data.receita > 0
                      ? "bg-zinc-600 group-hover:bg-amber-400/50"
                      : "bg-zinc-800";

                  return (
                    <div
                      key={data.name}
                      className="flex flex-col items-center justify-end gap-1 flex-1 group h-full cursor-pointer relative"
                    >
                      <div className="w-full relative h-full flex flex-col justify-end">
                        <div
                          className={`w-full rounded-t-sm transition-all duration-500 ${barColor}`}
                          style={{ height: data.receita > 0 ? height : "2px" }}
                        >
                          {/* TOOLTIP DO TOQUE/MOUSE */}
                          <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-zinc-800 border border-zinc-700 text-white text-[9px] font-bold px-3 py-2 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 flex flex-col items-center gap-0.5 shadow-xl">
                            <span className="whitespace-nowrap text-amber-400">
                              R$ {data.receita.toFixed(0)}
                            </span>
                            <span className="whitespace-nowrap text-zinc-300 text-[8px]">
                              {data.clientes} cortes
                            </span>
                          </div>
                        </div>
                      </div>
                      <span
                        className={`text-[8px] font-bold uppercase ${isCurrent ? "text-amber-400" : "text-zinc-600"}`}
                      >
                        {data.name}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
            {/* EXTRATO HISTÓRICO */}
            <section className="mt-2">
              <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-4">
                Extrato do Mês
              </h3>
              <div className="flex flex-col gap-3">
                {transactions.length === 0 ? (
                  <div className="text-center py-10 text-zinc-600 italic text-sm border border-zinc-800 rounded-2xl bg-zinc-900/30">
                    Nenhum lançamento registrado neste mês.
                  </div>
                ) : (
                  transactions.map((t) => (
                    <div
                      key={t.id}
                      className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl flex justify-between items-center group hover:border-zinc-700 transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`p-2.5 rounded-xl ${t.type === "entrada" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}
                        >
                          {t.type === "entrada" ? (
                            <TrendingUp size={18} />
                          ) : (
                            <TrendingDown size={18} />
                          )}
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-zinc-100">
                            {t.description}
                          </h4>
                          <p className="text-[10px] text-zinc-500 font-mono mt-0.5">
                            {t.reference_date.split("-").reverse().join("/")}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`font-black text-sm ${t.type === "entrada" ? "text-emerald-400" : "text-red-400"}`}
                      >
                        {t.type === "entrada" ? "+" : "-"} R${" "}
                        {Number(t.amount).toFixed(2).replace(".", ",")}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* SUA SEÇÃO DE OBJETIVOS RESGATADA */}
            <section className="mt-4 border-t border-zinc-800/60 pt-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">
                  Seus Objetivos
                </h3>
                <button
                  onClick={() => setIsGoalModalOpen(true)}
                  className="text-amber-400 hover:text-amber-300 transition-colors flex items-center gap-1 bg-amber-400/10 px-3 py-1.5 rounded-lg"
                >
                  <Target size={14} />
                  <span className="text-xs font-bold">Nova Meta</span>
                </button>
              </div>
              <div className="flex flex-col gap-3">
                {goals.length === 0 ? (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-3xl px-4 py-8 text-center text-zinc-600 text-sm italic">
                    Nenhuma meta definida. Crie um objetivo!
                  </div>
                ) : (
                  goals.map((goal) => {
                    // Usa o Saldo Líquido atual para bater a meta!
                    const percentage = Math.min(
                      (financeKPIs.saldoMes / goal.target_value) * 100,
                      100,
                    );
                    return (
                      <div
                        key={goal.id}
                        className="bg-zinc-900 border border-zinc-800 p-5 rounded-3xl flex flex-col gap-4 relative overflow-hidden"
                      >
                        <div className="flex justify-between items-start relative z-10">
                          <div className="flex items-center gap-3">
                            <div className="bg-zinc-800 p-2.5 rounded-xl text-amber-400">
                              <Target size={20} />
                            </div>
                            <div>
                              <h4 className="font-bold text-white text-sm">
                                {goal.title}
                              </h4>
                              <p className="text-zinc-500 text-xs mt-0.5">
                                Faltam R${" "}
                                {(goal.target_value - financeKPIs.saldoMes > 0
                                  ? goal.target_value - financeKPIs.saldoMes
                                  : 0
                                )
                                  .toFixed(2)
                                  .replace(".", ",")}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <span className="font-black text-amber-400 text-sm">
                              R${" "}
                              {goal.target_value.toFixed(2).replace(".", ",")}
                            </span>
                            <button
                              onClick={() => handleDeleteGoal(goal.id)}
                              className="text-zinc-600 hover:text-red-400 transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                        <div className="w-full bg-zinc-800 rounded-full h-3 mb-1 relative z-10 overflow-hidden">
                          <div
                            className="bg-amber-400 h-3 rounded-full transition-all duration-1000 ease-out"
                            style={{ width: `${Math.max(percentage, 0)}%` }}
                          ></div>
                        </div>
                        <div className="flex justify-between text-[10px] font-bold text-zinc-500 uppercase z-10">
                          <span>Progresso Líquido</span>
                          <span
                            className={
                              percentage >= 100 ? "text-emerald-400" : ""
                            }
                          >
                            {Math.max(percentage, 0).toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          </div>
        )}

        {/* GESTÃO & CRM */}
        {activeTab === "gestao" && (
          <div className="flex flex-col gap-6 animate-in fade-in duration-500">
            {gestaoView === "menu" && (
              <div className="flex flex-col gap-4">
                <header className="mb-4">
                  <h1 className="text-2xl font-black italic uppercase">
                    Gestão
                  </h1>
                </header>
                <button
                  onClick={() => setGestaoView("crm")}
                  className="bg-zinc-900 border border-zinc-800 hover:border-amber-400/50 p-6 rounded-3xl flex items-center gap-4 transition-all group"
                >
                  <div className="bg-amber-400/10 p-4 rounded-2xl text-amber-400 group-hover:scale-110 transition-transform">
                    <Users size={28} />
                  </div>
                  <div className="text-left flex-1">
                    <h3 className="text-lg font-bold text-white">CRM</h3>
                    <p className="text-zinc-500 text-xs">
                      Clientes e Assinaturas
                    </p>
                  </div>
                </button>
                <button
                  onClick={() => setGestaoView("estoque")}
                  className="bg-zinc-900 border border-zinc-800 hover:border-amber-400/50 p-6 rounded-3xl flex items-center gap-4 transition-all"
                >
                  <div className="bg-amber-400/10 p-4 rounded-2xl text-amber-400">
                    <Package size={28} />
                  </div>
                  <div className="text-left flex-1">
                    <h3 className="text-lg font-bold text-white">Estoque</h3>
                    <p className="text-zinc-500 text-xs">
                      Produtos e geladeira
                    </p>
                  </div>
                </button>
                <button
                  onClick={() => setGestaoView("servicos")}
                  className="bg-zinc-900 border border-zinc-800 hover:border-amber-400/50 p-6 rounded-3xl flex items-center gap-4 transition-all"
                >
                  <div className="bg-amber-400/10 p-4 rounded-2xl text-amber-400">
                    <Briefcase size={28} />
                  </div>
                  <div className="text-left flex-1">
                    <h3 className="text-lg font-bold text-white">Serviços</h3>
                    <p className="text-zinc-500 text-xs">Preços e duração</p>
                  </div>
                </button>
              </div>
            )}

            {gestaoView === "crm" && (
              <div className="flex flex-col gap-4 animate-in slide-in-from-right-4 duration-300">
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setGestaoView("menu")}
                      className="text-zinc-500 p-2 hover:text-white transition-colors"
                    >
                      <ChevronLeft size={24} />
                    </button>
                    <h2 className="text-xl font-bold italic">CRM</h2>
                  </div>
                  {crmTab === "assinaturas" ? (
                    <button
                      onClick={() => setIsPlanModalOpen(true)}
                      className="bg-amber-400 text-zinc-950 p-2.5 rounded-xl hover:scale-105 transition-transform"
                    >
                      <PlusCircle size={20} strokeWidth={2.5} />
                    </button>
                  ) : (
                    <button
                      onClick={() => setIsNewClientModalOpen(true)}
                      className="bg-amber-400 text-zinc-950 p-2.5 rounded-xl hover:scale-105 transition-transform"
                    >
                      <UserPlus size={20} strokeWidth={2.5} />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3 mb-2 animate-in slide-in-from-top-4 duration-300">
                  <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl flex flex-col gap-1 shadow-md">
                    <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
                      Total Clientes (Rede)
                    </span>
                    <span className="text-2xl font-black text-white">
                      {crmClients.length}
                    </span>
                  </div>
                  <div className="bg-zinc-900 border border-amber-500/30 p-4 rounded-2xl flex flex-col gap-1 shadow-[0_0_15px_rgba(251,191,36,0.05)]">
                    <span className="text-[10px] text-amber-500 font-bold uppercase tracking-wider">
                      Assinaturas (Suas)
                    </span>
                    <span className="text-2xl font-black text-amber-400">
                      {clientPlans.filter((p) => p.status === "active").length}
                    </span>
                  </div>
                </div>

                {/* --- BOTÕES DE NAVEGAÇÃO DO CRM --- */}
                <div className="flex gap-2 bg-zinc-900 p-1 rounded-xl">
                  <button
                    onClick={() => setCrmTab("assinaturas")}
                    className={`flex-1 py-2 text-xs font-bold uppercase rounded-lg ${crmTab === "assinaturas" ? "bg-zinc-800 text-amber-400" : "text-zinc-500"}`}
                  >
                    Assinaturas
                  </button>
                  <button
                    onClick={() => setCrmTab("clientes")}
                    className={`flex-1 py-2 text-xs font-bold uppercase rounded-lg ${crmTab === "clientes" ? "bg-zinc-800 text-amber-400" : "text-zinc-500"}`}
                  >
                    Todos os Clientes
                  </button>
                </div>

                {crmTab === "assinaturas" && (
                  <div className="flex flex-col gap-3 mt-2">
                    {/* AQUI ESTÁ A MÁGICA: FILTRAMOS APENAS OS PLANOS ATIVOS PARA NÃO POLUIR A TELA */}
                    {clientPlans.filter((p) => p.status === "active").length ===
                    0 ? (
                      <div className="text-center py-12 px-6 text-zinc-600 italic border border-zinc-800 rounded-3xl flex flex-col items-center gap-3 bg-zinc-900/30">
                        <CreditCard size={32} className="text-zinc-700" />{" "}
                        Nenhuma assinatura ativa na sua carteira.
                      </div>
                    ) : (
                      clientPlans
                        .filter((p) => p.status === "active")
                        .map((plan) => {
                          const startDateString = plan.start_date
                            ? plan.start_date.split("T")[0]
                            : plan.created_at.split("T")[0];
                          const [sy, sm, sd] = startDateString
                            .split("-")
                            .map(Number);
                          const startDate = new Date(sy, sm - 1, sd);
                          const expDate = new Date(startDate);
                          expDate.setDate(startDate.getDate() + 30);
                          const diffTime =
                            expDate.getTime() - new Date().getTime();
                          const diffDays = Math.ceil(
                            diffTime / (1000 * 60 * 60 * 24),
                          );

                          let semCardClass = "border-zinc-800 bg-zinc-900";
                          let semBadgeClass =
                            "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
                          let semText = "🟢 Saudável";

                          if (
                            diffDays <= 0 ||
                            plan.cuts_used >= plan.cuts_allowed
                          ) {
                            semCardClass = "border-red-500/30 bg-red-950/20";
                            semBadgeClass =
                              "bg-red-500/10 text-red-400 border-red-500/20";
                            semText = "🔴 Esgotado / Expirado";
                          } else if (
                            diffDays <= 7 ||
                            plan.cuts_used === plan.cuts_allowed - 1
                          ) {
                            semCardClass =
                              "border-amber-500/30 bg-amber-950/20";
                            semBadgeClass =
                              "bg-amber-500/10 text-amber-400 border-amber-500/20";
                            semText = `🟡 Atenção (${diffDays} dias ou 1 corte restante)`;
                          }

                          return (
                            <div
                              key={plan.id}
                              className={`border p-5 rounded-3xl flex flex-col gap-4 transition-all shadow-[0_4px_20px_rgba(0,0,0,0.2)] ${semCardClass}`}
                            >
                              <div className="flex justify-between items-start">
                                <div>
                                  <h4 className="font-bold text-white text-base">
                                    {plan.profiles?.name || "Cliente Fantasma"}
                                  </h4>
                                  <p className="text-amber-400 text-xs mt-0.5 font-bold italic">
                                    {plan.plan_name}
                                  </p>
                                </div>
                                <span
                                  className={`text-[10px] font-black uppercase px-2 py-1 rounded-md tracking-wider border ${semBadgeClass}`}
                                >
                                  {semText}
                                </span>
                              </div>
                              <div className="flex flex-col gap-1.5">
                                <div className="w-full bg-zinc-800/80 rounded-full h-2 overflow-hidden">
                                  <div
                                    className="bg-amber-400 h-2 rounded-full transition-all"
                                    style={{
                                      width: `${(plan.cuts_used / plan.cuts_allowed) * 100}%`,
                                    }}
                                  ></div>
                                </div>
                                <div className="flex justify-between text-[10px] font-bold text-zinc-500 uppercase">
                                  <span>Consumo</span>
                                  <span className="text-zinc-300">
                                    {plan.cuts_used} de {plan.cuts_allowed}{" "}
                                    cortes
                                  </span>
                                </div>
                              </div>
                              <div className="flex justify-between items-center border-t border-zinc-800/60 pt-3">
                                <div className="text-[10px] text-zinc-500">
                                  Vence em:{" "}
                                  {expDate
                                    .toISOString()
                                    .split("T")[0]
                                    .split("-")
                                    .reverse()
                                    .join("/")}
                                </div>
                                <div className="text-xs text-zinc-400">
                                  Receita:{" "}
                                  <span className="text-emerald-400 font-bold">
                                    R${" "}
                                    {plan.price_paid
                                      .toFixed(2)
                                      .replace(".", ",")}
                                  </span>
                                </div>
                              </div>
                              {/* AÇÕES CRM */}
                              <div className="flex gap-2 justify-end items-center border-t border-zinc-800/60 pt-3 mt-1">
                                <button
                                  onClick={() => openRenewModal(plan)}
                                  className="flex-1 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-zinc-950 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors"
                                >
                                  Renovar
                                </button>
                                <button
                                  onClick={() => openEditPlanModal(plan)}
                                  className="flex-1 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors"
                                >
                                  Editar
                                </button>
                                <button
                                  onClick={() => handleDeletePlan(plan.id)}
                                  className="flex-1 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors"
                                >
                                  Excluir
                                </button>
                              </div>
                            </div>
                          );
                        })
                    )}
                  </div>
                )}
                {crmTab === "clientes" && (
                  <div className="flex flex-col gap-3 mt-2 animate-in fade-in duration-300">
                    {/* BARRA DE PESQUISA */}
                    <input
                      type="text"
                      placeholder="Pesquisar cliente por nome..."
                      value={clientSearch}
                      onChange={(e) => setClientSearch(e.target.value)}
                      className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-amber-400 transition-colors w-full"
                    />

                    {/* LISTA DE CLIENTES FILTRADA */}
                    <div className="flex flex-col gap-3 mt-1 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                      {crmClients
                        .filter(
                          (c) =>
                            c.name
                              .toLowerCase()
                              .includes(clientSearch.toLowerCase()) ||
                            (c.phone && c.phone.includes(clientSearch)),
                        )
                        .map((c) => (
                          <div
                            key={c.id}
                            className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl flex justify-between items-center group hover:border-zinc-700 transition-colors"
                          >
                            <div className="flex flex-col gap-0.5">
                              <h4 className="font-bold text-zinc-100 flex items-center gap-2">
                                {c.name}
                                {c.is_ghost && (
                                  <span className="text-[9px] bg-zinc-800 border border-zinc-700 px-1.5 py-0.5 rounded text-zinc-400 uppercase tracking-wider">
                                    Balcão
                                  </span>
                                )}
                              </h4>
                              <span className="text-xs text-zinc-500">
                                {c.phone || "Sem contato"}
                              </span>
                              <span className="text-[10px] text-zinc-600 mt-0.5">
                                Nasc:{" "}
                                {c.birth_date
                                  ? c.birth_date.split("-").reverse().join("/")
                                  : "--/--/----"}
                              </span>
                            </div>

                            {/* --- NOVOS BOTÕES DE AÇÃO --- */}
                            <div className="flex items-center gap-2">
                              {/* NOVO BOTÃO: RESET DE SENHA */}
                              {!c.is_ghost && (
                                <button
                                  onClick={() => {
                                    setSelectedUserForReset(c);
                                    setResetResultLink("");
                                    setShowPassMessage(false);
                                    setShowResetModal(true);
                                  }}
                                  className="text-amber-400 hover:text-amber-300 bg-zinc-950 p-2.5 rounded-xl border border-zinc-800 hover:border-amber-400/50 transition-all opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                                  title="Suporte de Acesso (Senha)"
                                >
                                  <ShieldCheck size={18} />
                                </button>
                              )}

                              <button
                                onClick={() => handleDeleteClient(c.id, c.name)}
                                className="text-zinc-600 hover:text-red-400 bg-zinc-950 p-2.5 rounded-xl border border-zinc-800 hover:border-red-900/50 transition-all opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                                title="Excluir Cliente"
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
                          </div>
                        ))}

                      {crmClients.filter((c) =>
                        c.name
                          .toLowerCase()
                          .includes(clientSearch.toLowerCase()),
                      ).length === 0 && (
                        <div className="text-center py-10 text-zinc-600 italic text-sm">
                          Nenhum cliente encontrado com esse nome.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {gestaoView === "estoque" && (
              <div className="flex flex-col gap-4 animate-in slide-in-from-right-4 duration-300">
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setGestaoView("menu")}
                      className="text-zinc-500 p-2"
                    >
                      <ChevronLeft size={24} />
                    </button>
                    <h2 className="text-xl font-bold italic">Estoque</h2>
                  </div>
                  <button
                    onClick={() => setIsProductModalOpen(true)}
                    className="bg-amber-400 text-zinc-950 p-2.5 rounded-xl"
                  >
                    <PlusCircle size={20} />
                  </button>
                </div>
                <div className="flex gap-2 bg-zinc-900 p-1 rounded-xl">
                  <button
                    onClick={() => setEstoqueTab("barbearia")}
                    className={`flex-1 py-2 text-xs font-bold uppercase rounded-lg ${estoqueTab === "barbearia" ? "bg-zinc-800 text-amber-400" : "text-zinc-500"}`}
                  >
                    Barbearia
                  </button>
                  <button
                    onClick={() => setEstoqueTab("geladeira")}
                    className={`flex-1 py-2 text-xs font-bold uppercase rounded-lg ${estoqueTab === "geladeira" ? "bg-zinc-800 text-amber-400" : "text-zinc-500"}`}
                  >
                    Geladeira
                  </button>
                </div>
                <div className="flex flex-col gap-3">
                  {products
                    .filter((p) => p.category === estoqueTab)
                    .map((product) => {
                      const isZerado = product.quantity === 0;
                      const isLowStock =
                        product.quantity > 0 && product.quantity <= 5;
                      let cardStyle = "bg-zinc-900 border-zinc-800";
                      if (isZerado)
                        cardStyle =
                          "bg-red-950/10 border-red-900/50 opacity-60";
                      else if (isLowStock)
                        cardStyle = "bg-amber-500/10 border-amber-500/40";
                      return (
                        <div
                          key={product.id}
                          className={`p-4 rounded-2xl flex flex-col border transition-all ${cardStyle}`}
                        >
                          {/* LINHA DE CIMA: Dados do Produto e Botões */}
                          <div className="flex justify-between items-center">
                            <div className="flex flex-col">
                              <h4
                                className={`font-bold flex items-center gap-2 ${isZerado ? "text-red-400 line-through" : "text-white"}`}
                              >
                                {product.name}
                                {isZerado && (
                                  <span className="text-[9px] bg-red-500 text-white px-1.5 py-0.5 rounded uppercase tracking-wider not-italic no-underline">
                                    Esgotado
                                  </span>
                                )}
                              </h4>
                              <span
                                className={`text-xs ${isZerado ? "text-red-500/70" : "text-zinc-500"}`}
                              >
                                Qtd: {product.quantity}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-sm font-black mr-2 ${isZerado ? "text-red-400/50" : "text-amber-400"}`}
                              >
                                R$ {product.price.toFixed(2).replace(".", ",")}
                              </span>
                              <button
                                onClick={() => openEditProductModal(product)}
                                className="text-zinc-500 p-1.5 hover:text-amber-400 transition-colors"
                              >
                                <Edit2 size={16} />
                              </button>
                              <button
                                onClick={() => handleDeleteProduct(product.id)}
                                className="text-zinc-500 p-1.5 hover:text-red-400 transition-colors"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>

                          {/* LINHA DE BAIXO: Rodapé de Auditoria */}
                          {product.updated_at && product.profiles?.name && (
                            <div className="flex justify-between items-center border-t border-zinc-800/60 pt-2 mt-3 text-[10px]">
                              <span className="text-zinc-500 italic">
                                Alterado:{" "}
                                {new Date(
                                  product.updated_at,
                                ).toLocaleDateString("pt-BR")}{" "}
                                às{" "}
                                {new Date(
                                  product.updated_at,
                                ).toLocaleTimeString("pt-BR", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                              <span className="text-zinc-400 font-bold uppercase tracking-wider">
                                Por: {product.profiles.name.split(" ")[0]}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
                <button
                  onClick={() => {
                    setSellQuantity(1);
                    setSellProductId("");
                    setIsSellModalOpen(true);
                  }}
                  className="bg-amber-400 text-zinc-950 font-black py-4 rounded-2xl uppercase tracking-widest flex justify-center gap-2 mt-2"
                >
                  <MinusCircle size={18} /> Registrar Venda
                </button>
              </div>
            )}
            {gestaoView === "servicos" && (
              <div className="flex flex-col gap-4 animate-in slide-in-from-right-4 duration-300">
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setGestaoView("menu")}
                      className="text-zinc-500 p-2"
                    >
                      <ChevronLeft size={24} />
                    </button>
                    <h2 className="text-xl font-bold italic">Serviços</h2>
                  </div>
                  <button
                    onClick={() => setIsServiceModalOpen(true)}
                    className="bg-amber-400 text-zinc-950 p-2.5 rounded-xl"
                  >
                    <PlusCircle size={20} strokeWidth={2.5} />
                  </button>
                </div>
                <div className="flex flex-col gap-3">
                  {servicesList.length === 0 ? (
                    <div className="text-center py-10 text-zinc-600 italic border border-zinc-800 rounded-3xl">
                      Nenhum serviço cadastrado.
                    </div>
                  ) : (
                    servicesList.map((s) => (
                      <div
                        key={s.id}
                        className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl flex justify-between items-center"
                      >
                        <div className="flex flex-col">
                          <h4 className="font-bold text-zinc-100">{s.name}</h4>
                          <span className="text-xs text-zinc-500 flex items-center gap-1">
                            <Clock size={12} /> {s.duration} min
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-black text-amber-400 mr-2">
                            R$ {s.price.toFixed(2).replace(".", ",")}
                          </span>
                          <button
                            onClick={() => openEditServiceModal(s)}
                            className="text-zinc-500 p-1.5 hover:text-amber-400"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDeleteService(s.id)}
                            className="text-zinc-500 p-1.5 hover:text-red-400"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL DE TRANSAÇÃO FINANCEIRA */}
      {isTransModalOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] px-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 w-full max-w-sm flex flex-col gap-5">
            <div>
              <h3
                className={`font-bold text-lg italic flex items-center gap-2 ${transType === "entrada" ? "text-emerald-400" : "text-red-400"}`}
              >
                {transType === "entrada" ? (
                  <TrendingUp size={20} />
                ) : (
                  <TrendingDown size={20} />
                )}
                Nova {transType === "entrada" ? "Entrada" : "Despesa"}
              </h3>
            </div>
            <div className="flex flex-col gap-4">
              <input
                type="text"
                placeholder={
                  transType === "entrada"
                    ? "Ex: Fechamento Diário"
                    : "Ex: Conta de Luz"
                }
                value={transDesc}
                onChange={(e) => setTransDesc(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 text-white outline-none focus:border-amber-400 transition-colors"
              />
              <input
                type="number"
                placeholder="Valor (R$)"
                value={transAmount}
                onChange={(e) => setTransAmount(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 text-white outline-none focus:border-amber-400 transition-colors"
              />
              <input
                type="date"
                value={transDate}
                onChange={(e) => setTransDate(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 text-white outline-none [color-scheme:dark] focus:border-amber-400 transition-colors"
              />
            </div>
            <div className="flex gap-3 border-t border-zinc-800 pt-4">
              <button
                onClick={() => setIsTransModalOpen(false)}
                className="flex-1 py-3 text-zinc-400 font-bold text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveTransaction}
                disabled={isSavingTrans}
                className={`flex-1 py-3 text-zinc-950 rounded-xl font-black uppercase text-xs disabled:opacity-50 ${transType === "entrada" ? "bg-emerald-400 hover:bg-emerald-300" : "bg-red-500 hover:bg-red-400"}`}
              >
                {isSavingTrans ? "Salvando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL NOVO CLIENTE FANTASMA */}
      {isNewClientModalOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] px-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 w-full max-w-sm flex flex-col gap-5">
            <div>
              <h3 className="font-bold text-lg italic flex items-center gap-2">
                <UserPlus className="text-amber-400" size={20} /> Novo Cliente
              </h3>
              <p className="text-zinc-500 text-xs mt-1">
                Cadastre rapidamente quem chegou no balcão.
              </p>
            </div>
            <div className="flex flex-col gap-4">
              <input
                type="text"
                placeholder="Nome Completo"
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 text-white outline-none"
              />
              <input
                type="text"
                placeholder="Telefone / WhatsApp"
                value={newClientPhone}
                onChange={(e) => setNewClientPhone(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 text-white outline-none"
              />
            </div>
            <div className="flex gap-3 border-t border-zinc-800 pt-4">
              <button
                onClick={() => setIsNewClientModalOpen(false)}
                className="flex-1 py-3 text-zinc-400 font-bold text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateGhostClient}
                disabled={isSavingGhost}
                className="flex-1 py-3 bg-amber-400 text-zinc-950 rounded-xl font-black uppercase text-xs disabled:opacity-50"
              >
                {isSavingGhost ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL VENDER PLANO */}
      {isPlanModalOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] px-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 w-full max-w-sm flex flex-col gap-5 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div>
              <h3 className="font-bold text-lg italic flex items-center gap-2">
                <CreditCard className="text-amber-400" size={20} /> Vender
                Assinatura
              </h3>
              <p className="text-zinc-500 text-xs mt-1">
                Vincule o plano e absorva o corte atual.
              </p>
            </div>
            <div className="flex flex-col gap-4">
              <select
                value={planClientId}
                onChange={(e) => {
                  setPlanClientId(e.target.value);
                  if (e.target.value !== "NEW") {
                    setNewClientName("");
                    setNewClientPhone("");
                  }
                }}
                className="bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 text-white outline-none appearance-none font-bold"
              >
                <option value="">Selecione o Cliente...</option>
                <option value="NEW" className="text-amber-400">
                  ➕ Cadastrar Novo Cliente
                </option>
                {crmClients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.is_ghost ? "(Balcão)" : ""}
                  </option>
                ))}
              </select>
              {planClientId === "NEW" && (
                <div className="flex flex-col gap-3 p-4 bg-zinc-950/50 border border-amber-500/20 rounded-2xl animate-in zoom-in-95">
                  <p className="text-[10px] text-amber-400 font-bold uppercase tracking-widest">
                    Novo Perfil Rápido
                  </p>
                  <input
                    type="text"
                    placeholder="Nome Completo"
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                    className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm outline-none"
                  />
                  <input
                    type="text"
                    placeholder="WhatsApp"
                    value={newClientPhone}
                    onChange={(e) => setNewClientPhone(e.target.value)}
                    className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm outline-none"
                  />
                </div>
              )}
              <select
                value={planName}
                onChange={(e) => {
                  const val = e.target.value;
                  setPlanName(val);
                  const svc = servicesList.find((s) => s.name === val);
                  if (svc && !isMigratedPlan)
                    setPlanPrice(svc.price.toFixed(2).replace(".", ","));
                }}
                className="bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 text-white outline-none appearance-none"
              >
                <option value="">Qual Plano?</option>
                {servicesList
                  .filter((s) => s.name.toLowerCase().includes("plano"))
                  .map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name} - R$ {s.price.toFixed(2).replace(".", ",")}
                    </option>
                  ))}
              </select>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] text-zinc-500 font-bold uppercase mb-1 block pl-1">
                    Valor (R$)
                  </label>
                  <input
                    type="text"
                    value={isMigratedPlan ? "0,00" : planPrice}
                    onChange={(e) => setPlanPrice(e.target.value)}
                    disabled={isMigratedPlan}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 text-white outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-zinc-500 font-bold uppercase mb-1 block pl-1">
                    Qtd Cortes
                  </label>
                  <input
                    type="number"
                    value={planCuts}
                    onChange={(e) => setPlanCuts(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 text-white outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 font-bold uppercase mb-1 block pl-1">
                  Data de Início
                </label>
                <input
                  type="date"
                  value={planStartDate}
                  onChange={(e) => setPlanStartDate(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 text-white outline-none [color-scheme:dark]"
                />
              </div>

              <div className="flex flex-col gap-3 bg-zinc-950/50 p-4 rounded-2xl border border-zinc-800/60 mt-2">
                <label className="flex items-center gap-3 text-sm font-bold text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isMigratedPlan}
                    onChange={(e) => {
                      setIsMigratedPlan(e.target.checked);
                      setAbsorbTodayCut(false);
                    }}
                    className="w-5 h-5 rounded border-zinc-700 text-amber-400 focus:ring-amber-400 bg-zinc-800"
                  />
                  Plano Migrado Antigo
                </label>
                {isMigratedPlan && (
                  <input
                    type="number"
                    placeholder="Quantos cortes ele já usou?"
                    value={migratedCutsUsed}
                    onChange={(e) => setMigratedCutsUsed(e.target.value)}
                    className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm outline-none"
                  />
                )}
                {!isMigratedPlan && (
                  <>
                    <label className="flex items-center gap-3 text-sm font-bold text-zinc-300 cursor-pointer border-t border-zinc-800/60 pt-3">
                      <input
                        type="checkbox"
                        checked={absorbTodayCut}
                        onChange={(e) => setAbsorbTodayCut(e.target.checked)}
                        className="w-5 h-5 rounded border-zinc-700 text-amber-400 focus:ring-amber-400 bg-zinc-800"
                      />{" "}
                      Absorver Corte de Hoje (Upsell)
                    </label>
                    {absorbTodayCut && (
                      <select
                        value={appointmentToAbsorb}
                        onChange={(e) => setAppointmentToAbsorb(e.target.value)}
                        className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm outline-none appearance-none mt-1"
                      >
                        <option value="">
                          Selecione o horário na agenda...
                        </option>
                        <option value="NO_APPT">
                          ✂️ Não lancei na agenda (Apenas debitar 1 corte)
                        </option>
                        {clientTodayAppts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.time} - {a.service}
                          </option>
                        ))}
                      </select>
                    )}
                  </>
                )}
              </div>
            </div>
            <div className="flex gap-3 border-t border-zinc-800 pt-4">
              <button
                onClick={() => setIsPlanModalOpen(false)}
                className="flex-1 py-3 text-zinc-400 font-bold text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreatePlan}
                disabled={isSavingPlan || !planClientId || !planName}
                className="flex-1 py-3 bg-amber-400 text-zinc-950 rounded-xl font-black uppercase text-xs disabled:opacity-50"
              >
                {isSavingPlan ? "Processando..." : "Confirmar Venda"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EDITAR PLANO (NOVO) */}
      {isEditPlanModalOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] px-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 w-full max-w-sm flex flex-col gap-5">
            <div>
              <h3 className="font-bold text-lg italic text-amber-400">
                Editar Assinatura
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] text-zinc-500 font-bold uppercase mb-1 block pl-1">
                  Cortes Usados
                </label>
                <input
                  type="number"
                  value={editPlanCutsUsed}
                  onChange={(e) => setEditPlanCutsUsed(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 font-bold uppercase mb-1 block pl-1">
                  Cortes Totais
                </label>
                <input
                  type="number"
                  value={editPlanCutsAllowed}
                  onChange={(e) => setEditPlanCutsAllowed(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white outline-none"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-1">
              <div>
                <label className="text-[10px] text-zinc-500 font-bold uppercase mb-1 block pl-1">
                  Valor (R$)
                </label>
                <input
                  type="text"
                  value={editPlanPrice}
                  onChange={(e) => setEditPlanPrice(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 font-bold uppercase mb-1 block pl-1">
                  Data de Início
                </label>
                <input
                  type="date"
                  value={editPlanStartDate}
                  onChange={(e) => setEditPlanStartDate(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white outline-none [color-scheme:dark]"
                />
              </div>
            </div>
            <div className="flex gap-3 border-t border-zinc-800 pt-4 mt-2">
              <button
                onClick={() => setIsEditPlanModalOpen(false)}
                className="flex-1 py-3 text-zinc-400 font-bold text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleUpdatePlan}
                disabled={isUpdatingPlan}
                className="flex-1 bg-amber-400 text-zinc-950 py-3 rounded-xl font-black uppercase text-xs disabled:opacity-50"
              >
                {isUpdatingPlan ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL RENOVAR PLANO (BLINDADO) */}
      {isRenewPlanModalOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] px-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 w-full max-w-sm flex flex-col gap-5">
            <div>
              <h3 className="font-bold text-lg italic text-emerald-400">
                Renovar Assinatura
              </h3>
              <p className="text-zinc-500 text-xs mt-1">
                O plano antigo será encerrado e um novo ciclo se iniciará no
                caixa.
              </p>
            </div>
            <div className="flex flex-col gap-4">
              {/* SELECT DE PLANOS (A MÁGICA ACONTECE AQUI) */}
              <div>
                <label className="text-[10px] text-zinc-500 font-bold uppercase mb-1 block pl-1">
                  Qual Plano? (Upgrade / Downgrade)
                </label>
                <select
                  value={renewPlanName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setRenewPlanName(val);
                    const svc = servicesList.find((s) => s.name === val);
                    if (svc) {
                      setRenewPlanPrice(svc.price.toFixed(2).replace(".", ","));
                    }
                  }}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white outline-none appearance-none font-bold focus:border-emerald-400 transition-colors"
                >
                  <option value="">Selecione o Plano...</option>
                  {servicesList
                    .filter((s) => s.name.toLowerCase().includes("plano"))
                    .map((s) => (
                      <option key={s.id} value={s.name}>
                        {s.name} - R$ {s.price.toFixed(2).replace(".", ",")}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] text-zinc-500 font-bold uppercase mb-1 block pl-1">
                  Início do Novo Ciclo
                </label>
                <input
                  type="date"
                  value={renewStartDate}
                  onChange={(e) => setRenewStartDate(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white outline-none [color-scheme:dark]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] text-zinc-500 font-bold uppercase mb-1 block pl-1">
                    Valor (R$)
                  </label>
                  <input
                    type="text"
                    value={renewPlanPrice}
                    readOnly
                    className="w-full bg-zinc-800/50 border border-zinc-700/50 text-emerald-400 font-black rounded-xl px-4 py-3 outline-none cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-zinc-500 font-bold uppercase mb-1 block pl-1">
                    Qtd Cortes
                  </label>
                  <input
                    type="number"
                    value={renewPlanCuts}
                    onChange={(e) => setRenewPlanCuts(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white outline-none"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-3 border-t border-zinc-800 pt-4 mt-2">
              <button
                onClick={() => setIsRenewPlanModalOpen(false)}
                className="flex-1 py-3 text-zinc-400 font-bold text-sm hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleRenewPlan}
                disabled={isRenewingPlan || !renewPlanName}
                className="flex-1 bg-emerald-500 text-zinc-950 py-3 rounded-xl font-black uppercase text-[10px] disabled:opacity-50 shadow-lg shadow-emerald-500/20 hover:bg-emerald-400 transition-colors"
              >
                {isRenewingPlan ? "Processando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OUTROS MODAIS */}
      {isGoalModalOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] px-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 w-full max-w-sm flex flex-col gap-5">
            <div>
              <h3 className="font-bold text-lg italic flex items-center gap-2">
                <Target className="text-amber-400" size={20} /> Definir Novo
                Objetivo
              </h3>
            </div>
            <div className="flex flex-col gap-4">
              <input
                type="text"
                placeholder="Ex: Trocar pneu do carro"
                value={goalTitle}
                onChange={(e) => setGoalTitle(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 text-white outline-none"
              />
              <input
                type="number"
                placeholder="Valor (Ex: 1500,00)"
                value={goalTarget}
                onChange={(e) => setGoalTarget(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 text-white outline-none"
              />
            </div>
            <div className="flex gap-3 border-t border-zinc-800 pt-4">
              <button
                onClick={() => setIsGoalModalOpen(false)}
                className="flex-1 py-3 text-zinc-400 font-bold text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddGoal}
                disabled={isSavingGoal}
                className="flex-1 py-3 bg-amber-400 text-zinc-950 rounded-xl font-black uppercase text-xs"
              >
                Criar Meta
              </button>
            </div>
          </div>
        </div>
      )}
      {(isServiceModalOpen || isEditServiceModalOpen) && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] px-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 w-full max-w-sm flex flex-col gap-5">
            <div>
              <h3 className="font-bold text-lg italic">
                {isEditServiceModalOpen ? "Editar Serviço" : "Novo Serviço"}
              </h3>
            </div>
            <div className="flex flex-col gap-4">
              <input
                type="text"
                placeholder="Nome (Ex: Barba e Toalha)"
                value={svcName}
                onChange={(e) => setSvcName(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 text-white outline-none"
              />
              <div className="grid grid-cols-2 gap-4">
                <input
                  type="text"
                  placeholder="Preço (Ex: 35,00)"
                  value={svcPrice}
                  onChange={(e) => setSvcPrice(e.target.value)}
                  className="bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 text-white outline-none"
                />
                <input
                  type="number"
                  placeholder="Minutos (Ex: 30)"
                  value={svcDuration}
                  onChange={(e) => setSvcDuration(e.target.value)}
                  className="bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 text-white outline-none"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-2 border-t border-zinc-800 pt-4">
              <button
                onClick={() => {
                  setIsServiceModalOpen(false);
                  setIsEditServiceModalOpen(false);
                }}
                className="flex-1 py-3 text-zinc-400 font-bold"
              >
                Cancelar
              </button>
              <button
                onClick={
                  isEditServiceModalOpen
                    ? handleUpdateService
                    : handleAddService
                }
                disabled={isSavingSvc}
                className="flex-1 py-3 bg-amber-400 text-zinc-950 rounded-xl font-black uppercase text-xs"
              >
                {isSavingSvc ? "..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
      {isProductModalOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] px-4 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 w-full max-w-sm flex flex-col gap-5">
            <div>
              <h3 className="font-bold text-lg italic">Novo Produto</h3>
            </div>
            <div className="flex flex-col gap-4">
              <input
                type="text"
                placeholder="Nome"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 text-white outline-none"
              />
              <div className="grid grid-cols-2 gap-4">
                <input
                  type="text"
                  placeholder="R$ 0,00"
                  value={productPrice}
                  onChange={(e) => setProductPrice(e.target.value)}
                  className="bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 text-white outline-none"
                />
                <input
                  type="number"
                  placeholder="Qtd"
                  value={productQuantity}
                  onChange={(e) => setProductQuantity(e.target.value)}
                  className="bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 text-white outline-none"
                />
              </div>
              <div className="flex bg-zinc-800 p-1 rounded-xl">
                <button
                  onClick={() => setProductCategory("barbearia")}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold ${productCategory === "barbearia" ? "bg-amber-400 text-zinc-950" : "text-zinc-500"}`}
                >
                  Barbearia
                </button>
                <button
                  onClick={() => setProductCategory("geladeira")}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold ${productCategory === "geladeira" ? "bg-amber-400 text-zinc-950" : "text-zinc-500"}`}
                >
                  Geladeira
                </button>
              </div>
            </div>
            <div className="flex gap-3 border-t border-zinc-800 pt-4">
              <button
                onClick={() => setIsProductModalOpen(false)}
                className="flex-1 py-3"
              >
                Sair
              </button>
              <button
                onClick={handleAddProduct}
                disabled={isSavingProduct}
                className="flex-1 py-3 bg-amber-400 text-zinc-950 rounded-xl font-black uppercase text-xs"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
      {isEditProductModalOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] px-4 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 w-full max-w-sm flex flex-col gap-5">
            <div>
              <h3 className="font-bold text-lg italic">Editar Produto</h3>
            </div>
            <div className="flex flex-col gap-4">
              <input
                type="text"
                value={editProductName}
                onChange={(e) => setEditProductName(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 text-white outline-none"
              />
              <div className="grid grid-cols-2 gap-4">
                <input
                  type="text"
                  value={editProductPrice}
                  onChange={(e) => setEditProductPrice(e.target.value)}
                  className="bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 text-white outline-none"
                />
                <input
                  type="number"
                  value={editProductQuantity}
                  onChange={(e) => setEditProductQuantity(e.target.value)}
                  className="bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 text-white outline-none"
                />
              </div>
            </div>
            <div className="flex gap-3 border-t border-zinc-800 pt-4">
              <button
                onClick={() => setIsEditProductModalOpen(false)}
                className="flex-1 py-3"
              >
                Sair
              </button>
              <button
                onClick={handleUpdateProduct}
                disabled={isUpdatingProduct}
                className="flex-1 py-3 bg-amber-400 text-zinc-950 rounded-xl font-black uppercase text-xs"
              >
                Atualizar
              </button>
            </div>
          </div>
        </div>
      )}
      {isSellModalOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] px-4 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 w-full max-w-sm flex flex-col gap-5">
            <div>
              <h3 className="font-bold text-lg italic">Registrar Venda</h3>
            </div>
            <select
              value={sellProductId}
              onChange={(e) => setSellProductId(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 text-white outline-none appearance-none"
            >
              <option value="">Item...</option>
              {products.map((p) => (
                <option key={p.id} value={p.id} disabled={p.quantity === 0}>
                  {p.name} ({p.quantity === 0 ? "ZERADO" : p.quantity})
                </option>
              ))}
            </select>
            <div className="flex items-center gap-4 mx-auto">
              <button
                onClick={() => setSellQuantity((q) => Math.max(1, q - 1))}
                className="bg-zinc-800 p-4 rounded-xl"
              >
                -
              </button>
              <span className="text-2xl font-black text-amber-400">
                {sellQuantity}
              </span>
              <button
                onClick={() => setSellQuantity((q) => q + 1)}
                className="bg-zinc-800 p-4 rounded-xl"
              >
                +
              </button>
            </div>
            <div className="flex gap-3 border-t border-zinc-800 pt-4">
              <button
                onClick={() => setIsSellModalOpen(false)}
                className="flex-1 py-3"
              >
                Sair
              </button>
              <button
                onClick={handleSellProduct}
                disabled={isSelling || !sellProductId}
                className="flex-1 py-3 bg-amber-400 text-zinc-950 rounded-xl font-black uppercase text-xs"
              >
                Vender
              </button>
            </div>
          </div>
        </div>
      )}
      {editingAppointment && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] px-4 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-sm flex flex-col gap-5">
            <div>
              <h3 className="font-bold text-lg italic text-amber-400">
                Remarcar
              </h3>
            </div>
            <input
              type="date"
              min={todayStr}
              value={editDate}
              onChange={(e) => setEditDate(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white [color-scheme:dark]"
            />
            <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto">
              {HOURS.filter((h) => !editTakenSlots.includes(h)).map((h) => (
                <button
                  key={h}
                  onClick={() => setEditTime(h)}
                  className={`py-2 rounded-xl text-xs font-bold border ${editTime === h ? "bg-amber-400 text-zinc-950" : "bg-zinc-800 text-white"}`}
                >
                  {h}
                </button>
              ))}
            </div>
            <div className="flex gap-3 border-t border-zinc-800 pt-4">
              <button
                onClick={() => setEditingAppointment(null)}
                className="flex-1 py-3"
              >
                Sair
              </button>
              <button
                onClick={handleReschedule}
                disabled={isUpdating || !editTime}
                className="flex-1 py-3 bg-amber-400 text-zinc-950 rounded-xl font-black uppercase text-xs"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
      {/* --- 2. PAINEL LATERAL RETRÁTIL DO PERFIL (SÓCIO GOD-MODE) --- */}
      <div
        className={`fixed inset-0 z-[100] transition-opacity duration-300 pointer-events-none ${isProfileOpen ? "opacity-100 pointer-events-auto" : "opacity-0"}`}
      >
        <div
          className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          onClick={() => setIsProfileOpen(false)}
        />

        <div
          className={`absolute top-0 left-0 h-full w-full max-w-md bg-zinc-950 border-r border-zinc-800 p-6 flex flex-col gap-6 overflow-y-auto shadow-2xl transition-transform duration-300 ease-in-out custom-scrollbar ${isProfileOpen ? "translate-x-0" : "-translate-x-full"}`}
        >
          <div className="flex items-center justify-between border-b border-zinc-900 pb-4">
            <h3 className="text-lg font-black italic text-white tracking-tight flex items-center gap-2">
              <User size={20} className="text-amber-400" /> PERFIL PROFISSIONAL
            </h3>
            <button
              onClick={() => setIsProfileOpen(false)}
              className="text-zinc-500 hover:text-white bg-zinc-900 border border-zinc-800 p-1.5 rounded-xl transition-colors text-xs font-bold"
            >
              Fechar
            </button>
          </div>

          {/* AVATAR */}
          <div className="flex flex-col items-center gap-3 bg-zinc-900/40 p-4 border border-zinc-900 rounded-2xl">
            <div className="relative group">
              <div className="w-24 h-24 rounded-full border border-amber-400/30 overflow-hidden bg-zinc-900 flex items-center justify-center">
                {uploadingAvatar ? (
                  <Loader2 className="animate-spin text-amber-400" size={24} />
                ) : formProfile.avatar_url ? (
                  <img
                    src={formProfile.avatar_url}
                    className="w-full h-full object-cover"
                    alt="Avatar"
                  />
                ) : (
                  <User size={36} className="text-zinc-700" />
                )}
              </div>

              {/* Input invisível que o botão da câmera vai acionar */}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                ref={fileInputRef}
                onChange={handleAvatarUpload}
              />

              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="absolute bottom-0 right-0 bg-amber-400 text-zinc-950 p-2 rounded-full hover:scale-105 transition-transform shadow disabled:opacity-50"
              >
                <Camera size={14} strokeWidth={2.5} />
              </button>
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
              Foto Oficial
            </span>
          </div>

          <div className="flex flex-col gap-4 bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <h4 className="text-xs font-black text-amber-400 uppercase tracking-wider flex items-center gap-1.5 mb-1">
              Dados da Cadeira
            </h4>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-zinc-500 uppercase ml-1">
                Apelido / Nome Comercial
              </label>
              <input
                type="text"
                value={formProfile.display_name}
                onChange={(e) =>
                  setFormProfile({
                    ...formProfile,
                    display_name: e.target.value,
                  })
                }
                className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white focus:border-amber-400 outline-none transition-colors"
                placeholder="Ex: Acerola"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-zinc-500 uppercase ml-1">
                Instagram Profissional
              </label>
              <div className="relative">
                <AtSign
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
                  size={14}
                />
                <input
                  type="text"
                  value={formProfile.instagram_handle}
                  onChange={(e) =>
                    setFormProfile({
                      ...formProfile,
                      instagram_handle: e.target.value,
                    })
                  }
                  className="bg-zinc-800 border border-zinc-700 rounded-xl pl-9 pr-3 py-2 text-sm text-white w-full focus:border-amber-400 outline-none transition-colors"
                  placeholder="usuario.barber"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1 mt-2 border-t border-zinc-800/60 pt-3">
              <label className="text-[10px] font-bold text-zinc-500 uppercase ml-1 flex items-center justify-between">
                WhatsApp Comercial / Business
              </label>
              <input
                type="text"
                value={formProfile.whatsapp}
                onChange={(e) =>
                  setFormProfile({
                    ...formProfile,
                    whatsapp: e.target.value,
                  })
                }
                className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white focus:border-amber-400 outline-none transition-colors"
                placeholder="(24) 99999-9999"
              />
              <p className="text-[9px] text-zinc-500 ml-1 leading-tight mt-0.5">
                O cliente será redirecionado para este número ao agendar com
                você.
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-zinc-500 uppercase ml-1">
                Mini Bio / Especialidade
              </label>
              <textarea
                rows={2}
                value={formProfile.bio}
                onChange={(e) =>
                  setFormProfile({ ...formProfile, bio: e.target.value })
                }
                className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white focus:border-amber-400 outline-none transition-colors resize-none"
                placeholder="Ex: Especialista em Degradê..."
              />
            </div>
          </div>

          <div className="flex flex-col gap-4 bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <h4 className="text-xs font-black text-emerald-400 uppercase tracking-wider flex items-center gap-1.5 mb-1">
              <Wallet size={14} /> Recebimentos Individuais
            </h4>
            <div className="bg-zinc-950 border border-zinc-800/60 p-3 rounded-xl flex gap-2.5">
              <Info className="text-amber-400 shrink-0 mt-0.5" size={15} />
              <p className="text-[9px] text-zinc-400 leading-relaxed font-medium">
                Esses dados serão utilizados no ecossistema do Aliança Bot e
                para divisões automatizadas.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-1 flex flex-col gap-1">
                <label className="text-[10px] font-bold text-zinc-500 uppercase ml-1">
                  Tipo
                </label>
                <select
                  value={formProfile.pix_type}
                  onChange={(e) =>
                    setFormProfile({ ...formProfile, pix_type: e.target.value })
                  }
                  className="bg-zinc-800 border border-zinc-700 rounded-xl px-2 py-2 text-xs text-white focus:border-emerald-400 outline-none h-[38px]"
                >
                  <option value="CPF">CPF</option>
                  <option value="CNPJ">CNPJ</option>
                  <option value="EMAIL">E-mail</option>
                  <option value="PHONE">Celular</option>
                  <option value="RANDOM">Aleatória</option>
                </select>
              </div>
              <div className="col-span-2 flex flex-col gap-1">
                <label className="text-[10px] font-bold text-zinc-500 uppercase ml-1">
                  Chave Pix Corrente
                </label>
                <input
                  type="text"
                  value={formProfile.pix_key}
                  onChange={(e) =>
                    setFormProfile({ ...formProfile, pix_key: e.target.value })
                  }
                  className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white focus:border-emerald-400 outline-none transition-colors h-[38px]"
                  placeholder="Chave oficial..."
                />
              </div>
            </div>
          </div>

          {/* SEÇÃO SEGURANÇA: ALTERAR SENHA */}
          <div className="flex flex-col gap-1 border-t border-zinc-800/60 pt-4 mt-2">
            <button
              onClick={() => {
                setIsProfileOpen(false);
                router.push("/atualizar-senha");
              }}
              className="w-full py-3.5 rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-amber-400 text-white text-xs font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2"
            >
              <Lock size={16} className="text-amber-400" /> Alterar Minha Senha
            </button>
          </div>

          <button
            onClick={handleSaveProfile}
            disabled={savingProfile}
            className="w-full bg-amber-400 hover:bg-amber-300 text-zinc-950 font-black py-3.5 rounded-2xl flex items-center justify-center gap-2 uppercase tracking-widest text-xs shadow-xl shadow-amber-400/5 mt-auto transition-all"
          >
            {savingProfile ? (
              <Loader2 className="animate-spin" size={16} />
            ) : (
              <>
                <CheckCircle2 size={16} strokeWidth={2.5} /> Atualizar Meu
                Perfil
              </>
            )}
          </button>
        </div>
      </div>

      {/* MODAL SUPORTE DE SENHA (CRM BARBEIRO) */}
      {showResetModal && selectedUserForReset && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-4 backdrop-blur-sm animate-in fade-in">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 w-full max-w-sm flex flex-col gap-5 shadow-2xl">
            <div>
              <h3 className="font-bold text-lg md:text-xl text-white flex items-center gap-2">
                <ShieldCheck className="text-amber-400" size={22} /> Suporte de
                Acesso
              </h3>
              <p className="text-[10px] md:text-xs text-zinc-400 mt-1">
                Ação para o cliente:{" "}
                <span className="text-white font-bold">
                  {selectedUserForReset.name}
                </span>
              </p>
            </div>

            {!resetResultLink && !showPassMessage ? (
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => handleResetAction("whatsapp_link")}
                  disabled={resetLoading}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white font-bold py-3 md:py-3.5 rounded-xl text-xs md:text-sm hover:border-amber-400 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {resetLoading ? "Gerando..." : "💬 Gerar Link para WhatsApp"}
                </button>
                <button
                  onClick={() => handleResetAction("temporary_password")}
                  disabled={resetLoading}
                  className="w-full bg-zinc-800 border border-zinc-700 text-amber-400 font-bold py-3 md:py-3.5 rounded-xl text-xs md:text-sm hover:border-amber-400 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {resetLoading
                    ? "Processando..."
                    : "🔑 Forçar Senha (Mudar@123)"}
                </button>
              </div>
            ) : resetResultLink ? (
              <div className="flex flex-col gap-3 text-center">
                <p className="text-emerald-400 font-bold text-xs">
                  Link gerado com sucesso!
                </p>
                <a
                  href={`https://wa.me/${selectedUserForReset.phone?.replace(/\D/g, "")}?text=${encodeURIComponent(`Olá ${selectedUserForReset.name.split(" ")[0]}! Segue o seu link de acesso rápido para atualizar a sua senha: ${resetResultLink}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full bg-emerald-500 text-zinc-950 font-black py-3 rounded-xl text-center text-xs uppercase tracking-wider hover:bg-emerald-400 transition-colors"
                >
                  Enviar via WhatsApp
                </a>
              </div>
            ) : (
              <div className="flex flex-col gap-3 text-center">
                <p className="text-emerald-400 font-bold text-xs">
                  Senha alterada no banco!
                </p>
                <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800 font-mono font-black text-amber-400 text-lg tracking-widest">
                  Mudar@123
                </div>
                <p className="text-[10px] text-zinc-500">
                  Avise o cliente. Ele será obrigado a trocar a senha ao fazer o
                  login.
                </p>
              </div>
            )}

            <button
              onClick={() => {
                setShowResetModal(false);
                setSelectedUserForReset(null);
              }}
              className="text-zinc-500 hover:text-white text-xs font-bold pt-3 border-t border-zinc-800/60 mt-1"
            >
              Fechar Janela
            </button>
          </div>
        </div>
      )}

      {/* MODAL DE DETALHES DO CLIENTE (CELULAR) */}
      {clientDetail && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-4 backdrop-blur-sm animate-in fade-in"
          onClick={() => setClientDetail(null)}
        >
          <div
            className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 w-full max-w-sm flex flex-col gap-5 shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest block mb-0.5">
                  Contato do Cliente
                </span>
                <h3 className="font-bold italic text-lg text-white">
                  {clientDetail.name}
                </h3>
                <p className="text-zinc-500 text-xs mt-1">
                  {clientDetail.service} ·{" "}
                  {clientDetail.date
                    .split("-")
                    .reverse()
                    .join("/")}{" "}
                  às {clientDetail.time}
                </p>
              </div>
              <button
                onClick={() => setClientDetail(null)}
                className="text-zinc-500 hover:text-white transition-colors p-1"
                aria-label="Fechar"
              >
                <X size={20} />
              </button>
            </div>

            {clientDetail.phone ? (
              <>
                <div className="bg-zinc-950/50 border border-zinc-800/60 rounded-xl px-4 py-3 font-mono font-bold text-amber-400 text-lg tracking-widest text-center">
                  {clientDetail.phone}
                </div>
                <div className="flex flex-col gap-2">
                  <a
                    href={`https://api.whatsapp.com/send?phone=55${clientDetail.phone.replace(/\D/g, "")}&text=${encodeURIComponent(
                      `Olá ${clientDetail.name.split(" ")[0]}! Passando para confirmar o seu horário de ${clientDetail.service} no dia ${clientDetail.date.split("-").reverse().join("/")} às ${clientDetail.time}. Valeu!`,
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full bg-emerald-500 text-zinc-950 font-black py-3.5 rounded-xl text-center text-xs uppercase tracking-wider hover:bg-emerald-400 transition-colors flex items-center justify-center gap-2"
                  >
                    <MessageCircle size={16} strokeWidth={2.5} /> Chamar no
                    WhatsApp
                  </a>
                  <a
                    href={`tel:${clientDetail.phone.replace(/\D/g, "")}`}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white font-bold py-3.5 rounded-xl text-center text-xs uppercase tracking-wider hover:border-amber-400 transition-colors flex items-center justify-center gap-2"
                  >
                    <Phone size={16} strokeWidth={2.5} /> Ligar
                  </a>
                </div>
              </>
            ) : (
              <div className="bg-zinc-950/50 border border-zinc-800/60 rounded-xl px-4 py-4 text-center">
                <p className="text-zinc-400 text-sm font-bold italic">
                  Celular não cadastrado
                </p>
                <p className="text-zinc-600 text-xs mt-1">
                  Este cliente agendou sem deixar um número de contato.
                </p>
              </div>
            )}

            <button
              onClick={() => setClientDetail(null)}
              className="text-zinc-500 hover:text-white text-xs font-bold pt-3 border-t border-zinc-800/60 mt-1"
            >
              Fechar Janela
            </button>
          </div>
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 bg-zinc-900/80 backdrop-blur-xl border-t border-zinc-800/50 px-6 pt-3 pb-8 flex justify-between items-center z-50">
        <NavButton icon={Home} label="Início" tabId="home" />
        <NavButton icon={Calendar} label="Agenda" tabId="agenda" />
        <button
          onClick={() => setActiveTab("novo")}
          className="bg-amber-400 p-4 rounded-2xl -mt-14 shadow-[0_10px_25px_rgba(251,191,36,0.4)] text-zinc-950 transition-transform active:scale-90"
        >
          <PlusCircle size={32} strokeWidth={2.5} />
        </button>
        <NavButton icon={DollarSign} label="Finanças" tabId="financeiro" />
        <NavButton icon={Briefcase} label="Gestão" tabId="gestao" />
      </nav>
    </main>
  );
}
