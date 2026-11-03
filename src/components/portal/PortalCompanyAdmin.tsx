import { useCallback, useEffect, useState } from 'react';
import { Copy, Crown, Link2, Loader2, ShieldCheck, UserMinus, UserPlus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { portalAdmin } from '@/lib/portalApi';

// Admin da empresa no portal (pedido do usuário, 03/11/2026): quem tem acesso, tirar acesso, promover outro admin e o
// link de cadastro dos colaboradores. A equipe Pulse vê o mesmo e ainda gera o convite de admin.

interface PortalLogin {
  id: string;
  username: string;
  display_name: string;
  role: 'admin' | 'membro';
  created_at: string;
}

async function copy(text: string, ok: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(ok);
  } catch {
    window.prompt('Copie o link:', text);
  }
}

export default function PortalCompanyAdmin({ clientId, clientColor, isTeamMember }: { clientId: string; clientColor: string; isTeamMember: boolean }) {
  const [users, setUsers] = useState<PortalLogin[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const accent = `hsl(${clientColor})`;

  const load = useCallback(async () => {
    const data = await portalAdmin({ action: 'users', client_id: clientId });
    if (data?.error) toast.error(data.error);
    else { setUsers(data.users || []); setMe(data.me || null); }
    setLoading(false);
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  const act = async (id: string, body: Record<string, unknown>, ok: string) => {
    setBusy(id);
    const data = await portalAdmin({ client_id: clientId, user_id: id, ...body });
    setBusy(null);
    if (data?.error) { toast.error(data.error); return; }
    toast.success(ok);
    load();
  };

  const inviteAdmin = async () => {
    setBusy('invite');
    const data = await portalAdmin({ action: 'create_invite', client_id: clientId });
    setBusy(null);
    if (data?.error) { toast.error(data.error); return; }
    await copy(`${window.location.origin}${data.path}`, 'Link de admin copiado! Vale por 7 dias e uma pessoa só.');
  };

  const memberLink = `${window.location.origin}/portal-registro/${clientId}`;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => copy(memberLink, 'Link de cadastro copiado!')}
          className="flex items-start gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4 text-left transition-colors hover:bg-white/[0.07]"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: `hsl(${clientColor} / 0.15)`, color: accent }}><UserPlus size={17} /></span>
          <span>
            <span className="block text-sm font-semibold text-white">Convidar colaborador</span>
            <span className="mt-0.5 block text-xs text-white/45">Copia o link para a pessoa criar o login dela no portal.</span>
          </span>
        </button>
        {isTeamMember && (
          <button
            type="button"
            onClick={inviteAdmin}
            disabled={busy === 'invite'}
            className="flex items-start gap-3 rounded-2xl border border-violet-400/25 bg-violet-500/10 p-4 text-left transition-colors hover:bg-violet-500/15 disabled:opacity-60"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-500/20 text-violet-300">{busy === 'invite' ? <Loader2 size={17} className="animate-spin" /> : <Link2 size={17} />}</span>
            <span>
              <span className="block text-sm font-semibold text-white">Gerar link de admin</span>
              <span className="mt-0.5 block text-xs text-white/45">Para o dono ou gestor da empresa. Uso único, vale 7 dias.</span>
            </span>
          </button>
        )}
      </div>

      <section className="rounded-2xl border border-white/[0.08] bg-white/[0.03]">
        <header className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
          <Users size={15} className="text-white/50" />
          <h3 className="text-sm font-semibold text-white">Quem tem acesso</h3>
          <span className="ml-auto text-xs tabular-nums text-white/40">{users.length}</span>
        </header>
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 size={18} className="animate-spin text-white/40" /></div>
        ) : users.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-white/45">Ninguém criou login ainda. Envie o link de cadastro para a equipe da empresa.</p>
        ) : (
          <ul className="divide-y divide-white/[0.05]">
            {users.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold text-white" style={{ background: u.role === 'admin' ? accent : 'rgba(255,255,255,0.08)' }}>
                  {(u.display_name || u.username).charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-white">
                    <span className="truncate">{u.display_name || u.username}</span>
                    {u.id === me && <span className="text-[11px] text-white/40">(você)</span>}
                  </span>
                  <span className="block truncate font-mono text-[11px] text-white/35">@{u.username}</span>
                </span>
                {u.role === 'admin' ? (
                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: `hsl(${clientColor} / 0.15)`, color: accent }}>
                    <Crown size={11} /> Admin
                  </span>
                ) : (
                  <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-white/50">Colaborador</span>
                )}
                {u.id !== me && (
                  <span className="flex gap-1">
                    <button
                      type="button"
                      disabled={busy === u.id}
                      onClick={() => act(u.id, { action: 'set_role', role: u.role === 'admin' ? 'membro' : 'admin' }, u.role === 'admin' ? 'Agora é colaborador' : 'Agora é admin')}
                      className="inline-flex items-center gap-1 rounded-lg border border-white/[0.08] px-2 py-1 text-[11px] text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-50"
                    >
                      <ShieldCheck size={12} /> {u.role === 'admin' ? 'Tirar admin' : 'Tornar admin'}
                    </button>
                    <button
                      type="button"
                      disabled={busy === u.id}
                      onClick={() => {
                        if (window.confirm(`Tirar o acesso de ${u.display_name || u.username} ao portal?`)) act(u.id, { action: 'remove_user' }, 'Acesso removido');
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-400/20 px-2 py-1 text-[11px] text-red-300/80 transition-colors hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
                    >
                      <UserMinus size={12} /> Tirar acesso
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="flex items-center gap-1.5 text-[11px] text-white/35"><ShieldCheck size={11} /> Quem perde o acesso sai do portal na hora: o login para de funcionar.</p>
    </div>
  );
}
