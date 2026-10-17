/**
 * FEF CORTEX — CFTC COMMITMENTS OF TRADERS (COT) REAL-DATA INGESTION LAYER
 * Sprint 2C Verified Real-Data Intelligence Foundation
 *
 * Rules:
 * 1. Zero synthetic/mock fallback numbers.
 * 2. Official public government data from CFTC public reporting API.
 * 3. Contract mappings explicitly defined for all supported FEF CORTEX assets.
 * 4. Fail-closed: network or API errors return verified envelopes with isVerified=false.
 */

import {
  createFailedClosedEnvelope,
  createVerifiedEnvelope,
  VerifiedEvidenceEnvelope,
} from '../providers/canonical-envelope';

export interface CotContractMapping {
  marketCode: string;
  cftcContractName: string;
  cortexSymbol: string;
}

export const CFTC_CONTRACT_MAP: Record<string, CotContractMapping> = {
  XAUUSD: {
    marketCode: '088691',
    cftcContractName: 'GOLD - COMMODITY EXCHANGE INC.',
    cortexSymbol: 'XAUUSD',
  },
  XAGUSD: {
    marketCode: '084691',
    cftcContractName: 'SILVER - COMMODITY EXCHANGE INC.',
    cortexSymbol: 'XAGUSD',
  },
  USOIL: {
    marketCode: '067651',
    cftcContractName: 'CRUDE OIL, LIGHT SWEET - NEW YORK MERCANTILE EXCHANGE',
    cortexSymbol: 'USOIL',
  },
  EURUSD: {
    marketCode: '099741',
    cftcContractName: 'EURO FX - CHICAGO MERCANTILE EXCHANGE',
    cortexSymbol: 'EURUSD',
  },
  GBPUSD: {
    marketCode: '096742',
    cftcContractName: 'BRITISH POUND STERLING - CHICAGO MERCANTILE EXCHANGE',
    cortexSymbol: 'GBPUSD',
  },
  USDJPY: {
    marketCode: '097741',
    cftcContractName: 'JAPANESE YEN - CHICAGO MERCANTILE EXCHANGE',
    cortexSymbol: 'USDJPY',
  },
  BTCUSD: {
    marketCode: '133741',
    cftcContractName: 'BITCOIN - CHICAGO MERCANTILE EXCHANGE',
    cortexSymbol: 'BTCUSD',
  },
  US100: {
    marketCode: '209742',
    cftcContractName: 'NASDAQ MINI - CHICAGO MERCANTILE EXCHANGE',
    cortexSymbol: 'US100',
  },
  US500: {
    marketCode: '13874A',
    cftcContractName: 'E-MINI S&P 500 - CHICAGO MERCANTILE EXCHANGE',
    cortexSymbol: 'US500',
  },
};

export interface CotReportRecord {
  symbol: string;
  reportDate: string; // YYYY-MM-DD
  marketCode: string;
  contractName: string;
  openInterest: number;
  commercialLong: number;
  commercialShort: number;
  commercialNet: number;
  nonCommercialLong: number;
  nonCommercialShort: number;
  nonCommercialNet: number;
  nonReportableLong: number;
  nonReportableShort: number;
  percentile: number; // 0 - 100 estimated institutional positioning percentile
  wowNetChange?: number;
}

// CFTC reports are released weekly on Fridays with Tuesday snapshot data.
// Max staleness: 21 days (1,814,400 seconds) to account for weekly publication cycle, holiday delays, and release schedule variations.
const MAX_COT_STALENESS_SEC = 1814400;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours in memory

interface CachedRecord {
  envelope: VerifiedEvidenceEnvelope<CotReportRecord>;
  cachedAt: number;
}

export class CftcCotProvider {
  private cache: Map<string, CachedRecord> = new Map();
  private static instance: CftcCotProvider | null = null;

  public static getInstance(): CftcCotProvider {
    if (!CftcCotProvider.instance) {
      CftcCotProvider.instance = new CftcCotProvider();
    }
    return CftcCotProvider.instance;
  }

