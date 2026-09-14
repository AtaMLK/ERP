-- Historical sales imported from annual sales workbooks.
-- This table preserves source-level values that cannot be safely normalized.
CREATE TABLE IF NOT EXISTS historical_sales (
  id BIGSERIAL PRIMARY KEY,
  source_year INT NOT NULL,
  source_row INT NOT NULL,
  customer_raw TEXT,
  customer_id INT REFERENCES customers(id) ON DELETE SET NULL,
  sales_invoice_raw TEXT,
  quantity_raw TEXT,
  sales_date TIMESTAMPTZ,
  sales_amount_eur NUMERIC(15,2),
  customer_payment_raw TEXT,
  gdc_invoice_raw TEXT,
  gdc_purchase_amount_eur NUMERIC(15,2),
  gdc_payment_date_raw TEXT,
  gdc_payment_amount_eur NUMERIC(15,2),
  claim_raw TEXT,
  notes_raw TEXT,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(source_year, source_row)
);
CREATE INDEX IF NOT EXISTS idx_historical_sales_year ON historical_sales(source_year);
CREATE INDEX IF NOT EXISTS idx_historical_sales_customer ON historical_sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_historical_sales_date ON historical_sales(sales_date);

-- Mark historical records on orders/invoices without changing the live workflow.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS source_type VARCHAR(30) DEFAULT 'live';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS source_type VARCHAR(30) DEFAULT 'live';
ALTER TABLE supplier_invoices ADD COLUMN IF NOT EXISTS source_type VARCHAR(30) DEFAULT 'live';
CREATE INDEX IF NOT EXISTS idx_orders_source_type ON orders(source_type);
CREATE INDEX IF NOT EXISTS idx_invoices_source_type ON invoices(source_type);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_source_type ON supplier_invoices(source_type);
