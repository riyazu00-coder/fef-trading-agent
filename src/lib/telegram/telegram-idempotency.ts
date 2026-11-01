/**
 * FEF CORTEX — TELEGRAM IDEMPOTENCY SERVICE
 *
 * Phase 13 Workstream: Stable Deduplication & Idempotency Key Generation
 * Prevents duplicate messages across polling cycles, retries, and restarts.
 */

import * as crypto from 'crypto';

export function generateSignalIdempotencyKey(
  symbol: string,
  setupId: string,
  revision = 1
): string {
  const normSymbol = (symbol || '').toUpperCase().trim();
  const normSetupId = (setupId || '').trim();
  return `${normSymbol}_${normSetupId}_${revision}`;
}

export function hashDestinationChat(chatId: string): string {
  return crypto.createHash('sha256').update(String(chatId).trim()).digest('hex').slice(0, 16);
}

