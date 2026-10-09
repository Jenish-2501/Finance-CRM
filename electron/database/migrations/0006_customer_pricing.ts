// Per-customer selling prices (no effective dating: rates apply immediately).
// NEVER edit this file after release. Create a new 000N_*.ts instead.
//
// Active overrides live in customer_product_prices (one row per customer ×
// product × unit, enforced by partial unique index); every set/change/removal
// appends to customer_price_history, which is never updated or deleted.
export const version = 6;
export const name = '0006_customer_pricing';

export const sql = `
CREATE TABLE IF NOT EXISTS customer_product_prices (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  price REAL NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS customer_product_prices_unique
  ON customer_product_prices(customer_id, product_id, unit_id);
CREATE TABLE IF NOT EXISTS customer_price_history (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  old_price REAL,
  new_price REAL,
  changed_at TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);
CREATE INDEX IF NOT EXISTS customer_price_history_customer_idx
  ON customer_price_history(customer_id);
`;
