/**
 * Document Scanner Utilities
 * Uses OpenCV.js for edge detection, perspective correction, and image enhancement
 */

let cv: any = null;
let cvLoadingPromise: Promise<any> | null = null;

/**
 * Initialize OpenCV.js (lazy loaded on first use)
 */
export async function initOpenCV(): Promise<any> {
  if (cv) return cv;
  
  if (cvLoadingPromise) {
    return cvLoadingPromise;
  }
  
  cvLoadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://docs.opencv.org/4.9.0/opencv.js";
    script.async = true;
    
    script.onload = () => {
      // Wait for cv to be ready
      const checkReady = () => {
        if ((window as any).cv && (window as any).cv.Mat) {
          cv = (window as any).cv;
          resolve(cv);
        } else if ((window as any).cv) {
          // cv exists but not fully loaded, check onRuntimeInitialized
          (window as any).cv.onRuntimeInitialized = () => {
            cv = (window as any).cv;
            resolve(cv);
          };
        } else {
          setTimeout(checkReady, 50);
        }
      };
      checkReady();
    };
    
    script.onerror = () => {
      cvLoadingPromise = null;
      reject(new Error("Failed to load OpenCV.js"));
    };
    
    document.head.appendChild(script);
  });
  
  return cvLoadingPromise;
}

/**
 * Order corners in consistent order: top-left, top-right, bottom-right, bottom-left
 */
function orderCorners(points: number[][]): number[][] {
  // Sort by y-coordinate to get top and bottom pairs
  const sorted = [...points].sort((a, b) => a[1] - b[1]);
  const topTwo = sorted.slice(0, 2);
  const bottomTwo = sorted.slice(2, 4);
  
  // Sort each pair by x-coordinate
  topTwo.sort((a, b) => a[0] - b[0]);
  bottomTwo.sort((a, b) => a[0] - b[0]);
  
  return [
    topTwo[0],     // top-left
    topTwo[1],     // top-right
    bottomTwo[1],  // bottom-right
    bottomTwo[0],  // bottom-left
  ];
}

/**
 * Extract corner points from a contour Mat
 */
function extractPoints(contour: any): number[][] {
  const points: number[][] = [];
  for (let i = 0; i < contour.rows; i++) {
    points.push([contour.data32S[i * 2], contour.data32S[i * 2 + 1]]);
  }
  return points;
}

/**
 * Detect document edges and apply perspective transform
 * Returns a cropped and straightened canvas, or null if no document found
 */
