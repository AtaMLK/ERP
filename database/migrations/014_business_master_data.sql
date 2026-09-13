-- Business master-data hardening for the connected workflow.
-- Keep customer addresses explicitly; supplier is intentionally seeded as the single current supplier.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS address TEXT;

INSERT INTO suppliers (name, currency, status)
VALUES ('GDC', 'EUR', 'ACTIVE')
ON CONFLICT (name) DO UPDATE SET currency='EUR', status='ACTIVE', updated_at=now();

CREATE INDEX IF NOT EXISTS idx_products_supplier ON products(supplier_id);
CREATE INDEX IF NOT EXISTS idx_products_sku_normalized ON products ((regexp_replace(lower(sku),'[^a-z0-9]','','g')));

-- The application seed/import script upserts the supplied product/customer JSON into these master tables.
