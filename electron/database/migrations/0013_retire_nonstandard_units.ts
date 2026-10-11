// Retire products whose primary unit is outside the kept set
// (PCS, KG, BOX, GRAM) and prune the disconnected unit master rows.
// Retired products lose their units, prices, receipts, movements and pricing
// overrides; invoices, payments and audit logs are financial history and are
// intentionally left untouched (invoice screens render from snapshots).
// Secondary-packaging rows (unit != product primary) were already removed
// by v12, so every remaining non-primary row belongs to a retired product.
// NEVER edit this file after release. Create a new 001N_*.ts instead.
export const version = 13;
export const name = '0013_retire_nonstandard_units';

export const sql = `
DELETE FROM invoice_allocations WHERE customer_inventory_movement_id IN (
  SELECT id FROM customer_inventory_movements WHERE product_id IN (
    SELECT id FROM products WHERE primary_unit_id NOT IN (
      SELECT id FROM uoms WHERE code IN ('PCS', 'KG', 'BOX', 'GRAM'))));
DELETE FROM customer_inventory_movements WHERE product_id IN (
  SELECT id FROM products WHERE primary_unit_id NOT IN (
    SELECT id FROM uoms WHERE code IN ('PCS', 'KG', 'BOX', 'GRAM')));
DELETE FROM inventory_movements WHERE product_id IN (
  SELECT id FROM products WHERE primary_unit_id NOT IN (
    SELECT id FROM uoms WHERE code IN ('PCS', 'KG', 'BOX', 'GRAM')));
DELETE FROM stock_receipt_items WHERE product_id IN (
  SELECT id FROM products WHERE primary_unit_id NOT IN (
    SELECT id FROM uoms WHERE code IN ('PCS', 'KG', 'BOX', 'GRAM')));
DELETE FROM stock_receipts WHERE id NOT IN (SELECT stock_receipt_id FROM stock_receipt_items)
  AND id NOT IN (SELECT reference_id FROM inventory_movements WHERE reference_type = 'STOCK_RECEIPT');
DELETE FROM customer_product_prices WHERE product_id IN (
  SELECT id FROM products WHERE primary_unit_id NOT IN (
    SELECT id FROM uoms WHERE code IN ('PCS', 'KG', 'BOX', 'GRAM')));
DELETE FROM customer_price_history WHERE product_id IN (
  SELECT id FROM products WHERE primary_unit_id NOT IN (
    SELECT id FROM uoms WHERE code IN ('PCS', 'KG', 'BOX', 'GRAM')));
DELETE FROM product_prices WHERE product_id IN (
  SELECT id FROM products WHERE primary_unit_id NOT IN (
    SELECT id FROM uoms WHERE code IN ('PCS', 'KG', 'BOX', 'GRAM')));
DELETE FROM product_units WHERE product_id IN (
  SELECT id FROM products WHERE primary_unit_id NOT IN (
    SELECT id FROM uoms WHERE code IN ('PCS', 'KG', 'BOX', 'GRAM')));
DELETE FROM products WHERE primary_unit_id NOT IN (
  SELECT id FROM uoms WHERE code IN ('PCS', 'KG', 'BOX', 'GRAM'));
DELETE FROM uoms WHERE code NOT IN ('PCS', 'KG', 'BOX', 'GRAM');
`;
