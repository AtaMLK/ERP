import { NextRequest } from 'next/server';
import { pool } from '@/lib/db';
import { audit } from '@/lib/server/audit';
import { getSession, handleApiError, requirePermission } from '@/lib/api/guards';

const allowed: Record<string,string[]> = {draft:['supplier_ordered','canceled'],supplier_ordered:['proforma_sent','canceled'],proforma_sent:['customer_confirmed','canceled'],customer_confirmed:['in_production','canceled'],in_production:['shipped','canceled'],shipped:['completed'],completed:[],canceled:[]};

export async function GET(req: NextRequest,{params}:{params:{id:string}}){
 try{const user=await getSession(req);requirePermission(user,'orders:read');const r=await pool.query(`SELECT o.*,c.name customer_name,c.email customer_email,COALESCE(json_agg(json_build_object('id',oi.id,'productId',oi.product_id,'productName',p.name,'sku',p.sku,'quantity',oi.quantity,'unitPurchasePrice',oi.unit_purchase_price,'unitSalePrice',oi.unit_sale_price,'totalSalePrice',oi.total_sale_price,'currency',oi.currency,'options',oi.options_snapshot) ORDER BY oi.id) FILTER(WHERE oi.id IS NOT NULL),'[]') items FROM orders o JOIN customers c ON c.id=o.customer_id LEFT JOIN order_items oi ON oi.order_id=o.id LEFT JOIN products p ON p.id=oi.product_id WHERE o.id=$1 AND o.deleted_at IS NULL GROUP BY o.id,c.name,c.email`,[params.id]);if(!r.rows[0])return Response.json({success:false,error:'Order not found'},{status:404});return Response.json({success:true,data:r.rows[0]});}catch(e){return handleApiError(e)}
}

export async function PATCH(req:NextRequest,{params}:{params:{id:string}}){
 const client=await pool.connect();
 try{const user=await getSession(req);requirePermission(user,'orders:update');const body=await req.json();await client.query('BEGIN');const current=await client.query('SELECT * FROM orders WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[params.id]);if(!current.rows[0])return Response.json({success:false,error:'Order not found'},{status:404});const o=current.rows[0];
 if(body.status && body.status!==o.status){if(!allowed[o.status]?.includes(body.status))throw new Error(`Invalid status transition: ${o.status} -> ${body.status}`);await client.query('UPDATE orders SET status=$1,updated_at=now() WHERE id=$2',[body.status,o.id]);await client.query('INSERT INTO order_status_history(order_id,from_status,to_status,changed_by) VALUES($1,$2,$3,$4)',[o.id,o.status,body.status,user.id]);}
 const fields:[string,unknown][]=[];for(const [column,key] of [['customer_order_number','customerOrderNumber'],['customer_order_date','customerOrderDate'],['requested_delivery_date','requestedDeliveryDate'],['notes','notes']] as const){if(key in body)fields.push([column,body[key] ?? null]);}if(fields.length){const set=fields.map(([c],i)=>`${c}=$${i+1}`).join(',');await client.query(`UPDATE orders SET ${set},updated_at=now() WHERE id=$${fields.length+1}`,[...fields.map(x=>x[1]),o.id]);}
 await audit(client,user.id,'update','orders',o.id,{status:body.status,fields:fields.map(x=>x[0])});await client.query('COMMIT');const updated=await pool.query('SELECT * FROM orders WHERE id=$1',[o.id]);return Response.json({success:true,data:updated.rows[0]});
 }catch(e){await client.query('ROLLBACK').catch(()=>{});return handleApiError(e)}finally{client.release()}
}

export async function DELETE(req:NextRequest,{params}:{params:{id:string}}){const client=await pool.connect();try{const user=await getSession(req);requirePermission(user,'orders:delete');await client.query('BEGIN');const r=await client.query('UPDATE orders SET deleted_at=now(),updated_at=now() WHERE id=$1 AND deleted_at IS NULL RETURNING id',[params.id]);if(!r.rows[0])return Response.json({success:false,error:'Order not found'},{status:404});await audit(client,user.id,'delete','orders',r.rows[0].id);await client.query('COMMIT');return Response.json({success:true});}catch(e){await client.query('ROLLBACK').catch(()=>{});return handleApiError(e)}finally{client.release()}}
