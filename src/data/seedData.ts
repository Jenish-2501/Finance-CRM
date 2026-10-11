import {
  BusinessSettings,
  UnitOfMeasure,
  Customer,
  Product,
  ProductUnit,
  ProductPrice,
  StockReceipt,
  StockReceiptItem,
  InventoryMovement,
  CustomerInventoryMovement,
  Invoice,
  InvoiceItem,
  InvoiceCustomerInventoryAllocation,
  InvoicePayment,
  AuditLog
} from '../types/database';

export const SEED_BUSINESS_SETTINGS: BusinessSettings = {
  id: 'biz-1',
  business_name: 'ABC Industries Pvt Ltd',
  legal_name: 'ABC Industries Private Limited',
  gst_number: '24AAACA9999P1Z1',
  pan: 'AAACA9999P',
  address: '401-405, Apex Business Hub, Ring Road',
  city: 'Surat',
  state: 'Gujarat',
  country: 'India',
  postal_code: '395002',
  phone: '+91 98250 12345',
  email: 'accounts@abcindustries.com',
  website: 'https://abcindustries.example.com',
  bank_name: 'HDFC Bank Ltd',
  bank_account_number: '50200012345678',
  ifsc: 'HDFC0001234',
  branch: 'Surat Ring Road Commercial Branch',
  invoice_prefix: 'ABC-2026-',
  invoice_next_number: 1004,
  invoice_start_number: 1,
  customer_next_number: 1,
  document_next_number: 1,
  currency: 'INR',
  default_gst_rate: 5,
  state_code: '24',
  created_at: '2026-01-01T08:00:00Z',
  updated_at: '2026-01-01T08:00:00Z'
};

