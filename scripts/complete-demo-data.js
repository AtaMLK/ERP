require('dotenv').config({ path: '.env.local' });
require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Development-only credentials. Never use these passwords in production.
    const users = [
      ['admin@demo.local', 'Demo Admin', 'DemoAdmin2026!Secure', 'Admin'],
      ['sales@demo.local', 'Demo Sales', 'DemoSales2026!Secure', 'Sales'],
      ['accounting@demo.local', 'Demo Accounting', 'DemoAccounting2026!Secure', 'Accountant'],
      ['warehouse@demo.local', 'Demo Warehouse', 'DemoWarehouse2026!Secure', 'Warehouse'],
    ];

    for (const [email, name, password, roleName] of users) {
      const hash = await bcrypt.hash(password, 12);
      const u = await client.query(`
        INSERT INTO users(email,name,password_hash)
        VALUES($1,$2,$3)
        ON CONFLICT(email) DO UPDATE SET name=EXCLUDED.name,password_hash=EXCLUDED.password_hash,updated_at=now(),deleted_at=NULL
        RETURNING id
      `, [email, name, hash]);
      const role = await client.query(`SELECT id FROM roles WHERE name=$1`, [roleName]);
      await client.query(`INSERT INTO user_roles(user_id,role_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, [u.rows[0].id, role.rows[0].id]);
    }

    const admin = (await client.query(`SELECT id FROM users WHERE email='admin@demo.local'`)).rows[0].id;

    // Customer contacts.
    const customers = await client.query(`SELECT id,name FROM customers WHERE name LIKE 'Demo Customer %' ORDER BY id`);
    for (const c of customers.rows) {
      const exists = await client.query(`SELECT 1 FROM customer_contacts WHERE customer_id=$1 LIMIT 1`, [c.id]);
      if (!exists.rowCount) {
        await client.query(`INSERT INTO customer_contacts(customer_id,name,email,phone,position) VALUES($1,$2,$3,$4,$5)`, [
          c.id, `${c.name} Buyer`, `${c.name.toLowerCase().replace(/[^a-z0-9]+/g,'.')}@demo.local`, '+90 212 555 2000', 'Purchasing Manager'
        ]);
      }
    }

    // Product options.
    const products = await client.query(`SELECT id,sku FROM products WHERE sku LIKE 'DEMO-%' ORDER BY id`);
    const optionSets = [
      ['Material','Steel'], ['Material','Stainless Steel'], ['Seal','NBR'], ['Seal','FKM'], ['Finish','Standard'], ['Finish','Hardened']
    ];
    for (const p of products.rows) {
      for (const [name,value] of optionSets) {
        await client.query(`INSERT INTO product_options(product_id,option_name,option_value) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`, [p.id,name,value]);
      }
      await client.query(`INSERT INTO product_price_history(product_id,purchase_price,sale_price,margin_percent,currency,created_by) SELECT id,purchase_price,sale_price,margin_percent,currency,$1 FROM products WHERE id=$2 AND NOT EXISTS (SELECT 1 FROM product_price_history WHERE product_id=$2)`, [admin,p.id]);
    }

    // Exchange rates for realistic financial/report testing.
    const rates = [
      ['EUR','TRY',48.25,0], ['USD','EUR',0.855,0], ['GBP','EUR',1.165,0], ['EUR','USD',1.169,0], ['EUR','GBP',0.858,0]
    ];
    for (const [from,to,rate] of rates) {
      await client.query(`INSERT INTO exchange_rates(from_currency,to_currency,rate,rate_date) VALUES($1,$2,$3,current_date) ON CONFLICT(from_currency,to_currency,rate_date) DO UPDATE SET rate=EXCLUDED.rate`, [from,to,rate]);
    }

    // Price offers linked to customers/products.
    const customerRows = await client.query(`SELECT id FROM customers WHERE name LIKE 'Demo Customer %' ORDER BY id LIMIT 10`);
    const productRows = products.rows;
    for (let i=1;i<=10;i++) {
      const number=`OFF-DEMO-${String(i).padStart(4,'0')}`;
      const existing=await client.query(`SELECT id FROM price_offers WHERE offer_number=$1`,[number]);
      if(existing.rowCount) continue;
      const p=productRows[(i-1)%productRows.length];
      const prod=(await client.query(`SELECT purchase_price,sale_price,currency FROM products WHERE id=$1`,[p.id])).rows[0];
      const qty=25+i*5;
      const total=Number((qty*Number(prod.sale_price)).toFixed(2));
      const offer=await client.query(`INSERT INTO price_offers(offer_number,customer_id,status,total_amount,currency,valid_until,created_by) VALUES($1,$2,$3,$4,$5,now()+interval '14 days',$6) RETURNING id`,[number,customerRows.rows[(i-1)%customerRows.rowCount].id,i%4===0?'ACCEPTED':(i%3===0?'SENT':'DRAFT'),total,prod.currency,admin]);
      await client.query(`INSERT INTO price_offer_items(price_offer_id,product_id,quantity,unit_purchase_price,unit_price,margin_percent,total_price,options_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[offer.rows[0].id,p.id,qty,prod.purchase_price,prod.sale_price,((prod.sale_price-prod.purchase_price)/prod.sale_price)*100,total,JSON.stringify({Material:'Steel',Seal:'NBR'})]);
    }

    // Order costs for every demo order.
    const orders=await client.query(`SELECT o.id,o.total_amount,COALESCE((SELECT SUM(oi.quantity*oi.unit_purchase_price) FROM order_items oi WHERE oi.order_id=o.id),0) purchase FROM orders o WHERE o.order_number LIKE 'ORD-DEMO-%' OR o.order_number LIKE 'ORD-LIFE-DEMO-%'`);
    for(const o of orders.rows){
      const exists=await client.query(`SELECT 1 FROM order_costs WHERE order_id=$1`,[o.id]);
      if(!exists.rowCount){
        const purchase=Number(o.purchase), transport=Number(o.total_amount)*0.02, customs=Number(o.total_amount)*0.01;
        const totalCost=purchase+transport+customs;
        const profit=Number(o.total_amount)-totalCost;
        await client.query(`INSERT INTO order_costs(order_id,internal_transport_cost,external_transport_cost,customs_cost,other_cost,total_cost,cost_currency,exchange_rate_snapshot,profit,margin_percent) VALUES($1,0,$2,$3,0,$4,'EUR',1,$5,$6)`,[o.id,transport,customs,totalCost,profit,Number(o.total_amount)?profit/Number(o.total_amount)*100:0]);
      }
    }

    // Claims and credit memo examples tied to completed/paid demo transactions.
    const invs=await client.query(`SELECT i.id,i.order_id,i.total_amount,i.customer_id FROM invoices i WHERE i.invoice_number LIKE 'FZE-DEMO-%' ORDER BY i.id LIMIT 3`);
    for(let i=0;i<invs.rowCount;i++){
      const inv=invs.rows[i];
      const existing=await client.query(`SELECT id FROM claims WHERE invoice_id=$1 LIMIT 1`,[inv.id]);
      if(existing.rowCount) continue;
      const claim=await client.query(`INSERT INTO claims(invoice_id,order_id,description,amount,status,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,[inv.id,inv.order_id,`Demo quality claim ${i+1}`,Number(inv.total_amount)*0.03,i===0?'APPROVED':'OPEN',admin]);
      if(i===0){
        const amount=Number(inv.total_amount)*0.03;
        await client.query(`INSERT INTO claim_approvals(claim_id,amount,approved_by) VALUES($1,$2,$3)`,[claim.rows[0].id,amount,admin]);
        await client.query(`INSERT INTO credit_memos(claim_id,amount,approved_by) VALUES($1,$2,$3)`,[claim.rows[0].id,amount,admin]);
      }
    }

    await client.query('COMMIT');
    console.log('Complete demo database seed finished.');
    console.log('Development login: admin@demo.local / DemoAdmin2026!Secure');
  } catch(e) {
    await client.query('ROLLBACK').catch(()=>{});
    console.error('Complete demo seed failed:',e.message);
    process.exitCode=1;
  } finally { client.release(); await pool.end(); }
}
main();
