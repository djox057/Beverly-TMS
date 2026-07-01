import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import apsAsset from "@/assets/APS_lease.pdf.asset.json";
import uesAsset from "@/assets/UES_lease.pdf.asset.json";

export type LeaseTemplate = "APS" | "UES";

export interface LeaseTruckInfo {
  truckNumber: string;
  vin?: string | null;
  make?: string | null;
  model?: string | null;
}

const PAGE_HEIGHT = 792;
const PAGE_CENTER_X = 306;

// Regions extracted with pdftotext -bbox-layout (top-left origin, letter size).
// We whiteout the original values and re-draw centered.
const TEMPLATE_REGIONS: Record<
  LeaseTemplate,
  {
    equipmentId: Region;
    vin: Region;
    makeModel: Region;
  }
> = {
  APS: {
    equipmentId: { yTop: 483, yBottom: 512, xLeft: 100, xRight: 512, fontSize: 12 },
    vin: { yTop: 515, yBottom: 553, xLeft: 100, xRight: 512, fontSize: 18 },
    makeModel: { yTop: 555, yBottom: 592, xLeft: 100, xRight: 512, fontSize: 18 },
  },
  UES: {
    equipmentId: { yTop: 475, yBottom: 504, xLeft: 100, xRight: 512, fontSize: 12 },
    vin: { yTop: 508, yBottom: 545, xLeft: 100, xRight: 512, fontSize: 18 },
    makeModel: { yTop: 547, yBottom: 583, xLeft: 100, xRight: 512, fontSize: 18 },
  },
};

interface Region {
  yTop: number;
  yBottom: number;
  xLeft: number;
  xRight: number;
  fontSize: number;
}

function toPdfY(topLeftY: number): number {
  return PAGE_HEIGHT - topLeftY;
}

export function getLeaseTemplateForCompany(companyName?: string | null): LeaseTemplate | null {
  const name = (companyName || "").trim().toLowerCase();
  if (!name) return null;
  if (name === "ap silver trans llc") return "APS";
  if (name === "united enterprise solutions inc") return "UES";
  return null;
}

export async function generateLeaseAgreementPdf(
  truck: LeaseTruckInfo,
  template: LeaseTemplate,
): Promise<Uint8Array> {
  const asset = template === "APS" ? apsAsset : uesAsset;
  const res = await fetch(asset.url);
  if (!res.ok) throw new Error(`Failed to fetch lease agreement template: ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());

  const pdf = await PDFDocument.load(bytes);
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pages = pdf.getPages();
  if (pages.length < 3) throw new Error("Lease agreement template missing page 3");
  const page = pages[2];
  const regions = TEMPLATE_REGIONS[template];

  const drawCentered = (text: string, region: Region) => {
    page.drawRectangle({
      x: region.xLeft,
      y: toPdfY(region.yBottom),
      width: region.xRight - region.xLeft,
      height: region.yBottom - region.yTop,
      color: rgb(1, 1, 1),
    });
    const width = font.widthOfTextAtSize(text, region.fontSize);
    const x = PAGE_CENTER_X - width / 2;
    const y = toPdfY(region.yBottom) + 3;
    page.drawText(text, { x, y, size: region.fontSize, font, color: rgb(0, 0, 0) });
  };

  const truckNumber = truck.truckNumber?.trim() || "";
  const vin = (truck.vin || "").trim();
  const make = (truck.make || "").trim();
  const model = (truck.model || "").trim();
  const makeModel = [make, model].filter(Boolean).join(" ");

  drawCentered(`Lease unit ID: #${truckNumber}`, regions.equipmentId);
  drawCentered(vin ? `VIN: ${vin}` : "VIN:", regions.vin);
  if (template === "UES") {
    drawCentered(makeModel ? `Make/Model: ${makeModel}` : "Make/Model:", regions.makeModel);
  } else {
    drawCentered(makeModel || " ", regions.makeModel);
  }

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
