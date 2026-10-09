/**
 * FEF CORTEX — EXECUTION BRIDGE V2 VALIDATOR
 * Master Consolidation V2: Fail-Closed Order Validation & Safety Gates
 */

import {
  ExecutionCommand,
  BrokerContractSpec,
  BrokerAccountTelemetry,
  BrokerQuoteTelemetry,
} from './types';
import { symbolDirectory } from '../bridge/symbol-mapper';
import { getMarketDefinition } from '../registry/market-registry';

export interface ValidationResult {
  valid: boolean;
  errorCode?: string;
  errorMessage?: string;
  sanitizedCommand?: ExecutionCommand;
}

export interface ValidationContext {
  account: BrokerAccountTelemetry | null;
  spec: BrokerContractSpec | null;
  quote: BrokerQuoteTelemetry | null;
  maxQuoteAgeMs?: number;
}

export const DEFAULT_MAX_QUOTE_AGE_MS = 10000;

export class ExecutionV2Validator {
  /**
   * Validate an execution command before dispatch
   */
  public static validate(
    command: ExecutionCommand,
    context: ValidationContext
  ): ValidationResult {
    // 1. Mandatory Identity & Payload Fields
    if (!command || !command.executionId || typeof command.executionId !== 'string') {
      return {
        valid: false,
        errorCode: 'INVALID_EXECUTION_ID',
        errorMessage: 'Execution command must have a unique non-empty executionId',
      };
    }

    if (!command.symbol || typeof command.symbol !== 'string') {
      return {
        valid: false,
        errorCode: 'INVALID_SYMBOL',
        errorMessage: 'Symbol is required',
      };
    }

    const normSymbol = command.symbol.trim().toUpperCase();

    // 2. Strict Real Account Hard-Lock
    if (context.account) {
      if (context.account.tradeMode === 'REAL') {
        return {
          valid: false,
          errorCode: 'REAL_ACCOUNT_HARD_LOCKED',
          errorMessage: 'REAL / LIVE trading is strictly disabled and hard-locked in FEF Cortex V2.',
        };
      }
      if (!context.account.tradeAllowed) {
        return {
          valid: false,
          errorCode: 'TRADE_DISABLED_ON_ACCOUNT',
          errorMessage: 'Trading is currently disabled on this MT5 terminal / account.',
        };
      }
    }

    // 3. Fail-Closed Symbol Resolution (NEVER default to XAUUSD or FOREX)
    const cortexDef = getMarketDefinition(normSymbol);
    const directoryEntry = (symbolDirectory as Record<string, any>)[normSymbol];

    if (!cortexDef && !directoryEntry) {
      return {
        valid: false,
        errorCode: 'REJECTED_UNKNOWN_SYMBOL',
        errorMessage: `Symbol ${normSymbol} is not registered in Cortex. Fail-closed: No fallback permitted.`,
      };
    }

    const category = cortexDef?.category;
    if (!category || (category as string) === 'UNKNOWN') {
      return {
        valid: false,
        errorCode: 'REJECTED_UNKNOWN_CATEGORY',
        errorMessage: `Asset category for ${normSymbol} is unknown. Fail-closed: No FOREX fallback permitted.`,
      };
    }

    // 4. Broker Contract Spec Gate
    const spec = context.spec;
    if (!spec) {
      return {
        valid: false,
        errorCode: 'CONTRACT_SPEC_UNAVAILABLE',
        errorMessage: `Broker contract spec for ${normSymbol} is not published by MT5. Fail-closed: execution halted.`,
      };
    }

    // 5. Volume & Lot Step Validation
    const volume = command.volume;
    if (typeof volume !== 'number' || isNaN(volume) || volume <= 0) {
      return {
        valid: false,
        errorCode: 'INVALID_VOLUME',
        errorMessage: `Volume must be a positive finite number, received: ${volume}`,
      };
    }

    if (volume < spec.volumeMin) {
      return {
        valid: false,
        errorCode: 'VOLUME_BELOW_MINIMUM',
        errorMessage: `Requested volume ${volume} is below broker minimum of ${spec.volumeMin}`,
      };
    }

    if (volume > spec.volumeMax) {
      return {
        valid: false,
        errorCode: 'VOLUME_EXCEEDS_MAXIMUM',
        errorMessage: `Requested volume ${volume} exceeds broker maximum of ${spec.volumeMax}`,
      };
    }

    // Check step precision divisibility
    const stepDiff = (volume - spec.volumeMin) / spec.volumeStep;
    const roundedStepDiff = Math.round(stepDiff);
    if (Math.abs(stepDiff - roundedStepDiff) > 1e-5) {
      return {
        valid: false,
        errorCode: 'VOLUME_STEP_MISMATCH',
        errorMessage: `Volume ${volume} does not conform to broker step of ${spec.volumeStep}`,
      };
    }

    // 6. Directional Geometry & Stops Level Gate
    const price = command.requestedPrice;
    if (typeof price !== 'number' || isNaN(price) || price <= 0) {
      return {
        valid: false,
        errorCode: 'INVALID_ENTRY_PRICE',
        errorMessage: `Requested price must be positive, received: ${price}`,
      };
    }

    const minStopDistance = (spec.stopsLevel || 0) * spec.point;

    if (command.side === 'BUY') {
      if (typeof command.stopLoss === 'number' && command.stopLoss > 0) {
        if (command.stopLoss >= price) {
          return {
            valid: false,
            errorCode: 'INVALID_STOP_GEOMETRY',
            errorMessage: `BUY Stop Loss (${command.stopLoss}) must be strictly below entry price (${price})`,
          };
        }
        if (minStopDistance > 0 && price - command.stopLoss < minStopDistance) {
          return {
            valid: false,
            errorCode: 'STOPS_LEVEL_VIOLATION',
            errorMessage: `Stop Loss is closer to entry (${(price - command.stopLoss).toFixed(spec.digits)}) than broker stopsLevel allows (${minStopDistance})`,
          };
        }
      }
      if (typeof command.takeProfit === 'number' && command.takeProfit > 0) {
        if (command.takeProfit <= price) {
          return {
            valid: false,
            errorCode: 'INVALID_STOP_GEOMETRY',
            errorMessage: `BUY Take Profit (${command.takeProfit}) must be strictly above entry price (${price})`,
          };
        }
        if (minStopDistance > 0 && command.takeProfit - price < minStopDistance) {
          return {
            valid: false,
            errorCode: 'STOPS_LEVEL_VIOLATION',
            errorMessage: `Take Profit is closer to entry than broker stopsLevel allows (${minStopDistance})`,
          };
        }
      }
    } else if (command.side === 'SELL') {
      if (typeof command.stopLoss === 'number' && command.stopLoss > 0) {
        if (command.stopLoss <= price) {
          return {
            valid: false,
            errorCode: 'INVALID_STOP_GEOMETRY',
            errorMessage: `SELL Stop Loss (${command.stopLoss}) must be strictly above entry price (${price})`,
          };
        }
        if (minStopDistance > 0 && command.stopLoss - price < minStopDistance) {
          return {
            valid: false,
            errorCode: 'STOPS_LEVEL_VIOLATION',
            errorMessage: `Stop Loss is closer to entry than broker stopsLevel allows (${minStopDistance})`,
          };
        }
      }
      if (typeof command.takeProfit === 'number' && command.takeProfit > 0) {
        if (command.takeProfit >= price) {
          return {
            valid: false,
            errorCode: 'INVALID_STOP_GEOMETRY',
            errorMessage: `SELL Take Profit (${command.takeProfit}) must be strictly below entry price (${price})`,
          };
        }
        if (minStopDistance > 0 && price - command.takeProfit < minStopDistance) {
          return {
            valid: false,
            errorCode: 'STOPS_LEVEL_VIOLATION',
            errorMessage: `Take Profit is closer to entry than broker stopsLevel allows (${minStopDistance})`,
          };
        }
      }
    } else {
      return {
        valid: false,
        errorCode: 'INVALID_SIDE',
        errorMessage: `Side must be BUY or SELL, received: ${command.side}`,
      };
    }

    // 7. Broker Quote Freshness Gate
    const maxAge = context.maxQuoteAgeMs || DEFAULT_MAX_QUOTE_AGE_MS;
    if (context.quote) {
      const now = Date.now();
      const quoteAge = now - context.quote.timestamp;
      if (quoteAge > maxAge) {
        return {
          valid: false,
          errorCode: 'QUOTE_STALE',
          errorMessage: `Broker quote for ${normSymbol} is stale (${quoteAge}ms > max ${maxAge}ms)`,
        };
      }
    }

    // 8. Expiration & Slippage Defaults
    const now = Date.now();
    const sanitizedCommand: ExecutionCommand = {
      ...command,
      symbol: normSymbol,
      volume: +volume.toFixed(4),
      requestedPrice: +price.toFixed(spec.digits),
      stopLoss: command.stopLoss ? +command.stopLoss.toFixed(spec.digits) : undefined,
      takeProfit: command.takeProfit ? +command.takeProfit.toFixed(spec.digits) : undefined,
      slippagePoints: command.slippagePoints || 10,
      magicNumber: command.magicNumber || 888002,
      createdAt: command.createdAt || now,
      expiresAt: command.expiresAt || (now + 10000), // 10s default TTL
    };

    return {
      valid: true,
      sanitizedCommand,
    };
  }
}
