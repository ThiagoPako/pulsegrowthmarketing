// Prévia do funil com a cara do direct do Instagram: tocar num botão de resposta segue o caminho, como no celular.
import { useEffect, useState } from 'react';
import { ChevronLeft, ExternalLink, Info, Phone, Video } from 'lucide-react';
import type { Flow, FlowStep } from './types';

const fill = (t: string) => t.replace(/\{primeiro_nome\}/g, 'Ana').replace(/\{nome\}/g, 'Ana Souza');

export default function InstagramPreview({ flow, accountName, focusStepId }: { flow: Flow; accountName: string; focusStepId?: string | null }) {
  const [path, setPath] = useState<{ step: FlowStep; userSaid?: string }[]>([]);

  useEffect(() => {
    const start = flow.steps.find((s) => s.id === focusStepId) || flow.steps[0];
    setPath(start ? [{ step: start, userSaid: flow.trigger.type === 'dm_keyword' ? flow.trigger.keywords[0] || 'Oi' : undefined }] : []);
  }, [flow, focusStepId]);

  const follow = (title: string, next: string | null | undefined) => {
    const step = flow.steps.find((s) => s.id === next);
    if (step) setPath((p) => [...p, { step, userSaid: title }]);
  };

  const last = path[path.length - 1]?.step;
  return (
    <div className="mx-auto w-[300px] overflow-hidden rounded-[2.2rem] border-[10px] border-neutral-900 bg-white text-neutral-900 shadow-2xl dark:bg-black dark:text-white">
      <div className="flex items-center gap-2 border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
        <ChevronLeft size={18} />
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600 text-[11px] font-bold text-white">{accountName.slice(0, 1).toUpperCase()}</span>
        <span className="flex-1 truncate text-sm font-semibold">{accountName}</span>
        <Phone size={16} /><Video size={16} /><Info size={16} />
      </div>
      <div className="h-[430px] space-y-2 overflow-y-auto px-3 py-3 text-[13px]">
        {flow.trigger.type === 'comment_keyword' && (
          <p className="text-center text-[10px] text-neutral-400">Ana comentou “{flow.trigger.keywords[0] || 'qualquer coisa'}” no seu post</p>
        )}
        {path.map(({ step, userSaid }, i) => (
          <div key={`${step.id}-${i}`} className="space-y-1.5">
            {userSaid && <div className="ml-auto w-fit max-w-[75%] rounded-2xl bg-[#3797F0] px-3 py-1.5 text-white">{userSaid}</div>}
            {step.image_url && <img src={step.image_url} alt="" className="max-w-[75%] rounded-2xl" />}
            <div className="w-fit max-w-[80%] overflow-hidden rounded-2xl bg-neutral-100 dark:bg-neutral-800">
              <p className="whitespace-pre-wrap px-3 py-2">{fill(step.text) || '…'}</p>
              {step.buttons.map((b, k) => (
                <div key={k} className="flex items-center justify-center gap-1 border-t border-neutral-200 px-3 py-2 text-center font-semibold text-[#3797F0] dark:border-neutral-700">
                  {b.title || 'Botão'} <ExternalLink size={11} />
                </div>
              ))}
            </div>
            {step.ask && i === path.length - 1 && <p className="text-[10px] text-neutral-400">Espera a pessoa responder ({step.ask.field})…</p>}
            {step.handoff && <p className="text-[10px] text-amber-600">→ passa para a equipe (o robô pausa 24 h)</p>}
          </div>
        ))}
      </div>
      <div className="min-h-[52px] border-t border-neutral-200 px-2 py-2 dark:border-neutral-800">
        {last?.replies?.length ? (
          <div className="flex flex-wrap justify-end gap-1.5">
            {last.replies.map((r, k) => (
              <button key={k} type="button" onClick={() => follow(r.title, r.next)}
                className="rounded-full border border-[#3797F0] px-3 py-1 text-[12px] font-semibold text-[#3797F0] hover:bg-[#3797F0]/10">{r.title || 'Resposta'}</button>
            ))}
          </div>
        ) : last?.ask ? (
          <button type="button" onClick={() => follow(last.ask?.field === 'telefone' ? '62 99999-9999' : last.ask?.field === 'email' ? 'ana@email.com' : 'Ana Souza', last.ask?.next)}
            className="w-full rounded-full bg-neutral-100 px-3 py-2 text-left text-[12px] text-neutral-500 dark:bg-neutral-800">Simular resposta da pessoa…</button>
        ) : last?.next ? (
          <button type="button" onClick={() => follow('', last.next)} className="w-full text-center text-[11px] text-neutral-400">segue automático ▸</button>
        ) : (
          <p className="text-center text-[11px] text-neutral-400">Fim do caminho · <button type="button" className="underline" onClick={() => setPath(path.slice(0, 1))}>recomeçar</button></p>
        )}
      </div>
    </div>
  );
}
