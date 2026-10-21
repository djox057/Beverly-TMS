interface StoredMoneyCode {
  truck_number: string | null;
  driver_name: string;
  purpose: string;
  amount: number;
  purpose_detail?: string | null;
  is_trailer_repair?: boolean;
  trailer_number?: string | null;
  location_name?: string | null;
  location_address?: string | null;
  city?: string | null;
  state?: string | null;
}

/** Present recorded information without editing it or inventing missing details. */
export function formatStoredEfsMoneyCode(request: StoredMoneyCode): string {
  const line = (value?: string | null) => value?.trim().replace(/\s+/g, " ") || "";
  const unit = [line(request.truck_number) || "N/A",
    ...(request.is_trailer_repair && line(request.trailer_number) ? [line(request.trailer_number)] : [])].join(" / ");
  const address = line(request.location_address) || [line(request.city), line(request.state)].filter(Boolean).join(", ");
  const location = [line(request.location_name), address].filter(Boolean).join(" ") || "N/A";
  const amount = Number.isFinite(request.amount) ? `$${request.amount.toFixed(2)}` : "N/A";
  return `EFS Money Code\n\nUnit: ${unit}\nDriver: ${line(request.driver_name) || "N/A"}\nPurpose: ${line(request.purpose_detail) || line(request.purpose) || "N/A"}\nAmount: ${amount}\nLocation: ${location}`;
}
