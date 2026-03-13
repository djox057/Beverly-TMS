

## Problem

The `<a>` tag with `draggable="true"` and `download` attribute doesn't enable drag-to-external-app (Gmail, etc.) because browsers only support dragging files to external applications when using the native **drag-and-drop DataTransfer API** with a `DownloadURL` type. A simple `<a draggable>` only works for drag within the browser.

Unfortunately, the `DownloadURL` MIME type in `dataTransfer.setData("DownloadURL", ...)` is **only supported in Chromium-based browsers** and requires the format: `mime:filename:url`. Even then, support for dropping into Gmail compose is inconsistent — Gmail compose doesn't accept dragged files from web pages the same way it accepts files from the OS file manager.

## Realistic Approach: Add a Download Button

Since true drag-to-Gmail from a web app is not reliably supported by browsers, the best practical solution is:

1. **Add a download button** (⬇ icon) next to each file in the popover list
2. Clicking the download button triggers an actual file download to the user's computer
3. User can then drag the downloaded file from their Downloads folder / browser download bar into Gmail

Additionally, we can **add `onDragStart` with DataTransfer `DownloadURL`** as a best-effort enhancement for Chromium users — it may work for some desktop email clients.

### Changes (`src/pages/Reports.tsx`)

1. **Add `onDragStart` handler** to each `<a>` element that sets `DownloadURL` data:
   ```tsx
   onDragStart={(e) => {
     if (signedUrl) {
       const contentType = file.content_type || 'application/octet-stream';
       e.dataTransfer.setData('DownloadURL', `${contentType}:${file.file_name}:${signedUrl}`);
     }
   }}
   ```

2. **Add a dedicated download button** (Download icon from lucide) next to each file name that programmatically fetches the blob and triggers a real browser download using `URL.createObjectURL` + hidden `<a>` click:
   ```tsx
   <button onClick={async (e) => {
     e.stopPropagation();
     const response = await fetch(signedUrl);
     const blob = await response.blob();
     const url = URL.createObjectURL(blob);
     const a = document.createElement('a');
     a.href = url; a.download = file.file_name; a.click();
     URL.revokeObjectURL(url);
   }}>
     <Download className="h-4 w-4" />
   </button>
   ```

3. **Update the hint text** from "drag to send" to "download to send" to set correct expectations.

This gives users a fast one-click download, then they can drag from their download bar into Gmail — which is the standard workflow even for most file-sharing web apps.

