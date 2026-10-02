/**
 * FEF CORTEX — GEOPOLITICAL INTELLIGENCE ENGINE (V1.2.1)
 * 
 * Tracks geopolitical flashpoints, trade corridors, sovereign tensions, and sanctions.
 * Extracts corroborated events from live wire and official news streams.
 * Distinguishes event facts from market implications without synthetic assumptions.
 * Zero synthetic timestamps: maintains authentic source publication timestamps.
 */

import { GeopoliticalEventRecord, GeopoliticalProvider, ProviderHealth } from '../providers/types';
import { providerRegistry } from '../providers/provider-registry';
import { globalNewsEngine } from '../news/global-news-engine';

export class GeopoliticalEngine implements GeopoliticalProvider {
  public readonly id = 'geopolitical-engine';
  public readonly name = 'Geopolitical Risk Intelligence Engine';
  public readonly sourceType = 'PUBLIC_FEED';
  public readonly supportedAssets = ['XAUUSD', 'USOIL', 'EURUSD', 'BTCUSD'] as const;

  private alerts: GeopoliticalEventRecord[] = [];
  private lastFetchedAt: number = 0;
  private lastAttemptAt: number = 0;
  private lastLatencyMs: number = 0;
  private consecutiveErrors: number = 0;
  private readonly cacheTtlMs = 120_000; // 2 min cache
  private readonly maxAlertAgeMs = 7 * 24 * 60 * 60 * 1000; // 7 days max age for active surveillance
  private readonly maxFutureClockSkewMs = 5 * 60 * 1000; // 5 min future clock skew tolerance

  public async getHealth(): Promise<ProviderHealth> {
    const now = Date.now();
    if (this.lastAttemptAt === 0 && this.alerts.length === 0) {
      try {
        await this.refreshAlerts();
      } catch {
        // Handled in refreshAlerts
      }
    }
    const newsHealth = await globalNewsEngine.getHealth();

    // Status is based on recent execution and upstream news health:
    // Zero alerts is a valid and truthful outcome when no genuine geopolitical events qualify.
    let status: ProviderHealth['status'] = 'HEALTHY';
    if (this.consecutiveErrors >= 3 || newsHealth.status === 'OFFLINE') {
      status = 'OFFLINE';
    } else if (this.consecutiveErrors > 0 || newsHealth.status === 'DEGRADED') {
      status = 'DEGRADED';
    }

    return {
      providerId: this.id,
      name: this.name,
      sourceType: this.sourceType,
      status,
      latencyMs: this.lastLatencyMs,
      lastChecked: new Date(now).toISOString(),
      lastSuccess: this.lastFetchedAt > 0 ? new Date(this.lastFetchedAt).toISOString() : undefined,
      errorCount: this.consecutiveErrors + newsHealth.errorCount,
      rateLimit: { isThrottled: false },
      isFreeTier: true,
    };
  }

  public getCachedAlerts(): GeopoliticalEventRecord[] {
    const now = Date.now();
    // Prune alerts older than maxAlertAgeMs dynamically
    return this.alerts.filter((alert) => {
      const epoch = Date.parse(alert.timestamp);
      return !isNaN(epoch) && now - epoch <= this.maxAlertAgeMs && epoch <= now + this.maxFutureClockSkewMs;
    });
  }

  public async getGeopoliticalAlerts(): Promise<GeopoliticalEventRecord[]> {
    const now = Date.now();
    // Refresh only if we have never fetched or cache TTL has expired based on lastAttemptAt
    if (this.lastAttemptAt === 0 || now - this.lastAttemptAt > this.cacheTtlMs) {
      await this.refreshAlerts();
    }
    return this.getCachedAlerts();
  }

