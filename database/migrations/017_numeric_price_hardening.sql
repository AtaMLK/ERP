-- Business price data can contain fractional values (e.g. 2.3400000000000003).
-- Normalize legacy installations that may still have integer price columns.
ALTER TABLE products
  ALTER COLUMN unit_price TYPE NUMERIC(15,2) USING unit_price::NUMERIC(15,2),
  ALTER COLUMN purchase_price TYPE NUMERIC(15,2) USING purchase_price::NUMERIC(15,2),
  ALTER COLUMN sale_price TYPE NUMERIC(15,2) USING sale_price::NUMERIC(15,2),
  ALTER COLUMN margin_percent TYPE NUMERIC(8,2) USING margin_percent::NUMERIC(8,2);

ALTER TABLE product_price_history
  ALTER COLUMN purchase_price TYPE NUMERIC(15,2) USING purchase_price::NUMERIC(15,2),
  ALTER COLUMN sale_price TYPE NUMERIC(15,2) USING sale_price::NUMERIC(15,2),
  ALTER COLUMN margin_percent TYPE NUMERIC(8,2) USING margin_percent::NUMERIC(8,2);
