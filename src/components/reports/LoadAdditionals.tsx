import type { LoadAdditionalRow } from "@/lib/reportLoadFinancials";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function LoadAdditionals({ rows }: { rows: LoadAdditionalRow[] }) {
  if (!rows.length) return null;
  return (
    <section className="mt-4 rounded-lg border p-4" aria-label="Load additionals">
      <h4 className="text-sm font-semibold mb-3">Additionals</h4>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-muted-foreground">
            <tr>
              <th className="text-left pb-2 font-medium">Type / Reason</th>
              <th className="text-right pb-2 pl-4 font-medium">Company</th>
              <th className="text-right pb-2 pl-4 font-medium">Driver</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="py-2">
                  <div>{row.label}</div>
                  {row.reason && <div className="text-muted-foreground whitespace-pre-wrap break-words">{row.reason}</div>}
                </td>
                <td className="text-right pl-4 tabular-nums whitespace-nowrap">{money.format(row.companyAmount)}</td>
                <td className="text-right pl-4 tabular-nums whitespace-nowrap">{money.format(row.driverAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
