/**
 * Document Scanner Utilities
 * Canvas-based document detection and perspective correction
 */

/**
 * Threshold image to find bright regions (paper)
 */
function thresholdBrightness(imageData: ImageData, threshold: number = 150): Uint8Array {
  const w = imageData.width;
  const h = imageData.height;
  const src = imageData.data;
  const mask = new Uint8Array(w * h);
  
  for (let i = 0; i < w * h; i++) {
    const idx = i * 4;
    // Calculate brightness (simple average)
    const brightness = (src[idx] + src[idx + 1] + src[idx + 2]) / 3;
    mask[i] = brightness > threshold ? 255 : 0;
  }
  
  return mask;
}

/**
 * Dilate mask to fill small gaps
 */
function dilateMask(mask: Uint8Array, w: number, h: number, radius: number = 3): Uint8Array {
  const result = new Uint8Array(mask.length);
  
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let found = false;
      for (let dy = -radius; dy <= radius && !found; dy++) {
        for (let dx = -radius; dx <= radius && !found; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
            if (mask[ny * w + nx] > 0) {
              found = true;
            }
          }
        }
      }
      result[y * w + x] = found ? 255 : 0;
    }
  }
  
  return result;
}

/**
 * Erode mask to remove small noise
 */
function erodeMask(mask: Uint8Array, w: number, h: number, radius: number = 2): Uint8Array {
  const result = new Uint8Array(mask.length);
  
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let allSet = true;
      for (let dy = -radius; dy <= radius && allSet; dy++) {
        for (let dx = -radius; dx <= radius && allSet; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
            if (mask[ny * w + nx] === 0) {
              allSet = false;
            }
          } else {
            allSet = false;
          }
        }
      }
      result[y * w + x] = allSet ? 255 : 0;
    }
  }
  
  return result;
}

/**
 * Find the largest connected component in the mask
 */
function findLargestComponent(mask: Uint8Array, w: number, h: number): Uint8Array {
  const visited = new Uint8Array(mask.length);
  const components: { start: number; pixels: number[] }[] = [];
  
  // Find all connected components
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] > 0 && visited[i] === 0) {
      const pixels: number[] = [];
      const stack = [i];
      
      while (stack.length > 0) {
        const p = stack.pop()!;
        if (visited[p] > 0) continue;
        visited[p] = 1;
        pixels.push(p);
        
        const x = p % w;
        const y = Math.floor(p / w);
        
        // Check 4-connected neighbors
        if (x > 0 && mask[p - 1] > 0 && visited[p - 1] === 0) stack.push(p - 1);
        if (x < w - 1 && mask[p + 1] > 0 && visited[p + 1] === 0) stack.push(p + 1);
        if (y > 0 && mask[p - w] > 0 && visited[p - w] === 0) stack.push(p - w);
        if (y < h - 1 && mask[p + w] > 0 && visited[p + w] === 0) stack.push(p + w);
      }
      
      components.push({ start: i, pixels });
    }
  }
  
  if (components.length === 0) return mask;
  
  // Find largest
  let largest = components[0];
  for (const comp of components) {
    if (comp.pixels.length > largest.pixels.length) {
      largest = comp;
    }
  }
  
  // Create mask with only largest component
  const result = new Uint8Array(mask.length);
  for (const p of largest.pixels) {
    result[p] = 255;
  }
  
  return result;
}

/**
 * Find boundary points of the bright region
 */
function findBoundaryPoints(mask: Uint8Array, w: number, h: number): number[][] {
  const points: number[][] = [];
  
  // Sample points along edges for performance
  const step = 1;
  
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      if (mask[y * w + x] > 0) {
        // Check if this is a boundary pixel (has a dark neighbor)
        let isBoundary = false;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
          isBoundary = true;
        } else {
          for (let dy = -1; dy <= 1 && !isBoundary; dy++) {
            for (let dx = -1; dx <= 1 && !isBoundary; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nx = x + dx;
              const ny = y + dy;
              if (mask[ny * w + nx] === 0) {
                isBoundary = true;
              }
            }
          }
        }
        if (isBoundary) {
          points.push([x, y]);
        }
      }
    }
  }
  
  return points;
}

/**
 * Find the 4 corners of a quadrilateral from boundary points
 * Uses the approach of finding points closest to diagonal lines from image corners
 */
