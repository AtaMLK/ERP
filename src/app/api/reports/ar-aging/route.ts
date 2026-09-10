import { NextRequest } from 'next/server';
import { pool } from '@/lib/db';
import { getSession, requirePermission, handleApiError } from '@/lib/api/guards';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 try{
  const user=await getSession(req); requirePermission(user,'reports:read'); requirePermission(user,'financial_data:read');
  const result=await pool.query(`SELECT i.id,i.invoice_number,i.invoice_date,i.due_date,i.currency,c.name customer,
    i.total_amount,COALESCE(i.paid_amount,0) paid_amount,(i.total_amount-COALESCE(i.paid_amount,0)) outstanding,
    GREATEST(CURRENT_DATE-COALESCE(i.due_date,CURRENT_DATE),0)::int days_overdue,
    CASE WHEN COALESCE(i.due_date,CURRENT_DATE)>=CURRENT_DATE THEN 'current'
      WHEN CURRENT_DATE-i.due_date BETWEEN 1 AND 30 THEN '1-30' WHEN CURRENT_DATE-i.due_date BETWEEN 31 AND 60 THEN '31-60'
      WHEN CURRENT_DATE-i.due_date BETWEEN 61 AND 90 THEN '61-90' ELSE '90+' END aging_bucket
    FROM invoices i JOIN customers c ON c.id=i.customer_id WHERE i.status NOT IN ('paid','cancelled') AND (i.total_amount-COALESCE(i.paid_amount,0))>0
    ORDER BY days_overdue DESC,i.due_date ASC`);
  return Response.json({success:true,data:result.rows});
 }catch(e){return handleApiError(e)}
}
