-- Historical sales can contain fractional monetary values. Normalize legacy integer columns.
ALTER TABLE orders
  ALTER COLUMN total_amount TYPE NUMERIC(15,2) USING total_amount::NUMERIC(15,2);

ALTER TABLE invoices
  ALTER COLUMN total_amount TYPE NUMERIC(15,2) USING total_amount::NUMERIC(15,2);

ALTER TABLE supplier_invoices
  ALTER COLUMN amount TYPE NUMERIC(15,2) USING amount::NUMERIC(15,2);
