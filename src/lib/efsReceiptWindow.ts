/** Missing fuel receipts/data only count for 14 days after the EFS request. */
export function getEfsReceiptCutoff(now = Date.now()): string {
  return new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString();
}
