import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CalendarDays, Clock, CheckCircle2, AlertTriangle, Loader2, ArrowLeft, ArrowRight, Sparkles, Video } from "lucide-react";
import { format, parseISO, startOfWeek, addDays, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";

const API = "https://agenciapulse.tech/api/public-reschedule";

interface DayInfo { date: string; weekday: number; slots: string[] }
interface InfoPayload {
  client: { id: string; company_name: string; color: string; logo_url?: string };
  videomaker: { id: string; name: string };
  cancelled: { date: string; start_time: string };
  fixed: { day: string; time: string };
  next_fixed: { date: string; time: string } | null;
  days: DayInfo[];
  already_booked: { id: string; date: string; start_time: string } | null;
}

const WEEK_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export default function PublicReschedule() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<InfoPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);
  const [booked, setBooked] = useState<{ date: string; start_time: string } | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "info", token }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Erro");
      setInfo(j);
      if (j.already_booked) setBooked({ date: j.already_booked.date, start_time: j.already_booked.start_time });
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { if (token) load(); /* eslint-disable-next-line */ }, [token]);

  async function book(date: string, time: string) {
    setBooking(true);
    try {
      const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "book", token, date, time }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Erro ao reagendar");
      setBooked({ date, start_time: time });
      toast.success("Gravação reagendada com sucesso!");
    } catch (e: any) { toast.error(e.message); load(); } finally { setBooking(false); }
  }

  async function keepNextWeek() {
    setBooking(true);
    try {
      const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "keep_next_week", token }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Erro");
      setBooked({ date: j.booked.date, start_time: j.booked.start_time });
      toast.success("Gravação mantida para a próxima semana!");
    } catch (e: any) { toast.error(e.message); } finally { setBooking(false); }
  }

  const daysByDate = useMemo(() => {
    const map = new Map<string, DayInfo>();
    info?.days.forEach(d => map.set(d.date, d));
    return map;
  }, [info]);

  const weekStart = useMemo(() => {
    const base = startOfWeek(new Date(), { weekStartsOn: 0 });
    return addDays(base, weekOffset * 7);
  }, [weekOffset]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const hasAnySlotInWindow = useMemo(() => info?.days.some(d => d.slots.length > 0), [info]);

  const selectedDay = selectedDate ? daysByDate.get(selectedDate) : null;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }
  if (error || !info) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-black text-center px-6 gap-4">
        <AlertTriangle className="w-12 h-12 text-destructive" />
        <p className="text-lg text-white">{error || "Link inválido"}</p>
        <p className="text-sm text-white/60">Fale com o seu gestor da Pulse para receber um novo link.</p>
      </div>
    );
  }

  if (booked) {
    const d = parseISO(booked.date);
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-black via-neutral-950 to-orange-950/30 px-6 text-center gap-6">
        <div className="rounded-full bg-primary/20 p-6"><CheckCircle2 className="w-16 h-16 text-primary" /></div>
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Reagendamento confirmado!</h1>
          <p className="text-white/70">Sua nova gravação está marcada para</p>
        </div>
        <div className="rounded-2xl border border-primary/40 bg-primary/10 px-8 py-6">
          <p className="text-4xl font-bold text-white">{format(d, "dd 'de' MMMM", { locale: ptBR })}</p>
          <p className="text-2xl text-primary mt-2">às {booked.start_time}</p>
          <Badge className="mt-3 bg-purple-500/20 text-purple-300 border-purple-500/40">Gravação BACKUP</Badge>
        </div>
        <p className="text-sm text-white/50 max-w-md">Videomaker responsável: <strong className="text-white/80">{info.videomaker.name}</strong>. Nossa equipe já foi notificada e entrará em contato para confirmar.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-neutral-950 to-orange-950/20 text-white pb-20">
      {/* Header */}
      <header className="border-b border-white/10 bg-black/40 backdrop-blur px-4 py-6 sm:px-8">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          {info.client.logo_url ? (
            <img src={info.client.logo_url} alt={info.client.company_name} className="w-14 h-14 rounded-xl object-cover" />
          ) : (
            <div className="w-14 h-14 rounded-xl flex items-center justify-center text-xl font-bold" style={{ background: `hsl(${info.client.color})` }}>
              {info.client.company_name.charAt(0)}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs uppercase tracking-wider text-primary">Reagendamento Pulse</p>
            <h1 className="text-xl sm:text-2xl font-bold truncate">{info.client.company_name}</h1>
            <p className="text-sm text-white/60 flex items-center gap-2 mt-1"><Video className="w-3.5 h-3.5" />{info.videomaker.name}</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-8 pt-6 space-y-6">
        {/* Cancelled banner */}
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium">Sua gravação de {format(parseISO(info.cancelled.date), "dd/MM", { locale: ptBR })} às {info.cancelled.start_time} foi cancelada.</p>
            <p className="text-sm text-white/60 mt-1">Escolha um novo horário abaixo — os slots mostrados estão livres na agenda do seu videomaker.</p>
          </div>
        </div>

        {/* Keep next week CTA */}
        {info.next_fixed && (
          <div className="rounded-xl border border-primary/40 bg-gradient-to-r from-primary/10 to-orange-600/10 p-5">
            <div className="flex items-start gap-3 mb-3">
              <Sparkles className="w-5 h-5 text-primary mt-0.5" />
              <div>
                <p className="font-semibold">Não consegue reagendar essa semana?</p>
                <p className="text-sm text-white/70 mt-1">Mantemos sua gravação fixa da próxima semana em <strong className="text-white">{format(parseISO(info.next_fixed.date), "EEEE, dd 'de' MMM", { locale: ptBR })} às {info.next_fixed.time}</strong>.</p>
              </div>
            </div>
            <Button onClick={keepNextWeek} disabled={booking} className="w-full sm:w-auto">
              {booking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Manter minha gravação fixa da próxima semana
            </Button>
          </div>
        )}

        {/* Warning if no slots */}
        {!hasAnySlotInWindow && (
          <div className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-4 text-sm">
            Nenhum horário livre nas próximas 2 semanas. Use o botão acima para manter sua fixa ou fale com seu gestor Pulse.
          </div>
        )}

        {/* Week nav */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2"><CalendarDays className="w-5 h-5 text-primary" />Escolha um dia</h2>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setWeekOffset(w => Math.max(0, w - 1))} disabled={weekOffset === 0}><ArrowLeft className="w-4 h-4" /></Button>
            <Button size="sm" variant="outline" onClick={() => setWeekOffset(w => Math.min(1, w + 1))} disabled={weekOffset >= 1}><ArrowRight className="w-4 h-4" /></Button>
          </div>
        </div>

        {/* Week grid */}
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {weekDays.map((d, i) => {
            const dateStr = format(d, "yyyy-MM-dd");
            const dayInfo = daysByDate.get(dateStr);
            const slotsCount = dayInfo?.slots.length || 0;
            const isPast = d < new Date(new Date().toDateString());
            const isSelected = selectedDate === dateStr;
            const disabled = isPast || slotsCount === 0;
            return (
              <button
                key={i}
                onClick={() => !disabled && setSelectedDate(dateStr)}
                disabled={disabled}
                className={`rounded-xl p-2 sm:p-3 text-center transition-all border ${
                  isSelected ? "border-primary bg-primary/20 shadow-lg shadow-primary/30" :
                  disabled ? "border-white/5 bg-white/5 opacity-40 cursor-not-allowed" :
                  "border-white/10 bg-white/5 hover:border-primary/50 hover:bg-primary/10"
                }`}
              >
                <p className="text-[10px] uppercase text-white/50">{WEEK_LABELS[d.getDay()]}</p>
                <p className="text-lg sm:text-xl font-bold mt-0.5">{format(d, "dd")}</p>
                <p className={`text-[10px] mt-1 ${slotsCount > 0 ? "text-primary" : "text-white/30"}`}>
                  {slotsCount > 0 ? `${slotsCount} livre${slotsCount > 1 ? "s" : ""}` : "—"}
                </p>
              </button>
            );
          })}
        </div>

        {/* Time slots */}
        {selectedDay && (
          <div className="space-y-3">
            <h3 className="text-lg font-semibold flex items-center gap-2"><Clock className="w-5 h-5 text-primary" />
              Horários em {format(parseISO(selectedDay.date), "EEEE, dd 'de' MMMM", { locale: ptBR })}
            </h3>
            {selectedDay.slots.length === 0 ? (
              <p className="text-white/50 text-sm">Nenhum slot livre.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {selectedDay.slots.map(t => (
                  <Button key={t} disabled={booking} onClick={() => book(selectedDay.date, t)}
                    className="h-14 text-lg font-semibold bg-white/5 hover:bg-primary hover:text-white border border-white/10 text-white">
                    {booking ? <Loader2 className="w-4 h-4 animate-spin" /> : t}
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}

        <p className="text-center text-xs text-white/40 pt-8">Pulse Growth Marketing · Reagendamento seguro</p>
      </main>
    </div>
  );
}
