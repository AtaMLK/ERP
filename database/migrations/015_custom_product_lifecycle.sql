-- Custom/customer-specific product continuity.
ALTER TABLE customer_products ADD COLUMN IF NOT EXISTS master_product_id INT REFERENCES products(id) ON DELETE SET NULL;
ALTER TABLE price_offer_items ADD COLUMN IF NOT EXISTS customer_product_id INT REFERENCES customer_products(id) ON DELETE SET NULL;
ALTER TABLE price_offer_items ADD COLUMN IF NOT EXISTS supplier_response_item_id INT REFERENCES supplier_response_items(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_customer_products_master ON customer_products(master_product_id);
CREATE INDEX IF NOT EXISTS idx_offer_items_customer_product ON price_offer_items(customer_product_id);
CREATE INDEX IF NOT EXISTS idx_offer_items_supplier_response ON price_offer_items(supplier_response_item_id);
