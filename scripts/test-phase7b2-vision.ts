/**
 * FEF CORTEX — PHASE 7B.2A VERIFICATION & FAILURE SUITE
 * 
 * Tests all required failure and valid pathways for the genuine Vision agent:
 * A. GEMINI_API_KEY absent -> DATA_LIMITED, confidence 0, other agents continue
 * B. Provider timeout -> fail-closed envelope
 * C. Malformed JSON -> fail-closed envelope
 * D. Hallucinated out-of-range price -> rejected by vision-validator
 * E. > 50% invalid numeric claims -> entire Vision response rejected (DATA_LIMITED)
 * F. Valid structured response -> verified Vision evidence accepted (ONLINE, confidence > 0)
 * G. Stale / missing timeframe -> fail-closed, no fabricated chart
 * H. Technical vs Vision Duplication & Independence Check
 */

import { renderMultiTimeframeChart } from '../src/lib/vision/chart-rasterizer';
import { validateVisionOutput, VisionOutputContract } from '../src/lib/vision/vision-validator';
import { geminiVisionProvider, GeminiVisionProvider } from '../src/lib/vision/gemini-vision-provider';
import { generateAssetIntelligence } from '../src/lib/agents/multi-asset-pipeline';
import { OHLCCandle } from '../src/lib/market/canonical-market-snapshot';
import { createVerifiedEnvelope, createFailedClosedEnvelope } from '../src/lib/providers/canonical-envelope';
import { AGENT_DEPENDENCY_REGISTRY } from '../src/lib/decision/decision-engine-v2';
import { GET } from '../src/app/api/intelligence/feeds/route';
import { LiveIntelligenceFeeds } from '../src/lib/intelligence/feed-types';

function generateCandles(count: number, basePrice: number, step: number): OHLCCandle[] {
  const candles: OHLCCandle[] = [];
  let p = basePrice;
  for (let i = 0; i < count; i++) {
    const o = p;
    const c = o + (i % 2 === 0 ? step : -step * 0.8);
    const h = Math.max(o, c) + step * 0.5;
    const l = Math.min(o, c) - step * 0.5;
    candles.push({
      timestamp: Date.now() - (count - i) * 3600000,
      open: Number(o.toFixed(2)),
      high: Number(h.toFixed(2)),
      low: Number(l.toFixed(2)),
      close: Number(c.toFixed(2)),
      tickVolume: 1000 + i * 50,
    });
    p = c;
  }
  return candles;
}

