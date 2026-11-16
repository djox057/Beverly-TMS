export interface ReportAdditional {
  id: string;
  label: string;
  companyAmount: number;
  driverAmount: number;
  deduction: boolean;
  hasDriver: boolean;
}

// Keep initial, historical, fallback and realtime Report queries consistent.
export const REPORT_ADDITIONAL_COLUMNS = `
  late_fee, late_fee_driver, no_tracking_fee, no_tracking_fee_driver,
  wrong_address_fee, wrong_address_fee_driver, escort_fee,
  other_charges, other_charges_driver, other_charges_reason, other_charges_items,
  other_additionals, other_additionals_driver, other_additionals_reason, other_additionals_items,
  lumper_items
`;

const definitions = [
  ["detention", "Detention", false, true],
  ["layover", "Layover", false, true],
  ["extra_stop", "Extra Stop", false, true],
  ["lumper", "Lumper", false, false],
  ["late_fee", "Late Fee", true, true],
  ["no_tracking_fee", "No Tracking Fee", true, true],
  ["wrong_address_fee", "Wrong Address Fee", true, true],
  ["tonu", "TONU", false, true],
  ["other_charges", "Other Charges", true, true],
  ["other_additionals", "Other Additionals", false, true],
] as const;

const toAmount = (value: unknown): number => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
};

export function getReportAdditionals(order: Record<string, unknown>): ReportAdditional[] {
  return definitions.flatMap(([type, label, deduction, hasDriver]) => {
    const rawItems = order[`${type}_items`];
    const items = Array.isArray(rawItems) && rawItems.length > 0
      ? rawItems
      : [{ amount: order[type], driverAmount: order[`${type}_driver`], reason: order[`${type}_reason`] }];

    return items.flatMap((item, index) => {
      if (!item || typeof item !== "object") return [];
      const companyAmount = toAmount(item.amount);
      const driverAmount = hasDriver ? toAmount(item.driverAmount ?? item.driver_amount) : 0;
      const reason = String(item.reason || "").trim();
      if (companyAmount === 0 && driverAmount === 0 && !reason) return [];
      return [{
        id: `${type}-${index}`,
        label: reason || label,
        companyAmount,
        driverAmount,
        deduction,
        hasDriver,
      }];
    });
  });
}
