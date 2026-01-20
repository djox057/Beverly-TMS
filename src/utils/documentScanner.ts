/**
 * Document Scanner Utilities
 * Canvas-based edge detection, perspective correction, and image enhancement
 * Pure JavaScript implementation
 */

/**
 * Gaussian blur for noise reduction
 */
function gaussianBlur(imageData: ImageData, radius: number = 2): ImageData {
  const w = imageData.width;
  const h = imageData.height;
  const src = imageData.data;
  const dst = new Uint8ClampedArray(src.length);
  
  // Simple box blur approximation
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, count = 0;
      
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
            const idx = (ny * w + nx) * 4;
            r += src[idx];
            g += src[idx + 1];
            b += src[idx + 2];
            count++;
          }
        }
      }
      
      const idx = (y * w + x) * 4;
      dst[idx] = r / count;
      dst[idx + 1] = g / count;
      dst[idx + 2] = b / count;
      dst[idx + 3] = src[idx + 3];
    }
  }
  
  return new ImageData(dst, w, h);
}

/**
 * Sobel edge detection
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
  
  const edges = new Uint8ClampedArray(w * h);
  const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
  
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
 * Find the largest quadrilateral contour in edge image
 */
function findLargestQuad(
  edges: Uint8ClampedArray,
  w: number,
  h: number,
  threshold: number = 30
): number[][] | null {
  // Collect edge points
  const edgePoints: number[][] = [];
  for (let y = 5; y < h - 5; y++) {
    for (let x = 5; x < w - 5; x++) {
      if (edges[y * w + x] > threshold) {
        edgePoints.push([x, y]);
      }
    }
  }
  
  if (edgePoints.length < 50) return null;
  
  // Find convex hull using Graham scan
  const hull = convexHull(edgePoints);
  if (hull.length < 4) return null;
  
  // Simplify hull to 4 corners using Douglas-Peucker or find extreme points
  const corners = findFourCorners(hull, w, h);
  
  return corners;
}

/**
 * Simple convex hull using Graham scan
 */
function convexHull(points: number[][]): number[][] {
  if (points.length < 3) return points;
  
  // Find the bottom-most point (or left most in case of tie)
  let start = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i][1] > points[start][1] || 
        (points[i][1] === points[start][1] && points[i][0] < points[start][0])) {
      start = i;
    }
  }
  
  const pivot = points[start];
  
  // Sort points by polar angle
  const sorted = points.slice().sort((a, b) => {
    const angleA = Math.atan2(a[1] - pivot[1], a[0] - pivot[0]);
    const angleB = Math.atan2(b[1] - pivot[1], b[0] - pivot[0]);
    if (angleA !== angleB) return angleA - angleB;
    const distA = (a[0] - pivot[0]) ** 2 + (a[1] - pivot[1]) ** 2;
    const distB = (b[0] - pivot[0]) ** 2 + (b[1] - pivot[1]) ** 2;
    return distA - distB;
  });
  
  const hull: number[][] = [];
  for (const p of sorted) {
    while (hull.length >= 2 && cross(hull[hull.length - 2], hull[hull.length - 1], p) <= 0) {
      hull.pop();
    }
    hull.push(p);
  }
  
  return hull;
}

function cross(o: number[], a: number[], b: number[]): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

/**
 * Find four corners from hull points
 */
function findFourCorners(hull: number[][], w: number, h: number): number[][] {
  // Find points closest to each image corner
  const imageCorners = [
    [0, 0],         // top-left
    [w, 0],         // top-right
    [w, h],         // bottom-right
    [0, h],         // bottom-left
  ];
  
  const corners: number[][] = [];
  
  for (const target of imageCorners) {
    let closest = hull[0];
    let minDist = Infinity;
    
    for (const p of hull) {
      const dist = (p[0] - target[0]) ** 2 + (p[1] - target[1]) ** 2;
      if (dist < minDist) {
        minDist = dist;
        closest = p;
      }
    }
    
    corners.push([...closest]);
  }
  
  return corners;
}

/**
 * Apply perspective transform - maps irregular quadrilateral to rectangle
 * Uses bilinear interpolation for proper perspective correction
 */
