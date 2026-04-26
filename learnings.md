# Learnings

### 2026-04-25 — pdf-parse v2 has a class-based API
**Ref:** Architecture > src/ingest/pdf.ts
- **What:** `pdf-parse@2.4.5` exports `{ PDFParse }` class, not a default function. v1 was `pdfParse(buf) -> {text}`; v2 is `new PDFParse({ data: buf }).getText() -> TextResult{ text, pages[] }`.
- **Why it matters:** Most online docs / blog posts still reference v1 default-function API. Using `import pdfParse from "pdf-parse"` then calling it errors with "is not a function".
- **Fix/Pattern:** `import { PDFParse } from "pdf-parse"; const p = new PDFParse({ data: buf }); const r = await p.getText(); await p.destroy();` Always call destroy() in a finally block — it cleans up the underlying pdfjs document.
