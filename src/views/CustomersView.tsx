import React, { useState } from 'react';
import { useAccountingStore } from '../store/accountingStore';
import { Customer } from '../types/database';
import { formatINR, getCustomerStateCode } from '../utils/calculations';
import {
  Plus,
  Search,
  Edit2
} from 'lucide-react';
import { Modal } from '../components/common/Modal';
import { Badge } from '../components/common/Badge';
import { Button, PageHeader, SearchInput, TableShell, Table, THead, TBody, TR, TH, TD, Tabs, Alert, Input, Label, Textarea } from '../components/ui';
import { customerMatchesQuery } from '../components/common/CustomerPicker';

interface CustomersViewProps {
  onSelectCustomerForBilling?: (customerId: string) => void;
  onOpenInvoice?: (invoiceId: string) => void;
}

export const CustomersView: React.FC<CustomersViewProps> = ({
  onSelectCustomerForBilling,
  onOpenInvoice
}) => {
  const {
    customers,
    createCustomer,
    updateCustomer,
    suggestNextCustomerNumber,
    getCustomerOutstanding,
    getCustomerInventorySummary,
    invoices,
    invoicePayments,
    getCustomerLedger,
    auditLogs
  } = useAccountingStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<'overview' | 'inventory' | 'invoices' | 'payments' | 'ledger' | 'activity'>('overview');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [formError, setFormError] = useState('');

  // Form states
  const [formData, setFormData] = useState({
    customer_name: '',
    customer_number: '',
    pan: '',
    gst_number: '',
    mobile: '',
    address: '',
    city: 'Surat',
    state: 'Gujarat',
    country: 'India',
    postal_code: '',
    credit_limit: 500000,
    bank_name: '',
    bank_account: '',
    ifsc: ''
  });

  const allCustomers = Object.values(customers);
  const filteredCustomers = allCustomers.filter((c) => customerMatchesQuery(c, searchQuery));

  const selectedCustomer = selectedCustomerId ? customers[selectedCustomerId] : null;

  const handleOpenCreate = () => {
    setFormData({
      customer_name: '',
      customer_number: suggestNextCustomerNumber(),
      pan: '',
      gst_number: '',
      mobile: '',
      address: '',
      city: 'Surat',
      state: 'Gujarat',
      country: 'India',
      postal_code: '',
      credit_limit: 500000,
      bank_name: '',
      bank_account: '',
      ifsc: ''
    });
    setFormError('');
    setIsCreateModalOpen(true);
  };

  const handleOpenEdit = (c: Customer) => {
    setFormData({
      customer_name: c.customer_name,
      customer_number: c.customer_number || '',
      pan: c.pan,
      gst_number: c.gst_number,
      mobile: c.mobile,
      address: c.address,
      city: c.city,
      state: c.state,
      country: c.country,
      postal_code: c.postal_code,
      credit_limit: c.credit_limit || 500000,
      bank_name: c.bank_details?.bank_name || '',
      bank_account: c.bank_details?.account_number || '',
      ifsc: c.bank_details?.ifsc || ''
    });
    setFormError('');
    setIsEditModalOpen(true);
  };

  const handleSaveCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!formData.customer_name.trim()) return;
    // Empty number → store auto-assigns the next free plain number.

    const result = createCustomer({
      customer_name: formData.customer_name.trim(),
      customer_number: formData.customer_number.trim().toUpperCase(),
      pan: formData.pan.trim().toUpperCase(),
      gst_number: formData.gst_number.trim().toUpperCase(),
      mobile: formData.mobile.trim(),
      address: formData.address.trim(),
      city: formData.city.trim(),
      state: formData.state.trim(),
      country: formData.country.trim(),
      postal_code: formData.postal_code.trim(),
      credit_limit: Number(formData.credit_limit) || 0,
      bank_details: {
        bank_name: formData.bank_name,
        account_number: formData.bank_account,
        ifsc: formData.ifsc
      },
      is_active: true
    });
    if (!result.success) {
      setFormError(result.error || 'Customer could not be created.');
      return;
    }

    setIsCreateModalOpen(false);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!selectedCustomerId || !formData.customer_name.trim()) return;
    if (!formData.customer_number.trim()) {
      setFormError('Customer number is required.');
      return;
    }

    const result = updateCustomer(selectedCustomerId, {
      customer_name: formData.customer_name.trim(),
      customer_number: formData.customer_number.trim().toUpperCase(),
      pan: formData.pan.trim().toUpperCase(),
      gst_number: formData.gst_number.trim().toUpperCase(),
      mobile: formData.mobile.trim(),
      address: formData.address.trim(),
      city: formData.city.trim(),
      state: formData.state.trim(),
      country: formData.country.trim(),
      postal_code: formData.postal_code.trim(),
      credit_limit: Number(formData.credit_limit) || 0,
      bank_details: {
        bank_name: formData.bank_name,
        account_number: formData.bank_account,
        ifsc: formData.ifsc
      }
    });
    if (!result.success) {
      setFormError(result.error || 'Customer could not be updated.');
      return;
    }

    setIsEditModalOpen(false);
  };

  // Queries for selected customer
  const customerSummary = selectedCustomerId ? getCustomerInventorySummary(selectedCustomerId) : [];
  const customerInvoices = selectedCustomerId
    ? Object.values(invoices).filter((i) => i.customer_id === selectedCustomerId)
    : [];
  const customerPayments = selectedCustomerId
    ? Object.values(invoicePayments).filter((p) => {
        const inv = invoices[p.invoice_id];
        return inv && inv.customer_id === selectedCustomerId;
      })
    : [];
  const customerLedger = selectedCustomerId ? getCustomerLedger(selectedCustomerId) : [];
  const customerAudit = selectedCustomerId
    ? auditLogs.filter((a) => a.entity_id === selectedCustomerId || (a.metadata && (a.metadata as any).customerId === selectedCustomerId))
    : [];

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <PageHeader
        title="Customer Directory"
        subtitle="Normalized entity ledger • Tax identification and consignment reconciliation"
        actions={
          <>
            <SearchInput
              icon={<Search className="w-4 h-4" />}
              type="text"
              placeholder="Search number, name or GSTIN..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <Button variant="primary" size="md" onClick={handleOpenCreate}>
              <Plus className="w-3.5 h-3.5" />
              <span>Add Customer</span>
            </Button>
          </>
        }
      />

      {/* Main Customers Table */}
      <TableShell>
        <div className="overflow-x-auto">
          <Table className="text-left border-collapse">
            <caption className="sr-only">Customers register</caption>
            <THead>
              <TR className="hover:bg-transparent">
                <TH scope="col">Customer Entity</TH>
                <TH scope="col">Customer No.</TH>
                <TH scope="col">State / Code</TH>
                <TH scope="col">GSTIN / PAN</TH>
                <TH scope="col">Contact</TH>
                <TH scope="col" className="text-right">Outstanding Receivables</TH>
                <TH scope="col" className="text-center">Status</TH>
                <TH scope="col" className="text-right px-4">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {filteredCustomers.length === 0 ? (
                <tr>
                  <TD colSpan={8} className="py-8 text-center text-muted-foreground text-xs">
                    No customers match your search query.
                  </TD>
                </tr>
              ) : (
                filteredCustomers.map((cust) => {
                  const outstanding = getCustomerOutstanding(cust.id);
                  return (
                    <TR
                      key={cust.id}
                      className="group cursor-pointer"
                      onClick={() => {
                        setSelectedCustomerId(cust.id);
                        setDetailTab('overview');
                      }}
                    >
                      <TD>
                        <div className="font-semibold group-hover:text-foreground">
                          {cust.customer_name}
                        </div>
                        <div className="text-[11px] text-muted-foreground font-mono">
                          <span className="font-bold text-foreground">{cust.customer_number || '—'}</span>
                          {' '}• ID: #{cust.id}
                        </div>
                      </TD>

                      <TD>
                        <span className="font-mono text-xs font-bold text-foreground bg-muted border border-input px-2 py-0.5 rounded-md">
                          {cust.customer_number || '—'}
                        </span>
                      </TD>

                      <TD>
                        <span className="font-mono text-foreground">{cust.city}, {cust.state}</span>
                      </TD>

                      <TD className="font-mono text-[11px]">
                        <div className="text-foreground font-semibold">{cust.gst_number || 'Unregistered'}</div>
                        <div className="text-muted-foreground">{cust.pan}</div>
                      </TD>

                      <TD className="text-[11px] text-muted-foreground">
                        <div>{cust.mobile}</div>
                      </TD>

                      <TD className="text-right font-mono">
                        <span
                          className={`font-bold ${
                            outstanding > 0 ? 'text-amber-800 dark:text-amber-300' : 'text-emerald-800 dark:text-emerald-300'
                          }`}
                        >
                          {formatINR(outstanding)}
                        </span>
                      </TD>

                      <TD className="text-center">
                        <Badge variant={cust.is_active ? 'success' : 'neutral'}>
                          {cust.is_active ? 'ACTIVE' : 'INACTIVE'}
                        </Badge>
                      </TD>

                      <TD className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          {onSelectCustomerForBilling && (
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => onSelectCustomerForBilling(cust.id)}
                              title="Open billing wizard for this customer"
                              className="text-[11px] px-2 py-1"
                            >
                              Bill
                            </Button>
                          )}
                          <Button
                            variant="secondary"
                            size="icon"
                            onClick={() => handleOpenEdit(cust)}
                            title="Edit details"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TD>
                    </TR>
                  );
                })
              )}
            </TBody>
          </Table>
        </div>
      </TableShell>

      {/* Customer 360 Detail Drawer / Modal */}
      {selectedCustomer && (
        <Modal
          isOpen={Boolean(selectedCustomerId)}
          onClose={() => setSelectedCustomerId(null)}
          title={selectedCustomer.customer_name}
          subtitle={`No: ${selectedCustomer.customer_number || '—'} • GSTIN: ${selectedCustomer.gst_number || 'N/A'} • ${selectedCustomer.state}`}
          maxWidth="4xl"
          footer={
            <div className="flex justify-between w-full items-center">
              <div className="font-mono text-xs text-muted-foreground">
                Outstanding Balance:{' '}
                <span className="font-bold text-foreground">
                  {formatINR(getCustomerOutstanding(selectedCustomer.id))}
                </span>
              </div>
              <div className="flex gap-2">
                {onSelectCustomerForBilling && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      onSelectCustomerForBilling(selectedCustomer.id);
                      setSelectedCustomerId(null);
                    }}
                  >
                    Open Billing Wizard
                  </Button>
                )}
                <Button variant="secondary" size="sm" onClick={() => setSelectedCustomerId(null)}>
                  Close
                </Button>
              </div>
            </div>
          }
        >
          <div className="space-y-4">
            {/* Tabs */}
            <Tabs
              ariaLabel="Customer detail views"
              activeId={detailTab}
              onSelect={(id) => setDetailTab(id as 'overview' | 'inventory' | 'invoices' | 'payments' | 'ledger' | 'activity')}
              tabs={[
                { id: 'overview', label: 'Entity Profile' },
                { id: 'inventory', label: `Inventory Consignments (${customerSummary.length})` },
                { id: 'invoices', label: `Invoices (${customerInvoices.length})` },
                { id: 'payments', label: `Collections (${customerPayments.length})` },
                { id: 'ledger', label: 'Financial Ledger' },
                { id: 'activity', label: 'Audit History' },
              ]}
            />

            {/* Tab: Overview */}
            {detailTab === 'overview' && (
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="p-3.5 bg-muted border border-border rounded space-y-2">
                  <div className="font-semibold text-foreground uppercase tracking-wide text-[11px]">
                    Tax &amp; Identity Details
                  </div>
                  <div className="space-y-1 font-mono">
                    <div>
                      <span className="text-muted-foreground">GSTIN:</span>{' '}
                      <span className="font-bold text-foreground">{selectedCustomer.gst_number || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">PAN:</span>{' '}
                      <span className="font-semibold text-foreground">{selectedCustomer.pan}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">State:</span>{' '}
                      <span>{selectedCustomer.state} (Code: {getCustomerStateCode(selectedCustomer)})</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Credit Limit:</span>{' '}
                      <span>{formatINR(selectedCustomer.credit_limit || 0)}</span>
                    </div>
                  </div>
                </div>

                <div className="p-3.5 bg-muted border border-border rounded space-y-2">
                  <div className="font-semibold text-foreground uppercase tracking-wide text-[11px]">
                    Billing Address &amp; Contact
                  </div>
                  <div className="text-foreground space-y-1">
                    <div>{selectedCustomer.address}</div>
                    <div>
                      {selectedCustomer.city}, {selectedCustomer.state} - {selectedCustomer.postal_code}
                    </div>
                    <div className="font-mono pt-1 text-[11px]">
                      <div>Phone: {selectedCustomer.mobile}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab: Inventory Consignments */}
            {detailTab === 'inventory' && (
              <div className="space-y-3">
                <div className="text-xs text-muted-foreground">
                  Physical stock held by customer vs. unbilled quantity. Billed quantity is derived from explicit invoice allocations.
                </div>
                <div className="border border-border rounded overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                  <caption className="sr-only">Customer inventory consignments</caption>
                  <thead>
                      <tr className="bg-muted font-mono text-[11px] text-muted-foreground border-b border-border">
                        <th scope="col" className="py-2.5 px-3">Product</th>
                        <th scope="col" className="py-2.5 px-2 text-right">Received</th>
                        <th scope="col" className="py-2.5 px-2 text-right">Returned</th>
                        <th scope="col" className="py-2.5 px-2 text-right">Current Held</th>
                        <th scope="col" className="py-2.5 px-2 text-right">Billed Qty</th>
                        <th scope="col" className="py-2.5 px-3 text-right">Unbilled Qty</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border font-mono">
                      {customerSummary.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-6 text-center text-muted-foreground">
                            No inventory movements recorded for this customer.
                          </td>
                        </tr>
                      ) : (
                        customerSummary.map((item) => (
                          <tr key={item.productId} className="hover:bg-muted">
                            <td className="py-2 px-3 font-sans font-semibold text-foreground">
                              {item.productName}
                              <div className="text-[10px] font-mono text-muted-foreground">{item.sku}</div>
                            </td>
                            <td className="py-2 px-2 text-right text-foreground">{item.totalReceived} {item.unitCode}</td>
                            <td className="py-2 px-2 text-right text-foreground">{item.totalReturned} {item.unitCode}</td>
                            <td className="py-2 px-2 text-right font-bold text-foreground">
                              {item.currentBalance} {item.unitCode}
                            </td>
                            <td className="py-2 px-2 text-right text-emerald-800 dark:text-emerald-300">{item.billedQuantity} {item.unitCode}</td>
                            <td className="py-2 px-3 text-right font-bold text-amber-800 dark:text-amber-300">
                              {item.unbilledQuantity} {item.unitCode}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Tab: Invoices */}
            {detailTab === 'invoices' && (
              <div className="space-y-2">
                {customerInvoices.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground text-xs">No invoices created yet.</div>
                ) : (
                  <div className="border border-border rounded divide-y divide-border text-xs">
                    {customerInvoices.map((inv) => (
                      <div
                        key={inv.id}
                        className="p-3 flex items-center justify-between hover:bg-muted cursor-pointer"
                        onClick={() => {
                          if (onOpenInvoice) {
                            onOpenInvoice(inv.id);
                            setSelectedCustomerId(null);
                          }
                        }}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-foreground">{inv.invoice_number}</span>
                            <Badge
                              variant={
                                inv.status === 'FINALIZED'
                                  ? 'success'
                                  : inv.status === 'DRAFT'
                                  ? 'warning'
                                  : 'danger'
                              }
                            >
                              {inv.status}
                            </Badge>
                          </div>
                          <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                            Period: {inv.billing_period_start} to {inv.billing_period_end}
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="font-mono font-bold text-foreground">{formatINR(inv.grand_total)}</div>
                          <div className="text-[11px] text-muted-foreground font-mono">
                            {new Date(inv.invoice_date).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tab: Payments */}
            {detailTab === 'payments' && (
              <div className="space-y-2">
                {customerPayments.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground text-xs">No payments recorded yet.</div>
                ) : (
                  <div className="border border-border rounded divide-y divide-border text-xs">
                    {customerPayments.map((p) => (
                      <div key={p.id} className="p-3 flex items-center justify-between">
                        <div>
                          <div className="font-mono font-semibold text-emerald-800 dark:text-emerald-300">{formatINR(p.amount)}</div>
                          <div className="text-[11px] text-muted-foreground font-mono">
                            Method: {p.payment_method} • Ref: {p.reference_number || 'N/A'}
                          </div>
                        </div>
                        <div className="text-right font-mono text-[11px] text-muted-foreground">
                          {new Date(p.payment_date).toLocaleDateString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tab: Ledger */}
            {detailTab === 'ledger' && (
              <div className="border border-border rounded overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <caption className="sr-only">Customer ledger transactions</caption>
                  <thead>
                    <tr className="bg-muted font-mono text-[11px] text-muted-foreground border-b border-border">
                      <th scope="col" className="py-2.5 px-3">Date</th>
                      <th scope="col" className="py-2.5 px-3">Ref</th>
                      <th scope="col" className="py-2.5 px-3">Description</th>
                      <th scope="col" className="py-2.5 px-2 text-right">Debit (+)</th>
                      <th scope="col" className="py-2.5 px-2 text-right">Credit (-)</th>
                      <th scope="col" className="py-2.5 px-3 text-right">Running Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border font-mono text-[11px]">
                    {customerLedger.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-muted-foreground">
                          No financial ledger entries.
                        </td>
                      </tr>
                    ) : (
                      customerLedger.map((row, idx) => (
                        <tr key={idx} className="hover:bg-muted">
                          <td className="py-2 px-3 text-muted-foreground">
                            {new Date(row.date).toLocaleDateString()}
                          </td>
                          <td className="py-2 px-3 font-semibold text-foreground">{row.referenceNumber}</td>
                          <td className="py-2 px-3 font-sans text-muted-foreground">{row.description}</td>
                          <td className="py-2 px-2 text-right text-foreground">
                            {row.debit > 0 ? formatINR(row.debit) : '-'}
                          </td>
                          <td className="py-2 px-2 text-right text-emerald-800 dark:text-emerald-300">
                            {row.credit > 0 ? formatINR(row.credit) : '-'}
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-foreground">
                            {formatINR(row.balance)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Tab: Activity */}
            {detailTab === 'activity' && (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {customerAudit.length === 0 ? (
                  <div className="py-6 text-center text-muted-foreground text-xs">No audit logs for this customer.</div>
                ) : (
                  customerAudit.map((log) => (
                    <div key={log.id} className="p-2.5 bg-muted border border-border rounded text-xs">
                      <div className="flex justify-between font-mono text-[11px]">
                        <span className="font-semibold text-foreground">{log.action}</span>
                        <span className="text-muted-foreground">{new Date(log.created_at).toLocaleString()}</span>
                      </div>
                      <div className="text-muted-foreground text-[11px] mt-0.5">By {log.user_name}</div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Create Customer Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Add New Customer"
        subtitle="Creates a normalized customer entity in database"
        maxWidth="2xl"
      >
        <form onSubmit={handleSaveCreate} className="space-y-4 text-xs">
          {formError && (
            <Alert tone="destructive">{formError}</Alert>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="mb-1">Customer Number *</Label>
              <Input
                type="text"
                required
                value={formData.customer_number}
                onChange={(e) => setFormData({ ...formData, customer_number: e.target.value.toUpperCase() })}
                className="w-full font-mono uppercase"
                placeholder="Auto-assigned in sequence"
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">Auto-filled with the next free number — editable, must stay unique.</p>
            </div>

            <div>
              <Label className="mb-1">Mobile / Phone</Label>
              <Input
                type="text"
                value={formData.mobile}
                onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                className="w-full font-mono"
                placeholder="+91 98250 00000"
              />
            </div>

            <div className="col-span-2">
              <Label className="mb-1">Customer / Legal Name *</Label>
              <Input
                type="text"
                required
                value={formData.customer_name}
                onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                className="w-full focus:ring-1 focus:ring-ring focus:outline-none"
                placeholder="e.g. Acme Infra Corporation Pvt Ltd"
              />
            </div>

            <div>
              <Label className="mb-1">GSTIN Number</Label>
              <Input
                type="text"
                value={formData.gst_number}
                onChange={(e) => setFormData({ ...formData, gst_number: e.target.value })}
                className="w-full uppercase font-mono"
                placeholder="e.g. 24AAACA1234A1Z5"
              />
            </div>

            <div>
              <Label className="mb-1">PAN Number</Label>
              <Input
                type="text"
                value={formData.pan}
                onChange={(e) => setFormData({ ...formData, pan: e.target.value })}
                className="w-full uppercase font-mono"
                placeholder="e.g. AAACA1234A"
              />
            </div>

            <div className="col-span-2">
              <Label className="mb-1">Street Address</Label>
              <Textarea
                rows={3}
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full"
                placeholder="Plot 45, GIDC Industrial Estate"
              />
            </div>

            <div>
              <Label className="mb-1">City</Label>
              <Input
                type="text"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className="w-full"
                placeholder="Surat"
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">Defaults to Surat — editable.</p>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button type="button" variant="secondary" size="sm" onClick={() => setIsCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm">
              Create Customer
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Customer Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Customer"
        subtitle="Updates master customer record"
        maxWidth="2xl"
      >
        <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
          {formError && (
            <Alert tone="destructive">{formError}</Alert>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="mb-1">Customer Number *</Label>
              <Input
                type="text"
                required
                value={formData.customer_number}
                onChange={(e) => setFormData({ ...formData, customer_number: e.target.value.toUpperCase() })}
                className="w-full font-mono uppercase"
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">Unique code — search by it in billing, ledger &amp; dispatches.</p>
            </div>

            <div>
              <Label className="mb-1">Mobile / Phone</Label>
              <Input
                type="text"
                value={formData.mobile}
                onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                className="w-full font-mono"
              />
            </div>

            <div className="col-span-2">
              <Label className="mb-1">Customer / Legal Name *</Label>
              <Input
                type="text"
                required
                value={formData.customer_name}
                onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                className="w-full"
              />
            </div>

            <div>
              <Label className="mb-1">GSTIN Number</Label>
              <Input
                type="text"
                value={formData.gst_number}
                onChange={(e) => setFormData({ ...formData, gst_number: e.target.value })}
                className="w-full uppercase font-mono"
              />
            </div>

            <div>
              <Label className="mb-1">PAN Number</Label>
              <Input
                type="text"
                value={formData.pan}
                onChange={(e) => setFormData({ ...formData, pan: e.target.value })}
                className="w-full uppercase font-mono"
              />
            </div>

            <div className="col-span-2">
              <Label className="mb-1">Street Address</Label>
              <Textarea
                rows={3}
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full"
              />
            </div>

            <div>
              <Label className="mb-1">City</Label>
              <Input
                type="text"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className="w-full"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button type="button" variant="secondary" size="sm" onClick={() => setIsEditModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm">
              Update Customer
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