export async function detectAndCropDocument(
  imageElement: HTMLImageElement | HTMLCanvasElement,
  outputWidth: number = 850,
  outputHeight: number = 1100
): Promise<HTMLCanvasElement | null> {
  const cvInstance = await initOpenCV();
  
  // Create source canvas if needed
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
  
  // Load image into OpenCV Mat
  const srcMat = cvInstance.imread(srcCanvas);
  
  // Store original for final warp
  const originalMat = srcMat.clone();
  
  try {
    // Resize for faster processing if image is large
    const maxDim = 1000;
    const scale = Math.min(1, maxDim / Math.max(srcMat.cols, srcMat.rows));
    const scaledMat = new cvInstance.Mat();
    
    if (scale < 1) {
      cvInstance.resize(srcMat, scaledMat, new cvInstance.Size(
        Math.round(srcMat.cols * scale),
        Math.round(srcMat.rows * scale)
      ));
    } else {
      srcMat.copyTo(scaledMat);
    }
    
    // Convert to grayscale
    const grayMat = new cvInstance.Mat();
    cvInstance.cvtColor(scaledMat, grayMat, cvInstance.COLOR_RGBA2GRAY);
    
    // Apply Gaussian blur to reduce noise
    const blurredMat = new cvInstance.Mat();
    cvInstance.GaussianBlur(grayMat, blurredMat, new cvInstance.Size(5, 5), 0);
    
    // Edge detection with Canny
    const cannyMat = new cvInstance.Mat();
    cvInstance.Canny(blurredMat, cannyMat, 50, 150);
    
    // Dilate to connect edges
    const dilatedMat = new cvInstance.Mat();
    const kernel = cvInstance.Mat.ones(3, 3, cvInstance.CV_8U);
    cvInstance.dilate(cannyMat, dilatedMat, kernel);
    
    // Find contours
    const contours = new cvInstance.MatVector();
    const hierarchy = new cvInstance.Mat();
    cvInstance.findContours(
      dilatedMat, 
      contours, 
      hierarchy, 
      cvInstance.RETR_LIST, 
      cvInstance.CHAIN_APPROX_SIMPLE
    );
    
    // Find the largest 4-point contour (document)
    let bestContour: any = null;
    let maxArea = (scaledMat.cols * scaledMat.rows) * 0.1; // At least 10% of image
    
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cvInstance.contourArea(contour);
      
      if (area < maxArea) continue;
      
      const peri = cvInstance.arcLength(contour, true);
      const approx = new cvInstance.Mat();
      cvInstance.approxPolyDP(contour, approx, 0.02 * peri, true);
      
      if (approx.rows === 4 && area > maxArea) {
        maxArea = area;
        if (bestContour) bestContour.delete();
        bestContour = approx;
      } else {
        approx.delete();
      }
    }
    
    // Cleanup intermediate mats
    scaledMat.delete();
    grayMat.delete();
    blurredMat.delete();
    cannyMat.delete();
    dilatedMat.delete();
    kernel.delete();
    contours.delete();
    hierarchy.delete();
    
    if (!bestContour) {
      srcMat.delete();
      originalMat.delete();
      return null;
    }
    
    // Extract and order corners (scale back to original size)
    const scaledPoints = extractPoints(bestContour);
    const originalPoints = scaledPoints.map(p => [
      Math.round(p[0] / scale),
      Math.round(p[1] / scale)
    ]);
    const orderedCorners = orderCorners(originalPoints);
    bestContour.delete();
    
    // Create source and destination point arrays for perspective transform
    const srcCoords = cvInstance.matFromArray(4, 1, cvInstance.CV_32FC2, [
      orderedCorners[0][0], orderedCorners[0][1],
      orderedCorners[1][0], orderedCorners[1][1],
      orderedCorners[2][0], orderedCorners[2][1],
      orderedCorners[3][0], orderedCorners[3][1],
    ]);
    
    const dstCoords = cvInstance.matFromArray(4, 1, cvInstance.CV_32FC2, [
      0, 0,
      outputWidth, 0,
      outputWidth, outputHeight,
      0, outputHeight,
    ]);
    
    // Get perspective transform matrix
    const M = cvInstance.getPerspectiveTransform(srcCoords, dstCoords);
    
    // Apply perspective transform
    const dstMat = new cvInstance.Mat();
    cvInstance.warpPerspective(
      originalMat, 
      dstMat, 
      M, 
      new cvInstance.Size(outputWidth, outputHeight)
    );
    
    // Output to canvas
    const outputCanvas = document.createElement("canvas");
    outputCanvas.width = outputWidth;
    outputCanvas.height = outputHeight;
    cvInstance.imshow(outputCanvas, dstMat);
    
    // Cleanup
    srcMat.delete();
    originalMat.delete();
    srcCoords.delete();
    dstCoords.delete();
    M.delete();
    dstMat.delete();
    
    return outputCanvas;
  } catch (error) {
    console.error("Document detection error:", error);
    srcMat.delete();
    originalMat.delete();
    return null;
  }
}

/**
 * Apply sharpening to canvas using convolution (Unsharp Mask)
 * @param canvas - The canvas to sharpen
 * @param intensity - Sharpening intensity (0-1)
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
  
  // Sharpening kernel (Laplacian-based)
  const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
  
  // Apply convolution
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      for (let c = 0; c < 3; c++) { // R, G, B channels
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
        
        // Blend sharpened with original based on intensity
        const sharpened = sum * intensity + src[srcIdx] * (1 - intensity);
        dst[dstIdx] = Math.min(255, Math.max(0, Math.round(sharpened)));
      }
      // Copy alpha channel
      const alphaIdx = (y * w + x) * 4 + 3;
      dst[alphaIdx] = src[alphaIdx];
    }
  }
  
  // Copy edge pixels (not processed by convolution)
  for (let x = 0; x < w; x++) {
    for (let c = 0; c < 4; c++) {
      dst[x * 4 + c] = src[x * 4 + c]; // Top row
      dst[((h - 1) * w + x) * 4 + c] = src[((h - 1) * w + x) * 4 + c]; // Bottom row
    }
  }
  for (let y = 0; y < h; y++) {
    for (let c = 0; c < 4; c++) {
      dst[(y * w) * 4 + c] = src[(y * w) * 4 + c]; // Left column
      dst[(y * w + w - 1) * 4 + c] = src[(y * w + w - 1) * 4 + c]; // Right column
    }
  }
  
  // Create output canvas
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = w;
  outputCanvas.height = h;
  const outCtx = outputCanvas.getContext("2d");
  if (outCtx) {
    outCtx.putImageData(dstData, 0, 0);
  }
  
  return outputCanvas;
}

/**
 * Apply adaptive thresholding for a "scanned document" look
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
  
  // Build filter string
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
      // Fall back to original image
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
    // Just copy the image to canvas
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
  
  // Step 2: Apply sharpening if requested
  if (sharpness > 0) {
    canvas = sharpenImage(canvas, sharpness / 100);
  }
  
  // Step 3: Apply brightness/contrast/grayscale filters
  if (brightness !== 100 || contrast !== 100 || grayscale) {
    canvas = applyDocumentFilter(canvas, brightness, contrast, grayscale);
  }
  
  return canvas;
}
