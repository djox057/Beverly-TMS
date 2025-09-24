declare module 'pdfjs-dist' {
  export interface PDFDocumentProxy {
    numPages: number;
    getPage(pageNumber: number): Promise<PDFPageProxy>;
  }

  export interface PDFPageProxy {
    getViewport(params: { scale: number }): PageViewport;
    render(params: RenderParameters): RenderTask;
  }

  export interface PageViewport {
    width: number;
    height: number;
  }

  export interface RenderParameters {
    canvasContext: CanvasRenderingContext2D;
    viewport: PageViewport;
    canvas?: HTMLCanvasElement;
  }

  export interface RenderTask {
    promise: Promise<void>;
  }

  export const GlobalWorkerOptions: {
    workerSrc: string;
  };

  export function getDocument(params: { data: Uint8Array }): {
    promise: Promise<PDFDocumentProxy>;
  };

  export const version: string;
}