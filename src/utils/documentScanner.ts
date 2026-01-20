/**
 * Document Scanner Utilities
 * Canvas-based edge detection, perspective correction, and image enhancement
 * No external dependencies - pure JavaScript implementation
 */

/**
 * Simple edge detection using Sobel operator
 */
function sobelEdgeDetection(imageData: ImageData): Uint8ClampedArray {
  const w = imageData.width;
  const h = imageData.height;
  const src = imageData.data;
  
  // Convert to grayscale
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const idx = i * 4;
    gray[i] = 0.299 * src[idx] + 0.587 * src[idx + 1] + 0.114 * src[idx + 2];
  }
  
  // Sobel kernels
  const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
  
  const edges = new Uint8ClampedArray(w * h);
  
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let gx = 0, gy = 0;
      let ki = 0;
      
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const idx = (y + ky) * w + (x + kx);
          gx += gray[idx] * sobelX[ki];
          gy += gray[idx] * sobelY[ki];
          ki++;
        }
      }
      
      edges[y * w + x] = Math.min(255, Math.sqrt(gx * gx + gy * gy));
    }
  }
  
  return edges;
}

/**
 * Calculate polygon area
 */
function polygonArea(points: number[][]): number {
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i][0] * points[j][1];
    area -= points[j][0] * points[i][1];
  }
  return Math.abs(area / 2);
}

/**
 * Find document corners using edge detection
 */
function findDocumentCorners(canvas: HTMLCanvasElement): number[][] | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  
  const w = canvas.width;
  const h = canvas.height;
  const imageData = ctx.getImageData(0, 0, w, h);
  
  // Get edges
  const edges = sobelEdgeDetection(imageData);
  
  // Threshold edges
  const threshold = 50;
  const edgePoints: number[][] = [];
  const step = 3;
  
  for (let y = step; y < h - step; y += step) {
    for (let x = step; x < w - step; x += step) {
      if (edges[y * w + x] > threshold) {
        edgePoints.push([x, y]);
      }
    }
  }
  
  if (edgePoints.length < 100) {
    return null;
  }
  
  // Find extreme points (approximate corners)
  let tl = edgePoints[0], tr = edgePoints[0], br = edgePoints[0], bl = edgePoints[0];
  let tlScore = tl[0] + tl[1];
  let trScore = tr[0] - tr[1];
  let brScore = br[0] + br[1];
  let blScore = bl[0] - bl[1];
  
  for (const p of edgePoints) {
    const sumScore = p[0] + p[1];
    const diffScore = p[0] - p[1];
    
    if (sumScore < tlScore) { tlScore = sumScore; tl = p; }
    if (diffScore > trScore) { trScore = diffScore; tr = p; }
    if (sumScore > brScore) { brScore = sumScore; br = p; }
    if (diffScore < blScore) { blScore = diffScore; bl = p; }
  }
  
  // Validate corners form a reasonable quadrilateral
  const corners = [tl, tr, br, bl];
  const minArea = w * h * 0.1;
  const area = polygonArea(corners);
  
  if (area < minArea) {
    return null;
  }
  
  return corners;
}

/**
 * Apply perspective transform using bilinear interpolation
 */
