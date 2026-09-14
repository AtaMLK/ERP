ALTER TABLE customers ADD COLUMN IF NOT EXISTS address TEXT;

CREATE TABLE IF NOT EXISTS historical_sales (
  id BIGSERIAL PRIMARY KEY,
  source_year INT NOT NULL,
  source_row INT NOT NULL,
  customer_raw TEXT,
  sales_invoice_raw TEXT,
  quantity_raw TEXT,
  sales_date_raw TEXT,
  sales_amount_raw TEXT,
  customer_payment_raw TEXT,
  gdc_invoice_raw TEXT,
  gdc_purchase_amount_raw TEXT,
  gdc_payment_date_raw TEXT,
  gdc_payment_amount_raw TEXT,
  claim_raw TEXT,
  notes_raw TEXT,
  customer_id INT REFERENCES customers(id),
  order_id INT REFERENCES orders(id),
  customer_invoice_id INT REFERENCES invoices(id),
  supplier_invoice_id INT REFERENCES supplier_invoices(id),
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(source_year, source_row)
);

CREATE INDEX IF NOT EXISTS idx_historical_sales_customer ON historical_sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_historical_sales_order ON historical_sales(order_id);
CREATE INDEX IF NOT EXISTS idx_historical_sales_year ON historical_sales(source_year);
