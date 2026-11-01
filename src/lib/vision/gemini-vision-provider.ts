/**
 * FEF CORTEX — GEMINI MULTIMODAL VISION PROVIDER
 * 
 * Server-side REST client providing multimodal visual chart intelligence
 * by analyzing standardized 1280x720 3-panel (H4 + H1 + M15) chart images.
 * 
 * Safe Fail-Closed Guarantee:
 * - If GEMINI_API_KEY is absent, returns truthful DATA_LIMITED envelope (0 error throwing).
 * - Enforces 15-minute candle-identity caching to prevent high-frequency API invocations.
 * - Enforces deterministic validation via vision-validator.ts before accepting evidence.
 */

import { OHLCCandle } from '@/lib/market/canonical-market-snapshot';
import { MarketStructure } from '@/lib/market/market-structure-engine';
import {
  createVerifiedEnvelope,
  createFailedClosedEnvelope,
  VerifiedEvidenceEnvelope,
} from '@/lib/providers/canonical-envelope';
import {
  renderMultiTimeframeChart,
  ChartRasterizerInput,
} from './chart-rasterizer';
import {
  VisionOutputContract,
  validateVisionOutput,
} from './vision-validator';

export const DEFAULT_GEMINI_VISION_MODEL = 'gemini-3.8-flash';
export const VISION_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

interface CachedVisionEntry {
  envelope: VerifiedEvidenceEnvelope<VisionOutputContract>;
  cachedAt: number;
}

export class GeminiVisionProvider {
  private static instance: GeminiVisionProvider;
  private readonly cache = new Map<string, CachedVisionEntry>();
  private readonly modelName = DEFAULT_GEMINI_VISION_MODEL;

  public static getInstance(): GeminiVisionProvider {
    if (!GeminiVisionProvider.instance) {
      GeminiVisionProvider.instance = new GeminiVisionProvider();
    }
    return GeminiVisionProvider.instance;
  }

  /**
   * Main entrypoint: generates chart packet, checks cache, invokes Gemini if key is present,
   * validates numerical output, and returns a verified evidence envelope.
   */
  public async analyzeChartPacket(input: ChartRasterizerInput): Promise<VerifiedEvidenceEnvelope<VisionOutputContract>> {
    const symbol = (input.symbol || 'XAUUSD').toUpperCase();
    const h4 = input.h4Candles || [];
    const h1 = input.h1Candles || [];
    const m15 = input.m15Candles || [];

    // 1. Minimum Candle Quantity Check
    if (h4.length < 5 || h1.length < 5 || m15.length < 5) {
      return createFailedClosedEnvelope<VisionOutputContract>(
        'GEMINI_VISION',
        'MULTIMODAL_IMAGE_PERCEPTION',
        `Insufficient multi-timeframe candles to render vision packet for ${symbol} (H4: ${h4.length}, H1: ${h1.length}, M15: ${m15.length})`,
        900
      );
    }

    // 2. Compute Candle-Identity Cache Key
    const h4LastTs = h4[h4.length - 1]?.timestamp || 0;
    const h1LastTs = h1[h1.length - 1]?.timestamp || 0;
    const m15LastTs = m15[m15.length - 1]?.timestamp || 0;
    const cacheKey = `${symbol}_${h4LastTs}_${h1LastTs}_${m15LastTs}`;

    const cached = this.cache.get(cacheKey);
    const now = Date.now();
    if (cached && now - cached.cachedAt < VISION_CACHE_TTL_MS) {
      return cached.envelope;
    }

    // 3. Check API Key without throwing
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey || apiKey.trim() === '') {
      const envelope = createFailedClosedEnvelope<VisionOutputContract>(
        'GEMINI_VISION',
        'MULTIMODAL_IMAGE_PERCEPTION',
        'VISION_PROVIDER_UNAVAILABLE: GEMINI_API_KEY is not configured in server environment',
        900
      );
      this.cache.set(cacheKey, { envelope, cachedAt: now });
      return envelope;
    }

    // 4. Render Deterministic 3-Panel Chart
    let chartPacket;
    try {
      chartPacket = renderMultiTimeframeChart(input);
    } catch (renderErr: any) {
      return createFailedClosedEnvelope<VisionOutputContract>(
        'GEMINI_VISION',
        'MULTIMODAL_IMAGE_PERCEPTION',
        `Chart rasterization failed: ${renderErr?.message || 'Unknown render error'}`,
        900
      );
    }