function applyPerspectiveTransform(
  srcCanvas: HTMLCanvasElement,
  srcCorners: number[][],
  outputWidth: number,
  outputHeight: number
): HTMLCanvasElement {
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = outputWidth;
  outputCanvas.height = outputHeight;
  const ctx = outputCanvas.getContext("2d");
  if (!ctx) return srcCanvas;
  
  const srcCtx = srcCanvas.getContext("2d");
  if (!srcCtx) return srcCanvas;
  
  const srcData = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
  const dstData = ctx.createImageData(outputWidth, outputHeight);
  
  // Bilinear interpolation for perspective transform
  for (let dy = 0; dy < outputHeight; dy++) {
    for (let dx = 0; dx < outputWidth; dx++) {
      const u = dx / outputWidth;
      const v = dy / outputHeight;
      
      // Interpolate source coordinates
      const topX = srcCorners[0][0] + u * (srcCorners[1][0] - srcCorners[0][0]);
      const topY = srcCorners[0][1] + u * (srcCorners[1][1] - srcCorners[0][1]);
      const bottomX = srcCorners[3][0] + u * (srcCorners[2][0] - srcCorners[3][0]);
      const bottomY = srcCorners[3][1] + u * (srcCorners[2][1] - srcCorners[3][1]);
      
      const sx = Math.round(topX + v * (bottomX - topX));
      const sy = Math.round(topY + v * (bottomY - topY));
      
      if (sx >= 0 && sx < srcCanvas.width && sy >= 0 && sy < srcCanvas.height) {
        const srcIdx = (sy * srcCanvas.width + sx) * 4;
        const dstIdx = (dy * outputWidth + dx) * 4;
        
        dstData.data[dstIdx] = srcData.data[srcIdx];
        dstData.data[dstIdx + 1] = srcData.data[srcIdx + 1];
        dstData.data[dstIdx + 2] = srcData.data[srcIdx + 2];
        dstData.data[dstIdx + 3] = srcData.data[srcIdx + 3];
      }
    }
  }
  
  ctx.putImageData(dstData, 0, 0);
  return outputCanvas;
}

/**
 * Detect document edges and apply perspective transform
 */
export async function detectAndCropDocument(
  imageElement: HTMLImageElement | HTMLCanvasElement,
  outputWidth: number = 850,
  outputHeight: number = 1100
): Promise<HTMLCanvasElement | null> {
  // Create source canvas
  let srcCanvas: HTMLCanvasElement;
  if (imageElement instanceof HTMLCanvasElement) {
    srcCanvas = imageElement;
  } else {
    srcCanvas = document.createElement("canvas");
    srcCanvas.width = imageElement.naturalWidth || imageElement.width;
    srcCanvas.height = imageElement.naturalHeight || imageElement.height;
    const ctx = srcCanvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(imageElement, 0, 0);
  }
  
  // Resize for faster processing
  const maxDim = 800;
  const scale = Math.min(1, maxDim / Math.max(srcCanvas.width, srcCanvas.height));
  
  let processingCanvas: HTMLCanvasElement;
  if (scale < 1) {
    processingCanvas = document.createElement("canvas");
    processingCanvas.width = Math.round(srcCanvas.width * scale);
    processingCanvas.height = Math.round(srcCanvas.height * scale);
    const ctx = processingCanvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(srcCanvas, 0, 0, processingCanvas.width, processingCanvas.height);
    }
  } else {
    processingCanvas = srcCanvas;
  }
  
  // Find document corners
  const corners = findDocumentCorners(processingCanvas);
  
  if (!corners) {
    return null;
  }
  
  // Scale corners back to original size
  const originalCorners = corners.map(c => [
    Math.round(c[0] / scale),
    Math.round(c[1] / scale),
  ]);
  
  // Apply perspective transform
  return applyPerspectiveTransform(srcCanvas, originalCorners, outputWidth, outputHeight);
}

/**
 * Apply sharpening using convolution kernel
 */
