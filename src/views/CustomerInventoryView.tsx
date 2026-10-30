import React, { useState, useEffect } from 'react';
import { useAccountingStore } from '../store/accountingStore';
import { getMovementBillingStatus, roundCurrency, convertQuantity, toDisplayWeight, formatINR } from '../utils/calculations';
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
import { useT } from '../i18n';
import type { CustomerInventoryMovement } from '../types/database';

export interface ChallanOption {
  referenceId: string;
  movementDate: string;
  totalQuantity: number;
  unitId: string;
}

// Dispatch challans for one customer + product, newest first, multi-row
// challans merged into a single option (same reference = one document).
export function groupDispatchChallans(
  movements: CustomerInventoryMovement[],
  customerId: string,
  productId: string
): ChallanOption[] {
  const byRef = new Map<string, ChallanOption>();
  for (const m of movements) {
    if (m.customer_id !== customerId || m.product_id !== productId) continue;
    if (m.movement_type !== 'DISPATCH' && m.movement_type !== 'ADJUSTMENT_IN') continue;
    const existing = byRef.get(m.reference_id);
    if (existing) {
      existing.totalQuantity = roundCurrency(existing.totalQuantity + m.quantity);
      if (m.movement_date < existing.movementDate) existing.movementDate = m.movement_date;
    } else {
      byRef.set(m.reference_id, {
        referenceId: m.reference_id,
        movementDate: m.movement_date,
        totalQuantity: m.quantity,
        unitId: m.unit_id,
      });
    }
  }
  return [...byRef.values()].sort((a, b) => b.movementDate.localeCompare(a.movementDate));
}

interface CustomerInventoryViewProps {
  onOpenBillingForCustomer?: (customerId: string) => void;
}

