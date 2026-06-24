import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";

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

// Brand palette
const NAVY = rgb(0x0b / 255, 0x14 / 255, 0x24 / 255);
const ORANGE = rgb(0xec / 255, 0x51 / 255, 0x16 / 255);
const FIELD_FILL = rgb(0xf3 / 255, 0xf5 / 255, 0xf9 / 255);
const LABEL_GREY = rgb(0x5b / 255, 0x64 / 255, 0x70 / 255);
const LINE = rgb(0xcb / 255, 0xd2 / 255, 0xdd / 255);
const WHITE = rgb(1, 1, 1);

// Page geometry (US Letter)
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN_X = 36;
const CONTENT_W = PAGE_W - MARGIN_X * 2;
const HEADER_H = 70;
const FOOTER_H = 36;
const TOP_CONTENT_Y = PAGE_H - HEADER_H - 14; // y where content begins (top-down)
const BOTTOM_LIMIT = FOOTER_H + 14; // do not draw below this

const SECTION_BAR_H = 18;
const ROW_H = 32; // label + field
const FIELD_H = 16;

const TERMS: string[] = [
  "Driver must call dispatch upon arrival and departure of each pickup and delivery.",
  "Carrier is responsible for verifying piece count, seal numbers, and load condition before signing the BOL.",
  "Any overage, shortage, or damage must be reported to dispatch immediately and noted on the BOL.",
  "Detention is billable only when documented on the BOL with arrival and departure times signed by the shipper/receiver.",
  "Trailer must be swept clean, dry, and free of debris prior to loading.",
  "Driver must maintain temperature settings (if applicable) and provide download upon request.",
  "All lumper, scale, and accessorial receipts must be turned in with the original BOL.",
  "Unauthorized stops, layovers, or route changes are not reimbursable.",
  "Use of double-brokering, co-brokering, or third-party carriers is strictly prohibited and voids this agreement.",
  "Macropoint / load tracking must be accepted and remain active for the duration of the load.",
];

interface Ctx {
  pdfDoc: PDFDocument;
  font: PDFFont;
  fontBold: PDFFont;
  pages: PDFPage[];
  page: PDFPage;
  cursorY: number; // top of next drawable area
}

function newPage(ctx: Ctx) {
  const page = ctx.pdfDoc.addPage([PAGE_W, PAGE_H]);
  ctx.pages.push(page);
  ctx.page = page;
  drawHeader(ctx);
  drawFooter(ctx);
  ctx.cursorY = TOP_CONTENT_Y;
}

function drawHeader(ctx: Ctx) {
  const p = ctx.page;
  // Navy band
  p.drawRectangle({ x: 0, y: PAGE_H - HEADER_H, width: PAGE_W, height: HEADER_H, color: NAVY });
  // Orange rule
  p.drawRectangle({ x: 0, y: PAGE_H - HEADER_H - 3, width: PAGE_W, height: 3, color: ORANGE });
  // Title
  p.drawText("RATE & LOAD CONFIRMATION", {
    x: MARGIN_X,
    y: PAGE_H - 34,
    size: 18,
    font: ctx.fontBold,
    color: WHITE,
  });
  p.drawText("Carrier / Driver Agreement", {
    x: MARGIN_X,
    y: PAGE_H - 52,
    size: 10,
    font: ctx.font,
    color: ORANGE,
  });
  // LOAD # block in top-right (rounded approximated as rectangle)
  const blockW = 150;
  const blockH = HEADER_H - 16;
  const blockX = PAGE_W - MARGIN_X - blockW;
  const blockY = PAGE_H - 8 - blockH;
  p.drawRectangle({ x: blockX, y: blockY, width: blockW, height: blockH, color: ORANGE });
  p.drawText("LOAD #", {
    x: blockX + 10,
    y: blockY + 6,
    size: 8,
    font: ctx.fontBold,
    color: WHITE,
  });
}

function drawFooter(ctx: Ctx) {
  const p = ctx.page;
  p.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: FOOTER_H, color: NAVY });
  p.drawRectangle({ x: 0, y: FOOTER_H, width: PAGE_W, height: 3, color: ORANGE });
  p.drawText("Confirmation generated for transport agreement.", {
    x: MARGIN_X,
    y: 13,
    size: 9,
    font: ctx.font,
    color: WHITE,
  });
}

function drawSectionBar(ctx: Ctx, title: string) {
  const y = ctx.cursorY - SECTION_BAR_H;
  ctx.page.drawRectangle({ x: MARGIN_X, y, width: CONTENT_W, height: SECTION_BAR_H, color: NAVY });
  ctx.page.drawRectangle({ x: MARGIN_X, y, width: 4, height: SECTION_BAR_H, color: ORANGE });
  ctx.page.drawText(title, {
    x: MARGIN_X + 12,
    y: y + 5,
    size: 10,
    font: ctx.fontBold,
    color: WHITE,
  });
  ctx.cursorY = y - 6;
}