  /**
   * Explicit allowlist of recognized editorial/reporting source families
   * eligible to contribute toward independent multi-source corroboration (CONFIRMED).
   * Unrecognized publishers, aggregators, PR wires, and syndicates are excluded.
   */
  public static readonly ELIGIBLE_CORROBORATION_FAMILIES = new Set<string>([
    'reuters_family',
    'ap_family',
    'bloomberg_family',
    'afp_family',
    'dowjones_family',
    'ft_family',
    'nbc_family',
    'bbc_family',
    'aljazeera_family',
  ]);

  /**
   * Normalizes source strings into conservative source families to ensure independence.
   * If two items belong to the same source organization, syndication, or if independence
   * cannot be established conservatively, they share the same family identifier.
   */
  public normalizeSourceFamily(source: string | undefined): string {
    if (!source || typeof source !== 'string') {
      return 'unknown';
    }
    const s = source.toLowerCase().trim().replace(/[^a-z0-9]/g, '');

    // Major wire services & families
    if (s.includes('reuters') || s.includes('thomsonreuters')) return 'reuters_family';
    if (s.includes('associatedpress') || s === 'ap' || s.startsWith('apwire') || s.includes('apnews')) return 'ap_family';
    if (s.includes('bloomberg')) return 'bloomberg_family';
    if (s.includes('afp') || s.includes('agencefrancepresse')) return 'afp_family';
    if (s.includes('dowjones') || s.includes('wsj') || s.includes('wallstreetjournal') || s.includes('marketwatch') || s.includes('barrons')) return 'dowjones_family';
    if (s.includes('financialtimes') || s === 'ft') return 'ft_family';
    if (s.includes('cnbc') || s.includes('nbc')) return 'nbc_family';
    if (s.includes('bbc')) return 'bbc_family';
    if (s.includes('aljazeera')) return 'aljazeera_family';

    // Syndications, aggregators, PR wires: cannot establish genuine independent reporting
    if (s.includes('prnewswire') || s.includes('businesswire') || s.includes('globenewswire') || s.includes('syndicate') || s.includes('feed')) {
      return `syndicated_${s}`;
    }

    // Default to normalized token
    return s;
  }

  /**
   * Checks whether a normalized source family is explicitly eligible to establish independent corroboration.
   */
  public isEligibleCorroborationFamily(sourceFamily: string): boolean {
    return GeopoliticalEngine.ELIGIBLE_CORROBORATION_FAMILIES.has(sourceFamily);
  }

