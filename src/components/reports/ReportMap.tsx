import type { ComponentProps } from "react";
import { DispatcherFleetMapView } from "@/components/DispatcherFleetMapDialog";
import { TruckMapView } from "@/components/TruckMapDialog";

type ReportMapProps =
  | ({ kind: "truck" } & ComponentProps<typeof TruckMapView>)
  | ({ kind: "fleet" } & ComponentProps<typeof DispatcherFleetMapView>);

export default function ReportMap(props: ReportMapProps) {
  if (props.kind === "truck") return <TruckMapView {...props} />;
  return <DispatcherFleetMapView {...props} />;
}
