/**
 * Canonical Market Session Intelligence & Executability Engine
 * 
 * Provides centralized, timezone-accurate market state and executability gating.
 * Enforces: NEVER present an executable BUY or SELL opportunity for an instrument
 * whose market is currently CLOSED.
 * 
 * Handles distinct asset classes:
 * - METALS (XAUUSD, XAGUSD): Mon-Fri with 1h daily maintenance break; closed weekends.
 * - FOREX (EURUSD, GBPUSD, etc.): Sun 22:00 UTC to Fri 22:00 UTC 24/5; closed weekends.
 * - INDICES (US30, US100, US500): CME trading sessions with daily breaks; closed weekends.
 * - ENERGIES (USOIL): NYMEX schedule with daily breaks; closed weekends.
 * - CRYPTO (BTCUSD, ETHUSD, SOLUSD): 24/7 market-data streams.
 */

export type MarketState = 
  | 'OPEN'
  | 'CLOSED'
  | 'WEEKEND_CLOSED'
  | 'PRE_OPEN'
  | 'DAILY_BREAK'
  | 'CLOSING_SOON'
  | 'HOLIDAY'
  | 'EARLY_CLOSE'
  | 'SESSION_UNKNOWN';

export type AssetClassCategory = 'METALS' | 'FOREX' | 'INDICES' | 'ENERGIES' | 'CRYPTO' | 'COMMODITY';

export interface MarketSessionState {
  symbol: string;
  assetClass: AssetClassCategory;
  marketState: MarketState;
  isOpen: boolean;
  tradeExecutable: boolean;
  statusLabel: string;
  nextOpenCountdown: string;
  nextCloseCountdown?: string;
  isStaleQuote?: boolean;
  sessionName: string;
  openedAt: string;
  closesAt: string;
  nextOpenAt: string;
  minutesUntilOpen: number;
  minutesUntilClose: number;
  timezone: string;
  scheduleSource: 'BROKER_MT5' | 'SESSION SCHEDULE — REFERENCE';
  freshness: 'LIVE' | 'STALE' | 'OFFLINE';
  reason?: string;
  setupQuality: number;
  executabilityScore: number;
}

export interface BrokerSessionOverride {
  symbol: string;
  isOpen: boolean;
  sessionName?: string;
  nextOpenUtc?: string;
  closesUtc?: string;
}

// In-memory broker session override registry (populated when MT5 connects)
const brokerSessionOverrides: Map<string, BrokerSessionOverride> = new Map();

export function setBrokerSessionOverride(override: BrokerSessionOverride): void {
  brokerSessionOverrides.set(override.symbol.toUpperCase(), override);
}

export function clearBrokerSessionOverrides(): void {
  brokerSessionOverrides.clear();
}

/**
 * Resolves the asset class category for a canonical or broker symbol
 */
export function resolveAssetClass(symbol: string): AssetClassCategory {
  const s = symbol.toUpperCase();
  if (s.startsWith('XAU') || s.startsWith('XAG') || s.includes('GOLD') || s.includes('SILVER')) {
    return 'METALS';
  }
  if (s.startsWith('BTC') || s.startsWith('ETH') || s.startsWith('SOL') || s.includes('CRYPTO')) {
    return 'CRYPTO';
  }
  if (s.startsWith('US30') || s.startsWith('US100') || s.startsWith('US500') || s.includes('USTEC') || s.includes('SPX')) {
    return 'INDICES';
  }
  if (s.includes('OIL') || s.includes('BRENT') || s.includes('WTI') || s.startsWith('USOIL')) {
    return 'ENERGIES';
  }
  return 'FOREX';
}

/**
 * Determines current global trading session name based on UTC hour
 */