  /**
   * Evaluates whether a headline and summary describe a genuine geopolitical event.
   * Disqualifies ordinary commercial, equity, labor, regulatory, corporate idioms, or business stories.
   */
  public qualifiesAsGeopoliticalEvent(headline: string, summary: string): {
    qualified: boolean;
    region: GeopoliticalEventRecord['region'];
    threatLevel: GeopoliticalEventRecord['threatLevel'];
    actionType: string;
  } {
    const fullText = `${headline} ${summary}`.toLowerCase();

    // 1. NEGATIVE EXCLUSIONS: Common commercial / business / equity / market / corporate idioms
    const commercialExclusionPatterns = [
      /\b52-week\b/,
      /\bhit[s]? 52-week\b/,
      /\ball-time high[s]?\b/,
      /\bstock[s]?\b/,
      /\bearnings\b/,
      /\bquarterly results\b/,
      /\bloan demand\b/,
      /\blending growth\b/,
      /\bprice war[s]?\b/,
      /\bdiscount war[s]?\b/,
      /\btariff war between retailers\b/,
      /\bwar chest\b/, // Corporate finance idiom
      /\btrade war\b(?!.*?\b(sanctions|tariff enacted|customs duty|embargo|executive order)\b)/, // Generic commercial trade war commentary without sovereign action
      /\bmissile stock[s]?\b/,
      /\blabor strike[s]?\b/,
      /\bworker[s]? strike\b/,
      /\bunion strike\b/,
      /\bstrike price[s]?\b/,
      /\bcybersecurity\b/,
      /\bsecurity deposit[s]?\b/,
      /\bsecurity clearance\b/,
      /\bsecurity patch\b/,
      /\btrade deficit\b/,
      /\btrade surplus\b/,
      /\bfree-trade agreement\b/,
      /\btrading strategy\b/,
      /\bday trading\b/,
      /\bcorporate debt\b/,
      /\bshare buyback\b/,
      /\bmarket cap\b/,
      /\banalyst rating[s]?\b/,
      /\bprice target\b/,
      /\bipo\b/,
    ];

    for (const pattern of commercialExclusionPatterns) {
      if (pattern.test(fullText)) {
        return { qualified: false, region: 'GLOBAL', threatLevel: 'NORMAL', actionType: '' };
      }
    }

    // 2. GEOPOLITICAL ACTIONS / TENSION PATTERNS (with strict word boundaries)
    // Category A: Active military or armed kinetic conflict
    const criticalActionPatterns = [
      /\b(missile|air|drone|rocket|naval|artillery)\s+(strike[s]?|attack[s]?|barrage)\b/,
      /\b(airstrike[s]?|air-strike[s]?)\b/,
      /\b(armed attack[s]?|armed clash(es)?|ground invasion|military invasion)\b/,
      /\b(war declared|declaration of war|hostilities erupt(ed)?)\b/,
      /\b(naval blockade|maritime blockade|blockade enforced)\b/,
      /\b(tanker attacked|vessel attacked|cargo ship attacked|ship hit by missile)\b/,
      /\b(drone strike[s]?|interception of missile[s]?|ballistic missile launch)\b/,
    ];

    // Category B: Severe state escalation, sovereign sanctions, seizures, mobilization
    const highActionPatterns = [
      /\b(sanctions imposed|enacted sanctions|sovereign sanctions|treasury sanctions)\b/,
      /\b(oil embargo|trade embargo|arms embargo)\b/,
      /\b(tanker seized|vessel seized|ship seized by navy|commercial ship detained)\b/,
      /\b(military mobilization|troop deployment|naval deployment|carrier strike group deployed)\b/,
      /\b(military exercises near border|live-fire drills surrounding|airspace violation)\b/,
      /\b(uranium enrichment escalated|nuclear test|missile test launch)\b/,
      /\b(expelled diplomats|severed diplomatic relations)\b/,
    ];

    // Category C: Official security advisories, transit warnings, naval alerts, ceasefire talks
    const elevatedActionPatterns = [
      /\b(maritime security advisory|transit warning in red sea|strait of hormuz transit advisory)\b/,
      /\b(naval escort requested|shipping threat elevated|navigation hazard declared)\b/,
      /\b(border skirmish(es)?|sovereign border tension[s]?)\b/,
      /\b(ceasefire talks collapse(d)?|ceasefire negotiations stall(ed)?|ceasefire broken)\b/,
      /\b(war risk insurance premium raised|shipping insurance surcharge)\b/,
    ];

    let threatLevel: GeopoliticalEventRecord['threatLevel'] = 'NORMAL';
    let actionType = '';

    for (const p of criticalActionPatterns) {
      if (p.test(fullText)) {
        threatLevel = 'CRITICAL';
        actionType = 'KINETIC_MILITARY_ACTION';
        break;
      }
    }

    if (threatLevel === 'NORMAL') {
      for (const p of highActionPatterns) {
        if (p.test(fullText)) {
          threatLevel = 'HIGH';
          actionType = 'SOVEREIGN_SANCTIONS_OR_ESCALATION';
          break;
        }
      }
    }

    if (threatLevel === 'NORMAL') {
      for (const p of elevatedActionPatterns) {
        if (p.test(fullText)) {
          threatLevel = 'ELEVATED';
          actionType = 'MARITIME_OR_DIPLOMATIC_ALERT';
          break;
        }
      }
    }

    // Must match at least an elevated action to qualify
    if (threatLevel === 'NORMAL') {
      return { qualified: false, region: 'GLOBAL', threatLevel: 'NORMAL', actionType: '' };
    }

    // 3. REGION AND GEOPOLITICAL ACTORS IDENTIFICATION
    let region: GeopoliticalEventRecord['region'] = 'GLOBAL';

    const middleEastPattern = /\b(middle east|red sea|gaza|israel|israeli|iran|iranian|lebanon|hezbollah|yemen|houthi[s]?|strait of hormuz|hormuz|persian gulf|gulf of aden|bab el-mandeb|saudi arabia|riyadh|tehran|baghdad|iraq|syria)\b/;
    const easternEuropePattern = /\b(ukraine|ukrainian|russia|russian|black sea|crimea|eastern europe|baltic sea|donbas|kyiv|moscow|belarus)\b/;
    const asiaPacificPattern = /\b(taiwan|taiwanese|strait of taiwan|taiwan strait|south china sea|beijing|pla navy|north korea|pyongyang|sea of japan|senkaku)\b/;

    if (middleEastPattern.test(fullText)) {
      region = 'MIDDLE_EAST';
    } else if (easternEuropePattern.test(fullText)) {
      region = 'EASTERN_EUROPE';
    } else if (asiaPacificPattern.test(fullText)) {
      region = 'ASIA_PACIFIC';
    } else {
      region = 'GLOBAL';
    }

    return { qualified: true, region, threatLevel, actionType };
  }

