import { PDFDocument } from "pdf-lib";

// Modify the merged document in place so embedded file attachments survive.
export async function removeInvoiceCoverPage(bytes: number[]): Promise<number[]> {
  const pdf = await PDFDocument.load(new Uint8Array(bytes));
  if (pdf.getPageCount() <= 1) {
    throw new Error("No load documents could be included in the LALE Trans export.");
  }
  pdf.removePage(0);
  return Array.from(await pdf.save());
}