    // 5. Invoke Gemini Multimodal API via pure REST
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      this.modelName
    )}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;

    const promptText = `
You are an expert institutional technical computer vision agent for trading system FEF CORTEX.
You are inspecting a standardized 3-panel candlestick chart of ${symbol}:
- TOP PANEL: H4 Macro Structure & Key Shelves
- MIDDLE PANEL: H1 Intermediate SMC & Order Flow
- BOTTOM PANEL: M15 Micro Execution & Displacement

Evaluate the visual chart geometry carefully:
1. Pattern morphology: Is there a visual wedge compression, ascending/descending channel, coil, or rectangle?
2. Structure quality: Is price action cleanly trending, choppy noise, compressing, or expanding?
3. Wick rejection clusters: Identify price levels showing multiple rejection wicks / absorption.
4. Liquidity sweeps: Identify visible high/low sweeps and whether they displaced rapidly or failed.
5. Multi-timeframe confluence: Does M15 align with H1 and H4?

Strictly output ONLY valid JSON matching this exact schema:
{
  "symbol": "${symbol}",
  "analyzedAt": "${new Date().toISOString()}",
  "visualTrend": "BULLISH" | "BEARISH" | "CONSOLIDATING",
  "structureQuality": "CLEAN_TRENDING" | "CHOPPY_NOISE" | "COMPRESSING" | "EXPANDING",
  "compressionExpansion": {
    "state": "COMPRESSION" | "EXPANSION" | "BALANCED",
    "patternMorphology": "ASCENDING_WEDGE" | "DESCENDING_WEDGE" | "RECTANGLE_COIL" | "EXPANDING_CHANNEL" | "NONE"
  },
  "wickRejectionClusters": [
    {
      "timeframe": "H4" | "H1" | "M15",
      "level": number,
      "rejectionDirection": "REJECTING_HIGHS" | "REJECTING_LOWS",
      "intensity": "STRONG" | "MODERATE"
    }
  ],
  "visibleLiquiditySweeps": [
    {
      "timeframe": "H4" | "H1" | "M15",
      "sweepLevel": number,
      "sweepType": "BUY_SIDE" | "SELL_SIDE",
      "reaction": "FAST_DISPLACEMENT" | "FAILED_REACTION"
    }
  ],
  "zoneReactionQuality": {
    "fvgRespect": "RESPECTED" | "PIERCED" | "UNTESTED",
    "obRespect": "RESPECTED" | "VIOLATED" | "UNTESTED"
  },
  "visualRegimeTransition": "TREND_CONTINUATION" | "REVERSAL_IMMINENT" | "RANGE_ROTATION",
  "visualDirection": "BULLISH" | "BEARISH" | "NEUTRAL" | "CAUTION",
  "visualConfidence": number between 0 and 100,
  "observations": ["Concise visual claim 1", "Concise visual claim 2"]
}
`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30-second ceiling

      const bodyPayload = {
        contents: [
          {
            parts: [
              { text: promptText },
              {
                inline_data: {
                  mime_type: 'image/png',
                  data: chartPacket.base64Png,
                },
              },
            ],
          },
        ],
        generationConfig: {
          response_mime_type: 'application/json',
          temperature: 0.1,
          thinking_config: {
            thinking_level: 'low',
          },
        },
      };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'FEF-CORTEX-Vision/1.0',
        },
        body: JSON.stringify(bodyPayload),
        signal: controller.signal,
      }).catch((err) => {
        clearTimeout(timeoutId);
        throw err;
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        return createFailedClosedEnvelope<VisionOutputContract>(
          'GEMINI_VISION',
          'MULTIMODAL_IMAGE_PERCEPTION',
          `Gemini Vision API returned HTTP ${res.status}: ${errorText.substring(0, 160)}`,
          900
        );
      }

      const resJson = await res.json();
      const rawText = resJson?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText || typeof rawText !== 'string') {
        return createFailedClosedEnvelope<VisionOutputContract>(
          'GEMINI_VISION',
          'MULTIMODAL_IMAGE_PERCEPTION',
          'Gemini Vision API returned empty text response',
          900
        );
      }

      let parsedPayload: any;
      try {
        parsedPayload = JSON.parse(rawText);
      } catch (parseErr) {
        return createFailedClosedEnvelope<VisionOutputContract>(
          'GEMINI_VISION',
          'MULTIMODAL_IMAGE_PERCEPTION',
          'Gemini Vision response was not valid JSON',
          900
        );
      }

      // 6. Deterministic Hallucination Validation
      const allCandles = [...h4, ...h1, ...m15];
      const validation = validateVisionOutput(parsedPayload, symbol, allCandles, input.currentPrice);

      if (!validation.isValid || !validation.sanitizedOutput) {
        return createFailedClosedEnvelope<VisionOutputContract>(
          'GEMINI_VISION',
          'MULTIMODAL_IMAGE_PERCEPTION',
          `Vision validation failed: ${validation.reasons.join('; ')}`,
          900
        );
      }

      // 7. Pack into Verified Evidence Envelope
      const envelope = createVerifiedEnvelope<VisionOutputContract>({
        provider: 'GEMINI_VISION',
        sourceType: 'MULTIMODAL_IMAGE_PERCEPTION',
        observedAt: new Date().toISOString(),
        maxStalenessSec: 900,
        payload: validation.sanitizedOutput,
      });

      this.cache.set(cacheKey, { envelope, cachedAt: now });
      return envelope;
    } catch (err: any) {
      const isTimeout = err?.name === 'AbortError' || (err?.message && err.message.includes('timeout'));
      const errorMsg = isTimeout
        ? 'Gemini Vision provider request timed out (30s limit)'
        : `Gemini Vision ingestion failed: ${err?.message || 'Network / Provider error'}`;

      const envelope = createFailedClosedEnvelope<VisionOutputContract>(
        'GEMINI_VISION',
        'MULTIMODAL_IMAGE_PERCEPTION',
        errorMsg,
        900
      );
      return envelope;
    }
  }

  /**
   * Reset cache (for test suites).
   */
  public clearCache(): void {
    this.cache.clear();
  }
}

export const geminiVisionProvider = GeminiVisionProvider.getInstance();
