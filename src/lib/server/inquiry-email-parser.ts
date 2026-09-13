export type ParsedInquiryLine = {
  reference: string;
  description: string;
  quantity: number;
  rawLine: string;
};

const NOISE = /^(hi|hello|dear|good morning|good afternoon|good evening|thanks|thank you|best regards|kind regards|regards|please|we need|could you|can you|please find|quotation|quote|rfq|subject|from|to|cc|sent|date)\b/i;
const QTY = /(?:qty|quantity|pcs|pieces|pc|units|unit|x)\s*[:=]?\s*(\d+(?:[.,]\d+)?)/i;
const LEADING_QTY = /^\s*(\d+(?:[.,]\d+)?)\s*(?:pcs?|pieces?|units?)?\s+(.+)$/i;
const EMAIL_HEADER = /^(from|to|cc|bcc|subject|sent|date)\s*:/i;

function clean(s: string) {
  return s.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function qtyFrom(line: string) {
  const a = line.match(QTY);
  if (a) return Number(a[1].replace(',', '.'));
  const b = line.match(LEADING_QTY);
  if (b) return Number(b[1].replace(',', '.'));
  return null;
}

function refFrom(line: string) {
  const stripped = line.replace(QTY, ' ').replace(LEADING_QTY, '$2').trim();
  const parts = stripped.split(/\t|\||;|\s{2,}/).map(clean).filter(Boolean);
  if (parts.length > 1) return parts[0];
  const code = stripped.match(/\b[A-Z][A-Z0-9._/-]{2,}(?:\s*[xX-]\s*\d{1,4})?\b/);
  if (code) return code[0];
  return stripped.replace(/^(?:item|product|part(?:\s*no)?|sku)\s*[:#-]?\s*/i, '').trim();
}

export function parseInquiryEmail(raw: string): ParsedInquiryLine[] {
  const lines = String(raw || '').replace(/\r/g, '').split('\n').map(clean).filter(Boolean);
  const out: ParsedInquiryLine[] = [];
  for (const line of lines) {
    if (EMAIL_HEADER.test(line) || NOISE.test(line) || /^[-_=]{3,}$/.test(line)) continue;
    const q = qtyFrom(line);
    if (!q || !(q > 0)) continue;
    const ref = refFrom(line);
    if (!ref || ref.length < 2) continue;
    const tabParts = line.split(/\t|\||;/).map(clean).filter(Boolean);
    const description = tabParts.length >= 3 ? tabParts.slice(2).join(' ') : line.replace(/(?:qty|quantity|pcs|pieces|pc|units|unit)\s*[:=]?\s*\d+(?:[.,]\d+)?/i, '').replace(/^\s*\d+(?:[.,]\d+)?\s*(?:pcs?|pieces?|units?)?\s*/i, '').replace(ref, '').replace(/[-–—:]+/g, ' ').trim() || ref;
    out.push({ reference: ref, description, quantity: q, rawLine: line });
  }
  return out;
}
