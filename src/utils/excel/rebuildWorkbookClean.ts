import ExcelJS from "exceljs";

type ExcelJsMedia = {
  index?: number;
  extension?: string;
  buffer?: any;
  base64?: string;
};

const toImageExtension = (ext?: string): "gif" | "jpeg" | "png" => {
  const cleaned = (ext || "png").toLowerCase().replace(/^\./, "");
  if (cleaned === "jpg" || cleaned === "jpeg") return "jpeg";
  if (cleaned === "gif") return "gif";
  return "png";
};

const base64ToUint8Array = (base64: string) => {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
};

const normalizeImageRange = (range: any) => {
  // ExcelJS accepts the ImageRange object returned by getImages().
  // We keep it as-is, but guard against incomplete shapes.
  if (!range) return undefined;
  if (range.tl && (range.br || range.ext)) return range;
  if (range.tl && range.br) return range;
  return range;
};

const copyWorksheetImages = (
  sourceWorkbook: ExcelJS.Workbook,
  sourceSheet: ExcelJS.Worksheet,
  targetWorkbook: ExcelJS.Workbook,
  targetSheet: ExcelJS.Worksheet,
  maxRow: number,
  maxCol: number
) => {
  const getImages = (sourceSheet as any).getImages as undefined | (() => any[]);
  if (!getImages) return;

  const images = getImages.call(sourceSheet) || [];
  if (!images.length) return;

  const media: ExcelJsMedia[] = ((sourceWorkbook as any).model?.media as any[]) || [];

  for (const img of images) {
    try {
      const range = normalizeImageRange(img.range);
      if (!range?.tl) continue;

      // Only copy images fully inside our exported area
      const tl = range.tl;
      const br = range.br;
      const within =
        (tl?.nativeRow ?? tl?.row ?? 0) <= maxRow &&
        (tl?.nativeCol ?? tl?.col ?? 0) <= maxCol &&
        (!br ||
          ((br?.nativeRow ?? br?.row ?? 0) <= maxRow && (br?.nativeCol ?? br?.col ?? 0) <= maxCol));
      if (!within) continue;

      const mediaEntry = media.find((m) => m?.index === img.imageId);
      if (!mediaEntry) continue;

      const extension = toImageExtension(mediaEntry.extension);
      const buffer = mediaEntry.buffer ?? (mediaEntry.base64 ? base64ToUint8Array(mediaEntry.base64) : undefined);
      if (!buffer) continue;

      const newImageId = targetWorkbook.addImage({ buffer, extension });
      targetSheet.addImage(newImageId, range);
    } catch {
      // Ignore image copy failures (some templates store drawings ExcelJS can't rehydrate)
    }
  }
};

// Nuclear option: Create a completely fresh workbook by copying only the data we need.
// Also preserves template images when ExcelJS can read them.
export const rebuildWorkbookClean = async (
  sourceWorkbook: ExcelJS.Workbook,
  sourceSheetIndex: number,
  maxRow: number,
  maxCol: number = 12
): Promise<ExcelJS.Workbook> => {
  const sourceSheet = sourceWorkbook.getWorksheet(sourceSheetIndex);
  if (!sourceSheet) throw new Error("Source worksheet not found");

  const newWorkbook = new ExcelJS.Workbook();
  const newSheet = newWorkbook.addWorksheet(sourceSheet.name || "Sheet1");

  // Copy column widths
  for (let col = 1; col <= maxCol; col++) {
    const sourceCol = sourceSheet.getColumn(col);
    const targetCol = newSheet.getColumn(col);
    if (sourceCol.width) targetCol.width = sourceCol.width;
    if (sourceCol.hidden) targetCol.hidden = sourceCol.hidden;
  }

  // Copy row heights and cell data
  for (let row = 1; row <= maxRow; row++) {
    const sourceRow = sourceSheet.getRow(row);
    const targetRow = newSheet.getRow(row);

    if (sourceRow.height) targetRow.height = sourceRow.height;
    if (sourceRow.hidden) targetRow.hidden = sourceRow.hidden;

    for (let col = 1; col <= maxCol; col++) {
      const sourceCell = sourceRow.getCell(col);
      const targetCell = targetRow.getCell(col);

      if (sourceCell.formula) {
        targetCell.value = { formula: sourceCell.formula };
      } else if (sourceCell.value !== null && sourceCell.value !== undefined) {
        targetCell.value = sourceCell.value as any;
      }

      if (sourceCell.style && Object.keys(sourceCell.style).length > 0) {
        targetCell.style = JSON.parse(JSON.stringify(sourceCell.style));
      }

      if (sourceCell.numFmt) targetCell.numFmt = sourceCell.numFmt;
    }
  }

  // Copy merged cells (only those within our range)
  const sourceAny = sourceSheet as any;
  if (sourceAny._merges) {
    for (const key of Object.keys(sourceAny._merges)) {
      const merge = sourceAny._merges[key];
      if (
        merge &&
        merge.top <= maxRow &&
        merge.left <= maxCol &&
        merge.bottom <= maxRow &&
        merge.right <= maxCol
      ) {
        try {
          newSheet.mergeCells(merge.top, merge.left, merge.bottom, merge.right);
        } catch {
          // ignore
        }
      }
    }
  }

  // Copy page setup / views if present
  if (sourceSheet.pageSetup) newSheet.pageSetup = { ...sourceSheet.pageSetup };
  if (sourceSheet.views && sourceSheet.views.length > 0) newSheet.views = [...sourceSheet.views];

  // Copy images if possible
  copyWorksheetImages(sourceWorkbook, sourceSheet, newWorkbook, newSheet, maxRow, maxCol);

  return newWorkbook;
};
