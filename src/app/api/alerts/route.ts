import { NextRequest } from 'next/server';
import { pool } from '@/lib/db';
import { getSession, handleApiError, requirePermission } from '@/lib/api/guards';

export async function GET(req: NextRequest) {
  try {
    const user = await getSession(req);
    requirePermission(user, 'reports:read');

    const result = await pool.query(`
      WITH item_fulfillment AS (
        SELECT
          o.id AS order_id,
          o.order_number,
          c.name AS customer_name,
          oi.id AS order_item_id,
          p.name AS product_name,
          oi.quantity AS ordered_qty,
          COALESCE(SUM(CASE WHEN s.deleted_at IS NULL THEN si.quantity ELSE 0 END), 0) AS shipped_qty
        FROM orders o
        JOIN customers c ON c.id = o.customer_id
        JOIN order_items oi ON oi.order_id = o.id
        LEFT JOIN products p ON p.id = oi.product_id
        LEFT JOIN shipment_items si ON si.order_item_id = oi.id
        LEFT JOIN shipments s ON s.id = si.shipment_id
        WHERE o.deleted_at IS NULL
          AND o.status NOT IN ('canceled', 'completed')
        GROUP BY o.id, o.order_number, c.name, oi.id, p.name, oi.quantity
      )
      SELECT * FROM (
        SELECT
          'late_shipping' AS type,
          o.id AS order_id,
          o.order_number,
          c.name AS customer_name,
          'Order is past requested delivery date' AS title,
          o.requested_delivery_date AS due_date,
          EXTRACT(DAY FROM now() - o.requested_delivery_date)::int AS days_late,
          NULL::int AS order_item_id,
          NULL::text AS product_name,
          NULL::numeric AS ordered_qty,
          NULL::numeric AS shipped_qty,
          NULL::numeric AS remaining_qty,
          NULL::numeric AS variance_qty
        FROM orders o
        JOIN customers c ON c.id = o.customer_id
        WHERE o.deleted_at IS NULL
          AND o.requested_delivery_date < now()
          AND o.status NOT IN ('shipped', 'completed', 'canceled')

        UNION ALL

        SELECT
          'late_payment',
          i.order_id,
          o.order_number,
          c.name,
          'Customer invoice is overdue',
          i.due_date,
          EXTRACT(DAY FROM now() - i.due_date)::int,
          NULL::int,
          NULL::text,
          NULL::numeric,
          NULL::numeric,
          NULL::numeric,
          NULL::numeric
        FROM invoices i
        JOIN customers c ON c.id = i.customer_id
        LEFT JOIN orders o ON o.id = i.order_id
        WHERE i.deleted_at IS NULL
          AND i.due_date < now()
          AND UPPER(i.status) NOT IN ('PAID', 'CANCELED', 'CANCELLED')

        UNION ALL

        SELECT
          'partial_shipment',
          f.order_id,
          f.order_number,
          f.customer_name,
          COALESCE(f.product_name, 'Order item') || ' is partially shipped',
          NULL,
          NULL,
          f.order_item_id,
          f.product_name,
          f.ordered_qty,
          f.shipped_qty,
          GREATEST(f.ordered_qty - f.shipped_qty, 0),
          f.shipped_qty - f.ordered_qty
        FROM item_fulfillment f
        WHERE f.shipped_qty > 0 AND f.shipped_qty < f.ordered_qty

        UNION ALL

        SELECT
          'over_shipment',
          f.order_id,
          f.order_number,
          f.customer_name,
          COALESCE(f.product_name, 'Order item') || ' is over-shipped',
          NULL,
          NULL,
          f.order_item_id,
          f.product_name,
          f.ordered_qty,
          f.shipped_qty,
          0,
          f.shipped_qty - f.ordered_qty
        FROM item_fulfillment f
        WHERE f.shipped_qty > f.ordered_qty
      ) alerts
      ORDER BY COALESCE(due_date, now()) ASC, type ASC, order_number ASC
      LIMIT 100
    `);

    return Response.json({ success: true, data: result.rows, count: result.rowCount });
  } catch (e) {
    return handleApiError(e);
  }
}
