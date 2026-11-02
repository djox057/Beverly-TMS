import { Badge } from "@/components/ui/badge";
import type { DispatcherLoadOpportunities } from "@/hooks/useDispatcherLoadOpportunities";

interface Props {
  data?: DispatcherLoadOpportunities;
  isError: boolean;
  isFetching: boolean;
}

export function DispatcherLoadBadges({ data, isError, isFetching }: Props) {
  const counts = [
    { name: "Prebook", value: data?.prebookCount, color: "bg-blue-600 hover:bg-blue-600" },
    { name: "Recovery", value: data?.recoveryCount, color: "bg-red-600 hover:bg-red-600" },
  ];
  return (
    <span className="ml-auto flex shrink-0 items-center gap-1" aria-live="polite" aria-busy={isFetching}>
      {counts.map(({ name, value, color }) => {
        const label = isError ? `${name} count unavailable — reconnect or refresh`
          : value == null ? `Loading ${name.toLowerCase()} opportunities`
          : `${name}: ${value} available loads for your trucks, under 100 mi from same-day last delivery`;
        return <Badge key={name} variant="secondary" title={label} aria-label={label}
          className={`min-w-6 justify-center border-transparent px-1.5 text-white ${color}`}>
          {isError ? "—" : value ?? "…"}
        </Badge>;
      })}
    </span>
  );
}