function drawField(
  ctx: Ctx,
  name: string,
  label: string,
  value: string | undefined,
  x: number,
  y: number,
  w: number,
) {
  // Label
  ctx.page.drawText(label.toUpperCase(), {
    x,
    y: y + FIELD_H + 2,
    size: 7.5,
    font: ctx.fontBold,
    color: LABEL_GREY,
  });
  // Fill box
  ctx.page.drawRectangle({ x, y, width: w, height: FIELD_H, color: FIELD_FILL });
  // Underline
  ctx.page.drawRectangle({ x, y, width: w, height: 0.6, color: LINE });

  // AcroForm text field
  const form = ctx.pdfDoc.getForm();
  const tf = form.createTextField(name);
  tf.setText(value ?? "");
  tf.addToPage(ctx.page, {
    x,
    y,
    width: w,
    height: FIELD_H,
    borderWidth: 0,
    backgroundColor: undefined,
    textColor: NAVY,
    font: ctx.font,
  });
}

function drawRow(
  ctx: Ctx,
  fields: Array<{ name: string; label: string; value?: string; flex?: number }>,
) {
  const totalFlex = fields.reduce((s, f) => s + (f.flex ?? 1), 0);
  const gap = 10;
  const usableW = CONTENT_W - gap * (fields.length - 1);
  let x = MARGIN_X;
  const y = ctx.cursorY - ROW_H + 8; // field box bottom
  for (const f of fields) {
    const w = (usableW * (f.flex ?? 1)) / totalFlex;
    drawField(ctx, f.name, f.label, f.value, x, y, w);
    x += w + gap;
  }
  ctx.cursorY -= ROW_H;
}

function ensureSpace(ctx: Ctx, needed: number) {
  if (ctx.cursorY - needed < BOTTOM_LIMIT) {
    newPage(ctx);
  }
}

function drawLoadBlock(ctx: Ctx, load: RcLoad) {
  const blockH = SECTION_BAR_H + 6 + ROW_H * 3 + 4;
  ensureSpace(ctx, blockH);
  drawSectionBar(ctx, "LOAD DETAILS");
  drawRow(ctx, [
    { name: "load_number", label: "Load #", value: load.load_number, flex: 1 },
    { name: "driver", label: "Driver", value: load.driver, flex: 1 },
    { name: "commodity", label: "Commodity", value: load.commodity, flex: 1 },
  ]);
  drawRow(ctx, [
    { name: "truck", label: "Truck", value: load.truck, flex: 1 },
    { name: "weight", label: "Weight", value: load.weight, flex: 1 },
    { name: "trailer", label: "Trailer", value: load.trailer, flex: 1 },
  ]);
  drawRow(ctx, [
    { name: "miles", label: "Miles", value: load.miles, flex: 1 },
    { name: "phone", label: "Phone", value: load.phone, flex: 1 },
    { name: "rate", label: "Rate", value: load.rate, flex: 1 },
  ]);
  ctx.cursorY -= 6;
}

function drawStopBlock(
  ctx: Ctx,
  title: string,
  prefix: "pu" | "del",
  idx: number,
  stop: RcStop,
  isPickup: boolean,
) {
  const blockH = SECTION_BAR_H + 6 + ROW_H * 3 + 4;
  ensureSpace(ctx, blockH);
  drawSectionBar(ctx, title);
  const partyLabel = isPickup ? "Shipper" : "Receiver";
  const partyKey = isPickup ? "shipper" : "receiver";
  const partyValue = isPickup ? stop.shipper : stop.receiver;
  drawRow(ctx, [
    { name: `${prefix}${idx}_${partyKey}`, label: partyLabel, value: partyValue, flex: 2 },
    { name: `${prefix}${idx}_num`, label: isPickup ? "PU #" : "DEL #", value: stop.num, flex: 1 },
  ]);
  drawRow(ctx, [
    { name: `${prefix}${idx}_address`, label: "Address", value: stop.address, flex: 2 },
    { name: `${prefix}${idx}_date`, label: "Date", value: stop.date, flex: 1 },
  ]);
  drawRow(ctx, [
    { name: `${prefix}${idx}_csz`, label: "City / State / Zip", value: stop.csz, flex: 2 },
    { name: `${prefix}${idx}_time`, label: "Time", value: stop.time, flex: 1 },
  ]);
  ctx.cursorY -= 6;
}

