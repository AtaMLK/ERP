import { NextRequest } from 'next/server';
import { pool } from '@/lib/db';
import { getSession, handleApiError, requirePermission } from '@/lib/api/guards';
import { matchProduct, classifyConfidence } from '@/lib/server/product-matching';
import { parseInquiryEmail } from '@/lib/server/inquiry-email-parser';

export async function POST(req: NextRequest) {
  try {
    const user = await getSession(req); requirePermission(user, 'offers:create');
    const body = await req.json();
    const customerId = Number(body.customerId);
    const rawText = String(body.rawText || '').trim();
    if (!Number.isInteger(customerId) || !rawText) throw new Error('Customer and email text are required');
    const parsed = parseInquiryEmail(rawText);
    const client = await pool.connect();
    try {
      const items = [];
      for (const row of parsed) {
        const matches = await matchProduct(client, row.reference + ' ' + row.description, customerId);
        const best = matches[0] || null;
        items.push({
          reference: row.reference,
          description: row.description,
          quantity: String(row.quantity),
          rawLine: row.rawLine,
          productId: best?.productId,
          matchedSku: best?.sku,
          matchedName: best?.name,
          confidence: best?.confidence ?? 0,
          confidenceLevel: best ? classifyConfidence(best.confidence) : 'LOW',
          matchMethod: best?.method,
          candidates: matches.slice(0, 5),
          reviewStatus: best && classifyConfidence(best.confidence) === 'HIGH' ? 'MATCHED' : 'REVIEW'
        });
      }
      return Response.json({ success: true, data: { items, sourceText: rawText, parsedCount: items.length, requiresReview: items.some(x => x.reviewStatus !== 'MATCHED') } });
    } finally { client.release(); }
  } catch (e) { return handleApiError(e); }
}
