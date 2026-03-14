import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useApp } from '@/contexts/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Link2, Save, X, RefreshCw } from 'lucide-react';

interface IntegrationSettings {
  id?: string;
  client_id: string;
  meta_access_token: string | null;
  instagram_business_id: string | null;
}

export default function IntegrationSettings() {
  const { user } = useAuth();
  const { clients } = useApp();
  
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [settings, setSettings] = useState<IntegrationSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [token, setToken] = useState('');
  const [igId, setIgId] = useState('');

  // Only admins or social media should access this page normally, but we ensure it works safely
  useEffect(() => {
    if (selectedClientId) {
      fetchSettings(selectedClientId);
    } else {
      setSettings(null);
      setToken('');
      setIgId('');
    }
  }, [selectedClientId]);

  const fetchSettings = async (clientId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('integration_settings')
        .select('*')
        .eq('client_id', clientId)
        .maybeSingle();
        
      if (error) throw error;
      
      if (data) {
        setSettings(data as IntegrationSettings);
        setToken(data.meta_access_token || '');
        setIgId(data.instagram_business_id || '');
      } else {
        setSettings({ client_id: clientId, meta_access_token: null, instagram_business_id: null });
        setToken('');
        setIgId('');
      }
    } catch (error: any) {
      toast.error('Erro ao carregar integrações do cliente: ' + (error.message || ''));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedClientId) {
      toast.error('Selecione um cliente primeiro');
      return;
    }
    
    setSaving(true);
    try {
      const payload = {
        client_id: selectedClientId,
        meta_access_token: token || null,
        instagram_business_id: igId || null,
        updated_at: new Date().toISOString()
      };
      
      let error;
      if (settings?.id) {
        // Update existing
        const res = await supabase.from('integration_settings').update(payload).eq('id', settings.id);
        error = res.error;
      } else {
        // Insert new
        const res = await supabase.from('integration_settings').insert(payload);
        error = res.error;
      }
      
      if (error) throw error;
      
      toast.success('Configurações de integração salvas com sucesso!');
      fetchSettings(selectedClientId);
    } catch (error: any) {
      toast.error('Erro ao salvar integrações: ' + (error.message || ''));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Integrações</h1>
          <p className="text-muted-foreground mt-2">
            Configure chaves de API e tokens de acesso para automação de postagens.
          </p>
        </div>
      </div>

      <Card className="border-border">
        <CardHeader>
          <CardTitle>Cliente</CardTitle>
          <CardDescription>
            Selecione o cliente para configurar suas integrações exclusivas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-md">
            <Label className="mb-2 block">Selecionar Cliente</Label>
            <Select value={selectedClientId} onValueChange={setSelectedClientId}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha um cliente..." />
              </SelectTrigger>
              <SelectContent>
                {clients.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {selectedClientId && (
        <Card className="border-border relative overflow-hidden">
          {loading && (
            <div className="absolute inset-0 z-10 bg-background/50 flex items-center justify-center backdrop-blur-sm">
              <RefreshCw className="h-6 w-6 animate-spin text-primary" />
            </div>
          )}
          
          <CardHeader className="bg-muted/30 border-b border-border pl-8 relative">
            <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-blue-500 to-purple-500" />
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                <Link2 size={24} />
              </div>
              <div>
                <CardTitle>Meta Graph API (Instagram & Facebook)</CardTitle>
                <CardDescription>
                  Credenciais necessárias para o Planner publicar ou agendar posts automaticamente.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          
          <CardContent className="p-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="accessToken" className="flex items-center gap-2">
                User Access Token (Long-Lived)
              </Label>
              <Input 
                id="accessToken" 
                type="password" 
                placeholder="EAAI..." 
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Gere um token de acesso de usuário com duração estendida no Meta for Developers, garantindo as permissões de `pages_manage_posts`, `pages_read_engagement`, `instagram_basic` e `instagram_content_publish`.
              </p>
            </div>
            
            <div className="space-y-2 pt-2">
              <Label htmlFor="igId">Instagram Business Account ID</Label>
              <Input 
                id="igId" 
                placeholder="178414..." 
                value={igId}
                onChange={(e) => setIgId(e.target.value)}
                className="font-mono max-w-md"
              />
              <p className="text-xs text-muted-foreground">
                O ID numérico da conta comercial do Instagram conectada à página do Facebook correspondente.
              </p>
            </div>
          </CardContent>
          <CardFooter className="bg-muted/30 border-t border-border flex justify-end gap-3 p-4">
            <Button variant="outline" onClick={() => { setToken(settings?.meta_access_token || ''); setIgId(settings?.instagram_business_id || ''); }}>
              <X size={16} className="mr-2" /> Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <RefreshCw size={16} className="mr-2 animate-spin" /> : <Save size={16} className="mr-2" />}
              Salvar Configurações
            </Button>
          </CardFooter>
        </Card>
      )}
      
      {!selectedClientId && (
        <div className="p-8 text-center text-muted-foreground border border-dashed rounded-lg border-border bg-muted/10">
          <Link2 size={32} className="mx-auto mb-3 opacity-20" />
          <p>Selecione um cliente acima para visualizar e gerenciar suas integrações.</p>
        </div>
      )}
    </div>
  );
}
