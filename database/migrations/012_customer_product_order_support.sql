ALTER TABLE order_items ALTER COLUMN product_id DROP NOT NULL;
ALTER TABLE order_items ADD CONSTRAINT order_item_product_or_customer_product CHECK(product_id IS NOT NULL OR customer_product_id IS NOT NULL) NOT VALID;
