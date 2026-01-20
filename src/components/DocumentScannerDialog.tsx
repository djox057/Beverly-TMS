import { useState, useRef, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, RotateCcw, Check, X, Loader2, SwitchCamera, ZoomIn, ZoomOut } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";

interface DocumentScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCapture: (file: File) => void;
  category: "POD" | "ADDITIONAL";
}

type ScanStep = "camera" | "processing" | "preview";

export const DocumentScannerDialog = ({
  open,
  onOpenChange,
  onCapture,
  category,
}: DocumentScannerDialogProps) => {
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scannerRef = useRef<any>(null);
  const animationFrameRef = useRef<number | null>(null);

  const [step, setStep] = useState<ScanStep>("camera");
  const [processedImageUrl, setProcessedImageUrl] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [isInitializing, setIsInitializing] = useState(true);
  
  // Enhancement controls
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [grayscale, setGrayscale] = useState(false);

  // Initialize scanner
  useEffect(() => {
    const loadScanner = async () => {
      try {
        const jscanify = (await import("jscanify")).default;
        scannerRef.current = new jscanify();
      } catch (err) {
        console.error("Failed to load jscanify:", err);
      }
    };
    loadScanner();
  }, []);

  // Start camera when dialog opens
  const startCamera = useCallback(async () => {
    setIsInitializing(true);
    setCameraError(null);

    try {
      // Stop any existing stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setIsInitializing(false);
    } catch (err: any) {
      console.error("Camera access error:", err);
      setIsInitializing(false);

      if (err.name === "NotAllowedError") {
        setCameraError(
          "Camera access was denied. Please allow camera access in your browser settings and try again."
        );
      } else if (err.name === "NotFoundError") {
        setCameraError("No camera found on this device.");
      } else {
        setCameraError("Failed to access camera: " + err.message);
      }
    }
  }, [facingMode]);

  // Edge detection loop
  const startEdgeDetection = useCallback(() => {
    const detectEdges = () => {
      if (!videoRef.current || !overlayCanvasRef.current || !scannerRef.current) {
        animationFrameRef.current = requestAnimationFrame(detectEdges);
        return;
      }

      const video = videoRef.current;
      const canvas = overlayCanvasRef.current;
      const ctx = canvas.getContext("2d");

      if (!ctx || video.readyState !== 4) {
        animationFrameRef.current = requestAnimationFrame(detectEdges);
        return;
      }

      // Match canvas size to video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // Draw video frame
      ctx.drawImage(video, 0, 0);

      // Highlight detected paper edges
      try {
        scannerRef.current.highlightPaper(canvas);
      } catch (err) {
        // Edge detection failed, just show video without overlay
      }

      animationFrameRef.current = requestAnimationFrame(detectEdges);
    };

    detectEdges();
  }, []);

  // Start/stop camera based on dialog state
  useEffect(() => {
    if (open && step === "camera") {
      startCamera().then(() => {
        startEdgeDetection();
      });
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [open, step, startCamera, startEdgeDetection]);

  // Cleanup on dialog close
  useEffect(() => {
    if (!open) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      setStep("camera");
      setProcessedImageUrl(null);
      setCameraError(null);
      setBrightness(100);
      setContrast(100);
      setGrayscale(false);
    }
  }, [open]);

  const handleCapture = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    setStep("processing");

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      // Try to extract and crop the paper
      let resultCanvas: HTMLCanvasElement;
      
      if (scannerRef.current) {
        try {
          // Extract paper with perspective correction
          // Output at A4-ish aspect ratio (roughly 8.5x11 scaled)
          resultCanvas = scannerRef.current.extractPaper(video, 850, 1100);
        } catch (err) {
          console.log("Edge detection failed, using full frame capture");
          // Fallback: just capture the full frame
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(video, 0, 0);
          resultCanvas = canvas;
        }
      } else {
        // No scanner available, use raw capture
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(video, 0, 0);
        resultCanvas = canvas;
      }

      // Convert to data URL for preview
      const dataUrl = resultCanvas.toDataURL("image/jpeg", 0.92);
      setProcessedImageUrl(dataUrl);
      setStep("preview");

      // Stop the camera stream while previewing
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    } catch (err) {
      console.error("Capture error:", err);
      toast({
        title: "Capture Failed",
        description: "Failed to capture document. Please try again.",
        variant: "destructive",
      });
      setStep("camera");
    }
  };

  const handleRetake = () => {
    setProcessedImageUrl(null);
    setBrightness(100);
    setContrast(100);
    setGrayscale(false);
    setStep("camera");
  };

  const handleAccept = async () => {
    if (!processedImageUrl) return;

    try {
      // Apply enhancements to the final image
      const img = new Image();
      img.src = processedImageUrl;
      await new Promise((resolve) => {
        img.onload = resolve;
      });

      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      
      if (ctx) {
        // Apply CSS filters via canvas
        ctx.filter = `brightness(${brightness}%) contrast(${contrast}%)${grayscale ? " grayscale(100%)" : ""}`;
        ctx.drawImage(img, 0, 0);
      }

      // Convert canvas to blob
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => {
            if (b) resolve(b);
            else reject(new Error("Failed to create blob"));
          },
          "image/jpeg",
          0.92
        );
      });

      // Create file with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `scanned_${category.toLowerCase()}_${timestamp}.jpg`;
      const file = new File([blob], filename, { type: "image/jpeg" });

      onCapture(file);
      onOpenChange(false);
      
      toast({
        title: "Document Scanned",
        description: "Document has been captured successfully.",
      });
    } catch (err) {
      console.error("Accept error:", err);
      toast({
        title: "Error",
        description: "Failed to process the scanned document.",
        variant: "destructive",
      });
    }
  };

  const toggleCamera = () => {
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  };

  // Get preview image style with enhancements
  const getPreviewStyle = (): React.CSSProperties => ({
    filter: `brightness(${brightness}%) contrast(${contrast}%)${grayscale ? " grayscale(100%)" : ""}`,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            Scan {category === "POD" ? "POD" : "Additional"} Document
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Camera View */}
          {step === "camera" && (
            <div className="relative">
              {isInitializing && (
                <div className="absolute inset-0 flex items-center justify-center bg-muted rounded-lg z-10">
                  <div className="text-center space-y-2">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                    <p className="text-sm text-muted-foreground">Starting camera...</p>
                  </div>
                </div>
              )}

              {cameraError && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-center">
                  <X className="h-8 w-8 mx-auto text-destructive mb-2" />
                  <p className="text-sm text-destructive">{cameraError}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => startCamera()}
                  >
                    Try Again
                  </Button>
                </div>
              )}

              {!cameraError && (
                <>
                  <div className="relative rounded-lg overflow-hidden bg-black aspect-[4/3]">
                    <video
                      ref={videoRef}
                      className="absolute inset-0 w-full h-full object-cover"
                      playsInline
                      muted
                    />
                    <canvas
                      ref={overlayCanvasRef}
                      className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                    />
                    {/* Corner guides */}
                    <div className="absolute inset-4 border-2 border-white/30 rounded-lg pointer-events-none">
                      <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-lg" />
                      <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-lg" />
                      <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-lg" />
                      <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-lg" />
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground text-center mt-2">
                    Position the document within the frame. Edges will be detected automatically.
                  </p>

                  <div className="flex justify-center gap-3 mt-4">
                    <Button variant="outline" size="icon" onClick={toggleCamera}>
                      <SwitchCamera className="h-4 w-4" />
                    </Button>
                    <Button
                      size="lg"
                      className="px-8"
                      onClick={handleCapture}
                      disabled={isInitializing}
                    >
                      <Camera className="h-5 w-5 mr-2" />
                      Capture
                    </Button>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                      Cancel
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Processing State */}
          {step === "processing" && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center space-y-3">
                <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" />
                <p className="text-sm text-muted-foreground">Processing document...</p>
              </div>
            </div>
          )}

          {/* Preview */}
          {step === "preview" && processedImageUrl && (
            <div className="space-y-4">
              <div className="rounded-lg overflow-hidden border bg-muted">
                <img
                  src={processedImageUrl}
                  alt="Scanned document"
                  className="w-full h-auto max-h-[400px] object-contain"
                  style={getPreviewStyle()}
                />
              </div>

              {/* Enhancement controls */}
              <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Enhancements</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setBrightness(100);
                      setContrast(100);
                      setGrayscale(false);
                    }}
                  >
                    Reset
                  </Button>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <Label className="text-xs w-20">Brightness</Label>
                    <Slider
                      value={[brightness]}
                      onValueChange={([v]) => setBrightness(v)}
                      min={50}
                      max={150}
                      step={5}
                      className="flex-1"
                    />
                    <span className="text-xs w-10 text-right">{brightness}%</span>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <Label className="text-xs w-20">Contrast</Label>
                    <Slider
                      value={[contrast]}
                      onValueChange={([v]) => setContrast(v)}
                      min={50}
                      max={150}
                      step={5}
                      className="flex-1"
                    />
                    <span className="text-xs w-10 text-right">{contrast}%</span>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <Label className="text-xs w-20">Grayscale</Label>
                    <Button
                      variant={grayscale ? "default" : "outline"}
                      size="sm"
                      onClick={() => setGrayscale(!grayscale)}
                    >
                      {grayscale ? "On" : "Off"}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex justify-center gap-3">
                <Button variant="outline" onClick={handleRetake}>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Retake
                </Button>
                <Button onClick={handleAccept}>
                  <Check className="h-4 w-4 mr-2" />
                  Accept & Save
                </Button>
              </div>
            </div>
          )}

          {/* Hidden canvas for capture processing */}
          <canvas ref={canvasRef} className="hidden" />
        </div>
      </DialogContent>
    </Dialog>
  );
};
