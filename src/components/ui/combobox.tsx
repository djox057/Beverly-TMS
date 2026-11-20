import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface Option {
  value: string;
  label: string;
  searchText?: string;
}

interface ComboboxProps {
  options: Option[];
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  /** Extra classes for the dropdown panel, e.g. to widen it beyond the trigger. */
  contentClassName?: string;
  disabled?: boolean;
  modal?: boolean;
  dropdownHeader?: React.ReactNode;
  preserveOrder?: boolean;
  selectedLabel?: string;
  ariaLabel?: string;
  allowCustom?: boolean;
}

export function Combobox({
  options,
  value,
  onValueChange,
  placeholder = "Select option...",
  searchPlaceholder = "Search...",
  emptyText = "No results found.",
  className,
  contentClassName,
  disabled,
  modal,
  dropdownHeader,
  preserveOrder,
  selectedLabel,
  ariaLabel,
  allowCustom = false,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const custom = search.trim();
  const canAdd = allowCustom && !!custom && !options.some(option =>
    option.label.toLowerCase() === custom.toLowerCase() || option.value.toLowerCase() === custom.toLowerCase());

  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next) setSearch("");
  }

  const selectedOption = options.find((option) => option.value === value);

  return (
    <Popover open={open} onOpenChange={changeOpen} modal={modal}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open}
          className={cn("w-full justify-between", className)}
          disabled={disabled}
        >
          <span className="min-w-0 flex-1 truncate text-left">
            {selectedOption ? selectedOption.label : selectedLabel || placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn("w-[--radix-popover-trigger-width] p-0 pointer-events-auto", contentClassName)}
      >
        {dropdownHeader}
        <Command className="pointer-events-auto" filter={preserveOrder ? (value, search) => value.toLowerCase().includes(search.trim().toLowerCase()) ? 1 : 0 : undefined}>
          <CommandInput placeholder={searchPlaceholder} value={search} onValueChange={setSearch} />
          <CommandList
            className="max-h-[240px] overscroll-contain"
            onWheel={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
          >
            {!canAdd && <CommandEmpty>{emptyText}</CommandEmpty>}
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.searchText || option.label}
                  onSelect={() => {
                    onValueChange?.(option.value === value ? "" : option.value);
                    changeOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 shrink-0",
                      value === option.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="truncate">{option.label}</span>
                </CommandItem>
              ))}
              {canAdd && <CommandItem value={custom} onSelect={() => {
                onValueChange?.(custom);
                changeOpen(false);
              }}>
                <span className="ml-6 truncate">Use “{custom}”</span>
              </CommandItem>}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
