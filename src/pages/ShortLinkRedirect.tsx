import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import pulseLogo from "@/assets/pulse-logo.png";

export default function ShortLinkRedirect() {
  const { slug } = useParams<{ slug: string }>();
  const [status, setStatus] = useState<"loading" | "notfound">("loading");

  useEffect(() => {
    let cancelled = false;
    async function go() {
      if (!slug) return;
      const { data } = await supabase
        .from("short_links")
        .select("id, original_url, active")
        .eq("slug", slug)
        .maybeSingle();

      if (cancelled) return;
      if (!data || !data.active) {
        setStatus("notfound");
        return;
      }

      // Log click (fire-and-forget)
      supabase.from("short_link_clicks").insert({
        short_link_id: data.id,
        user_agent: navigator.userAgent,
        referrer: document.referrer || null,
      }).then(() => {});

      // Show splash, then redirect
      setTimeout(() => {
        window.location.replace(data.original_url);
      }, 1400);
    }
    go();
    return () => { cancelled = true; };
  }, [slug]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/10">
      <div className="flex flex-col items-center gap-6 px-6 text-center">
        <img
          src={pulseLogo}
          alt="Pulse Growth Marketing"
          className="w-44 h-auto animate-pulse drop-shadow-lg"
        />
        {status === "loading" ? (
          <>
            <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">Redirecionando...</p>
          </>
        ) : (
          <p className="text-base text-destructive font-medium">Link inválido ou expirado.</p>
        )}
      </div>
    </div>
  );
}
