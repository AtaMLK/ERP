import { NextRequest } from 'next/server';
import { pool } from '@/lib/db';
import { getSession, requirePermission, handleApiError } from '@/lib/api/guards';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 try{
  const user=await getSession(req); requirePermission(user,'reports:read'); requirePermission(user,'financial_data:read');
  const result=await pool.query(`SELECT si.id,si.invoice_number,si.invoice_date,si.due_date,si.currency,s.name supplier,
    si.total_amount,COALESCE(si.paid_amount,0) paid_amount,(si.total_amount-COALESCE(si.paid_amount,0)) outstanding,
    GREATEST(CURRENT_DATE-COALESCE(si.due_date,CURRENT_DATE),0)::int days_overdue,
    CASE WHEN COALESCE(si.due_date,CURRENT_DATE)>=CURRENT_DATE THEN 'current'
      WHEN CURRENT_DATE-si.due_date BETWEEN 1 AND 30 THEN '1-30' WHEN CURRENT_DATE-si.due_date BETWEEN 31 AND 60 THEN '31-60'
      WHEN CURRENT_DATE-si.due_date BETWEEN 61 AND 90 THEN '61-90' ELSE '90+' END aging_bucket
    FROM supplier_invoices si JOIN suppliers s ON s.id=si.supplier_id
    WHERE si.status NOT IN ('paid','cancelled') AND (si.total_amount-COALESCE(si.paid_amount,0))>0
    ORDER BY days_overdue DESC,si.due_date ASC`);
  return Response.json({success:true,data:result.rows});
 }catch(e){return handleApiError(e)}
}