  /**
   * Maps affected commodities strictly requiring an explicit, defensible transmission channel
   * stated directly in the reporting. Zero blanket region-to-asset or threat-level assumptions.
   * A genuine geopolitical alert with no explicit transmission returns [].
   */
  public deriveAffectedCommodities(headline: string, summary: string): string[] {
    const text = `${headline} ${summary}`.toLowerCase();
    const commodities = new Set<string>();

    // USOIL: Requires explicit oil, petroleum, refinery, pipeline, oil tanker, energy export infrastructure,
    // or sanctions/embargo targeting oil/energy exports
    const explicitOilPatterns = [
      /\b(crude oil|petroleum|oil tanker|fuel tanker|oil refinery|fuel depot|oil pipeline|gas pipeline)\b/,
      /\b(oil exports?|energy infrastructure|energy export terminal|crude transport|oil terminal)\b/,
      /\b(oil sanctions|energy sanctions|oil embargo|petroleum embargo)\b/,
      /\b(energy shipping disruption|tanker carrying crude|tanker carrying oil|vessel carrying fuel)\b/,
    ];

    if (explicitOilPatterns.some((pattern) => pattern.test(text))) {
      commodities.add('USOIL');
    }

    // XAUUSD: Requires explicit gold, bullion, safe-haven demand into gold, or direct gold-market transmission
    const explicitGoldPatterns = [
      /\b(gold bullion|spot gold|gold prices?|gold market|gold futures?|xauusd)\b/,
      /\b(safe[- ]haven demand for gold|safe[- ]haven flows into gold|flight to gold)\b/,
      /\b(gold rose on|gold rallied on|gold safe[- ]haven bid)\b/,
    ];

    if (explicitGoldPatterns.some((pattern) => pattern.test(text))) {
      commodities.add('XAUUSD');
    }

    // EURUSD: Requires explicit FX / currency market / euro transmission statements
    const explicitEuroPatterns = [
      /\b(euro currency|eurusd|euro fell against the dollar|euro tumbled|pressure on the euro)\b/,
      /\b(foreign exchange impact|currency market volatility|eurozone currency impact)\b/,
    ];

    if (explicitEuroPatterns.some((pattern) => pattern.test(text))) {
      commodities.add('EURUSD');
    }

    return Array.from(commodities);
  }

