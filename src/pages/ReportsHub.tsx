import { lazy, Suspense, useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { BarChart3, Palette, XCircle, Share2, ClipboardList, DollarSign } from 'lucide-react';

const Reports = lazy(() => import('./Reports'));
const DesignerReports = lazy(() => import('./DesignerReports'));
const CancellationReports = lazy(() => import('./CancellationReports'));
const SocialMediaDeliveries = lazy(() => import('./SocialMediaDeliveries'));
const DeliveryRecords = lazy(() => import('./DeliveryRecords'));
const CostByContentType = lazy(() => import('./CostByContentType'));

const Loader = () => (
  <div className="flex items-center justify-center py-12">
    <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
  </div>
);

const TABS = [
  { value: 'geral', label: 'Geral', icon: BarChart3, Comp: Reports },
  { value: 'designer', label: 'Produtividade Designer', icon: Palette, Comp: DesignerReports },
  { value: 'custo', label: 'Custo por Conteúdo', icon: DollarSign, Comp: CostByContentType },
  { value: 'entregas-social', label: 'Entregas Social', icon: Share2, Comp: SocialMediaDeliveries },
  { value: 'entregas', label: 'Entregas (Gravações)', icon: ClipboardList, Comp: DeliveryRecords },
  { value: 'cancelamentos', label: 'Cancelamentos', icon: XCircle, Comp: CancellationReports },
];

export default function ReportsHub() {
  const [tab, setTab] = useState('geral');
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-display font-bold">Relatórios</h1>
        <p className="text-sm text-muted-foreground">Central única de monitoramento de produtividade</p>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="w-full h-auto flex-wrap justify-start gap-1 bg-muted/50 p-1">
          {TABS.map(t => (
            <TabsTrigger key={t.value} value={t.value} className="gap-1.5 text-xs sm:text-sm data-[state=active]:bg-background">
              <t.icon size={14} />
              <span className="hidden sm:inline">{t.label}</span>
              <span className="sm:hidden">{t.label.split(' ')[0]}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {TABS.map(t => (
          <TabsContent key={t.value} value={t.value} className="mt-4">
            <Suspense fallback={<Loader />}>
              {tab === t.value && <t.Comp />}
            </Suspense>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
