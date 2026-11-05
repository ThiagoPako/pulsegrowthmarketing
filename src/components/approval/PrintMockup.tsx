/**
 * Mockup de impresso para a aprovação de arte (05/11/2026, pedido do Thiago: "se eu pedir uma arte para outdoor, a
 * visualização deve estar num mockup de outdoor e um botão para ver detalhes da arte"). Feito em CSS, sem foto de
 * banco: outdoor numa estrada ao entardecer, banner pendurado na parede, panfleto e cartão sobre a mesa.
 */
export type PrintKind = 'outdoor' | 'banner' | 'panfleto' | 'cartao' | 'outro';

export function printKindOf(preset: string | null | undefined): PrintKind {
  const p = String(preset || '').toLowerCase();
  if (p === 'outdoor') return 'outdoor';
  if (p === 'banner') return 'banner';
  if (p.startsWith('panfleto')) return 'panfleto';
  if (p === 'cartao_visita') return 'cartao';
  return 'outro';
}

export const PRINT_LABEL: Record<PrintKind, string> = {
  outdoor: 'Outdoor', banner: 'Banner', panfleto: 'Panfleto', cartao: 'Cartão de visita', outro: 'Material impresso',
};

export default function PrintMockup({ kind, src, alt }: { kind: PrintKind; src: string; alt: string }) {
  if (kind === 'outdoor') {
    return (
      <div className="relative overflow-hidden rounded-2xl" style={{ background: 'linear-gradient(180deg,#f6b26b 0%,#f9d29d 38%,#cfe3ef 70%,#9dbb7a 70%,#6f8f4e 100%)' }}>
        <div className="relative mx-auto w-[88%] pt-[10%] pb-[16%]">
          {/* placa */}
          <div className="relative rounded-[3px] bg-[#2b2b2b] p-[1.6%] shadow-[0_18px_30px_-12px_rgba(0,0,0,.55)]">
            <img src={src} alt={alt} className="block aspect-[3/1] w-full object-cover" />
            {/* luminárias */}
            <div className="absolute -top-[9%] left-[12%] right-[12%] flex justify-between">
              {[0, 1, 2].map((i) => <span key={i} className="block h-2 w-6 rounded-sm bg-[#3a3a3a]" />)}
            </div>
          </div>
          {/* postes */}
          <div className="absolute bottom-0 left-[28%] h-[18%] w-[2.2%] bg-[#3d3d3d]" />
          <div className="absolute bottom-0 right-[28%] h-[18%] w-[2.2%] bg-[#3d3d3d]" />
        </div>
      </div>
    );
  }
  if (kind === 'banner') {
    return (
      <div className="flex justify-center rounded-2xl px-6 py-8" style={{ background: 'linear-gradient(180deg,#e9e4dc,#d8d1c6)' }}>
        <div className="relative w-[62%]">
          <div className="mx-auto h-2 w-[108%] -translate-x-[3.7%] rounded-full bg-[#5b4a3a] shadow" />
          <img src={src} alt={alt} className="block w-full shadow-[0_20px_30px_-14px_rgba(0,0,0,.45)]" />
          <div className="mx-auto h-1.5 w-full rounded-full bg-[#5b4a3a]" />
        </div>
      </div>
    );
  }
  if (kind === 'panfleto' || kind === 'cartao') {
    return (
      <div className="flex justify-center rounded-2xl px-6 py-10" style={{ background: 'radial-gradient(ellipse at 40% 30%,#8a6a4f,#5c432f)' }}>
        <img src={src} alt={alt}
          className={`block ${kind === 'cartao' ? 'w-[58%]' : 'w-[62%]'} -rotate-3 rounded-[2px] shadow-[0_24px_30px_-10px_rgba(0,0,0,.6)]`} />
      </div>
    );
  }
  return (
    <div className="flex justify-center rounded-2xl bg-neutral-200 p-6">
      <img src={src} alt={alt} className="block max-h-[60vh] w-auto shadow-xl" />
    </div>
  );
}
