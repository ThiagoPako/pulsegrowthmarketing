import { motion } from "framer-motion";
import { Timer, Trophy, Gift, Percent, ShoppingCart, Clock, CheckCircle2, XCircle, Wallet, Camera, AlertTriangle, ScrollText } from "lucide-react";
import { useEffect, useState } from "react";

const pulseLogo = { url: "/pulse-logo.png" };

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as any } },
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

function AnimatedChronometer() {
  const [t, setT] = useState(0);
  useEffect(() => {
    let raf: number;
    const start = performance.now();
    const loop = (now: number) => {
      const elapsed = ((now - start) / 1000) % 12;
      setT(elapsed);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const display = t.toFixed(2).padStart(5, "0");
  const isTarget = Math.abs(t - 10) < 0.05;
  return (
    <div className="relative flex items-center justify-center">
      <div className="absolute inset-0 blur-3xl bg-yellow-400/30 rounded-full" />
      <div className={`relative font-mono text-6xl md:text-8xl font-black tabular-nums px-8 py-4 rounded-2xl border-4 transition-colors ${isTarget ? "border-emerald-400 text-emerald-300 bg-emerald-500/10" : "border-yellow-400/70 text-yellow-300 bg-black/40"}`}>
        {display}
        <span className="text-2xl md:text-4xl align-top ml-1 opacity-70">s</span>
      </div>
    </div>
  );
}

function PrizeTier({
  icon: Icon,
  title,
  range,
  reward,
  detail,
  color,
  delay,
  emphasis,
}: {
  icon: any;
  title: string;
  range: string;
  reward: string;
  detail: string;
  color: string;
  delay: number;
  emphasis?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] as any }}
      className={`relative rounded-2xl overflow-hidden border ${emphasis ? "border-yellow-400/60" : "border-white/10"} bg-gradient-to-br ${color} p-6 flex flex-col gap-3`}
    >
      {emphasis && (
        <div className="absolute top-3 right-3 text-[10px] font-black uppercase tracking-widest bg-yellow-400 text-black px-2 py-1 rounded">
          Prêmio Máximo
        </div>
      )}
      <Icon className="w-10 h-10 text-white" strokeWidth={1.5} />
      <div className="text-xs uppercase tracking-wider text-white/70 font-semibold">{title}</div>
      <div className="font-mono text-2xl md:text-3xl font-black text-white">{range}</div>
      <div className="text-lg font-bold text-white">{reward}</div>
      <p className="text-sm text-white/80 leading-relaxed">{detail}</p>
    </motion.div>
  );
}

function StepCard({ n, title, text, icon: Icon }: { n: number; title: string; text: string; icon: any }) {
  return (
    <motion.div variants={fadeUp} className="relative bg-white rounded-2xl p-6 shadow-lg border border-green-100">
      <div className="absolute -top-4 -left-4 w-12 h-12 rounded-full bg-yellow-400 text-green-900 font-black text-xl flex items-center justify-center shadow-lg">
        {n}
      </div>
      <Icon className="w-8 h-8 text-green-700 mb-3 mt-2" strokeWidth={1.8} />
      <h3 className="font-bold text-lg text-neutral-900 mb-1">{title}</h3>
      <p className="text-sm text-neutral-600 leading-relaxed">{text}</p>
    </motion.div>
  );
}

function Section({ id, title, subtitle, children, dark }: any) {
  return (
    <section id={id} className={`py-16 md:py-24 px-6 ${dark ? "bg-neutral-950 text-white" : "bg-white text-neutral-900"}`}>
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.6 }}
          className="mb-10 md:mb-14"
        >
          <h2 className={`text-3xl md:text-5xl font-black tracking-tight ${dark ? "text-white" : "text-neutral-900"}`}>{title}</h2>
          {subtitle && <p className={`mt-3 text-base md:text-lg ${dark ? "text-white/70" : "text-neutral-600"} max-w-2xl`}>{subtitle}</p>}
        </motion.div>
        {children}
      </div>
    </section>
  );
}

