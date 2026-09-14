-- Historical sales ledger imported from legacy annual sales workbooks.
CREATE TABLE IF NOT EXISTS historical_sales (
  id BIGSERIAL PRIMARY KEY,
  source_year INT NOT NULL,
  source_row INT NOT NULL,
  customer_raw TEXT,
  sales_invoice_raw TEXT,
  quantity_raw TEXT,
  sales_date TIMESTAMPTZ,
  sales_amount NUMERIC(18,2),
  customer_payment_raw TEXT,
  gdc_invoice_raw TEXT,
  gdc_purchase_amount NUMERIC(18,2),
  gdc_payment_date_raw TEXT,
  gdc_payment_amount_raw TEXT,
  claim_raw TEXT,
  notes_raw TEXT,
  source_file TEXT NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(source_file, source_year, source_row)
);
CREATE INDEX IF NOT EXISTS idx_historical_sales_date ON historical_sales(sales_date);
CREATE INDEX IF NOT EXISTS idx_historical_sales_customer ON historical_sales(customer_raw);
CREATE INDEX IF NOT EXISTS idx_historical_sales_year ON historical_sales(source_year);
