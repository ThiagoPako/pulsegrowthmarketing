import type { Client } from '@/types';

interface ClientLogoProps {
  client: Pick<Client, 'companyName' | 'color' | 'logoUrl'>;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZES = {
  sm: 'w-7 h-7 text-[10px] rounded-md',
  md: 'w-10 h-10 text-sm rounded-lg',
  lg: 'w-14 h-14 text-base rounded-xl',
};

export default function ClientLogo({ client, size = 'md', className = '' }: ClientLogoProps) {
  const sizeClass = SIZES[size];

  if (client.logoUrl) {
    return (
      <img
        src={client.logoUrl}
        alt={client.companyName}
        className={`${sizeClass} object-cover shrink-0 border border-border ${className}`}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} flex items-center justify-center font-bold shrink-0 ${className}`}
      style={{
        backgroundColor: `hsl(${client.color || '220 10% 50%'} / 0.15)`,
        color: `hsl(${client.color || '220 10% 50%'})`,
      }}
    >
      {client.companyName.substring(0, 2).toUpperCase()}
    </div>
  );
}