export function sharpenImage(
  canvas: HTMLCanvasElement,
  intensity: number = 0.5
): HTMLCanvasElement {
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  
  const w = canvas.width;
  const h = canvas.height;
  
  const srcData = ctx.getImageData(0, 0, w, h);
  const dstData = ctx.createImageData(w, h);
  const src = srcData.data;
  const dst = dstData.data;
  
  // Sharpening kernel
  const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
  
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        let ki = 0;
        
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const srcIdx = ((y + ky) * w + (x + kx)) * 4 + c;
            sum += src[srcIdx] * kernel[ki++];
          }
        }
        
        const dstIdx = (y * w + x) * 4 + c;
        const srcIdx = (y * w + x) * 4 + c;
        const sharpened = sum * intensity + src[srcIdx] * (1 - intensity);
        dst[dstIdx] = Math.min(255, Math.max(0, Math.round(sharpened)));
      }
      dst[(y * w + x) * 4 + 3] = src[(y * w + x) * 4 + 3];
    }
  }
  
  // Copy edge pixels
  for (let x = 0; x < w; x++) {
    for (let c = 0; c < 4; c++) {
      dst[x * 4 + c] = src[x * 4 + c];
      dst[((h - 1) * w + x) * 4 + c] = src[((h - 1) * w + x) * 4 + c];
    }
  }
  for (let y = 0; y < h; y++) {
    for (let c = 0; c < 4; c++) {
      dst[(y * w) * 4 + c] = src[(y * w) * 4 + c];
      dst[(y * w + w - 1) * 4 + c] = src[(y * w + w - 1) * 4 + c];
    }
  }
  
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = w;
  outputCanvas.height = h;
  const outCtx = outputCanvas.getContext("2d");
  if (outCtx) outCtx.putImageData(dstData, 0, 0);
  
  return outputCanvas;
}

/**
 * Apply brightness/contrast/grayscale filters
 */
export function applyDocumentFilter(
  canvas: HTMLCanvasElement,
  brightness: number = 100,
  contrast: number = 100,
  grayscale: boolean = false
): HTMLCanvasElement {
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = canvas.width;
  outputCanvas.height = canvas.height;
  const ctx = outputCanvas.getContext("2d");
  if (!ctx) return canvas;
  
  const filters: string[] = [];
  if (brightness !== 100) filters.push(`brightness(${brightness}%)`);
  if (contrast !== 100) filters.push(`contrast(${contrast}%)`);
  if (grayscale) filters.push("grayscale(100%)");
  
  ctx.filter = filters.length > 0 ? filters.join(" ") : "none";
  ctx.drawImage(canvas, 0, 0);
  
  return outputCanvas;
}

/**
 * Process a document image with all enhancements
 */
export async function processDocument(
  imageElement: HTMLImageElement | HTMLCanvasElement,
  options: {
    autoCrop?: boolean;
    brightness?: number;
    contrast?: number;
    sharpness?: number;
    grayscale?: boolean;
  } = {}
): Promise<HTMLCanvasElement> {
  const {
    autoCrop = false,
    brightness = 100,
    contrast = 100,
    sharpness = 0,
    grayscale = false,
  } = options;
  
  let canvas: HTMLCanvasElement;
  
  // Step 1: Auto-crop if requested
  if (autoCrop) {
    const cropped = await detectAndCropDocument(imageElement);
    if (cropped) {
      canvas = cropped;
    } else {
      canvas = document.createElement("canvas");
      if (imageElement instanceof HTMLCanvasElement) {
        canvas.width = imageElement.width;
        canvas.height = imageElement.height;
      } else {
        canvas.width = imageElement.naturalWidth || imageElement.width;
        canvas.height = imageElement.naturalHeight || imageElement.height;
      }
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.drawImage(imageElement, 0, 0);
    }
  } else {
    canvas = document.createElement("canvas");
    if (imageElement instanceof HTMLCanvasElement) {
      canvas.width = imageElement.width;
      canvas.height = imageElement.height;
    } else {
      canvas.width = imageElement.naturalWidth || imageElement.width;
      canvas.height = imageElement.naturalHeight || imageElement.height;
    }
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.drawImage(imageElement, 0, 0);
  }
  
  // Step 2: Apply sharpening
  if (sharpness > 0) {
    canvas = sharpenImage(canvas, sharpness / 100);
  }
  
  // Step 3: Apply filters
  if (brightness !== 100 || contrast !== 100 || grayscale) {
    canvas = applyDocumentFilter(canvas, brightness, contrast, grayscale);
  }
  
  return canvas;
}
