/**
 * O "?" discreto do módulo Ísis (04/11/2026, pedido do Thiago: "um lugar com interrogação, o usuário clica e tem um
 * tutorial de tudo que a Ísis faz, o que ela pode fazer e como ela ajuda"). Passo a passo em abas, com exemplos de pedido
 * que dá para mandar direto (o botão "Usar este exemplo" escreve na conversa).
 */
import { useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const STEPS: { title: string; body: string[]; examples?: string[] }[] = [
  {
    title: 'Quem é a Ísis',
    body: [
      'A Ísis é a social media da Pulse, uma IA que trabalha junto com a equipe. Você fala com ela aqui, como falaria com uma pessoa da agência.',
      'Ela entende o pedido, cria os cards no lugar certo, chama quem precisa (editores, designers, revisão) e te responde nesta conversa quando estiver pronto.',
    ],
  },
  {
    title: 'Como pedir',
    body: [
      'Escreva, grave a voz pelo microfone ou anexe arquivos: áudio, foto, PDF, vídeo. Ela ouve o áudio e lê os anexos.',
      'Pode mandar em várias mensagens: ela junta tudo. O que ajuda: o cliente, o formato (vídeo, story, feed, carrossel), a quantidade e o prazo.',
    ],
    examples: ['Faz 4 stories da Venon para amanhã às 12h: bom dia, dicas, planos e onde atendemos.'],
  },
  {
    title: 'Vídeos',
    body: [
      'Com material gravado, ela abre o card de edição com o roteiro e os brutos, e um editor pega na fila.',
      'Sem material gravado, ela pede uma animação (motion design) na marca do cliente.',
    ],
    examples: ['Reels da AlvesCred sobre consignado do INSS, com os brutos desta pasta do Drive: <link>.'],
  },
  {
    title: 'Artes e stories',
    body: [
      'Ela cria um card no Design para cada peça, sempre com as opções A e B, e avisa a designer.',
      'Quando a arte fica pronta, ela manda o link de aprovação no formato do Instagram, e a arte aprovada fica pronta para o agendamento.',
    ],
    examples: ['Carrossel para a NiqTurbo explicando por que a internet cai com chuva, até sexta.'],
  },
  {
    title: 'Propostas comerciais',
    body: [
      'Diga o nome da pessoa, a atividade dela, o que vamos vender e o valor. A Ísis escreve uma proposta sob medida, focada em venda, e te manda o link para enviar ao cliente.',
      'Quando o cliente aceita, as receitas entram no financeiro sozinhas.',
    ],
    examples: ['Proposta para a Dra. Carla, dentista em Uruaçu: 8 reels e 12 artes por mês, R$ 1.800 mensais, contrato de 6 meses.'],
  },
  {
    title: 'Comentários das redes',
    body: [
      'A Ísis também responde os comentários do Instagram, do Facebook e as avaliações do Google, na voz de cada cliente.',
      'Para ligar: Central Social → aba "Ísis por cliente" → escolha "Ísis responde sozinha o simples". Reclamação e assunto delicado sempre vão para a equipe. Em "Ísis escreve, equipe aprova", ela deixa rascunhos para alguém aprovar.',
      'Para os comentários chegarem na hora, ligue "Avisos em tempo real" em Conexões Sociais.',
    ],
  },
  {
    title: 'Sugestões e avisos',
    body: [
      'Os cartões no topo são o que a Ísis separou para você: o que conferir, artes que vencem e datas do mês (feriados e datas do nicho de cada cliente).',
      '"Pode fazer" e "Pedir as artes" já mandam o pedido para ela. O X dispensa o cartão.',
    ],
  },
  {
    title: 'Acompanhar',
    body: [
      'Cada pedido mostra o andamento: enviada, a Ísis viu, fazendo, feita ✓.',
      'O ponto no canto da tela fica sempre à mão em qualquer página e mostra quando ela respondeu.',
    ],
  },
];

export default function IsisTutorial({ onExample }: { onExample?: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const s = STEPS[step];
  return (
    <>
      <button
        type="button"
        onClick={() => { setStep(0); setOpen(true); }}
        className="flex h-7 w-7 items-center justify-center rounded-full border border-cyan-300/30 text-cyan-200/70 transition-colors hover:border-cyan-300/70 hover:text-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
        aria-label="Como a Ísis funciona"
        title="Como a Ísis funciona"
      >
        <HelpCircle size={15} />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{s.title}</DialogTitle>
            <DialogDescription className="sr-only">Tutorial da Ísis, passo {step + 1} de {STEPS.length}</DialogDescription>
          </DialogHeader>
          <div className="flex gap-1" aria-hidden>
            {STEPS.map((_, i) => (
              <button key={i} type="button" onClick={() => setStep(i)} className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? 'bg-orange-500' : 'bg-muted'}`} />
            ))}
          </div>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            {s.body.map((p, i) => <p key={i}>{p}</p>)}
            {s.examples?.map((ex) => (
              <div key={ex} className="rounded-xl border bg-muted/40 p-3">
                <p className="text-foreground">"{ex}"</p>
                {onExample && !ex.includes('<link>') && (
                  <button type="button" className="mt-1.5 text-xs font-medium text-orange-600 hover:underline"
                    onClick={() => { onExample(ex); setOpen(false); }}>
                    Usar este exemplo
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-muted-foreground">{step + 1} de {STEPS.length}</span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" disabled={step === 0} onClick={() => setStep((v) => v - 1)}>Voltar</Button>
              {step < STEPS.length - 1
                ? <Button size="sm" onClick={() => setStep((v) => v + 1)}>Próximo</Button>
                : <Button size="sm" onClick={() => setOpen(false)}>Entendi</Button>}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