function perspectiveTransform(
  srcCanvas: HTMLCanvasElement,
  srcCorners: number[][],
  outputWidth: number,
  outputHeight: number
): HTMLCanvasElement {
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = outputWidth;
  outputCanvas.height = outputHeight;
  const dstCtx = outputCanvas.getContext("2d");
  if (!dstCtx) return srcCanvas;
  
  const srcCtx = srcCanvas.getContext("2d");
  if (!srcCtx) return srcCanvas;
  
  const srcW = srcCanvas.width;
  const srcH = srcCanvas.height;
  const srcData = srcCtx.getImageData(0, 0, srcW, srcH);
  const dstData = dstCtx.createImageData(outputWidth, outputHeight);
  
  // Source corners: [TL, TR, BR, BL]
  const [tl, tr, br, bl] = srcCorners;
  
  // For each destination pixel, find corresponding source pixel
  for (let dy = 0; dy < outputHeight; dy++) {
    for (let dx = 0; dx < outputWidth; dx++) {
      // Normalized coordinates in destination (0 to 1)
      const u = dx / (outputWidth - 1);
      const v = dy / (outputHeight - 1);
      
      // Bilinear interpolation to find source coordinates
      // Top edge: interpolate between TL and TR
      const topX = tl[0] + u * (tr[0] - tl[0]);
      const topY = tl[1] + u * (tr[1] - tl[1]);
      
      // Bottom edge: interpolate between BL and BR
      const bottomX = bl[0] + u * (br[0] - bl[0]);
      const bottomY = bl[1] + u * (br[1] - bl[1]);
      
      // Final source coordinates
      const sx = topX + v * (bottomX - topX);
      const sy = topY + v * (bottomY - topY);
      
      // Bilinear sample from source
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(x0 + 1, srcW - 1);
      const y1 = Math.min(y0 + 1, srcH - 1);
      const fx = sx - x0;
      const fy = sy - y0;
      
      if (x0 >= 0 && x0 < srcW && y0 >= 0 && y0 < srcH) {
        const dstIdx = (dy * outputWidth + dx) * 4;
        
        for (let c = 0; c < 4; c++) {
          const v00 = srcData.data[(y0 * srcW + x0) * 4 + c];
          const v10 = srcData.data[(y0 * srcW + x1) * 4 + c];
          const v01 = srcData.data[(y1 * srcW + x0) * 4 + c];
          const v11 = srcData.data[(y1 * srcW + x1) * 4 + c];
          
          const value = 
            v00 * (1 - fx) * (1 - fy) +
            v10 * fx * (1 - fy) +
            v01 * (1 - fx) * fy +
            v11 * fx * fy;
          
          dstData.data[dstIdx + c] = Math.round(value);
        }
      }
    }
  }
  
  dstCtx.putImageData(dstData, 0, 0);
  return outputCanvas;
}

/**
 * Upscale canvas using bicubic-like interpolation
 */
function upscaleCanvas(
  canvas: HTMLCanvasElement,
  scale: number = 1.5
): HTMLCanvasElement {
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = Math.round(canvas.width * scale);
  outputCanvas.height = Math.round(canvas.height * scale);
  const ctx = outputCanvas.getContext("2d");
  if (!ctx) return canvas;
  
  // Enable image smoothing for better quality
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvas, 0, 0, outputCanvas.width, outputCanvas.height);
  
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
  
  // Work on a smaller version for speed
  const maxDim = 600;
  const scale = Math.min(1, maxDim / Math.max(srcCanvas.width, srcCanvas.height));
  
  const processCanvas = document.createElement("canvas");
  processCanvas.width = Math.round(srcCanvas.width * scale);
  processCanvas.height = Math.round(srcCanvas.height * scale);
  const processCtx = processCanvas.getContext("2d");
  if (!processCtx) return null;
  processCtx.drawImage(srcCanvas, 0, 0, processCanvas.width, processCanvas.height);
  
  // Apply blur to reduce noise
  let imageData = processCtx.getImageData(0, 0, processCanvas.width, processCanvas.height);
  imageData = gaussianBlur(imageData, 1);
  
  // Edge detection
  const edges = sobelEdgeDetection(imageData);
  
  // Find quadrilateral
  const corners = findLargestQuad(edges, processCanvas.width, processCanvas.height);
  
  if (!corners) {
    return null;
  }
  
  // Scale corners back to original size
  const originalCorners = corners.map(c => [
    Math.round(c[0] / scale),
    Math.round(c[1] / scale),
  ]);
  
  // Apply perspective transform to get rectangular output
  let result = perspectiveTransform(srcCanvas, originalCorners, outputWidth, outputHeight);
  
  // Upscale for better quality
  result = upscaleCanvas(result, 1.2);
  
  return result;
}

/**
 * Apply sharpening using unsharp mask
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
  
  // Enhanced sharpening kernel
  const kernel = [-1, -1, -1, -1, 9, -1, -1, -1, -1];
  
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
  
  if (sharpness > 0) {
    canvas = sharpenImage(canvas, sharpness / 100);
  }
  
  if (brightness !== 100 || contrast !== 100 || grayscale) {
    canvas = applyDocumentFilter(canvas, brightness, contrast, grayscale);
  }
  
  return canvas;
}
