import React, { useState } from 'react';
import { useAccountingStore } from '../store/accountingStore';
import { isHoldingsRowFullyBilled, getMovementBillingStatus, roundCurrency } from '../utils/calculations';
import {
  Truck,
  RotateCcw,
  Building,
  CheckCircle2,
  FileCheck,
  Printer,
  Trash2,
  PlusCircle
} from 'lucide-react';
import { Modal } from '../components/common/Modal';
import { Badge } from '../components/common/Badge';
import { Button, Card, CardHeader, PageHeader, TableShell, Table, THead, TBody, TR, TH, TD, Tabs, Alert, Input, Label, Select } from '../components/ui';
import { CustomerPicker, firstCustomerId } from '../components/common/CustomerPicker';
import { DeliveryChallanPrintView } from '../components/challan/DeliveryChallanPrintView';

interface CustomerInventoryViewProps {
  onOpenBillingForCustomer?: (customerId: string) => void;
}

export const CustomerInventoryView: React.FC<CustomerInventoryViewProps> = ({
  onOpenBillingForCustomer
}) => {
  const {
    customers,
    products,
    uoms,
    customerInventoryMovements,
    invoices,
    invoiceAllocations,
    dispatchBatchInventoryToCustomer,
    createCustomerReturn,
    suggestNextDocumentNumber,
    getCustomerInventorySummary,
    getCurrentCompanyStock
  } = useAccountingStore();

  const [activeTab, setActiveTab] = useState<'holdings' | 'movements'>('holdings');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('cust-1');
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [selectedChallanRef, setSelectedChallanRef] = useState<string | null>(null);
  const [operationError, setOperationError] = useState('');

  // Dispatch Form State
  const [dispatchForm, setDispatchForm] = useState({
    customerId: 'cust-1',
    referenceId: '',
    items: [
      {
        productId: 'prod-1',
        unitId: 'uom-pcs',
        quantity: 50
      }
    ]
  });

  // Return Form State
  const [returnForm, setReturnForm] = useState({
    customerId: 'cust-1',
    productId: 'prod-1',
    unitId: 'uom-pcs',
    quantity: 10,
    referenceId: ''
  });

  // Fall back to the first real customer when a stored id is gone
  // (e.g. seed-only 'cust-1' in a live database) so pickers never sit empty.
  const effectiveCustomerId = firstCustomerId(customers, selectedCustomerId);
  const effectiveDispatchCustomerId = firstCustomerId(customers, dispatchForm.customerId);
  const effectiveReturnCustomerId = firstCustomerId(customers, returnForm.customerId);

  const allProducts = Object.values(products);

  const selectedCustomerSummary = getCustomerInventorySummary(effectiveCustomerId);
  const allCustomerMovements = Object.values(customerInventoryMovements)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const handleOpenDispatch = (cId?: string, pId?: string) => {
    setOperationError('');
    const targetProd = pId ? products[pId] : allProducts[0];
    const targetCustomer = cId || effectiveCustomerId;
    setDispatchForm({
      customerId: targetCustomer,
      referenceId: suggestNextDocumentNumber(targetCustomer, 'DISPATCH'),
      items: [
        {
          productId: targetProd?.id || 'prod-1',
          unitId: targetProd?.primary_unit_id || 'uom-pcs',
          quantity: 50
        }
      ]
    });
    setIsDispatchModalOpen(true);
  };

  const handleAddDispatchItem = () => {
    const defaultProd = allProducts[0];
    setDispatchForm({
      ...dispatchForm,
      items: [
        ...dispatchForm.items,
        {
          productId: defaultProd?.id || 'prod-1',
          unitId: defaultProd?.primary_unit_id || 'uom-pcs',
          quantity: 20
        }
      ]
    });
  };

  const handleRemoveDispatchItem = (index: number) => {
    if (dispatchForm.items.length <= 1) return;
    setDispatchForm({
      ...dispatchForm,
      items: dispatchForm.items.filter((_, idx) => idx !== index)
    });
  };

  const handleOpenReturn = (cId?: string, pId?: string) => {
    setOperationError('');
    const targetCustomer = cId || effectiveCustomerId;
    setReturnForm({
      customerId: targetCustomer,
      productId: pId || allProducts[0]?.id || 'prod-1',
      unitId: products[pId || allProducts[0]?.id || 'prod-1']?.primary_unit_id || 'uom-pcs',
      quantity: 10,
      referenceId: suggestNextDocumentNumber(targetCustomer, 'RETURN')
    });
    setIsReturnModalOpen(true);
  };

  const handleConfirmDispatch = (e: React.FormEvent) => {
    e.preventDefault();
    setOperationError('');

    if (dispatchForm.items.length === 0) {
      setOperationError('Please add at least one product item to dispatch.');
      return;
    }

    const res = dispatchBatchInventoryToCustomer({
      customerId: effectiveDispatchCustomerId,
      referenceId: dispatchForm.referenceId.trim(),
      items: dispatchForm.items.map((it) => ({
        productId: it.productId,
        unitId: it.unitId,
        quantity: Number(it.quantity)
      }))
    });

    if (!res.success) {
      setOperationError(res.error || 'Dispatch failed');
    } else {
      setIsDispatchModalOpen(false);
      // Immediately open generated Delivery Challan for print & preview
      if (res.referenceId) {
        setSelectedChallanRef(res.referenceId);
      }
    }
  };

  const handleConfirmReturn = (e: React.FormEvent) => {
    e.preventDefault();
    setOperationError('');

    const res = createCustomerReturn({
      customerId: effectiveReturnCustomerId,
      productId: returnForm.productId,
      unitId: returnForm.unitId,
      quantity: Number(returnForm.quantity),
      referenceId: returnForm.referenceId
    });

    if (!res.success) {
      setOperationError(res.error || 'Return failed');
    } else {
      setIsReturnModalOpen(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <PageHeader
        title="Customer Inventory & Consignments"
        subtitle="Atomic stock dispatch/return • Explicit unbilled vs. holding reconciliation"
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => handleOpenReturn()}>
              <RotateCcw className="w-3.5 h-3.5 text-muted-foreground" />
              <span>Record Customer Return</span>
            </Button>
            <Button variant="primary" size="md" onClick={() => handleOpenDispatch()}>
              <Truck className="w-3.5 h-3.5" />
              <span>Dispatch to Customer</span>
            </Button>
          </>
        }
      />

      {/* Tabs */}
      <Tabs
        ariaLabel="Customer inventory views"
        activeId={activeTab}
        onSelect={(id) => setActiveTab(id as 'holdings' | 'movements')}
        tabs={[
          { id: 'holdings', label: 'Customer Holdings Reconciliation' },
          { id: 'movements', label: 'Customer Movement Ledger', count: allCustomerMovements.length },
        ]}
      />

      {/* Tab 1: Holdings Reconciliation */}
      {activeTab === 'holdings' && (
        <div className="space-y-4">
          {/* Customer Selector Card */}
          <Card className="p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-2xs">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <Building className="w-4 h-4 text-muted-foreground" />
              <label className="text-xs font-semibold text-foreground whitespace-nowrap">
                Select Client Site:
              </label>
              <div className="min-w-[260px]">
                <CustomerPicker
                  value={effectiveCustomerId}
                  onChange={(id) => setSelectedCustomerId(id)}
                  customers={customers}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleOpenDispatch(effectiveCustomerId)}
                title="Dispatch stock to this client with Delivery Challan"
              >
                <Truck className="w-3.5 h-3.5" />
                <span>New Dispatch</span>
              </Button>
              {onOpenBillingForCustomer && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => onOpenBillingForCustomer(effectiveCustomerId)}
                >
                  <FileCheck className="w-3.5 h-3.5" />
                  <span>Generate Invoice for Unbilled</span>
                </Button>
              )}
            </div>
          </Card>

          {/* Holdings Breakdown Table */}
          <TableShell>
            <CardHeader>
              <div className="font-semibold text-foreground text-xs">
                Inventory Held at {customers[effectiveCustomerId]?.customer_name}
              </div>
              <div className="font-mono text-muted-foreground text-[11px]">
                Rule 56: Current Inventory ≠ Unbilled Inventory (Derived via allocations)
              </div>
            </CardHeader>

            <div className="overflow-x-auto">
              <Table className="text-left border-collapse">
              <caption className="sr-only">Customer consignment holdings reconciliation</caption>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH scope="col">Product Name</TH>
                    <TH scope="col">SKU</TH>
                    <TH scope="col" className="text-right">Dispatched In</TH>
                    <TH scope="col" className="text-right">Returned Out</TH>
                    <TH scope="col" className="text-right">Physically Held</TH>
                    <TH scope="col" className="text-right">Allocated / Billed</TH>
                    <TH scope="col" className="text-right">Remaining Billable</TH>
                    <TH scope="col" className="text-right px-4">Quick Actions</TH>
                </TR>
              </THead>
              <TBody>
                  {selectedCustomerSummary.length === 0 ? (
                    <tr>
                      <TD colSpan={8} className="py-8 text-center text-muted-foreground">
                        No inventory consignments or movements recorded for this customer yet.
                      </TD>
                    </tr>
                  ) : (
                    selectedCustomerSummary.map((item) => (
                      <TR key={item.productId}>
                        <TD className="font-semibold">
                          {item.productName}
                        </TD>
                        <TD className="font-mono text-muted-foreground text-[11px]">
                          {item.sku}
                        </TD>
                        <TD className="text-right font-mono">
                          {item.totalReceived} {item.unitCode}
                        </TD>
                        <TD className="text-right font-mono">
                          {item.totalReturned} {item.unitCode}
                        </TD>
                        <TD className="text-right font-mono font-bold">
                          {item.currentBalance} {item.unitCode}
                        </TD>
                        <TD className="text-right font-mono text-emerald-800 dark:text-emerald-300">
                          {item.billedQuantity} {item.unitCode}
                        </TD>
                        <TD className="text-right font-mono font-bold text-amber-900 dark:text-amber-200">
                          {item.unbilledQuantity} {item.unitCode}
                        </TD>
                        <TD className="text-right">
                          <div className="flex justify-end items-center gap-1.5">
                            {isHoldingsRowFullyBilled(item.billedQuantity, item.unbilledQuantity) ? (
                              <span
                                className="inline-flex items-center gap-1 text-[11px] font-mono font-bold text-emerald-800 dark:text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-md"
                                title="Fully billed — returns are not allowed on billed stock"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                <span>Billed</span>
                              </span>
                            ) : (
                              <>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => handleOpenReturn(effectiveCustomerId, item.productId)}
                                  title="Process return from this client site"
                                  className="text-[11px] px-2 py-1"
                                >
                                  Return
                                </Button>
                                {onOpenBillingForCustomer && item.unbilledQuantity > 0 && (
                                  <Button
                                    variant="success"
                                    size="sm"
                                    onClick={() => onOpenBillingForCustomer(effectiveCustomerId)}
                                    title="Open billing allocation"
                                    className="text-[11px] px-2 py-1"
                                  >
                                    Bill
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
                        </TD>
                      </TR>
                    ))
                  )}
                </TBody>
              </Table>
            </div>
          </TableShell>
        </div>
      )}

      {/* Tab 2: Customer Movement Ledger */}
      {activeTab === 'movements' && (
        <TableShell>
          <div className="overflow-x-auto">
            <Table className="text-left border-collapse">
              <caption className="sr-only">Customer inventory movement ledger</caption>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH scope="col">Date</TH>
                  <TH scope="col">Customer Entity</TH>
                  <TH scope="col">Product</TH>
                  <TH scope="col">Movement Type</TH>
                  <TH scope="col" className="text-right">Quantity</TH>
                  <TH scope="col">Challan / Transporter</TH>
                  <TH scope="col" className="text-center">Delivery Challan</TH>
                  <TH scope="col" className="text-center">Billing Status</TH>
                  <TH scope="col">Created By</TH>
                </TR>
              </THead>
              <TBody>
                {allCustomerMovements.map((mov) => {
                  const cust = customers[mov.customer_id];
                  const prod = products[mov.product_id];
                  const uom = uoms[mov.unit_id];
                  const isDispatch = mov.movement_type === 'DISPATCH' || mov.movement_type === 'ADJUSTMENT_IN';
                  // Non-cancelled allocations against this exact dispatch movement
                  const allocatedQty = isDispatch
                    ? roundCurrency(
                        Object.values(invoiceAllocations)
                          .filter(
                            (a) =>
                              a.customer_inventory_movement_id === mov.id &&
                              invoices[a.invoice_id]?.status !== 'CANCELLED'
                          )
                          .reduce((sum, a) => sum + a.allocated_quantity, 0)
                      )
                    : 0;
                  const billingStatus = isDispatch ? getMovementBillingStatus(mov.quantity, allocatedQty) : null;

                  return (
                    <TR key={mov.id} className="font-mono text-[11px]">
                      <TD className="text-muted-foreground">
                        {new Date(mov.movement_date).toLocaleDateString()}
                      </TD>

                      <TD className="font-sans font-semibold">
                        {cust?.customer_name || 'Client'}
                      </TD>

                      <TD className="font-sans">
                        {prod?.product_name || 'Item'}
                      </TD>

                      <TD>
                        <Badge variant={isDispatch ? 'success' : 'neutral'}>
                          {mov.movement_type}
                        </Badge>
                      </TD>

                      <TD className="text-right font-bold">
                        <span className={isDispatch ? 'text-emerald-700 dark:text-emerald-300' : 'text-foreground'}>
                          {isDispatch ? '+' : '-'}
                          {mov.quantity}
                        </span>{' '}
                        <span className="text-[10px] text-muted-foreground font-normal">{uom?.code}</span>
                      </TD>

                      <TD className="font-sans text-muted-foreground">
                        <div className="font-semibold text-foreground font-mono">Ref: #{mov.reference_id}</div>
                      </TD>

                      <TD className="text-center">
                        {isDispatch ? (
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => setSelectedChallanRef(mov.reference_id)}
                            title="Print / View GST Delivery Challan"
                            className="text-[11px] shadow-2xs"
                          >
                            <Printer className="w-3.5 h-3.5 text-primary-foreground" />
                            <span>Print Challan</span>
                          </Button>
                        ) : (
                          <span className="text-[10px] font-mono text-muted-foreground">Return Slip</span>
                        )}
                      </TD>

                      <TD className="text-center">
                        {!billingStatus ? (
                          <span className="text-[10px] font-mono text-muted-foreground">—</span>
                        ) : billingStatus === 'BILLED' ? (
                          <Badge variant="success">Billed</Badge>
                        ) : billingStatus === 'PARTIAL' ? (
                          <Badge variant="warning">Partial</Badge>
                        ) : (
                          <Badge variant="neutral">Unbilled</Badge>
                        )}
                      </TD>

                      <TD className="text-muted-foreground">{mov.created_by}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </div>
        </TableShell>
      )}

      {/* Dispatch Modal with Logistics and Multi-Item Support */}
      <Modal
        isOpen={isDispatchModalOpen}
        onClose={() => setIsDispatchModalOpen(false)}
        title="Create Customer Dispatch & Delivery Challan"
        subtitle="Rule 55 CGST Delivery Challan generation with atomic company-to-customer stock transfer"
        maxWidth="2xl"
      >
        <form onSubmit={handleConfirmDispatch} className="space-y-4 text-xs">
          {operationError && (
            <Alert tone="destructive">{operationError}</Alert>
          )}

          {/* Consignee and Challan Header */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-muted border border-border rounded-md">
            <div className="sm:col-span-2">
              <Label className="mb-1">Customer / Consignee *</Label>
              <CustomerPicker
                value={effectiveDispatchCustomerId}
                onChange={(id) => setDispatchForm({ ...dispatchForm, customerId: id })}
                customers={customers}
              />
            </div>

            <div>
              <Label className="mb-1">Challan Number *</Label>
              <Input
                type="text"
                required
                value={dispatchForm.referenceId}
                onChange={(e) => setDispatchForm({ ...dispatchForm, referenceId: e.target.value })}
                className="w-full font-mono font-bold"
                placeholder="Auto-assigned in sequence"
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">Auto-filled — editable, must stay unique per customer.</p>
            </div>
          </div>

          {/* Items Section */}
          <div className="border border-border rounded-md p-3 bg-muted/50 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-foreground uppercase text-[11px] tracking-wider flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5 text-foreground" />
                Goods to Dispatch ({dispatchForm.items.length} Product{dispatchForm.items.length > 1 ? 's' : ''})
              </span>
              <Button type="button" variant="secondary" size="sm" onClick={handleAddDispatchItem} className="text-[11px] px-2.5 py-1">
                <PlusCircle className="w-3 h-3 text-muted-foreground" />
                <span>+ Add Item to Challan</span>
              </Button>
            </div>

            <div className="space-y-2">
              {dispatchForm.items.map((item, idx) => {
                const selectedProd = products[item.productId];
                const availableStock = selectedProd ? getCurrentCompanyStock(selectedProd.id) : 0;
                const prodUom = selectedProd ? uoms[selectedProd.primary_unit_id] : null;

                return (
                  <div
                    key={idx}
                    className="p-3 bg-card border border-border rounded-md grid grid-cols-12 gap-2 items-center"
                  >
                    <div className="col-span-12 sm:col-span-6">
                      <label className="block text-[10px] font-mono text-muted-foreground mb-0.5">
                        Product Item #{idx + 1}
                      </label>
                      <Select
                        value={item.productId}
                        onChange={(e) => {
                          const newProdId = e.target.value;
                          const p = products[newProdId];
                          const newItems = [...dispatchForm.items];
                          newItems[idx] = {
                            ...newItems[idx],
                            productId: newProdId,
                            unitId: p ? p.primary_unit_id : 'uom-pcs'
                          };
                          setDispatchForm({ ...dispatchForm, items: newItems });
                        }}
                        className="w-full text-xs"
                      >
                        {allProducts.map((p) => {
                          const stock = getCurrentCompanyStock(p.id);
                          return (
                            <option key={p.id} value={p.id}>
                              {p.product_name} (Warehouse: {stock} {uoms[p.primary_unit_id]?.code})
                            </option>
                          );
                        })}
                      </Select>
                      <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
                        Available in Warehouse: <span className="font-bold text-foreground">{availableStock} {prodUom?.code}</span>
                      </div>
                    </div>

                    <div className="col-span-8 sm:col-span-4">
                      <label className="block text-[10px] font-mono text-muted-foreground mb-0.5">
                        Quantity ({prodUom?.code})
                      </label>
                      <Input
                        type="number"
                        min="1"
                        required
                        value={item.quantity}
                        onChange={(e) => {
                          const newItems = [...dispatchForm.items];
                          newItems[idx] = {
                            ...newItems[idx],
                            quantity: Number(e.target.value)
                          };
                          setDispatchForm({ ...dispatchForm, items: newItems });
                        }}
                        className="w-full font-mono font-bold text-sm"
                      />
                    </div>

                    <div className="col-span-4 sm:col-span-2 flex justify-end items-end h-full pt-4">
                      {dispatchForm.items.length > 1 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveDispatchItem(idx)}
                          aria-label="Remove dispatch line item"
                          title="Remove item"
                        >
                          <Trash2 className="w-4 h-4" aria-hidden="true" />
                        </Button>
                      ) : (
                        <span className="text-[10px] font-mono text-muted-foreground">Primary</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-border">
            <span className="text-[11px] font-mono text-muted-foreground flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              Will generate printable Delivery Challan immediately
            </span>

            <div className="flex gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => setIsDispatchModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" className="shadow-2xs">
                <Printer className="w-3.5 h-3.5" />
                <span>Confirm &amp; Generate Challan</span>
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Return Modal */}
      <Modal
        isOpen={isReturnModalOpen}
        onClose={() => setIsReturnModalOpen(false)}
        title="Record Customer Material Return"
        subtitle="Credits company warehouse and reduces customer held balance"
        maxWidth="lg"
      >
        <form onSubmit={handleConfirmReturn} className="space-y-4 text-xs">
          {operationError && (
            <Alert tone="destructive">{operationError}</Alert>
          )}

          <div>
            <Label className="mb-1">Customer / Consignee</Label>
            <CustomerPicker
              value={effectiveReturnCustomerId}
              onChange={(id) => setReturnForm({ ...returnForm, customerId: id })}
              customers={customers}
            />
          </div>

          <div>
            <Label className="mb-1">Product</Label>
            <Select
              value={returnForm.productId}
              onChange={(e) => {
                const p = products[e.target.value];
                setReturnForm({
                  ...returnForm,
                  productId: e.target.value,
                  unitId: p ? p.primary_unit_id : 'uom-pcs'
                });
              }}
              className="w-full text-xs"
            >
              {allProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.product_name}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1">Return Quantity</Label>
              <Input
                type="number"
                min="1"
                required
                value={returnForm.quantity}
                onChange={(e) => setReturnForm({ ...returnForm, quantity: Number(e.target.value) })}
                className="w-full font-mono"
              />
            </div>

            <div>
              <Label className="mb-1">Return Reference *</Label>
              <Input
                type="text"
                required
                value={returnForm.referenceId}
                onChange={(e) => setReturnForm({ ...returnForm, referenceId: e.target.value })}
                className="w-full font-mono"
                placeholder="Auto-assigned in sequence"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button type="button" variant="secondary" size="sm" onClick={() => setIsReturnModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm">
              Accept Return
            </Button>
          </div>
        </form>
      </Modal>
      {/* Global Delivery Challan Print & Preview Modal */}
      {selectedChallanRef && (
        <Modal
          isOpen={Boolean(selectedChallanRef)}
          onClose={() => setSelectedChallanRef(null)}
          title={`Delivery Challan #${selectedChallanRef}`}
          subtitle="Rule 55 CGST / SGST Delivery Challan for customer goods dispatch"
          maxWidth="full"
        >
          <DeliveryChallanPrintView
            challanReference={selectedChallanRef}
            onClose={() => setSelectedChallanRef(null)}
          />
        </Modal>
      )}
    </div>
  );
};
