

## Make Document Files Always Show as List + Draggable

### Problem
When a document category (RC/BOL/POD/Additionals) has only 1 file, clicking opens it directly in a new tab. Users want to drag files to send them (e.g., via email/chat) without downloading first.

### Changes (single file: `src/pages/Reports.tsx`)

**1. Show popover list for single files too (line ~5811, ~5823-5838, ~5861)**

Change the condition `docFiles.length > 1` → `docFiles.length >= 1` in three places:
- Popover open condition (line 5811)
- onClick handler: remove the single-file branch that opens directly; instead show the popover for `docFiles.length >= 1`
- PopoverContent render condition (line 5861)

**2. Make file list items draggable**

In the popover file list items (lines 5866-5888), instead of opening in a new tab on click:
- Add a draggable `<a>` element with the signed URL as `href` and `download` attribute
- Pre-fetch signed URLs when the popover opens so drag works immediately
- On click, still open in new tab as fallback
- The `<a>` tag with `href` + `download` attribute enables native browser drag-to-email/chat functionality

**Implementation detail**: When the popover opens, generate signed URLs for all files in that category and store them in state. Each list item renders as `<a href={signedUrl} download={fileName} draggable="true">` which allows native OS drag-and-drop to email clients, chat apps, etc.

