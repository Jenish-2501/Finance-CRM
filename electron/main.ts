import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { initDatabase } from './database/database.js';
import { loadFullState, saveDiffTransaction } from './services/transactionService.js';
import { migrateLocalStorageToSqlite } from './services/migrationService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  initDatabase(app.getPath('userData'));


  ipcMain.handle('store:migrateLocalStorage', async (_: any, data: any) => {
    return migrateLocalStorageToSqlite(data);
  });


  ipcMain.handle('users:upsert', async (_: any, data: any) => { const { Repositories } = await import('./database/repositories/repositories.js'); return Repositories.users.upsert(data); });
  ipcMain.handle('business_settings:upsert', async (_: any, data: any) => { const { Repositories } = await import('./database/repositories/repositories.js'); return Repositories.businessSettings.upsert(data); });
  ipcMain.handle('customers:upsert', async (_: any, data: any) => { const { Repositories } = await import('./database/repositories/repositories.js'); return Repositories.customers.upsert(data); });
  ipcMain.handle('customers:delete', async (_: any, id: string) => { const { deleteRow } = await import('./database/repositories/baseRepository.js'); return deleteRow('customers', id); });
  ipcMain.handle('products:upsert', async (_: any, data: any) => { const { Repositories } = await import('./database/repositories/repositories.js'); return Repositories.products.upsert(data); });
  ipcMain.handle('product_prices:upsert', async (_: any, data: any) => { const { Repositories } = await import('./database/repositories/repositories.js'); return Repositories.productPrices.upsert(data); });
  ipcMain.handle('product_units:upsert', async (_: any, data: any) => { const { Repositories } = await import('./database/repositories/repositories.js'); return Repositories.productUnits.upsert(data); });
  ipcMain.handle('stock_receipts:upsert', async (_: any, data: any) => { const { Repositories } = await import('./database/repositories/repositories.js'); return Repositories.stockReceipts.upsert(data); });
  ipcMain.handle('stock_receipt_items:upsert', async (_: any, data: any) => { const { Repositories } = await import('./database/repositories/repositories.js'); return Repositories.stockReceiptItems.upsert(data); });
  ipcMain.handle('inventory_movements:upsert', async (_: any, data: any) => { const { Repositories } = await import('./database/repositories/repositories.js'); return Repositories.inventoryMovements.upsert(data); });
  ipcMain.handle('customer_inventory_movements:upsert', async (_: any, data: any) => { const { Repositories } = await import('./database/repositories/repositories.js'); return Repositories.customerInventoryMovements.upsert(data); });

  // Transactional Invoice handler
  ipcMain.handle('invoices:transaction', async (_: any, payload: any) => {
    const { saveDiffTransaction } = await import('./services/transactionService.js');
    return saveDiffTransaction(payload);
  });

  ipcMain.handle('invoice_payments:upsert', async (_: any, data: any) => { const { Repositories } = await import('./database/repositories/repositories.js'); return Repositories.invoicePayments.upsert(data); });
  ipcMain.handle('audit_logs:upsert', async (_: any, data: any) => { const { Repositories } = await import('./database/repositories/repositories.js'); return Repositories.auditLogs.upsert(data); });

  ipcMain.handle('store:loadAll', async () => {
    return loadFullState();
  });







  ipcMain.handle('store:upsert', async (_: any, entityType: string, data: any) => {
    const { Repositories } = await import('./database/repositories/repositories.js');
    const repoMap: Record<string, any> = {
      'users': Repositories.users,
      'business_settings': Repositories.businessSettings,
      'uoms': Repositories.uoms,
      'customers': Repositories.customers,
      'products': Repositories.products,
      'product_units': Repositories.productUnits,
      'product_prices': Repositories.productPrices,
      'stock_receipts': Repositories.stockReceipts,
      'stock_receipt_items': Repositories.stockReceiptItems,
      'inventory_movements': Repositories.inventoryMovements,
      'customer_inventory_movements': Repositories.customerInventoryMovements,
      'invoices': Repositories.invoices,
      'invoice_items': Repositories.invoiceItems,
      'invoice_allocations': Repositories.invoiceAllocations,
      'invoice_payments': Repositories.invoicePayments,
      'audit_logs': Repositories.auditLogs,
    };

    const repo = repoMap[entityType];
    if (repo) {
       repo.upsert(data);
       return true;
    }
    return false;
  });

  ipcMain.handle('store:delete', async (_: any, entityType: string, id: string) => {
    const { deleteRow } = await import('./database/repositories/baseRepository.js');
    deleteRow(entityType, id);
    return true;
  });

  ipcMain.handle('store:persistChanges', async (_: any, payload: any) => {
    return saveDiffTransaction(payload);
  });

  ipcMain.handle('files:saveCSV', async (_: any, { filename, content }: { filename: string; content: string }) => {
    if (!mainWindow) return false;
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Save CSV',
      defaultPath: filename,
      filters: [{ name: 'CSV Files', extensions: ['csv'] }]
    });

    if (filePath) {
      await fs.promises.writeFile(filePath, content, 'utf8');
      return true;
    }
    return false;
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
