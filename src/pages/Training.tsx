
import { useAuth } from '@/hooks/useAuth';
import TrainingModuleView from '@/components/training/TrainingModuleView';

export default function TrainingPage() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-[#141414]">
      <TrainingModuleView userId={user?.id || ''} />
    </div>
  );
}
