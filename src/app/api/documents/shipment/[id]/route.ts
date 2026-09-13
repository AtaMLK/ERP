import { NextRequest } from 'next/server';
import { getSession, handleApiError, requirePermission } from '@/lib/api/guards';
import { renderShipmentDocument } from '@/lib/server/documents';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getSession(req);
    requirePermission(user, 'documents:read');
    const id = Number(params.id);
    if (!Number.isInteger(id) || id <= 0) return Response.json({ success: false, error: 'Invalid shipment id' }, { status: 400 });
    const html = await renderShipmentDocument(id);
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Disposition': `inline; filename="packing-list-${id}.html"` } });
  } catch (e) { return handleApiError(e); }
}