  /**
   * Formulates market impact assessment using conservative derived inference language.
   * Clearly distinguishes reported security events with no direct asset transmission from
   * events that explicitly state a transmission channel.
   */
  public formulateImpactAssessment(
    headline: string,
    region: GeopoliticalEventRecord['region'],
    threatLevel: GeopoliticalEventRecord['threatLevel'],
    affectedCommodities: string[]
  ): string {
    if (affectedCommodities.length === 0) {
      return `Derived geopolitical risk assessment: reported security event in ${region} qualifies for geopolitical monitoring. No direct asset transmission is established by the available source evidence; independent market confirmation required.`;
    }

    const commodityList = affectedCommodities.join(', ');
    const transmissionTypes = affectedCommodities.map((c) => {
      if (c === 'USOIL') return 'energy/petroleum';
      if (c === 'XAUUSD') return 'gold/safe-haven';
      if (c === 'EURUSD') return 'currency/FX';
      return c;
    }).join(' and ');

    return `Derived geopolitical risk assessment: source reporting explicitly references ${transmissionTypes} transmission affecting [${commodityList}]. Independent price action and market-data confirmation required before trading use.`;
  }

  /**
   * Normalizes headline and text into a conservative flashpoint/event cluster key.
   * Clusters reports of the same specific incident without merging unrelated events
   * in the same region or sharing generic action terms.
   */
  public extractClusterKey(headline: string, summary: string, region: string, actionType: string): string {
    const text = `${headline} ${summary}`.toLowerCase();

    // Specific local flashpoints / targets
    let target = 'general';
    if (text.includes('red sea') || text.includes('bab el-mandeb')) target = 'red_sea';
    else if (text.includes('hormuz')) target = 'strait_of_hormuz';
    else if (text.includes('persian gulf') || text.includes('gulf of oman')) target = 'persian_gulf';
    else if (text.includes('baltic')) target = 'baltic';
    else if (text.includes('black sea') || text.includes('crimea')) target = 'black_sea';
    else if (text.includes('donbas') || text.includes('kyiv')) target = 'ukraine_mainland';
    else if (text.includes('taiwan strait')) target = 'taiwan_strait';
    else if (text.includes('south china sea')) target = 'south_china_sea';
    else if (text.includes('gaza')) target = 'gaza';
    else if (text.includes('lebanon') || text.includes('beirut')) target = 'lebanon';
    else if (text.includes('yemen') || text.includes('hodeidah')) target = 'yemen';
    else if (text.includes('isfahan') || text.includes('tehran')) target = 'iran_facility';

    // Specific entity/incident object if mentioned (e.g. tanker, drill, advisory, border)
    let incidentObject = 'incident';
    if (text.includes('tanker') || text.includes('vessel') || text.includes('cargo ship') || text.includes('commercial ship')) {
      incidentObject = 'vessel';
    } else if (text.includes('airbase') || text.includes('military base') || text.includes('outpost') || text.includes('port')) {
      incidentObject = 'base';
    } else if (text.includes('exercise') || text.includes('drill') || text.includes('carrier strike group')) {
      incidentObject = 'drills';
    } else if (text.includes('advisory') || text.includes('warning') || text.includes('hazard')) {
      incidentObject = 'advisory';
    } else if (text.includes('sanctions') || text.includes('embargo')) {
      incidentObject = 'sanctions';
    }

    return `${region}::${actionType}::${target}::${incidentObject}`;
  }

