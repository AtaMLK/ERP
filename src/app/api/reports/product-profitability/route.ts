import { NextRequest } from 'next/server';
import { pool } from '@/lib/db';
import { getSession, requirePermission, handleApiError } from '@/lib/api/guards';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await getSession(req);
    requirePermission(user, 'reports:read');
    const sp = req.nextUrl.searchParams;
    const from = sp.get('from') || '2000-01-01';
    const to = sp.get('to') || '2999-12-31';
    const productId = sp.get('productId');
    const customerId = sp.get('customerId');
    const supplierId = sp.get('supplierId');
    const limit = Math.min(Math.max(Number(sp.get('limit') || 200), 1), 1000);

    const result = await pool.query(`
      SELECT p.id, p.product_code, p.name,
        COALESCE(SUM(oi.quantity),0)::numeric AS quantity_sold,
        COALESCE(SUM(oi.quantity * oi.unit_sale_price),0)::numeric AS revenue,
        COALESCE(SUM(oi.quantity * oi.unit_purchase_price),0)::numeric AS purchase_cost,
        COALESCE(SUM(oi.quantity * (oi.unit_sale_price - oi.unit_purchase_price)),0)::numeric AS gross_profit,
        CASE WHEN COALESCE(SUM(oi.quantity * oi.unit_sale_price),0)=0 THEN 0
          ELSE ROUND((SUM(oi.quantity * (oi.unit_sale_price - oi.unit_purchase_price)) /
            SUM(oi.quantity * oi.unit_sale_price) * 100),2) END AS margin_percent,
        CASE WHEN COALESCE(SUM(oi.quantity),0)=0 THEN 0 ELSE ROUND(SUM(oi.quantity * oi.unit_purchase_price)/SUM(oi.quantity),2) END AS avg_purchase_price,
        CASE WHEN COALESCE(SUM(oi.quantity),0)=0 THEN 0 ELSE ROUND(SUM(oi.quantity * oi.unit_sale_price)/SUM(oi.quantity),2) END AS avg_sale_price
      FROM products p
      JOIN order_items oi ON oi.product_id=p.id
      JOIN orders o ON o.id=oi.order_id
      WHERE o.order_date >= $1::date AND o.order_date < ($2::date + INTERVAL '1 day')
        AND o.status <> 'canceled'
        AND ($3::bigint IS NULL OR p.id=$3)
        AND ($4::bigint IS NULL OR o.customer_id=$4)
        AND ($5::bigint IS NULL OR oi.supplier_id=$5)
      GROUP BY p.id,p.product_code,p.name
      ORDER BY revenue DESC
      LIMIT $6`, [from,to,productId || null,customerId || null,supplierId || null,limit]);

    return Response.json({ success:true, data:result.rows, filters:{from,to,productId,customerId,supplierId} });
  } catch (e) { return handleApiError(e); }
}
