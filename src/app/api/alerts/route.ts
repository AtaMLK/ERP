import { NextRequest } from 'next/server';
import { pool } from '@/lib/db';
import { getSession, handleApiError, requirePermission } from '@/lib/api/guards';

export async function GET(req: NextRequest) {
  try {
    const user = await getSession(req);
    requirePermission(user, 'reports:read');

    const result = await pool.query(`
      WITH partial AS (
        SELECT o.id, o.order_number, c.name AS customer_name,
               SUM(oi.quantity) AS ordered_qty,
               COALESCE((SELECT SUM(si.quantity) FROM shipment_items si JOIN shipments s ON s.id=si.shipment_id WHERE si.order_item_id=oi.id AND s.deleted_at IS NULL),0) AS shipped_qty
        FROM orders o
        JOIN customers c ON c.id=o.customer_id
        JOIN order_items oi ON oi.order_id=o.id
        WHERE o.deleted_at IS NULL AND o.status NOT IN ('canceled','completed')
        GROUP BY o.id,o.order_number,c.name
      )
      SELECT * FROM (
        SELECT 'late_shipping' AS type, o.id AS order_id, o.order_number, c.name AS customer_name,
               'Order is past requested delivery date' AS title,
               o.requested_delivery_date AS due_date,
               EXTRACT(DAY FROM now()-o.requested_delivery_date)::int AS days_late,
               NULL::numeric AS ordered_qty, NULL::numeric AS shipped_qty
        FROM orders o JOIN customers c ON c.id=o.customer_id
        WHERE o.deleted_at IS NULL AND o.requested_delivery_date < now()
          AND o.status NOT IN ('shipped','completed','canceled')
        UNION ALL
        SELECT 'late_payment', i.order_id, o.order_number, c.name,
               'Customer invoice is overdue', i.due_date,
               EXTRACT(DAY FROM now()-i.due_date)::int, NULL, NULL
        FROM invoices i JOIN customers c ON c.id=i.customer_id LEFT JOIN orders o ON o.id=i.order_id
        WHERE i.deleted_at IS NULL AND i.due_date < now() AND i.status NOT IN ('PAID','CANCELED')
        UNION ALL
        SELECT 'partial_shipment', p.id, p.order_number, p.customer_name,
               'Order is only partially shipped', NULL,
               NULL, p.ordered_qty, p.shipped_qty
        FROM partial p
        WHERE p.shipped_qty > 0 AND p.shipped_qty < p.ordered_qty
      ) alerts
      ORDER BY COALESCE(due_date, now()) ASC, type ASC
      LIMIT 100
    `);

    return Response.json({ success: true, data: result.rows, count: result.rowCount });
  } catch (e) {
    return handleApiError(e);
  }
}
