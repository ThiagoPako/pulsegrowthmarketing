import { forwardRef } from 'react';
import type { Client } from '@/types';

interface ClientLogoProps {
  client: Pick<Client, 'companyName' | 'color' | 'logoUrl'>;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZES = {
  sm: 'w-9 h-9 text-[11px] rounded-lg',
  md: 'w-12 h-12 text-sm rounded-xl',
  lg: 'w-16 h-16 text-lg rounded-2xl',
};

const ClientLogo = forwardRef<HTMLDivElement, ClientLogoProps>(
  ({ client, size = 'md', className = '' }, ref) => {
    const sizeClass = SIZES[size];

    if (client.logoUrl) {
      return (
        <img
          src={client.logoUrl}
          alt={client.companyName}
          className={`${sizeClass} object-cover shrink-0 border border-border shadow-sm ring-1 ring-border/50 ${className}`}
        />
      );
    }

    return (
      <div
        ref={ref}
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
);

ClientLogo.displayName = 'ClientLogo';

export default ClientLogo;
