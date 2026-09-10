import { pool } from '@/lib/db';

function esc(value: unknown) {
  return String(value ?? '—')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function money(value: unknown, currency: unknown) {
  return `${Number(value ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${esc(currency)}`;
}

function shell(title: string, body: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
  @page{size:A4;margin:14mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#172033;font-size:12px;margin:0}
  h1{font-size:22px;margin:0}h2{font-size:14px;margin:0 0 8px}.muted{color:#667085}.header{display:flex;justify-content:space-between;gap:24px;border-bottom:2px solid #172033;padding-bottom:14px;margin-bottom:18px}.brand{font-size:18px;font-weight:700}.doc{text-align:right}.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:18px}.box{border:1px solid #d9dee8;border-radius:6px;padding:11px}.box p{margin:3px 0}.table{width:100%;border-collapse:collapse;margin-top:12px}.table th,.table td{border-bottom:1px solid #e1e5ec;padding:8px 6px;text-align:left;vertical-align:top}.table th{background:#f5f7fa;font-size:11px}.right{text-align:right!important}.total{margin-left:auto;margin-top:14px;width:280px}.total td{padding:5px}.grand{font-size:14px;font-weight:700;border-top:2px solid #172033}.footer{margin-top:30px;border-top:1px solid #d9dee8;padding-top:10px;font-size:10px}.print{position:fixed;right:16px;top:16px;padding:8px 12px;border:1px solid #cbd2dc;background:#fff;border-radius:5px;cursor:pointer}@media print{.print{display:none}}
</style></head><body><button class="print" onclick="window.print()">Print / Save PDF</button>${body}</body></html>`;
}

export async function renderInvoiceDocument(id: number) {
  const invoice = await pool.query(`SELECT i.*, c.name customer_name,c.email customer_email,c.phone customer_phone,c.city customer_city,c.country customer_country,c.vat_number customer_vat,o.order_number,o.customer_order_number
    FROM invoices i JOIN customers c ON c.id=i.customer_id LEFT JOIN orders o ON o.id=i.order_id WHERE i.id=$1 AND i.deleted_at IS NULL`, [id]);
  if (!invoice.rows[0]) throw new Error('Invoice not found');
  const i = invoice.rows[0];
  const items = await pool.query(`SELECT ii.*,p.sku,p.hs_code,p.product_name_en,p.product_name_tr
    FROM invoice_items ii LEFT JOIN order_items oi ON oi.id=ii.order_item_id LEFT JOIN products p ON p.id=oi.product_id
    WHERE ii.invoice_id=$1 ORDER BY ii.id`, [id]);
  const rows = items.rows.map((x:any) => `<tr><td><strong>${esc(x.product_name_en || x.description)}</strong><br><span class="muted">${esc(x.product_name_tr || '')}</span></td><td>${esc(x.sku)}</td><td>${esc(x.hs_code)}</td><td class="right">${Number(x.quantity).toLocaleString()}</td><td class="right">${money(x.unit_price,x.currency)}</td><td class="right">${money(x.total_price,x.currency)}</td></tr>`).join('');
  const paid = await pool.query(`SELECT COALESCE(SUM(amount),0) paid FROM payments WHERE invoice_id=$1 AND status='RECORDED'`, [id]);
  const paidAmount = Number(paid.rows[0]?.paid ?? 0);
  const total = Number(i.total_amount ?? 0);
  return shell(`Invoice ${i.invoice_number}`, `<div class="header"><div><div class="brand">FZ ERP</div><div class="muted">B2B Export Management</div></div><div class="doc"><h1>COMMERCIAL INVOICE</h1><div>${esc(i.invoice_number)}</div><div class="muted">${i.created_at ? new Date(i.created_at).toLocaleDateString('en-GB') : '—'}</div></div></div>
    <div class="grid"><div class="box"><h2>Bill To</h2><p><strong>${esc(i.customer_name)}</strong></p><p>${esc(i.customer_city)}, ${esc(i.customer_country)}</p><p>VAT: ${esc(i.customer_vat)}</p><p>${esc(i.customer_email)}</p></div><div class="box"><h2>Reference</h2><p>Order: <strong>${esc(i.order_number)}</strong></p><p>Customer PO: ${esc(i.customer_order_number)}</p><p>Due date: ${i.due_date ? new Date(i.due_date).toLocaleDateString('en-GB') : '—'}</p><p>Status: ${esc(i.status)}</p></div></div>
    <table class="table"><thead><tr><th>Description</th><th>SKU</th><th>HS Code</th><th class="right">Qty</th><th class="right">Unit Price</th><th class="right">Amount</th></tr></thead><tbody>${rows}</tbody></table>
    <table class="total"><tbody><tr><td>Invoice total</td><td class="right">${money(total,i.currency)}</td></tr><tr><td>Paid</td><td class="right">${money(paidAmount,i.currency)}</td></tr><tr class="grand"><td>Balance</td><td class="right">${money(total-paidAmount,i.currency)}</td></tr></tbody></table>
    <div class="footer">This document is generated from the immutable invoice snapshot stored in FZ ERP. Currency: ${esc(i.currency)}. Exchange-rate snapshot: ${esc(i.exchange_rate_snapshot)}.</div>`);
}

export async function renderShipmentDocument(id: number) {
  const shipment = await pool.query(`SELECT s.*,o.order_number,o.customer_order_number,c.name customer_name,c.email customer_email,c.phone customer_phone,c.city customer_city,c.country customer_country,c.vat_number customer_vat
    FROM shipments s JOIN orders o ON o.id=s.order_id JOIN customers c ON c.id=o.customer_id WHERE s.id=$1 AND s.deleted_at IS NULL`, [id]);
  if (!shipment.rows[0]) throw new Error('Shipment not found');
  const s = shipment.rows[0];
  const items = await pool.query(`SELECT si.quantity,oi.quantity ordered_quantity,p.name,p.product_name_en,p.product_name_tr,p.sku,p.hs_code
    FROM shipment_items si JOIN order_items oi ON oi.id=si.order_item_id JOIN products p ON p.id=oi.product_id WHERE si.shipment_id=$1 ORDER BY si.id`, [id]);
  const packing = await pool.query(`SELECT * FROM packing_lists WHERE shipment_id=$1`, [id]);
  const pl = packing.rows[0];
  const rows = items.rows.map((x:any) => `<tr><td><strong>${esc(x.product_name_en || x.name)}</strong><br><span class="muted">${esc(x.product_name_tr || '')}</span></td><td>${esc(x.sku)}</td><td>${esc(x.hs_code)}</td><td class="right">${Number(x.quantity).toLocaleString()}</td><td class="right">${Number(x.ordered_quantity).toLocaleString()}</td></tr>`).join('');
  const loading = await pool.query(`SELECT instruction_text FROM loading_instructions WHERE shipment_id=$1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`, [id]);
  return shell(`Packing List ${s.shipment_number}`, `<div class="header"><div><div class="brand">FZ ERP</div><div class="muted">Export Logistics</div></div><div class="doc"><h1>PACKING LIST</h1><div>${esc(s.shipment_number)}</div><div class="muted">${s.shipment_date ? new Date(s.shipment_date).toLocaleDateString('en-GB') : '—'}</div></div></div>
    <div class="grid"><div class="box"><h2>Consignee</h2><p><strong>${esc(s.customer_name)}</strong></p><p>${esc(s.customer_city)}, ${esc(s.customer_country)}</p><p>VAT: ${esc(s.customer_vat)}</p><p>${esc(s.customer_email)}</p></div><div class="box"><h2>Shipment</h2><p>Order: <strong>${esc(s.order_number)}</strong></p><p>Customer PO: ${esc(s.customer_order_number)}</p><p>Incoterm: <strong>${esc(s.incoterm_code)}</strong></p><p>Carrier: ${esc(s.carrier)}</p><p>Tracking: ${esc(s.tracking_number)}</p></div></div>
    <table class="table"><thead><tr><th>Description</th><th>SKU</th><th>HS Code</th><th class="right">Shipped Qty</th><th class="right">Order Qty</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="grid" style="margin-top:18px"><div class="box"><h2>Package Summary</h2><p>Gross weight: ${esc(pl?.gross_weight)} kg</p><p>Net weight: ${esc(pl?.net_weight)} kg</p><p>Pallets: ${esc(pl?.pallet_count)}</p><p>Packages: ${esc(pl?.package_count)}</p></div><div class="box"><h2>Loading Instruction</h2><p>${esc(loading.rows[0]?.instruction_text)}</p></div></div>
    <div class="footer">Shipment quantities are recorded per shipment and may represent a partial or over shipment against the order.</div>`);
}
