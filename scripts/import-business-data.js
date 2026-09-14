require('dotenv').config({ path: '.env.local' });
require('dotenv').config();
const fs=require('fs');const path=require('path');const zlib=require('zlib');const {Pool}=require('pg');
const root=process.cwd();
const productFile=process.env.PRODUCT_DATA_FILE||path.join(root,'database/seed/products.csv.gz.b64');
const customerFile=process.env.CUSTOMER_DATA_FILE||path.join(root,'database/seed/customers.json');
function parseCsv(text){const rows=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const ch=text[i];if(quoted){if(ch==='"'&&text[i+1]==='"'){cell+='"';i++;}else if(ch==='"')quoted=false;else cell+=ch;}else if(ch==='"'){quoted=true;}else if(ch===','){row.push(cell);cell='';}else if(ch==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';}else cell+=ch;}if(cell||row.length){row.push(cell.replace(/\r$/,''));rows.push(row);}const headers=rows.shift()||[];return rows.filter(r=>r.length&&r[0]).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??''])))}
function readProducts(){const raw=fs.readFileSync(productFile,'utf8').trim();if(productFile.endsWith('.gz.b64'))return parseCsv(zlib.gunzipSync(Buffer.from(raw,'base64')).toString('utf8'));return JSON.parse(raw)}
function num(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?Math.round((n+Number.EPSILON)*100)/100:null}
function materials(v){if(Array.isArray(v))return v.filter(Boolean).join(' | ');return String(v||'')}
async function upsertCustomer(c,x){
 const existing=await c.query('SELECT id FROM customers WHERE lower(trim(name))=lower(trim($1)) AND deleted_at IS NULL ORDER BY id LIMIT 1',[x.companyName]);
 if(existing.rowCount){await c.query('UPDATE customers SET address=$2,default_currency=$3,updated_at=now() WHERE id=$1',[existing.rows[0].id,x.address,x.currency||'EUR']);return existing.rows[0].id;}
 const inserted=await c.query(`INSERT INTO customers(name,address,default_currency,status) VALUES($1,$2,$3,'ACTIVE') RETURNING id`,[x.companyName,x.address,x.currency||'EUR']);return inserted.rows[0].id;
}
async function ensureDecimalPriceColumns(c){
 await c.query(`ALTER TABLE products
   ALTER COLUMN unit_price TYPE NUMERIC(15,2) USING unit_price::NUMERIC(15,2),
   ALTER COLUMN purchase_price TYPE NUMERIC(15,2) USING purchase_price::NUMERIC(15,2),
   ALTER COLUMN sale_price TYPE NUMERIC(15,2) USING sale_price::NUMERIC(15,2),
   ALTER COLUMN margin_percent TYPE NUMERIC(8,2) USING margin_percent::NUMERIC(8,2)`);
 await c.query(`ALTER TABLE product_price_history
   ALTER COLUMN purchase_price TYPE NUMERIC(15,2) USING purchase_price::NUMERIC(15,2),
   ALTER COLUMN sale_price TYPE NUMERIC(15,2) USING sale_price::NUMERIC(15,2),
   ALTER COLUMN margin_percent TYPE NUMERIC(8,2) USING margin_percent::NUMERIC(8,2)`);
}
async function main(){
 if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is not configured');
 if(!fs.existsSync(productFile))throw new Error(`Product data file not found: ${productFile}`);
 if(!fs.existsSync(customerFile))throw new Error(`Customer data file not found: ${customerFile}`);
 const products=readProducts();const customers=JSON.parse(fs.readFileSync(customerFile,'utf8'));
 const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:false});const c=await pool.connect();
 try{await c.query('BEGIN');
  await ensureDecimalPriceColumns(c);
  await c.query("INSERT INTO suppliers(name,currency,status) VALUES('GDC','EUR','ACTIVE') ON CONFLICT(name) DO UPDATE SET currency='EUR',status='ACTIVE',updated_at=now()");
  await c.query("SELECT id FROM suppliers WHERE name='GDC' LIMIT 1");
  for(const x of customers)await upsertCustomer(c,x);
  let imported=0;
  for(const x of products){const sku=String(x.code||x.sku||'').trim();if(!sku)continue;const purchase=num(x.purchase_price);const sale=num(x.unit_price??x.sale_price);const material=materials(x.materials??x.material);const desc=[material,x.product_id,x.group_name].filter(Boolean).join(' | ');const name=String(x.product_name||x.name||x.product_name_en||sku).trim();try{const r=await c.query(`INSERT INTO products(name,product_name_en,sku,description,product_family,category,supplier_id,purchase_price,sale_price,currency,status) VALUES($1,$1,$2,$3,$4,$5,(SELECT id FROM suppliers WHERE name='GDC' LIMIT 1),COALESCE($6::NUMERIC,0),COALESCE($7::NUMERIC,0),$8,'ACTIVE') ON CONFLICT(sku) DO UPDATE SET name=EXCLUDED.name,product_name_en=EXCLUDED.product_name_en,description=EXCLUDED.description,product_family=EXCLUDED.product_family,category=EXCLUDED.category,supplier_id=EXCLUDED.supplier_id,purchase_price=EXCLUDED.purchase_price,sale_price=EXCLUDED.sale_price,currency=EXCLUDED.currency,updated_at=now() RETURNING id`,[name,sku,desc,x.group_name||x.product_id||null,x.category||null,purchase,sale,x.currency||'EUR']);const id=r.rows[0].id;imported++;
   for(const alias of [x.source_code,x.code].filter(Boolean)){const aliasExists=await c.query('SELECT 1 FROM product_aliases WHERE product_id=$1 AND alias=$2 LIMIT 1',[id,String(alias)]);if(!aliasExists.rowCount)await c.query(`INSERT INTO product_aliases(product_id,alias,source) VALUES($1,$2,'business-import')`,[id,String(alias)]);}
   if(purchase!=null||sale!=null)await c.query(`INSERT INTO product_price_history(product_id,purchase_price,sale_price,margin_percent,currency,valid_from) VALUES($1,$2::NUMERIC,$3::NUMERIC,CASE WHEN $3::NUMERIC IS NOT NULL AND $3::NUMERIC<>0 THEN ROUND((($3::NUMERIC-COALESCE($2::NUMERIC,0))/$3::NUMERIC)*100,2) ELSE NULL END,$4,now())`,[id,purchase,sale,x.currency||'EUR']);
  }catch(e){const detail=[`code=${sku}`,`product_id=${x.product_id??''}`,`purchase_price=${x.purchase_price??''}`,`unit_price=${x.unit_price??''}`,`sale_price=${x.sale_price??''}`].join(', ');throw new Error(`Product import failed (${detail}): ${e.message}`)}}
  await c.query('COMMIT');console.log(`Imported ${customers.length} customers and ${imported} products; supplier GDC ensured.`);
 }catch(e){await c.query('ROLLBACK');throw e}finally{c.release();await pool.end()}
}
main().catch(e=>{console.error(`Business data import failed: ${e.message}`);process.exit(1)});
