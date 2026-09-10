import { NextRequest } from 'next/server';
import { pool } from '@/lib/db';
import { getSession, requirePermission, handleApiError } from '@/lib/api/guards';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 try{
  const user=await getSession(req); requirePermission(user,'reports:read');
  const s=req.nextUrl.searchParams, from=s.get('from')||'2000-01-01', to=s.get('to')||'2999-12-31';
  const result=await pool.query(`SELECT sh.id,sh.shipment_code,sh.shipment_date,o.order_code,c.name customer,
    COALESCE(SUM(shi.quantity_shipped),0)::numeric quantity_shipped,
    COALESCE(SUM(shi.quantity_shipped*oi.unit_sale_price),0)::numeric shipment_value,
    sh.status
    FROM shipments sh JOIN orders o ON o.id=sh.order_id JOIN customers c ON c.id=o.customer_id
    JOIN shipment_items shi ON shi.shipment_id=sh.id JOIN order_items oi ON oi.id=shi.order_item_id
    WHERE sh.shipment_date BETWEEN $1::date AND $2::date
    GROUP BY sh.id,sh.shipment_code,sh.shipment_date,o.order_code,c.name,sh.status ORDER BY sh.shipment_date DESC`,[from,to]);
  return Response.json({success:true,data:result.rows});
 }catch(e){return handleApiError(e)}
}
