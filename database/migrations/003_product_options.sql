-- Product configuration/options used by standard and configurable hydraulic parts.
CREATE TABLE IF NOT EXISTS product_options (
  id SERIAL PRIMARY KEY,
  product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  option_name VARCHAR(100) NOT NULL,
  option_value VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(product_id, option_name, option_value)
);
CREATE INDEX IF NOT EXISTS idx_product_options_product ON product_options(product_id);
