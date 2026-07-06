import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCity } from "@/contexts/CityContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Copy, Trash2, ScrollText, Pencil, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

type Regulation = {
  id: string;
  slug: string;
  title: string;
  client_name: string;
  content: string | null;
  external_url: string | null;
  active: boolean;
  city: string;
  created_at: string;
};

type ClickRow = { regulation_id: string };

function randomSlug(len = 6) {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export default function Regulations() {
  const { user } = useAuth();
  const { activeCity } = useCity() as any;
  const [rows, setRows] = useState<Regulation[]>([]);
  const [clicks, setClicks] = useState<ClickRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [editing, setEditing] = useState<Regulation | null>(null);
  const [open, setOpen] = useState(false);

  // form state
  const [title, setTitle] = useState("");
  const [clientName, setClientName] = useState("");
  const [customSlug, setCustomSlug] = useState("");
  const [content, setContent] = useState("");
  const [externalUrl, setExternalUrl] = useState("");

  const baseUrl = `${window.location.origin}/regulamento/`;

  async function load() {
    setLoading(true);
    const { data: regs } = await supabase
      .from("regulations")
      .select("*")
      .order("created_at", { ascending: false });
    const { data: cs } = await supabase
      .from("regulation_clicks")
      .select("regulation_id");
    setRows((regs as Regulation[]) || []);
    setClicks((cs as ClickRow[]) || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const clicksByReg = useMemo(() => {
    const m: Record<string, number> = {};
    clicks.forEach((c) => { m[c.regulation_id] = (m[c.regulation_id] || 0) + 1; });
    return m;
  }, [clicks]);

  const totalClicks = clicks.length;
  const activeCount = rows.filter((r) => r.active).length;

  function openNew() {
    setEditing(null);
    setTitle(""); setClientName(""); setCustomSlug("");
    setContent(""); setExternalUrl("");
    setOpen(true);
  }

  function openEdit(r: Regulation) {
    setEditing(r);
    setTitle(r.title);
    setClientName(r.client_name);
    setCustomSlug(r.slug);
    setContent(r.content || "");
    setExternalUrl(r.external_url || "");
    setOpen(true);
  }

  async function save() {
    if (!title.trim() || !clientName.trim()) {
      toast.error("Preencha título e cliente");
      return;
    }
    if (!content.trim() && !externalUrl.trim()) {
      toast.error("Informe o conteúdo do regulamento ou uma URL externa");
      return;
    }
    if (externalUrl.trim()) {
      try { new URL(externalUrl); } catch { toast.error("URL externa inválida (inclua https://)"); return; }
    }
    const slug = (customSlug.trim() || randomSlug()).toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!slug) { toast.error("Slug inválido"); return; }

    if (editing) {
      const { error } = await supabase.from("regulations").update({
        title: title.trim(),
        client_name: clientName.trim(),
        slug,
        content: content.trim() || null,
        external_url: externalUrl.trim() || null,
      }).eq("id", editing.id);
      if (error) { toast.error(error.message.includes("duplicate") ? "Slug já existe" : error.message); return; }
      toast.success("Regulamento atualizado!");
    } else {
      const { error } = await supabase.from("regulations").insert({
        slug,
        title: title.trim(),
        client_name: clientName.trim(),
        content: content.trim() || null,
        external_url: externalUrl.trim() || null,
        created_by: user?.id,
        city: activeCity || "minacu",
      });
      if (error) { toast.error(error.message.includes("duplicate") ? "Slug já existe" : error.message); return; }
      toast.success("Regulamento criado!");
    }
    setOpen(false);
    load();
  }

  async function toggleActive(r: Regulation) {
    await supabase.from("regulations").update({ active: !r.active }).eq("id", r.id);
    load();
  }

  async function deleteReg(id: string) {
    if (!confirm("Apagar este regulamento e seus cliques?")) return;
    await supabase.from("regulations").delete().eq("id", id);
    toast.success("Apagado");
    load();
  }

  function copyLink(slug: string) {
    navigator.clipboard.writeText(baseUrl + slug);
    toast.success("Link copiado!");
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <ScrollText className="w-7 h-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Regulamentos</h1>
            <p className="text-sm text-muted-foreground">Publique regulamentos de clientes e acompanhe os acessos</p>
          </div>
        </div>
        <Button onClick={openNew}>Novo Regulamento</Button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="text-3xl font-bold">{rows.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Ativos</p>
          <p className="text-3xl font-bold text-primary">{activeCount}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Acessos totais</p>
          <p className="text-3xl font-bold text-emerald-500">{totalClicks}</p>
        </Card>
      </div>

      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Título</TableHead>
              <TableHead>Link Público</TableHead>
              <TableHead className="text-center">Acessos</TableHead>
              <TableHead className="hidden md:table-cell">Criado</TableHead>
              <TableHead className="text-center">Ativo</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">Carregando...</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">Nenhum regulamento ainda.</TableCell></TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.client_name}</TableCell>
                <TableCell className="text-sm">{r.title}</TableCell>
                <TableCell>
                  <button onClick={() => copyLink(r.slug)} className="text-primary hover:underline flex items-center gap-1 text-sm">
                    /regulamento/{r.slug} <Copy className="w-3 h-3" />
                  </button>
                </TableCell>
                <TableCell className="text-center font-bold">{clicksByReg[r.id] || 0}</TableCell>
                <TableCell className="hidden md:table-cell text-xs">{format(new Date(r.created_at), "dd/MM/yy HH:mm")}</TableCell>
                <TableCell className="text-center">
                  <Switch checked={r.active} onCheckedChange={() => toggleActive(r)} />
                </TableCell>
                <TableCell className="flex gap-1 justify-end">
                  <Button size="icon" variant="ghost" asChild>
                    <a href={baseUrl + r.slug} target="_blank" rel="noreferrer" aria-label="Abrir">
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => openEdit(r)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => deleteReg(r.id)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Regulamento" : "Novo Regulamento"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Cliente</Label>
                <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Ex: Super Brasil" />
              </div>
              <div>
                <Label>Título</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Regulamento Promoção Aniversário" />
              </div>
            </div>
            <div>
              <Label>Slug (URL)</Label>
              <Input value={customSlug} onChange={(e) => setCustomSlug(e.target.value)} placeholder="ex: super-brasil-aniversario" />
              <p className="text-[11px] text-muted-foreground mt-1">Link final: {baseUrl}{customSlug || "auto"}</p>
            </div>
            <div>
              <Label>URL Externa (opcional)</Label>
              <Input value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)} placeholder="https://... (se preenchido, redireciona)" />
            </div>
            <div>
              <Label>Conteúdo do Regulamento</Label>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Cole aqui o texto completo do regulamento..."
                rows={12}
              />
              <p className="text-[11px] text-muted-foreground mt-1">Se preencher a URL externa acima, o link redireciona ao invés de exibir o texto.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save}>{editing ? "Salvar" : "Criar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
