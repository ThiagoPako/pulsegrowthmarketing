import { useEffect, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const NEW_BUILD_EVENT = "pulse:new-build";

/**
 * Aviso discreto de nova versão. Nunca recarrega sozinho — o usuário decide,
 * evitando perder um roteiro ou uma edição em andamento.
 */
export function UpdateAvailableBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onNewBuild = () => setVisible(true);
    window.addEventListener(NEW_BUILD_EVENT, onNewBuild);
    return () => window.removeEventListener(NEW_BUILD_EVENT, onNewBuild);
  }, []);

  if (!visible) return null;

  const reload = async () => {
    try {
      if ("caches" in window) {
        const keys = await window.caches.keys();
        await Promise.all(keys.map((key) => window.caches.delete(key)));
      }
    } catch {
      /* ignora */
    }
    window.location.reload();
  };

  return (
    <div className="fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-lg">
      <span className="text-sm text-foreground">
        Nova versão disponível. Salve seu trabalho antes de atualizar.
      </span>
      <Button size="sm" onClick={reload}>
        <RefreshCw className="mr-2 h-4 w-4" />
        Atualizar
      </Button>
      <button
        type="button"
        aria-label="Dispensar aviso de atualização"
        onClick={() => setVisible(false)}
        className="text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export default UpdateAvailableBanner;
