// Remove the HSN / tariff code from products. The field was never used in
// tax math (GST rate is a single business-level setting), never validated,
// and never printed on tax invoices — only the delivery-challan PDF carried
// an HSN column, which is dropped alongside.
// NEVER edit this file after release. Create a new 001N_*.ts instead.
export const version = 10;
export const name = '0010_remove_hsn';

export const sql = `
ALTER TABLE products DROP COLUMN hsn_code;
`;