  /**
   * Extracts and corroborates geopolitical events from authentic live news stream.
   * Zero synthetic mock alerts or fabricated Date.now() stamps.
   */
  public async refreshAlerts(): Promise<void> {
    const startTime = Date.now();
    this.lastAttemptAt = startTime;

    try {
      const newsItems = await globalNewsEngine.getLatestNews(undefined, 50);
      const elapsed = Date.now() - startTime;
      this.lastLatencyMs = elapsed;

      const candidateEvents: Array<{
        item: typeof newsItems[0];
        region: GeopoliticalEventRecord['region'];
        threatLevel: GeopoliticalEventRecord['threatLevel'];
        actionType: string;
        clusterKey: string;
        sourceFamily: string;
      }> = [];

      for (const item of newsItems) {
        // Authentic timestamp validation: fail-closed on missing or invalid timestamps
        if (!item.publishedAt || typeof item.publishedAt !== 'string') {
          continue;
        }
        const epoch = Date.parse(item.publishedAt);
        if (isNaN(epoch) || epoch <= 0) {
          continue;
        }

        // Timestamp hardening: reject articles older than maxAlertAgeMs or implausibly in the future
        if (startTime - epoch > this.maxAlertAgeMs) {
          continue;
        }
        if (epoch - startTime > this.maxFutureClockSkewMs) {
          continue;
        }

        // Strict qualification
        const evaluation = this.qualifiesAsGeopoliticalEvent(item.headline, item.summary || '');
        if (!evaluation.qualified) {
          continue;
        }

        const clusterKey = this.extractClusterKey(
          item.headline,
          item.summary || '',
          evaluation.region,
          evaluation.actionType
        );
        const sourceFamily = this.normalizeSourceFamily(item.source);

        candidateEvents.push({
          item,
          region: evaluation.region,
          threatLevel: evaluation.threatLevel,
          actionType: evaluation.actionType,
          clusterKey,
          sourceFamily,
        });
      }

      // Group candidate events by clusterKey to check multi-source corroboration across independent source families.
      // Only explicitly recognized editorial/reporting source families contribute toward corroboration eligibility.
      // Unrecognized publishers, syndicated feeds, PR wires, and generic sources are excluded.
      const clusterSourceFamilies = new Map<string, Set<string>>();
      for (const cand of candidateEvents) {
        if (!clusterSourceFamilies.has(cand.clusterKey)) {
          clusterSourceFamilies.set(cand.clusterKey, new Set<string>());
        }
        if (cand.sourceFamily && this.isEligibleCorroborationFamily(cand.sourceFamily)) {
          clusterSourceFamilies.get(cand.clusterKey)!.add(cand.sourceFamily);
        }
      }

      const extracted: GeopoliticalEventRecord[] = [];
      const seenIds = new Set<string>();

      for (const cand of candidateEvents) {
        if (seenIds.has(cand.item.id)) continue;
        seenIds.add(cand.item.id);

        const distinctEligibleFamilies = clusterSourceFamilies.get(cand.clusterKey) || new Set<string>();
        // Conservative Corroboration Rule:
        // Must have at least 2 genuinely distinct, explicitly recognized eligible source families to achieve CONFIRMED.
        // Unrecognized publishers or syndicated copies cannot fabricate corroboration.
        const status: GeopoliticalEventRecord['status'] = distinctEligibleFamilies.size >= 2 ? 'CONFIRMED' : 'DEVELOPING';

        const affectedCommodities = this.deriveAffectedCommodities(
          cand.item.headline,
          cand.item.summary || ''
        );

        const assessment = this.formulateImpactAssessment(
          cand.item.headline,
          cand.region,
          cand.threatLevel,
          affectedCommodities
        );

        extracted.push({
          id: `geo-${cand.item.id}`,
          headline: cand.item.headline,
          region: cand.region,
          threatLevel: cand.threatLevel,
          status,
          affectedCommodities,
          marketImpactAssessment: assessment,
          timestamp: cand.item.publishedAt,
          classification: 'LIVE_EXTERNAL',
        });
      }

      this.alerts = extracted.slice(0, 10);
      this.lastFetchedAt = Date.now();
      this.consecutiveErrors = 0;
    } catch (err) {
      this.consecutiveErrors += 1;
      this.lastLatencyMs = Date.now() - startTime;
      throw err;
    }
  }
}

export const geopoliticalEngine = new GeopoliticalEngine();
providerRegistry.registerGeopoliticalProvider(geopoliticalEngine);
