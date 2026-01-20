import { useState, useRef, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RotateCcw, Check, Loader2, Wand2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";

interface DocumentEnhanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (file: File) => void;
  fileUrl: string;
  fileName: string;
}

export const DocumentEnhanceDialog = ({
  open,
  onOpenChange,
  onSave,
  fileUrl,
  fileName,
}: DocumentEnhanceDialogProps) => {
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scannerRef = useRef<any>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);
  const [processedImageUrl, setProcessedImageUrl] = useState<string | null>(null);
  const [isPdf, setIsPdf] = useState(false);

  // Enhancement controls
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [grayscale, setGrayscale] = useState(false);
  const [autoCropped, setAutoCropped] = useState(false);

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

  // Load the image when dialog opens
  useEffect(() => {
    if (!open || !fileUrl) return;

    setIsLoading(true);
    setAutoCropped(false);
    setBrightness(100);
    setContrast(100);
    setGrayscale(false);

    // Check if it's a PDF
    const isPdfFile = fileName.toLowerCase().endsWith(".pdf") || fileUrl.includes(".pdf");
    setIsPdf(isPdfFile);

    if (isPdfFile) {
      // For PDFs, we can't process them directly - show a message
      setIsLoading(false);
      setOriginalImageUrl(null);
      setProcessedImageUrl(null);
      return;
    }

    // Load the image
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imageRef.current = img;
      setOriginalImageUrl(fileUrl);
      setProcessedImageUrl(fileUrl);
      setIsLoading(false);
    };
    img.onerror = () => {
      toast({
        title: "Error",
        description: "Failed to load image for processing",
        variant: "destructive",
      });
      setIsLoading(false);
    };
    img.src = fileUrl;
  }, [open, fileUrl, fileName, toast]);

  // Cleanup on close
  useEffect(() => {
    if (!open) {
      setOriginalImageUrl(null);
      setProcessedImageUrl(null);
      imageRef.current = null;
    }
  }, [open]);

  const handleAutoCrop = async () => {
    if (!imageRef.current || !scannerRef.current || !canvasRef.current) return;

    setIsProcessing(true);

    try {
      // Try to extract and crop the paper
      const resultCanvas = scannerRef.current.extractPaper(imageRef.current, 850, 1100);
      const dataUrl = resultCanvas.toDataURL("image/jpeg", 0.92);
      
      // Update the image ref with the cropped version
      const newImg = new Image();
      newImg.onload = () => {
        imageRef.current = newImg;
        setProcessedImageUrl(dataUrl);
        setAutoCropped(true);
        setIsProcessing(false);
        toast({
          title: "Auto-Crop Applied",
          description: "Document edges detected and cropped",
        });
      };
      newImg.src = dataUrl;
    } catch (err) {
      console.log("Edge detection failed:", err);
      toast({
        title: "Auto-Crop Failed",
        description: "Could not detect document edges. Try adjusting the image manually.",
        variant: "destructive",
      });
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    if (!originalImageUrl) return;
    
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imageRef.current = img;
      setProcessedImageUrl(originalImageUrl);
      setBrightness(100);
      setContrast(100);
      setGrayscale(false);
      setAutoCropped(false);
    };
    img.src = originalImageUrl;
  };

  const handleSave = async () => {
    if (!imageRef.current) return;

    setIsProcessing(true);

    try {
      // Create a canvas with the current image and apply enhancements
      const canvas = document.createElement("canvas");
      canvas.width = imageRef.current.width;
      canvas.height = imageRef.current.height;
      const ctx = canvas.getContext("2d");

      if (ctx) {
        // Apply CSS filters via canvas
        ctx.filter = `brightness(${brightness}%) contrast(${contrast}%)${grayscale ? " grayscale(100%)" : ""}`;
        ctx.drawImage(imageRef.current, 0, 0);
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

      // Create file with enhanced prefix
      const baseName = fileName.replace(/\.[^/.]+$/, "");
      const newFileName = `${baseName}_enhanced.jpg`;
      const file = new File([blob], newFileName, { type: "image/jpeg" });

      onSave(file);
      onOpenChange(false);

      toast({
        title: "Document Enhanced",
        description: "Enhanced document has been added to uploads.",
      });
    } catch (err) {
      console.error("Save error:", err);
      toast({
        title: "Error",
        description: "Failed to save the enhanced document.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Get preview image style with enhancements
  const getPreviewStyle = (): React.CSSProperties => ({
    filter: `brightness(${brightness}%) contrast(${contrast}%)${grayscale ? " grayscale(100%)" : ""}`,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[650px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5" />
            Enhance Document
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center space-y-3">
                <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" />
                <p className="text-sm text-muted-foreground">Loading document...</p>
              </div>
            </div>
          )}

          {!isLoading && isPdf && (
            <div className="text-center py-8 space-y-3">
              <p className="text-muted-foreground">
                PDF files cannot be enhanced directly.
              </p>
              <p className="text-sm text-muted-foreground">
                To enhance a PDF, please convert it to an image first or use the camera scanner to capture a new image.
              </p>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          )}

          {!isLoading && !isPdf && processedImageUrl && (
            <>
              {/* Image Preview */}
              <div className="rounded-lg overflow-hidden border bg-muted">
                <img
                  src={processedImageUrl}
                  alt="Document preview"
                  className="w-full h-auto max-h-[350px] object-contain"
                  style={getPreviewStyle()}
                />
              </div>

              {/* Auto-crop button */}
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  onClick={handleAutoCrop}
                  disabled={isProcessing || autoCropped}
                >
                  {isProcessing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Wand2 className="h-4 w-4 mr-2" />
                  )}
                  {autoCropped ? "Cropped" : "Auto-Crop & Straighten"}
                </Button>
              </div>

              {/* Enhancement controls */}
              <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Enhancements</Label>
                  <Button variant="ghost" size="sm" onClick={handleReset}>
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Reset
                  </Button>
                </div>

                <div className="space-y-3">
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

              {/* Action buttons */}
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={isProcessing}>
                  {isProcessing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4 mr-2" />
                  )}
                  Save Enhanced
                </Button>
              </div>
            </>
          )}

          {/* Hidden canvas for processing */}
          <canvas ref={canvasRef} className="hidden" />
        </div>
      </DialogContent>
    </Dialog>
  );
};
