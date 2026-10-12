/**
 * FEF CORTEX — SAFE FRED DIAGNOSTIC SCRIPT
 *
 * Verifies FRED connector activation readiness without printing secrets.
 * Outputs:
 * - FRED_API_KEY: CONFIGURED / NOT_CONFIGURED
 * - FRED provider status
 * - Number of verified series
 * - Number unavailable
 * - Last successful observation timestamp
 */

import { loadEnvConfig } from '@next/env';
import { FredConnector } from '../src/lib/macro/connectors/fred-connector';

loadEnvConfig(process.cwd());

const REQUIRED_SERIES = [
  'DFEDTARU',
  'DGS2',
  'DGS10',
  'CPIAUCSL',
  'CPILFESL',
  'PCEPI',
  'PCEPILFE',
  'UNRATE',
  'PAYEMS',
];

async function runFredDiagnostic() {
  const envKey = process.env.FRED_API_KEY;
  const isConfigured = Boolean(envKey && typeof envKey === 'string' && envKey.trim() !== '');

  console.log('============================================================');
  console.log('FEF CORTEX — FRED ACTIVATION DIAGNOSTIC');
  console.log('============================================================');
  console.log(`FRED_API_KEY: ${isConfigured ? 'CONFIGURED' : 'NOT_CONFIGURED'}`);

  const connector = new FredConnector();
  let verifiedCount = 0;
  let unavailableCount = 0;
  let lastObservationDate: string | null = null;
  let lastSuccessTimestamp: string | null = null;

  const results: Array<{
    series: string;
    status: string;
    observationDate: string;
    verified: boolean;
    classification: string;
  }> = [];

  for (const series of REQUIRED_SERIES) {
    try {
      const res = await connector.fetchLatestObservation(series);
      if (res.isAvailable && res.payload) {
        verifiedCount++;
        if (res.payload.observationDate) {
          lastObservationDate = res.payload.observationDate;
        }
        lastSuccessTimestamp = new Date(res.observedAt || res.receivedAt).toISOString();
        results.push({
          series,
          status: 'SUCCESS',
          observationDate: res.payload.observationDate,
          value: res.payload.value,
          unit: res.payload.unit,
          freshness: res.freshness,
          verified: true,
          classification: 'VERIFIED_REAL',
        });
      } else {
        unavailableCount++;
        const errCode = typeof res.error === 'object' && res.error !== null
          ? (res.error as any).code || 'ERROR'
          : String(res.error || 'UNAVAILABLE');
        results.push({
          series,
          status: errCode,
          observationDate: 'NONE',
          value: null,
          unit: '',
          freshness: res.freshness || 'UNAVAILABLE',
          verified: false,
          classification: 'UNAVAILABLE',
        });
      }
    } catch (err: any) {
      unavailableCount++;
      results.push({
        series,
        status: 'NETWORK_ERROR',
        observationDate: 'NONE',
        value: null,
        unit: '',
        freshness: 'UNAVAILABLE',
        verified: false,
        classification: 'UNAVAILABLE',
      });
    }
  }

  const providerStatus = isConfigured && verifiedCount > 0
    ? (unavailableCount === 0 ? 'LIVE_VERIFIED' : 'PARTIALLY_VERIFIED')
    : 'NOT_CONFIGURED / DATA_LIMITED';

  console.log(`FRED Provider Status: ${providerStatus}`);
  console.log(`Verified Series: ${verifiedCount} / ${REQUIRED_SERIES.length}`);
  console.log(`Unavailable Series: ${unavailableCount} / ${REQUIRED_SERIES.length}`);
  console.log(`Last Successful Observation: ${lastObservationDate || 'NONE'}`);
  console.log(`Last Success Timestamp: ${lastSuccessTimestamp || 'NONE'}`);
  console.log('------------------------------------------------------------');
  console.table(results);
  console.log('============================================================');
}

runFredDiagnostic().catch((err) => {
  console.error('Diagnostic error:', err);
  process.exit(1);
});