export const CustomerInventoryView: React.FC<CustomerInventoryViewProps> = ({
  onOpenBillingForCustomer
}) => {
  const { t } = useT();
  const {
    customers,
    products,
    uoms,
    productUnits,
    customerInventoryMovements,
    dispatchDocuments,
    invoices,
    invoiceAllocations,
    dispatchBatchInventoryToCustomer,
    returnBatchFromCustomer,
    getCustomerDeliveredRates,
    getCustomerProductInventory,
    suggestNextDocumentNumber,
    getCustomerInventorySummary,
    getCurrentCompanyStock,
    getPieceWeightMapping
  } = useAccountingStore();

  const [activeTab, setActiveTab] = useState<'holdings' | 'movements'>('holdings');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('cust-1');
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [selectedChallanRef, setSelectedChallanRef] = useState<string | null>(null);
  const [printDirection, setPrintDirection] = useState<'dispatch' | 'return'>('dispatch');

  const openPrint = (referenceId: string, direction: 'dispatch' | 'return') => {
    setPrintDirection(direction);
    setSelectedChallanRef(referenceId);
  };
  const closePrint = () => {
    setSelectedChallanRef(null);
    setPrintDirection('dispatch');
  };

  // Holdings table pagination (reset when switching customer site).
  const [holdingsPage, setHoldingsPage] = useState(1);
  const [holdingsPageSize, setHoldingsPageSize] = useState(10);
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

  // Return Form State — multi-item, mirroring the dispatch form. Each line
  // tracks the product (restricted to what the customer holds) and the
  // taken-back rate: either a previously delivered price (dropdown) or a
  // custom on-the-spot entry.
  interface ReturnLine {
    productId: string;
    unitId: string;
    quantity: number;
    rateChoice: string; // numeric string of a delivered rate, or 'custom'
    customRate: string; // raw custom-entry input value
  }
  const emptyReturnLine = (): ReturnLine => ({
    productId: '',
    unitId: 'uom-pcs',
    quantity: 1,
    rateChoice: '',
    customRate: ''
  });
  const [returnForm, setReturnForm] = useState<{
    customerId: string;
    referenceId: string;
    items: ReturnLine[];
  }>({ customerId: 'cust-1', referenceId: '', items: [emptyReturnLine()] });

  // Fall back to the first real customer when a stored id is gone
  // (e.g. seed-only 'cust-1' in a live database) so pickers never sit empty.
  const effectiveCustomerId = firstCustomerId(customers, selectedCustomerId);
  const effectiveDispatchCustomerId = firstCustomerId(customers, dispatchForm.customerId);
  const effectiveReturnCustomerId = firstCustomerId(customers, returnForm.customerId);

  useEffect(() => {
    setHoldingsPage(1);
  }, [effectiveCustomerId]);

  const allProducts = Object.values(products);

  // Piece-weight entry: mapped products (GRAM primary + PCS mapping) are ALWAYS
  // entered in PCS — the counter never types weight. Weight derives via
  // convertQuantity; the store validates stock in primary units either way.
  const entryUnitFor = (productId: string): string => {
    const p = products[productId];
    if (!p) return 'uom-pcs';
    return getPieceWeightMapping(productId)?.pcsUnitId ?? p.primary_unit_id;
  };

  // Derived weight preview for a mapped product line, or null.
  // Grams are exact (pieces × grams-per-piece); KG goes through the
  // 2-decimal conversion, matching billing exactly.
  const piecePreviewFor = (
    productId: string,
    quantity: number
  ): { grams: number; kg: number } | null => {
    if (!Number.isFinite(quantity) || quantity <= 0) return null;
    const mapping = getPieceWeightMapping(productId);
    const p = products[productId];
    if (!mapping || !p) return null;
    const pus = Object.values(productUnits).filter((pu) => pu.product_id === productId);
    return {
      grams: roundCurrency(quantity * mapping.gramsPerPiece),
      kg: convertQuantity(quantity, mapping.pcsUnitId, mapping.kgUnitId, pus)
    };
  };

  // Challan-wise holdings: one card per dispatch challan (document header,
  // newest first; legacy rows without a header group by challan reference).
  interface ChallanCardLine {
    movementId: string;
    referenceId: string;
    productId: string;
    unitId: string;
    productName: string;
    sku: string;
    quantity: number;
    unitCode: string;
    grams: number | null;
    allocated: number;
    remaining: number;
    billedGrams: number | null;
    remainingGrams: number | null;
    status: 'BILLED' | 'PARTIAL' | 'UNBILLED';
  }
  interface ChallanCard {
    key: string;
    number: string;
    date: string;
    lines: ChallanCardLine[];
    totalQty: number;
    totalWeightGrams: number;
    status: 'BILLED' | 'PARTIAL' | 'UNBILLED';
  }
  const allocForMovement = (movementId: string): number =>
    roundCurrency(
      Object.values(invoiceAllocations)
        .filter(
          (a) =>
            a.customer_inventory_movement_id === movementId &&
            invoices[a.invoice_id]?.status !== 'CANCELLED'
        )
        .reduce((sum, a) => sum + a.allocated_quantity, 0)
    );
  const challanCards: ChallanCard[] = (() => {
    const toLine = (m: (typeof dispatchMovs)[number]): ChallanCardLine => {
      const prod = products[m.product_id];
      const mapping = getPieceWeightMapping(m.product_id);
      const gpp =
        mapping && m.unit_id === mapping.pcsUnitId ? mapping.gramsPerPiece : null;
      const grams = gpp !== null ? roundCurrency(m.quantity * gpp) : null;
      const allocated = allocForMovement(m.id);
      const remaining = Math.max(0, roundCurrency(m.quantity - allocated));
      return {
        movementId: m.id,
        referenceId: m.reference_id,
        productId: m.product_id,
        unitId: m.unit_id,
        productName: prod?.product_name || t('dashboard.itemFallback'),
        sku: prod?.sku || '',
        quantity: m.quantity,
        unitCode: uoms[m.unit_id]?.code || 'PCS',
        grams,
        allocated,
        remaining,
        billedGrams: gpp !== null ? roundCurrency(allocated * gpp) : null,
        remainingGrams: gpp !== null ? roundCurrency(remaining * gpp) : null,
        status: getMovementBillingStatus(m.quantity, allocated)
      };
    };
    const finishGroup = (key: string, number: string, date: string, lines: ChallanCardLine[]): ChallanCard => {
      let totalQty = 0;
      let totalWeightGrams = 0;
      let anyAlloc = false;
      let allBilled = lines.length > 0;
      for (const l of lines) {
        totalQty = roundCurrency(totalQty + l.quantity);
        if (l.grams !== null) totalWeightGrams = roundCurrency(totalWeightGrams + l.grams);
        if (l.allocated > 0) anyAlloc = true;
        if (l.status !== 'BILLED') allBilled = false;
      }
      return {
        key,
        number,
        date,
        lines,
        totalQty,
        totalWeightGrams,
        status: allBilled ? 'BILLED' : anyAlloc ? 'PARTIAL' : 'UNBILLED'
      };
    };
    const dispatchMovs = Object.values(customerInventoryMovements)
      .filter((m) => m.customer_id === effectiveCustomerId && m.movement_type === 'DISPATCH');
    const groups: ChallanCard[] = Object.values(dispatchDocuments)
      .filter((h) => h.customer_id === effectiveCustomerId && h.document_type === 'DISPATCH')
      .sort((a, b) => new Date(b.document_date).getTime() - new Date(a.document_date).getTime())
      .map((h) => {
        const lines = dispatchMovs
          .filter((m) => m.document_id === h.id)
          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
          .map(toLine);
        return finishGroup(h.id, h.document_number, h.document_date, lines);
      })
      .filter((g) => g.lines.length > 0);
    const orphaned = dispatchMovs.filter((m) => !m.document_id);
    const byRef: Record<string, typeof dispatchMovs> = {};
    for (const m of orphaned) {
      if (!byRef[m.reference_id]) byRef[m.reference_id] = [];
      byRef[m.reference_id].push(m);
    }
    for (const [ref, ms] of Object.entries(byRef)) {
      ms.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      groups.push(finishGroup(`legacy-${ref}`, ref, ms[0].movement_date, ms.map(toLine)));
    }
    groups.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return groups;
  })();

  // Return slips: one card per RETURN document (document header, newest
  // first; legacy rows without a header group by return reference). Returns
  // carry no billing state — they only reduce what the customer holds.
  interface ReturnCardLine {
    movementId: string;
    referenceId: string;
    productName: string;
    sku: string;
    quantity: number;
    unitCode: string;
    grams: number | null;
  }
  interface ReturnCard {
    key: string;
    number: string;
    date: string;
    lines: ReturnCardLine[];
    totalQty: number;
    totalWeightGrams: number;
  }
  const returnCards: ReturnCard[] = (() => {
    const toLine = (m: {
      id: string;
      reference_id: string;
      product_id: string;
      unit_id: string;
      quantity: number;
    }): ReturnCardLine => {
      const prod = products[m.product_id];
      const mapping = getPieceWeightMapping(m.product_id);
      const grams =
        mapping && m.unit_id === mapping.pcsUnitId
          ? roundCurrency(m.quantity * mapping.gramsPerPiece)
          : null;
      return {
        movementId: m.id,
        referenceId: m.reference_id,
        productName: prod?.product_name || t('dashboard.itemFallback'),
        sku: prod?.sku || '',
        quantity: m.quantity,
        unitCode: uoms[m.unit_id]?.code || 'PCS',
        grams
      };
    };
    const finishGroup = (key: string, number: string, date: string, lines: ReturnCardLine[]): ReturnCard => {
      let totalQty = 0;
      let totalWeightGrams = 0;
      for (const l of lines) {
        totalQty = roundCurrency(totalQty + l.quantity);
        if (l.grams !== null) totalWeightGrams = roundCurrency(totalWeightGrams + l.grams);
      }
      return { key, number, date, lines, totalQty, totalWeightGrams };
    };
    const returnMovs = Object.values(customerInventoryMovements).filter(
      (m) => m.customer_id === effectiveCustomerId && m.movement_type === 'RETURN'
    );
    const groups: ReturnCard[] = Object.values(dispatchDocuments)
      .filter((h) => h.customer_id === effectiveCustomerId && h.document_type === 'RETURN')
      .sort((a, b) => new Date(b.document_date).getTime() - new Date(a.document_date).getTime())
      .map((h) => {
        const lines = returnMovs
          .filter((m) => m.document_id === h.id)
          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
          .map(toLine);
        return finishGroup(h.id, h.document_number, h.document_date, lines);
      })
      .filter((g) => g.lines.length > 0);
    const orphaned = returnMovs.filter((m) => !m.document_id);
    const byRef: Record<string, typeof returnMovs> = {};
    for (const m of orphaned) {
      if (!byRef[m.reference_id]) byRef[m.reference_id] = [];
      byRef[m.reference_id].push(m);
    }
    for (const [ref, ms] of Object.entries(byRef)) {
      ms.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      groups.push(finishGroup(`legacy-${ref}`, ref, ms[0].movement_date, ms.map(toLine)));
    }
    groups.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return groups;
  })();

  // One interleaved list: dispatch challans + return slips, newest first.
  const movementCards: Array<
    { kind: 'dispatch'; card: ChallanCard } | { kind: 'return'; card: ReturnCard }
  > = [
    ...challanCards.map((card) => ({ kind: 'dispatch' as const, card })),
    ...returnCards.map((card) => ({ kind: 'return' as const, card })),
  ].sort((a, b) => new Date(b.card.date).getTime() - new Date(a.card.date).getTime());

  // Per-product unbilled balances (same source as holdings/billing): Return
  // buttons are offered only where unbilled stock actually exists, so the UI
  // never offers what the store will refuse.
  const holdingsPageCount = Math.max(1, Math.ceil(movementCards.length / holdingsPageSize));
  const holdingsSafePage = Math.min(Math.max(1, holdingsPage), holdingsPageCount);
  const pagedDocs = movementCards.slice(
    (holdingsSafePage - 1) * holdingsPageSize,
    holdingsSafePage * holdingsPageSize
  );

  // Products a customer currently HOLDS (delivered − returned), regardless of
  // billing status — everything held is returnable.
  const heldProductsFor = (customerId: string) => {
    const list: Array<{ productId: string; productName: string; held: number; unitCode: string }> = [];
    for (const s of getCustomerInventorySummary(customerId)) {
      const held = s.currentBalance;
      if (held > 0) list.push({ productId: s.productId, productName: s.productName, held, unitCode: s.unitCode });
    }
    return list;
  };
  const heldProducts = heldProductsFor(effectiveCustomerId);
  const hasAnyHeld = heldProducts.length > 0;
  // Held list for the customer currently chosen inside the return modal.
  const returnHeldProducts = heldProductsFor(effectiveReturnCustomerId);
  const hasAnyHeldProducts = returnHeldProducts.length > 0;

  // Total return credit across all open lines (rate × quantity per line).
  const totalReturnCredit = roundCurrency(
    returnForm.items.reduce((sum, it) => {
      const r = it.rateChoice === 'custom' ? Number(it.customRate) : Number(it.rateChoice);
      return Number.isFinite(r) && r > 0 ? sum + r * Number(it.quantity) : sum;
    }, 0)
  );

  const allCustomerMovements = Object.values(customerInventoryMovements)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const handleOpenDispatch = (cId?: string, pId?: string) => {
    setOperationError('');
    const targetProd = pId ? products[pId] : allProducts[0];
    const targetCustomer = cId || effectiveCustomerId;
    const targetProdId = targetProd?.id || 'prod-1';
    setDispatchForm({
      customerId: targetCustomer,
      referenceId: suggestNextDocumentNumber(targetCustomer, 'DISPATCH'),
      items: [
        {
          productId: targetProdId,
          unitId: entryUnitFor(targetProdId),
          quantity: 50
        }
      ]
    });
    setIsDispatchModalOpen(true);
  };

  const handleAddDispatchItem = () => {
    // Default the new line to the first product not already picked in
    // another line, so the fresh row never starts as a duplicate.
    const takenIds = new Set(dispatchForm.items.map((it) => it.productId));
    const defaultProd = allProducts.find((p) => !takenIds.has(p.id)) ?? allProducts[0];
    const defaultProdId = defaultProd?.id || 'prod-1';
    setDispatchForm({
      ...dispatchForm,
      items: [
        ...dispatchForm.items,
        {
          productId: defaultProdId,
          unitId: entryUnitFor(defaultProdId),
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

  const handleOpenReturn = (cId?: string) => {
    setOperationError('');
    const targetCustomer = cId || effectiveCustomerId;
    setReturnForm({
      customerId: targetCustomer,
      referenceId: suggestNextDocumentNumber(targetCustomer, 'RETURN'),
      items: [initialReturnLineFor(targetCustomer)]
    });
    setIsReturnModalOpen(true);
  };

  // First held product for a customer ('' when nothing is held) — the return
  // form's default first line.
  const firstHeldProductFor = (customerId: string): string => {
    for (const s of getCustomerInventorySummary(customerId)) {
      if (s.currentBalance > 0) return s.productId;
    }
    return '';
  };

  const initialReturnLineFor = (customerId: string): ReturnLine => {
    const line = emptyReturnLine();
    line.productId = firstHeldProductFor(customerId);
    line.unitId = line.productId ? entryUnitFor(line.productId) : 'uom-pcs';
    line.rateChoice = line.productId
      ? defaultRateChoiceFor(customerId, line.productId)
      : '';
    return line;
  };

  // Default rate choice = the last (highest) previously delivered rate; ''
  // when nothing was ever delivered/priced, forcing custom entry.
  const defaultRateChoiceFor = (customerId: string, productId: string): string => {
    const rates = getCustomerDeliveredRates(customerId, productId);
    return rates.length > 0 ? String(rates[rates.length - 1]) : '';
  };

  const handleAddReturnItem = () => {
    setReturnForm({ ...returnForm, items: [...returnForm.items, emptyReturnLine()] });
  };

  // Products already picked in one challan line disappear from every other
  // line's dropdown (own row keeps its selection). Uniqueness is therefore
  // enforced by the option lists themselves.
  const dispatchTakenIds = new Set(dispatchForm.items.map((it) => it.productId));
  const canAddDispatchItem = allProducts.some((p) => !dispatchTakenIds.has(p.id));
  const returnTakenIds = new Set(returnForm.items.map((it) => it.productId));
  const canAddReturnItem = returnHeldProducts.some((h) => !returnTakenIds.has(h.productId));

  const handleRemoveReturnItem = (index: number) => {
    if (returnForm.items.length <= 1) return;
    setReturnForm({ ...returnForm, items: returnForm.items.filter((_, idx) => idx !== index) });
  };

  const handleConfirmDispatch = (e: React.FormEvent) => {
    e.preventDefault();
    setOperationError('');

    if (dispatchForm.items.length === 0) {
      setOperationError(t('customerInventory.errNoItems'));
      return;
    }

    const res = dispatchBatchInventoryToCustomer({
      customerId: effectiveDispatchCustomerId,
      referenceId: dispatchForm.referenceId.trim(),
      items: dispatchForm.items.map((it) => ({
        productId: it.productId,
        // Mapped products always move in PCS, regardless of stale form state.
        unitId: entryUnitFor(it.productId),
        quantity: Number(it.quantity)
      }))
    });

    if (!res.success) {
      setOperationError(res.error || 'Dispatch failed');
    } else {
      setIsDispatchModalOpen(false);
      // Immediately open generated Delivery Challan for print & preview
      if (res.referenceId) {
        openPrint(res.referenceId, 'dispatch');
      }
    }
  };

  const handleConfirmReturn = (e: React.FormEvent) => {
    e.preventDefault();
    setOperationError('');

    if (returnForm.items.length === 0) {
      setOperationError(t('customerInventory.errNoReturnItems'));
      return;
    }

    const res = returnBatchFromCustomer({
      customerId: effectiveReturnCustomerId,
      referenceId: returnForm.referenceId.trim(),
      items: returnForm.items.map((it) => ({
        productId: it.productId,
        unitId: entryUnitFor(it.productId),
        quantity: Number(it.quantity),
        rate: it.rateChoice === 'custom' ? Number(it.customRate) : Number(it.rateChoice)
      }))
    });

    if (!res.success) {
      setOperationError(res.error || 'Return failed');
    } else {
      setIsReturnModalOpen(false);
      // Immediately open the generated Return Slip challan for print & preview
      if (res.referenceId) {
        openPrint(res.referenceId, 'return');
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <PageHeader
        title={t('customerInventory.title')}
        subtitle={t('customerInventory.subtitle')}
      />

      {/* Tabs */}
      <Tabs
        ariaLabel={t('customerInventory.tabsLabel')}
        activeId={activeTab}
        onSelect={(id) => setActiveTab(id as 'holdings' | 'movements')}
        tabs={[
          { id: 'holdings', label: t('customerInventory.tabHoldings') },
          { id: 'movements', label: t('customerInventory.tabMovements'), count: allCustomerMovements.length },
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
                {t('customerInventory.selectSite')}
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
                variant="secondary"
                size="sm"
                onClick={() => handleOpenReturn(effectiveCustomerId)}
                disabled={!hasAnyHeld}
                title={hasAnyHeld ? t('customerInventory.returnTitle') : t('customerInventory.nothingHeldTitle')}
              >
                <RotateCcw className="w-3.5 h-3.5 text-muted-foreground" />
                <span>{t('customerInventory.recordReturn')}</span>
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleOpenDispatch(effectiveCustomerId)}
                title={t('customerInventory.newDispatchTitle')}
              >
                <Truck className="w-3.5 h-3.5" />
                <span>{t('customerInventory.newDispatch')}</span>
              </Button>
              {onOpenBillingForCustomer && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => onOpenBillingForCustomer(effectiveCustomerId)}
                >
                  <FileCheck className="w-3.5 h-3.5" />
                  <span>{t('customerInventory.genInvoice')}</span>
                </Button>
              )}
            </div>
          </Card>

          {/* Holdings Breakdown Table */}
          <TableShell>
            <CardHeader>
              <div className="font-semibold text-foreground text-xs">
                {t('customerInventory.heldAt', { name: customers[effectiveCustomerId]?.customer_name ?? '' })}
              </div>
            </CardHeader>

            <div className="overflow-x-auto">
              <Table className="text-left border-collapse">
                <caption className="sr-only">{t('customerInventory.holdingsCaption')}</caption>
                <THead>
                  <TR className="hover:bg-transparent">
                    <TH scope="col">{t('customerInventory.thDocNo')}</TH>
                    <TH scope="col">{t('customerInventory.thDocType')}</TH>
                    <TH scope="col">{t('customerInventory.thProducts')}</TH>
                    <TH scope="col" className="text-right">{t('customerInventory.thBilledCol')}</TH>
                    <TH scope="col" className="text-right">{t('customerInventory.thUnbilledCol')}</TH>
                    <TH scope="col">{t('customerInventory.thStatus')}</TH>
                    <TH scope="col" className="text-right px-4">{t('customerInventory.thQuick')}</TH>
                  </TR>
                </THead>
                <TBody>
                  {movementCards.length === 0 ? (
                    <tr>
                      <TD colSpan={7} className="py-8 text-center text-muted-foreground">
                        {t('customerInventory.empty')}
                      </TD>
                    </tr>
                  ) : (
                    pagedDocs.map((mc) => {
                  if (mc.kind === 'return') {
                    const rc = mc.card;
                    return (
                      <TR key={rc.key}>
                        <TD>
                          <div className="font-mono font-bold text-foreground">
                            {t('customerInventory.returnSlipNo', { ref: rc.number })}
                          </div>
                          <div className="text-[11px] font-mono text-muted-foreground">
                            {new Date(rc.date).toLocaleDateString()}
                          </div>
                        </TD>
                        <TD>
                          <Badge variant="neutral">{t('customerInventory.returnSlip')}</Badge>
                        </TD>
                        <TD>
                          {rc.lines.map((l) => {
                            const w = l.grams !== null ? toDisplayWeight(l.grams) : null;
                            return (
                              <div key={l.movementId} className="py-0.5">
                                <span className="font-semibold">{l.productName}</span>{' '}
                                <span className="font-mono text-[11px]">
                                  {l.quantity} {l.unitCode}
                                </span>
                                {w && (
                                  <span className="font-mono text-[11px] text-muted-foreground">
                                    {' '}(= {w.qty} {w.unit})
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </TD>
                        <TD className="text-center text-muted-foreground">—</TD>
                        <TD className="text-center text-muted-foreground">—</TD>
                        <TD className="text-center text-muted-foreground">—</TD>
                        <TD className="text-right">
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => openPrint(rc.lines[0]?.referenceId || rc.number, 'return')}
                            title={t('customerInventory.printChallanTitle')}
                            className="text-[11px] shadow-2xs"
                          >
                            <Printer className="w-3.5 h-3.5 text-primary-foreground" />
                            <span>{t('customerInventory.printChallan')}</span>
                          </Button>
                        </TD>
                      </TR>
                    );
                  }
                  const ch = mc.card;
                  return (
                    <TR key={ch.key}>
                      <TD>
                        <div className="font-mono font-bold text-foreground">
                          {t('printBar.challanNo', { ref: ch.number })}
                        </div>
                        <div className="text-[11px] font-mono text-muted-foreground">
                          {new Date(ch.date).toLocaleDateString()}
                        </div>
                      </TD>
                      <TD>
                        <Badge variant="info">{t('customerInventory.docDelivery')}</Badge>
                      </TD>
                      <TD>
                        {ch.lines.map((l) => {
                          const w = l.grams !== null ? toDisplayWeight(l.grams) : null;
                          return (
                            <div key={l.movementId} className="py-0.5">
                              <span className="font-semibold">{l.productName}</span>{' '}
                              <span className="font-mono text-[11px]">
                                {l.quantity} {l.unitCode}
                              </span>
                              {w && (
                                <span className="font-mono text-[11px] text-muted-foreground">
                                  {' '}(= {w.qty} {w.unit})
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </TD>
                      <TD className="text-right font-mono">
                        {ch.lines.map((l) => {
                          const bw =
                            l.billedGrams !== null && l.billedGrams > 0
                              ? toDisplayWeight(l.billedGrams)
                              : null;
                          return (
                            <div key={l.movementId} className="py-0.5 text-emerald-800 dark:text-emerald-300">
                              {l.allocated} {l.unitCode}
                              {bw && (
                                <span className="text-[11px]"> (= {bw.qty} {bw.unit})</span>
                              )}
                            </div>
                          );
                        })}
                      </TD>
                      <TD className="text-right font-mono">
                        {ch.lines.map((l) => {
                          const rw =
                            l.remainingGrams !== null && l.remainingGrams > 0
                              ? toDisplayWeight(l.remainingGrams)
                              : null;
                          return (
                            <div key={l.movementId} className="py-0.5 font-bold text-amber-900 dark:text-amber-200">
                              {l.remaining} {l.unitCode}
                              {rw && (
                                <span className="font-normal text-[11px]"> (= {rw.qty} {rw.unit})</span>
                              )}
                            </div>
                          );
                        })}
                      </TD>
                      <TD>
                        {ch.status === 'BILLED' ? (
                          <Badge variant="success">{t('customerInventory.billed')}</Badge>
                        ) : ch.status === 'PARTIAL' ? (
                          <Badge variant="warning">{t('customerInventory.partial')}</Badge>
                        ) : (
                          <Badge variant="neutral">{t('customerInventory.unbilled')}</Badge>
                        )}
                      </TD>
                      <TD className="text-right">
                        <div className="flex justify-end items-center gap-1.5">
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => openPrint(ch.lines[0]?.referenceId || ch.number, 'dispatch')}
                            title={t('customerInventory.printChallanTitle')}
                            className="text-[11px] shadow-2xs"
                          >
                            <Printer className="w-3.5 h-3.5 text-primary-foreground" />
                            <span>{t('customerInventory.printChallan')}</span>
                          </Button>
                          {onOpenBillingForCustomer && ch.status !== 'BILLED' && (
                            <Button
                              variant="success"
                              size="sm"
                              onClick={() => onOpenBillingForCustomer(effectiveCustomerId)}
                              title={t('customerInventory.billTitle2')}
                              className="text-[11px] px-2 py-1"
                            >
                              {t('customerInventory.bill')}
                            </Button>
                          )}
                        </div>
                      </TD>
                    </TR>
                  );
                }))}
                </TBody>
              </Table>
            </div>
            {movementCards.length > 0 && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-t border-border">
                <span className="text-[11px] font-mono text-muted-foreground">
                  {t('customerInventory.pgOf', { page: holdingsSafePage, pages: holdingsPageCount })}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setHoldingsPage(holdingsSafePage - 1)}
                    disabled={holdingsSafePage <= 1}
                  >
                    {t('customerInventory.pgPrev')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setHoldingsPage(holdingsSafePage + 1)}
                    disabled={holdingsSafePage >= holdingsPageCount}
                  >
                    {t('customerInventory.pgNext')}
                  </Button>
                  <Select
                    value={holdingsPageSize}
                    onChange={(e) => {
                      setHoldingsPageSize(Number(e.target.value));
                      setHoldingsPage(1);
                    }}
                    aria-label={t('customerInventory.pgPerPage')}
                    className="w-24"
                  >
                    {[10, 25, 50].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </Select>
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                    {t('customerInventory.pgPerPage')}
                  </span>
                </div>
              </div>
            )}
          </TableShell>
        </div>
      )}

      {/* Tab 2: Customer Movement Ledger */}
      {activeTab === 'movements' && (
        <TableShell>
          <div className="overflow-x-auto">
            <Table className="text-left border-collapse">
              <caption className="sr-only">{t('customerInventory.movementsCaption')}</caption>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH scope="col">{t('customerInventory.thDate')}</TH>
                  <TH scope="col">{t('customerInventory.thEntity')}</TH>
                  <TH scope="col">{t('customerInventory.thProduct')}</TH>
                  <TH scope="col">{t('customerInventory.thMovement')}</TH>
                  <TH scope="col" className="text-right">{t('customerInventory.thQty')}</TH>
                  <TH scope="col">{t('customerInventory.thChallan')}</TH>
                  <TH scope="col" className="text-center">{t('customerInventory.thDelivery')}</TH>
                  <TH scope="col" className="text-center">{t('customerInventory.thBilling')}</TH>
                  <TH scope="col">{t('customerInventory.thCreatedBy')}</TH>
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
                        {cust?.customer_name || t('customerInventory.clientFallback')}
                      </TD>

                      <TD className="font-sans">
                        {prod?.product_name || t('dashboard.itemFallback')}
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
                        <div className="font-semibold text-foreground font-mono">{t('companyInventory.refLabel', { ref: mov.reference_id })}</div>
                      </TD>

                      <TD className="text-center">
                        {isDispatch ? (
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => openPrint(mov.reference_id, 'dispatch')}
                            title={t('customerInventory.printChallanTitle')}
                            className="text-[11px] shadow-2xs"
                          >
                            <Printer className="w-3.5 h-3.5 text-primary-foreground" />
                            <span>{t('customerInventory.printChallan')}</span>
                          </Button>
                        ) : (
                          <span className="text-[10px] font-mono text-muted-foreground">{t('customerInventory.returnSlip')}</span>
                        )}
                      </TD>

                      <TD className="text-center">
                        {!billingStatus ? (
                          <span className="text-[10px] font-mono text-muted-foreground">—</span>
                        ) : billingStatus === 'BILLED' ? (
                          <Badge variant="success">{t('customerInventory.billed')}</Badge>
                        ) : billingStatus === 'PARTIAL' ? (
                          <Badge variant="warning">{t('customerInventory.partial')}</Badge>
                        ) : (
                          <Badge variant="neutral">{t('customerInventory.unbilled')}</Badge>
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
        title={t('customerInventory.dispatchTitle')}
        subtitle={t('customerInventory.dispatchSubtitle')}
        maxWidth="2xl"
      >
        <form onSubmit={handleConfirmDispatch} className="space-y-4 text-xs">
          {operationError && (
            <Alert tone="destructive">{operationError}</Alert>
          )}

          {/* Consignee and Challan Header */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-muted border border-border rounded-md">
            <div className="sm:col-span-2">
              <Label className="mb-1">{t('customerInventory.consignee')}</Label>
              <CustomerPicker
                value={effectiveDispatchCustomerId}
                onChange={(id) => setDispatchForm({ ...dispatchForm, customerId: id })}
                customers={customers}
              />
            </div>

            <div>
              <Label className="mb-1">{t('customerInventory.challanNo')}</Label>
              <Input
                type="text"
                required
                value={dispatchForm.referenceId}
                onChange={(e) => setDispatchForm({ ...dispatchForm, referenceId: e.target.value })}
                className="w-full font-mono font-bold"
                placeholder={t('customerInventory.challanNoPh')}
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">{t('customerInventory.challanHint')}</p>
            </div>
          </div>

          {/* Items Section */}
          <div className="border border-border rounded-md p-3 bg-muted/50 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-foreground uppercase text-[11px] tracking-wider flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5 text-foreground" />
                {t('customerInventory.goodsTitle', { count: dispatchForm.items.length, plural: dispatchForm.items.length > 1 ? 's' : '' })}
              </span>
              <Button type="button" variant="secondary" size="sm" onClick={handleAddDispatchItem} disabled={!canAddDispatchItem} className="text-[11px] px-2.5 py-1">
                <PlusCircle className="w-3 h-3 text-muted-foreground" />
                <span>{t('customerInventory.addItem')}</span>
              </Button>
            </div>

            <div className="space-y-2">
              {dispatchForm.items.map((item, idx) => {
                const selectedProd = products[item.productId];
                const availableStock = selectedProd ? getCurrentCompanyStock(selectedProd.id) : 0;
                const prodUom = selectedProd ? uoms[selectedProd.primary_unit_id] : null;
                const lineMapping = getPieceWeightMapping(item.productId);
                const entryUomCode = lineMapping
                  ? uoms[lineMapping.pcsUnitId]?.code
                  : prodUom?.code;
                const piece = piecePreviewFor(item.productId, Number(item.quantity));
                const stockPcsEquiv = (() => {
                  if (!lineMapping || !selectedProd) return null;
                  const pus = Object.values(productUnits).filter((pu) => pu.product_id === item.productId);
                  return convertQuantity(availableStock, selectedProd.primary_unit_id, lineMapping.pcsUnitId, pus);
                })();

                return (
                  <div
                    key={idx}
                    className="p-3 bg-card border border-border rounded-md grid grid-cols-12 gap-2 items-center"
                  >
                    <div className="col-span-12 sm:col-span-6">
                      <label className="block text-[10px] font-mono text-muted-foreground mb-0.5">
                        {t('customerInventory.itemLabel', { n: idx + 1 })}
                      </label>
                      <Select
                        value={item.productId}
                        onChange={(e) => {
                          const newProdId = e.target.value;
                          const newItems = [...dispatchForm.items];
                          newItems[idx] = {
                            ...newItems[idx],
                            productId: newProdId,
                            unitId: entryUnitFor(newProdId)
                          };
                          setDispatchForm({ ...dispatchForm, items: newItems });
                        }}
                        className="w-full text-xs"
                      >
                        {allProducts
                          .filter((p) => p.id === item.productId || !dispatchTakenIds.has(p.id))
                          .map((p) => {
                            const stock = getCurrentCompanyStock(p.id);
                            const gu = p.gujarati_name?.trim();
                            return (
                              <option key={p.id} value={p.id}>
                                {p.product_name}{gu ? ` (${gu})` : ''} (Warehouse: {stock} {uoms[p.primary_unit_id]?.code})
                              </option>
                            );
                          })}
                      </Select>
                      <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
                        {t('customerInventory.warehouseAvail')}{' '}
                        {stockPcsEquiv !== null ? (
                          <>
                            <span className="font-bold text-foreground">{stockPcsEquiv} PCS</span>{' '}
                            <span>(≈ {availableStock} {prodUom?.code})</span>
                          </>
                        ) : (
                          <span className="font-bold text-foreground">{availableStock} {prodUom?.code}</span>
                        )}
                      </div>
                    </div>

                    <div className="col-span-8 sm:col-span-4">
                      <label className="block text-[10px] font-mono text-muted-foreground mb-0.5">
                        {t('customerInventory.qtyLabel', { uom: entryUomCode ?? '' })}
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
                      {piece && (
                        <div className="text-[11px] font-mono font-semibold text-emerald-800 dark:text-emerald-300 mt-0.5">
                          {t('customerInventory.pieceWeightPreview', { pcs: Number(item.quantity), grams: piece.grams, kg: piece.kg })}
                        </div>
                      )}
                    </div>

                    <div className="col-span-4 sm:col-span-2 flex justify-end items-end h-full pt-4">
                      {dispatchForm.items.length > 1 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveDispatchItem(idx)}
                          aria-label={t('customerInventory.removeItem')}
                          title={t('customerInventory.removeItemTitle')}
                        >
                          <Trash2 className="w-4 h-4" aria-hidden="true" />
                        </Button>
                      ) : (
                        <span className="text-[10px] font-mono text-muted-foreground">{t('customerInventory.primary')}</span>
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
              {t('customerInventory.willGenerate')}
            </span>

            <div className="flex gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => setIsDispatchModalOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" variant="primary" size="sm" className="shadow-2xs">
                <Printer className="w-3.5 h-3.5" />
                <span>{t('customerInventory.confirmDispatch')}</span>
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Return Modal — multi-item mirror of the dispatch modal. Products are
          limited to what the customer still holds (billed or not); the rate
          defaults to a previously delivered price (dropdown) with a custom
          on-the-spot entry. rate × quantity becomes the return credit. */}
      <Modal
        isOpen={isReturnModalOpen}
        onClose={() => setIsReturnModalOpen(false)}
        title={t('customerInventory.returnTitle2')}
        subtitle={t('customerInventory.returnSubtitle')}
        maxWidth="2xl"
      >
        <form onSubmit={handleConfirmReturn} className="space-y-4 text-xs">
          {operationError && (
            <Alert tone="destructive">{operationError}</Alert>
          )}

          {/* Consignee and Return Reference */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-muted border border-border rounded-md">
            <div className="sm:col-span-2">
              <Label className="mb-1">{t('customerInventory.retCustomer')}</Label>
              <CustomerPicker
                value={effectiveReturnCustomerId}
                onChange={(id) => {
                  // Held products differ per customer — reset the lines.
                  setReturnForm({
                    customerId: id,
                    referenceId: suggestNextDocumentNumber(id, 'RETURN'),
                    items: [initialReturnLineFor(id)]
                  });
                }}
                customers={customers}
              />
            </div>

            <div>
              <Label className="mb-1">{t('customerInventory.retRef')}</Label>
              <Input
                type="text"
                required
                value={returnForm.referenceId}
                onChange={(e) => setReturnForm({ ...returnForm, referenceId: e.target.value })}
                className="w-full font-mono font-bold"
                placeholder={t('customerInventory.retRefPh')}
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">{t('customerInventory.challanHint')}</p>
            </div>
          </div>

          {/* Items Section */}
          <div className="border border-border rounded-md p-3 bg-muted/50 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-foreground uppercase text-[11px] tracking-wider flex items-center gap-1.5">
                <RotateCcw className="w-3.5 h-3.5 text-foreground" />
                {t('customerInventory.returnGoodsTitle', { count: returnForm.items.length, plural: returnForm.items.length > 1 ? 's' : '' })}
              </span>
              <Button type="button" variant="secondary" size="sm" onClick={handleAddReturnItem} disabled={!canAddReturnItem} className="text-[11px] px-2.5 py-1">
                <PlusCircle className="w-3 h-3 text-muted-foreground" />
                <span>{t('customerInventory.addItem')}</span>
              </Button>
            </div>

            <div className="space-y-2">
              {returnForm.items.map((item, idx) => {
                const selectedProd = products[item.productId];
                const heldPrimary = selectedProd
                  ? getCustomerProductInventory(effectiveReturnCustomerId, selectedProd.id)
                  : 0;
                const prodUom = selectedProd ? uoms[selectedProd.primary_unit_id] : null;
                const lineMapping = getPieceWeightMapping(item.productId);
                const entryUomCode = lineMapping
                  ? uoms[lineMapping.pcsUnitId]?.code
                  : prodUom?.code;
                // Held quantity expressed in the line's entry unit (PCS for
                // piece-mapped products), mirroring the dispatch stock preview.
                const heldEntry = (() => {
                  if (!selectedProd) return 0;
                  const pus = Object.values(productUnits).filter((pu) => pu.product_id === item.productId);
                  return convertQuantity(heldPrimary, selectedProd.primary_unit_id, entryUnitFor(item.productId), pus);
                })();
                const deliveredRates = item.productId
                  ? getCustomerDeliveredRates(effectiveReturnCustomerId, item.productId)
                  : [];
                const effectiveRate = item.rateChoice === 'custom'
                  ? Number(item.customRate)
                  : Number(item.rateChoice);
                const lineCredit = Number.isFinite(effectiveRate) && effectiveRate > 0
                  ? roundCurrency(effectiveRate * Number(item.quantity))
                  : 0;
                const piece = piecePreviewFor(item.productId, Number(item.quantity));

                return (
                  <div
                    key={idx}
                    className="p-3 bg-card border border-border rounded-md grid grid-cols-12 gap-2 items-start"
                  >
                    <div className="col-span-12 sm:col-span-5">
                      <label className="block text-[10px] font-mono text-muted-foreground mb-0.5">
                        {t('customerInventory.itemLabel', { n: idx + 1 })}
                      </label>
                      <Select
                        value={item.productId}
                        onChange={(e) => {
                          const newProdId = e.target.value;
                          const newItems = [...returnForm.items];
                          newItems[idx] = {
                            ...newItems[idx],
                            productId: newProdId,
                            unitId: entryUnitFor(newProdId),
                            rateChoice: defaultRateChoiceFor(effectiveReturnCustomerId, newProdId),
                            customRate: ''
                          };
                          setReturnForm({ ...returnForm, items: newItems });
                        }}
                        className="w-full text-xs"
                      >
                        <option value="" disabled>
                          {t('customerInventory.retProductPh')}
                        </option>
                        {returnHeldProducts
                          .filter((h) => h.productId === item.productId || !returnTakenIds.has(h.productId))
                          .map((h) => {
                            const gu = products[h.productId]?.gujarati_name?.trim();
                            return (
                              <option key={h.productId} value={h.productId}>
                                {h.productName}{gu ? ` (${gu})` : ''} ({t('customerInventory.retHeld', { qty: h.held, uom: h.unitCode })})
                              </option>
                            );
                          })}
                      </Select>
                      <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
                        {t('customerInventory.customerHolds')}{' '}
                        <span className="font-bold text-foreground">{heldEntry} {entryUomCode ?? ''}</span>
                      </div>
                    </div>

                    <div className="col-span-6 sm:col-span-3">
                      <label className="block text-[10px] font-mono text-muted-foreground mb-0.5">
                        {t('customerInventory.qtyLabel', { uom: entryUomCode ?? '' })}
                      </label>
                      <Input
                        type="number"
                        min="1"
                        required
                        value={item.quantity}
                        onChange={(e) => {
                          const newItems = [...returnForm.items];
                          newItems[idx] = {
                            ...newItems[idx],
                            quantity: Number(e.target.value)
                          };
                          setReturnForm({ ...returnForm, items: newItems });
                        }}
                        className="w-full font-mono font-bold text-sm"
                      />
                      {piece && (
                        <div className="text-[11px] font-mono font-semibold text-emerald-800 dark:text-emerald-300 mt-0.5">
                          {t('customerInventory.pieceWeightPreview', { pcs: Number(item.quantity), grams: piece.grams, kg: piece.kg })}
                        </div>
                      )}
                    </div>

                    <div className="col-span-6 sm:col-span-3">
                      <label className="block text-[10px] font-mono text-muted-foreground mb-0.5">
                        {t('customerInventory.rateLabel')}
                      </label>
                      <Select
                        value={item.rateChoice}
                        onChange={(e) => {
                          const newItems = [...returnForm.items];
                          newItems[idx] = { ...newItems[idx], rateChoice: e.target.value };
                          setReturnForm({ ...returnForm, items: newItems });
                        }}
                        className="w-full text-xs"
                      >
                        {deliveredRates.map((r) => (
                          <option key={r} value={String(r)}>
                            {formatINR(r)}
                          </option>
                        ))}
                        <option value="custom">{t('customerInventory.rateCustom')}</option>
                      </Select>
                      {item.rateChoice === 'custom' && (
                        <Input
                          type="number"
                          min="0"
                          step="any"
                          required
                          value={item.customRate}
                          onChange={(e) => {
                            const newItems = [...returnForm.items];
                            newItems[idx] = { ...newItems[idx], customRate: e.target.value };
                            setReturnForm({ ...returnForm, items: newItems });
                          }}
                          placeholder={t('customerInventory.rateCustomPh')}
                          className="w-full font-mono text-xs mt-1"
                        />
                      )}
                      {lineCredit > 0 && (
                        <div className="text-[11px] font-mono font-semibold text-amber-800 dark:text-amber-300 mt-0.5">
                          {t('customerInventory.lineCredit', { value: formatINR(lineCredit) })}
                        </div>
                      )}
                    </div>

                    <div className="col-span-12 sm:col-span-1 flex justify-end items-start h-full pt-5">
                      {returnForm.items.length > 1 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveReturnItem(idx)}
                          aria-label={t('customerInventory.removeItem')}
                          title={t('customerInventory.removeItemTitle')}
                        >
                          <Trash2 className="w-4 h-4" aria-hidden="true" />
                        </Button>
                      ) : (
                        <span className="text-[10px] font-mono text-muted-foreground">{t('customerInventory.primary')}</span>
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
              {t('customerInventory.willGenerateReturn')}
            </span>

            <div className="flex items-center gap-3">
              <span className="text-[11px] font-mono font-bold text-amber-800 dark:text-amber-300">
                {t('customerInventory.totalCredit', { value: formatINR(totalReturnCredit) })}
              </span>
              <Button type="button" variant="secondary" size="sm" onClick={() => setIsReturnModalOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" variant="primary" size="sm" className="shadow-2xs" disabled={!hasAnyHeldProducts}>
                <Printer className="w-3.5 h-3.5" />
                <span>{t('customerInventory.confirmReturn')}</span>
              </Button>
            </div>
          </div>
        </form>
      </Modal>
      {/* Global Delivery Challan Print & Preview Modal (dispatch + returns) */}
      {selectedChallanRef && (
        <Modal
          isOpen={Boolean(selectedChallanRef)}
          onClose={() => closePrint()}
          title={
            printDirection === 'return'
              ? t('customerInventory.returnSlipNo', { ref: selectedChallanRef })
              : t('printBar.challanNo', { ref: selectedChallanRef })
          }
          subtitle={t('companyInventory.challanModalSubtitle')}
          maxWidth="full"
        >
          <DeliveryChallanPrintView
            challanReference={selectedChallanRef}
            direction={printDirection}
            onClose={() => closePrint()}
          />
        </Modal>
      )}
    </div>
  );
};
