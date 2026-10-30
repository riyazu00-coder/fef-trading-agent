/**
 * FEF CORTEX — AGENT READINESS EXPLAINER
 *
 * Client-safe, isomorphic explanation of agent readiness states.
 * Provides transparent justification when external data feeds are missing.
 * Invariant: Zero synthetic data fabrication.
 */

export interface AgentReadinessExplanation {
  status: 'READY' | 'DATA_LIMITED' | 'UNAVAILABLE';
  isExpected: boolean;
  requiredFeed: string;
  explanation: string;
}

export function getAgentReadinessExplanation(
  agentId: string,
  status: string
): AgentReadinessExplanation {
  const normId = (agentId || '').toLowerCase().replace(/[-\s]/g, '_');
  const isDataLimited = status === 'DATA LIMITED' || status === 'DATA_LIMITED';
  const isUnavailable = status === 'UNAVAILABLE' || status === 'NOT_SUPPORTED';

  if (!isDataLimited && !isUnavailable) {
    return {
      status: 'READY',
      isExpected: false,
      requiredFeed: 'Verified MT5 Broker Candles (OHLC)',
      explanation: 'Active and calculating on real verified broker candlestick data from local SQLite database.',
    };
  }

  if (isUnavailable) {
    return {
      status: 'UNAVAILABLE',
      isExpected: true,
      requiredFeed: 'Broker Symbol Subscription',
      explanation: 'Symbol is not supported or trade-disabled by the connected broker (e.g. GER40 on Exness Demo).',
    };
  }

  // Specific data-limited explanations for specialized external agents
  switch (normId) {
    case 'cot_positioning':
    case 'cot_positioning_specialist':
      return {
        status: 'DATA_LIMITED',
        isExpected: true,
        requiredFeed: 'CFTC Commitment of Traders (COT) Reports',
        explanation: 'Requires weekly institutional COT positioning reports from CFTC. Retail MT5 brokers do not provide this feed; zero-fabrication safety rule prevents simulated data.',
      };
    case 'order_flow_delta':
    case 'order_flow_delta_specialist':
      return {
        status: 'DATA_LIMITED',
        isExpected: true,
        requiredFeed: 'Level 2 Depth of Market (DOM) / Order Flow Delta',
        explanation: 'Requires multi-level order book and bid/ask volume delta. MT5 demo provides standard Level 1 quotes and tick volume only.',
      };
    case 'central_bank_policy':
    case 'central_bank_policy_specialist':
      return {
        status: 'DATA_LIMITED',
        isExpected: true,
        requiredFeed: 'Central Bank Policy Statements & Rates Wires',
        explanation: 'Requires institutional macroeconomic wire feed for Federal Reserve, ECB, and BOE statements.',
      };
    case 'economic_news_momentum':
    case 'economic_news_momentum_specialist':
      return {
        status: 'DATA_LIMITED',
        isExpected: true,
        requiredFeed: 'Economic Calendar High-Impact Event Feeds',
        explanation: 'Requires live economic release data feeds. Standby mode enforces DATA LIMITED until verified event feed attaches.',
      };
    case 'quant_monte_carlo':
    case 'quant_monte_carlo_specialist':
      return {
        status: 'DATA_LIMITED',
        isExpected: true,
        requiredFeed: 'Deep Multi-Year Tick History Series',
        explanation: 'Requires extended tick-level historical samples to compute empirical path distributions.',
      };
    case 'institutional_order_blocks':
    case 'institutional_order_blocks_specialist':
      return {
        status: 'DATA_LIMITED',
        isExpected: true,
        requiredFeed: 'True Institutional Volume Profile / Clearing Feed',
        explanation: 'Derives conservative volume proxies from available OHLCV bars without fabricating dark-pool prints.',
      };
    default:
      return {
        status: 'DATA_LIMITED',
        isExpected: true,
        requiredFeed: 'External Non-Broker Data Feed',
        explanation: 'Agent requires verified external data not provided in standard broker L1 feed. Zero synthetic data rule preserves analytical integrity.',
      };
  }
}

// CommonJS support for Node test scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getAgentReadinessExplanation,
  };
}