function findQuadCorners(points: number[][], w: number, h: number): number[][] | null {
  if (points.length < 20) return null;
  
  // Find extreme points using sum and difference of coordinates
  // This works well for finding corners of a tilted rectangle
  
  let minSum = Infinity, maxSum = -Infinity;
  let minDiff = Infinity, maxDiff = -Infinity;
  let tlPoint: number[] = points[0];
  let brPoint: number[] = points[0];
  let trPoint: number[] = points[0];
  let blPoint: number[] = points[0];
  
  for (const p of points) {
    const sum = p[0] + p[1];
    const diff = p[0] - p[1];
    
    // Top-left has minimum sum (x + y)
    if (sum < minSum) {
      minSum = sum;
      tlPoint = p;
    }
    // Bottom-right has maximum sum (x + y)
    if (sum > maxSum) {
      maxSum = sum;
      brPoint = p;
    }
    // Top-right has maximum difference (x - y)
    if (diff > maxDiff) {
      maxDiff = diff;
      trPoint = p;
    }
    // Bottom-left has minimum difference (x - y)
    if (diff < minDiff) {
      minDiff = diff;
      blPoint = p;
    }
  }
  
  // Verify we got 4 distinct corners
  const corners = [tlPoint, trPoint, brPoint, blPoint];
  
  // Check minimum area (at least 5% of image)
  const area = polygonArea(corners);
  if (area < w * h * 0.05) {
    return null;
  }
  
  // Check that corners are reasonably spread
  const minDist = Math.min(w, h) * 0.1;
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const dist = Math.sqrt(
      (corners[i][0] - corners[j][0]) ** 2 + 
      (corners[i][1] - corners[j][1]) ** 2
    );
    if (dist < minDist) {
      return null;
    }
  }
  
  return corners;
}

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
 * Apply perspective transform - maps quadrilateral to rectangle
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
      // Normalized coordinates (0 to 1)
      const u = dx / (outputWidth - 1);
      const v = dy / (outputHeight - 1);
      
      // Bilinear interpolation to find source coordinates
      const topX = tl[0] + u * (tr[0] - tl[0]);
      const topY = tl[1] + u * (tr[1] - tl[1]);
      const bottomX = bl[0] + u * (br[0] - bl[0]);
      const bottomY = bl[1] + u * (br[1] - bl[1]);
      
      const sx = topX + v * (bottomX - topX);
      const sy = topY + v * (bottomY - topY);
      
      // Bilinear sampling from source
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
 * Detect document and apply perspective correction
 */
export async function detectAndCropDocument(
  imageElement: HTMLImageElement | HTMLCanvasElement
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
  
  // Work on smaller version for speed
  const maxDim = 600;
  const scale = Math.min(1, maxDim / Math.max(srcCanvas.width, srcCanvas.height));
  
  const processCanvas = document.createElement("canvas");
  processCanvas.width = Math.round(srcCanvas.width * scale);
  processCanvas.height = Math.round(srcCanvas.height * scale);
  const processCtx = processCanvas.getContext("2d");
  if (!processCtx) return null;
  processCtx.drawImage(srcCanvas, 0, 0, processCanvas.width, processCanvas.height);
  
  const imageData = processCtx.getImageData(0, 0, processCanvas.width, processCanvas.height);
  const w = processCanvas.width;
  const h = processCanvas.height;
  
  // Step 1: Threshold to find bright regions (paper is usually bright)
  let mask = thresholdBrightness(imageData, 140);
  
  // Step 2: Clean up mask with morphological operations
  mask = erodeMask(mask, w, h, 2);
  mask = dilateMask(mask, w, h, 4);
  mask = erodeMask(mask, w, h, 2);
  
  // Step 3: Keep only the largest connected component (the paper)
  mask = findLargestComponent(mask, w, h);
  
  // Step 4: Find boundary points of bright region
  const boundaryPoints = findBoundaryPoints(mask, w, h);
  
  if (boundaryPoints.length < 50) {
    // Try with lower threshold
    mask = thresholdBrightness(imageData, 100);
    mask = erodeMask(mask, w, h, 2);
    mask = dilateMask(mask, w, h, 4);
    mask = findLargestComponent(mask, w, h);
    const retryPoints = findBoundaryPoints(mask, w, h);
    if (retryPoints.length < 50) {
      console.log("Not enough boundary points found");
      return null;
    }
    boundaryPoints.length = 0;
    boundaryPoints.push(...retryPoints);
  }
  
  // Step 5: Find 4 corners
  const corners = findQuadCorners(boundaryPoints, w, h);
  
  if (!corners) {
    console.log("Could not find 4 corners");
    return null;
  }
  
  // Scale corners back to original size
  const originalCorners = corners.map(c => [
    c[0] / scale,
    c[1] / scale,
  ]);
  
  // Calculate output dimensions based on detected document
  const topWidth = Math.sqrt(
    Math.pow(originalCorners[1][0] - originalCorners[0][0], 2) +
    Math.pow(originalCorners[1][1] - originalCorners[0][1], 2)
  );
  const bottomWidth = Math.sqrt(
    Math.pow(originalCorners[2][0] - originalCorners[3][0], 2) +
    Math.pow(originalCorners[2][1] - originalCorners[3][1], 2)
  );
  const leftHeight = Math.sqrt(
    Math.pow(originalCorners[3][0] - originalCorners[0][0], 2) +
    Math.pow(originalCorners[3][1] - originalCorners[0][1], 2)
  );
  const rightHeight = Math.sqrt(
    Math.pow(originalCorners[2][0] - originalCorners[1][0], 2) +
    Math.pow(originalCorners[2][1] - originalCorners[1][1], 2)
  );
  
  const outputWidth = Math.round(Math.max(topWidth, bottomWidth));
  const outputHeight = Math.round(Math.max(leftHeight, rightHeight));
  
  // Ensure minimum quality
  const minDim = 800;
  let finalWidth = outputWidth;
  let finalHeight = outputHeight;
  if (finalWidth < minDim || finalHeight < minDim) {
    const upscale = minDim / Math.min(finalWidth, finalHeight);
    finalWidth = Math.round(finalWidth * upscale);
    finalHeight = Math.round(finalHeight * upscale);
  }
  
  // Step 6: Apply perspective transform
  const result = perspectiveTransform(srcCanvas, originalCorners, finalWidth, finalHeight);
  
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
  
  // Sharpening kernel
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
 * Process a document with all enhancements
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
