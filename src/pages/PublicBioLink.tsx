import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, Smartphone, MapPin, Share2, Globe, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function PublicBioLink() {
  const { slug } = useParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`https://agenciapulse.tech/api/public/bio/${slug}`)
      .then(res => res.json())
      .then(d => { setData(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [slug]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" /></div>;
  if (!data?.bio) return <div className="min-h-screen flex items-center justify-center">Bio não encontrada</div>;

  const { bio, buttons } = data;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center py-10 px-4">
      <div className="w-full max-w-md space-y-8 text-center">
        {bio.logo_url && <img src={bio.logo_url} className="w-24 h-24 rounded-full mx-auto shadow-lg" />}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">{bio.title}</h1>
          <p className="text-muted-foreground">{bio.description}</p>
        </div>
        <div className="space-y-4">
          {buttons.map((b: any) => (
            <Button
              key={b.id}
              variant="outline"
              className="w-full py-6 text-lg rounded-2xl bg-white shadow-sm hover:scale-[1.02] transition-transform"
              onClick={() => {
                if (b.type === 'whatsapp') window.open(`https://wa.me/${b.value.replace(/\D/g, '')}`, '_blank');
                else window.open(b.value, '_blank');
              }}
            >
              {b.type === 'whatsapp' && <MessageCircle className="mr-2 h-5 w-5 text-green-500" />}
              {b.type === 'location' && <MapPin className="mr-2 h-5 w-5 text-red-500" />}
              {b.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}