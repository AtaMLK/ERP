import { NextRequest } from 'next/server';
import { pool } from '@/lib/db';
import { audit } from '@/lib/server/audit';
import { getSession, handleApiError, requirePermission } from '@/lib/api/guards';

export const dynamic = 'force-dynamic';

type ResourceConfig = {
  table: string;
  permission: string;
  create: readonly string[];
};

const cfg: Record<string, ResourceConfig> = {
  customers: {
    table: 'customers', permission: 'customers:read',
    create: ['customer_code', 'name', 'email', 'phone', 'city', 'country', 'vat_number', 'website', 'default_currency', 'credit_limit', 'status', 'notes'],
  },
  suppliers: {
    table: 'suppliers', permission: 'suppliers:read',
    create: ['name', 'email', 'phone', 'city', 'country', 'currency', 'payment_terms', 'status', 'notes'],
  },
  products: {
    table: 'products', permission: 'products:read',
    create: ['name', 'product_name_en', 'product_name_tr', 'sku', 'description', 'hs_code', 'product_family', 'category', 'supplier_id', 'unit_price', 'purchase_price', 'sale_price', 'currency', 'margin_percent', 'drawing_file_url', 'status'],
  },
  claims: {
    table: 'claims', permission: 'claims:read',
    create: ['invoice_id', 'order_id', 'description', 'amount'],
  },
};

const readOnly = new Set(['orders', 'invoices', 'payments', 'shipments', 'offers']);

export async function GET(req: NextRequest, { params }: { params: { resource: string } }) {
  try {
    const user = await getSession(req);
    const resource = cfg[params.resource];
    if (readOnly.has(params.resource)) {
      const permission = `${params.resource === 'offers' ? 'offers' : params.resource}:read`;
      requirePermission(user, permission);
    } else if (!resource) {
      return Response.json({ success: false, error: 'Unknown resource' }, { status: 404 });
    } else {
      requirePermission(user, resource.permission);
    }

    const table = resource?.table ?? ({ orders: 'orders', invoices: 'invoices', payments: 'payments', shipments: 'shipments', offers: 'price_offers' } as Record<string, string>)[params.resource];
    if (!table) return Response.json({ success: false, error: 'Unknown resource' }, { status: 404 });

    const sp = req.nextUrl.searchParams;
    const limit = Math.min(Math.max(Number(sp.get('limit') || 20), 1), 100);
    const offset = Math.max(Number(sp.get('offset') || 0), 0);
    const result = await pool.query(
      `SELECT * FROM ${table} WHERE deleted_at IS NULL ORDER BY id DESC LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
    return Response.json({ success: true, data: result.rows, pagination: { limit, offset } });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest, { params }: { params: { resource: string } }) {
  try {
    if (readOnly.has(params.resource)) {
      return Response.json({ success: false, error: 'Use the dedicated API for this transactional resource' }, { status: 405 });
    }

    const user = await getSession(req);
    const resource = cfg[params.resource];
    if (!resource) return Response.json({ success: false, error: 'Unknown or non-creatable resource' }, { status: 404 });
    requirePermission(user, resource.permission.replace(':read', ':create'));

    const body = await req.json();
    const cols = resource.create.filter((column) => body[column] !== undefined);
    if (!cols.length) return Response.json({ success: false, error: 'No valid fields supplied' }, { status: 400 });

    const values = cols.map((column) => body[column]);
    const result = await pool.query(
      `INSERT INTO ${resource.table} (${cols.join(',')}) VALUES (${cols.map((_, index) => `$${index + 1}`).join(',')}) RETURNING *`,
      values,
    );

    await audit(pool, user.id, 'create', resource.table, result.rows[0].id, { fields: cols });
    return Response.json({ success: true, data: result.rows[0] }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