export function getGlobalSessionName(utcHour: number): string {
  if (utcHour >= 0 && utcHour < 7) return 'ASIAN / TOKYO SESSION';
  if (utcHour >= 7 && utcHour < 12) return 'LONDON SESSION';
  if (utcHour >= 12 && utcHour < 16) return 'LONDON / NY OVERLAP (KILLZONE)';
  if (utcHour >= 16 && utcHour < 21) return 'NEW YORK SESSION';
  return 'PACIFIC / SYDNEY ROLLOVER';
}

function formatCountdown(mins: number): string {
  if (mins <= 0) return '0m';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function getStatusLabel(state: MarketState): string {
  switch (state) {
    case 'OPEN': return 'SESSION OPEN';
    case 'WEEKEND_CLOSED': return 'WEEKEND CLOSED';
    case 'DAILY_BREAK': return 'DAILY BREAK';
    case 'PRE_OPEN': return 'PRE-OPEN';
    case 'CLOSING_SOON': return 'CLOSING SOON';
    case 'HOLIDAY': return 'HOLIDAY';
    case 'EARLY_CLOSE': return 'EARLY CLOSE';
    default: return 'CLOSED';
  }
}

/**
 * Canonical Market Hours Evaluator
 * Strictly evaluates day of week and UTC hours without naive local date dependencies.
 * 
 * @param symbol - Ticker symbol (e.g. 'XAGUSD', 'XAUUSD', 'EURUSD', 'BTCUSD')
 * @param customUtcDate - Optional Date object for deterministic backtesting/unit tests
 * @param quoteTimestampMs - Optional quote timestamp in ms or Date for data freshness verification
 */
export function evaluateMarketSession(
  symbol: string,
  customUtcDate?: Date,
  quoteTimestampMs?: number | Date
): MarketSessionState {
  const normSym = symbol.toUpperCase();
  const assetClass = resolveAssetClass(normSym);
  const now = customUtcDate || new Date();

  // 1. Check Broker MT5 live override first if present
  const brokerOverride = brokerSessionOverrides.get(normSym);
  if (brokerOverride) {
    const isOpen = brokerOverride.isOpen;
    const marketState: MarketState = isOpen ? 'OPEN' : 'CLOSED';
    const minutesUntilOpen = isOpen ? 0 : 60;
    const minutesUntilClose = isOpen ? 120 : 0;
    return {
      symbol: normSym,
      assetClass,
      marketState,
      isOpen,
      tradeExecutable: isOpen,
      statusLabel: getStatusLabel(marketState),
      nextOpenCountdown: formatCountdown(minutesUntilOpen),
      nextCloseCountdown: formatCountdown(minutesUntilClose),
      isStaleQuote: false,
      sessionName: brokerOverride.sessionName || (isOpen ? 'BROKER SESSION' : 'BROKER CLOSED'),
      openedAt: isOpen ? 'Live' : 'Closed',
      closesAt: brokerOverride.closesUtc || 'Scheduled',
      nextOpenAt: brokerOverride.nextOpenUtc || 'Next Session',
      minutesUntilOpen,
      minutesUntilClose,
      timezone: 'UTC',
      scheduleSource: 'BROKER_MT5',
      freshness: 'LIVE',
      reason: isOpen ? undefined : 'BROKER_SESSION_CLOSED',
      setupQuality: 85,
      executabilityScore: isOpen ? 100 : 0,
    };
  }

  // 2. Reference Calendar: Strict UTC calculations
  const dayOfWeek = now.getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 5 = Friday, 6 = Saturday
  const hour = now.getUTCHours();
  const minute = now.getUTCMinutes();
  const totalMinutesInDay = hour * 60 + minute;

  // Stale data check (threshold: 180s / 3 minutes)
  const quoteMs = quoteTimestampMs instanceof Date
    ? quoteTimestampMs.getTime()
    : typeof quoteTimestampMs === 'number'
    ? quoteTimestampMs
    : undefined;

  const isQuoteStale = quoteMs ? (now.getTime() - quoteMs > 180_000) : false;

  // -------------------------------------------------------------
  // ASSET CLASS: CRYPTO (24/7 Market Data)
  // -------------------------------------------------------------
  if (assetClass === 'CRYPTO') {
    const freshness = isQuoteStale ? 'STALE' : 'LIVE';
    const tradeExecutable = !isQuoteStale;
    return {
      symbol: normSym,
      assetClass: 'CRYPTO',
      marketState: 'OPEN',
      isOpen: true,
      tradeExecutable,
      statusLabel: '24/7 ACTIVE',
      nextOpenCountdown: '0m',
      nextCloseCountdown: 'Never',
      isStaleQuote: isQuoteStale,
      sessionName: 'GLOBAL CRYPTO (24/7 CONTINUOUS)',
      openedAt: '24/7 Continuous',
      closesAt: 'Never',
      nextOpenAt: 'Continuous',
      minutesUntilOpen: 0,
      minutesUntilClose: 1440,
      timezone: 'UTC',
      scheduleSource: 'SESSION SCHEDULE — REFERENCE',
      freshness,
      reason: isQuoteStale ? 'DATA_STALE' : undefined,
      setupQuality: 88,
      executabilityScore: tradeExecutable ? 100 : 0,
    };
  }

  // -------------------------------------------------------------
  // ASSET CLASS: METALS (XAUUSD, XAGUSD)
  // Trading: Sun 22:00 UTC - Fri 21:00 UTC
  // Daily maintenance break: 21:00 - 22:00 UTC (Mon - Thu)
  // Weekend: Fri 21:00 UTC - Sun 22:00 UTC (Closed)
  // -------------------------------------------------------------
  if (assetClass === 'METALS') {
    // Saturday: Closed all day
    if (dayOfWeek === 6) {
      const minutesUntilSun22 = (24 * 60 - totalMinutesInDay) + (22 * 60);
      return {
        symbol: normSym,
        assetClass: 'METALS',
        marketState: 'WEEKEND_CLOSED',
        isOpen: false,
        tradeExecutable: false,
        statusLabel: 'WEEKEND CLOSED',
        nextOpenCountdown: formatCountdown(minutesUntilSun22),
        isStaleQuote: isQuoteStale,
        sessionName: 'WEEKEND METALS CLOSURE',
        openedAt: 'Closed',
        closesAt: 'Friday 21:00 UTC',
        nextOpenAt: 'Sunday 22:00 UTC',
        minutesUntilOpen: minutesUntilSun22,
        minutesUntilClose: 0,
        timezone: 'UTC',
        scheduleSource: 'SESSION SCHEDULE — REFERENCE',
        freshness: 'OFFLINE',
        reason: 'MARKET_CLOSED_WEEKEND',
        setupQuality: 86,
        executabilityScore: 0,
      };
    }

    // Sunday: Closed until 22:00 UTC
    if (dayOfWeek === 0) {
      if (hour < 22) {
        const minutesUntilOpen = (22 * 60) - totalMinutesInDay;
        const isPreOpen = minutesUntilOpen <= 45;
        const marketState: MarketState = isPreOpen ? 'PRE_OPEN' : 'WEEKEND_CLOSED';
        return {
          symbol: normSym,
          assetClass: 'METALS',
          marketState,
          isOpen: false,
          tradeExecutable: false,
          statusLabel: getStatusLabel(marketState),
          nextOpenCountdown: formatCountdown(minutesUntilOpen),
          isStaleQuote: isQuoteStale,
          sessionName: isPreOpen ? 'PRE-OPEN REOPENING WATCH' : 'WEEKEND METALS CLOSURE',
          openedAt: 'Closed',
          closesAt: 'Friday 21:00 UTC',
          nextOpenAt: 'Sunday 22:00 UTC',
          minutesUntilOpen,
          minutesUntilClose: 0,
          timezone: 'UTC',
          scheduleSource: 'SESSION SCHEDULE — REFERENCE',
          freshness: isPreOpen ? 'LIVE' : 'OFFLINE',
          reason: isPreOpen ? 'PRE_OPEN_REVALIDATING' : 'MARKET_CLOSED_WEEKEND',
          setupQuality: 87,
          executabilityScore: 0,
        };
      }
      // Sunday after 22:00 UTC: Market opened
      return createOpenMetalsState(normSym, hour, isQuoteStale, totalMinutesInDay);
    }

    // Friday: Closes at 21:00 UTC
    if (dayOfWeek === 5) {
      if (hour >= 21) {
        const minutesUntilSun22 = (24 * 60 - totalMinutesInDay) + (24 * 60) + (22 * 60);
        return {
          symbol: normSym,
          assetClass: 'METALS',
          marketState: 'WEEKEND_CLOSED',
          isOpen: false,
          tradeExecutable: false,
          statusLabel: 'WEEKEND CLOSED',
          nextOpenCountdown: formatCountdown(minutesUntilSun22),
          isStaleQuote: isQuoteStale,
          sessionName: 'WEEKEND METALS CLOSURE',
          openedAt: 'Closed',
          closesAt: 'Friday 21:00 UTC',
          nextOpenAt: 'Sunday 22:00 UTC',
          minutesUntilOpen: minutesUntilSun22,
          minutesUntilClose: 0,
          timezone: 'UTC',
          scheduleSource: 'SESSION SCHEDULE — REFERENCE',
          freshness: 'OFFLINE',
          reason: 'MARKET_CLOSED_WEEKEND',
          setupQuality: 84,
          executabilityScore: 0,
        };
      }
      // Friday between 20:15 and 21:00 UTC: Closing soon
      const minutesUntilClose = (21 * 60) - totalMinutesInDay;
      if (minutesUntilClose <= 45) {
        return {
          symbol: normSym,
          assetClass: 'METALS',
          marketState: 'CLOSING_SOON',
          isOpen: true,
          tradeExecutable: !isQuoteStale,
          statusLabel: 'CLOSING SOON',
          nextOpenCountdown: formatCountdown((24 * 60 - totalMinutesInDay) + (24 * 60) + (22 * 60)),
          nextCloseCountdown: formatCountdown(minutesUntilClose),
          isStaleQuote: isQuoteStale,
          sessionName: 'WEEKEND CLOSING SOON (METALS)',
          openedAt: '22:00 UTC',
          closesAt: 'Friday 21:00 UTC',
          nextOpenAt: 'Sunday 22:00 UTC',
          minutesUntilOpen: 0,
          minutesUntilClose,
          timezone: 'UTC',
          scheduleSource: 'SESSION SCHEDULE — REFERENCE',
          freshness: isQuoteStale ? 'STALE' : 'LIVE',
          reason: isQuoteStale ? 'DATA_STALE' : 'CLOSING_SOON_WEEKEND',
          setupQuality: 82,
          executabilityScore: isQuoteStale ? 0 : 50,
        };
      }
      return createOpenMetalsState(normSym, hour, isQuoteStale, totalMinutesInDay);
    }

    // Monday - Thursday: Daily maintenance break between 21:00 and 22:00 UTC
    if (hour === 21) {
      const minutesUntilOpen = 60 - minute;
      return {
        symbol: normSym,
        assetClass: 'METALS',
        marketState: 'DAILY_BREAK',
        isOpen: false,
        tradeExecutable: false,
        statusLabel: 'DAILY BREAK',
        nextOpenCountdown: formatCountdown(minutesUntilOpen),
        isStaleQuote: isQuoteStale,
        sessionName: 'DAILY METALS MAINTENANCE BREAK',
        openedAt: 'Closed for break',
        closesAt: '21:00 UTC',
        nextOpenAt: '22:00 UTC',
        minutesUntilOpen,
        minutesUntilClose: 0,
        timezone: 'UTC',
        scheduleSource: 'SESSION SCHEDULE — REFERENCE',
        freshness: 'OFFLINE',
        reason: 'DAILY_MAINTENANCE_BREAK',
        setupQuality: 85,
        executabilityScore: 0,
      };
    }

    // Normal Weekday Open Metals
    return createOpenMetalsState(normSym, hour, isQuoteStale, totalMinutesInDay);
  }

  // -------------------------------------------------------------
  // ASSET CLASS: FOREX (EURUSD, GBPUSD, USDJPY, etc.)
  // Trading: Sun 22:00 UTC - Fri 22:00 UTC (Continuous 24/5)
  // Weekend: Fri 22:00 UTC - Sun 22:00 UTC (Closed)
  // -------------------------------------------------------------
  if (assetClass === 'FOREX') {
    // Saturday: Closed all day
    if (dayOfWeek === 6) {
      const minutesUntilSun22 = (24 * 60 - totalMinutesInDay) + (22 * 60);
      return {
        symbol: normSym,
        assetClass: 'FOREX',
        marketState: 'WEEKEND_CLOSED',
        isOpen: false,
        tradeExecutable: false,
        statusLabel: 'WEEKEND CLOSED',
        nextOpenCountdown: formatCountdown(minutesUntilSun22),
        isStaleQuote: isQuoteStale,
        sessionName: 'WEEKEND FOREX CLOSURE',
        openedAt: 'Closed',
        closesAt: 'Friday 22:00 UTC',
        nextOpenAt: 'Sunday 22:00 UTC',
        minutesUntilOpen: minutesUntilSun22,
        minutesUntilClose: 0,
        timezone: 'UTC',
        scheduleSource: 'SESSION SCHEDULE — REFERENCE',
        freshness: 'OFFLINE',
        reason: 'MARKET_CLOSED_WEEKEND',
        setupQuality: 84,
        executabilityScore: 0,
      };
    }

    // Sunday before 22:00 UTC
    if (dayOfWeek === 0) {
      if (hour < 22) {
        const minutesUntilOpen = (22 * 60) - totalMinutesInDay;
        const isPreOpen = minutesUntilOpen <= 45;
        const marketState: MarketState = isPreOpen ? 'PRE_OPEN' : 'WEEKEND_CLOSED';
        return {
          symbol: normSym,
          assetClass: 'FOREX',
          marketState,
          isOpen: false,
          tradeExecutable: false,
          statusLabel: getStatusLabel(marketState),
          nextOpenCountdown: formatCountdown(minutesUntilOpen),
          isStaleQuote: isQuoteStale,
          sessionName: isPreOpen ? 'PRE-OPEN FOREX ROLLOVER' : 'WEEKEND FOREX CLOSURE',
          openedAt: 'Closed',
          closesAt: 'Friday 22:00 UTC',
          nextOpenAt: 'Sunday 22:00 UTC',
          minutesUntilOpen,
          minutesUntilClose: 0,
          timezone: 'UTC',
          scheduleSource: 'SESSION SCHEDULE — REFERENCE',
          freshness: isPreOpen ? 'LIVE' : 'OFFLINE',
          reason: isPreOpen ? 'PRE_OPEN_REVALIDATING' : 'MARKET_CLOSED_WEEKEND',
          setupQuality: 85,
          executabilityScore: 0,
        };
      }
      return createOpenForexState(normSym, hour, isQuoteStale);
    }

    // Friday after 22:00 UTC
    if (dayOfWeek === 5) {
      if (hour >= 22) {
        const minutesUntilSun22 = (24 * 60 - totalMinutesInDay) + (24 * 60) + (22 * 60);
        return {
          symbol: normSym,
          assetClass: 'FOREX',
          marketState: 'WEEKEND_CLOSED',
          isOpen: false,
          tradeExecutable: false,
          statusLabel: 'WEEKEND CLOSED',
          nextOpenCountdown: formatCountdown(minutesUntilSun22),
          isStaleQuote: isQuoteStale,
          sessionName: 'WEEKEND FOREX CLOSURE',
          openedAt: 'Closed',
          closesAt: 'Friday 22:00 UTC',
          nextOpenAt: 'Sunday 22:00 UTC',
          minutesUntilOpen: minutesUntilSun22,
          minutesUntilClose: 0,
          timezone: 'UTC',
          scheduleSource: 'SESSION SCHEDULE — REFERENCE',
          freshness: 'OFFLINE',
          reason: 'MARKET_CLOSED_WEEKEND',
          setupQuality: 83,
          executabilityScore: 0,
        };
      }
      return createOpenForexState(normSym, hour, isQuoteStale);
    }

    // Normal Weekday Forex
    return createOpenForexState(normSym, hour, isQuoteStale);
  }

  // -------------------------------------------------------------
  // ASSET CLASS: INDICES & ENERGIES (US30, US100, USOIL)
  // CME/NYMEX Schedule: Sun 22:00 - Fri 21:00 UTC
  // Daily maintenance break: 21:00 - 22:00 UTC
  // -------------------------------------------------------------
  // Weekend closure
  if (dayOfWeek === 6 || (dayOfWeek === 0 && hour < 22) || (dayOfWeek === 5 && hour >= 21)) {
    let minutesUntilSun22 = 0;
    if (dayOfWeek === 6) {
      minutesUntilSun22 = (24 * 60 - totalMinutesInDay) + (22 * 60);
    } else if (dayOfWeek === 0) {
      minutesUntilSun22 = (22 * 60) - totalMinutesInDay;
    } else {
      minutesUntilSun22 = (24 * 60 - totalMinutesInDay) + (24 * 60) + (22 * 60);
    }
    const isPreOpen = dayOfWeek === 0 && minutesUntilSun22 <= 45;
    const marketState: MarketState = isPreOpen ? 'PRE_OPEN' : 'WEEKEND_CLOSED';
    return {
      symbol: normSym,
      assetClass,
      marketState,
      isOpen: false,
      tradeExecutable: false,
      statusLabel: getStatusLabel(marketState),
      nextOpenCountdown: formatCountdown(minutesUntilSun22),
      isStaleQuote: isQuoteStale,
      sessionName: `${assetClass} WEEKEND CLOSURE`,
      openedAt: 'Closed',
      closesAt: 'Friday 21:00 UTC',
      nextOpenAt: 'Sunday 22:00 UTC',
      minutesUntilOpen: minutesUntilSun22,
      minutesUntilClose: 0,
      timezone: 'UTC',
      scheduleSource: 'SESSION SCHEDULE — REFERENCE',
      freshness: isPreOpen ? 'LIVE' : 'OFFLINE',
      reason: isPreOpen ? 'PRE_OPEN_REVALIDATING' : 'MARKET_CLOSED_WEEKEND',
      setupQuality: 82,
      executabilityScore: 0,
    };
  }

  // Daily CME/NYMEX break 21:00 - 22:00 UTC
  if (hour === 21) {
    const minutesUntilOpen = 60 - minute;
    return {
      symbol: normSym,
      assetClass,
      marketState: 'DAILY_BREAK',
      isOpen: false,
      tradeExecutable: false,
      statusLabel: 'DAILY BREAK',
      nextOpenCountdown: formatCountdown(minutesUntilOpen),
      isStaleQuote: isQuoteStale,
      sessionName: `${assetClass} CME DAILY BREAK`,
      openedAt: 'Closed for break',
      closesAt: '21:00 UTC',
      nextOpenAt: '22:00 UTC',
      minutesUntilOpen,
      minutesUntilClose: 0,
      timezone: 'UTC',
      scheduleSource: 'SESSION SCHEDULE — REFERENCE',
      freshness: 'OFFLINE',
      reason: 'DAILY_MAINTENANCE_BREAK',
      setupQuality: 85,
      executabilityScore: 0,
    };
  }

  // Active Index/Energy session
  const sessionName = getGlobalSessionName(hour);
  const tradeExecutable = !isQuoteStale;
  const minutesUntilClose = (21 * 60) - totalMinutesInDay;
  return {
    symbol: normSym,
    assetClass,
    marketState: 'OPEN',
    isOpen: true,
    tradeExecutable,
    statusLabel: 'SESSION OPEN',
    nextOpenCountdown: '0m',
    nextCloseCountdown: formatCountdown(minutesUntilClose > 0 ? minutesUntilClose : 60),
    isStaleQuote: isQuoteStale,
    sessionName,
    openedAt: '22:00 UTC',
    closesAt: '21:00 UTC',
    nextOpenAt: 'Tomorrow 22:00 UTC',
    minutesUntilOpen: 0,
    minutesUntilClose,
    timezone: 'UTC',
    scheduleSource: 'SESSION SCHEDULE — REFERENCE',
    freshness: isQuoteStale ? 'STALE' : 'LIVE',
    reason: isQuoteStale ? 'DATA_STALE' : undefined,
    setupQuality: 88,
    executabilityScore: tradeExecutable ? 100 : 0,
  };
}

// Helper: Open Metals State
function createOpenMetalsState(symbol: string, utcHour: number, isQuoteStale: boolean, totalMinutesInDay: number): MarketSessionState {
  const sessionName = getGlobalSessionName(utcHour);
  const tradeExecutable = !isQuoteStale;
  const minutesUntilBreak = (21 * 60) - totalMinutesInDay;
  return {
    symbol,
    assetClass: 'METALS',
    marketState: 'OPEN',
    isOpen: true,
    tradeExecutable,
    statusLabel: 'SESSION OPEN',
    nextOpenCountdown: '0m',
    nextCloseCountdown: formatCountdown(minutesUntilBreak > 0 ? minutesUntilBreak : 60),
    isStaleQuote: isQuoteStale,
    sessionName,
    openedAt: '22:00 UTC',
    closesAt: '21:00 UTC',
    nextOpenAt: 'Daily rollover',
    minutesUntilOpen: 0,
    minutesUntilClose: minutesUntilBreak > 0 ? minutesUntilBreak : 360,
    timezone: 'UTC',
    scheduleSource: 'SESSION SCHEDULE — REFERENCE',
    freshness: isQuoteStale ? 'STALE' : 'LIVE',
    reason: isQuoteStale ? 'DATA_STALE' : undefined,
    setupQuality: 89,
    executabilityScore: tradeExecutable ? 100 : 0,
  };
}

// Helper: Open Forex State
function createOpenForexState(symbol: string, utcHour: number, isQuoteStale: boolean): MarketSessionState {
  const sessionName = getGlobalSessionName(utcHour);
  const tradeExecutable = !isQuoteStale;
  return {
    symbol,
    assetClass: 'FOREX',
    marketState: 'OPEN',
    isOpen: true,
    tradeExecutable,
    statusLabel: 'SESSION OPEN',
    nextOpenCountdown: '0m',
    nextCloseCountdown: 'Continuous',
    isStaleQuote: isQuoteStale,
    sessionName,
    openedAt: 'Sunday 22:00 UTC',
    closesAt: 'Friday 22:00 UTC',
    nextOpenAt: 'Continuous 24/5',
    minutesUntilOpen: 0,
    minutesUntilClose: 720,
    timezone: 'UTC',
    scheduleSource: 'SESSION SCHEDULE — REFERENCE',
    freshness: isQuoteStale ? 'STALE' : 'LIVE',
    reason: isQuoteStale ? 'DATA_STALE' : undefined,
    setupQuality: 87,
    executabilityScore: tradeExecutable ? 100 : 0,
  };
}
