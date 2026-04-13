import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { portalAction } from '@/lib/portalApi';
import { Calendar, MapPin, Clock, Plus, Copy, Users, ExternalLink, Trash2, Eye, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface ClientEvent {
  id: string;
  title: string;
  description: string;
  event_date: string;
  event_time: string;
  event_end_time: string;
  location: string;
  color: string;
  max_registrations: number | null;
  status: string;
  token: string;
  banner_url: string | null;
  send_coupons_to_participants: boolean;
  linked_campaign_id: string | null;
  created_at: string;
  _registration_count?: number;
}

interface EventRegistration {
  id: string;
  name: string;
  age: number;
  whatsapp: string;
  registration_code: string;
  created_at: string;
  lgpd_accepted: boolean;
}

interface Props {
  clientId: string;
  clientColor: string;
  isTeamMember?: boolean;
}

export default function PortalEvents({ clientId, clientColor, isTeamMember }: Props) {
  const [events, setEvents] = useState<ClientEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<ClientEvent | null>(null);
  const [registrations, setRegistrations] = useState<EventRegistration[]>([]);
  const [loadingRegs, setLoadingRegs] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('08:00');
  const [eventEndTime, setEventEndTime] = useState('18:00');
  const [location, setLocation] = useState('');
  const [maxRegs, setMaxRegs] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadEvents();
  }, [clientId]);

  const loadEvents = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('client_events')
      .select('*')
      .eq('client_id', clientId)
      .order('event_date', { ascending: false });

    if (data) {
      // Get registration counts
      const eventsWithCounts = await Promise.all(
        data.map(async (ev) => {
          const { count } = await supabase
            .from('event_registrations')
            .select('id', { count: 'exact', head: true })
            .eq('event_id', ev.id);
          return { ...ev, _registration_count: count || 0 } as ClientEvent;
        })
      );
      setEvents(eventsWithCounts);
    }
    setLoading(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !eventDate) return;
    setCreating(true);

    const result = await portalAction({
      action: 'create_event',
      client_id: clientId,
      title: title.trim().slice(0, 100),
      description: description.trim().slice(0, 500),
      event_date: eventDate,
      event_time: eventTime,
      event_end_time: eventEndTime,
      location: location.trim().slice(0, 200),
      max_registrations: maxRegs ? parseInt(maxRegs) : null,
      color: clientColor,
    });

    if (result?.event || !result?.error) {
      toast.success('Evento criado com sucesso!');
      setShowCreate(false);
      resetForm();
      loadEvents();
    } else {
      toast.error(result?.error || 'Erro ao criar evento');
    }
    setCreating(false);
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setEventDate('');
    setEventTime('08:00');
    setEventEndTime('18:00');
    setLocation('');
    setMaxRegs('');
  };

  const viewRegistrations = async (event: ClientEvent) => {
    setSelectedEvent(event);
    setLoadingRegs(true);
    const { data } = await supabase
      .from('event_registrations')
      .select('*')
      .eq('event_id', event.id)
      .order('created_at', { ascending: false });
    setRegistrations((data || []) as EventRegistration[]);
    setLoadingRegs(false);
  };

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/evento/${token}`;
    navigator.clipboard.writeText(url);
    toast.success('Link copiado!');
  };

  const getStatusBadge = (event: ClientEvent) => {
    const eventDate = new Date(event.event_date + 'T23:59:59');
    const now = new Date();
    if (event.status !== 'ativo') return { label: 'Encerrado', color: 'text-red-400 bg-red-500/10' };
    if (eventDate < now) return { label: 'Realizado', color: 'text-emerald-400 bg-emerald-500/10' };
    return { label: 'Ativo', color: 'text-blue-400 bg-blue-500/10' };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-white/40" />
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-8 pb-20">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">🎪 Eventos</h2>
          <p className="text-xs text-white/40 mt-1">Crie eventos e colete inscrições dos participantes</p>
        </div>
        {isTeamMember && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all hover:opacity-90"
            style={{ background: `hsl(${clientColor})` }}
          >
            <Plus size={14} />
            Novo Evento
          </button>
        )}
      </div>

      {events.length === 0 ? (
        <div className="text-center py-16 bg-white/[0.03] rounded-2xl border border-white/[0.06]">
          <Calendar className="w-12 h-12 text-white/20 mx-auto mb-3" />
          <p className="text-white/40 text-sm">Nenhum evento cadastrado</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {events.map(event => {
            const status = getStatusBadge(event);
            return (
              <div key={event.id} className="bg-white/[0.04] border border-white/[0.08] rounded-2xl overflow-hidden group hover:border-white/[0.12] transition-all">
                <div className="h-2" style={{ background: `hsl(${event.color || clientColor})` }} />
                <div className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="font-semibold text-white text-sm">{event.title}</h3>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${status.color}`}>
                      {status.label}
                    </span>
                  </div>

                  {event.description && (
                    <p className="text-xs text-white/40 mb-3 line-clamp-2">{event.description}</p>
                  )}

                  <div className="space-y-1.5 mb-4">
                    <div className="flex items-center gap-2 text-xs text-white/50">
                      <Calendar size={11} style={{ color: `hsl(${clientColor})` }} />
                      {format(new Date(event.event_date + 'T12:00:00'), "dd/MM/yyyy", { locale: pt })}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-white/50">
                      <Clock size={11} style={{ color: `hsl(${clientColor})` }} />
                      {event.event_time} - {event.event_end_time}
                    </div>
                    {event.location && (
                      <div className="flex items-center gap-2 text-xs text-white/50">
                        <MapPin size={11} style={{ color: `hsl(${clientColor})` }} />
                        {event.location}
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-xs text-white/50">
                      <Users size={11} style={{ color: `hsl(${clientColor})` }} />
                      {event._registration_count} inscritos
                      {event.max_registrations && ` / ${event.max_registrations} vagas`}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => copyLink(event.token)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white/[0.06] text-xs text-white/60 hover:bg-white/[0.1] transition-colors"
                    >
                      <Copy size={11} />
                      Copiar Link
                    </button>
                    <button
                      onClick={() => window.open(`/evento/${event.token}`, '_blank')}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white/[0.06] text-xs text-white/60 hover:bg-white/[0.1] transition-colors"
                    >
                      <ExternalLink size={11} />
                    </button>
                    <button
                      onClick={() => viewRegistrations(event)}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs text-white font-medium transition-colors hover:opacity-90"
                      style={{ background: `hsl(${clientColor})` }}
                    >
                      <Eye size={11} />
                      Inscritos
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create event dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="bg-[#12121a] border-white/10 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo Evento</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-white/60 mb-1.5 block">Título do Evento *</label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                required
                className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Ex: Workshop de Marketing Digital"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-white/60 mb-1.5 block">Descrição</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={3}
                className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder="Detalhes do evento..."
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-white/60 mb-1.5 block">Data *</label>
                <input
                  type="date"
                  value={eventDate}
                  onChange={e => setEventDate(e.target.value)}
                  required
                  className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-white/60 mb-1.5 block">Início</label>
                <input
                  type="time"
                  value={eventTime}
                  onChange={e => setEventTime(e.target.value)}
                  className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-white/60 mb-1.5 block">Término</label>
                <input
                  type="time"
                  value={eventEndTime}
                  onChange={e => setEventEndTime(e.target.value)}
                  className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-white/60 mb-1.5 block">Local</label>
              <input
                value={location}
                onChange={e => setLocation(e.target.value)}
                className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Endereço do evento"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-white/60 mb-1.5 block">Limite de vagas (opcional)</label>
              <input
                type="number"
                value={maxRegs}
                onChange={e => setMaxRegs(e.target.value)}
                min={1}
                className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Sem limite"
              />
            </div>
            <button
              type="submit"
              disabled={creating || !title.trim() || !eventDate}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-all disabled:opacity-40"
              style={{ background: `hsl(${clientColor})` }}
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Criar Evento'}
            </button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Registrations dialog */}
      <Dialog open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
        <DialogContent className="bg-[#12121a] border-white/10 text-white max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users size={16} style={{ color: `hsl(${clientColor})` }} />
              Inscritos - {selectedEvent?.title}
            </DialogTitle>
          </DialogHeader>

          {loadingRegs ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-white/40" />
            </div>
          ) : registrations.length === 0 ? (
            <div className="text-center py-10">
              <Users className="w-10 h-10 text-white/20 mx-auto mb-2" />
              <p className="text-white/40 text-sm">Nenhum inscrito ainda</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-white/40 mb-3">{registrations.length} inscritos</p>
              {registrations.map(reg => (
                <div key={reg.id} className="flex items-center justify-between bg-white/[0.04] border border-white/[0.06] rounded-xl p-3">
                  <div>
                    <p className="text-sm font-medium text-white">{reg.name}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-white/40">{reg.age} anos</span>
                      <span className="text-xs text-white/40">{reg.whatsapp.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-mono text-white/30">{reg.registration_code.toUpperCase()}</span>
                    <p className="text-[10px] text-white/20 mt-0.5">
                      {format(new Date(reg.created_at), "dd/MM HH:mm", { locale: pt })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
