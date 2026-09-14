-- Runtime compatibility for databases that were created before workflow v2.
ALTER TABLE customer_inquiries ADD COLUMN IF NOT EXISTS source_type VARCHAR(30) DEFAULT 'manual';
ALTER TABLE customer_inquiries ADD COLUMN IF NOT EXISTS source_text TEXT;
ALTER TABLE customer_inquiries ADD COLUMN IF NOT EXISTS requested_delivery_date TIMESTAMPTZ;
ALTER TABLE customer_inquiries ADD COLUMN IF NOT EXISTS review_required BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE customer_inquiries ADD COLUMN IF NOT EXISTS quotation_id INT;

ALTER TABLE customer_inquiry_items ADD COLUMN IF NOT EXISTS customer_product_id INT REFERENCES customer_products(id) ON DELETE SET NULL;
ALTER TABLE customer_inquiry_items ADD COLUMN IF NOT EXISTS raw_product_reference VARCHAR(255);
ALTER TABLE customer_inquiry_items ADD COLUMN IF NOT EXISTS match_confidence NUMERIC(5,2);
ALTER TABLE customer_inquiry_items ADD COLUMN IF NOT EXISTS match_method VARCHAR(50);
ALTER TABLE customer_inquiry_items ADD COLUMN IF NOT EXISTS review_status VARCHAR(30) DEFAULT 'PENDING';

ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_date TIMESTAMPTZ;
UPDATE orders SET order_date = COALESCE(order_date, created_at, now()) WHERE order_date IS NULL;
CREATE INDEX IF NOT EXISTS idx_orders_order_date ON orders(order_date);

CREATE INDEX IF NOT EXISTS idx_customer_inquiries_source_type ON customer_inquiries(source_type);
CREATE INDEX IF NOT EXISTS idx_inquiry_items_review_status ON customer_inquiry_items(review_status);
