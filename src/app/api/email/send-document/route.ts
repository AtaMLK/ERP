import { NextRequest } from 'next/server';
import { pool } from '@/lib/db';
import { getSession, handleApiError, requirePermission } from '@/lib/api/guards';
import { renderInvoiceDocument, renderShipmentDocument } from '@/lib/server/documents';
import { sendDocumentEmail } from '@/lib/server/email';

export async function POST(req: NextRequest) {
  const client = await pool.connect();
  try {
    const user = await getSession(req);
    requirePermission(user, 'email:send');
    requirePermission(user, 'documents:read');
    const body = await req.json();
    const type = body.type === 'shipment' ? 'shipment' : body.type === 'invoice' ? 'invoice' : null;
    const id = Number(body.id);
    if (!type || !Number.isInteger(id) || id <= 0) throw new Error('type and id are required');

    let recipient = typeof body.recipient === 'string' ? body.recipient.trim() : '';
    let subject = typeof body.subject === 'string' ? body.subject.trim() : '';
    let html = '';
    if (type === 'invoice') {
      const r = await pool.query(`SELECT invoice_number,customer_email FROM invoices i JOIN customers c ON c.id=i.customer_id WHERE i.id=$1 AND i.deleted_at IS NULL`, [id]);
      if (!r.rows[0]) throw new Error('Invoice not found');
      recipient ||= r.rows[0].customer_email || '';
      subject ||= `Invoice ${r.rows[0].invoice_number}`;
      html = await renderInvoiceDocument(id);
    } else {
      const r = await pool.query(`SELECT shipment_number,customer_email FROM shipments s JOIN orders o ON o.id=s.order_id JOIN customers c ON c.id=o.customer_id WHERE s.id=$1 AND s.deleted_at IS NULL`, [id]);
      if (!r.rows[0]) throw new Error('Shipment not found');
      recipient ||= r.rows[0].customer_email || '';
      subject ||= `Packing List ${r.rows[0].shipment_number}`;
      html = await renderShipmentDocument(id);
    }
    if (!recipient || !recipient.includes('@')) throw new Error('A valid recipient email is required');
    await sendDocumentEmail(client, { userId: user.id, recipient, subject, html, template: `${type}_document` });
    return Response.json({ success: true, data: { type, id, recipient, subject } });
  } catch (e) { return handleApiError(e); } finally { client.release(); }
}
