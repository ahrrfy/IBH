/**
 * Minimal dependency-free PDF 1.4 emitter for contract bodies (T52).
 *
 * Why not puppeteer / pdfkit?  The task constraint forbids new heavy deps.
 * Contracts are simple Latin/Arabic text documents — we only need:
 *   • single Helvetica font
 *   • A4 page, 1cm margin
 *   • ASCII text (Arabic falls back to glyph substitution at the UI layer;
 *     for now we encode bytes verbatim so Latin merge-fields render correctly
 *     and Arabic flows as raw codepoints — the HTML print-view is the canonical
 *     human render, the PDF is a server-signed archival artifact).
 *
 * Output is a fully-valid PDF with cross-reference table, suitable for
 * `application/pdf` Content-Type.
 *
 * Pure / deterministic — given the same body the byte-for-byte PDF is
 * identical (no timestamps in the file body), making `bodyHash` checks stable.
 */

const PAGE_WIDTH = 595; // A4 in points (72dpi)
const PAGE_HEIGHT = 842;
const MARGIN = 56;
const FONT_SIZE = 11;
const LINE_HEIGHT = 14;
const MAX_CHARS_PER_LINE = 80;

/** Escape a string so it's a safe PDF text-string literal. */
function escapePdfText(s: string): string {
  // Replace non-Latin1 chars with '?' so the standard Helvetica font can render them.
  // Arabic glyphs aren't shaped here — that's why the HTML view is canonical.
  return Array.from(s)
    .map((ch) => {
      const code = ch.charCodeAt(0);
      if (code > 0xff) return '?';
      if (ch === '\\') return '\\\\';
      if (ch === '(') return '\\(';
      if (ch === ')') return '\\)';
      return ch;
    })
    .join('');
}

/** Naive line-wrap on whitespace. Good enough for contract bodies. */
function wrapLines(text: string): string[] {
  const out: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    if (rawLine.length <= MAX_CHARS_PER_LINE) {
      out.push(rawLine);
      continue;
    }
    const words = rawLine.split(/\s+/);
    let cur = '';
    for (const w of words) {
      if (!cur) {
        cur = w;
      } else if ((cur + ' ' + w).length <= MAX_CHARS_PER_LINE) {
        cur = cur + ' ' + w;
      } else {
        out.push(cur);
        cur = w;
      }
    }
    if (cur) out.push(cur);
  }
  return out;
}

function paginate(lines: string[]): string[][] {
  const pageHeight = PAGE_HEIGHT - 2 * MARGIN;
  const linesPerPage = Math.max(1, Math.floor(pageHeight / LINE_HEIGHT));
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += linesPerPage) {
    pages.push(lines.slice(i, i + linesPerPage));
  }
  if (pages.length === 0) pages.push(['']);
  return pages;
}

function buildPageContent(lines: string[]): string {
  const startY = PAGE_HEIGHT - MARGIN;
  const parts: string[] = [];
  parts.push('BT');
  parts.push(`/F1 ${FONT_SIZE} Tf`);
  parts.push(`${LINE_HEIGHT} TL`);
  parts.push(`${MARGIN} ${startY} Td`);
  for (let i = 0; i < lines.length; i++) {
    const escaped = escapePdfText(lines[i]);
    if (i === 0) {
      parts.push(`(${escaped}) Tj`);
    } else {
      parts.push(`T*`);
      parts.push(`(${escaped}) Tj`);
    }
  }
  parts.push('ET');
  return parts.join('\n');
}

/**
 * Emit a deterministic PDF bytestream containing the given text body.
 * The PDF has 1 font (Helvetica), N pages, and no metadata timestamps —
 * so identical input → identical output.
 */
export function renderPdf(body: string): Buffer {
  const wrapped = wrapLines(body);
  const pages = paginate(wrapped);

  // Object IDs:
  // 1: Catalog, 2: Pages, 3: Font, 4..(4+P-1): Page objects, then Content streams
  const numPages = pages.length;
  const pageObjStart = 4;
  const contentObjStart = pageObjStart + numPages;
  const totalObjects = 3 + numPages * 2;

  const pageRefs: string[] = [];
  for (let i = 0; i < numPages; i++) {
    pageRefs.push(`${pageObjStart + i} 0 R`);
  }

  const objects: { id: number; body: string }[] = [];

  // 1: Catalog
  objects.push({ id: 1, body: `<< /Type /Catalog /Pages 2 0 R >>` });
  // 2: Pages
  objects.push({
    id: 2,
    body: `<< /Type /Pages /Count ${numPages} /Kids [${pageRefs.join(' ')}] >>`,
  });
  // 3: Font
  objects.push({
    id: 3,
    body: `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`,
  });

  // Page objects + content streams
  for (let i = 0; i < numPages; i++) {
    const pageId = pageObjStart + i;
    const contentId = contentObjStart + i;
    objects.push({
      id: pageId,
      body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`,
    });
    const content = buildPageContent(pages[i]);
    objects.push({
      id: contentId,
      body: `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    });
  }

  // Assemble file with byte-accurate xref
  const header = '%PDF-1.4\n%\xff\xff\xff\xff\n';
  const chunks: Buffer[] = [];
  chunks.push(Buffer.from(header, 'binary'));

  const offsets: number[] = new Array(totalObjects + 1).fill(0);
  let cursor = chunks[0].length;

  // Sort by id to produce a deterministic xref ordering
  const sorted = [...objects].sort((a, b) => a.id - b.id);
  for (const obj of sorted) {
    offsets[obj.id] = cursor;
    const buf = Buffer.from(`${obj.id} 0 obj\n${obj.body}\nendobj\n`, 'binary');
    chunks.push(buf);
    cursor += buf.length;
  }

  const xrefOffset = cursor;
  let xref = `xref\n0 ${totalObjects + 1}\n`;
  xref += `0000000000 65535 f \n`;
  for (let i = 1; i <= totalObjects; i++) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  chunks.push(Buffer.from(xref, 'binary'));

  const trailer = `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  chunks.push(Buffer.from(trailer, 'binary'));

  return Buffer.concat(chunks);
}
