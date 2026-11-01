/**
 * FEF CORTEX — SAFE DRY-RUN SIMULATION ENGINE
 *
 * Simulates the complete end-to-end signal delivery pipeline:
 * CORTEX Intelligence → Signal Eligibility → Card Renderer → Telegram Caption Formatter → Delivery Adapter → Receipt
 *
 * SAFETY INVARIANT:
 * Strictly zero network calls to api.telegram.org.
 */

import { evaluateSignalEligibility, ValidatedSignalPayload, EligibilityResult } from './telegram-signal-eligibility';
import { renderSignalCardPng, resolveInstrumentCategory } from './telegram-image-renderer';
import { telegramClient, CANONICAL_CHANNEL_USERNAME } from './telegram-client';
import { telegramPersistence } from './telegram-persistence';
import { DecisionIntelligenceV2 } from '../decision/decision-engine-v2';
import { SetupIntelligenceV3 } from '../setup/setup-intelligence-v3';

export interface DryRunDeliveryReceipt {
  simulationTimestamp: string;
  signalId: string;
  instrument: string;
  category: string;
  heroImageFile: string;
  cardFilename: string;
  imageDimensions: string;
  imageSizeBytes: number;
  captionValidation: {
    validHtml: boolean;
    characterCount: number;
    fitsTelegramLimit: boolean;
    fieldsPresent: {
      instrumentAndCategory: boolean;
      direction: boolean;
      entryZone: boolean;
      takeProfits: boolean;
      stopLoss: boolean;
      strategyAndTimeframe: boolean;
      confidenceAndRiskReward: boolean;
      signalInsight: boolean;
      utcTimestamp: boolean;
      signalId: boolean;
      officialWebsiteLinks: boolean;
    };
  };
  destinationConfigStatus: {
    canonicalDestination: string;
    isAllowlisted: boolean;
    privateGroupsProhibited: boolean;
    destinationType: 'PUBLIC_CHANNEL';
  };
  duplicateCheck: {
    idempotencyKey: string;
    isDuplicate: boolean;
    knownKeyCount: number;
  };
  eligibilityResult: {
    isEligible: boolean;
    status: string;
    rejectionReason?: string;
  };
  simulatedDeliveryStatus: 'DELIVERED_DRY_RUN' | 'REJECTED_AT_GATE' | 'SIMULATION_ERROR';
  rawCaptionPreview: string;
}

