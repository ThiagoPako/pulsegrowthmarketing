import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Check, Calendar, MapPin, Clock, Loader2, AlertTriangle, PartyPopper } from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';

interface EventData {
  id: string;
  title: string;
  description: string;
  event_date: string;
  event_time: string;
  event_end_time: string;
  location: string;
  color: string;
  max_registrations: number | null;
  banner_url: string | null;
  client_id: string;
  client?: { company_name: string; logo_url: string | null };
}

export default function EventRegistration() {
  const { token } = useParams<{ token: string }>();
  const [event, setEvent] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [registrationCode, setRegistrationCode] = useState('');
  const [totalRegistrations, setTotalRegistrations] = useState(0);
  const [error, setError] = useState('');

  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [lgpdAccepted, setLgpdAccepted] = useState(false);

  useEffect(() => {
    if (!token) return;
    loadEvent();
  }, [token]);

  const loadEvent = async () => {
    setLoading(true);
    const { data: ev } = await supabase
      .from('client_events')
      .select('*, clients!client_events_client_id_fkey(company_name, logo_url)')
      .eq('token', token!)
      .eq('status', 'ativo')
      .maybeSingle();

    if (ev) {
      setEvent({
        ...ev,
        client: ev.clients as any,
      } as any);

      const { count } = await supabase
        .from('event_registrations')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', ev.id);
      setTotalRegistrations(count || 0);
    }
    setLoading(false);
  };

  const formatWhatsapp = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2) return `(${digits}`;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!event || !name.trim() || !age || !whatsapp.trim() || !lgpdAccepted) return;

    const ageNum = parseInt(age);
    if (isNaN(ageNum) || ageNum < 1 || ageNum > 120) {
      setError('Idade inválida');
      return;
    }

    const cleanWhatsapp = whatsapp.replace(/\D/g, '');
    if (cleanWhatsapp.length < 10 || cleanWhatsapp.length > 11) {
      setError('WhatsApp inválido');
      return;
    }

    if (event.max_registrations && totalRegistrations >= event.max_registrations) {
      setError('Vagas esgotadas para este evento');
      return;
    }

    setSubmitting(true);
    setError('');

    const { data, error: insertError } = await supabase
      .from('event_registrations')
      .insert({
        event_id: event.id,
        name: name.trim().slice(0, 100),
        age: ageNum,
        whatsapp: cleanWhatsapp,
        lgpd_accepted: true,
      })
      .select('registration_code')
      .single();

    if (insertError) {
      setError('Erro ao realizar inscrição. Tente novamente.');
      setSubmitting(false);
      return;
    }

    setRegistrationCode(data.registration_code);
    setSubmitted(true);
    setSubmitting(false);
  };

  const eventColor = event?.color || '217 91% 60%';
  const isFull = event?.max_registrations ? totalRegistrations >= event.max_registrations : false;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#080810] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-white/40" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-[#080810] flex items-center justify-center px-4">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-white mb-2">Evento não encontrado</h1>
          <p className="text-white/50 text-sm">Este evento pode ter sido encerrado ou o link é inválido.</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#080810] flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center" style={{ background: `hsl(${eventColor} / 0.2)` }}>
            <PartyPopper className="w-10 h-10" style={{ color: `hsl(${eventColor})` }} />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Inscrição Confirmada! 🎉</h1>
          <p className="text-white/60 mb-6">Você está inscrito(a) no evento <span className="text-white font-semibold">{event.title}</span></p>
          
          <div className="bg-white/[0.06] border border-white/[0.08] rounded-2xl p-6 mb-6">
            <p className="text-xs text-white/40 uppercase tracking-wider mb-2">Código do Comprovante</p>
            <p className="text-3xl font-mono font-bold tracking-widest" style={{ color: `hsl(${eventColor})` }}>
              {registrationCode.toUpperCase()}
            </p>
            <p className="text-xs text-white/40 mt-3">Guarde este código para comprovar sua inscrição no evento</p>
          </div>

          <div className="bg-white/[0.04] rounded-xl p-4 text-left space-y-2">
            <div className="flex items-center gap-2 text-sm text-white/60">
              <Calendar size={14} style={{ color: `hsl(${eventColor})` }} />
              <span>{format(new Date(event.event_date + 'T12:00:00'), "dd 'de' MMMM 'de' yyyy", { locale: pt })}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-white/60">
              <Clock size={14} style={{ color: `hsl(${eventColor})` }} />
              <span>{event.event_time} - {event.event_end_time}</span>
            </div>
            {event.location && (
              <div className="flex items-center gap-2 text-sm text-white/60">
                <MapPin size={14} style={{ color: `hsl(${eventColor})` }} />
                <span>{event.location}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#080810]">
      {/* Banner */}
      <div className="relative h-48 sm:h-64 overflow-hidden">
        {event.banner_url ? (
          <img src={event.banner_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full" style={{ background: `linear-gradient(135deg, hsl(${eventColor}), hsl(${eventColor} / 0.4))` }} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#080810] via-[#080810]/50 to-transparent" />
        
        {/* Client logo */}
        {event.client?.logo_url && (
          <div className="absolute top-4 left-4">
            <img src={event.client.logo_url} alt="" className="w-12 h-12 rounded-xl object-cover ring-2 ring-white/20" />
          </div>
        )}
      </div>

      <div className="max-w-lg mx-auto px-4 -mt-16 relative z-10 pb-12">
        {/* Event info */}
        <div className="mb-6">
          <p className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: `hsl(${eventColor})` }}>
            {event.client?.company_name || 'Evento'}
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-3">{event.title}</h1>
          {event.description && (
            <p className="text-white/50 text-sm leading-relaxed">{event.description}</p>
          )}

          <div className="flex flex-wrap gap-3 mt-4">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.06] text-xs text-white/60">
              <Calendar size={12} style={{ color: `hsl(${eventColor})` }} />
              {format(new Date(event.event_date + 'T12:00:00'), "dd/MM/yyyy", { locale: pt })}
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.06] text-xs text-white/60">
              <Clock size={12} style={{ color: `hsl(${eventColor})` }} />
              {event.event_time} - {event.event_end_time}
            </div>
            {event.location && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.06] text-xs text-white/60">
                <MapPin size={12} style={{ color: `hsl(${eventColor})` }} />
                {event.location}
              </div>
            )}
          </div>

          {event.max_registrations && (
            <div className="mt-3">
              <div className="flex justify-between text-xs text-white/40 mb-1">
                <span>{totalRegistrations} inscritos</span>
                <span>{event.max_registrations} vagas</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min((totalRegistrations / event.max_registrations) * 100, 100)}%`,
                    background: `hsl(${eventColor})`,
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Registration form */}
        {isFull ? (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-6 text-center">
            <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto mb-3" />
            <p className="text-white font-semibold mb-1">Vagas Esgotadas</p>
            <p className="text-white/50 text-sm">Infelizmente todas as vagas para este evento já foram preenchidas.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-6 space-y-4">
            <h2 className="text-lg font-semibold text-white mb-1">Inscreva-se</h2>
            <p className="text-xs text-white/40 mb-4">Preencha seus dados para garantir sua vaga</p>

            <div>
              <label className="text-xs font-medium text-white/60 mb-1.5 block">Nome completo *</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value.slice(0, 100))}
                required
                className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 transition-all"
                style={{ '--tw-ring-color': `hsl(${eventColor})` } as any}
                placeholder="Seu nome"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-white/60 mb-1.5 block">Idade *</label>
              <input
                type="number"
                value={age}
                onChange={e => setAge(e.target.value)}
                required
                min={1}
                max={120}
                className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 transition-all"
                style={{ '--tw-ring-color': `hsl(${eventColor})` } as any}
                placeholder="Sua idade"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-white/60 mb-1.5 block">WhatsApp *</label>
              <input
                type="tel"
                value={whatsapp}
                onChange={e => setWhatsapp(formatWhatsapp(e.target.value))}
                required
                className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 transition-all"
                style={{ '--tw-ring-color': `hsl(${eventColor})` } as any}
                placeholder="(00) 00000-0000"
              />
            </div>

            <label className="flex items-start gap-3 cursor-pointer group mt-2">
              <div
                className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${lgpdAccepted ? 'border-transparent' : 'border-white/20 group-hover:border-white/40'}`}
                style={lgpdAccepted ? { background: `hsl(${eventColor})`, borderColor: `hsl(${eventColor})` } : {}}
                onClick={() => setLgpdAccepted(!lgpdAccepted)}
              >
                {lgpdAccepted && <Check size={12} className="text-white" />}
              </div>
              <span className="text-xs text-white/50 leading-relaxed" onClick={() => setLgpdAccepted(!lgpdAccepted)}>
                Concordo com a coleta e uso dos meus dados pessoais para fins de comunicação sobre este evento e ofertas relacionadas, conforme a <strong className="text-white/70">Lei Geral de Proteção de Dados (LGPD)</strong>. Poderei solicitar a exclusão dos meus dados a qualquer momento.
              </span>
            </label>

            {error && (
              <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={submitting || !name.trim() || !age || !whatsapp.trim() || !lgpdAccepted}
              className="w-full py-3.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
              style={{ background: `hsl(${eventColor})` }}
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin mx-auto" />
              ) : (
                'Confirmar Inscrição'
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
