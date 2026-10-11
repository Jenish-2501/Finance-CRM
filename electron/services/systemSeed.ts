import { Repositories } from '../database/repositories/repositories.js';
import { SEED_BUSINESS_SETTINGS, SEED_UOMS } from '../../src/data/seedData.js';
import { logger } from '../utils/logger.js';

// First-launch system seeding. Inserts ONLY the rows the app needs to boot
// functionally offline: one business_settings row (numbering, GST defaults)
// and the 4 standard units of measure (PCS, KG, BOX, GRAM —
// billing/inventory lookups dereference them by ID). Single-owner app: no
// transactional data (customers, products, invoices, movements) is NEVER
// seeded here.
// Idempotent: each table is seeded only when completely empty, so existing
// installations and localStorage migrations are never overwritten.
export function ensureSystemDefaults(): void {

  const settings = Repositories.businessSettings.findAll() as Array<Record<string, unknown>>;
  if (settings.length === 0) {
    Repositories.businessSettings.upsert(SEED_BUSINESS_SETTINGS as unknown as Record<string, unknown>);
    logger.info('systemseed.business_seeded', {});
  }

  const uoms = Repositories.uoms.findAll() as Array<Record<string, unknown>>;
  if (uoms.length === 0) {
    for (const uom of Object.values(SEED_UOMS)) {
      Repositories.uoms.upsert(uom as unknown as Record<string, unknown>);
    }
    logger.info('systemseed.uoms_seeded', {});
  }
}
