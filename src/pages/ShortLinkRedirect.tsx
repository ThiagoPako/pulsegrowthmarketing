import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { isSafeRedirectUrl } from "@/lib/safeUrl";
const pulseLogo = { url: "/pulse-logo.png" };
const API_BASE = "https://agenciapulse.tech";

export default function ShortLinkRedirect() {
  const { slug } = useParams<{ slug: string }>();
  const [status, setStatus] = useState<"loading" | "notfound">("loading");

  useEffect(() => {
    let cancelled = false;
    async function go() {
      if (!slug) return;
      // Rota pública (sem login): devolve o destino do link ativo e conta o clique.
      let originalUrl: string | null = null;
      try {
        const response = await fetch(`${API_BASE}/api/public/short-links/${encodeURIComponent(slug)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ referrer: document.referrer || null }),
        });
        const payload = response.ok ? await response.json().catch(() => null) : null;
        originalUrl = payload?.original_url ?? null;
      } catch {
        originalUrl = null;
      }

      if (cancelled) return;
      if (!isSafeRedirectUrl(originalUrl)) {
        setStatus("notfound");
        return;
      }

      // Show splash, then redirect
      setTimeout(() => {
        window.location.replace(originalUrl as string);
      }, 1400);
    }
    go();
    return () => { cancelled = true; };
  }, [slug]);

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
          <p className="text-base text-destructive font-medium">Link não encontrado ou desativado.</p>
        )}
      </div>
    </div>
  );
}
