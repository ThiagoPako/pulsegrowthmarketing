import { forwardRef, useEffect, useState, type CSSProperties } from 'react';
import type { Client } from '@/types';

interface ClientLogoProps {
  client: Pick<Client, 'companyName' | 'color' | 'logoUrl'>;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** tamanho exato quando nenhum dos três serve (ex.: logo de 20 px ao lado do nome, ClientTag) */
  style?: CSSProperties;
}

const SIZES = {
  sm: 'w-7 h-7 text-[10px] rounded-md',
  md: 'w-10 h-10 text-sm rounded-lg',
  lg: 'w-14 h-14 text-base rounded-xl',
};

const ClientLogo = forwardRef<HTMLDivElement, ClientLogoProps>(
  ({ client, size = 'md', className = '', style }, ref) => {
    const sizeClass = SIZES[size];
    // Link de logo que não abre (arquivo apagado, storage antigo) cai nas iniciais em vez de imagem quebrada
    const [failed, setFailed] = useState(false);
    useEffect(() => setFailed(false), [client.logoUrl]);

    if (client.logoUrl && !failed) {
      return (
        <img
          src={client.logoUrl}
          alt={client.companyName}
          loading="lazy"
          onError={() => setFailed(true)}
          className={`${sizeClass} object-contain bg-white shrink-0 border border-border ${className}`}
          style={style}
        />
      );
    }

    return (
      <div
        ref={ref}
        className={`${sizeClass} flex items-center justify-center font-bold shrink-0 ${className}`}
        style={{
          ...style,
          fontSize: style?.width ? Math.max(8, Math.round(Number(style.width) * 0.38)) : undefined,
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
