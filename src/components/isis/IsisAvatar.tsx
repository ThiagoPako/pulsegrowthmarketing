/**
 * O rosto da Ísis, a social media da agência (04/11/2026, pedido do Thiago: "um bonequinho 3D de uma social media
 * animada, alegre, um estilo diferente, que interaja"). Personagem em SVG com volume (degradês de luz e sombra, como
 * boneco de vinil), sem imagem externa: pisca, respira, acena ao chegar e muda com o que está acontecendo na conversa.
 *   idle      respira e pisca
 *   ouvindo   inclina a cabeça e o celular acende (gravando a voz)
 *   pensando  olha para cima, com os três pontinhos
 *   falando   a boca mexe
 *   feliz     sorriso aberto e brilhos (quando alguém clica nela)
 */
import { useEffect, useId, useState } from 'react';

export type IsisMood = 'idle' | 'ouvindo' | 'pensando' | 'falando' | 'feliz';

const CSS = `
@keyframes isis-breathe { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-3px) } }
@keyframes isis-blink { 0%,92%,100% { transform: scaleY(1) } 95% { transform: scaleY(0.08) } }
@keyframes isis-wave { 0%,100% { transform: rotate(0deg) } 20% { transform: rotate(-22deg) } 40% { transform: rotate(8deg) } 60% { transform: rotate(-18deg) } 80% { transform: rotate(4deg) } }
@keyframes isis-talk { 0%,100% { transform: scaleY(0.35) } 50% { transform: scaleY(1) } }
@keyframes isis-dot { 0%,100% { opacity: .25; transform: translateY(0) } 50% { opacity: 1; transform: translateY(-4px) } }
@keyframes isis-spark { 0% { opacity: 0; transform: scale(.4) } 40% { opacity: 1; transform: scale(1) } 100% { opacity: 0; transform: scale(.6) translateY(-10px) } }
@keyframes isis-glow { 0%,100% { opacity: .55 } 50% { opacity: 1 } }
.isis-body { animation: isis-breathe 3.6s ease-in-out infinite; transform-box: fill-box; transform-origin: center bottom }
.isis-eye { animation: isis-blink 4.2s infinite; transform-box: fill-box; transform-origin: center }
.isis-arm-wave { animation: isis-wave 1.6s ease-in-out 1; transform-box: fill-box; transform-origin: 85% 90% }
.isis-mouth-talk { animation: isis-talk .22s ease-in-out infinite; transform-box: fill-box; transform-origin: center top }
.isis-dot { animation: isis-dot 1s ease-in-out infinite }
.isis-spark { animation: isis-spark 1.4s ease-out infinite; transform-box: fill-box; transform-origin: center }
.isis-glow { animation: isis-glow 1.1s ease-in-out infinite }
.isis-head { transition: transform .45s cubic-bezier(.3,1.4,.5,1); transform-box: fill-box; transform-origin: 50% 85% }
@media (prefers-reduced-motion: reduce) {
  .isis-body, .isis-eye, .isis-arm-wave, .isis-mouth-talk, .isis-dot, .isis-spark, .isis-glow { animation: none }
}
`;