export async function simulateDryRunDelivery(
  decision: DecisionIntelligenceV2 | null | undefined,
  setup: SetupIntelligenceV3 | null | undefined,
  telemetry: any,
  options?: {
    knownKeysOverride?: Set<string>;
    allowInvalidationNotice?: boolean;
    previousSetup?: { entryMidpoint: number; stopLoss: number; tp1: number };
  }
): Promise<DryRunDeliveryReceipt> {
  const timestamp = new Date().toISOString();
  const knownKeys = options?.knownKeysOverride || telegramPersistence.getKnownIdempotencyKeys();

  // 1. Evaluate Signal Eligibility Gate (21 checks)
  const eligibility = evaluateSignalEligibility(
    decision,
    setup,
    telemetry,
    knownKeys,
    {
      allowInvalidationNotice: options?.allowInvalidationNotice,
      previousSetup: options?.previousSetup,
    }
  );

  const symbol = (setup?.symbol || telemetry?.symbol || 'UNKNOWN').toUpperCase();
  const theme = resolveInstrumentCategory(symbol);
  const destinationSafety = telegramClient.verifyDestinationSafety(CANONICAL_CHANNEL_USERNAME);

  if (!eligibility.isEligible || !eligibility.payload) {
    const rawIdemKey = `${symbol}_${setup?.setupId || 'NO_SETUP'}_1`;
    return {
      simulationTimestamp: timestamp,
      signalId: `REJ-${symbol}-${Date.now().toString(36).toUpperCase()}`,
      instrument: symbol,
      category: theme.category,
      heroImageFile: theme.heroImageFile,
      cardFilename: `signal-${symbol.toLowerCase()}-card.png`,
      imageDimensions: 'N/A (Skipped on rejection)',
      imageSizeBytes: 0,
      captionValidation: {
        validHtml: false,
        characterCount: 0,
        fitsTelegramLimit: true,
        fieldsPresent: {
          instrumentAndCategory: false,
          direction: false,
          entryZone: false,
          takeProfits: false,
          stopLoss: false,
          strategyAndTimeframe: false,
          confidenceAndRiskReward: false,
          signalInsight: false,
          utcTimestamp: false,
          signalId: false,
          officialWebsiteLinks: false,
        },
      },
      destinationConfigStatus: {
        canonicalDestination: CANONICAL_CHANNEL_USERNAME,
        isAllowlisted: destinationSafety.isValid,
        privateGroupsProhibited: true,
        destinationType: 'PUBLIC_CHANNEL',
      },
      duplicateCheck: {
        idempotencyKey: rawIdemKey,
        isDuplicate: knownKeys.has(rawIdemKey),
        knownKeyCount: knownKeys.size,
      },
      eligibilityResult: {
        isEligible: false,
        status: eligibility.status,
        rejectionReason: eligibility.rejectionReason,
      },
      simulatedDeliveryStatus: 'REJECTED_AT_GATE',
      rawCaptionPreview: '',
    };
  }

  const payload = eligibility.payload;

  // 2. Render 1080x1350 PNG Card (In-Memory)
  const pngBuffer = await renderSignalCardPng(payload);

  // 3. Format & Validate Telegram Caption
  const caption = telegramClient.formatSignalCaption(payload);
  const charCount = caption.length;
  const fitsTelegram = charCount <= 1024;

  const fieldsCheck = {
    instrumentAndCategory: caption.includes(payload.symbol) && caption.includes(payload.direction),
    direction: caption.includes('BUY') || caption.includes('SELL'),
    entryZone: caption.includes('Entry') || caption.includes('Reference Level'),
    takeProfits: caption.includes('TP1') || payload.messageType === 'SETUP_INVALIDATED',
    stopLoss: caption.includes('Stop Loss') || payload.messageType === 'SETUP_INVALIDATED',
    strategyAndTimeframe: caption.includes('Multi-Model') || caption.includes(payload.timeframe),
    confidenceAndRiskReward: caption.includes('Conf') || payload.messageType === 'SETUP_INVALIDATED',
    signalInsight: caption.includes('Insight') || caption.includes('Reason'),
    utcTimestamp: caption.includes('UTC'),
    signalId: caption.includes(payload.signalId),
    officialWebsiteLinks: caption.includes('app.feftradingsolutions.com') && caption.includes('www.feftradingsolutions.com'),
  };

  const validHtml = !caption.includes('<script>') && !caption.includes('undefined') && caption.includes('<b>');

  // 4. Simulate Dry-Run Delivery
  const sendResult = await telegramClient.sendSignalPhoto({
    chatId: CANONICAL_CHANNEL_USERNAME,
    photoBuffer: pngBuffer,
    caption,
  });

  return {
    simulationTimestamp: timestamp,
    signalId: payload.signalId,
    instrument: payload.symbol,
    category: theme.category,
    heroImageFile: theme.heroImageFile,
    cardFilename: `signal-${payload.symbol.toLowerCase()}-${payload.signalId}.png`,
    imageDimensions: '1080x1350',
    imageSizeBytes: pngBuffer.length,
    captionValidation: {
      validHtml,
      characterCount: charCount,
      fitsTelegramLimit: fitsTelegram,
      fieldsPresent: fieldsCheck,
    },
    destinationConfigStatus: {
      canonicalDestination: CANONICAL_CHANNEL_USERNAME,
      isAllowlisted: destinationSafety.isValid,
      privateGroupsProhibited: true,
      destinationType: 'PUBLIC_CHANNEL',
    },
    duplicateCheck: {
      idempotencyKey: payload.idempotencyKey,
      isDuplicate: knownKeys.has(payload.idempotencyKey),
      knownKeyCount: knownKeys.size,
    },
    eligibilityResult: {
      isEligible: true,
      status: 'ELIGIBLE',
    },
    simulatedDeliveryStatus: sendResult.success && sendResult.isDryRun ? 'DELIVERED_DRY_RUN' : 'SIMULATION_ERROR',
    rawCaptionPreview: caption,
  };
}

