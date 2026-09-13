import { NextRequest } from 'next/server';
import { pool } from '@/lib/db';
import { audit } from '@/lib/server/audit';
import { nextNumber } from '@/lib/server/numbering';
import { getSession, handleApiError, requirePermission } from '@/lib/api/guards';

const transitions: Record<string,string[]> = { NEW:['PRICING','LOST'], PRICING:['OFFER_SENT','LOST'], OFFER_SENT:['WON','LOST'], WON:['CONVERTED'], LOST:[], CONVERTED:[] };

export async function GET(req: NextRequest) {
  try {
    const user = await getSession(req); requirePermission(user,'offers:read');
    const q = req.nextUrl.searchParams.get('q');
    const params: unknown[]=[]; const where=['i.deleted_at IS NULL'];
    if(q){params.push(`%${q}%`);where.push(`(i.inquiry_number ILIKE $${params.length} OR i.subject ILIKE $${params.length} OR c.name ILIKE $${params.length})`);}
    const r=await pool.query(`SELECT i.*,c.name customer_name,(SELECT COUNT(*) FROM customer_inquiry_items x WHERE x.inquiry_id=i.id)::int item_count FROM customer_inquiries i JOIN customers c ON c.id=i.customer_id WHERE ${where.join(' AND ')} ORDER BY i.inquiry_date DESC LIMIT 200`,params);
    return Response.json({success:true,data:r.rows});
  } catch(e){return handleApiError(e)}
}

export async function POST(req: NextRequest) {
  const client=await pool.connect();
  try{
    const user=await getSession(req); requirePermission(user,'offers:create');
    const body=await req.json();
    if(!Number.isInteger(body.customerId)||!String(body.subject||'').trim()) throw new Error('customerId and subject are required');
    await client.query('BEGIN');
    const customer=await client.query('SELECT id FROM customers WHERE id=$1 AND deleted_at IS NULL',[body.customerId]);
    if(!customer.rows[0]) throw new Error('Customer not found');
    const inquiryNumber=await nextNumber(client,'inquiry_number_seq','INQ');
    const r=await client.query(`INSERT INTO customer_inquiries(inquiry_number,customer_id,contact_id,inquiry_date,subject,notes,status,created_by) VALUES($1,$2,$3,$4,$5,$6,'NEW',$7) RETURNING *`,[inquiryNumber,body.customerId,body.contactId||null,body.inquiryDate||new Date().toISOString(),String(body.subject).trim(),body.notes||null,user.id]);
    await client.query('INSERT INTO inquiry_status_history(inquiry_id,from_status,to_status,changed_by) VALUES($1,NULL,\'NEW\',$2)',[r.rows[0].id,user.id]);
    await audit(client,user.id,'create','customer_inquiries',r.rows[0].id,{inquiry_number:inquiryNumber});
    await client.query('COMMIT');
    return Response.json({success:true,data:r.rows[0]},{status:201});
  }catch(e){await client.query('ROLLBACK').catch(()=>{});return handleApiError(e)}finally{client.release()}
}
