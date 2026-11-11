import { useId, useState } from 'react';
import { Check, ChevronsUpDown, Info, Loader2 } from 'lucide-react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { HolidayTruck } from '@/hooks/useHolidayTrucks';

interface Props {
  value: string;
  onChange: (number: string) => void;
  trucks: HolidayTruck[];
  loading: boolean;
  error: boolean;
  retry: () => void;
  disabled: boolean;
}

export function HolidayTruckPicker({ value, onChange, trucks, loading, error, retry, disabled }: Props) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const selected = trucks.find(truck => truck.number === value.trim());
  return <div className="holiday-truck-cell">
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><button type="button" role="combobox" aria-label="Truck number" aria-expanded={open} aria-controls={open ? listId : undefined} disabled={disabled} className="holiday-truck-select">
        <span className={cn('truncate', !value && 'text-muted-foreground')}>{value || 'Truck#'}</span><ChevronsUpDown className="h-3 w-3 shrink-0 opacity-40" />
      </button></PopoverTrigger>
      <PopoverContent align="start" className="w-[320px] max-w-[calc(100vw-32px)] p-0">
        <Command label="Search trucks"><CommandInput placeholder="Search truck, driver, dispatcher…" aria-label="Search trucks" />
          <CommandList id={listId}>
            {loading ? <div role="status" className="p-4 text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" />Loading trucks…</div>
              : error ? <div role="alert" className="p-4 text-xs"><p>Could not load trucks.</p><button type="button" className="mt-2 underline" onClick={retry}>Retry trucks</button></div>
              : <><CommandEmpty>No matching trucks.</CommandEmpty><CommandGroup>
                {value && <CommandItem value="clear truck" onSelect={() => { onChange(''); setOpen(false); }}>Clear truck</CommandItem>}
                {trucks.map(truck => <CommandItem key={truck.number} value={`${truck.number} ${truck.driverName} ${truck.dispatcherName}`} onSelect={() => { onChange(truck.number); setOpen(false); }}>
                  <Check className={cn('mr-2 h-3 w-3 shrink-0', value === truck.number ? 'opacity-100' : 'opacity-0')} />
                  <div className="min-w-0"><div className="font-medium">{truck.number}</div>{truck.driverName && <div className="text-xs text-muted-foreground truncate">{truck.driverName}</div>}</div>
                </CommandItem>)}
              </CommandGroup></>}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
    {value && <Popover><PopoverTrigger asChild><button type="button" className="holiday-row-action shrink-0" aria-label={`Show driver and dispatcher for truck ${value}`}><Info className="h-3.5 w-3.5" /></button></PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-3 text-xs space-y-1.5">
        <div className="font-semibold border-b border-border pb-1.5">Truck #{value}</div>
        {loading ? <p>Loading assignment…</p> : error ? <p>Could not load assignment. <button type="button" onClick={retry} className="underline">Retry</button></p> : <>
          <div><span className="text-muted-foreground">Driver: </span><span className="font-medium">{selected?.driverName || '—'}</span></div>
          <div><span className="text-muted-foreground">Dispatcher: </span><span className="font-medium">{selected?.dispatcherName || '—'}</span></div>
          {!selected && <p className="text-muted-foreground">No active truck assignment found.</p>}
        </>}
      </PopoverContent>
    </Popover>}
  </div>;
}
