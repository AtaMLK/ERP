import { NextRequest } from 'next/server';
import { pool } from '@/lib/db';
import { getSession, requirePermission, handleApiError } from '@/lib/api/guards';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 try{
  const user=await getSession(req); requirePermission(user,'reports:read');
  const s=req.nextUrl.searchParams, from=s.get('from')||'2000-01-01', to=s.get('to')||'2999-12-31';
  const result=await pool.query(`SELECT DATE_TRUNC('month',o.order_date)::date period,o.currency,
    COUNT(DISTINCT o.id)::int orders,COALESCE(SUM(oi.quantity),0)::numeric quantity,
    COALESCE(SUM(oi.quantity*oi.unit_sale_price),0)::numeric revenue,
    COALESCE(SUM(oi.quantity*(oi.unit_sale_price-oi.unit_purchase_price)),0)::numeric gross_profit,
    CASE WHEN SUM(oi.quantity*oi.unit_sale_price)=0 THEN 0 ELSE ROUND(SUM(oi.quantity*(oi.unit_sale_price-oi.unit_purchase_price))/SUM(oi.quantity*oi.unit_sale_price)*100,2) END margin_percent
    FROM orders o JOIN order_items oi ON oi.order_id=o.id WHERE o.order_date BETWEEN $1::date AND $2::date AND o.status<>'canceled'
    GROUP BY DATE_TRUNC('month',o.order_date),o.currency ORDER BY period DESC,o.currency`,[from,to]);
  return Response.json({success:true,data:result.rows});
 }catch(e){return handleApiError(e)}
}
