import { NextRequest } from 'next/server';
import { pool } from '@/lib/db';
import { getSession, handleApiError, requirePermission } from '@/lib/api/guards';

export async function GET(req: NextRequest) {
  try {
    const user = await getSession(req);
    requirePermission(user, 'audit_logs:read');
    const url = new URL(req.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 100), 1), 500);
    const offset = Math.max(Number(url.searchParams.get('offset') || 0), 0);
    const r = await pool.query(`
      SELECT a.id,a.action,a.resource,a.resource_id,a.changes,a.ip_address,a.metadata,a.created_at,
             u.id AS user_id,u.name AS user_name,u.email AS user_email
      FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id
      ORDER BY a.created_at DESC,a.id DESC LIMIT $1 OFFSET $2`, [limit, offset]);
    return Response.json({success:true,data:r.rows});
  } catch(e){ return handleApiError(e); }
}