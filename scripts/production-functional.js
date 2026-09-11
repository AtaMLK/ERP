require('dotenv').config({path:'.env.local'});
require('dotenv').config();
const {Pool}=require('pg');
function assert(condition,message){if(!condition)throw new Error(message)}
async function main(){
 if(!process.env.DATABASE_URL){console.log('Functional DB tests skipped: DATABASE_URL is not configured');return}
 const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:false});
 const c=await pool.connect();
 try{
  await c.query('BEGIN');
  const admin=await c.query("SELECT u.id,u.email FROM public.users u JOIN public.user_roles ur ON ur.user_id=u.id JOIN public.roles r ON r.id=ur.role_id WHERE r.name='Admin' AND u.deleted_at IS NULL ORDER BY u.id LIMIT 1");
  assert(admin.rows[0],'No active Admin user is available for functional tests');
  const adminId=admin.rows[0].id;

  const roleMatrix=await c.query(`SELECT r.name,COALESCE(array_agg(rp.resource||':'||rp.action ORDER BY rp.resource,rp.action) FILTER(WHERE rp.resource IS NOT NULL),'{}') permissions FROM public.roles r LEFT JOIN public.role_permissions rp ON rp.role_id=r.id WHERE r.name IN ('Admin','Sales','Purchase','Accountant','Export') GROUP BY r.name`);
  const matrix=Object.fromEntries(roleMatrix.rows.map(r=>[r.name,r.permissions]));
  assert(matrix.Admin.includes('reports:read'),'Admin must read reports');
  assert(matrix.Sales.includes('orders:create') && matrix.Sales.includes('orders:update'),'Sales order permissions missing');
  assert(!matrix.Sales.includes('financial_data:read'),'Sales must not have financial-data visibility by default');
  assert(matrix.Accountant.includes('financial_data:read'),'Accountant financial permission missing');
  assert(matrix.Purchase.includes('supplier_invoices:create'),'Purchase supplier-invoice permission missing');
  assert(matrix.Export.includes('shipments:approve'),'Export shipment approval permission missing');

  await c.query(`INSERT INTO public.user_permission_overrides(user_id,resource,action,allowed,created_by) VALUES($1,'financial_data','read',false,$1) ON CONFLICT(user_id,resource,action) DO UPDATE SET allowed=false,updated_at=now()`,[adminId]);
  const denied=await c.query("SELECT allowed FROM public.user_permission_overrides WHERE user_id=$1 AND resource='financial_data' AND action='read'",[adminId]);
  assert(denied.rows[0] && denied.rows[0].allowed===false,'Per-user deny override failed');

  const customer=await c.query(`INSERT INTO public.customers(customer_code,name,status) VALUES('SMOKE-CUST-'||substr(md5(random()::text),1,10),'Production Functional Test','ACTIVE') RETURNING id`);
  const supplier=await c.query(`INSERT INTO public.suppliers(name,status) VALUES('SMOKE-SUP-'||substr(md5(random()::text),1,10),'ACTIVE') RETURNING id`);
  const product=await c.query(`INSERT INTO public.products(name,sku,supplier_id,purchase_price,sale_price,currency,status) VALUES('Smoke Product','SMOKE-'||substr(md5(random()::text),1,10),$1,10,20,'EUR','ACTIVE') RETURNING id`,[supplier.rows[0].id]);
  const order=await c.query(`INSERT INTO public.orders(order_number,customer_id,status,total_amount,currency,created_by) VALUES('SMOKE-ORD-'||substr(md5(random()::text),1,10),$1,'in_production',1000,'EUR',$2) RETURNING id`,[customer.rows[0].id,adminId]);
  const item=await c.query(`INSERT INTO public.order_items(order_id,product_id,quantity,unit_purchase_price,unit_sale_price,total_sale_price,currency) VALUES($1,$2,500,10,20,10000,'EUR') RETURNING id,quantity`,[order.rows[0].id,product.rows[0].id]);
  const oi=item.rows[0];

  const s1=await c.query(`INSERT INTO public.shipments(shipment_number,order_id,status,shipment_date) VALUES('SMOKE-S1-'||substr(md5(random()::text),1,10),$1,'READY',now()) RETURNING id`,[order.rows[0].id]);
  await c.query('INSERT INTO public.shipment_items(shipment_id,order_item_id,quantity) VALUES($1,$2,200)',[s1.rows[0].id,oi.id]);
  const s2=await c.query(`INSERT INTO public.shipments(shipment_number,order_id,status,shipment_date) VALUES('SMOKE-S2-'||substr(md5(random()::text),1,10),$1,'READY',now()) RETURNING id`,[order.rows[0].id]);
  await c.query('INSERT INTO public.shipment_items(shipment_id,order_item_id,quantity) VALUES($1,$2,150)',[s2.rows[0].id,oi.id]);
  const cumulative1=await c.query('SELECT COALESCE(SUM(quantity),0) total FROM public.shipment_items WHERE order_item_id=$1',[oi.id]);
  assert(Number(cumulative1.rows[0].total)===350,'Partial shipment cumulative quantity must be 350');
  const s3=await c.query(`INSERT INTO public.shipments(shipment_number,order_id,status,shipment_date) VALUES('SMOKE-S3-'||substr(md5(random()::text),1,10),$1,'READY',now()) RETURNING id`,[order.rows[0].id]);
  await c.query('INSERT INTO public.shipment_items(shipment_id,order_item_id,quantity) VALUES($1,$2,150)',[s3.rows[0].id,oi.id]);
  const cumulative2=await c.query('SELECT COALESCE(SUM(quantity),0) total FROM public.shipment_items WHERE order_item_id=$1',[oi.id]);
  assert(Number(cumulative2.rows[0].total)===500,'Three shipments must fulfill 500 ordered');
  const s4=await c.query(`INSERT INTO public.shipments(shipment_number,order_id,status,shipment_date) VALUES('SMOKE-S4-'||substr(md5(random()::text),1,10),$1,'READY',now()) RETURNING id`,[order.rows[0].id]);
  await c.query('INSERT INTO public.shipment_items(shipment_id,order_item_id,quantity) VALUES($1,$2,50)',[s4.rows[0].id,oi.id]);
  const cumulative3=await c.query('SELECT COALESCE(SUM(quantity),0) total FROM public.shipment_items WHERE order_item_id=$1',[oi.id]);
  assert(Number(cumulative3.rows[0].total)===550 && Number(cumulative3.rows[0].total)-500===50,'Over-shipment variance must be +50');

  const invoice=await c.query(`INSERT INTO public.invoices(invoice_number,order_id,customer_id,status,total_amount,currency) VALUES('SMOKE-INV-'||substr(md5(random()::text),1,10),$1,$2,'DRAFT',100,'EUR') RETURNING id`,[order.rows[0].id,customer.rows[0].id]);
  await c.query("UPDATE public.invoices SET status='PARTIAL' WHERE id=$1",[invoice.rows[0].id]);
  await c.query("INSERT INTO public.payments(invoice_id,amount,payment_date,status,currency) VALUES($1,40,now(),'RECORDED','EUR')",[invoice.rows[0].id]);
  const paid40=await c.query("SELECT COALESCE(SUM(amount),0) total FROM public.payments WHERE invoice_id=$1 AND status='RECORDED'",[invoice.rows[0].id]);
  assert(Number(paid40.rows[0].total)===40,'Invoice partial payment must total 40');
  await c.query("INSERT INTO public.payments(invoice_id,amount,payment_date,status,currency) VALUES($1,60,now(),'RECORDED','EUR')",[invoice.rows[0].id]);
  const paid100=await c.query("SELECT COALESCE(SUM(amount),0) total FROM public.payments WHERE invoice_id=$1 AND status='RECORDED'",[invoice.rows[0].id]);
  assert(Number(paid100.rows[0].total)===100,'Invoice full payment must total 100');

  const supplierInvoice=await c.query(`INSERT INTO public.supplier_invoices(supplier_id,order_id,invoice_number,amount,currency,status) VALUES($1,$2,'SMOKE-SI-'||substr(md5(random()::text),1,10),100,'EUR','UNPAID') RETURNING id`,[supplier.rows[0].id,order.rows[0].id]);
  await c.query("INSERT INTO public.supplier_payments(supplier_invoice_id,amount,currency,payment_date) VALUES($1,30,'EUR',now())",[supplierInvoice.rows[0].id]);
  const sp=await c.query('SELECT COALESCE(SUM(amount),0) total FROM public.supplier_payments WHERE supplier_invoice_id=$1',[supplierInvoice.rows[0].id]);
  assert(Number(sp.rows[0].total)===30,'Supplier partial payment must total 30');

  await c.query('ROLLBACK');
  console.log('Functional DB tests: PASS');
 }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e}finally{c.release();await pool.end()}
}
main().catch(e=>{console.error('Functional tests: FAIL');console.error(e.message);process.exit(1)})
