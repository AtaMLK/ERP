require('dotenv').config({ path: '.env.local' });
require('dotenv').config();
const fs=require('fs'); const path=require('path'); const {Pool}=require('pg');
const root=process.cwd();
function assert(c,m){if(!c)throw new Error(m)}
async function main(){
 const required=['database/schema.sql','database/migrations/004_rbac_reporting.sql','database/migrations/005_supplier_finance_claims.sql','database/migrations/006_documents_email.sql','database/migrations/007_order_shipment_workflow.sql','database/migrations/008_currency_export_gib.sql','database/migrations/009_production_hardening.sql'];
 for(const f of required) assert(fs.existsSync(path.join(root,f)),`Missing ${f}`);
 if(!process.env.DATABASE_URL){console.log('DB smoke skipped: DATABASE_URL is not configured');return}
 const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:false}); const c=await pool.connect();
 try{
  const cols=await c.query(`SELECT table_schema,table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('users','roles') AND column_name='id' ORDER BY table_name`);
  assert(cols.rows.length===2 && cols.rows.every(r=>r.data_type==='integer'),'public.users.id and public.roles.id must both be integer');
  const constraints=await c.query(`SELECT conname FROM pg_constraint WHERE conname IN ('payments_amount_positive','supplier_payments_amount_positive','shipment_items_quantity_positive','invoices_total_amount_nonnegative')`);
  assert(constraints.rows.length===4,'Production financial/shipment constraints are not fully installed');
  const roles=await c.query(`SELECT name FROM public.roles WHERE name IN ('Admin','Sales','Purchase','Accountant','Export')`); assert(roles.rows.length===5,'Canonical roles are incomplete');
  const reports=await c.query('SELECT COUNT(*)::int count FROM public.report_definitions WHERE active=true'); assert(Number(reports.rows[0].count)>=19,'Report catalog is incomplete');
  const permissions=await c.query(`SELECT COUNT(*)::int count FROM public.permissions WHERE resource='reports' AND action='read'`); assert(Number(permissions.rows[0].count)>=1,'reports:read permission missing');
  console.log('DB smoke: PASS');
 }finally{c.release();await pool.end()}
}
main().catch(e=>{console.error('Production smoke: FAIL');console.error(e.message);process.exit(1)})
