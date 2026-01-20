import { useState, useRef, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RotateCcw, Check, Loader2, Wand2, Crop } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import {
  detectAndCropDocument,
  processDocument,
} from "@/utils/documentScanner";

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
  const originalImageRef = useRef<HTMLImageElement | null>(null);
  const croppedCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPdf, setIsPdf] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Enhancement controls
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [sharpness, setSharpness] = useState(0);
  const [grayscale, setGrayscale] = useState(false);
  const [autoCropped, setAutoCropped] = useState(false);

  // Load the image when dialog opens
  useEffect(() => {
    if (!open || !fileUrl) return;

    setIsLoading(true);
    setAutoCropped(false);
    setBrightness(100);
    setContrast(100);
    setSharpness(0);
    setGrayscale(false);
    croppedCanvasRef.current = null;

    const isPdfFile = fileName.toLowerCase().endsWith(".pdf") || fileUrl.includes(".pdf");
    setIsPdf(isPdfFile);

    if (isPdfFile) {
      setIsLoading(false);
      setPreviewUrl(null);
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      originalImageRef.current = img;
      setPreviewUrl(fileUrl);
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
      setPreviewUrl(null);
      originalImageRef.current = null;
      croppedCanvasRef.current = null;
    }
  }, [open]);

  // Update preview when enhancement settings change
  const updatePreview = useCallback(async () => {
    const sourceImage = croppedCanvasRef.current || originalImageRef.current;
    if (!sourceImage) return;

    try {
      const canvas = await processDocument(sourceImage, {
        autoCrop: false,
        brightness,
        contrast,
        sharpness,
        grayscale,
      });
      
      setPreviewUrl(canvas.toDataURL("image/jpeg", 0.92));
    } catch (err) {
      console.error("Preview update error:", err);
    }
  }, [brightness, contrast, sharpness, grayscale]);

  // Debounced preview update
  useEffect(() => {
    if (!open || isLoading || isPdf) return;
    
    const timer = setTimeout(() => {
      updatePreview();
    }, 100);
    
    return () => clearTimeout(timer);
  }, [brightness, contrast, sharpness, grayscale, open, isLoading, isPdf, updatePreview]);

  const handleAutoCrop = async () => {
    if (!originalImageRef.current) return;

    setIsProcessing(true);

    try {
      const croppedCanvas = await detectAndCropDocument(originalImageRef.current);
      
      if (croppedCanvas) {
        croppedCanvasRef.current = croppedCanvas;
        setAutoCropped(true);
        
        const enhancedCanvas = await processDocument(croppedCanvas, {
          brightness,
          contrast,
          sharpness,
          grayscale,
        });
        
        setPreviewUrl(enhancedCanvas.toDataURL("image/jpeg", 0.92));
        
        toast({
          title: "Document Cropped",
          description: "Edges detected and perspective corrected",
        });
      } else {
        toast({
          title: "Could Not Detect Document",
          description: "Try adjusting the image or use manual enhancement controls",
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error("Auto-crop error:", err);
      toast({
        title: "Processing Error",
        description: "Failed to process the document",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    setBrightness(100);
    setContrast(100);
    setSharpness(0);
    setGrayscale(false);
    setAutoCropped(false);
    croppedCanvasRef.current = null;
    
    if (originalImageRef.current) {
      setPreviewUrl(fileUrl);
    }
  };

  const handleSave = async () => {
    const sourceImage = croppedCanvasRef.current || originalImageRef.current;
    if (!sourceImage) return;

    setIsProcessing(true);

    try {
      const finalCanvas = await processDocument(sourceImage, {
        brightness,
        contrast,
        sharpness,
        grayscale,
      });

      const blob = await new Promise<Blob>((resolve, reject) => {
        finalCanvas.toBlob(
          (b) => {
            if (b) resolve(b);
            else reject(new Error("Failed to create blob"));
          },
          "image/jpeg",
          0.92
        );
      });

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[1520px] max-h-[95vh] overflow-y-auto">
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
                To enhance a PDF, please convert it to an image first.
              </p>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          )}

          {!isLoading && !isPdf && previewUrl && (
            <div className="flex flex-col md:flex-row gap-4">
              {/* Image Preview - Left side */}
              <div className="flex-1 min-w-0">
                <div className="rounded-lg overflow-hidden border bg-muted h-[550px] md:h-[700px] flex items-center justify-center">
                  <img
                    src={previewUrl}
                    alt="Document preview"
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
              </div>

              {/* Enhancements - Right side */}
              <div className="w-full md:w-64 flex-shrink-0 space-y-4">
                {/* Auto-crop button */}
                <Button
                  variant="outline"
                  onClick={handleAutoCrop}
                  disabled={isProcessing}
                  className="w-full"
                >
                  {isProcessing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Crop className="h-4 w-4 mr-2" />
                  )}
                  {autoCropped ? "Re-detect Edges" : "Detect & Crop"}
                </Button>

                {/* Enhancement controls */}
                <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Enhancements</Label>
                    <Button variant="ghost" size="sm" onClick={handleReset}>
                      <RotateCcw className="h-3 w-3 mr-1" />
                      Reset
                    </Button>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Brightness</Label>
                        <span className="text-xs text-muted-foreground">{brightness}%</span>
                      </div>
                      <Slider
                        value={[brightness]}
                        onValueChange={([v]) => setBrightness(v)}
                        min={50}
                        max={150}
                        step={5}
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Contrast</Label>
                        <span className="text-xs text-muted-foreground">{contrast}%</span>
                      </div>
                      <Slider
                        value={[contrast]}
                        onValueChange={([v]) => setContrast(v)}
                        min={50}
                        max={150}
                        step={5}
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Sharpness</Label>
                        <span className="text-xs text-muted-foreground">{sharpness}%</span>
                      </div>
                      <Slider
                        value={[sharpness]}
                        onValueChange={([v]) => setSharpness(v)}
                        min={0}
                        max={100}
                        step={10}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Grayscale</Label>
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
                <div className="flex flex-col gap-2">
                  <Button onClick={handleSave} disabled={isProcessing} className="w-full">
                    {isProcessing ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4 mr-2" />
                    )}
                    Save Enhanced
                  </Button>
                  <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full">
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
