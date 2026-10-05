import { describe, expect, it } from "vitest";
import { PDFDocument, PDFName } from "pdf-lib";
import { removeInvoiceCoverPage } from "./removeInvoiceCoverPage";

describe("LALE invoice cover removal", () => {
  it("keeps every load-document page in its original order", async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage([210, 297]);
    pdf.addPage([600, 800]);
    pdf.addPage([700, 900]);
    const output = await PDFDocument.load(new Uint8Array(await removeInvoiceCoverPage(Array.from(await pdf.save()))));
    expect(output.getPages().map((page) => [page.getWidth(), page.getHeight()])).toEqual([[600, 800], [700, 900]]);
  });

  it("preserves embedded attachments", async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    pdf.addPage();
    await pdf.attach(new Uint8Array([1, 2, 3]), "original.pdf", { mimeType: "application/pdf" });
    const output = await PDFDocument.load(new Uint8Array(await removeInvoiceCoverPage(Array.from(await pdf.save()))));
    expect(output.catalog.get(PDFName.of("Names"))).toBeDefined();
    expect(output.catalog.get(PDFName.of("AF"))).toBeDefined();
  });

  it("rejects an invoice-only fallback instead of exporting a blank PDF", async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    await expect(removeInvoiceCoverPage(Array.from(await pdf.save()))).rejects.toThrow("No load documents");
  });
});