export const SEED_UOMS: Record<string, UnitOfMeasure> = {
  'uom-pcs': { id: 'uom-pcs', code: 'PCS', name: 'Pieces', description: 'Individual piece unit', is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  'uom-kg': { id: 'uom-kg', code: 'KG', name: 'Kilograms', description: 'Metric weight unit', is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  'uom-box': { id: 'uom-box', code: 'BOX', name: 'Boxes', description: 'Packaging box container', is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  'uom-gram': { id: 'uom-gram', code: 'GRAM', name: 'Grams', description: 'Granular metric weight unit', is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
};

export const SEED_CUSTOMERS: Record<string, Customer> = {
  'cust-1': {
    id: 'cust-1',
    customer_number: 'C-1001',
    customer_name: 'ABC Corporate Tower Ltd',
    pan: 'AABCA1234C',
    gst_number: '24AABCA1234C1Z5',
    mobile: '+91 98980 11223',
    address: 'Plot 12, GIDC Electronic Estate',
    city: 'Surat',
    state: 'Gujarat',
    country: 'India',
    postal_code: '395007',
    credit_limit: 500000,
    bank_details: { bank_name: 'ICICI Bank', account_number: '001234998811', ifsc: 'ICIC0000012' },
    is_active: true,
    created_at: '2026-01-10T10:00:00Z',
    updated_at: '2026-01-10T10:00:00Z'
  },
  'cust-2': {
    id: 'cust-2',
    customer_number: 'C-1002',
    customer_name: 'Apex Manufacturing Infra',
    pan: 'AACCA2345D',
    gst_number: '24AACCA2345D1Z6',
    mobile: '+91 98241 55667',
    address: 'Sanand Industrial Park, Phase II',
    city: 'Ahmedabad',
    state: 'Gujarat',
    country: 'India',
    postal_code: '382170',
    credit_limit: 800000,
    bank_details: { bank_name: 'State Bank of India', account_number: '31289400291', ifsc: 'SBIN0001422' },
    is_active: true,
    created_at: '2026-01-11T11:00:00Z',
    updated_at: '2026-01-11T11:00:00Z'
  },
  'cust-3': {
    id: 'cust-3',
    customer_number: 'C-1003',
    customer_name: 'Precision Dynamics Corporation',
    pan: 'AABCP3456E',
    gst_number: '27AABCP3456E1Z7',
    mobile: '+91 99201 88990',
    address: 'Andheri-Kurla Road, MIDC Industrial Zone',
    city: 'Mumbai',
    state: 'Maharashtra',
    country: 'India',
    postal_code: '400093',
    credit_limit: 1200000,
    bank_details: { bank_name: 'Axis Bank', account_number: '9180200388190', ifsc: 'UTIB0000180' },
    is_active: true,
    created_at: '2026-01-12T14:00:00Z',
    updated_at: '2026-01-12T14:00:00Z'
  },
  'cust-4': {
    id: 'cust-4',
    customer_number: 'C-1004',
    customer_name: 'Nova Tech Engineering Solutions',
    pan: 'AAGCN4567F',
    gst_number: '24AAGCN4567F1Z8',
    mobile: '+91 97277 44332',
    address: 'Makarpura GIDC Industrial Area',
    city: 'Vadodara',
    state: 'Gujarat',
    country: 'India',
    postal_code: '390010',
    credit_limit: 450000,
    bank_details: { bank_name: 'Bank of Baroda', account_number: '019802000119', ifsc: 'BARB0MAKARP' },
    is_active: true,
    created_at: '2026-01-15T09:30:00Z',
    updated_at: '2026-01-15T09:30:00Z'
  },
  'cust-5': {
    id: 'cust-5',
    customer_number: 'C-1005',
    customer_name: 'Zenith Heavy Equipment Ltd',
    pan: 'AAACZ5678G',
    gst_number: '29AAACZ5678G1Z9',
    mobile: '+91 94480 77112',
    address: 'Peenya Industrial Estate, 3rd Stage',
    city: 'Bengaluru',
    state: 'Karnataka',
    country: 'India',
    postal_code: '560058',
    credit_limit: 1500000,
    bank_details: { bank_name: 'Canara Bank', account_number: '0412101009822', ifsc: 'CNRB0000412' },
    is_active: true,
    created_at: '2026-01-18T16:00:00Z',
    updated_at: '2026-01-18T16:00:00Z'
  }
};

export const SEED_PRODUCTS: Record<string, Product> = {
  'prod-1': {
    id: 'prod-1',
    product_name: 'Steel Precision Rod 20mm',
    sku: 'STL-ROD-020',
    description: 'Cold rolled high-tensile precision steel bar for heavy mechanical assemblies',
    primary_unit_id: 'uom-pcs',
    is_active: true,
    created_at: '2026-01-05T09:00:00Z',
    updated_at: '2026-01-05T09:00:00Z'
  },
  'prod-2': {
    id: 'prod-2',
    product_name: 'Industrial Brass Bushing',
    sku: 'BRS-BSH-015',
    description: 'Sintered bronze-brass self-lubricating sleeve bearing bush',
    primary_unit_id: 'uom-pcs',
    is_active: true,
    created_at: '2026-01-05T09:15:00Z',
    updated_at: '2026-01-05T09:15:00Z'
  },
  'prod-3': {
    id: 'prod-3',
    product_name: 'High-Tensile Hex Bolt M12',
    sku: 'BLT-M12-075',
    description: 'Grade 8.8 zinc-plated structural hex head bolt 75mm length',
    primary_unit_id: 'uom-pcs',
    is_active: true,
    created_at: '2026-01-05T09:30:00Z',
    updated_at: '2026-01-05T09:30:00Z'
  },
  'prod-4': {
    id: 'prod-4',
    product_name: 'Stainless Steel Fastener Flange',
    sku: 'FLG-SS3-100',
    description: 'SS-316 high pressure weld neck piping connection flange',
    primary_unit_id: 'uom-pcs',
    is_active: true,
    created_at: '2026-01-05T09:45:00Z',
    updated_at: '2026-01-05T09:45:00Z'
  },
  'prod-7': {
    id: 'prod-7',
    product_name: 'Heavy Duty Carbon Steel Plate',
    sku: 'PLT-CS4-010',
    description: 'Hot rolled 10mm IS 2062 Grade E250 boiler plate steel',
    primary_unit_id: 'uom-kg',
    is_active: true,
    created_at: '2026-01-05T10:30:00Z',
    updated_at: '2026-01-05T10:30:00Z'
  },
  'prod-8': {
    id: 'prod-8',
    product_name: 'Hydraulic O-Ring Nitrile 30mm',
    sku: 'ORG-NIT-030',
    description: 'NBR 70 Shore oil and chemical resistant fluid sealing rings',
    primary_unit_id: 'uom-pcs',
    is_active: true,
    created_at: '2026-01-05T10:45:00Z',
    updated_at: '2026-01-05T10:45:00Z'
  },
  'prod-10': {
    id: 'prod-10',
    product_name: 'Ceramic Thermal Insulator',
    sku: 'CRM-THM-050',
    description: 'High alumina refractory electrical insulation standoff spacer',
    primary_unit_id: 'uom-pcs',
    is_active: true,
    created_at: '2026-01-05T11:15:00Z',
    updated_at: '2026-01-05T11:15:00Z'
  }
};

export const SEED_PRODUCT_UNITS: Record<string, ProductUnit> = {
  // PROD-1 Steel Rod: Primary PCS
  'pu-1-1': { id: 'pu-1-1', product_id: 'prod-1', unit_id: 'uom-pcs', conversion_to_primary: 1, is_stock_unit: true, is_billing_unit: true, created_at: '2026-01-05T09:00:00Z', updated_at: '2026-01-05T09:00:00Z' },

  // PROD-2 Brass Bushing: Primary PCS
  'pu-2-1': { id: 'pu-2-1', product_id: 'prod-2', unit_id: 'uom-pcs', conversion_to_primary: 1, is_stock_unit: true, is_billing_unit: true, created_at: '2026-01-05T09:15:00Z', updated_at: '2026-01-05T09:15:00Z' },

  // PROD-3 Hex Bolt: Primary PCS
  'pu-3-1': { id: 'pu-3-1', product_id: 'prod-3', unit_id: 'uom-pcs', conversion_to_primary: 1, is_stock_unit: true, is_billing_unit: true, created_at: '2026-01-05T09:30:00Z', updated_at: '2026-01-05T09:30:00Z' },

  // PROD-4 Flange: Primary PCS
  'pu-4-1': { id: 'pu-4-1', product_id: 'prod-4', unit_id: 'uom-pcs', conversion_to_primary: 1, is_stock_unit: true, is_billing_unit: true, created_at: '2026-01-05T09:45:00Z', updated_at: '2026-01-05T09:45:00Z' },

  // PROD-7 Steel Plate: Primary KG
  'pu-7-1': { id: 'pu-7-1', product_id: 'prod-7', unit_id: 'uom-kg', conversion_to_primary: 1, is_stock_unit: true, is_billing_unit: true, created_at: '2026-01-05T10:30:00Z', updated_at: '2026-01-05T10:30:00Z' },

  // PROD-8 O-Ring: Primary PCS
  'pu-8-1': { id: 'pu-8-1', product_id: 'prod-8', unit_id: 'uom-pcs', conversion_to_primary: 1, is_stock_unit: true, is_billing_unit: true, created_at: '2026-01-05T10:45:00Z', updated_at: '2026-01-05T10:45:00Z' },

  // PROD-10 Ceramic Insulator: Primary PCS
  'pu-10-1': { id: 'pu-10-1', product_id: 'prod-10', unit_id: 'uom-pcs', conversion_to_primary: 1, is_stock_unit: true, is_billing_unit: true, created_at: '2026-01-05T11:15:00Z', updated_at: '2026-01-05T11:15:00Z' }
};

export const SEED_PRODUCT_PRICES: Record<string, ProductPrice> = {
  // PROD-1 price history: Earlier price was ₹100; current effective price is ₹120
  'pp-1-old': { id: 'pp-1-old', product_id: 'prod-1', unit_id: 'uom-pcs', price: 100, effective_from: '2026-01-01T00:00:00Z', effective_to: '2026-01-20T23:59:59Z', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  'pp-1-active': { id: 'pp-1-active', product_id: 'prod-1', unit_id: 'uom-pcs', price: 120, effective_from: '2026-01-21T00:00:00Z', effective_to: null, created_at: '2026-01-21T00:00:00Z', updated_at: '2026-01-21T00:00:00Z' },

  'pp-2': { id: 'pp-2', product_id: 'prod-2', unit_id: 'uom-pcs', price: 45, effective_from: '2026-01-01T00:00:00Z', effective_to: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  'pp-3': { id: 'pp-3', product_id: 'prod-3', unit_id: 'uom-pcs', price: 8.50, effective_from: '2026-01-01T00:00:00Z', effective_to: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  'pp-4': { id: 'pp-4', product_id: 'prod-4', unit_id: 'uom-pcs', price: 350, effective_from: '2026-01-01T00:00:00Z', effective_to: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  'pp-7': { id: 'pp-7', product_id: 'prod-7', unit_id: 'uom-kg', price: 95, effective_from: '2026-01-01T00:00:00Z', effective_to: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  'pp-8': { id: 'pp-8', product_id: 'prod-8', unit_id: 'uom-pcs', price: 15, effective_from: '2026-01-01T00:00:00Z', effective_to: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  'pp-10': { id: 'pp-10', product_id: 'prod-10', unit_id: 'uom-pcs', price: 85, effective_from: '2026-01-01T00:00:00Z', effective_to: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
};

export const SEED_STOCK_RECEIPTS: Record<string, StockReceipt> = {
  'sr-1': {
    id: 'sr-1',
    receipt_number: 'SR-2026-001',
    receipt_date: '2026-01-10T10:00:00Z',
    supplier_name: 'Gujarat Steel & Alloys Corporation',
    reference_number: 'PO-99120',
    notes: 'Primary raw material batch intake for Q1 operations',
    status: 'RECEIVED',
    created_at: '2026-01-10T10:00:00Z',
    updated_at: '2026-01-10T10:00:00Z'
  }
};

export const SEED_STOCK_RECEIPT_ITEMS: Record<string, StockReceiptItem> = {
  'sri-1-1': { id: 'sri-1-1', stock_receipt_id: 'sr-1', product_id: 'prod-1', unit_id: 'uom-pcs', quantity: 1500, unit_cost: 85, total_cost: 127500, created_at: '2026-01-10T10:00:00Z' },
  'sri-1-2': { id: 'sri-1-2', stock_receipt_id: 'sr-1', product_id: 'prod-2', unit_id: 'uom-pcs', quantity: 1000, unit_cost: 32, total_cost: 32000, created_at: '2026-01-10T10:00:00Z' },
  'sri-1-3': { id: 'sri-1-3', stock_receipt_id: 'sr-1', product_id: 'prod-3', unit_id: 'uom-pcs', quantity: 5000, unit_cost: 5.5, total_cost: 27500, created_at: '2026-01-10T10:00:00Z' }
};

export const SEED_INVENTORY_MOVEMENTS: Record<string, InventoryMovement> = {
  // Stock receipts STOCK_IN
  'im-1': { id: 'im-1', product_id: 'prod-1', unit_id: 'uom-pcs', quantity: 1500, movement_type: 'STOCK_IN', movement_date: '2026-01-10T10:00:00Z', reference_type: 'STOCK_RECEIPT', reference_id: 'sr-1', notes: 'Initial receipt of Steel Rod 20mm', created_at: '2026-01-10T10:00:00Z', created_by: 'owner' },
  'im-2': { id: 'im-2', product_id: 'prod-2', unit_id: 'uom-pcs', quantity: 1000, movement_type: 'STOCK_IN', movement_date: '2026-01-10T10:00:00Z', reference_type: 'STOCK_RECEIPT', reference_id: 'sr-1', notes: 'Initial receipt of Brass Bushing', created_at: '2026-01-10T10:00:00Z', created_by: 'owner' },
  'im-3': { id: 'im-3', product_id: 'prod-3', unit_id: 'uom-pcs', quantity: 5000, movement_type: 'STOCK_IN', movement_date: '2026-01-10T10:00:00Z', reference_type: 'STOCK_RECEIPT', reference_id: 'sr-1', notes: 'Initial receipt of Hex Bolt M12', created_at: '2026-01-10T10:00:00Z', created_by: 'owner' },

  // Customer Dispatches & Returns mirrored in Company Stock
  // Dispatch 300 PCS of PROD-1 to Customer 1
  'im-5': { id: 'im-5', product_id: 'prod-1', unit_id: 'uom-pcs', quantity: 300, movement_type: 'CUSTOMER_DISPATCH', movement_date: '2026-01-15T14:00:00Z', reference_type: 'CUSTOMER_DISPATCH', reference_id: 'cim-1', notes: 'Dispatched to ABC Corporate Tower Ltd (Challan #CH-501)', created_at: '2026-01-15T14:00:00Z', created_by: 'owner' },

  // Customer 1 Returns 50 PCS of PROD-1 back to company
  'im-6': { id: 'im-6', product_id: 'prod-1', unit_id: 'uom-pcs', quantity: 50, movement_type: 'CUSTOMER_RETURN', movement_date: '2026-01-18T16:00:00Z', reference_type: 'CUSTOMER_RETURN', reference_id: 'cim-2', notes: 'Customer return from ABC Corporate Tower Ltd (Damage inspection passed)', created_at: '2026-01-18T16:00:00Z', created_by: 'owner' },

  // Dispatch 200 PCS of PROD-1 to Customer 2
  'im-7': { id: 'im-7', product_id: 'prod-1', unit_id: 'uom-pcs', quantity: 200, movement_type: 'CUSTOMER_DISPATCH', movement_date: '2026-01-19T11:00:00Z', reference_type: 'CUSTOMER_DISPATCH', reference_id: 'cim-3', notes: 'Dispatched to Apex Manufacturing Infra (Challan #CH-502)', created_at: '2026-01-19T11:00:00Z', created_by: 'owner' },

  // Dispatch 500 PCS of PROD-3 to Customer 3
  'im-8': { id: 'im-8', product_id: 'prod-3', unit_id: 'uom-pcs', quantity: 500, movement_type: 'CUSTOMER_DISPATCH', movement_date: '2026-01-20T10:30:00Z', reference_type: 'CUSTOMER_DISPATCH', reference_id: 'cim-4', notes: 'Dispatched to Precision Dynamics Corporation (Challan #CH-503)', created_at: '2026-01-20T10:30:00Z', created_by: 'owner' }
};

export const SEED_CUSTOMER_INVENTORY_MOVEMENTS: Record<string, CustomerInventoryMovement> = {
  'cim-1': {
    id: 'cim-1',
    customer_id: 'cust-1',
    product_id: 'prod-1',
    unit_id: 'uom-pcs',
    quantity: 300,
    movement_type: 'DISPATCH',
    movement_date: '2026-01-15T14:00:00Z',
    reference_type: 'DISPATCH',
    document_id: null,
    reference_id: 'CH-501',
    created_at: '2026-01-15T14:00:00Z',
    created_by: 'owner'
  },
  'cim-2': {
    id: 'cim-2',
    customer_id: 'cust-1',
    product_id: 'prod-1',
    unit_id: 'uom-pcs',
    quantity: 50,
    movement_type: 'RETURN',
    movement_date: '2026-01-18T16:00:00Z',
    reference_type: 'RETURN',
    document_id: null,
    reference_id: 'RET-019',
    created_at: '2026-01-18T16:00:00Z',
    created_by: 'owner'
  },
  'cim-3': {
    id: 'cim-3',
    customer_id: 'cust-2',
    product_id: 'prod-1',
    unit_id: 'uom-pcs',
    quantity: 200,
    movement_type: 'DISPATCH',
    movement_date: '2026-01-19T11:00:00Z',
    reference_type: 'DISPATCH',
    document_id: null,
    reference_id: 'CH-502',
    created_at: '2026-01-19T11:00:00Z',
    created_by: 'owner'
  },
  'cim-4': {
    id: 'cim-4',
    customer_id: 'cust-3',
    product_id: 'prod-3',
    unit_id: 'uom-pcs',
    quantity: 500,
    movement_type: 'DISPATCH',
    movement_date: '2026-01-20T10:30:00Z',
    reference_type: 'DISPATCH',
    document_id: null,
    reference_id: 'CH-503',
    created_at: '2026-01-20T10:30:00Z',
    created_by: 'owner'
  }
};

export const SEED_INVOICES: Record<string, Invoice> = {
  'inv-1001': {
    id: 'inv-1001',
    fy: '2025-26',
    invoice_number: 'ABC-2026-1001',
    customer_id: 'cust-1',
    invoice_date: '2026-01-22T10:00:00Z',
    billing_period_start: '2026-01-01',
    billing_period_end: '2026-01-21',
    status: 'FINALIZED',
    subtotal: 10000,
    discount: 0,
    taxable_amount: 10000,
    cgst: 900,
    sgst: 900,
    igst: 0,
    other_charges: 0,
    grand_total: 11800,
    customer_snapshot: {
      customer_name: 'ABC Corporate Tower Ltd',
      pan: 'AABCA1234C',
      gst_number: '24AABCA1234C1Z5',
      email: 'procurement@abctower.com',
      mobile: '+91 98980 11223',
      address: 'Plot 12, GIDC Electronic Estate',
      city: 'Surat',
      state: 'Gujarat',
      country: 'India',
      postal_code: '395007',
      state_code: '24'
    },
    business_snapshot: {
      business_name: 'ABC Industries Pvt Ltd',
      legal_name: 'ABC Industries Private Limited',
      gst_number: '24AAACA9999P1Z1',
      pan: 'AAACA9999P',
      address: '401-405, Apex Business Hub, Ring Road',
      city: 'Surat',
      state: 'Gujarat',
      country: 'India',
      postal_code: '395002',
      phone: '+91 98250 12345',
      email: 'accounts@abcindustries.com',
      website: 'https://abcindustries.example.com',
      state_code: '24'
    },
    bank_snapshot: {
      bank_name: 'HDFC Bank Ltd',
      bank_account_number: '50200012345678',
      ifsc: 'HDFC0001234',
      branch: 'Surat Ring Road Commercial Branch'
    },
    notes: 'Billing for 100 PCS Steel Precision Rod 20mm against Dispatch #CH-501',
    created_at: '2026-01-22T10:00:00Z',
    updated_at: '2026-01-22T10:15:00Z'
  },
  'inv-1002': {
    id: 'inv-1002',
    fy: '2025-26',
    invoice_number: 'ABC-2026-1002',
    customer_id: 'cust-2',
    invoice_date: '2026-01-23T11:30:00Z',
    billing_period_start: '2026-01-01',
    billing_period_end: '2026-01-22',
    status: 'FINALIZED',
    subtotal: 15000,
    discount: 0,
    taxable_amount: 15000,
    cgst: 1350,
    sgst: 1350,
    igst: 0,
    other_charges: 0,
    grand_total: 17700,
    customer_snapshot: {
      customer_name: 'Apex Manufacturing Infra',
      pan: 'AACCA2345D',
      gst_number: '24AACCA2345D1Z6',
      email: 'billing@apexinfra.in',
      mobile: '+91 98241 55667',
      address: 'Sanand Industrial Park, Phase II',
      city: 'Ahmedabad',
      state: 'Gujarat',
      country: 'India',
      postal_code: '382170',
      state_code: '24'
    },
    business_snapshot: {
      business_name: 'ABC Industries Pvt Ltd',
      legal_name: 'ABC Industries Private Limited',
      gst_number: '24AAACA9999P1Z1',
      pan: 'AAACA9999P',
      address: '401-405, Apex Business Hub, Ring Road',
      city: 'Surat',
      state: 'Gujarat',
      country: 'India',
      postal_code: '395002',
      phone: '+91 98250 12345',
      email: 'accounts@abcindustries.com',
      website: 'https://abcindustries.example.com',
      state_code: '24'
    },
    bank_snapshot: {
      bank_name: 'HDFC Bank Ltd',
      bank_account_number: '50200012345678',
      ifsc: 'HDFC0001234',
      branch: 'Surat Ring Road Commercial Branch'
    },
    notes: 'Billing for 150 PCS Steel Rod against Dispatch #CH-502',
    created_at: '2026-01-23T11:30:00Z',
    updated_at: '2026-01-23T11:45:00Z'
  },
  'inv-1003': {
    id: 'inv-1003',
    fy: '2025-26',
    invoice_number: 'ABC-2026-1003',
    customer_id: 'cust-3',
    invoice_date: '2026-01-24T14:00:00Z',
    billing_period_start: '2026-01-01',
    billing_period_end: '2026-01-23',
    status: 'DRAFT',
    subtotal: 4250,
    discount: 0,
    taxable_amount: 4250,
    cgst: 0,
    sgst: 0,
    igst: 765, // Inter-state 18% IGST
    other_charges: 150,
    grand_total: 5165,
    customer_snapshot: {
      customer_name: 'Precision Dynamics Corporation',
      pan: 'AABCP3456E',
      gst_number: '27AABCP3456E1Z7',
      email: 'supplies@precisiondynamics.co.in',
      mobile: '+91 99201 88990',
      address: 'Andheri-Kurla Road, MIDC Industrial Zone',
      city: 'Mumbai',
      state: 'Maharashtra',
      country: 'India',
      postal_code: '400093',
      state_code: '27'
    },
    business_snapshot: {
      business_name: 'ABC Industries Pvt Ltd',
      legal_name: 'ABC Industries Private Limited',
      gst_number: '24AAACA9999P1Z1',
      pan: 'AAACA9999P',
      address: '401-405, Apex Business Hub, Ring Road',
      city: 'Surat',
      state: 'Gujarat',
      country: 'India',
      postal_code: '395002',
      phone: '+91 98250 12345',
      email: 'accounts@abcindustries.com',
      website: 'https://abcindustries.example.com',
      state_code: '24'
    },
    bank_snapshot: {
      bank_name: 'HDFC Bank Ltd',
      bank_account_number: '50200012345678',
      ifsc: 'HDFC0001234',
      branch: 'Surat Ring Road Commercial Branch'
    },
    notes: 'Draft interstate invoice with freight surcharge',
    created_at: '2026-01-24T14:00:00Z',
    updated_at: '2026-01-24T14:00:00Z'
  }
};

export const SEED_INVOICE_ITEMS: Record<string, InvoiceItem> = {
  'ii-1': {
    id: 'ii-1',
    invoice_id: 'inv-1001',
    product_id: 'prod-1',
    product_name_snapshot: 'Steel Precision Rod 20mm',
    sku_snapshot: 'STL-ROD-020',
    unit_id: 'uom-pcs',
    uom_snapshot: 'PCS',
    quantity: 100,
    unit_price: 100, // Historical price snapshot
    discount: 0,
    taxable_amount: 10000,
    gst_rate: 18,
    cgst: 900,
    sgst: 900,
    igst: 0,
    extra_charges: 0,
    line_total: 11800,
    created_at: '2026-01-22T10:00:00Z'
  },
  'ii-2': {
    id: 'ii-2',
    invoice_id: 'inv-1002',
    product_id: 'prod-1',
    product_name_snapshot: 'Steel Precision Rod 20mm',
    sku_snapshot: 'STL-ROD-020',
    unit_id: 'uom-pcs',
    uom_snapshot: 'PCS',
    quantity: 150,
    unit_price: 100,
    discount: 0,
    taxable_amount: 15000,
    gst_rate: 18,
    cgst: 1350,
    sgst: 1350,
    igst: 0,
    extra_charges: 0,
    line_total: 17700,
    created_at: '2026-01-23T11:30:00Z'
  },
  'ii-3': {
    id: 'ii-3',
    invoice_id: 'inv-1003',
    product_id: 'prod-3',
    product_name_snapshot: 'High-Tensile Hex Bolt M12',
    sku_snapshot: 'BLT-M12-075',
    unit_id: 'uom-pcs',
    uom_snapshot: 'PCS',
    quantity: 500,
    unit_price: 8.50,
    discount: 0,
    taxable_amount: 4250,
    gst_rate: 18,
    cgst: 0,
    sgst: 0,
    igst: 765,
    extra_charges: 0,
    line_total: 5015,
    created_at: '2026-01-24T14:00:00Z'
  }
};

/**
 * CRITICAL SEED:
 * Explicit invoice allocations from customer inventory movements!
 */
export const SEED_INVOICE_ALLOCATIONS: Record<string, InvoiceCustomerInventoryAllocation> = {
  // INV-1001 allocated 100 PCS from Movement #cim-1 (Customer 1 Dispatch #CH-501 of 300 PCS)
  'ia-1': {
    id: 'ia-1',
    invoice_id: 'inv-1001',
    customer_inventory_movement_id: 'cim-1',
    allocated_quantity: 100,
    created_at: '2026-01-22T10:00:00Z'
  },
  // INV-1002 allocated 150 PCS from Movement #cim-3 (Customer 2 Dispatch #CH-502 of 200 PCS)
  'ia-2': {
    id: 'ia-2',
    invoice_id: 'inv-1002',
    customer_inventory_movement_id: 'cim-3',
    allocated_quantity: 150,
    created_at: '2026-01-23T11:30:00Z'
  }
};

export const SEED_INVOICE_PAYMENTS: Record<string, InvoicePayment> = {
  // Partial payment against INV-1001 (Grand Total: 11,800. Paid: 10,000. Outstanding: 1,800)
  'pay-1': {
    id: 'pay-1',
    invoice_id: 'inv-1001',
    payment_date: '2026-01-25T14:20:00Z',
    amount: 10000,
    payment_method: 'UPI',
    reference_number: 'UPI/260125/998811',
    notes: 'Part advance payment through HDFC merchant QR',
    status: 'ACTIVE',
    created_at: '2026-01-25T14:20:00Z',
    updated_at: '2026-01-25T14:20:00Z'
  },
  // Full payment against INV-1002 (Grand Total: 17,700. Paid: 17,700. Outstanding: 0)
  'pay-2': {
    id: 'pay-2',
    invoice_id: 'inv-1002',
    payment_date: '2026-01-26T16:00:00Z',
    amount: 17700,
    payment_method: 'BANK_TRANSFER',
    reference_number: 'NEFT-SBIN2601264421',
    notes: 'Full payment cleared via RTGS/NEFT settlement',
    status: 'ACTIVE',
    created_at: '2026-01-26T16:00:00Z',
    updated_at: '2026-01-26T16:00:00Z'
  }
};

export const SEED_AUDIT_LOGS: AuditLog[] = [
  {
    id: 'aud-1',
    user_id: 'owner',
    user_name: 'Owner',
    action: 'SETTINGS_INITIALIZED',
    entity_type: 'BUSINESS_SETTINGS',
    entity_id: 'biz-1',
    new_data: { business_name: 'ABC Industries Pvt Ltd', gst: '24AAACA9999P1Z1' },
    created_at: '2026-01-01T08:00:00Z'
  },
  {
    id: 'aud-2',
    user_id: 'owner',
    user_name: 'Owner',
    action: 'STOCK_RECEIVED',
    entity_type: 'STOCK_RECEIPT',
    entity_id: 'sr-1',
    new_data: { receipt_number: 'SR-2026-001', supplier: 'Gujarat Steel & Alloys Corporation' },
    created_at: '2026-01-10T10:00:00Z'
  },
  {
    id: 'aud-3',
    user_id: 'owner',
    user_name: 'Owner',
    action: 'CUSTOMER_DISPATCH',
    entity_type: 'CUSTOMER_INVENTORY_MOVEMENT',
    entity_id: 'cim-1',
    new_data: { customer: 'ABC Corporate Tower Ltd', product: 'Steel Precision Rod 20mm', quantity: 300 },
    created_at: '2026-01-15T14:00:00Z'
  },
  {
    id: 'aud-4',
    user_id: 'owner',
    user_name: 'Owner',
    action: 'CUSTOMER_RETURN',
    entity_type: 'CUSTOMER_INVENTORY_MOVEMENT',
    entity_id: 'cim-2',
    new_data: { customer: 'ABC Corporate Tower Ltd', product: 'Steel Precision Rod 20mm', quantity: 50 },
    created_at: '2026-01-18T16:00:00Z'
  },
  {
    id: 'aud-5',
    user_id: 'owner',
    user_name: 'Owner',
    action: 'INVOICE_FINALIZED',
    entity_type: 'INVOICE',
    entity_id: 'inv-1001',
    new_data: { invoice_number: 'ABC-2026-1001', grand_total: 11800, allocated_qty: 100 },
    created_at: '2026-01-22T10:15:00Z'
  },
  {
    id: 'aud-6',
    user_id: 'owner',
    user_name: 'Owner',
    action: 'PAYMENT_RECORDED',
    entity_type: 'INVOICE_PAYMENT',
    entity_id: 'pay-1',
    new_data: { invoice_id: 'inv-1001', amount: 10000, method: 'UPI' },
    created_at: '2026-01-25T14:20:00Z'
  }
];
