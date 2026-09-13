import { NextRequest } from 'next/server';
import { pool } from '@/lib/db';
import { audit } from '@/lib/server/audit';
import { getSession, handleApiError, requirePermission } from '@/lib/api/guards';

export const dynamic = 'force-dynamic';

type ResourceConfig = {
  table: string;
  permission: string;
  update: readonly string[];
};

const cfg: Record<string, ResourceConfig> = {
  customers: {
    table: 'customers', permission: 'customers',
    update: ['customer_code', 'name', 'email', 'phone', 'city', 'country', 'vat_number', 'website', 'default_currency', 'credit_limit', 'status', 'notes'],
  },
  suppliers: {
    table: 'suppliers', permission: 'suppliers',
    update: ['name', 'email', 'phone', 'city', 'country', 'currency', 'payment_terms', 'status', 'notes'],
  },
  products: {
    table: 'products', permission: 'products',
    update: ['name', 'product_name_en', 'product_name_tr', 'sku', 'description', 'hs_code', 'product_family', 'category', 'supplier_id', 'unit_price', 'purchase_price', 'sale_price', 'currency', 'margin_percent', 'drawing_file_url', 'status'],
  },
  claims: {
    table: 'claims', permission: 'claims',
    update: ['invoice_id', 'order_id', 'description', 'amount', 'status'],
  },
};

const transactional = new Set(['orders', 'invoices', 'payments', 'shipments', 'offers']);

export async function GET(req: NextRequest, { params }: { params: { resource: string; id: string } }) {
  try {
    const user = await getSession(req);
    const resource = cfg[params.resource];
    if (!resource) {
      if (!transactional.has(params.resource)) return Response.json({ success: false, error: 'Unknown resource' }, { status: 404 });
      requirePermission(user, `${params.resource === 'offers' ? 'offers' : params.resource}:read`);
    } else {
      requirePermission(user, `${resource.permission}:read`);
    }

    const id = Number(params.id);
    if (!Number.isInteger(id) || id < 1) return Response.json({ success: false, error: 'Invalid id' }, { status: 400 });
    const table = resource?.table ?? ({ orders: 'orders', invoices: 'invoices', payments: 'payments', shipments: 'shipments', offers: 'price_offers' } as Record<string, string>)[params.resource];
    if (!table) return Response.json({ success: false, error: 'Unknown resource' }, { status: 404 });
    const result = await pool.query(`SELECT * FROM ${table} WHERE id=$1 AND deleted_at IS NULL`, [id]);
    if (!result.rows[0]) return Response.json({ success: false, error: 'Not found' }, { status: 404 });
    return Response.json({ success: true, data: result.rows[0] });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { resource: string; id: string } }) {
  if (transactional.has(params.resource)) {
    return Response.json({ success: false, error: 'Use the dedicated API for this transactional resource' }, { status: 405 });
  }

  const client = await pool.connect();
  try {
    const user = await getSession(req);
    const resource = cfg[params.resource];
    if (!resource) return Response.json({ success: false, error: 'Unknown resource' }, { status: 404 });
    requirePermission(user, `${resource.permission}:update`);

    const id = Number(params.id);
    if (!Number.isInteger(id) || id < 1) return Response.json({ success: false, error: 'Invalid id' }, { status: 400 });
    const body = await req.json();
    const columns = resource.update.filter((column) => body[column] !== undefined);
    if (!columns.length) return Response.json({ success: false, error: 'No valid fields' }, { status: 400 });

    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE ${resource.table} SET ${columns.map((column, index) => `${column}=$${index + 1}`).join(',')},updated_at=CURRENT_TIMESTAMP WHERE id=$${columns.length + 1} AND deleted_at IS NULL RETURNING *`,
      [...columns.map((column) => body[column]), id],
    );
    if (!result.rows[0]) {
      await client.query('ROLLBACK');
      return Response.json({ success: false, error: 'Not found' }, { status: 404 });
    }
    await audit(client, user.id, 'update', resource.table, id, { fields: columns });
    await client.query('COMMIT');
    return Response.json({ success: true, data: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    return handleApiError(error);
  } finally {
    client.release();
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { resource: string; id: string } }) {
  if (transactional.has(params.resource)) {
    return Response.json({ success: false, error: 'Use the dedicated API for this transactional resource' }, { status: 405 });
  }

  const client = await pool.connect();
  try {
    const user = await getSession(req);
    const resource = cfg[params.resource];
    if (!resource) return Response.json({ success: false, error: 'Unknown resource' }, { status: 404 });
    requirePermission(user, `${resource.permission}:delete`);

    const id = Number(params.id);
    if (!Number.isInteger(id) || id < 1) return Response.json({ success: false, error: 'Invalid id' }, { status: 400 });
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE ${resource.table} SET deleted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND deleted_at IS NULL RETURNING id`,
      [id],
    );
    if (!result.rows[0]) {
      await client.query('ROLLBACK');
      return Response.json({ success: false, error: 'Not found' }, { status: 404 });
    }
    await audit(client, user.id, 'delete', resource.table, id);
    await client.query('COMMIT');
    return Response.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    return handleApiError(error);
  } finally {
    client.release();
  }
}