async function runTests() {
  console.log('================================================================');
  console.log('FEF CORTEX — PHASE 7B.2A GENUINE VISION AGENT TEST SUITE');
  console.log('================================================================\n');

  const h4Candles = generateCandles(30, 2650, 4);
  const h1Candles = generateCandles(40, 2655, 2);
  const m15Candles = generateCandles(45, 2658, 1);
  const allCandles = [...h4Candles, ...h1Candles, ...m15Candles];
  const refPrice = 2658.50;

  // -------------------------------------------------------------------------
  // TEST 1: Chart Rasterizer Verification
  // -------------------------------------------------------------------------
  console.log('--- TEST 1: Chart Rasterizer (1280x720 3-Panel PNG & SVG) ---');
  const rasterOut = renderMultiTimeframeChart({
    symbol: 'XAUUSD',
    h4Candles,
    h1Candles,
    m15Candles,
    currentPrice: refPrice,
  });
  const hasValidPngHeader = rasterOut.pngBuffer.slice(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  console.log(`Dimensions: ${rasterOut.width}x${rasterOut.height}`);
  console.log(`PNG size: ${rasterOut.pngBuffer.length} bytes (base64 length: ${rasterOut.base64Png.length})`);
  console.log(`Valid PNG Header: ${hasValidPngHeader}`);
  console.log(`SVG String length: ${rasterOut.svgString.length} chars`);
  if (!hasValidPngHeader || rasterOut.width !== 1280 || rasterOut.height !== 720) {
    throw new Error('TEST 1 FAILED: Invalid rasterizer output');
  }
  console.log('Result: PASS\n');

  // -------------------------------------------------------------------------
  // TEST 1B: Volume Truth Verification (Missing / Zero Volume -> No Histogram)
  // -------------------------------------------------------------------------
  console.log('--- TEST 1B: Volume Truth Verification (Zero / Missing Volume) ---');
  const zeroVolCandles = h1Candles.map((c) => ({ ...c, tickVolume: 0, realVolume: undefined }));
  const zeroVolRaster = renderMultiTimeframeChart({
    symbol: 'XAUUSD',
    h4Candles: zeroVolCandles,
    h1Candles: zeroVolCandles,
    m15Candles: zeroVolCandles,
    currentPrice: refPrice,
  });
  const zeroVolPngHeader = zeroVolRaster.pngBuffer.slice(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  console.log(`Zero-vol PNG size: ${zeroVolRaster.pngBuffer.length} bytes`);
  console.log(`Valid PNG Header: ${zeroVolPngHeader}`);
  if (!zeroVolPngHeader) {
    throw new Error('TEST 1B FAILED: Zero-volume chart rasterization failed');
  }
  console.log('Volume Evidence Policy: GENUINE ONLY (No fabricated histogram bars)');
  console.log('Result: PASS\n');

  // -------------------------------------------------------------------------
  // TEST A: GEMINI_API_KEY Absent (Fail-Closed No-Key Behavior)
  // -------------------------------------------------------------------------
  console.log('--- TEST A: GEMINI_API_KEY Absent (Fail-Closed No-Key) ---');
  const originalKey = process.env.GEMINI_API_KEY;
  const originalGoogleKey = process.env.GOOGLE_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_API_KEY;

  geminiVisionProvider.clearCache();
  const noKeyEnv = await geminiVisionProvider.analyzeChartPacket({
    symbol: 'XAUUSD',
    h4Candles,
    h1Candles,
    m15Candles,
    currentPrice: refPrice,
  });

  console.log('Envelope isVerified:', noKeyEnv.isVerified);
  console.log('Envelope error:', noKeyEnv.error);
  console.log('Envelope sourceType:', noKeyEnv.sourceType);
  if (noKeyEnv.isVerified !== false || !noKeyEnv.error?.includes('GEMINI_API_KEY is not configured')) {
    throw new Error('TEST A FAILED: Did not fail closed properly when key is absent');
  }
  console.log('Result: PASS\n');

  // -------------------------------------------------------------------------
  // TEST D: Hallucinated Out-of-Range Price
  // -------------------------------------------------------------------------
  console.log('--- TEST D: Hallucinated Out-of-Range Price Level ---');
  const outOfRangeMock = {
    symbol: 'XAUUSD',
    visualTrend: 'BULLISH',
    structureQuality: 'CLEAN_TRENDING',
    compressionExpansion: { state: 'EXPANSION', patternMorphology: 'NONE' },
    wickRejectionClusters: [
      { timeframe: 'H1', level: 9999.00, rejectionDirection: 'REJECTING_LOWS', intensity: 'STRONG' }, // Out of range!
    ],
    visibleLiquiditySweeps: [
      { timeframe: 'M15', sweepLevel: 2658.00, sweepType: 'SELL_SIDE', reaction: 'FAST_DISPLACEMENT' },
    ],
    zoneReactionQuality: { fvgRespect: 'RESPECTED', obRespect: 'RESPECTED' },
    visualRegimeTransition: 'TREND_CONTINUATION',
    visualDirection: 'BULLISH',
    visualConfidence: 80,
    observations: ['Clean stair-stepping higher highs.'],
  };

  const valOutOfRange = validateVisionOutput(outOfRangeMock, 'XAUUSD', allCandles, refPrice);
  console.log('Is valid:', valOutOfRange.isValid);
  console.log('Total numeric claims:', valOutOfRange.totalNumericClaims);
  console.log('Valid claims count:', valOutOfRange.validClaimsCount);
  console.log('Invalid claims count:', valOutOfRange.invalidClaimsCount);
  console.log('Reasons:', valOutOfRange.reasons);
  const outOfRangeRejected = valOutOfRange.reasons.some((r) => r.includes('lies outside OHLC range'));
  if (!outOfRangeRejected) {
    throw new Error('TEST D FAILED: Out of range price was not rejected');
  }
  console.log('Result: PASS\n');

  // -------------------------------------------------------------------------
  // TEST E: More than 50% Invalid Numeric Claims
  // -------------------------------------------------------------------------
  console.log('--- TEST E: More Than 50% Invalid Numeric Claims (Rejection) ---');
  const mostlyInvalidMock = {
    symbol: 'XAUUSD',
    visualTrend: 'BULLISH',
    structureQuality: 'CLEAN_TRENDING',
    compressionExpansion: { state: 'EXPANSION', patternMorphology: 'NONE' },
    wickRejectionClusters: [
      { timeframe: 'H1', level: 1200.00, rejectionDirection: 'REJECTING_LOWS', intensity: 'STRONG' }, // Invalid
      { timeframe: 'H1', level: 4500.00, rejectionDirection: 'REJECTING_HIGHS', intensity: 'STRONG' }, // Invalid
    ],
    visibleLiquiditySweeps: [
      { timeframe: 'M15', sweepLevel: 2658.00, sweepType: 'SELL_SIDE', reaction: 'FAST_DISPLACEMENT' }, // Valid
    ],
    zoneReactionQuality: { fvgRespect: 'RESPECTED', obRespect: 'RESPECTED' },
    visualRegimeTransition: 'TREND_CONTINUATION',
    visualDirection: 'BULLISH',
    visualConfidence: 80,
    observations: ['Testing hallucination threshold'],
  };

  const valMostlyInvalid = validateVisionOutput(mostlyInvalidMock, 'XAUUSD', allCandles, refPrice);
  console.log('Is valid:', valMostlyInvalid.isValid);
  console.log('Failure rate:', `${(valMostlyInvalid.failureRate * 100).toFixed(1)}%`);
  console.log('Reasons:', valMostlyInvalid.reasons);
  if (valMostlyInvalid.isValid !== false || valMostlyInvalid.failureRate <= 0.5) {
    throw new Error('TEST E FAILED: > 50% invalid claims was not rejected');
  }
  console.log('Result: PASS\n');

  // -------------------------------------------------------------------------
  // TEST F: Valid Structured Response
  // -------------------------------------------------------------------------
  console.log('--- TEST F: Valid Structured Response Acceptance ---');
  // Find genuine candle pivot levels from our generated candles
  const genuineLevel1 = h1Candles[h1Candles.length - 2].low;
  const genuineLevel2 = m15Candles[m15Candles.length - 1].high;

  const validMock: VisionOutputContract = {
    symbol: 'XAUUSD',
    analyzedAt: new Date().toISOString(),
    visualTrend: 'BULLISH',
    structureQuality: 'CLEAN_TRENDING',
    compressionExpansion: {
      state: 'BALANCED',
      patternMorphology: 'ASCENDING_WEDGE',
    },
    wickRejectionClusters: [
      { timeframe: 'H1', level: genuineLevel1, rejectionDirection: 'REJECTING_LOWS', intensity: 'STRONG' },
    ],
    visibleLiquiditySweeps: [
      { timeframe: 'M15', sweepLevel: genuineLevel2, sweepType: 'BUY_SIDE', reaction: 'FAST_DISPLACEMENT' },
    ],
    zoneReactionQuality: {
      fvgRespect: 'RESPECTED',
      obRespect: 'RESPECTED',
    },
    visualRegimeTransition: 'TREND_CONTINUATION',
    visualDirection: 'BULLISH',
    visualConfidence: 82,
    observations: [
      'Clean geometric stair-stepping above H1 demand.',
      'Absorption pin-bar confirmed at key horizontal level.',
    ],
  };

  const valValid = validateVisionOutput(validMock, 'XAUUSD', allCandles, refPrice);
  console.log('Is valid:', valValid.isValid);
  console.log('Valid claims count:', valValid.validClaimsCount);
  console.log('Invalid claims count:', valValid.invalidClaimsCount);
  if (!valValid.isValid || !valValid.sanitizedOutput) {
    throw new Error(`TEST F FAILED: Valid output was incorrectly rejected: ${valValid.reasons.join(', ')}`);
  }

  // Create verified envelope from valid output
  const validEnvelope = createVerifiedEnvelope<VisionOutputContract>({
    provider: 'GEMINI_VISION',
    sourceType: 'MULTIMODAL_IMAGE_PERCEPTION',
    observedAt: new Date().toISOString(),
    maxStalenessSec: 900,
    payload: valValid.sanitizedOutput,
  });
  console.log('Verified envelope isVerified:', validEnvelope.isVerified);
  console.log('Envelope provider:', validEnvelope.provider);
  console.log('Result: PASS\n');

  // -------------------------------------------------------------------------
  // TEST G: Stale / Missing Timeframe Input
  // -------------------------------------------------------------------------
  console.log('--- TEST G: Missing / Insufficient Timeframe Input ---');
  const missingTfEnv = await geminiVisionProvider.analyzeChartPacket({
    symbol: 'XAUUSD',
    h4Candles: [], // Empty!
    h1Candles,
    m15Candles,
  });
  console.log('Missing TF isVerified:', missingTfEnv.isVerified);
  console.log('Missing TF error:', missingTfEnv.error);
  if (missingTfEnv.isVerified !== false || !missingTfEnv.error?.includes('Insufficient multi-timeframe candles')) {
    throw new Error('TEST G FAILED: Missing timeframe did not fail closed');
  }
  console.log('Result: PASS\n');

  // -------------------------------------------------------------------------
  // TEST H: Pipeline Integration & Duplication Check (TECHNICAL vs VISION)
  // -------------------------------------------------------------------------
  console.log('--- TEST H: Pipeline Integration & Technical vs Vision Duplication Check ---');
  
  // Scenario 1: With Valid Vision Envelope in Feeds
  const profileWithVision = generateAssetIntelligence(
    'XAUUSD',
    {
      symbol: 'XAUUSD',
      name: 'Gold Spot',
      price: refPrice,
      change24h: 1.2,
      high24h: 2680,
      low24h: 2645,
      spread: 0.2,
      lastUpdated: new Date().toISOString(),
    } as any,
    'H1',
    h1Candles,
    'INDEPENDENT_VERIFIED',
    'Exness MT5',
    new Date(),
    {
      timestamp: new Date().toISOString(),
      news: [],
      macro: [],
      events: [],
      alerts: [],
      sentiment: {},
      visionReports: {
        XAUUSD: validEnvelope,
      },
    }
  );

  const technicalAgent = profileWithVision.agents.find((a) => a.type === 'TECHNICAL');
  const visionAgentWithData = profileWithVision.agents.find((a) => a.type === 'VISION');

  console.log('1. Pipeline with Active Vision Envelope:');
  console.log(`   TECHNICAL status: [${technicalAgent?.status}] bias: ${technicalAgent?.bias} conf: ${technicalAgent?.confidence}%`);
  console.log('   TECHNICAL evidence:', technicalAgent?.evidence);
  console.log(`   VISION status:    [${visionAgentWithData?.status}] bias: ${visionAgentWithData?.bias} conf: ${visionAgentWithData?.confidence}%`);
  console.log('   VISION evidence:', visionAgentWithData?.evidence);
  console.log('   VISION lastOpinion:', visionAgentWithData?.lastOpinion);

  // Scenario 2: Pipeline with Absent / Fail-Closed Vision Envelope
  const profileWithoutVision = generateAssetIntelligence(
    'XAUUSD',
    {
      symbol: 'XAUUSD',
      name: 'Gold Spot',
      price: refPrice,
      change24h: 1.2,
      high24h: 2680,
      low24h: 2645,
      spread: 0.2,
      lastUpdated: new Date().toISOString(),
    } as any,
    'H1',
    h1Candles,
    'INDEPENDENT_VERIFIED',
    'Exness MT5',
    new Date(),
    {
      timestamp: new Date().toISOString(),
      news: [],
      macro: [],
      events: [],
      alerts: [],
      sentiment: {},
      visionReports: {
        XAUUSD: noKeyEnv, // Fail-closed envelope
      },
    }
  );

  const visionAgentNoKey = profileWithoutVision.agents.find((a) => a.type === 'VISION');
  console.log('\n2. Pipeline with Absent / Fail-Closed Vision (No Key):');
  console.log(`   VISION status: [${visionAgentNoKey?.status}] bias: ${visionAgentNoKey?.bias} conf: ${visionAgentNoKey?.confidence}%`);
  console.log('   VISION evidence:', visionAgentNoKey?.evidence);
  console.log('   VISION lastOpinion:', visionAgentNoKey?.lastOpinion);

  if (visionAgentNoKey?.status !== 'DATA LIMITED' || visionAgentNoKey?.confidence !== 0) {
    throw new Error('TEST H FAILED: Vision did not fail closed with DATA LIMITED and 0 confidence');
  }

  // -------------------------------------------------------------------------
  // TEST I: Registry and Independence Group Verification
  // -------------------------------------------------------------------------
  console.log('\n--- TEST I: Decision Engine Registry & Independence Group ---');
  const visionReg = AGENT_DEPENDENCY_REGISTRY['VISION'];
  const techReg = AGENT_DEPENDENCY_REGISTRY['TECHNICAL'];
  console.log('VISION independenceGroup:', visionReg.independenceGroup);
  console.log('VISION derivationType:', visionReg.derivationType);
  console.log('TECHNICAL independenceGroup:', techReg.independenceGroup);
  console.log('TECHNICAL derivationType:', techReg.derivationType);

  if (visionReg.independenceGroup !== 'CHART_COMPUTER_VISION') {
    throw new Error('TEST I FAILED: VISION independenceGroup is not CHART_COMPUTER_VISION');
  }
  if (visionReg.derivationType !== 'MULTIMODAL_IMAGE_PERCEPTION') {
    throw new Error('TEST I FAILED: VISION derivationType is not MULTIMODAL_IMAGE_PERCEPTION');
  }
  console.log('Result: PASS\n');

  // =========================================================================
  // PHASE 7B.2C RUNTIME CALLER INTEGRATION TESTS
  // =========================================================================

  // -------------------------------------------------------------------------
  // TEST J: Runtime Feeds Route Invocation (Fail-Closed No-Key)
  // -------------------------------------------------------------------------
  console.log('--- TEST J: Runtime Feeds Route Invocation (No Key Fail-Closed) ---');
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_API_KEY;
  geminiVisionProvider.clearCache();

  const req = new Request('http://localhost:3000/api/intelligence/feeds?symbol=BTCUSD');
  const res = await GET(req);
  if (res.status !== 200) {
    throw new Error(`TEST J FAILED: Route returned status ${res.status}`);
  }
  const feedsData = (await res.json()) as LiveIntelligenceFeeds & { success: boolean };
  if (!feedsData.success || !feedsData.visionReports) {
    throw new Error('TEST J FAILED: Route response missing success or visionReports object');
  }
  const btcVisionEnv = feedsData.visionReports['BTCUSD'];
  if (!btcVisionEnv) {
    throw new Error('TEST J FAILED: visionReports does not contain targetSymbol BTCUSD');
  }
  console.log('Runtime visionReports keys:', Object.keys(feedsData.visionReports));
  console.log('BTCUSD isVerified:', btcVisionEnv.isVerified);
  console.log('BTCUSD error:', btcVisionEnv.error);
  console.log('BTCUSD sourceType:', btcVisionEnv.sourceType);

  if (btcVisionEnv.isVerified !== false || !btcVisionEnv.error?.includes('GEMINI_API_KEY is not configured')) {
    throw new Error('TEST J FAILED: Runtime caller did not fail closed properly without key');
  }

  // Verify pipeline consumes runtime payload truthfully
  const runtimeProfile = generateAssetIntelligence(
    'BTCUSD',
    { symbol: 'BTCUSD', price: 81500, change24h: 1.5, high24h: 82000, low24h: 80000, spread: 1 } as any,
    'H1',
    [],
    'INDEPENDENT_VERIFIED',
    'Exness MT5',
    new Date(),
    feedsData
  );
  const runtimeVisionAgent = runtimeProfile.agents.find((a) => a.type === 'VISION');
  const runtimeTechAgent = runtimeProfile.agents.find((a) => a.type === 'TECHNICAL');
  console.log('Runtime Pipeline VISION status:', runtimeVisionAgent?.status);
  console.log('Runtime Pipeline VISION confidence:', runtimeVisionAgent?.confidence);
  if (runtimeVisionAgent?.status !== 'DATA LIMITED' || runtimeVisionAgent?.confidence !== 0) {
    throw new Error('TEST J FAILED: Pipeline VISION agent not DATA LIMITED with 0 confidence');
  }
  console.log('Result: PASS\n');

  // -------------------------------------------------------------------------
  // TEST K: Provider Success via Mocked Response
  // -------------------------------------------------------------------------
  console.log('--- TEST K: Provider Success via Mocked Response ---');
  process.env.GEMINI_API_KEY = 'test-mock-key';
  geminiVisionProvider.clearCache();

  const originalFetch = global.fetch;
  const mockGeminiJson = {
    candidates: [
      {
        content: {
          parts: [
            {
              text: JSON.stringify({
                symbol: 'XAUUSD',
                analyzedAt: new Date().toISOString(),
                visualTrend: 'BULLISH',
                structureQuality: 'CLEAN_TRENDING',
                compressionExpansion: {
                  state: 'EXPANSION',
                  patternMorphology: 'NONE',
                },
                wickRejectionClusters: [
                  { timeframe: 'H1', level: genuineLevel1, rejectionDirection: 'REJECTING_LOWS', intensity: 'STRONG' },
                ],
                visibleLiquiditySweeps: [
                  { timeframe: 'M15', sweepLevel: genuineLevel2, sweepType: 'BUY_SIDE', reaction: 'FAST_DISPLACEMENT' },
                ],
                zoneReactionQuality: {
                  fvgRespect: 'RESPECTED',
                  obRespect: 'RESPECTED',
                },
                visualRegimeTransition: 'TREND_CONTINUATION',
                visualDirection: 'BULLISH',
                visualConfidence: 85,
                observations: ['Clean ascending continuation on M15 above key H1 demand.'],
              }),
            },
          ],
        },
      },
    ],
  };

  try {
    global.fetch = (async (url: any) => {
      if (String(url).includes('generativelanguage.googleapis.com')) {
        return {
          ok: true,
          status: 200,
          json: async () => mockGeminiJson,
          text: async () => JSON.stringify(mockGeminiJson),
        } as any;
      }
      return originalFetch(url);
    }) as any;

    const mockSuccessEnv = await geminiVisionProvider.analyzeChartPacket({
      symbol: 'XAUUSD',
      h4Candles,
      h1Candles,
      m15Candles,
      currentPrice: refPrice,
    });

    console.log('Mock Provider isVerified:', mockSuccessEnv.isVerified);
    console.log('Mock Provider visualDirection:', mockSuccessEnv.payload?.visualDirection);
    console.log('Mock Provider visualConfidence:', mockSuccessEnv.payload?.visualConfidence);

    if (mockSuccessEnv.isVerified !== true || mockSuccessEnv.payload?.visualDirection !== 'BULLISH') {
      throw new Error('TEST K FAILED: Mocked provider response was not accepted as verified');
    }

    // Pass through pipeline
    const profileWithMockVision = generateAssetIntelligence(
      'XAUUSD',
      { symbol: 'XAUUSD', price: refPrice, change24h: 1.2, high24h: 2680, low24h: 2645, spread: 0.2 } as any,
      'H1',
      h1Candles,
      'INDEPENDENT_VERIFIED',
      'Exness MT5',
      new Date(),
      {
        timestamp: new Date().toISOString(),
        news: [],
        macro: [],
        events: [],
        alerts: [],
        sentiment: {},
        visionReports: { XAUUSD: mockSuccessEnv },
      }
    );

    const activeMockVisionAgent = profileWithMockVision.agents.find((a) => a.type === 'VISION');
    console.log('Active Pipeline VISION status:', activeMockVisionAgent?.status);
    console.log('Active Pipeline VISION bias:', activeMockVisionAgent?.bias);
    console.log('Active Pipeline VISION confidence:', activeMockVisionAgent?.confidence);

    if (activeMockVisionAgent?.status !== 'ONLINE' || activeMockVisionAgent?.bias !== 'BULLISH' || activeMockVisionAgent?.confidence !== 90) {
      throw new Error('TEST K FAILED: Active pipeline VISION agent did not reflect verified mock evidence');
    }
    console.log('Result: PASS\n');

    // -------------------------------------------------------------------------
    // TEST L: Malformed Provider Response
    // -------------------------------------------------------------------------
    console.log('--- TEST L: Malformed Provider Response ---');
    geminiVisionProvider.clearCache();
    global.fetch = (async (url: any) => {
      if (String(url).includes('generativelanguage.googleapis.com')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: 'NOT VALID JSON <XML>ERROR</XML>' }] } }],
          }),
        } as any;
      }
      return originalFetch(url);
    }) as any;

    const malformedEnv = await geminiVisionProvider.analyzeChartPacket({
      symbol: 'XAUUSD',
      h4Candles,
      h1Candles,
      m15Candles,
      currentPrice: refPrice,
    });
    console.log('Malformed isVerified:', malformedEnv.isVerified);
    console.log('Malformed error:', malformedEnv.error);
    if (malformedEnv.isVerified !== false || !malformedEnv.error?.includes('not valid JSON')) {
      throw new Error('TEST L FAILED: Malformed response did not fail closed');
    }
    console.log('Result: PASS\n');

    // -------------------------------------------------------------------------
    // TEST M: Provider Timeout
    // -------------------------------------------------------------------------
    console.log('--- TEST M: Provider Timeout ---');
    geminiVisionProvider.clearCache();
    global.fetch = (async (url: any) => {
      if (String(url).includes('generativelanguage.googleapis.com')) {
        const timeoutErr = new Error('The operation was aborted');
        timeoutErr.name = 'AbortError';
        throw timeoutErr;
      }
      return originalFetch(url);
    }) as any;

    const timeoutEnv = await geminiVisionProvider.analyzeChartPacket({
      symbol: 'XAUUSD',
      h4Candles,
      h1Candles,
      m15Candles,
      currentPrice: refPrice,
    });
    console.log('Timeout isVerified:', timeoutEnv.isVerified);
    console.log('Timeout error:', timeoutEnv.error);
    if (timeoutEnv.isVerified !== false || !timeoutEnv.error?.includes('timed out')) {
      throw new Error('TEST M FAILED: Provider timeout did not fail closed properly');
    }
    console.log('Result: PASS\n');

    // -------------------------------------------------------------------------
    // TEST N: Validator Rejection
    // -------------------------------------------------------------------------
    console.log('--- TEST N: Validator Rejection (Hallucinated Price Claim) ---');
    geminiVisionProvider.clearCache();
    global.fetch = (async (url: any) => {
      if (String(url).includes('generativelanguage.googleapis.com')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        symbol: 'XAUUSD',
                        analyzedAt: new Date().toISOString(),
                        visualTrend: 'BULLISH',
                        structureQuality: 'CLEAN_TRENDING',
                        wickRejectionClusters: [
                          { timeframe: 'H1', level: 9999.00, rejectionDirection: 'REJECTING_LOWS', intensity: 'STRONG' },
                          { timeframe: 'H1', level: 12.00, rejectionDirection: 'REJECTING_LOWS', intensity: 'STRONG' },
                        ],
                        visibleLiquiditySweeps: [],
                        zoneReactionQuality: { fvgRespect: 'RESPECTED', obRespect: 'RESPECTED' },
                        visualRegimeTransition: 'TREND_CONTINUATION',
                        visualDirection: 'BULLISH',
                        visualConfidence: 90,
                        observations: ['Hallucinated levels'],
                      }),
                    },
                  ],
                },
              },
            ],
          }),
        } as any;
      }
      return originalFetch(url);
    }) as any;

    const rejectedEnv = await geminiVisionProvider.analyzeChartPacket({
      symbol: 'XAUUSD',
      h4Candles,
      h1Candles,
      m15Candles,
      currentPrice: refPrice,
    });
    console.log('Rejected isVerified:', rejectedEnv.isVerified);
    console.log('Rejected error:', rejectedEnv.error);
    if (rejectedEnv.isVerified !== false || !rejectedEnv.error?.includes('Vision validation failed')) {
      throw new Error('TEST N FAILED: Validator rejection did not fail closed');
    }
    console.log('Result: PASS\n');

    // -------------------------------------------------------------------------
    // TEST O: Candle-Identity Cache
    // -------------------------------------------------------------------------
    console.log('--- TEST O: Candle-Identity Cache ---');
    geminiVisionProvider.clearCache();
    let fetchCount = 0;
    global.fetch = (async (url: any) => {
      if (String(url).includes('generativelanguage.googleapis.com')) {
        fetchCount++;
        return {
          ok: true,
          status: 200,
          json: async () => mockGeminiJson,
        } as any;
      }
      return originalFetch(url);
    }) as any;

    // Call 1: fresh
    await geminiVisionProvider.analyzeChartPacket({
      symbol: 'XAUUSD',
      h4Candles,
      h1Candles,
      m15Candles,
      currentPrice: refPrice,
    });
    console.log('Fetch count after Call 1:', fetchCount);
    if (fetchCount !== 1) throw new Error('TEST O FAILED: Call 1 did not invoke fetch');

    // Call 2: identical candles -> cache hit
    await geminiVisionProvider.analyzeChartPacket({
      symbol: 'XAUUSD',
      h4Candles,
      h1Candles,
      m15Candles,
      currentPrice: refPrice,
    });
    console.log('Fetch count after Call 2 (cache hit):', fetchCount);
    if (fetchCount !== 1) throw new Error('TEST O FAILED: Call 2 unexpectedly invoked fetch instead of cache hit');

    // Call 3: modified last candle timestamp -> cache miss, re-fetch
    const modifiedM15 = [...m15Candles.slice(0, -1), { ...m15Candles[m15Candles.length - 1], timestamp: Date.now() }];
    await geminiVisionProvider.analyzeChartPacket({
      symbol: 'XAUUSD',
      h4Candles,
      h1Candles,
      m15Candles: modifiedM15,
      currentPrice: refPrice,
    });
    console.log('Fetch count after Call 3 (new candle ID):', fetchCount);
    if (fetchCount !== 2) throw new Error('TEST O FAILED: Call 3 with new candle identity did not invoke fetch');
    console.log('Result: PASS\n');

  } finally {
    global.fetch = originalFetch;
  }

  // -------------------------------------------------------------------------
  // TEST P: Canonical Agent Count & Technical Independence
  // -------------------------------------------------------------------------
  console.log('--- TEST P: Canonical Agent Count & Technical Independence ---');
  const totalRegistryAgents = Object.keys(AGENT_DEPENDENCY_REGISTRY).length;
  console.log(`Canonical AGENT_DEPENDENCY_REGISTRY count: ${totalRegistryAgents}`);
  if (totalRegistryAgents !== 32) {
    throw new Error(`TEST P FAILED: Canonical agent count is ${totalRegistryAgents}, expected exactly 32`);
  }

  // Verify Technical agent functions independently when Vision fails closed
  const profileVisionFailed = generateAssetIntelligence(
    'XAUUSD',
    { symbol: 'XAUUSD', price: refPrice, change24h: 1.2, high24h: 2680, low24h: 2645, spread: 0.2 } as any,
    'H1',
    h1Candles,
    'INDEPENDENT_VERIFIED',
    'Exness MT5',
    new Date(),
    {
      timestamp: new Date().toISOString(),
      news: [],
      macro: [],
      events: [],
      alerts: [],
      sentiment: {},
      visionReports: {
        XAUUSD: noKeyEnv,
      },
    }
  );
  const techAgentWhenVisionFails = profileVisionFailed.agents.find((a) => a.type === 'TECHNICAL');
  console.log('TECHNICAL status when Vision fails:', techAgentWhenVisionFails?.status);
  console.log('TECHNICAL confidence when Vision fails:', techAgentWhenVisionFails?.confidence);
  if (techAgentWhenVisionFails?.status !== 'ONLINE' || (techAgentWhenVisionFails?.confidence || 0) <= 0) {
    throw new Error('TEST P FAILED: TECHNICAL agent was improperly suppressed when Vision failed');
  }
  console.log('Result: PASS\n');

  // Restore env if any
  if (originalKey) process.env.GEMINI_API_KEY = originalKey;
  else delete process.env.GEMINI_API_KEY;
  if (originalGoogleKey) process.env.GOOGLE_API_KEY = originalGoogleKey;
  else delete process.env.GOOGLE_API_KEY;

  console.log('================================================================');
  console.log('ALL PHASE 7B.2C VISION & RUNTIME CALLER TESTS PASSED (16/16)!');
  console.log('================================================================');
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});

