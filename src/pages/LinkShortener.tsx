import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCity } from "@/contexts/CityContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Copy, Trash2, Link2, BarChart3, Calendar } from "lucide-react";
import { toast } from "sonner";
import { format, subDays, startOfDay } from "date-fns";

type ShortLink = {
  id: string;
  slug: string;
  original_url: string;
  campaign_name: string;
  active: boolean;
  created_at: string;
  city: string;
};

type ClickRow = { short_link_id: string; clicked_at: string };

function randomSlug(len = 6) {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export default function LinkShortener() {
  const { user } = useAuth();
  const { activeCity } = useCity() as any;
  const [links, setLinks] = useState<ShortLink[]>([]);
  const [clicks, setClicks] = useState<ClickRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [campaign, setCampaign] = useState("");
  const [url, setUrl] = useState("");
  const [customSlug, setCustomSlug] = useState("");

  const [fromDate, setFromDate] = useState<string>(format(subDays(new Date(), 7), "yyyy-MM-dd"));
  const [toDate, setToDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));

  const baseUrl = `${window.location.origin}/r/`;

  async function load() {
    setLoading(true);
    const { data: linksData } = await supabase
      .from("short_links")
      .select("*")
      .order("created_at", { ascending: false });
    const { data: clicksData } = await supabase
      .from("short_link_clicks")
      .select("short_link_id, clicked_at")
      .gte("clicked_at", `${fromDate}T00:00:00`)
      .lte("clicked_at", `${toDate}T23:59:59`);
    setLinks((linksData as ShortLink[]) || []);
    setClicks((clicksData as ClickRow[]) || []);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [fromDate, toDate]);

  const clicksByLink = useMemo(() => {
    const m: Record<string, number> = {};
    clicks.forEach((c) => { m[c.short_link_id] = (m[c.short_link_id] || 0) + 1; });
    return m;
  }, [clicks]);

  const clicksByDay = useMemo(() => {
    const m: Record<string, number> = {};
    clicks.forEach((c) => {
      const d = format(startOfDay(new Date(c.clicked_at)), "yyyy-MM-dd");
      m[d] = (m[d] || 0) + 1;
    });
    return Object.entries(m).sort(([a], [b]) => a.localeCompare(b));
  }, [clicks]);

  const totalClicks = clicks.length;
  const activeLinks = links.filter((l) => l.active).length;

  async function createLink() {
    if (!campaign.trim() || !url.trim()) {
      toast.error("Preencha campanha e URL");
      return;
    }
    try {
      new URL(url);
    } catch {
      toast.error("URL inválida (inclua https://)");
      return;
    }
    const slug = (customSlug.trim() || randomSlug()).toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!slug) { toast.error("Slug inválido"); return; }

    const { error } = await supabase.from("short_links").insert({
      slug,
      original_url: url.trim(),
      campaign_name: campaign.trim(),
      created_by: user?.id,
      city: activeCity || "minacu",
    });
    if (error) {
      toast.error(error.message.includes("duplicate") ? "Slug já existe" : error.message);
      return;
    }
    toast.success("Link criado!");
    setCampaign(""); setUrl(""); setCustomSlug("");
    load();
  }

  async function toggleActive(link: ShortLink) {
    await supabase.from("short_links").update({ active: !link.active }).eq("id", link.id);
    load();
  }

  async function deleteLink(id: string) {
    if (!confirm("Apagar este link e seus cliques?")) return;
    await supabase.from("short_links").delete().eq("id", id);
    toast.success("Apagado");
    load();
  }

  function copyLink(slug: string) {
    navigator.clipboard.writeText(baseUrl + slug);
    toast.success("Link copiado!");
  }

  const maxDay = Math.max(1, ...clicksByDay.map(([, v]) => v));

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <Link2 className="w-7 h-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Encurtador de Links</h1>
          <p className="text-sm text-muted-foreground">Gere links curtos com métricas por campanha</p>
        </div>
      </header>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Total de Links</p>
          <p className="text-3xl font-bold">{links.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Links Ativos</p>
          <p className="text-3xl font-bold text-primary">{activeLinks}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Cliques no período</p>
          <p className="text-3xl font-bold text-emerald-500">{totalClicks}</p>
        </Card>
      </div>

      {/* Criar */}
      <Card className="p-5 space-y-4">
        <h2 className="font-semibold flex items-center gap-2"><Link2 className="w-4 h-4" /> Novo Link</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-1">
            <Label>Campanha</Label>
            <Input value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="Ex: Black Friday 2026" />
          </div>
          <div className="md:col-span-2">
            <Label>URL original</Label>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
          </div>
          <div>
            <Label>Slug (opcional)</Label>
            <Input value={customSlug} onChange={(e) => setCustomSlug(e.target.value)} placeholder="auto" />
          </div>
        </div>
        <Button onClick={createLink}>Encurtar</Button>
      </Card>

      {/* Filtros + gráfico de cliques por dia */}
      <Card className="p-5 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <h2 className="font-semibold flex items-center gap-2 mr-auto"><BarChart3 className="w-4 h-4" /> Cliques por Dia</h2>
          <div>
            <Label className="text-xs"><Calendar className="w-3 h-3 inline mr-1" /> De</Label>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-40" />
          </div>
          <div>
            <Label className="text-xs">Até</Label>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-40" />
          </div>
        </div>

        {clicksByDay.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Sem cliques no período selecionado.</p>
        ) : (
          <div className="flex items-end gap-2 h-40 overflow-x-auto">
            {clicksByDay.map(([day, count]) => (
              <div key={day} className="flex flex-col items-center gap-1 min-w-[44px]">
                <span className="text-xs font-medium">{count}</span>
                <div
                  className="w-8 bg-primary rounded-t transition-all"
                  style={{ height: `${(count / maxDay) * 100}%`, minHeight: 4 }}
                />
                <span className="text-[10px] text-muted-foreground">{format(new Date(day + "T12:00"), "dd/MM")}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Tabela */}
      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Campanha</TableHead>
              <TableHead>Link Curto</TableHead>
              <TableHead className="hidden md:table-cell">Destino</TableHead>
              <TableHead className="text-center">Cliques</TableHead>
              <TableHead className="hidden md:table-cell">Criado</TableHead>
              <TableHead className="text-center">Ativo</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">Carregando...</TableCell></TableRow>
            ) : links.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">Nenhum link ainda.</TableCell></TableRow>
            ) : links.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="font-medium">{l.campaign_name}</TableCell>
                <TableCell>
                  <button onClick={() => copyLink(l.slug)} className="text-primary hover:underline flex items-center gap-1 text-sm">
                    /r/{l.slug} <Copy className="w-3 h-3" />
                  </button>
                </TableCell>
                <TableCell className="hidden md:table-cell text-xs text-muted-foreground max-w-[260px] truncate">{l.original_url}</TableCell>
                <TableCell className="text-center font-bold">{clicksByLink[l.id] || 0}</TableCell>
                <TableCell className="hidden md:table-cell text-xs">{format(new Date(l.created_at), "dd/MM/yy HH:mm")}</TableCell>
                <TableCell className="text-center">
                  <Switch checked={l.active} onCheckedChange={() => toggleActive(l)} />
                </TableCell>
                <TableCell>
                  <Button size="icon" variant="ghost" onClick={() => deleteLink(l.id)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
