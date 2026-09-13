-- Connected commercial workflow v2. Backward compatible with existing tables/statuses.
CREATE TABLE IF NOT EXISTS customer_products (
  id SERIAL PRIMARY KEY,
  customer_id INT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  customer_sku VARCHAR(150),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  supplier_sku VARCHAR(150),
  aliases JSONB NOT NULL DEFAULT '[]',
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(customer_id, customer_sku)
);
CREATE INDEX IF NOT EXISTS idx_customer_products_customer ON customer_products(customer_id);

CREATE TABLE IF NOT EXISTS product_aliases (
  id BIGSERIAL PRIMARY KEY,
  product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  alias VARCHAR(255) NOT NULL,
  source VARCHAR(50) DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(product_id, alias)
);
CREATE INDEX IF NOT EXISTS idx_product_aliases_alias ON product_aliases(alias);

ALTER TABLE customer_inquiries ADD COLUMN IF NOT EXISTS source_type VARCHAR(30) DEFAULT 'manual';
ALTER TABLE customer_inquiries ADD COLUMN IF NOT EXISTS source_text TEXT;
ALTER TABLE customer_inquiries ADD COLUMN IF NOT EXISTS requested_delivery_date TIMESTAMPTZ;
ALTER TABLE customer_inquiries ADD COLUMN IF NOT EXISTS review_required BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE customer_inquiries ADD COLUMN IF NOT EXISTS quotation_id INT;

ALTER TABLE customer_inquiry_items ADD COLUMN IF NOT EXISTS customer_product_id INT REFERENCES customer_products(id);
ALTER TABLE customer_inquiry_items ADD COLUMN IF NOT EXISTS raw_product_reference VARCHAR(255);
ALTER TABLE customer_inquiry_items ADD COLUMN IF NOT EXISTS match_confidence NUMERIC(5,2);
ALTER TABLE customer_inquiry_items ADD COLUMN IF NOT EXISTS match_method VARCHAR(50);
ALTER TABLE customer_inquiry_items ADD COLUMN IF NOT EXISTS review_status VARCHAR(30) DEFAULT 'PENDING';
CREATE INDEX IF NOT EXISTS idx_inquiry_items_customer_product ON customer_inquiry_items(customer_product_id);

CREATE TABLE IF NOT EXISTS supplier_rfqs (
  id SERIAL PRIMARY KEY,
  rfq_number VARCHAR(100) UNIQUE NOT NULL,
  inquiry_id INT NOT NULL REFERENCES customer_inquiries(id) ON DELETE RESTRICT,
  supplier_id INT NOT NULL REFERENCES suppliers(id),
  contact_id INT REFERENCES customer_contacts(id),
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
  requested_at TIMESTAMPTZ,
  response_due_at TIMESTAMPTZ,
  notes TEXT,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_supplier_rfqs_inquiry ON supplier_rfqs(inquiry_id);
CREATE TABLE IF NOT EXISTS supplier_rfq_items (
  id SERIAL PRIMARY KEY,
  rfq_id INT NOT NULL REFERENCES supplier_rfqs(id) ON DELETE CASCADE,
  inquiry_item_id INT REFERENCES customer_inquiry_items(id),
  product_id INT REFERENCES products(id),
  customer_product_id INT REFERENCES customer_products(id),
  description TEXT,
  quantity NUMERIC(15,3) NOT NULL CHECK(quantity > 0),
  raw_product_reference VARCHAR(255)
);
CREATE TABLE IF NOT EXISTS supplier_responses (
  id SERIAL PRIMARY KEY,
  rfq_id INT NOT NULL REFERENCES supplier_rfqs(id) ON DELETE CASCADE,
  received_at TIMESTAMPTZ DEFAULT now(),
  status VARCHAR(30) NOT NULL DEFAULT 'RECEIVED',
  notes TEXT,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS supplier_response_items (
  id SERIAL PRIMARY KEY,
  response_id INT NOT NULL REFERENCES supplier_responses(id) ON DELETE CASCADE,
  rfq_item_id INT NOT NULL REFERENCES supplier_rfq_items(id) ON DELETE CASCADE,
  purchase_price NUMERIC(15,2),
  currency CHAR(3),
  lead_time_days INT,
  supplier_delivery_date TIMESTAMPTZ,
  supplier_notes TEXT
);

ALTER TABLE price_offers ADD COLUMN IF NOT EXISTS supplier_rfq_id INT REFERENCES supplier_rfqs(id);
ALTER TABLE price_offers ADD COLUMN IF NOT EXISTS supplier_response_id INT REFERENCES supplier_responses(id);
ALTER TABLE price_offers ADD COLUMN IF NOT EXISTS inquiry_id INT REFERENCES customer_inquiries(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS quotation_id INT REFERENCES price_offers(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_confirmation_at TIMESTAMPTZ;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS customer_product_id INT REFERENCES customer_products(id);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS purchase_price_snapshot NUMERIC(15,2);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS sale_price_snapshot NUMERIC(15,2);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS supplier_id INT REFERENCES suppliers(id);

CREATE TABLE IF NOT EXISTS inquiry_workflow_events (
  id BIGSERIAL PRIMARY KEY,
  inquiry_id INT NOT NULL REFERENCES customer_inquiries(id) ON DELETE CASCADE,
  event_type VARCHAR(60) NOT NULL,
  entity_type VARCHAR(60),
  entity_id INT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inquiry_events_inquiry ON inquiry_workflow_events(inquiry_id,created_at DESC);

CREATE TABLE IF NOT EXISTS communication_history (
  id BIGSERIAL PRIMARY KEY,
  inquiry_id INT REFERENCES customer_inquiries(id) ON DELETE CASCADE,
  quotation_id INT REFERENCES price_offers(id) ON DELETE SET NULL,
  order_id INT REFERENCES orders(id) ON DELETE SET NULL,
  supplier_rfq_id INT REFERENCES supplier_rfqs(id) ON DELETE SET NULL,
  recipient VARCHAR(255) NOT NULL,
  language VARCHAR(10) NOT NULL DEFAULT 'en',
  template VARCHAR(100),
  subject TEXT,
  body TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
  provider VARCHAR(50) DEFAULT 'outlook',
  created_by INT REFERENCES users(id),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_communication_history_inquiry ON communication_history(inquiry_id,created_at DESC);

CREATE TABLE IF NOT EXISTS shipment_item_fulfillment (
  id BIGSERIAL PRIMARY KEY,
  order_item_id INT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  accepted_quantity NUMERIC(15,3) NOT NULL CHECK(accepted_quantity > 0),
  reason TEXT NOT NULL,
  accepted_by INT REFERENCES users(id),
  accepted_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shipment_fulfillment_item ON shipment_item_fulfillment(order_item_id);

CREATE TABLE IF NOT EXISTS workflow_imports (
  id SERIAL PRIMARY KEY,
  inquiry_id INT REFERENCES customer_inquiries(id) ON DELETE SET NULL,
  source_type VARCHAR(30) NOT NULL,
  filename VARCHAR(255),
  raw_text TEXT,
  parsed_rows JSONB NOT NULL DEFAULT '[]',
  status VARCHAR(30) NOT NULL DEFAULT 'REVIEW',
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_inquiry ON orders(inquiry_id);
CREATE INDEX IF NOT EXISTS idx_price_offers_inquiry ON price_offers(inquiry_id);
