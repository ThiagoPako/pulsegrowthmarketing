import { useEffect, useState, lazy, Suspense } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/lib/vpsDb";

const pulseLogo = { url: "/pulse-logo.png" };

const CUSTOM_TEMPLATES: Record<string, React.LazyExoticComponent<React.ComponentType<any>>> = {
  "super-brasil-desafio-10s": lazy(() => import("@/pages/regulations/SuperBrasilDesafio10s")),
};

type Regulation = {
  id: string;
  title: string;
  client_name: string;
  content: string | null;
  external_url: string | null;
  active: boolean;
};

export default function RegulationRedirect() {
  const { slug } = useParams<{ slug: string }>();
  const [status, setStatus] = useState<"loading" | "notfound" | "content" | "custom">("loading");
  const [reg, setReg] = useState<Regulation | null>(null);
  const [CustomTpl, setCustomTpl] = useState<React.LazyExoticComponent<React.ComponentType<any>> | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function go() {
      if (!slug) return;
      const { data } = await supabase
        .from("regulations")
        .select("id, title, client_name, content, external_url, active")
        .eq("slug", slug)
        .maybeSingle();

      if (cancelled) return;
      if (!data || !data.active) {
        setStatus("notfound");
        return;
      }

      // Log click (fire-and-forget)
      supabase.from("regulation_clicks").insert({
        regulation_id: data.id,
        user_agent: navigator.userAgent,
        referrer: document.referrer || null,
      }).then(() => {});

      if (data.external_url) {
        setTimeout(() => {
          window.location.replace(data.external_url as string);
        }, 1400);
      } else {
        const tpl = slug ? CUSTOM_TEMPLATES[slug] : undefined;
        setTimeout(() => {
          setReg(data as Regulation);
          if (tpl) {
            setCustomTpl(() => tpl);
            setStatus("custom");
          } else {
            setStatus("content");
          }
        }, 1400);
      }
    }
    go();
    return () => { cancelled = true; };
  }, [slug]);

  if (status === "custom" && CustomTpl) {
    return (
      <Suspense fallback={
        <div className="min-h-screen flex items-center justify-center bg-black">
          <img src={pulseLogo.url} alt="Pulse" className="w-40 animate-pulse" />
        </div>
      }>
        <CustomTpl />
      </Suspense>
    );
  }

  if (status === "content" && reg) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b bg-card">
          <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-3">
            <img src={pulseLogo.url} alt="Pulse" className="h-8 w-auto" />
            <div>
              <h1 className="text-lg font-bold leading-tight">{reg.title}</h1>
              <p className="text-xs text-muted-foreground">{reg.client_name}</p>
            </div>
          </div>
        </header>
        <main className="max-w-3xl mx-auto px-6 py-8">
          <article
            className="prose prose-sm md:prose-base max-w-none whitespace-pre-wrap text-foreground"
            style={{ lineHeight: 1.65 }}
          >
            {reg.content}
          </article>
          <footer className="mt-12 pt-6 border-t text-center text-xs text-muted-foreground">
            Regulamento disponibilizado por <span className="font-semibold">Pulse Growth Marketing</span>
          </footer>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="flex flex-col items-center gap-6 px-6 text-center">
        <img
          src={pulseLogo.url}
          alt="Pulse Growth Marketing"
          className="w-56 h-auto animate-pulse drop-shadow-[0_0_30px_rgba(234,88,12,0.5)]"
          style={{ animationDuration: "1.2s" }}
        />
        {status === "loading" ? (
          <div className="w-8 h-8 border-4 border-white/20 border-t-primary rounded-full animate-spin" />
        ) : (
          <p className="text-base text-destructive font-medium">Regulamento não encontrado ou inativo.</p>
        )}
      </div>
    </div>
  );
}