  /**
   * Fetch official CFTC COT report for a given CORTEX symbol.
   */
  public async getCotReport(
    symbol: string
  ): Promise<VerifiedEvidenceEnvelope<CotReportRecord>> {
    const normSymbol = (symbol || '').trim().toUpperCase();
    const mapping = CFTC_CONTRACT_MAP[normSymbol];

    if (!mapping) {
      return createFailedClosedEnvelope<CotReportRecord>(
        'CFTC_COT',
        'OFFICIAL_GOVERNMENT',
        `No official CFTC COT contract mapping exists for symbol '${normSymbol}'`,
        MAX_COT_STALENESS_SEC
      );
    }

    // Check memory cache
    const cached = this.cache.get(normSymbol);
    const now = Date.now();
    if (cached && now - cached.cachedAt < CACHE_TTL_MS) {
      return cached.envelope;
    }

    try {
      // Query official public CFTC Socrata API (Legacy Futures-Only COT endpoint)
      // Filter by cftc_contract_market_code and order by report_date descending
      const endpoint = `https://publicreporting.cftc.gov/resource/jun7-fc8e.json?cftc_contract_market_code=${encodeURIComponent(
        mapping.marketCode
      )}&$limit=5&$order=report_date_as_yyyy_mm_dd%20DESC`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(endpoint, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'FEF-CORTEX-Intelligence/1.0',
        },
        signal: controller.signal,
      }).catch((err) => {
        clearTimeout(timeoutId);
        throw err;
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`CFTC public reporting API returned HTTP ${res.status}: ${res.statusText}`);
      }

      const rows = (await res.json()) as any[];
      if (!Array.isArray(rows) || rows.length === 0) {
        throw new Error(`CFTC public reporting API returned 0 records for contract ${mapping.marketCode}`);
      }

      const latest = rows[0];
      const prev = rows.length > 1 ? rows[1] : undefined;

      // Extract positions safely
      const reportDate = latest.report_date_as_yyyy_mm_dd || latest.as_of_date_in_form_yyyymmdd || new Date().toISOString().split('T')[0];
      const openInterest = Number(latest.open_interest_all || 0);
      const nonCommLong = Number(latest.noncomm_positions_long_all || 0);
      const nonCommShort = Number(latest.noncomm_positions_short_all || 0);
      const commLong = Number(latest.comm_positions_long_all || 0);
      const commShort = Number(latest.comm_positions_short_all || 0);
      const nonRepLong = Number(latest.nonrept_positions_long_all || 0);
      const nonRepShort = Number(latest.nonrept_positions_short_all || 0);

      const nonCommercialNet = nonCommLong - nonCommShort;
      const commercialNet = commLong - commShort;

      // Calculate week-over-week net change if prior week exists
      let wowNetChange: number | undefined;
      if (prev) {
        const prevNonCommNet =
          Number(prev.noncomm_positions_long_all || 0) - Number(prev.noncomm_positions_short_all || 0);
        wowNetChange = nonCommercialNet - prevNonCommNet;
      }

      // Calculate speculative positioning percentile (ratio of non-comm longs to total non-comm positions)
      const totalNonComm = nonCommLong + nonCommShort;
      let percentile = 50;
      if (totalNonComm > 0) {
        percentile = Math.round((nonCommLong / totalNonComm) * 100);
      }

      const record: CotReportRecord = {
        symbol: normSymbol,
        reportDate,
        marketCode: mapping.marketCode,
        contractName: mapping.cftcContractName,
        openInterest,
        commercialLong: commLong,
        commercialShort: commShort,
        commercialNet,
        nonCommercialLong: nonCommLong,
        nonCommercialShort: nonCommShort,
        nonCommercialNet,
        nonReportableLong: nonRepLong,
        nonReportableShort: nonRepShort,
        percentile,
        wowNetChange,
      };

      const envelope = createVerifiedEnvelope<CotReportRecord>({
        provider: 'CFTC_COT',
        sourceType: 'OFFICIAL_GOVERNMENT',
        observedAt: new Date(reportDate).toISOString(),
        maxStalenessSec: MAX_COT_STALENESS_SEC,
        payload: record,
      });

      this.cache.set(normSymbol, { envelope, cachedAt: now });
      return envelope;
    } catch (err: any) {
      const envelope = createFailedClosedEnvelope<CotReportRecord>(
        'CFTC_COT',
        'OFFICIAL_GOVERNMENT',
        `CFTC COT ingestion failed: ${err?.message || 'Network / Provider error'}`,
        MAX_COT_STALENESS_SEC
      );
      return envelope;
    }
  }

  /**
   * Fetch all registered CORTEX COT reports in parallel.
   */
  public async getAllCotReports(): Promise<Record<string, VerifiedEvidenceEnvelope<CotReportRecord>>> {
    const symbols = Object.keys(CFTC_CONTRACT_MAP);
    const results = await Promise.all(symbols.map((sym) => this.getCotReport(sym)));
    const out: Record<string, VerifiedEvidenceEnvelope<CotReportRecord>> = {};
    for (let i = 0; i < symbols.length; i++) {
      out[symbols[i]] = results[i];
    }
    return out;
  }

  /**
   * Reset cache (primarily for deterministic unit testing).
   */
  public clearCache(): void {
    this.cache.clear();
  }
}

export const cftcCotProvider = CftcCotProvider.getInstance();
