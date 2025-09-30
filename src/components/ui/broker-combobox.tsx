import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useBrokers } from "@/hooks/useBrokers";
import { useDebounce } from "@/hooks/useDebounce";

interface BrokerComboboxProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  emptyText?: string;
  searchPlaceholder?: string;
}

export function BrokerCombobox({
  value,
  onValueChange,
  placeholder = "Select broker...",
  emptyText = "No broker found.",
  searchPlaceholder = "Search brokers...",
}: BrokerComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState("");
  const debouncedSearch = useDebounce(searchTerm, 300);
  
  const { data: allBrokers } = useBrokers();

  // Filter brokers based on search term, limit to 50 results
  const filteredBrokers = React.useMemo(() => {
    if (!allBrokers) return [];
    
    const filtered = allBrokers.filter(broker =>
      broker.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      broker.mc_number?.toLowerCase().includes(debouncedSearch.toLowerCase())
    );
    
    return filtered.slice(0, 50); // Only show first 50 matches
  }, [allBrokers, debouncedSearch]);

  const selectedBroker = React.useMemo(
    () => allBrokers?.find((broker) => broker.id === value),
    [allBrokers, value]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
        >
          {selectedBroker ? selectedBroker.name : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput 
            placeholder={searchPlaceholder} 
            value={searchTerm}
            onValueChange={setSearchTerm}
          />
          <CommandEmpty>{emptyText}</CommandEmpty>
          <CommandGroup className="max-h-64 overflow-auto">
            {filteredBrokers.map((broker) => (
              <CommandItem
                key={broker.id}
                value={broker.id}
                onSelect={(currentValue) => {
                  onValueChange(currentValue === value ? "" : currentValue);
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    value === broker.id ? "opacity-100" : "opacity-0"
                  )}
                />
                <div className="flex flex-col">
                  <span>{broker.name}</span>
                  {broker.mc_number && (
                    <span className="text-xs text-muted-foreground">MC: {broker.mc_number}</span>
                  )}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
