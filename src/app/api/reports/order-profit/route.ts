import { NextRequest } from 'next/server';
import { pool } from '@/lib/db';
import { getSession, requirePermission, handleApiError } from '@/lib/api/guards';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 try{
  const user=await getSession(req); requirePermission(user,'reports:read');
  const s=req.nextUrl.searchParams, from=s.get('from')||'2000-01-01', to=s.get('to')||'2999-12-31';
  const result=await pool.query(`SELECT o.id,o.order_code,o.order_date,o.currency,c.name customer,
    COALESCE(SUM(oi.quantity*oi.unit_sale_price),0)::numeric revenue,
    COALESCE(SUM(oi.quantity*oi.unit_purchase_price),0)::numeric purchase_cost,
    COALESCE(oc.total_cost,0)::numeric total_order_cost,
    (COALESCE(SUM(oi.quantity*(oi.unit_sale_price-oi.unit_purchase_price)),0)-COALESCE(oc.total_cost,0))::numeric profit,
    CASE WHEN SUM(oi.quantity*oi.unit_sale_price)=0 THEN 0 ELSE ROUND(((SUM(oi.quantity*(oi.unit_sale_price-oi.unit_purchase_price))-COALESCE(oc.total_cost,0))/SUM(oi.quantity*oi.unit_sale_price)*100),2) END margin_percent
    FROM orders o LEFT JOIN customers c ON c.id=o.customer_id LEFT JOIN order_items oi ON oi.order_id=o.id
    LEFT JOIN order_costs oc ON oc.order_id=o.id
    WHERE o.order_date BETWEEN $1::date AND $2::date AND o.status<>'canceled'
    GROUP BY o.id,o.order_code,o.order_date,o.currency,c.name,oc.total_cost ORDER BY o.order_date DESC`,[from,to]);
  return Response.json({success:true,data:result.rows});
 }catch(e){return handleApiError(e)}
}
