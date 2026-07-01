import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import leaseAsset from "@/assets/APS_BFP_lease_agreement.pdf.asset.json";

export interface LeaseTruckInfo {
  truckNumber: string;
  vin?: string | null;
  make?: string | null;
  model?: string | null;
}

// Page 3 text positions were extracted from the source template via
// `pdftotext -bbox-layout` (letter size, 612 x 792 pts, top-left origin).
// We whiteout the original three lines and re-draw them centered.
const PAGE_HEIGHT = 792;
const PAGE_CENTER_X = 306;

const REGIONS = {
  equipmentId: { yTop: 489, yBottom: 505, xLeft: 190, xRight: 420, fontSize: 12 },
  vin: { yTop: 522, yBottom: 547, xLeft: 140, xRight: 470, fontSize: 18 },
  makeModel: { yTop: 560, yBottom: 585, xLeft: 190, xRight: 420, fontSize: 18 },
};

function toPdfY(topLeftY: number): number {
  return PAGE_HEIGHT - topLeftY;
}

export async function generateLeaseAgreementPdf(truck: LeaseTruckInfo): Promise<Uint8Array> {
  const res = await fetch(leaseAsset.url);
  if (!res.ok) throw new Error(`Failed to fetch lease agreement template: ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());

  const pdf = await PDFDocument.load(bytes);
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pages = pdf.getPages();
  if (pages.length < 3) throw new Error("Lease agreement template missing page 3");
  const page = pages[2];

  const drawCentered = (
    text: string,
    region: { yTop: number; yBottom: number; xLeft: number; xRight: number; fontSize: number },
  ) => {
    // Whiteout original
    page.drawRectangle({
      x: region.xLeft,
      y: toPdfY(region.yBottom),
      width: region.xRight - region.xLeft,
      height: region.yBottom - region.yTop,
      color: rgb(1, 1, 1),
    });
    const width = font.widthOfTextAtSize(text, region.fontSize);
    const x = PAGE_CENTER_X - width / 2;
    // Baseline: place ~2pt above the bottom of the region for visual centering
    const y = toPdfY(region.yBottom) + 3;
    page.drawText(text, { x, y, size: region.fontSize, font, color: rgb(0, 0, 0) });
  };

  const truckNumber = truck.truckNumber?.trim() || "";
  const vin = (truck.vin || "").trim();
  const make = (truck.make || "").trim();
  const model = (truck.model || "").trim();
  const makeModel = [make, model].filter(Boolean).join(" ");

  drawCentered(`Leased equipment id #${truckNumber}`, REGIONS.equipmentId);
  drawCentered(vin ? `VIN: ${vin}` : "VIN:", REGIONS.vin);
  drawCentered(makeModel || " ", REGIONS.makeModel);

  return pdf.save();
}

export function downloadLeaseAgreement(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}