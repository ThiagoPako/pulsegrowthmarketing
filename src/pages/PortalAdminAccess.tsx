import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Loader2, LockKeyhole, Rocket, ShieldAlert } from 'lucide-react';
import { supabase } from '@/lib/vpsDb';
import { savePortalSession } from '@/lib/portalApi';

// Link fixo de admin do portal (pedido do usuário, 03/11/2026): quem abre entra como admin da empresa. Antes de
// entrar, o aviso para não compartilhar ("lembrar ele de não compartilhar esse link com ninguém").

interface Access { client_id: string; company_name: string; color?: string | null; logo_url?: string | null; portal_token: string }

export default function PortalAdminAccess() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [access, setAccess] = useState<Access | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    supabase.functions.invoke('client-portal-auth', { body: { action: 'admin_link_login', token } }).then(({ data, error: err }) => {
      if (data?.success) setAccess(data as Access);
      else setError((typeof err === 'string' && err) || data?.error || 'Este link de admin não vale mais. Peça um novo à equipe Pulse.');
    });
  }, [token]);

  const color = access?.color || '24 95% 53%';
  const enter = () => {
    if (!access) return;
    savePortalSession({ clientId: access.client_id, companyName: access.company_name, userName: `Admin · ${access.company_name}`, token: access.portal_token });
    navigate(`/portal/${access.client_id}`, { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#080810] px-4 py-10">
      <div className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(ellipse at 50% 25%, hsl(${color} / 0.12), transparent 65%)` }} />
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: 'easeOut' }} className="relative w-full max-w-sm">
        <div className="rounded-3xl border border-white/[0.08] bg-[#14141f] p-7 shadow-2xl">
          {error ? (
            <div className="text-center">
              <ShieldAlert size={36} className="mx-auto text-amber-300" />
              <h1 className="mt-4 text-lg font-bold text-white">Link indisponível</h1>
              <p className="mt-2 text-sm leading-relaxed text-white/55">{error}</p>
            </div>
          ) : !access ? (
            <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin text-white/40" /></div>
          ) : (
            <>
              <div className="text-center">
                {access.logo_url ? (
                  <img src={access.logo_url} alt={access.company_name} className="mx-auto h-20 w-20 rounded-2xl bg-white object-contain p-1.5 ring-2 ring-white/10" />
                ) : (
                  <div className="mx-auto grid h-20 w-20 place-items-center rounded-2xl text-3xl font-bold text-white" style={{ background: `hsl(${color})` }}>{access.company_name.charAt(0)}</div>
                )}
                <h1 className="mt-4 text-xl font-bold text-white">{access.company_name}</h1>
                <p className="mt-1 text-sm text-white/45">Portal do cliente · acesso de admin</p>
              </div>

              <div className="mt-6 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-amber-100"><LockKeyhole size={15} className="text-amber-300" /> Não compartilhe este link</p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-amber-50/75">
                  Este é o link de admin do portal da sua empresa. Quem tiver ele entra como admin, sem senha. Guarde só para você;
                  para a sua equipe, crie logins na aba Acessos do portal.
                </p>
              </div>

              <motion.button
                type="button"
                onClick={enter}
                whileTap={{ scale: 0.98 }}
                className="mt-6 w-full rounded-xl py-3.5 text-sm font-semibold text-white shadow-lg"
                style={{ background: `linear-gradient(135deg, hsl(${color}), hsl(${color} / 0.8))`, boxShadow: `0 8px 24px -4px hsl(${color} / 0.35)` }}
              >
                Entendi, entrar no portal
              </motion.button>
            </>
          )}
        </div>
        <div className="mt-6 flex items-center justify-center gap-1.5 text-[10px] text-white/25"><Rocket size={10} /> Pulse Club</div>
      </motion.div>
    </div>
  );
}
