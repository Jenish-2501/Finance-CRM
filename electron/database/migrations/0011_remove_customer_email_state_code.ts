// Remove customer email + state code. Neither was ever used in tax math
// (GST rate is a single business-level setting), and the state code needed
// for intra/inter-state determination is now derived at read time
// (see getCustomerStateCode in src/utils/calculations.ts): GSTIN prefix
// first, then the state-name map, then the legacy '24' default.
// NEVER edit this file after release. Create a new 001N_*.ts instead.
export const version = 11;
export const name = '0011_remove_customer_email_state_code';

export const sql = `
ALTER TABLE customers DROP COLUMN email;
ALTER TABLE customers DROP COLUMN state_code;
`;
