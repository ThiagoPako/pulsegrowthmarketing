import { useState, useRef } from 'react';
import { useApp } from '@/contexts/AppContext';
import { ROLE_LABELS } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Camera, Save } from 'lucide-react';
import { toast } from 'sonner';

export default function ProfileDialog({ children }: { children: React.ReactNode }) {
  const { currentUser, updateUser } = useApp();
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState(currentUser?.displayName || currentUser?.name || '');
  const [jobTitle, setJobTitle] = useState(currentUser?.jobTitle || '');
  const [avatarUrl, setAvatarUrl] = useState(currentUser?.avatarUrl || '');
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!currentUser) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('A imagem deve ter no máximo 2MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setAvatarUrl(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    updateUser({
      ...currentUser,
      displayName,
      jobTitle,
      avatarUrl,
    });
    toast.success('Perfil atualizado!');
    setOpen(false);
  };

  const initials = (displayName || currentUser.name)
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <Dialog open={open} onOpenChange={(v) => {
      setOpen(v);
      if (v) {
        setDisplayName(currentUser.displayName || currentUser.name);
        setJobTitle(currentUser.jobTitle || '');
        setAvatarUrl(currentUser.avatarUrl || '');
      }
    }}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Meu Perfil</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-4">
          {/* Avatar upload */}
          <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
            <Avatar className="w-24 h-24 border-2 border-border">
              {avatarUrl ? (
                <AvatarImage src={avatarUrl} alt="Avatar" />
              ) : null}
              <AvatarFallback className="text-2xl font-bold bg-primary text-primary-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Camera className="text-white" size={24} />
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
          <p className="text-xs text-muted-foreground">Clique para alterar a foto</p>

          {/* Info */}
          <div className="w-full space-y-3">
            <div className="space-y-1.5">
              <Label>Nome de exibição</Label>
              <Input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Seu nome" />
            </div>
            <div className="space-y-1.5">
              <Label>Cargo / Função</Label>
              <Input value={jobTitle} onChange={e => setJobTitle(e.target.value)} placeholder="Ex: Diretor Criativo" />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={currentUser.email} disabled className="opacity-60" />
            </div>
            <div className="space-y-1.5">
              <Label>Perfil no sistema</Label>
              <Input value={ROLE_LABELS[currentUser.role]} disabled className="opacity-60" />
            </div>
          </div>

          <Button onClick={handleSave} className="w-full gap-2 mt-2">
            <Save size={16} /> Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
