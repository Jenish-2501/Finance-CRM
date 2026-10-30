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
import { useT } from '../i18n';
import { convertQuantity, roundCurrency, toPcsDisplayQty, kolkataCalendarDay } from '../utils/calculations';
import { DeliveryChallanPrintView } from '../components/challan/DeliveryChallanPrintView';

export const CompanyInventoryView: React.FC = () => {
  const { t } = useT();
  const {
    products,
    uoms,
    productUnits,
    getCurrentCompanyStock,
    getPieceWeightMapping,
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
  const [receiptDate, setReceiptDate] = useState(kolkataCalendarDay(new Date()));
  const [receiptNotes, setReceiptNotes] = useState('');
  // Receipt lines carry quantity only. Selling base price is set at product
  // create / Adjust Price (Products screen) — never here, to avoid two
  // conflicting price entries. unit_cost persists as 0 (DB column is NOT
  // NULL; nothing reads it — see StockReceiptItem).
  const [receiptItems, setReceiptItems] = useState([
    { productId: 'prod-1', unitId: 'uom-pcs', quantity: 500 }
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

  // Piece-weight entry: mapped products (GRAM/KG primary + PCS mapping) are
  // ALWAYS entered in PCS — inward, adjustment, dispatch, return. The store
  // validates and ledgers in primary units either way.
  const entryUnitFor = (productId: string): string => {
    const p = products[productId];
    if (!p) return 'uom-pcs';
    return getPieceWeightMapping(productId)?.pcsUnitId ?? p.primary_unit_id;
  };

  // Derived weight preview for a mapped product line, or null.
  const piecePreviewFor = (
    productId: string,
    quantity: number
  ): { grams: number; kg: number } | null => {
    if (!Number.isFinite(quantity) || quantity <= 0) return null;
    const mapping = getPieceWeightMapping(productId);
    if (!mapping) return null;
    const pus = Object.values(productUnits).filter((pu) => pu.product_id === productId);
    return {
      grams: roundCurrency(quantity * mapping.gramsPerPiece),
      kg: convertQuantity(quantity, mapping.pcsUnitId, mapping.kgUnitId, pus)
    };
  };

  const movementsList = Object.values(inventoryMovements)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const handleOpenReceipt = () => {
    setReceiptSupplier('');
    setReceiptRef(`PO-${Math.floor(10000 + Math.random() * 90000)}`);
    setReceiptDate(kolkataCalendarDay(new Date()));
    setReceiptNotes('');
    const firstId = allProducts[0]?.id || 'prod-1';
    setReceiptItems([{ productId: firstId, unitId: entryUnitFor(firstId), quantity: 500 }]);
    setIsReceiptModalOpen(true);
  };

  const handleAddReceiptItem = () => {
    const firstId = allProducts[0]?.id || 'prod-1';
    setReceiptItems([
      ...receiptItems,
      { productId: firstId, unitId: entryUnitFor(firstId), quantity: 100 }
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
        // Mapped products are always received in PCS, regardless of stale state.
        unitId: entryUnitFor(item.productId),
        quantity: Number(item.quantity),
        // No price entry here by design — selling price lives on Products.
        unitCost: 0
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
      unitId: entryUnitFor(adjustProductId),
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
        title={t('companyInventory.title')}
        subtitle={t('companyInventory.subtitle')}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => setIsAdjustModalOpen(true)}>
              <SlidersHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
              <span>{t('companyInventory.adjust')}</span>
            </Button>
            <Button variant="primary" size="md" onClick={handleOpenReceipt}>
              <Plus className="w-3.5 h-3.5" />
              <span>{t('companyInventory.receive')}</span>
            </Button>
          </>
        }
      />

      {/* Tabs */}
      <Tabs
        ariaLabel={t('companyInventory.tabsLabel')}
        activeId={activeTab}
        onSelect={(id) => setActiveTab(id as 'balances' | 'movements' | 'receipts')}
        tabs={[
          { id: 'balances', label: t('companyInventory.tabBalances'), count: allProducts.length },
          { id: 'movements', label: t('companyInventory.tabMovements'), count: movementsList.length },
          { id: 'receipts', label: t('companyInventory.tabReceipts'), count: Object.keys(stockReceipts).length },
        ]}
      />

      {/* Tab 1: Current Stock Balances */}
      {activeTab === 'balances' && (
        <TableShell>
          <CardHeader>
            <SearchInput
              icon={<Search className="w-3.5 h-3.5" />}
              type="text"
              placeholder={t('companyInventory.filterPh')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-56"
            />
            <span className="text-[11px] font-mono text-muted-foreground">
              {t('companyInventory.rule13')}
            </span>
          </CardHeader>

          <div className="overflow-x-auto">
            <Table className="text-left border-collapse">
            <caption className="sr-only">{t('companyInventory.balancesCaption')}</caption>
            <THead>
              <TR className="hover:bg-transparent">
                <TH scope="col">{t('companyInventory.thProduct')}</TH>
                  <TH scope="col">{t('companyInventory.thSku')}</TH>
                  <TH scope="col">{t('companyInventory.thUom')}</TH>
                  <TH scope="col" className="text-right">{t('companyInventory.thStock')}</TH>
                  <TH scope="col" className="text-center">{t('companyInventory.thStatus')}</TH>
              </TR>
            </THead>
            <TBody>
                {filteredProducts.map((prod) => {
                  const stock = getCurrentCompanyStock(prod.id);
                  const uom = uoms[prod.primary_unit_id];
                  const isLow = stock < 50;
                  // Piece-mapped products lead with PCS (weight as reference).
                  const piecePcs = (() => {
                    const mapping = getPieceWeightMapping(prod.id);
                    if (!mapping) return null;
                    const pus = Object.values(productUnits).filter((pu) => pu.product_id === prod.id);
                    return toPcsDisplayQty(mapping, stock, prod.primary_unit_id, pus);
                  })();

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
                        {piecePcs !== null ? (
                          <>
                            <span className={stock > 0 ? 'text-foreground' : 'text-destructive'}>
                              {piecePcs.toLocaleString()} PCS
                            </span>{' '}
                            <span className="text-[11px] font-normal text-muted-foreground">
                              (≈ {stock.toLocaleString()} {uom?.code})
                            </span>
                          </>
                        ) : (
                          <>
                            <span className={stock > 0 ? 'text-foreground' : 'text-destructive'}>
                              {stock.toLocaleString()}
                            </span>{' '}
                            <span className="text-xs font-normal text-muted-foreground">{uom?.code}</span>
                          </>
                        )}
                      </TD>
                      <TD className="text-center">
                        <Badge variant={stock > 0 ? (isLow ? 'warning' : 'success') : 'danger'}>
                          {stock > 0 ? (isLow ? t('companyInventory.lowStock') : t('companyInventory.inStock')) : t('companyInventory.depleted')}
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
              <caption className="sr-only">{t('companyInventory.movementsCaption')}</caption>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH scope="col">{t('companyInventory.thDate')}</TH>
                  <TH scope="col">{t('companyInventory.thProduct')}</TH>
                  <TH scope="col">{t('companyInventory.thMovement')}</TH>
                  <TH scope="col" className="text-right">{t('companyInventory.thQty')}</TH>
                  <TH scope="col">{t('companyInventory.thRef')}</TH>
                  <TH scope="col">{t('companyInventory.thAuditBy')}</TH>
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
                        {prod?.product_name || t('dashboard.itemFallback')}
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
                          <span className="text-[10px] font-mono text-muted-foreground">{t('companyInventory.refLabel', { ref: mov.reference_id })}</span>
                          {mov.movement_type === 'CUSTOMER_DISPATCH' && (
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => {
                                const cim = customerInventoryMovements[mov.reference_id];
                                setSelectedChallanRef(cim?.reference_id || mov.reference_id);
                              }}
                              title={t('companyInventory.challanTitle')}
                              className="px-2 py-0.5 text-[10px] shadow-2xs"
                            >
                              <Printer className="w-3 h-3" />
                              <span>{t('companyInventory.challan')}</span>
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
                    <span className="text-muted-foreground">{t('companyInventory.receiptRef', { ref: sr.reference_number || t('common.na') })}</span>
                  </div>
                  <div className="text-foreground font-medium mt-1">{t('companyInventory.supplierLine', { name: sr.supplier_name })}</div>
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
        title={t('companyInventory.receiptTitle')}
        subtitle={t('companyInventory.receiptSubtitle')}
        maxWidth="2xl"
      >
        <form onSubmit={handleSaveReceipt} className="space-y-4 text-xs">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Label className="mb-1">{t('companyInventory.supplier')}</Label>
              <Input
                type="text"
                required
                value={receiptSupplier}
                onChange={(e) => setReceiptSupplier(e.target.value)}
                className="w-full"
                placeholder={t('companyInventory.supplierPh')}
              />
            </div>

            <div>
              <Label className="mb-1">{t('companyInventory.receiptDate')}</Label>
              <Input
                type="date"
                required
                value={receiptDate}
                onChange={(e) => setReceiptDate(e.target.value)}
                className="w-full font-mono"
              />
            </div>

            <div>
              <Label className="mb-1">{t('companyInventory.poRef')}</Label>
              <Input
                type="text"
                value={receiptRef}
                onChange={(e) => setReceiptRef(e.target.value)}
                className="w-full font-mono"
              />
            </div>

            <div className="col-span-2">
              <Label className="mb-1">{t('companyInventory.notes')}</Label>
              <Input
                type="text"
                value={receiptNotes}
                onChange={(e) => setReceiptNotes(e.target.value)}
                className="w-full"
                placeholder={t('companyInventory.notesPh')}
              />
            </div>
          </div>

          {/* Items */}
          <div className="border-t border-border pt-3">
            <div className="flex justify-between items-center mb-2">
              <span className="font-semibold text-foreground uppercase tracking-wide text-[11px]">
                {t('companyInventory.itemsTitle')}
              </span>
              <Button type="button" variant="secondary" size="sm" onClick={handleAddReceiptItem} className="text-[11px] px-2 py-1">
                {t('companyInventory.addItem')}
              </Button>
            </div>

            <div className="space-y-2">
              {receiptItems.map((item, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-12 gap-2 items-center p-2.5 bg-muted border border-border rounded-md"
                >
                  <div className="col-span-6">
                    <label className="block text-[10px] text-muted-foreground mb-0.5">{t('companyInventory.itemProduct')}</label>
                    <Select
                      value={item.productId}
                      onChange={(e) => {
                        const updated = [...receiptItems];
                        updated[idx].productId = e.target.value;
                        updated[idx].unitId = entryUnitFor(e.target.value);
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

                  <div className="col-span-5">
                    <label className="block text-[10px] text-muted-foreground mb-0.5">
                      {t('companyInventory.itemQty')}
                      {(() => {
                        const m = getPieceWeightMapping(item.productId);
                        return m ? ` (${uoms[m.pcsUnitId]?.code ?? 'PCS'})` : '';
                      })()}
                    </label>
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
                    {(() => {
                      const pv = piecePreviewFor(item.productId, Number(item.quantity));
                      return pv ? (
                        <div className="text-[10px] font-mono font-semibold text-emerald-800 dark:text-emerald-300 mt-0.5">
                          {t('customerInventory.pieceWeightPreview', { pcs: Number(item.quantity), grams: pv.grams, kg: pv.kg })}
                        </div>
                      ) : null;
                    })()}
                  </div>

                  <div className="col-span-1 pt-4 text-center">
                    {receiptItems.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveReceiptItem(idx)}
                        title={t('companyInventory.removeLine')}
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
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="primary" size="sm">
              {t('companyInventory.confirmReceipt')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Audit Adjustment Modal */}
      <Modal
        isOpen={isAdjustModalOpen}
        onClose={() => setIsAdjustModalOpen(false)}
        title={t('companyInventory.adjustTitle')}
        subtitle={t('companyInventory.adjustSubtitle')}
        maxWidth="md"
      >
        <form onSubmit={handleSaveAdjust} className="space-y-4 text-xs">
          {adjustError && (
            <Alert tone="destructive">
              {adjustError}
            </Alert>
          )}

          <div>
            <Label className="mb-1">{t('companyInventory.adjProduct')}</Label>
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
            <Label className="mb-1">{t('companyInventory.adjDirection')}</Label>
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
                {t('companyInventory.adjIn')}
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
                {t('companyInventory.adjOut')}
              </label>
            </div>
          </div>

          <div>
            <Label className="mb-1">
              {t('companyInventory.adjQty')}
              {(() => {
                const m = getPieceWeightMapping(adjustProductId);
                return m ? ` (${uoms[m.pcsUnitId]?.code ?? 'PCS'})` : '';
              })()}
            </Label>
            <Input
              type="number"
              min="1"
              required
              value={adjustQuantity}
              onChange={(e) => setAdjustQuantity(Number(e.target.value))}
              className="w-full font-mono"
            />
            {(() => {
              const pv = piecePreviewFor(adjustProductId, Number(adjustQuantity));
              return pv ? (
                <div className="text-[10px] font-mono font-semibold text-emerald-800 dark:text-emerald-300 mt-0.5">
                  {t('customerInventory.pieceWeightPreview', { pcs: Number(adjustQuantity), grams: pv.grams, kg: pv.kg })}
                </div>
              ) : null;
            })()}
          </div>

          <div>
            <Label className="mb-1">{t('companyInventory.adjReason')}</Label>
            <Input
              type="text"
              required
              value={adjustNotes}
              onChange={(e) => setAdjustNotes(e.target.value)}
              className="w-full"
              placeholder={t('companyInventory.adjReasonPh')}
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button type="button" variant="secondary" size="sm" onClick={() => setIsAdjustModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="primary" size="sm">
              {t('companyInventory.postAdjust')}
            </Button>
          </div>
        </form>
      </Modal>
      {/* Global Delivery Challan Print & Preview Modal */}
      {selectedChallanRef && (
        <Modal
          isOpen={Boolean(selectedChallanRef)}
          onClose={() => setSelectedChallanRef(null)}
          title={t('companyInventory.challanModalTitle', { ref: selectedChallanRef })}
          subtitle={t('companyInventory.challanModalSubtitle')}
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
