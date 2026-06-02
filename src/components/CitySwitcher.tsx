import { MapPin, Check } from 'lucide-react';
import { useCity, CITY_LABELS, type CityCode } from '@/contexts/CityContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function CitySwitcher() {
  const { activeCity, availableCities, setActiveCity } = useCity();

  // Esconde quando só existe 1 cidade disponível
  if (!availableCities || availableCities.length <= 1) {
    return (
      <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-secondary text-[11px] font-medium text-muted-foreground">
        <MapPin size={12} />
        <span>{CITY_LABELS[activeCity]}</span>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-secondary hover:bg-accent text-[11px] font-semibold text-foreground transition-colors"
          title="Trocar cidade"
        >
          <MapPin size={12} className="text-primary" />
          <span>{CITY_LABELS[activeCity]}</span>
          <span className="text-muted-foreground">▾</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Cidade ativa
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {availableCities.map((city: CityCode) => (
          <DropdownMenuItem
            key={city}
            onClick={() => city !== activeCity && setActiveCity(city)}
            className="flex items-center justify-between cursor-pointer"
          >
            <span className="flex items-center gap-2 text-sm">
              <MapPin size={13} />
              {CITY_LABELS[city]}
            </span>
            {city === activeCity && <Check size={14} className="text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
