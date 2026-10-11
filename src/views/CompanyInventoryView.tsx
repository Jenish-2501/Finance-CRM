import React, { useState } from 'react';
import { useAccountingStore } from '../store/accountingStore';
import { InventoryMovementType } from '../types/database';
import {
  Plus,
  Search,
  SlidersHorizontal,
  Printer
} from 'lucide-react';
import { Modal } from '../components/common/Modal';
import { Badge } from '../components/common/Badge';
import { Button, Card, CardHeader, PageHeader, SearchInput, TableShell, Table, THead, TBody, TR, TH, TD, Tabs, Input, Label, Select, Alert } from '../components/ui';
import { DeliveryChallanPrintView } from '../components/challan/DeliveryChallanPrintView';

export const CompanyInventoryView: React.FC = () => {
  const {
    products,
    uoms,
    getCurrentCompanyStock,
    inventoryMovements,
    createStockReceipt,
    createInventoryAdjustment,
    stockReceipts,
    customerInventoryMovements
  } = useAccountingStore();

  const [activeTab, setActiveTab] = useState<'balances' | 'movements' | 'receipts'>('balances');
  const [searchQuery, setSearchQuery] = useState('');
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [selectedChallanRef, setSelectedChallanRef] = useState<string | null>(null);

  // Stock Receipt Form
  const [receiptSupplier, setReceiptSupplier] = useState('');
  const [receiptRef, setReceiptRef] = useState('');
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().split('T')[0]);
  const [receiptNotes, setReceiptNotes] = useState('');
  const [receiptItems, setReceiptItems] = useState([
    { productId: 'prod-1', unitId: 'uom-pcs', quantity: 500, unitCost: 85 }
  ]);

  // Stock Adjustment Form
  const [adjustProductId, setAdjustProductId] = useState('prod-1');
  const [adjustQuantity, setAdjustQuantity] = useState(10);
  const [adjustType, setAdjustType] = useState<'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT'>('ADJUSTMENT_IN');
  const [adjustNotes, setAdjustNotes] = useState('');
  const [adjustError, setAdjustError] = useState('');

  const allProducts = Object.values(products);
  const filteredProducts = allProducts.filter((p) => {
    const q = searchQuery.toLowerCase();
    return p.product_name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
  });

  const movementsList = Object.values(inventoryMovements)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const handleOpenReceipt = () => {
    setReceiptSupplier('');
    setReceiptRef(`PO-${Math.floor(10000 + Math.random() * 90000)}`);
    setReceiptDate(new Date().toISOString().split('T')[0]);
    setReceiptNotes('');
    setReceiptItems([{ productId: allProducts[0]?.id || 'prod-1', unitId: 'uom-pcs', quantity: 500, unitCost: 100 }]);
    setIsReceiptModalOpen(true);
  };

  const handleAddReceiptItem = () => {
    setReceiptItems([
      ...receiptItems,
      { productId: allProducts[0]?.id || 'prod-1', unitId: 'uom-pcs', quantity: 100, unitCost: 50 }
    ]);
  };

  const handleRemoveReceiptItem = (index: number) => {
    if (receiptItems.length > 1) {
      setReceiptItems(receiptItems.filter((_, i) => i !== index));
    }
  };

  const handleSaveReceipt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiptSupplier.trim() || receiptItems.length === 0) return;

    createStockReceipt(
      {
        supplierName: receiptSupplier.trim(),
        referenceNumber: receiptRef.trim(),
        receiptDate: new Date(receiptDate).toISOString(),
        notes: receiptNotes.trim()
      },
      receiptItems.map((item) => ({
        productId: item.productId,
        unitId: item.unitId,
        quantity: Number(item.quantity),
        unitCost: Number(item.unitCost)
      }))
    );

    setIsReceiptModalOpen(false);
  };

  const handleSaveAdjust = (e: React.FormEvent) => {
    e.preventDefault();
    setAdjustError('');
    const prod = products[adjustProductId];
    if (!prod) return;

    const result = createInventoryAdjustment({
      productId: adjustProductId,
      unitId: prod.primary_unit_id,
      quantity: Number(adjustQuantity),
      movementType: adjustType,
      notes: adjustNotes || 'Physical inventory reconciliation'
    });

    if (!result.success) {
      setAdjustError(result.error || 'Adjustment failed');
    } else {
      setIsAdjustModalOpen(false);
    }
  };

  const getMovementBadgeVariant = (type: InventoryMovementType) => {
    switch (type) {
      case 'STOCK_IN':
      case 'CUSTOMER_RETURN':
      case 'ADJUSTMENT_IN':
        return 'success';
      case 'CUSTOMER_DISPATCH':
      case 'ADJUSTMENT_OUT':
        return 'neutral';
      default:
        return 'neutral';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <PageHeader
        title="Company Stock & Warehouse Ledger"
        subtitle="Strict ledger-based inventory • Current stock calculated as Σ(Inward - Outward)"
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => setIsAdjustModalOpen(true)}>
              <SlidersHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
              <span>Audit Adjustment</span>
            </Button>
            <Button variant="primary" size="md" onClick={handleOpenReceipt}>
              <Plus className="w-3.5 h-3.5" />
              <span>Receive Inward Stock</span>
            </Button>
          </>
        }
      />

      {/* Tabs */}
      <Tabs
        ariaLabel="Company inventory views"
        activeId={activeTab}
        onSelect={(id) => setActiveTab(id as 'balances' | 'movements' | 'receipts')}
        tabs={[
          { id: 'balances', label: 'Warehouse Stock Balances', count: allProducts.length },
          { id: 'movements', label: 'Movement Ledger', count: movementsList.length },
          { id: 'receipts', label: 'Stock Receipts', count: Object.keys(stockReceipts).length },
        ]}
      />

      {/* Tab 1: Current Stock Balances */}
      {activeTab === 'balances' && (
        <TableShell>
          <CardHeader>
            <SearchInput
              icon={<Search className="w-3.5 h-3.5" />}
              type="text"
              placeholder="Filter items..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-56"
            />
            <span className="text-[11px] font-mono text-muted-foreground">
              Rule 13: Calculated purely from movements (No stored current_stock field)
            </span>
          </CardHeader>

          <div className="overflow-x-auto">
            <Table className="text-left border-collapse">
            <caption className="sr-only">Warehouse stock balances by product</caption>
            <THead>
              <TR className="hover:bg-transparent">
                <TH scope="col">Product Name</TH>
                  <TH scope="col">SKU</TH>
                  <TH scope="col">Base UOM</TH>
                  <TH scope="col" className="text-right">Available Warehouse Stock</TH>
                  <TH scope="col" className="text-center">Stock Status</TH>
              </TR>
            </THead>
            <TBody>
                {filteredProducts.map((prod) => {
                  const stock = getCurrentCompanyStock(prod.id);
                  const uom = uoms[prod.primary_unit_id];
                  const isLow = stock < 50;

                  return (
                    <TR key={prod.id}>
                      <TD className="font-semibold">
                        {prod.product_name}
                      </TD>
                      <TD className="font-mono text-muted-foreground text-[11px]">{prod.sku}</TD>
                      <TD className="font-mono">
                        <Badge variant="neutral">{uom?.code || 'PCS'}</Badge>
                      </TD>
                      <TD className="text-right font-mono font-bold text-sm">
                        <span className={stock > 0 ? 'text-foreground' : 'text-destructive'}>
                          {stock.toLocaleString()}
                        </span>{' '}
                        <span className="text-xs font-normal text-muted-foreground">{uom?.code}</span>
                      </TD>
                      <TD className="text-center">
                        <Badge variant={stock > 0 ? (isLow ? 'warning' : 'success') : 'danger'}>
                          {stock > 0 ? (isLow ? 'LOW STOCK' : 'IN STOCK') : 'DEPLETED'}
                        </Badge>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </div>
        </TableShell>
      )}

      {/* Tab 2: Movement Ledger */}
      {activeTab === 'movements' && (
        <TableShell>
          <div className="overflow-x-auto">
            <Table className="text-left border-collapse">
              <caption className="sr-only">Company inventory movement ledger</caption>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH scope="col">Date</TH>
                  <TH scope="col">Product</TH>
                  <TH scope="col">Movement Type</TH>
                  <TH scope="col" className="text-right">Quantity</TH>
                  <TH scope="col">Reference / Notes</TH>
                  <TH scope="col">Audit By</TH>
                </TR>
              </THead>
              <TBody>
                {movementsList.map((mov) => {
                  const prod = products[mov.product_id];
                  const uom = uoms[mov.unit_id];
                  const isPositive =
                    mov.movement_type === 'STOCK_IN' ||
                    mov.movement_type === 'CUSTOMER_RETURN' ||
                    mov.movement_type === 'ADJUSTMENT_IN';

                  return (
                    <TR key={mov.id} className="font-mono text-[11px]">
                      <TD className="text-muted-foreground">
                        {new Date(mov.movement_date).toLocaleDateString()}
                      </TD>

                      <TD className="font-sans font-semibold">
                        {prod?.product_name || 'Item'}
                        <div className="text-[10px] font-mono text-muted-foreground">{prod?.sku}</div>
                      </TD>

                      <TD>
                        <Badge variant={getMovementBadgeVariant(mov.movement_type)}>
                          {mov.movement_type.replace('_', ' ')}
                        </Badge>
                      </TD>

                      <TD className="text-right font-bold">
                        <span className={isPositive ? 'text-emerald-700 dark:text-emerald-300' : 'text-foreground'}>
                          {isPositive ? '+' : '-'}
                          {mov.quantity}
                        </span>{' '}
                        <span className="text-[10px] text-muted-foreground font-normal">{uom?.code}</span>
                      </TD>

                      <TD className="font-sans text-muted-foreground">
                        <div>{mov.notes}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] font-mono text-muted-foreground">Ref: #{mov.reference_id}</span>
                          {mov.movement_type === 'CUSTOMER_DISPATCH' && (
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => {
                                const cim = customerInventoryMovements[mov.reference_id];
                                setSelectedChallanRef(cim?.reference_id || mov.reference_id);
                              }}
                              title="Print / View Delivery Challan"
                              className="px-2 py-0.5 text-[10px] shadow-2xs"
                            >
                              <Printer className="w-3 h-3" />
                              <span>Challan</span>
                            </Button>
                          )}
                        </div>
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

      {/* Tab 3: Stock Receipts */}
      {activeTab === 'receipts' && (
        <Card className="overflow-hidden shadow-2xs">
          <div className="divide-y divide-border text-xs">
            {Object.values(stockReceipts).map((sr) => (
              <div key={sr.id} className="p-4 hover:bg-muted flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 font-mono">
                    <span className="font-bold text-foreground text-sm">{sr.receipt_number}</span>
                    <Badge variant="success">{sr.status}</Badge>
                    <span className="text-muted-foreground">Ref: {sr.reference_number || 'N/A'}</span>
                  </div>
                  <div className="text-foreground font-medium mt-1">Supplier: {sr.supplier_name}</div>
                  <div className="text-muted-foreground text-[11px] mt-0.5">{sr.notes}</div>
                </div>

                <div className="text-right font-mono text-muted-foreground">
                  {new Date(sr.receipt_date).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Receive Inward Stock Modal */}
      <Modal
        isOpen={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
        title="Receive Company Stock (Inward)"
        subtitle="Generates stock receipt and logs STOCK_IN movements"
        maxWidth="2xl"
      >
        <form onSubmit={handleSaveReceipt} className="space-y-4 text-xs">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Label className="mb-1">Supplier / Vendor Name *</Label>
              <Input
                type="text"
                required
                value={receiptSupplier}
                onChange={(e) => setReceiptSupplier(e.target.value)}
                className="w-full"
                placeholder="e.g. Gujarat Steel & Alloys Corporation"
              />
            </div>

            <div>
              <Label className="mb-1">Receipt Date</Label>
              <Input
                type="date"
                required
                value={receiptDate}
                onChange={(e) => setReceiptDate(e.target.value)}
                className="w-full font-mono"
              />
            </div>

            <div>
              <Label className="mb-1">PO / Delivery Challan Ref</Label>
              <Input
                type="text"
                value={receiptRef}
                onChange={(e) => setReceiptRef(e.target.value)}
                className="w-full font-mono"
              />
            </div>

            <div className="col-span-2">
              <Label className="mb-1">Notes / Remarks</Label>
              <Input
                type="text"
                value={receiptNotes}
                onChange={(e) => setReceiptNotes(e.target.value)}
                className="w-full"
                placeholder="Consignment inspection comments"
              />
            </div>
          </div>

          {/* Items */}
          <div className="border-t border-border pt-3">
            <div className="flex justify-between items-center mb-2">
              <span className="font-semibold text-foreground uppercase tracking-wide text-[11px]">
                Inward Stock Items
              </span>
              <Button type="button" variant="secondary" size="sm" onClick={handleAddReceiptItem} className="text-[11px] px-2 py-1">
                + Add Another Item
              </Button>
            </div>

            <div className="space-y-2">
              {receiptItems.map((item, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-12 gap-2 items-center p-2.5 bg-muted border border-border rounded-md"
                >
                  <div className="col-span-5">
                    <label className="block text-[10px] text-muted-foreground mb-0.5">Product</label>
                    <Select
                      value={item.productId}
                      onChange={(e) => {
                        const updated = [...receiptItems];
                        updated[idx].productId = e.target.value;
                        const p = products[e.target.value];
                        if (p) updated[idx].unitId = p.primary_unit_id;
                        setReceiptItems(updated);
                      }}
                      className="w-full text-xs"
                    >
                      {allProducts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.product_name} ({p.sku})
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div className="col-span-3">
                    <label className="block text-[10px] text-muted-foreground mb-0.5">Quantity</label>
                    <Input
                      type="number"
                      min="1"
                      required
                      value={item.quantity}
                      onChange={(e) => {
                        const updated = [...receiptItems];
                        updated[idx].quantity = Number(e.target.value);
                        setReceiptItems(updated);
                      }}
                      className="w-full font-mono"
                    />
                  </div>

                  <div className="col-span-3">
                    <label className="block text-[10px] text-muted-foreground mb-0.5">Unit Cost (₹)</label>
                    <Input
                      type="number"
                      step="0.01"
                      value={item.unitCost}
                      onChange={(e) => {
                        const updated = [...receiptItems];
                        updated[idx].unitCost = Number(e.target.value);
                        setReceiptItems(updated);
                      }}
                      className="w-full font-mono"
                    />
                  </div>

                  <div className="col-span-1 pt-4 text-center">
                    {receiptItems.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveReceiptItem(idx)}
                        title="Remove line"
                      >
                        ×
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button type="button" variant="secondary" size="sm" onClick={() => setIsReceiptModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm">
              Confirm Receipt
            </Button>
          </div>
        </form>
      </Modal>

      {/* Audit Adjustment Modal */}
      <Modal
        isOpen={isAdjustModalOpen}
        onClose={() => setIsAdjustModalOpen(false)}
        title="Physical Inventory Adjustment"
        subtitle="Compensating ledger movement for audit corrections"
        maxWidth="md"
      >
        <form onSubmit={handleSaveAdjust} className="space-y-4 text-xs">
          {adjustError && (
            <Alert tone="destructive">
              {adjustError}
            </Alert>
          )}

          <div>
            <Label className="mb-1">Product</Label>
            <Select
              value={adjustProductId}
              onChange={(e) => setAdjustProductId(e.target.value)}
              className="w-full text-xs"
            >
              {allProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.product_name} (Current: {getCurrentCompanyStock(p.id)})
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label className="mb-1">Adjustment Direction</Label>
            <div className="grid grid-cols-2 gap-2">
              <label
                className={`p-2 border rounded text-center cursor-pointer ${
                  adjustType === 'ADJUSTMENT_IN'
                    ? 'border-primary bg-primary text-primary-foreground font-semibold'
                    : 'border-input bg-card text-foreground'
                }`}
              >
                <input
                  type="radio"
                  name="adjType"
                  value="ADJUSTMENT_IN"
                  checked={adjustType === 'ADJUSTMENT_IN'}
                  onChange={() => setAdjustType('ADJUSTMENT_IN')}
                  className="hidden"
                />
                + Adjustment In (Surplus)
              </label>

              <label
                className={`p-2 border rounded text-center cursor-pointer ${
                  adjustType === 'ADJUSTMENT_OUT'
                    ? 'border-primary bg-primary text-primary-foreground font-semibold'
                    : 'border-input bg-card text-foreground'
                }`}
              >
                <input
                  type="radio"
                  name="adjType"
                  value="ADJUSTMENT_OUT"
                  checked={adjustType === 'ADJUSTMENT_OUT'}
                  onChange={() => setAdjustType('ADJUSTMENT_OUT')}
                  className="hidden"
                />
                - Adjustment Out (Deficit)
              </label>
            </div>
          </div>

          <div>
            <Label className="mb-1">Quantity</Label>
            <Input
              type="number"
              min="1"
              required
              value={adjustQuantity}
              onChange={(e) => setAdjustQuantity(Number(e.target.value))}
              className="w-full font-mono"
            />
          </div>

          <div>
            <Label className="mb-1">Audit Reconciliation Reason</Label>
            <Input
              type="text"
              required
              value={adjustNotes}
              onChange={(e) => setAdjustNotes(e.target.value)}
              className="w-full"
              placeholder="e.g. Physical inventory variance found during quarterly audit"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button type="button" variant="secondary" size="sm" onClick={() => setIsAdjustModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm">
              Post Adjustment
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
