-- Workflow v2 hardening: preserve customer-product identity through quotation and order conversion.
ALTER TABLE customer_products ADD COLUMN IF NOT EXISTS master_product_id INT REFERENCES products(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_customer_products_master ON customer_products(master_product_id);

ALTER TABLE price_offer_items ADD COLUMN IF NOT EXISTS customer_product_id INT REFERENCES customer_products(id) ON DELETE SET NULL;
ALTER TABLE price_offer_items ADD COLUMN IF NOT EXISTS supplier_response_item_id INT REFERENCES supplier_response_items(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_price_offer_items_customer_product ON price_offer_items(customer_product_id);
CREATE INDEX IF NOT EXISTS idx_price_offer_items_response_item ON price_offer_items(supplier_response_item_id);

ALTER TABLE supplier_rfqs ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255);
