require('dotenv').config({ path: '.env.local' });
require('dotenv').config();
const fs=require('fs');
const path=require('path');
const {Pool}=require('pg');
const csvFile=process.env.HISTORICAL_SALES_FILE||path.join(process.cwd(),'database/seed/historical_sales_2019_2026.csv');
function parseCsv(text){const rows=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const ch=text[i];if(quoted){if(ch==='"'&&text[i+1]==='"'){cell+='"';i++;}else if(ch==='"')quoted=false;else cell+=ch;}else if(ch==='"'){quoted=true;}else if(ch===','){row.push(cell);cell='';}else if(ch==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';}else cell+=ch;}if(cell||row.length){row.push(cell.replace(/\r$/,''));rows.push(row);}const headers=rows.shift()||[];return rows.filter(r=>r.length&&r[0]).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??''])))}
function num(v){if(v===null||v===undefined||String(v).trim()==='')return null;const n=Number(String(v).replace(/,/g,''));return Number.isFinite(n)?n:null}
function date(v){if(!v)return null;const d=new Date(v);return Number.isNaN(d.getTime())?null:d}
async function main(){
 if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is not configured');
 if(!fs.existsSync(csvFile))throw new Error(`Historical sales file not found: ${csvFile}`);
 const rows=parseCsv(fs.readFileSync(csvFile,'utf8').replace(/^\uFEFF/,''));
 const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:false});
 const c=await pool.connect();
 try{await c.query('BEGIN');
  for(const r of rows){
   await c.query(`INSERT INTO historical_sales(source_year,source_row,customer_raw,sales_invoice_raw,quantity_raw,sales_date,sales_amount,customer_payment_raw,gdc_invoice_raw,gdc_purchase_amount,gdc_payment_date_raw,gdc_payment_amount_raw,claim_raw,notes_raw,source_file) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT(source_file,source_year,source_row) DO UPDATE SET customer_raw=EXCLUDED.customer_raw,sales_invoice_raw=EXCLUDED.sales_invoice_raw,quantity_raw=EXCLUDED.quantity_raw,sales_date=EXCLUDED.sales_date,sales_amount=EXCLUDED.sales_amount,customer_payment_raw=EXCLUDED.customer_payment_raw,gdc_invoice_raw=EXCLUDED.gdc_invoice_raw,gdc_purchase_amount=EXCLUDED.gdc_purchase_amount,gdc_payment_date_raw=EXCLUDED.gdc_payment_date_raw,gdc_payment_amount_raw=EXCLUDED.gdc_payment_amount_raw,claim_raw=EXCLUDED.claim_raw,notes_raw=EXCLUDED.notes_raw,imported_at=now()`,[num(r.source_year),num(r.source_row),r.customer_raw||null,r.sales_invoice_raw||null,r.quantity_raw||null,date(r.sales_date),num(r.sales_amount_raw),r.customer_payment_raw||null,r.gdc_invoice_raw||null,num(r.gdc_purchase_amount_raw),r.gdc_payment_date_raw||null,r.gdc_payment_amount_raw||null,r.claim_raw||null,r.notes_raw||null,path.basename(csvFile)]);
  }
  await c.query('COMMIT');console.log(`Imported/upserted ${rows.length} historical sales rows.`);
 }catch(e){await c.query('ROLLBACK');throw e}finally{c.release();await pool.end()}
}
main().catch(e=>{console.error(`Historical sales import failed: ${e.message}`);process.exit(1)});
