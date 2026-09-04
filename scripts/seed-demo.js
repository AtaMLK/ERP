require('dotenv').config({ path: '.env.local' });
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

async function columns(client, table) {
  const r = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`, [table]);
  return new Set(r.rows.map(x => x.column_name));
}

async function insert(client, table, data) {
  const cols = await columns(client, table);
  const entries = Object.entries(data).filter(([k, v]) => cols.has(k) && v !== undefined);
  if (!entries.length) throw new Error(`No usable columns for ${table}`);
  const names = entries.map(([k]) => `"${k}"`).join(',');
  const placeholders = entries.map((_, i) => `$${i + 1}`).join(',');
  const values = entries.map(([, v]) => v);
  const r = await client.query(`INSERT INTO "${table}" (${names}) VALUES (${placeholders}) RETURNING *`, values);
  return r.rows[0];
}

async function update(client, table, id, data) {
  const cols = await columns(client, table);
  const entries = Object.entries(data).filter(([k, v]) => cols.has(k) && v !== undefined);
  if (!entries.length) return;
  const set = entries.map(([k], i) => `"${k}"=$${i + 2}`).join(',');
  await client.query(`UPDATE "${table}" SET ${set} WHERE id=$1`, [id, ...entries.map(([, v]) => v)]);
}

function money(n) { return Math.round(n * 100) / 100; }
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString(); }
function daysFromNow(n) { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString(); }

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const admin = (await client.query(`SELECT id FROM users WHERE deleted_at IS NULL ORDER BY id LIMIT 1`)).rows[0]?.id || null;

    const supplierIds = [];
    for (let i = 1; i <= 3; i++) {
      const name = `Demo Supplier ${i}`;
      const existing = (await client.query(`SELECT id FROM suppliers WHERE name=$1 LIMIT 1`, [name])).rows[0];
      const s = existing || await insert(client, 'suppliers', {
        name, code: `DEMO-SUP-${i}`, email: `supplier${i}@demo.local`, phone: `+90 212 555 10${String(i).padStart(2,'0')}`,
        currency: i === 2 ? 'TRY' : 'EUR', country: 'Türkiye', status: 'active',
      });
      supplierIds.push(s.id);
    }

    const customerIds = [];
    for (let i = 1; i <= 10; i++) {
      const name = `Demo Customer ${String(i).padStart(2,'0')}`;
      const existing = (await client.query(`SELECT id FROM customers WHERE name=$1 LIMIT 1`, [name])).rows[0];
      const c = existing || await insert(client, 'customers', {
        name, code: `DEMO-CUS-${String(i).padStart(2,'0')}`, email: `customer${i}@demo.local`,
        country: ['Italy','Germany','Spain','Poland','France'][i % 5], default_currency: i % 4 === 0 ? 'USD' : 'EUR', status: 'active',
      });
      customerIds.push(c.id);
    }

    const productIds = [];
    for (let i = 1; i <= 20; i++) {
      const name = `Demo Hydraulic Part ${String(i).padStart(2,'0')}`;
      const existing = (await client.query(`SELECT id FROM products WHERE name=$1 LIMIT 1`, [name])).rows[0];
      const purchase = 12 + i * 3.75;
      const sale = money(purchase * (1.22 + (i % 4) * 0.04));
      const p = existing || await insert(client, 'products', {
        name, product_name_en: name, product_name_tr: `Demo Hidrolik Parça ${String(i).padStart(2,'0')}`,
        sku: `DEMO-${String(i).padStart(4,'0')}`, hs_code: `8412.${String(10 + i).padStart(2,'0')}`,
        product_family: i % 2 ? 'Cylinder Components' : 'Hydraulic Components', category: i % 3 ? 'Standard' : 'Custom',
        supplier_id: supplierIds[i % supplierIds.length], purchase_price: purchase, sale_price: sale, unit_price: sale,
        currency: 'EUR', margin_percent: ((sale - purchase) / sale) * 100,
      });
      productIds.push(p.id);
    }

    // 20 inquiries covering the full sales funnel.
    const inquiryStatuses = ['NEW','PRICING','OFFER_SENT','WON','LOST','CONVERTED'];
    const inquiryIds = [];
    for (let i = 1; i <= 20; i++) {
      const number = `INQ-DEMO-${String(i).padStart(4,'0')}`;
      const existing = (await client.query(`SELECT id FROM customer_inquiries WHERE inquiry_number=$1 LIMIT 1`, [number])).rows[0];
      if (existing) { inquiryIds.push(existing.id); continue; }
      const status = inquiryStatuses[(i - 1) % inquiryStatuses.length];
      const q = await insert(client, 'customer_inquiries', {
        inquiry_number: number, customer_id: customerIds[(i - 1) % customerIds.length], inquiry_date: daysAgo(20 - i),
        subject: `Demo RFQ ${String(i).padStart(2,'0')} - Hydraulic cylinder components`,
        notes: `Demo inquiry for testing the complete sales workflow. Scenario ${i}.`, status, created_by: admin,
      });
      inquiryIds.push(q.id);
      await insert(client, 'customer_inquiry_items', {
        inquiry_id: q.id, product_id: productIds[(i - 1) % productIds.length], quantity: 10 + i * 5,
        description: `Requested quantity for demo RFQ ${i}`, options: JSON.stringify({ test: true, scenario: i }),
      });
      await insert(client, 'inquiry_status_history', { inquiry_id: q.id, from_status: null, to_status: status, changed_by: admin, created_at: daysAgo(20 - i) });
    }

    // 20 fully usable invoice/order scenarios. Extra lifecycle orders are added below for status testing.
    const orderIds = [];
    const orderStatuses = ['customer_confirmed','in_production','shipped','completed'];
    for (let i = 1; i <= 20; i++) {
      const number = `ORD-DEMO-${String(i).padStart(4,'0')}`;
      const existing = (await client.query(`SELECT id FROM orders WHERE order_number=$1 LIMIT 1`, [number])).rows[0];
      if (existing) { orderIds.push(existing.id); continue; }
      const customerId = customerIds[(i - 1) % customerIds.length];
      const productId = productIds[(i - 1) % productIds.length];
      const qty = 50 + i * 10;
      const purchase = 12 + ((i - 1) % 20 + 1) * 3.75;
      const sale = money(purchase * (1.22 + (i % 4) * 0.04));
      const total = money(qty * sale);
      const status = orderStatuses[(i - 1) % orderStatuses.length];
      const o = await insert(client, 'orders', {
        order_number: number, customer_id: customerId, customer_order_number: `CUST-DEMO-${String(i).padStart(4,'0')}`,
        customer_order_date: daysAgo(30 - i), requested_delivery_date: daysFromNow(i - 10), status,
        currency: 'EUR', total_amount: total, created_by: admin, notes: `Demo order scenario ${i}`,
        inquiry_id: inquiryIds[(i - 1) % inquiryIds.length],
      });
      orderIds.push(o.id);
      const oi = await insert(client, 'order_items', {
        order_id: o.id, product_id: productId, quantity: qty, unit_purchase_price: purchase, unit_sale_price: sale,
        margin_percent: ((sale - purchase) / sale) * 100, currency: 'EUR', total_sale_price: total,
        options_snapshot: JSON.stringify({ demo: true, scenario: i }),
      });
      await insert(client, 'order_status_history', { order_id: o.id, from_status: null, to_status: status, changed_by: admin, created_at: daysAgo(25 - Math.min(i, 20)) });

      // Create a shipment for shipped/completed orders; partial shipment for in-production orders.
      if (['in_production','shipped','completed'].includes(status)) {
        const shippedQty = status === 'in_production' ? Math.floor(qty * 0.55) : (i % 5 === 0 ? qty + 5 : qty);
        const sh = await insert(client, 'shipments', {
          shipment_number: `SHP-DEMO-${String(i).padStart(4,'0')}`, order_id: o.id, status: 'READY',
          shipment_date: daysAgo(7 - (i % 5)), expected_delivery: daysFromNow(5 - (i % 6)), carrier: `Demo Carrier ${1 + (i % 3)}`,
          tracking_number: `DEMO-TRK-${String(i).padStart(6,'0')}`, incoterm_code: ['EXW','FCA','DAP','CIF'][i % 4],
        });
        await insert(client, 'shipment_items', { shipment_id: sh.id, order_item_id: oi.id, quantity: shippedQty });
        await insert(client, 'packing_lists', { shipment_id: sh.id, gross_weight: 80 + i * 2, net_weight: 70 + i * 2, pallet_count: 1 + (i % 4), package_count: 2 + (i % 6), notes: `Demo packing list ${i}` });
        await insert(client, 'loading_instructions', { shipment_id: sh.id, instruction_text: `Demo loading instruction ${i}. Customer: Demo Customer ${String(((i-1)%10)+1).padStart(2,'0')}.` });
      }

      // Every demo order gets a customer invoice; payment states vary deliberately.
      const invStatus = i % 5 === 0 ? 'PAID' : (i % 3 === 0 ? 'PARTIAL' : 'ISSUED');
      const inv = await insert(client, 'invoices', {
        invoice_number: `${i % 2 ? 'FZE' : 'FZD}-DEMO-${String(i).padStart(5,'0')}`,
        external_invoice_number: `EXT-DEMO-${String(i).padStart(5,'0')}`, order_id: o.id, customer_id: customerId,
        status: invStatus, total_amount: total, currency: 'EUR', exchange_rate_snapshot: i % 4 === 0 ? 37.25 : null,
        due_date: daysFromNow(i % 3 === 0 ? -5 : 15),
      });
      await insert(client, 'invoice_items', {
        invoice_id: inv.id, order_item_id: oi.id, description: nameSafe(productId, i), quantity: qty,
        unit_price: sale, total_price: total, currency: 'EUR', options_snapshot: JSON.stringify({ demo: true, scenario: i }),
      });

      if (invStatus === 'PAID' || invStatus === 'PARTIAL') {
        const amount = invStatus === 'PAID' ? total : money(total * 0.45);
        await insert(client, 'payments', {
          invoice_id: inv.id, amount, payment_date: daysAgo(i % 8), payment_method: ['BANK','CASH','CHECK'][i % 3],
          currency: 'EUR', exchange_rate_to_eur: 1, reference_number: `PAY-DEMO-${String(i).padStart(5,'0')}`,
          notes: `Demo payment scenario ${i}`, status: 'RECORDED',
        });
      }

      // Supplier-side invoice and payment data for all 20 scenarios.
      const siStatus = i % 4 === 0 ? 'PAID' : (i % 3 === 0 ? 'PARTIAL' : 'UNPAID');
      const supplierId = supplierIds[(i - 1) % supplierIds.length];
      const supplierAmount = money(purchase * qty);
      const si = await insert(client, 'supplier_invoices', {
        supplier_id: supplierId, order_id: o.id, invoice_number: `SUP-DEMO-${String(i).padStart(5,'0')}`,
        invoice_date: daysAgo(12 - (i % 5)), due_date: daysFromNow(i % 4 === 0 ? -2 : 12),
        amount: supplierAmount, total_amount: supplierAmount, currency: i % 4 === 0 ? 'TRY' : 'EUR',
        exchange_rate_to_eur: i % 4 === 0 ? 37.25 : 1, status: siStatus,
      });
      if (siStatus === 'PAID' || siStatus === 'PARTIAL') {
        const paid = siStatus === 'PAID' ? supplierAmount : money(supplierAmount * 0.5);
        await insert(client, 'supplier_payments', {
          supplier_invoice_id: si.id, amount: paid, payment_date: daysAgo(i % 6), payment_method: ['BANK','CASH','CHECK'][i % 3],
          currency: si.currency, exchange_rate_to_eur: si.exchange_rate_to_eur || 1, reference_number: `SUP-PAY-DEMO-${String(i).padStart(5,'0')}`,
          status: 'RECORDED', notes: `Demo supplier payment ${i}`,
        });
      }
    }

    // Eight additional orders exercise early lifecycle states without invoices.
    const lifecycle = ['draft','supplier_ordered','proforma_sent','customer_confirmed','in_production','supplier_ordered','proforma_sent','draft'];
    for (let i = 1; i <= lifecycle.length; i++) {
      const number = `ORD-LIFE-DEMO-${String(i).padStart(3,'0')}`;
      const exists = (await client.query(`SELECT id FROM orders WHERE order_number=$1 LIMIT 1`, [number])).rows[0];
      if (exists) continue;
      const productId = productIds[(i + 5) % productIds.length];
      const qty = 20 + i * 5;
      const purchase = 25 + i * 2;
      const sale = money(purchase * 1.3);
      const total = money(qty * sale);
      const o = await insert(client, 'orders', {
        order_number: number, customer_id: customerIds[(i + 3) % customerIds.length], status: lifecycle[i - 1],
        currency: 'EUR', total_amount: total, customer_order_number: `LIFE-${i}`, requested_delivery_date: daysFromNow(20),
        created_by: admin, notes: `Lifecycle test order ${i}`,
      });
      const oi = await insert(client, 'order_items', {
        order_id: o.id, product_id: productId, quantity: qty, unit_purchase_price: purchase, unit_sale_price: sale,
        margin_percent: ((sale - purchase) / sale) * 100, currency: 'EUR', total_sale_price: total, options_snapshot: '{}',
      });
      await insert(client, 'order_status_history', { order_id: o.id, from_status: null, to_status: lifecycle[i - 1], changed_by: admin });
      if (lifecycle[i - 1] === 'in_production') {
        const sh = await insert(client, 'shipments', { shipment_number: `SHP-LIFE-${String(i).padStart(3,'0')}`, order_id: o.id, status: 'READY', shipment_date: daysAgo(1), carrier: 'Demo Carrier' });
        await insert(client, 'shipment_items', { shipment_id: sh.id, order_item_id: oi.id, quantity: Math.floor(qty * 0.4) });
      }
    }

    await client.query('COMMIT');
    console.log('Demo seed completed: 20 inquiries, 20 invoice/order scenarios, supplier invoices/payments, shipments, packing/loading data, plus 8 lifecycle orders.');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Demo seed failed:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

function nameSafe(productId, i) { return `Demo Hydraulic Part ${String(((productId - 1) % 20) + 1).padStart(2,'0')} / Scenario ${i}`; }

main();
