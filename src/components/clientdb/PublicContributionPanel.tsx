import { useRef, useState, type ComponentProps } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2, ImagePlus, UserPlus, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ContributionTarget {
  id: string;
  label: string;
  kind: 'professional' | 'unit' | 'collaborator';
}

export interface PublicContributionPanelProps extends ComponentProps<'section'> {
  /** Token público do compartilhamento. */
  token: string;
  /** Base da API da VPS. */
  apiBase: string;
  /** Profissionais e unidades disponíveis para receber mídias. */
  targets: ContributionTarget[];
  /** Recarrega os dados após uma contribuição bem-sucedida. */
  onContributed: () => void;
}

/**
 * Painel append-only: o cliente só pode ADICIONAR profissionais e imagens.
 * Nenhuma ação de edição ou exclusão é exposta — por decisão de produto,
 * a remoção fica restrita à equipe autenticada.
 */
export default function PublicContributionPanel({
  token, apiBase, targets, onContributed, className, ...rest
}: PublicContributionPanelProps) {
  const [name, setName] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [councilNumber, setCouncilNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [savingPro, setSavingPro] = useState(false);
  const [entryKind, setEntryKind] = useState<'professional' | 'collaborator'>('professional');

  const [collabName, setCollabName] = useState('');
  const [collabRole, setCollabRole] = useState('');
  const [collabDepartment, setCollabDepartment] = useState('');
  const [collabBirthday, setCollabBirthday] = useState('');
  const [collabPhone, setCollabPhone] = useState('');
  const [collabNotes, setCollabNotes] = useState('');
  const [savingCollab, setSavingCollab] = useState(false);

  const [targetKey, setTargetKey] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleCreateProfessional() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Informe o nome do profissional.');
      return;
    }
    setSavingPro(true);
    try {
      const response = await fetch(`${apiBase}/public/client-database/${encodeURIComponent(token)}/professionals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmed,
          specialty: specialty.trim(),
          council_number: councilNumber.trim(),
          phone: phone.trim(),
          bio: bio.trim(),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'Falha ao cadastrar profissional.');
      toast.success('Profissional adicionado com sucesso!');
      setName(''); setSpecialty(''); setCouncilNumber(''); setPhone(''); setBio('');
      onContributed();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao cadastrar profissional.');
    } finally {
      setSavingPro(false);
    }
  }

  async function handleCreateCollaborator() {
    const trimmed = collabName.trim();
    if (!trimmed) {
      toast.error('Informe o nome do colaborador.');
      return;
    }
    setSavingCollab(true);
    try {
      const response = await fetch(`${apiBase}/public/client-database/${encodeURIComponent(token)}/collaborators`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmed,
          job_role: collabRole.trim(),
          department: collabDepartment.trim(),
          birthday: collabBirthday,
          phone: collabPhone.trim(),
          notes: collabNotes.trim(),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'Falha ao cadastrar colaborador.');
      toast.success('Colaborador adicionado! Agora envie a foto dele abaixo.');
      setCollabName(''); setCollabRole(''); setCollabDepartment('');
      setCollabBirthday(''); setCollabPhone(''); setCollabNotes('');
      onContributed();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao cadastrar colaborador.');
    } finally {
      setSavingCollab(false);
    }
  }

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (!targetKey) {
      toast.error('Escolha o profissional ou unidade de destino.');
      return;
    }
    const [kind, id] = targetKey.split(':') as ['professional' | 'unit', string];
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append('folder', 'client-database');
        form.append('file', file);
        const uploadResponse = await fetch(
          `${apiBase}/public/client-database/${encodeURIComponent(token)}/upload`,
          { method: 'POST', body: form },
        );
        const uploadPayload = await uploadResponse.json().catch(() => ({}));
        if (!uploadResponse.ok) throw new Error(uploadPayload?.error || 'Falha no envio do arquivo.');
        urls.push(uploadPayload.url);
      }

      const mediaType = Array.from(files).every((file) => file.type.startsWith('video/')) ? 'videos' : 'photos';
      const attachResponse = await fetch(
        `${apiBase}/public/client-database/${encodeURIComponent(token)}/media`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind, id, urls, mediaType }),
        },
      );
      const attachPayload = await attachResponse.json().catch(() => ({}));
      if (!attachResponse.ok) throw new Error(attachPayload?.error || 'Falha ao anexar as mídias.');

      toast.success(`${urls.length} arquivo(s) adicionado(s).`);
      onContributed();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao enviar arquivos.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <section className={cn('grid gap-4 md:grid-cols-2', className)} {...rest}>
      <Card className="space-y-3 p-5">
        <div className="flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-primary" />
          <h2 className="font-display text-base font-bold">Cadastrar pessoa</h2>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <Button
            type="button"
            size="sm"
            variant={entryKind === 'professional' ? 'default' : 'outline'}
            onClick={() => setEntryKind('professional')}
          >
            Profissional
          </Button>
          <Button
            type="button"
            size="sm"
            variant={entryKind === 'collaborator' ? 'default' : 'outline'}
            onClick={() => setEntryKind('collaborator')}
          >
            Colaborador
          </Button>
        </div>

        {entryKind === 'collaborator' ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="col-name">Nome *</Label>
              <Input id="col-name" value={collabName} onChange={(e) => setCollabName(e.target.value)} placeholder="Maria Silva" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="col-role">Cargo / função</Label>
                <Input id="col-role" value={collabRole} onChange={(e) => setCollabRole(e.target.value)} placeholder="Atendente" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="col-dep">Setor</Label>
                <Input id="col-dep" value={collabDepartment} onChange={(e) => setCollabDepartment(e.target.value)} placeholder="Recepção" />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="col-birthday">Data de aniversário</Label>
                <Input id="col-birthday" type="date" value={collabBirthday} onChange={(e) => setCollabBirthday(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="col-phone">WhatsApp</Label>
                <Input id="col-phone" value={collabPhone} onChange={(e) => setCollabPhone(e.target.value)} placeholder="(62) 90000-0000" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="col-notes">Observações</Label>
              <Textarea id="col-notes" rows={3} value={collabNotes} onChange={(e) => setCollabNotes(e.target.value)} placeholder="Apelido, cores preferidas, frase..." />
            </div>
            <Button onClick={handleCreateCollaborator} disabled={savingCollab} className="w-full">
              {savingCollab ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
              Adicionar colaborador
            </Button>
          </>
        ) : (
        <>
        <div className="space-y-1.5">
          <Label htmlFor="pro-name">Nome *</Label>
          <Input id="pro-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Dr. João Silva" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="pro-specialty">Especialidade</Label>
            <Input id="pro-specialty" value={specialty} onChange={(e) => setSpecialty(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pro-council">Registro / CRM</Label>
            <Input id="pro-council" value={councilNumber} onChange={(e) => setCouncilNumber(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pro-phone">WhatsApp</Label>
          <Input id="pro-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(62) 90000-0000" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pro-bio">Observações</Label>
          <Textarea id="pro-bio" rows={3} value={bio} onChange={(e) => setBio(e.target.value)} />
        </div>
        <Button onClick={handleCreateProfessional} disabled={savingPro} className="w-full">
          {savingPro ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
          Adicionar profissional
        </Button>
        </>
        )}
      </Card>

      <Card className="space-y-3 p-5">
        <div className="flex items-center gap-2">
          <ImagePlus className="h-4 w-4 text-primary" />
          <h2 className="font-display text-base font-bold">Enviar imagens e vídeos</h2>
        </div>
        <div className="space-y-1.5">
          <Label>Destino</Label>
          <Select value={targetKey} onValueChange={setTargetKey}>
            <SelectTrigger><SelectValue placeholder="Escolha a pessoa ou unidade" /></SelectTrigger>
            <SelectContent>
              {targets.map((target) => (
                <SelectItem key={`${target.kind}:${target.id}`} value={`${target.kind}:${target.id}`}>
                  {target.kind === 'unit' ? 'Unidade — ' : target.kind === 'collaborator' ? 'Colaborador — ' : 'Profissional — '}{target.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/*,video/*"
          className="hidden"
          onChange={(event) => handleUpload(event.target.files)}
        />
        <Button
          variant="secondary"
          className="w-full"
          disabled={uploading || !targetKey}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-2 h-4 w-4" />}
          Selecionar arquivos
        </Button>
        <p className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          Este link permite apenas adicionar informações. Nada que já está cadastrado pode ser alterado ou excluído por aqui.
        </p>
      </Card>
    </section>
  );
}
