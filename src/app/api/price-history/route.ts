import { NextRequest } from 'next/server';
import { pool } from '@/lib/db';
import { getSession, handleApiError, requirePermission } from '@/lib/api/guards';

export const dynamic='force-dynamic';

export async function GET(req: NextRequest){
  try{
    const user=await getSession(req); requirePermission(user,'products:read');
    const productId=Number(new URL(req.url).searchParams.get('productId'));
    if(!Number.isInteger(productId)||productId<=0) throw new Error('Valid productId is required');
    const r=await pool.query(`SELECT h.id,h.product_id,h.purchase_price,h.sale_price,h.margin_percent,h.currency,h.valid_from,h.created_by,u.name AS created_by_name FROM product_price_history h LEFT JOIN users u ON u.id=h.created_by WHERE h.product_id=$1 ORDER BY h.valid_from DESC,h.id DESC`,[productId]);
    return Response.json({success:true,data:r.rows});
  }catch(e){return handleApiError(e);}
}