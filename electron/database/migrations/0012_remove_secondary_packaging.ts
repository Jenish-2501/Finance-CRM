// Remove secondary packaging units: product creation no longer offers a
// secondary unit, so every product_units / product_prices row whose unit is
// not the product's own primary_unit_id is dead configuration. Movements
// that historically used such units keep working — convertQuantity falls
// back to 1:1 when a unit row is missing.
// NEVER edit this file after release. Create a new 001N_*.ts instead.
export const version = 12;
export const name = '0012_remove_secondary_packaging';

export const sql = `
DELETE FROM product_prices WHERE unit_id NOT IN (SELECT primary_unit_id FROM products WHERE products.id = product_prices.product_id);
DELETE FROM product_units WHERE unit_id NOT IN (SELECT primary_unit_id FROM products WHERE products.id = product_units.product_id);
`;