function RuleRow({ icon: Icon, ok, text }: { icon: any; ok: boolean; text: string }) {
  return (
    <motion.div variants={fadeUp} className="flex items-start gap-3 p-4 rounded-xl bg-white border border-neutral-200">
      <div className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${ok ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
        <Icon className="w-5 h-5" />
      </div>
      <p className="text-sm text-neutral-700 leading-relaxed pt-1">{text}</p>
    </motion.div>
  );
}

export default function SuperBrasilDesafio10s() {
  return (
    <div className="min-h-screen bg-white">
      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-to-br from-green-800 via-green-700 to-green-900 text-white">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 20% 20%, #fbbf24 0, transparent 40%), radial-gradient(circle at 80% 80%, #fef3c7 0, transparent 40%)" }} />
        <div className="relative max-w-5xl mx-auto px-6 py-20 md:py-28 text-center">
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-4 py-1.5 mb-6">
            <Timer className="w-4 h-4 text-yellow-300" />
            <span className="text-xs uppercase tracking-widest font-semibold">Super Brasil Supermercado</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="text-5xl md:text-7xl font-black leading-[0.95] tracking-tight mb-4"
          >
            Desafio dos<br />
            <span className="text-yellow-300">10 Segundos</span>
          </motion.h1>

          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4, duration: 0.6 }} className="text-lg md:text-xl text-white/90 mb-10 max-w-2xl mx-auto">
            Pare o cronômetro em <span className="font-bold text-yellow-300">10,00s</span> e leve o valor da sua compra em vale-compras.
          </motion.p>

          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.5, duration: 0.7 }}>
            <AnimatedChronometer />
          </motion.div>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }} className="mt-10 grid grid-cols-3 gap-4 max-w-md mx-auto">
            {[
              { v: "R$100", l: "cada" },
              { v: "3", l: "tentativas" },
              { v: "R$1.000", l: "prêmio máx." },
            ].map((s) => (
              <div key={s.l} className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-3">
                <div className="text-2xl md:text-3xl font-black text-yellow-300">{s.v}</div>
                <div className="text-[11px] uppercase tracking-wider text-white/70">{s.l}</div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* COMO PARTICIPAR */}
      <Section title="Como Participar" subtitle="É simples. Compre, apresente o cupom e vá direto para o desafio.">
        <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }} className="grid grid-cols-1 md:grid-cols-4 gap-6 pt-6">
          <StepCard n={1} icon={ShoppingCart} title="Compre R$ 100" text="A cada R$ 100 em compras no período da promoção você garante uma participação." />
          <StepCard n={2} icon={Clock} title="Vá na hora certa" text="Só valem compras feitas no dia e horário oficial divulgado pela organização." />
          <StepCard n={3} icon={ScrollText} title="Apresente o cupom" text="Leve o cupom fiscal ao local da ação imediatamente após o pagamento." />
          <StepCard n={4} icon={Timer} title="Faça o desafio" text="Você terá 3 tentativas consecutivas para parar o cronômetro em 10,00s." />
        </motion.div>
      </Section>

      {/* INFOGRAFICO PREMIOS */}
      <Section
        id="premios"
        dark
        title="A Escala da Precisão"
        subtitle="Quanto mais perto de 10,00s, maior o prêmio. O prêmio máximo só é conquistado na primeira tentativa."
      >
        {/* Régua visual */}
        <div className="relative mb-12 pt-8">
          <div className="relative h-3 bg-neutral-800 rounded-full overflow-hidden">
            <div className="absolute inset-y-0 left-[45%] right-[45%] bg-yellow-400" />
            <div className="absolute inset-y-0 left-[35%] right-[35%] bg-green-500/40 mix-blend-screen" />
            <div className="absolute inset-y-0 left-[25%] right-[25%] bg-blue-600/30 mix-blend-screen" />
          </div>
          <div className="grid grid-cols-5 text-[10px] md:text-xs font-mono text-white/60 mt-2">
            <span>9,90</span>
            <span className="text-center">9,95</span>
            <span className="text-center font-bold text-yellow-300">10,00</span>
            <span className="text-center">10,05</span>
            <span className="text-right">10,10</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <PrizeTier
            icon={Trophy}
            title="Prêmio Principal"
            range="10,00s"
            reward="100% em vale-compras"
            detail="Valor total da compra em vale-compras (até R$ 1.000). Somente na 1ª tentativa. 1 por edição."
            color="from-yellow-400 to-amber-500"
            delay={0}
            emphasis
          />
          <PrizeTier
            icon={Percent}
            title="Segundo Prêmio"
            range="9,96 → 10,05s"
            reward="20% de cashback"
            detail="Vale-compras equivalente a 20% do valor da compra. Válido em qualquer uma das 3 tentativas."
            color="from-green-600 to-green-800"
            delay={0.1}
          />
          <PrizeTier
            icon={Gift}
            title="Terceiro Prêmio"
            range="9,90–9,95s ou 10,06–10,10s"
            reward="10% em vale-compras"
            detail="Vale-compras de 10% do valor da compra. Válido em qualquer uma das 3 tentativas."
            color="from-blue-700 to-blue-900"
            delay={0.2}
          />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
          className="mt-10 flex items-start gap-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-5"
        >
          <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
          <p className="text-sm text-white/80 leading-relaxed">
            <strong className="text-yellow-300">Limite por edição:</strong> após um cliente conquistar o prêmio principal, ele se encerra automaticamente para os demais daquela edição. Os prêmios secundários seguem valendo até o fim do horário divulgado.
          </p>
        </motion.div>
      </Section>

      {/* REGRAS RÁPIDAS */}
      <Section title="O que vale e o que não vale" subtitle="Fique atento a estas regras para garantir sua participação.">
        <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.15 }} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <RuleRow icon={CheckCircle2} ok text="Compras feitas no dia e horário oficiais da promoção." />
          <RuleRow icon={CheckCircle2} ok text="Cliente deve estar presente no local durante o horário da ação." />
          <RuleRow icon={CheckCircle2} ok text="Cada R$ 100 dá direito a uma participação com 3 tentativas." />
          <RuleRow icon={CheckCircle2} ok text="Compras em nota promissória participam normalmente." />
          <RuleRow icon={XCircle} ok={false} text="Cupons emitidos antes ou depois do horário divulgado." />
          <RuleRow icon={XCircle} ok={false} text="Reutilizar o mesmo cupom fiscal em mais de uma participação." />
          <RuleRow icon={XCircle} ok={false} text="Conversão de prêmios em dinheiro — sempre vale-compras." />
          <RuleRow icon={XCircle} ok={false} text="Prêmio principal em 2ª ou 3ª tentativa — só vale na 1ª." />
        </motion.div>
      </Section>

      {/* NOTA PROMISSÓRIA */}
      <Section dark title="Compra na Promissória" subtitle="Você participa normalmente — mas o prêmio segue uma regra.">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { icon: ShoppingCart, t: "Participa", d: "Clientes com nota promissória concorrem em igualdade de condições." },
            { icon: Wallet, t: "Prêmio vinculado", d: "O benefício só é liberado após a quitação integral da promissória." },
            { icon: XCircle, t: "Inadimplência", d: "Atraso, cancelamento ou não pagamento faz perder o direito ao prêmio." },
          ].map((it) => (
            <motion.div
              key={it.t}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="bg-white/5 border border-white/10 rounded-2xl p-6"
            >
              <it.icon className="w-8 h-8 text-yellow-300 mb-3" strokeWidth={1.6} />
              <h3 className="text-lg font-bold text-white mb-1">{it.t}</h3>
              <p className="text-sm text-white/70 leading-relaxed">{it.d}</p>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* DISPOSIÇÕES GERAIS */}
      <Section title="Boas práticas & Uso de imagem">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }} className="rounded-2xl border border-neutral-200 p-6 bg-neutral-50">
            <Camera className="w-8 h-8 text-green-700 mb-3" />
            <h3 className="font-bold text-lg mb-1">Uso de Imagem</h3>
            <p className="text-sm text-neutral-600 leading-relaxed">
              Ao participar, o cliente autoriza o uso de imagem, voz e nome em materiais promocionais do Super Brasil, sem ônus.
            </p>
          </motion.div>
          <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }} className="rounded-2xl border border-neutral-200 p-6 bg-neutral-50">
            <Wallet className="w-8 h-8 text-green-700 mb-3" />
            <h3 className="font-bold text-lg mb-1">Vales-compras</h3>
            <p className="text-sm text-neutral-600 leading-relaxed">
              Pessoais, intransferíveis, não convertidos em dinheiro. Validade informada no momento da entrega.
            </p>
          </motion.div>
        </div>

        <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="mt-8 rounded-2xl bg-neutral-900 text-white p-6 text-sm leading-relaxed">
          <p className="text-white/80">
            A participação implica aceitação total do regulamento. O Super Brasil poderá alterar, suspender ou encerrar a promoção a qualquer momento por motivos operacionais ou estratégicos. Bônus e vantagens extras podem ser concedidos a critério do Super Brasil, sem gerar direito adquirido nem obrigação de repetição. Casos omissos serão decididos exclusivamente pela organização.
          </p>
        </motion.div>
      </Section>

      {/* FOOTER */}
      <footer className="bg-neutral-950 text-white/70 py-12 px-6 border-t border-white/10">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <div className="text-lg font-black text-white">Super Brasil Supermercado</div>
            <div className="text-xs text-white/50 mt-1">CNPJ: 53.349.200/0001-10 · Minaçu, 23 de junho de 2026</div>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-white/40">Regulamento publicado por</span>
            <img src={pulseLogo.url} alt="Pulse Growth Marketing" className="h-6 w-auto opacity-80" />
          </div>
        </div>
      </footer>
    </div>
  );
}
