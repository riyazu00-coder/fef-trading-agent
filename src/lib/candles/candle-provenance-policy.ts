/**
 * Server-side candle provenance trust policy.
 *
 * Browser/request payloads are never source identities. These identities may
 * only be selected by server code after the local bridge token or remote relay
 * connector authentication boundary has already been crossed.
 */
export type TrustedBrokerCandleSource =
  | 'AUTHENTICATED_LOCAL_MT5_BRIDGE'
  | 'AUTHENTICATED_REMOTE_MT5_RELAY';

export interface TrustedBrokerCandleIdentity {
  sourceIdentity: TrustedBrokerCandleSource;
  broker: string;
  server?: string;
}

export interface CanonicalBrokerCandleProvenance {
  provider: string;
  broker: string;
  server?: string;
  source: 'MT5_BROKER_OHLC';
  provenance: 'LIVE_MT5';
  authenticatedSource: TrustedBrokerCandleSource;
}

export const CANDLE_MUTATION_DENIAL = {
  allowed: false,
  code: 'CANDLE_MUTATION_DISABLED',
  message: 'Public candle ingestion is disabled. Broker candles are accepted only through authenticated bridge and relay transports.',
} as const;

export function evaluateExternalCandleMutation(): typeof CANDLE_MUTATION_DENIAL {
  return CANDLE_MUTATION_DENIAL;
}

export function deriveTrustedBrokerCandleProvenance(
  identity: TrustedBrokerCandleIdentity
): CanonicalBrokerCandleProvenance {
  if (
    identity.sourceIdentity !== 'AUTHENTICATED_LOCAL_MT5_BRIDGE' &&
    identity.sourceIdentity !== 'AUTHENTICATED_REMOTE_MT5_RELAY'
  ) {
    throw new Error('UNTRUSTED_CANDLE_SOURCE');
  }

  const broker = String(identity.broker || '').trim();
  if (!broker) throw new Error('BROKER_IDENTITY_REQUIRED');

  return {
    provider: broker,
    broker,
    server: identity.server ? String(identity.server).trim() : undefined,
    source: 'MT5_BROKER_OHLC',
    provenance: 'LIVE_MT5',
    authenticatedSource: identity.sourceIdentity,
  };
}
