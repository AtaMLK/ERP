require('dotenv').config({ path: '.env.local' });
require('dotenv').config();
const fs=require('fs');const path=require('path');const {Pool}=require('pg');
const root=process.cwd();
const productFile=process.env.PRODUCT_DATA_FILE||path.join(root,'database/seed/products-database.json');
const customerFile=process.env.CUSTOMER_DATA_FILE||path.join(root,'database/seed/customers.json');
async function main(){
 if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is not configured');
 if(!fs.existsSync(productFile))throw new Error(`Product data file not found: ${productFile}`);
 if(!fs.existsSync(customerFile))throw new Error(`Customer data file not found: ${customerFile}`);
 const products=JSON.parse(fs.readFileSync(productFile,'utf8'));const customers=JSON.parse(fs.readFileSync(customerFile,'utf8'));
 const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:false});const c=await pool.connect();
 try{await c.query('BEGIN');
  await c.query("INSERT INTO suppliers(name,currency,status) VALUES('GDC','EUR','ACTIVE') ON CONFLICT(name) DO UPDATE SET currency='EUR',status='ACTIVE',updated_at=now()");
  const supplier=(await c.query("SELECT id FROM suppliers WHERE name='GDC'")).rows[0];
  for(const x of customers){await c.query(`INSERT INTO customers(name,address,default_currency,status) VALUES($1,$2,$3,'ACTIVE') ON CONFLICT(name) DO UPDATE SET address=EXCLUDED.address,default_currency=EXCLUDED.default_currency,updated_at=now()`,[x.companyName,x.address,x.currency||'EUR']);}
  for(const x of products){const sku=String(x.code||'').trim();if(!sku)continue;const purchase=x.purchase_price==null?null:Number(x.purchase_price);const sale=x.unit_price==null?null:Number(x.unit_price);const desc=[...(x.materials||[]),x.group_name].filter(Boolean).join(' | ');const r=await c.query(`INSERT INTO products(name,product_name_en,sku,description,product_family,category,supplier_id,purchase_price,sale_price,currency,status) VALUES($1,$1,$2,$3,$4,$5,$6,COALESCE($7,0),COALESCE($8,0),$9,'ACTIVE') ON CONFLICT(sku) DO UPDATE SET name=EXCLUDED.name,product_name_en=EXCLUDED.product_name,description=EXCLUDED.description,product_family=EXCLUDED.product_family,category=EXCLUDED.category,supplier_id=EXCLUDED.supplier_id,purchase_price=EXCLUDED.purchase_price,sale_price=EXCLUDED.sale_price,currency=EXCLUDED.currency,updated_at=now() RETURNING id`,[x.product_name,sku,desc,x.product_id||null,x.category||null,supplier.id,purchase,sale,x.currency||'EUR']);const id=r.rows[0].id;
   for(const alias of [x.source_code,x.code].filter(Boolean)){await c.query(`INSERT INTO product_aliases(product_id,alias,source) VALUES($1,$2,'import') ON CONFLICT(product_id,alias) DO NOTHING`,[id,String(alias)]);}
   if(purchase!=null||sale!=null)await c.query(`INSERT INTO product_price_history(product_id,purchase_price,sale_price,margin_percent,currency,valid_from) VALUES($1,$2,$3,CASE WHEN $3>0 THEN ROUND((($3-COALESCE($2,0))/$3)*100,2) ELSE NULL END,$4,now())`,[id,purchase,sale,x.currency||'EUR']);
  }
  await c.query('COMMIT');console.log(`Imported ${customers.length} customers and ${products.length} products; supplier GDC ensured.`);
 }catch(e){await c.query('ROLLBACK');throw e}finally{c.release();await pool.end()}
}
main().catch(e=>{console.error(`Business data import failed: ${e.message}`);process.exit(1)});
