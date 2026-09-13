require('dotenv').config({ path: '.env.local' });
require('dotenv').config();
const fs=require('fs');const path=require('path');const zlib=require('zlib');const {Pool}=require('pg');
const root=process.cwd();
const productFile=process.env.PRODUCT_DATA_FILE||path.join(root,'database/seed/products.csv.gz.b64');
const customerFile=process.env.CUSTOMER_DATA_FILE||path.join(root,'database/seed/customers.json');
function parseCsv(text){const rows=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const ch=text[i];if(quoted){if(ch==='"'&&text[i+1]==='"'){cell+='"';i++;}else if(ch==='"')quoted=false;else cell+=ch;}else if(ch==='"'){quoted=true;}else if(ch===','){row.push(cell);cell='';}else if(ch==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';}else cell+=ch;}if(cell||row.length){row.push(cell.replace(/\r$/,''));rows.push(row);}const headers=rows.shift();return rows.filter(r=>r.length&&r[0]).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??''])))}
function readProducts(){const raw=fs.readFileSync(productFile,'utf8').trim();if(productFile.endsWith('.gz.b64'))return parseCsv(zlib.gunzipSync(Buffer.from(raw,'base64')).toString('utf8'));return JSON.parse(raw)}
async function main(){
 if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is not configured');
 if(!fs.existsSync(productFile))throw new Error(`Product data file not found: ${productFile}`);
 if(!fs.existsSync(customerFile))throw new Error(`Customer data file not found: ${customerFile}`);
 const products=readProducts();const customers=JSON.parse(fs.readFileSync(customerFile,'utf8'));
 const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:false});const c=await pool.connect();
 try{await c.query('BEGIN');
  await c.query("INSERT INTO suppliers(name,currency,status) VALUES('GDC','EUR','ACTIVE') ON CONFLICT(name) DO UPDATE SET currency='EUR',status='ACTIVE',updated_at=now()");
  const supplier=(await c.query("SELECT id FROM suppliers WHERE name='GDC'")).rows[0];
  for(const x of customers){await c.query(`INSERT INTO customers(name,address,default_currency,status) VALUES($1,$2,$3,'ACTIVE') ON CONFLICT(name) DO UPDATE SET address=EXCLUDED.address,default_currency=EXCLUDED.default_currency,updated_at=now()`,[x.companyName,x.address,x.currency||'EUR']);}
  for(const x of products){const sku=String(x.code||'').trim();if(!sku)continue;const purchase=x.purchase_price===''?null:Number(x.purchase_price);const sale=x.sale_price===''?null:Number(x.sale_price);const desc=[x.material||'',x.product_id||''].filter(Boolean).join(' | ');const r=await c.query(`INSERT INTO products(name,product_name_en,sku,description,product_family,category,supplier_id,purchase_price,sale_price,currency,status) VALUES($1,$1,$2,$3,$4,$5,$6,COALESCE($7,0),COALESCE($8,0),$9,'ACTIVE') ON CONFLICT(sku) DO UPDATE SET name=EXCLUDED.name,product_name_en=EXCLUDED.product_name,description=EXCLUDED.description,product_family=EXCLUDED.product_family,category=EXCLUDED.category,supplier_id=EXCLUDED.supplier_id,purchase_price=EXCLUDED.purchase_price,sale_price=EXCLUDED.sale_price,currency=EXCLUDED.currency,updated_at=now() RETURNING id`,[x.name,sku,desc,x.product_id||null,x.category||null,supplier.id,purchase,sale,x.currency||'EUR']);const id=r.rows[0].id;
   for(const alias of [x.source_code,x.code].filter(Boolean)){await c.query(`INSERT INTO product_aliases(product_id,alias,source) VALUES($1,$2,'import') ON CONFLICT(product_id,alias) DO NOTHING`,[id,String(alias)]);}
   if(purchase!=null||sale!=null)await c.query(`INSERT INTO product_price_history(product_id,purchase_price,sale_price,currency,valid_from) VALUES($1,$2,$3,$4,now())`,[id,purchase,sale,x.currency||'EUR']);
  }
  await c.query('COMMIT');console.log(`Imported ${customers.length} customers and ${products.length} products; supplier GDC ensured.`);
 }catch(e){await c.query('ROLLBACK');throw e}finally{c.release();await pool.end()}
}
main().catch(e=>{console.error(`Business data import failed: ${e.message}`);process.exit(1)});
