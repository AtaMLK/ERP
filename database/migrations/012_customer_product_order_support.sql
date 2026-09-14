-- Customer product and order support
-- Keep this migration safe to re-run against an already-updated database.

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS customer_product_id INTEGER REFERENCES customer_products(id),
  ADD COLUMN IF NOT EXISTS product_id INTEGER REFERENCES products(id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'order_item_product_or_customer_product'
      AND conrelid = 'order_items'::regclass
  ) THEN
    ALTER TABLE order_items
      ADD CONSTRAINT order_item_product_or_customer_product
      CHECK (product_id IS NOT NULL OR customer_product_id IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_order_items_customer_product_id
  ON order_items(customer_product_id);

CREATE INDEX IF NOT EXISTS idx_order_items_product_id
  ON order_items(product_id);