export default function IsisAvatar({ mood = 'idle', size = 160, wave = false, className = '' }: {
  mood?: IsisMood; size?: number; wave?: boolean; className?: string;
}) {
  const uid = useId().replace(/:/g, '');
  const g = (n: string) => `isis-${n}-${uid}`;
  // aceno: ao aparecer (wave) e sempre que fica feliz
  const [waving, setWaving] = useState(wave);
  useEffect(() => {
    if (!wave && mood !== 'feliz') return;
    setWaving(true);
    const t = setTimeout(() => setWaving(false), 1700);
    return () => clearTimeout(t);
  }, [wave, mood]);

  const headTilt = mood === 'ouvindo' ? 'rotate(-7deg)' : mood === 'pensando' ? 'rotate(5deg) translateY(-2px)' : 'none';
  const pupilShift = mood === 'pensando' ? -4 : 0;

  return (
    <svg viewBox="0 0 200 220" width={size} height={size * 1.1} className={className} role="img" aria-label="Ísis, a social media da Pulse">
      <style>{CSS}</style>
      <defs>
        <radialGradient id={g('skin')} cx="42%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#F9D2B4" />
          <stop offset="60%" stopColor="#E9AE87" />
          <stop offset="100%" stopColor="#C98762" />
        </radialGradient>
        <radialGradient id={g('hair')} cx="35%" cy="25%" r="80%">
          <stop offset="0%" stopColor="#7A3B22" />
          <stop offset="55%" stopColor="#4A2216" />
          <stop offset="100%" stopColor="#2A120B" />
        </radialGradient>
        <linearGradient id={g('streak')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFB547" />
          <stop offset="100%" stopColor="#FF6A13" />
        </linearGradient>
        <radialGradient id={g('shirt')} cx="40%" cy="20%" r="90%">
          <stop offset="0%" stopColor="#FF8A3D" />
          <stop offset="70%" stopColor="#FF6A13" />
          <stop offset="100%" stopColor="#C94A06" />
        </radialGradient>
        <radialGradient id={g('iris')} cx="40%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#8A5A3A" />
          <stop offset="100%" stopColor="#2B160C" />
        </radialGradient>
        <linearGradient id={g('phone')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3A3A44" />
          <stop offset="100%" stopColor="#16161A" />
        </linearGradient>
        <radialGradient id={g('floor')} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#000" stopOpacity=".22" />
          <stop offset="100%" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* sombra no chão */}
      <ellipse cx="100" cy="210" rx="58" ry="8" fill={`url(#${g('floor')})`} />

      <g className="isis-body">
        {/* corpo: moletom laranja Pulse */}
        <path d="M44 214 C44 168 66 150 100 150 C134 150 156 168 156 214 Z" fill={`url(#${g('shirt')})`} />
        <path d="M84 152 Q100 166 116 152" fill="none" stroke="#FFD7B8" strokeWidth="5" strokeLinecap="round" />
        {/* braço esquerdo com o celular */}
        <g>
          <path d="M58 176 C48 184 52 200 66 198 L84 192" fill="none" stroke="#E9772E" strokeWidth="15" strokeLinecap="round" />
          <rect x="74" y="168" width="22" height="36" rx="5" fill={`url(#${g('phone')})`} transform="rotate(-12 85 186)" />
          <rect x="77" y="172" width="16" height="26" rx="3" transform="rotate(-12 85 186)"
            fill={mood === 'ouvindo' ? '#FF6A13' : '#5B8CFF'} className={mood === 'ouvindo' ? 'isis-glow' : undefined} />
          {mood === 'ouvindo' && <circle cx="85" cy="185" r="3" fill="#fff" />}
          <circle cx="78" cy="192" r="7" fill={`url(#${g('skin')})`} />
        </g>
        {/* braço direito: acena */}
        <g className={waving ? 'isis-arm-wave' : undefined}>
          <path d="M142 176 C156 166 162 148 158 134" fill="none" stroke="#E9772E" strokeWidth="15" strokeLinecap="round" />
          <circle cx="157" cy="128" r="9" fill={`url(#${g('skin')})`} />
        </g>

        {/* cabeça */}
        <g className="isis-head" style={{ transform: headTilt }}>
          {/* coque */}
          <circle cx="100" cy="30" r="20" fill={`url(#${g('hair')})`} />
          <path d="M88 22 Q100 14 112 22" fill="none" stroke={`url(#${g('streak')})`} strokeWidth="4" strokeLinecap="round" />
          {/* cabelo de trás */}
          <path d="M46 92 C40 52 66 34 100 34 C134 34 160 52 154 92 C156 118 146 132 138 136 L62 136 C54 132 44 118 46 92 Z" fill={`url(#${g('hair')})`} />
          {/* pescoço e rosto */}
          <rect x="88" y="128" width="24" height="26" rx="10" fill="#D9997A" />
          <ellipse cx="100" cy="96" rx="46" ry="48" fill={`url(#${g('skin')})`} />
          {/* orelhas com argola */}
          <ellipse cx="55" cy="100" rx="7" ry="10" fill="#E3A07C" />
          <ellipse cx="145" cy="100" rx="7" ry="10" fill="#E3A07C" />
          <circle cx="55" cy="114" r="5" fill="none" stroke="#FFB547" strokeWidth="2.2" />
          <circle cx="145" cy="114" r="5" fill="none" stroke="#FFB547" strokeWidth="2.2" />
          {/* franja com mecha laranja */}
          <path d="M54 88 C56 58 78 46 102 48 C124 50 142 60 146 84 C130 72 112 66 94 70 C78 72 64 78 54 88 Z" fill={`url(#${g('hair')})`} />
          <path d="M70 66 C86 56 106 54 122 60" fill="none" stroke={`url(#${g('streak')})`} strokeWidth="5" strokeLinecap="round" />

          {/* olhos */}
          <g className="isis-eye">
            <ellipse cx="81" cy="98" rx="10" ry="12" fill="#fff" />
            <ellipse cx={81 + (mood === 'pensando' ? 2 : 0)} cy={100 + pupilShift} rx="7" ry="8.5" fill={`url(#${g('iris')})`} />
            <circle cx={78 + (mood === 'pensando' ? 2 : 0)} cy={96 + pupilShift} r="2.8" fill="#fff" />
          </g>
          <g className="isis-eye">
            <ellipse cx="119" cy="98" rx="10" ry="12" fill="#fff" />
            <ellipse cx={119 + (mood === 'pensando' ? 2 : 0)} cy={100 + pupilShift} rx="7" ry="8.5" fill={`url(#${g('iris')})`} />
            <circle cx={116 + (mood === 'pensando' ? 2 : 0)} cy={96 + pupilShift} r="2.8" fill="#fff" />
          </g>
          {/* sobrancelhas */}
          <path d={mood === 'pensando' ? 'M70 82 Q81 76 92 82' : 'M70 84 Q81 79 92 84'} fill="none" stroke="#3A1A0F" strokeWidth="3" strokeLinecap="round" />
          <path d={mood === 'pensando' ? 'M108 80 Q119 72 130 80' : 'M108 84 Q119 79 130 84'} fill="none" stroke="#3A1A0F" strokeWidth="3" strokeLinecap="round" />
          {/* bochechas */}
          <ellipse cx="70" cy="116" rx="8" ry="5" fill="#FF8A7A" opacity=".45" />
          <ellipse cx="130" cy="116" rx="8" ry="5" fill="#FF8A7A" opacity=".45" />
          {/* nariz */}
          <path d="M98 108 Q100 113 103 110" fill="none" stroke="#C47A58" strokeWidth="2" strokeLinecap="round" />
          {/* boca */}
          {mood === 'falando' ? (
            <ellipse className="isis-mouth-talk" cx="100" cy="124" rx="8" ry="6" fill="#7A2A22" />
          ) : mood === 'feliz' ? (
            <path d="M86 119 Q100 136 114 119 Z" fill="#7A2A22" stroke="#7A2A22" strokeWidth="2" strokeLinejoin="round" />
          ) : mood === 'pensando' ? (
            <path d="M92 122 Q101 127 109 120" fill="none" stroke="#7A2A22" strokeWidth="3" strokeLinecap="round" />
          ) : (
            <path d="M88 120 Q100 131 112 120" fill="none" stroke="#7A2A22" strokeWidth="3.2" strokeLinecap="round" />
          )}
          {/* brilho de luz no rosto (volume) */}
          <ellipse cx="78" cy="74" rx="16" ry="8" fill="#fff" opacity=".18" />
        </g>

        {/* pensando: três pontinhos */}
        {mood === 'pensando' && (
          <g>
            {[0, 1, 2].map((i) => (
              <circle key={i} className="isis-dot" cx={150 + i * 11} cy="40" r="4" fill="#FF6A13" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </g>
        )}
        {/* feliz: brilhos */}
        {mood === 'feliz' && (
          <g fill="#FFB547">
            {[[36, 50], [164, 60], [150, 22]].map(([x, y], i) => (
              <path key={i} className="isis-spark" style={{ animationDelay: `${i * 0.25}s` }}
                d={`M${x} ${y - 7} L${x + 2} ${y - 2} L${x + 7} ${y} L${x + 2} ${y + 2} L${x} ${y + 7} L${x - 2} ${y + 2} L${x - 7} ${y} L${x - 2} ${y - 2} Z`} />
            ))}
          </g>
        )}
      </g>
    </svg>
  );
}
