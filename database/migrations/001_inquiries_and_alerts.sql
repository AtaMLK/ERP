CREATE SEQUENCE IF NOT EXISTS inquiry_number_seq START 1;

CREATE TABLE IF NOT EXISTS customer_inquiries (
  id SERIAL PRIMARY KEY,
  inquiry_number VARCHAR(100) UNIQUE NOT NULL,
  customer_id INT NOT NULL REFERENCES customers(id),
  contact_id INT REFERENCES customer_contacts(id),
  inquiry_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  subject VARCHAR(255) NOT NULL,
  notes TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW','PRICING','OFFER_SENT','WON','LOST','CONVERTED')),
  offer_id INT REFERENCES price_offers(id),
  order_id INT REFERENCES orders(id),
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS customer_inquiry_items (
  id SERIAL PRIMARY KEY,
  inquiry_id INT NOT NULL REFERENCES customer_inquiries(id) ON DELETE CASCADE,
  product_id INT REFERENCES products(id),
  description TEXT,
  quantity NUMERIC(15,3) NOT NULL CHECK(quantity > 0),
  options JSONB DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS inquiry_status_history (
  id BIGSERIAL PRIMARY KEY,
  inquiry_id INT NOT NULL REFERENCES customer_inquiries(id) ON DELETE CASCADE,
  from_status VARCHAR(30),
  to_status VARCHAR(30) NOT NULL,
  changed_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE price_offers ADD COLUMN IF NOT EXISTS inquiry_id INT REFERENCES customer_inquiries(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS inquiry_id INT REFERENCES customer_inquiries(id);
CREATE INDEX IF NOT EXISTS idx_inquiries_customer ON customer_inquiries(customer_id, inquiry_date DESC);
CREATE INDEX IF NOT EXISTS idx_inquiries_status ON customer_inquiries(status);
CREATE INDEX IF NOT EXISTS idx_inquiry_items_inquiry ON customer_inquiry_items(inquiry_id);
CREATE INDEX IF NOT EXISTS idx_inquiry_history_inquiry ON inquiry_status_history(inquiry_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_offers_inquiry ON price_offers(inquiry_id);
CREATE INDEX IF NOT EXISTS idx_orders_inquiry ON orders(inquiry_id);

CREATE OR REPLACE FUNCTION set_customer_inquiry_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS trg_customer_inquiry_updated_at ON customer_inquiries;
CREATE TRIGGER trg_customer_inquiry_updated_at BEFORE UPDATE ON customer_inquiries FOR EACH ROW EXECUTE FUNCTION set_customer_inquiry_updated_at();
