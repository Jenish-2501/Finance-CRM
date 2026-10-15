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
import { useT } from '../i18n';
import { customerMatchesQuery } from '../components/common/CustomerPicker';

interface CustomersViewProps {
  onSelectCustomerForBilling?: (customerId: string) => void;
  onOpenInvoice?: (invoiceId: string) => void;
}

export const CustomersView: React.FC<CustomersViewProps> = ({
  onSelectCustomerForBilling,
  onOpenInvoice
}) => {
  const { t } = useT();
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
  // Which customer the edit modal is saving to. Separate from
  // selectedCustomerId (detail drawer): opening edit from the table pencil
  // must not pop the drawer open, and saving must not depend on it.
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [formError, setFormError] = useState('');

  // Form states
  const [formData, setFormData] = useState({
    customer_name: '',
    gujarati_name: '',
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
      gujarati_name: '',
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
      gujarati_name: c.gujarati_name ?? '',
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
    setEditingCustomerId(c.id);
    setIsEditModalOpen(true);
  };

  const handleSaveCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!formData.customer_name.trim()) return;
    if (formData.gujarati_name.trim().length > 200) {
      setFormError(t('customers.errNickGuTooLong'));
      return;
    }
    // Empty number → store auto-assigns the next free plain number.

    const result = createCustomer({
      customer_name: formData.customer_name.trim(),
      gujarati_name: formData.gujarati_name.trim() || null,
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
    if (!editingCustomerId || !formData.customer_name.trim()) return;
    if (!formData.customer_number.trim()) {
      setFormError('Customer number is required.');
      return;
    }
    if (formData.gujarati_name.trim().length > 200) {
      setFormError(t('customers.errNickGuTooLong'));
      return;
    }

    const result = updateCustomer(editingCustomerId, {
      customer_name: formData.customer_name.trim(),
      gujarati_name: formData.gujarati_name.trim() || null,
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

    setEditingCustomerId(null);
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
        title={t('customers.title')}
        subtitle={t('customers.subtitle')}
        actions={
          <>
            <SearchInput
              icon={<Search className="w-4 h-4" />}
              type="text"
              placeholder={t('customers.searchPh')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <Button variant="primary" size="md" onClick={handleOpenCreate}>
              <Plus className="w-3.5 h-3.5" />
              <span>{t('customers.add')}</span>
            </Button>
          </>
        }
      />

      {/* Main Customers Table */}
      <TableShell>
        <div className="overflow-x-auto">
          <Table className="text-left border-collapse">
            <caption className="sr-only">{t('customers.caption')}</caption>
            <THead>
              <TR className="hover:bg-transparent">
                <TH scope="col">{t('customers.thEntity')}</TH>
                <TH scope="col">{t('customers.thNumber')}</TH>
                <TH scope="col">{t('customers.thState')}</TH>
                <TH scope="col">{t('customers.thGst')}</TH>
                <TH scope="col">{t('customers.thContact')}</TH>
                <TH scope="col" className="text-right">{t('customers.thOutstanding')}</TH>
                <TH scope="col" className="text-center">{t('customers.thStatus')}</TH>
                <TH scope="col" className="text-right px-4">{t('customers.thActions')}</TH>
              </TR>
            </THead>
            <TBody>
              {filteredCustomers.length === 0 ? (
                <tr>
                  <TD colSpan={8} className="py-8 text-center text-muted-foreground text-xs">
                    {t('customers.empty')}
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
                        {cust.gujarati_name?.trim() ? (
                          <div className="text-xs text-foreground/80">
                            {cust.gujarati_name}
                          </div>
                        ) : null}
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
                        <div className="text-foreground font-semibold">{cust.gst_number || t('common.unregistered')}</div>
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
                          {cust.is_active ? t('common.active') : t('common.inactive')}
                        </Badge>
                      </TD>

                      <TD className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          {onSelectCustomerForBilling && (
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => onSelectCustomerForBilling(cust.id)}
                              title={t('customers.billTitle')}
                              className="text-[11px] px-2 py-1"
                            >
                              {t('customers.rowBill')}
                            </Button>
                          )}
                          <Button
                            variant="secondary"
                            size="icon"
                            onClick={() => handleOpenEdit(cust)}
                            title={t('customers.editTitle')}
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
          title={
            selectedCustomer.gujarati_name?.trim()
              ? `${selectedCustomer.customer_name} (${selectedCustomer.gujarati_name.trim()})`
              : selectedCustomer.customer_name
          }
          subtitle={t('customers.drawerSubtitle', { no: selectedCustomer.customer_number || '—', gstin: selectedCustomer.gst_number || t('common.na'), state: selectedCustomer.state })}
          maxWidth="4xl"
          footer={
            <div className="flex justify-between w-full items-center">
              <div className="font-mono text-xs text-muted-foreground">
                {t('customers.outstandingBalance')}{' '}
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
                    {t('customers.openBilling')}
                  </Button>
                )}
                <Button variant="secondary" size="sm" onClick={() => setSelectedCustomerId(null)}>
                  {t('common.close')}
                </Button>
              </div>
            </div>
          }
        >
          <div className="space-y-4">
            {/* Tabs */}
            <Tabs
              ariaLabel={t('customers.drawerTabsLabel')}
              activeId={detailTab}
              onSelect={(id) => setDetailTab(id as 'overview' | 'inventory' | 'invoices' | 'payments' | 'ledger' | 'activity')}
              tabs={[
                { id: 'overview', label: t('customers.drawerOverview') },
                { id: 'inventory', label: t('customers.drawerInventory', { count: customerSummary.length }) },
                { id: 'invoices', label: t('customers.drawerInvoices', { count: customerInvoices.length }) },
                { id: 'payments', label: t('customers.drawerPayments', { count: customerPayments.length }) },
                { id: 'ledger', label: t('customers.drawerLedger') },
                { id: 'activity', label: t('customers.drawerActivity') },
              ]}
            />

            {/* Tab: Overview */}
            {detailTab === 'overview' && (
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="p-3.5 bg-muted border border-border rounded space-y-2">
                  <div className="font-semibold text-foreground uppercase tracking-wide text-[11px]">
                    {t('customers.taxIdentity')}
                  </div>
                  <div className="space-y-1 font-mono">
                    <div>
                      <span className="text-muted-foreground">GSTIN:</span>{' '}
                      <span className="font-bold text-foreground">{selectedCustomer.gst_number || t('common.na')}</span>
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
                      <span className="text-muted-foreground">{t('customers.creditLimit')}</span>{' '}
                      <span>{formatINR(selectedCustomer.credit_limit || 0)}</span>
                    </div>
                  </div>
                </div>

                <div className="p-3.5 bg-muted border border-border rounded space-y-2">
                  <div className="font-semibold text-foreground uppercase tracking-wide text-[11px]">
                    {t('customers.billingContact')}
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
                  {t('customers.invIntro')}
                </div>
                <div className="border border-border rounded overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                  <caption className="sr-only">{t('customers.invCaption')}</caption>
                  <thead>
                      <tr className="bg-muted font-mono text-[11px] text-muted-foreground border-b border-border">
                        <th scope="col" className="py-2.5 px-3">{t('customers.thProduct')}</th>
                        <th scope="col" className="py-2.5 px-2 text-right">{t('customers.thReceived')}</th>
                        <th scope="col" className="py-2.5 px-2 text-right">{t('customers.thReturned')}</th>
                        <th scope="col" className="py-2.5 px-2 text-right">{t('customers.thHeld')}</th>
                        <th scope="col" className="py-2.5 px-2 text-right">{t('customers.thBilledQty')}</th>
                        <th scope="col" className="py-2.5 px-3 text-right">{t('customers.thUnbilledQty')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border font-mono">
                      {customerSummary.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-6 text-center text-muted-foreground">
                            {t('customers.noMovements')}
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
                  <div className="py-8 text-center text-muted-foreground text-xs">{t('customers.noInvoices')}</div>
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
                            {t('customers.invPeriod', { from: inv.billing_period_start, to: inv.billing_period_end })}
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
                  <div className="py-8 text-center text-muted-foreground text-xs">{t('dashboard.noPayments')}</div>
                ) : (
                  <div className="border border-border rounded divide-y divide-border text-xs">
                    {customerPayments.map((p) => (
                      <div key={p.id} className="p-3 flex items-center justify-between">
                        <div>
                          <div className="font-mono font-semibold text-emerald-800 dark:text-emerald-300">{formatINR(p.amount)}</div>
                          <div className="text-[11px] text-muted-foreground font-mono">
                            {t('customers.payMethod', { method: p.payment_method, ref: p.reference_number || t('common.na') })}
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
                  <caption className="sr-only">{t('customers.ledgerCaption')}</caption>
                  <thead>
                    <tr className="bg-muted font-mono text-[11px] text-muted-foreground border-b border-border">
                      <th scope="col" className="py-2.5 px-3">{t('customers.thDate')}</th>
                      <th scope="col" className="py-2.5 px-3">{t('customers.thRef')}</th>
                      <th scope="col" className="py-2.5 px-3">{t('customers.thDesc')}</th>
                      <th scope="col" className="py-2.5 px-2 text-right">{t('customers.thDebit')}</th>
                      <th scope="col" className="py-2.5 px-2 text-right">{t('customers.thCredit')}</th>
                      <th scope="col" className="py-2.5 px-3 text-right">{t('customers.thBalance')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border font-mono text-[11px]">
                    {customerLedger.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-muted-foreground">
                          {t('customers.noLedger')}
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
                  <div className="py-6 text-center text-muted-foreground text-xs">{t('customers.noAudit')}</div>
                ) : (
                  customerAudit.map((log) => (
                    <div key={log.id} className="p-2.5 bg-muted border border-border rounded text-xs">
                      <div className="flex justify-between font-mono text-[11px]">
                        <span className="font-semibold text-foreground">{log.action}</span>
                        <span className="text-muted-foreground">{new Date(log.created_at).toLocaleString()}</span>
                      </div>
                      <div className="text-muted-foreground text-[11px] mt-0.5">{t('dashboard.byUser', { user: log.user_name })}</div>
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
        title={t('customers.createTitle')}
        subtitle={t('customers.createSubtitle')}
        maxWidth="2xl"
      >
        <form onSubmit={handleSaveCreate} className="space-y-4 text-xs">
          {formError && (
            <Alert tone="destructive">{formError}</Alert>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="mb-1">{t('customers.fNumber')}</Label>
              <Input
                type="text"
                required
                value={formData.customer_number}
                onChange={(e) => setFormData({ ...formData, customer_number: e.target.value.toUpperCase() })}
                className="w-full font-mono uppercase"
                placeholder={t('customers.fNumberPh')}
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">{t('customers.fNumberHint')}</p>
            </div>

            <div>
              <Label className="mb-1">{t('customers.fMobile')}</Label>
              <Input
                type="text"
                value={formData.mobile}
                onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                className="w-full font-mono"
                placeholder={t('customers.fMobilePh')}
              />
            </div>

            <div className="col-span-2">
              <Label className="mb-1">{t('customers.fName')}</Label>
              <Input
                type="text"
                required
                value={formData.customer_name}
                onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                className="w-full focus:ring-1 focus:ring-ring focus:outline-none"
                placeholder={t('customers.fNamePh')}
              />
            </div>

            <div className="col-span-2">
              <Label className="mb-1">{t('customers.fNickGu')}</Label>
              <Input
                type="text"
                value={formData.gujarati_name}
                onChange={(e) => setFormData({ ...formData, gujarati_name: e.target.value })}
                className="w-full"
                placeholder={t('customers.fNickGuPh')}
                maxLength={200}
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">{t('customers.fNickGuHint')}</p>
            </div>

            <div>
              <Label className="mb-1">{t('customers.fGstin')}</Label>
              <Input
                type="text"
                value={formData.gst_number}
                onChange={(e) => setFormData({ ...formData, gst_number: e.target.value })}
                className="w-full uppercase font-mono"
                placeholder={t('customers.fGstinPh')}
              />
            </div>

            <div>
              <Label className="mb-1">{t('customers.fPan')}</Label>
              <Input
                type="text"
                value={formData.pan}
                onChange={(e) => setFormData({ ...formData, pan: e.target.value })}
                className="w-full uppercase font-mono"
                placeholder={t('customers.fPanPh')}
              />
            </div>

            <div className="col-span-2">
              <Label className="mb-1">{t('customers.fAddress')}</Label>
              <Textarea
                rows={3}
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full"
                placeholder={t('customers.fAddressPh')}
              />
            </div>

            <div>
              <Label className="mb-1">{t('customers.fCity')}</Label>
              <Input
                type="text"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className="w-full"
                placeholder={t('customers.fCityPh')}
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">{t('customers.fCityHint')}</p>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button type="button" variant="secondary" size="sm" onClick={() => setIsCreateModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="primary" size="sm">
              {t('customers.create')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Customer Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingCustomerId(null);
        }}
        title={t('customers.editTitle2')}
        subtitle={t('customers.editSubtitle')}
        maxWidth="2xl"
      >
        <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
          {formError && (
            <Alert tone="destructive">{formError}</Alert>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="mb-1">{t('customers.fNumber')}</Label>
              <Input
                type="text"
                required
                value={formData.customer_number}
                onChange={(e) => setFormData({ ...formData, customer_number: e.target.value.toUpperCase() })}
                className="w-full font-mono uppercase"
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">{t('customers.fNumberUnique')}</p>
            </div>

            <div>
              <Label className="mb-1">{t('customers.fMobile')}</Label>
              <Input
                type="text"
                value={formData.mobile}
                onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                className="w-full font-mono"
              />
            </div>

            <div className="col-span-2">
              <Label className="mb-1">{t('customers.fName')}</Label>
              <Input
                type="text"
                required
                value={formData.customer_name}
                onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                className="w-full"
              />
            </div>

            <div className="col-span-2">
              <Label className="mb-1">{t('customers.fNickGu')}</Label>
              <Input
                type="text"
                value={formData.gujarati_name}
                onChange={(e) => setFormData({ ...formData, gujarati_name: e.target.value })}
                className="w-full"
                placeholder={t('customers.fNickGuPh')}
                maxLength={200}
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">{t('customers.fNickGuHint')}</p>
            </div>

            <div>
              <Label className="mb-1">{t('customers.fGstin')}</Label>
              <Input
                type="text"
                value={formData.gst_number}
                onChange={(e) => setFormData({ ...formData, gst_number: e.target.value })}
                className="w-full uppercase font-mono"
              />
            </div>

            <div>
              <Label className="mb-1">{t('customers.fPan')}</Label>
              <Input
                type="text"
                value={formData.pan}
                onChange={(e) => setFormData({ ...formData, pan: e.target.value })}
                className="w-full uppercase font-mono"
              />
            </div>

            <div className="col-span-2">
              <Label className="mb-1">{t('customers.fAddress')}</Label>
              <Textarea
                rows={3}
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full"
              />
            </div>

            <div>
              <Label className="mb-1">{t('customers.fCity')}</Label>
              <Input
                type="text"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className="w-full"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setIsEditModalOpen(false);
                setEditingCustomerId(null);
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="primary" size="sm">
              {t('customers.update')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
