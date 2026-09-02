import { NextRequest } from 'next/server';
import { pool } from '@/lib/db';
import { audit } from '@/lib/server/audit';
import { nextNumber } from '@/lib/server/numbering';
import { getSession, handleApiError, requirePermission } from '@/lib/api/guards';

const transitions: Record<string, string[]> = {
  draft: ['supplier_ordered', 'canceled'],
  supplier_ordered: ['proforma_sent', 'canceled'],
  proforma_sent: ['customer_confirmed', 'canceled'],
  customer_confirmed: ['in_production', 'canceled'],
  in_production: ['shipped', 'canceled'],
  shipped: ['completed'],
  completed: [], canceled: []
};

export async function GET(req: NextRequest) {
  try {
    const user = await getSession(req); requirePermission(user, 'orders:read');
    const url = new URL(req.url); const status = url.searchParams.get('status');
    const q = url.searchParams.get('q');
    const params: unknown[] = []; const where = ['o.deleted_at IS NULL'];
    if (status) { params.push(status); where.push(`o.status=$${params.length}`); }
    if (q) { params.push(`%${q}%`); where.push(`(o.order_number ILIKE $${params.length} OR c.name ILIKE $${params.length})`); }
    const result = await pool.query(`SELECT o.*,c.name customer_name,COUNT(oi.id)::int item_count FROM orders o JOIN customers c ON c.id=o.customer_id LEFT JOIN order_items oi ON oi.order_id=o.id WHERE ${where.join(' AND ')} GROUP BY o.id,c.name ORDER BY o.created_at DESC LIMIT 200`, params);
    return Response.json({success:true,data:result.rows});
  } catch (e) { return handleApiError(e); }
}

export async function POST(req: NextRequest) {
  const client = await pool.connect();
  try {
    const user = await getSession(req); requirePermission(user, 'orders:create');
    const body = await req.json();
    if (!Number.isInteger(body.customerId) || !Array.isArray(body.items) || body.items.length === 0) throw new Error('customerId and at least one item are required');
    await client.query('BEGIN');
    const customer = await client.query('SELECT id,default_currency FROM customers WHERE id=$1 AND deleted_at IS NULL',[body.customerId]);
    if (!customer.rows[0]) throw new Error('Customer not found');
    const currency = String(body.currency || customer.rows[0].default_currency || 'EUR').toUpperCase();
    const orderNumber = await nextNumber(client,'order_number_seq','ORD');
    const order = await client.query(`INSERT INTO orders(order_number,customer_id,customer_order_number,customer_order_date,requested_delivery_date,status,currency,created_by,notes) VALUES($1,$2,$3,$4,$5,'draft',$6,$7,$8) RETURNING *`,[orderNumber,body.customerId,body.customerOrderNumber || null,body.customerOrderDate || null,body.requestedDeliveryDate || null,currency,user.id,body.notes || null]);
    let total = 0;
    for (const item of body.items) {
      const product = await client.query('SELECT id,purchase_price,sale_price,currency FROM products WHERE id=$1 AND deleted_at IS NULL',[item.productId]);
      if (!product.rows[0]) throw new Error(`Product ${item.productId} not found`);
      const qty = Number(item.quantity); const sale = Number(item.unitSalePrice ?? product.rows[0].sale_price ?? 0); const purchase = Number(item.unitPurchasePrice ?? product.rows[0].purchase_price ?? 0);
      if (!(qty > 0) || !(sale >= 0)) throw new Error('Invalid item quantity or sale price');
      const line = qty * sale; total += line;
      const margin = sale ? ((sale-purchase)/sale)*100 : 0;
      await client.query(`INSERT INTO order_items(order_id,product_id,quantity,unit_purchase_price,unit_sale_price,margin_percent,currency,total_sale_price,options_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[order.rows[0].id,item.productId,qty,purchase,sale,margin,currency,line,JSON.stringify(item.options || {})]);
    }
    await client.query('UPDATE orders SET total_amount=$1,updated_at=now() WHERE id=$2',[total,order.rows[0].id]);
    await client.query('INSERT INTO order_status_history(order_id,from_status,to_status,changed_by) VALUES($1,NULL,$2,$3)',[order.rows[0].id,'draft',user.id]);
    await audit(client,user.id,'create','orders',order.rows[0].id,{order_number:orderNumber,total_amount:total});
    await client.query('COMMIT');
    return Response.json({success:true,data:{...order.rows[0],total_amount:total,order_number:orderNumber}},{status:201});
  } catch (e) { await client.query('ROLLBACK').catch(()=>{}); return handleApiError(e); } finally { client.release(); }
}
