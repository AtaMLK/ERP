import { NextRequest } from 'next/server';
import { pool } from '@/lib/db';
import { getSession, handleApiError, requirePermission } from '@/lib/api/guards';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await getSession(req); requirePermission(user, 'reports:read');
    const q = req.nextUrl.searchParams;
    const from = q.get('from') || '2000-01-01';
    const to = q.get('to') || '2999-12-31';
    const [kpis, monthly, products, customers, pending, exposure] = await Promise.all([
      pool.query(`SELECT
        (SELECT COUNT(*) FROM orders WHERE deleted_at IS NULL AND order_date BETWEEN $1::date AND $2::date)::int orders,
        (SELECT COALESCE(SUM(total_amount),0) FROM orders WHERE deleted_at IS NULL AND status NOT IN ('draft','canceled') AND order_date BETWEEN $1::date AND $2::date) sales,
        (SELECT COALESCE(SUM(oi.quantity*(oi.unit_sale_price-oi.unit_purchase_price)),0) FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.deleted_at IS NULL AND o.status NOT IN ('draft','canceled') AND o.order_date BETWEEN $1::date AND $2::date) profit,
        (SELECT COUNT(*) FROM shipments WHERE deleted_at IS NULL AND status NOT IN ('DELIVERED','CANCELLED'))::int pending_shipments,
        (SELECT COALESCE(SUM(GREATEST(i.total_amount-COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id=i.id AND UPPER(COALESCE(p.status,'')) NOT IN ('FAILED','CANCELED')),0),0)),0) FROM invoices i WHERE i.deleted_at IS NULL AND UPPER(i.status) NOT IN ('CANCELLED','DRAFT')) receivables,
        (SELECT COALESCE(SUM(GREATEST(si.amount-COALESCE((SELECT SUM(sp.amount) FROM supplier_payments sp WHERE sp.supplier_invoice_id=si.id),0),0)),0) FROM supplier_invoices si WHERE si.deleted_at IS NULL AND UPPER(si.status) NOT IN ('CANCELLED','PAID')) payables`, [from,to]),
      pool.query(`SELECT TO_CHAR(DATE_TRUNC('month',o.order_date),'YYYY-MM') month, o.currency, ROUND(COALESCE(SUM(oi.quantity*oi.unit_sale_price),0),2) sales, ROUND(COALESCE(SUM(oi.quantity*(oi.unit_sale_price-oi.unit_purchase_price)),0),2) profit FROM orders o JOIN order_items oi ON oi.order_id=o.id WHERE o.deleted_at IS NULL AND o.status NOT IN ('draft','canceled') AND o.order_date BETWEEN $1::date AND $2::date GROUP BY 1,2 ORDER BY 1`, [from,to]),
      pool.query(`SELECT p.id,p.name,ROUND(SUM(oi.quantity),2) quantity,ROUND(SUM(oi.quantity*oi.unit_sale_price),2) sales,ROUND(SUM(oi.quantity*(oi.unit_sale_price-oi.unit_purchase_price)),2) profit FROM order_items oi JOIN orders o ON o.id=oi.order_id JOIN products p ON p.id=oi.product_id WHERE o.deleted_at IS NULL AND o.status NOT IN ('draft','canceled') AND o.order_date BETWEEN $1::date AND $2::date GROUP BY p.id,p.name ORDER BY sales DESC LIMIT 10`, [from,to]),
      pool.query(`SELECT c.id,c.name,COUNT(DISTINCT o.id)::int orders,ROUND(COALESCE(SUM(o.total_amount),0),2) sales FROM orders o JOIN customers c ON c.id=o.customer_id WHERE o.deleted_at IS NULL AND o.status NOT IN ('draft','canceled') AND o.order_date BETWEEN $1::date AND $2::date GROUP BY c.id,c.name ORDER BY sales DESC LIMIT 10`, [from,to]),
      pool.query(`SELECT s.id,s.shipment_number,s.status,s.expected_delivery,o.order_number,c.name customer_name,COALESCE(SUM(si.quantity),0) quantity FROM shipments s JOIN orders o ON o.id=s.order_id JOIN customers c ON c.id=o.customer_id LEFT JOIN shipment_items si ON si.shipment_id=s.id WHERE s.deleted_at IS NULL AND s.status NOT IN ('DELIVERED','CANCELLED') GROUP BY s.id,s.shipment_number,s.status,s.expected_delivery,o.order_number,c.name ORDER BY s.expected_delivery NULLS LAST LIMIT 10`),
      pool.query(`WITH ar AS (SELECT i.currency,SUM(GREATEST(i.total_amount-COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id=i.id AND UPPER(COALESCE(p.status,'')) NOT IN ('FAILED','CANCELED')),0),0)) amount FROM invoices i WHERE i.deleted_at IS NULL AND UPPER(i.status) NOT IN ('CANCELLED','DRAFT') GROUP BY i.currency), ap AS (SELECT si.currency,SUM(GREATEST(si.amount-COALESCE((SELECT SUM(sp.amount) FROM supplier_payments sp WHERE sp.supplier_invoice_id=si.id),0),0)) amount FROM supplier_invoices si WHERE si.deleted_at IS NULL AND UPPER(si.status) NOT IN ('CANCELLED','PAID') GROUP BY si.currency) SELECT COALESCE(ar.currency,ap.currency) currency,ROUND(COALESCE(ar.amount,0),2) receivable,ROUND(COALESCE(ap.amount,0),2) payable,ROUND(COALESCE(ar.amount,0)-COALESCE(ap.amount,0),2) net_exposure FROM ar FULL OUTER JOIN ap ON ap.currency=ar.currency ORDER BY currency`, []),
    ]);
    return Response.json({success:true,data:{kpis:kpis.rows[0],monthly:monthly.rows,topProducts:products.rows,topCustomers:customers.rows,pendingShipments:pending.rows,currencyExposure:exposure.rows,period:{from,to}}});
  } catch (e) { return handleApiError(e); }
}