function wrapLine(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const tryLine = cur ? cur + " " + w : w;
    if (font.widthOfTextAtSize(tryLine, size) <= maxW) {
      cur = tryLine;
    } else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function drawTermsBlock(ctx: Ctx) {
  const size = 8.5;
  const lineH = 11;
  const innerPad = 8;
  const maxW = CONTENT_W - innerPad * 2 - 14; // bullet indent
  // Pre-compute wrapped lines per term
  const wrappedTerms = TERMS.map((t) => wrapLine(t, ctx.font, size, maxW));
  const totalLines = wrappedTerms.reduce((s, w) => s + w.length, 0);
  const blockH = SECTION_BAR_H + 6 + totalLines * lineH + innerPad * 2 + 4;

  if (ctx.cursorY - blockH < BOTTOM_LIMIT) {
    newPage(ctx);
  }
  drawSectionBar(ctx, "ADDITIONAL TERMS");
  const boxTop = ctx.cursorY;
  const boxH = totalLines * lineH + innerPad * 2;
  const boxY = boxTop - boxH;
  ctx.page.drawRectangle({
    x: MARGIN_X,
    y: boxY,
    width: CONTENT_W,
    height: boxH,
    color: FIELD_FILL,
  });

  let textY = boxTop - innerPad - size;
  for (const lines of wrappedTerms) {
    // Bullet
    ctx.page.drawText("•", {
      x: MARGIN_X + innerPad,
      y: textY,
      size,
      font: ctx.fontBold,
      color: ORANGE,
    });
    for (const ln of lines) {
      ctx.page.drawText(ln, {
        x: MARGIN_X + innerPad + 12,
        y: textY,
        size,
        font: ctx.font,
        color: NAVY,
      });
      textY -= lineH;
    }
  }
  ctx.cursorY = boxY - 6;
}

function drawPageNumbers(ctx: Ctx) {
  const total = ctx.pages.length;
  ctx.pages.forEach((p, i) => {
    const txt = `Page ${i + 1} of ${total}`;
    const w = ctx.font.widthOfTextAtSize(txt, 9);
    p.drawText(txt, {
      x: PAGE_W - MARGIN_X - w,
      y: 13,
      size: 9,
      font: ctx.font,
      color: WHITE,
    });
  });
}

export async function generateRc(order: RcOrder): Promise<Uint8Array> {
  if (!order.pickups || order.pickups.length < 1) {
    throw new Error("generateRc: at least one pickup is required");
  }
  if (!order.deliveries || order.deliveries.length < 1) {
    throw new Error("generateRc: at least one delivery is required");
  }

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const ctx: Ctx = {
    pdfDoc,
    font,
    fontBold,
    pages: [],
    page: null as unknown as PDFPage,
    cursorY: 0,
  };
  newPage(ctx);

  // Load details
  drawLoadBlock(ctx, order.load || {});

  // Pickups
  const single = order.pickups.length === 1;
  order.pickups.forEach((p, i) => {
    const title = single ? "PICK-UP INFORMATION" : `PICK-UP ${i + 1}`;
    drawStopBlock(ctx, title, "pu", i + 1, p, true);
  });

  // Deliveries
  const singleDel = order.deliveries.length === 1;
  order.deliveries.forEach((d, i) => {
    const title = singleDel ? "DELIVERY INFORMATION" : `DELIVERY ${i + 1}`;
    drawStopBlock(ctx, title, "del", i + 1, d, false);
  });

  // Terms (always on final page)
  drawTermsBlock(ctx);

  // Page numbers
  drawPageNumbers(ctx);

  // Fill LOAD # label value in header on first page (above orange block, just text)
  // The orange block already drawn; overlay the load number text
  if (order.load?.load_number) {
    const p = ctx.pages[0];
    const txt = order.load.load_number;
    const size = 14;
    const w = fontBold.widthOfTextAtSize(txt, size);
    const blockW = 150;
    const blockX = PAGE_W - MARGIN_X - blockW;
    p.drawText(txt, {
      x: blockX + (blockW - w) / 2,
      y: PAGE_H - 32,
      size,
      font: fontBold,
      color: WHITE,
    });
  }

  // IMPORTANT: keep AcroForm fields editable (do not flatten).
  const bytes = await pdfDoc.save({ updateFieldAppearances: true });
  return bytes;
}

export async function downloadRc(order: RcOrder, filename?: string): Promise<void> {
  const bytes = await generateRc(order);
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || `rc_${order.load?.load_number || "load"}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke so the browser can complete the download
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function openRcForPrint(order: RcOrder): Promise<void> {
  const bytes = await generateRc(order);
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  // Revoke later; printing tab needs the URL alive briefly
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  if (!win) {
    throw new Error("Pop-up blocked: unable to open print preview");
  }
}