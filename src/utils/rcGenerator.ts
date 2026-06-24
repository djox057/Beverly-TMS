import { PDFDocument } from "pdf-lib";
import templateUrl from "@/assets/rc_template_bf_prime.pdf?url";

export interface RcLoad {
  load_number?: string;
  driver?: string;
  commodity?: string;
  truck?: string;
  weight?: string;
  trailer?: string;
  miles?: string;
  phone?: string;
  rate?: string;
}

export interface RcStop {
  shipper?: string;
  receiver?: string;
  address?: string;
  csz?: string;
  date?: string;
  time?: string;
  num?: string;
}

export interface RcOrder {
  load: RcLoad;
  pickups: RcStop[];
  deliveries: RcStop[];
}

const LOAD_FIELDS: (keyof RcLoad)[] = [
  "load_number",
  "driver",
  "commodity",
  "truck",
  "weight",
  "trailer",
  "miles",
  "phone",
  "rate",
];

let templateBytesCache: ArrayBuffer | null = null;
async function loadTemplateBytes(): Promise<ArrayBuffer> {
  if (templateBytesCache) return templateBytesCache.slice(0);
  const res = await fetch(templateUrl);
  if (!res.ok) throw new Error(`Failed to load RC template: ${res.status}`);
  templateBytesCache = await res.arrayBuffer();
  return templateBytesCache.slice(0);
}

function trySetField(form: ReturnType<PDFDocument["getForm"]>, name: string, value?: string) {
  if (value == null || value === "") return;
  try {
    const tf = form.getTextField(name);
    tf.setText(String(value));
  } catch {
    // field not present, ignore
  }
}

function fillPage(
  pdf: PDFDocument,
  load: RcLoad,
  pickup: RcStop | undefined,
  delivery: RcStop | undefined,
) {
  const form = pdf.getForm();
  for (const k of LOAD_FIELDS) trySetField(form, k, load[k]);
  if (pickup) {
    trySetField(form, "pu_shipper", pickup.shipper);
    trySetField(form, "pu_address", pickup.address);
    trySetField(form, "pu_csz", pickup.csz);
    trySetField(form, "pu_date", pickup.date);
    trySetField(form, "pu_time", pickup.time);
    trySetField(form, "pu_num", pickup.num);
  }
  if (delivery) {
    trySetField(form, "del_receiver", delivery.receiver);
    trySetField(form, "del_address", delivery.address);
    trySetField(form, "del_csz", delivery.csz);
    trySetField(form, "del_date", delivery.date);
    trySetField(form, "del_time", delivery.time);
    trySetField(form, "del_num", delivery.num);
  }
}

export async function generateRc(order: RcOrder): Promise<Uint8Array> {
  if (!order.pickups || order.pickups.length < 1) {
    throw new Error("generateRc: at least one pickup is required");
  }
  if (!order.deliveries || order.deliveries.length < 1) {
    throw new Error("generateRc: at least one delivery is required");
  }

  const stops = Math.max(order.pickups.length, order.deliveries.length);

  // Simple case: single PU + single DEL — keep editable AcroForm fields.
  if (stops === 1) {
    const bytes = await loadTemplateBytes();
    const pdf = await PDFDocument.load(bytes);
    fillPage(pdf, order.load || {}, order.pickups[0], order.deliveries[0]);
    return pdf.save({ updateFieldAppearances: true });
  }

  // Multi-stop: render one page per pickup/delivery pair, flattening each
  // copy so that repeated form field names do not collide.
  const out = await PDFDocument.create();
  for (let i = 0; i < stops; i++) {
    const bytes = await loadTemplateBytes();
    const tpl = await PDFDocument.load(bytes);
    fillPage(tpl, order.load || {}, order.pickups[i], order.deliveries[i]);
    const tplForm = tpl.getForm();
    tplForm.updateFieldAppearances();
    tplForm.flatten();
    const [page] = await out.copyPages(tpl, [0]);
    out.addPage(page);
  }
  return out.save();
}

export async function downloadRc(order: RcOrder, filename?: string): Promise<void> {
  const bytes = await generateRc(order);
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || `rc_${order.load?.load_number || "load"}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function openRcForPrint(order: RcOrder): Promise<void> {
  const bytes = await generateRc(order);
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  if (!win) throw new Error("Pop-up blocked: unable to open print preview");
}
