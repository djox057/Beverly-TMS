type OrderValues = Record<string, unknown>;

const additionalTypes = [
  { field: "detention", label: "Detention" },
  { field: "layover", label: "Layover" },
  { field: "tonu", label: "TONU" },
  { field: "extra_stop", label: "Extra Stop" },
  { field: "lumper", label: "Lumper", multiple: true },
  { field: "late_fee", label: "Late Fee", deduction: true },
  { field: "no_tracking_fee", label: "No Tracking Fee", deduction: true },
  { field: "wrong_address_fee", label: "Wrong Address Fee", deduction: true },
  { field: "escort_fee", label: "Escort Fee", companyOnly: true },
  { field: "other_charges", label: "Other Charges", deduction: true, multiple: true, reason: true },
  { field: "other_additionals", label: "Other Additionals", multiple: true, reason: true },
];

// Reports' date-window cache deliberately contains only some financial fields.
// Fetch the complete financial record when Load Info opens instead of using it.
export const REPORT_LOAD_FINANCIAL_COLUMNS = [
  "freight_amount", "driver_price",
  ...additionalTypes.flatMap(({ field, companyOnly, multiple, reason }) => [
    field,
    ...(!companyOnly ? [`${field}_driver`] : []),
    ...(multiple ? [`${field}_items`] : []),
    ...(reason ? [`${field}_reason`] : []),
  ]),
].join(", ");

export interface LoadAdditionalRow {
  id: string;
  label: string;
  reason: string;
  companyAmount: number;
  driverAmount: number;
}

function number(value: unknown): number {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

export function getReportLoadFinancials(order: OrderValues) {
  const rows: LoadAdditionalRow[] = [];
  for (const type of additionalTypes) {
    const sign = type.deduction ? -1 : 1;
    const rawItems = order[`${type.field}_items`];
    const items = type.multiple && Array.isArray(rawItems)
      ? rawItems.filter((item): item is OrderValues => !!item && typeof item === "object" && !Array.isArray(item))
      : [];
    // JSON item arrays and legacy aggregate columns describe the same charges.
    const entries = items.length ? items : [{
      amount: order[type.field],
      driverAmount: order[`${type.field}_driver`],
      reason: type.reason ? order[`${type.field}_reason`] : "",
    }];
    entries.forEach((item, index) => {
      const companyAmount = sign * number(item.amount);
      const driverAmount = type.companyOnly ? 0 : sign * number(
        type.field === "lumper" && items.length
          ? (index === 0 ? order.lumper_driver : 0)
          : item.driverAmount ?? item.driver_amount,
      );
      const reason = typeof item.reason === "string" ? item.reason : "";
      if (companyAmount || driverAmount || reason.trim()) {
        rows.push({ id: `${type.field}-${index}`, label: type.label, reason, companyAmount, driverAmount });
      }
    });
  }
  return {
    rows,
    freightAmount: number(order.freight_amount) + rows.reduce((sum, row) => sum + row.companyAmount, 0),
    driverPay: number(order.driver_price) + rows.reduce((sum, row) => sum + row.driverAmount, 0),
  };
}
