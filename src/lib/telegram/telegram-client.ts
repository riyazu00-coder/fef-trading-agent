/**
 * FEF CORTEX — OFFICIAL TELEGRAM BOT API CLIENT
 *
 * Phase 13B Workstream: Public Channel Signal Broadcasting Client
 * Sole authorized destination: @forexmetalsignals (https://t.me/forexmetalsignals)
 *
 * INVARIANTS:
 * - Strictly public channel destination (@forexmetalsignals)
 * - Private group destinations are strictly prohibited
 * - Arbitrary channel destinations from frontend or API requests are strictly rejected
 * - Bot requests only `can_post_messages` permission
 * - Zero token leakage in logs, exceptions, or client responses
 * - Native HTTPS requests with bounded timeout and rate-limit backoff
 * - Read-only analytical information delivery only — zero execution
 */

import { ValidatedSignalPayload } from './telegram-signal-eligibility';
import { hashDestinationChat } from './telegram-idempotency';

export const CANONICAL_CHANNEL_USERNAME = '@forexmetalsignals' as const;

export interface TelegramConfig {
  botToken: string;
  channelUsername: string;
  enabled: boolean;
  dryRun: boolean;
  validatedOnly?: boolean;
  minIntervalSeconds?: number;
  maxRetries?: number;
  allowedChatIds?: string[];
  fetchFn?: typeof fetch;
}

export interface TelegramVerificationResult {
  isConfigured: boolean;
  isValid: boolean;
  status: 'CONNECTED' | 'NOT_CONFIGURED' | 'DISABLED' | 'INVALID_TOKEN' | 'ERROR';
  botId?: number;
  botUsername?: string;
  botFirstName?: string;
  error?: string;
  checkedAt: string;
}

export interface ChannelVerificationResult {
  isConfigured: boolean;
  isVerified: boolean;
  status: 'VERIFIED' | 'NOT_CONFIGURED' | 'DISABLED' | 'CHANNEL_NOT_ALLOWED' | 'CHANNEL_NOT_FOUND' | 'NOT_ADMIN' | 'MISSING_POST_PERMISSION' | 'ERROR';
  channelUsername?: string;
  channelTitle?: string;
  channelType?: string;
  isAdmin?: boolean;
  canPostMessages?: boolean;
  error?: string;
  checkedAt: string;
}

// Backwards-compatibility alias
export type GroupVerificationResult = ChannelVerificationResult;

export interface TelegramSendResult {
  success: boolean;
  telegramMessageId?: number;
  isDryRun?: boolean;
  errorCode?: string;
  error?: string;
  deliveredAt?: string;
}

export function escapeTelegramHtml(str: any): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export class TelegramClient {
  private config: TelegramConfig;
  private customOptions: Partial<TelegramConfig>;

  constructor(options?: Partial<TelegramConfig>) {
    this.customOptions = options || {};
    this.config = this.loadConfig(this.customOptions);
  }

  public loadConfig(options?: Partial<TelegramConfig>): TelegramConfig {
    const opts = { ...this.customOptions, ...(options || {}) };
    const botToken = (opts.botToken ?? process.env.TELEGRAM_BOT_TOKEN ?? '').trim();
    const enabled = opts.enabled ?? process.env.TELEGRAM_SIGNAL_ENABLED === 'true';
    const dryRun = opts.dryRun ?? (process.env.TELEGRAM_SIGNAL_DRY_RUN !== 'false');
    const validatedOnly = opts.validatedOnly ?? (process.env.TELEGRAM_SIGNAL_VALIDATED_ONLY !== 'false');
    const minIntervalSeconds = parseInt(process.env.TELEGRAM_SIGNAL_MIN_INTERVAL_SECONDS || '60', 10);
    const maxRetries = parseInt(process.env.TELEGRAM_SIGNAL_MAX_RETRIES || '3', 10);

    // Sole permitted destination is fixed to CANONICAL_CHANNEL_USERNAME
    const channelUsername = CANONICAL_CHANNEL_USERNAME;
    const allowedChatIds = [CANONICAL_CHANNEL_USERNAME];

    return {
      botToken,
      channelUsername,
      enabled,
      dryRun,
      validatedOnly,
      minIntervalSeconds: isNaN(minIntervalSeconds) ? 60 : minIntervalSeconds,
      maxRetries: isNaN(maxRetries) ? 3 : maxRetries,
      allowedChatIds,
      fetchFn: opts.fetchFn,
    };
  }

  public getPublicConfig() {
    this.config = this.loadConfig(this.customOptions);
    return {
      botTokenConfigured: Boolean(this.config.botToken),
      channelConfigured: true,
      channelUsername: CANONICAL_CHANNEL_USERNAME,
      destinationType: 'PUBLIC_CHANNEL' as const,
      enabled: this.config.enabled,
      dryRun: this.config.dryRun,
      validatedOnly: this.config.validatedOnly ?? true,
      minIntervalSeconds: this.config.minIntervalSeconds,
      maxRetries: this.config.maxRetries,
      destinationKey: hashDestinationChat(CANONICAL_CHANNEL_USERNAME),
      destinationSummary: `${CANONICAL_CHANNEL_USERNAME} (Public Channel)`,
    };
  }

  /**
   * Verify Bot Token via Telegram getMe
   */
  public async verifyBot(): Promise<TelegramVerificationResult> {
    const cfg = this.loadConfig();
    const checkedAt = new Date().toISOString();
    const fetchImpl = this.customOptions.fetchFn || fetch;

    if (!cfg.botToken) {
      return {
        isConfigured: false,
        isValid: false,
        status: 'NOT_CONFIGURED',
        error: 'TELEGRAM_BOT_TOKEN is not configured in server environment',
        checkedAt,
      };
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const resp = await fetchImpl(`https://api.telegram.org/bot${cfg.botToken}/getMe`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const body = await resp.json();
      if (!resp.ok || !body.ok) {
        return {
          isConfigured: true,
          isValid: false,
          status: 'INVALID_TOKEN',
          error: `Telegram getMe failed: ${body?.description || 'Invalid bot token'}`,
          checkedAt,
        };
      }

      return {
        isConfigured: true,
        isValid: true,
        status: 'CONNECTED',
        botId: body.result?.id,
        botUsername: body.result?.username,
        botFirstName: body.result?.first_name,
        checkedAt,
      };
    } catch (err: any) {
      return {
        isConfigured: true,
        isValid: false,
        status: 'ERROR',
        error: err.name === 'AbortError' ? 'Telegram getMe request timed out' : (err.message || 'Network error reaching Telegram API'),
        checkedAt,
      };
    }
  }

  /**
   * Verify Public Channel @forexmetalsignals:
   * 1. Check channel existence via getChat
   * 2. Check bot admin membership via getChatMember
   * 3. Verify bot has can_post_messages permission
   */
  public async verifyChannel(): Promise<ChannelVerificationResult> {
    const cfg = this.loadConfig();
    const checkedAt = new Date().toISOString();
    const fetchImpl = this.customOptions.fetchFn || fetch;

    if (!cfg.botToken) {
      return {
        isConfigured: false,
        isVerified: false,
        status: 'NOT_CONFIGURED',
        channelUsername: CANONICAL_CHANNEL_USERNAME,
        error: 'TELEGRAM_BOT_TOKEN is not configured in server environment',
        checkedAt,
      };
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      // Step 1: getMe to retrieve the bot's user ID
      const meResp = await fetchImpl(`https://api.telegram.org/bot${cfg.botToken}/getMe`, {
        method: 'GET',
        signal: controller.signal,
      });
      const meBody = await meResp.json();
      if (!meResp.ok || !meBody.ok || !meBody.result?.id) {
        clearTimeout(timeout);
        return {
          isConfigured: true,
          isVerified: false,
          status: 'ERROR',
          channelUsername: CANONICAL_CHANNEL_USERNAME,
          error: `Telegram getMe failed: ${meBody?.description || 'Could not verify bot ID'}`,
          checkedAt,
        };
      }
      const botId = meBody.result.id;

      // Step 2: getChat to verify channel existence
      const chatResp = await fetchImpl(`https://api.telegram.org/bot${cfg.botToken}/getChat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: CANONICAL_CHANNEL_USERNAME }),
        signal: controller.signal,
      });
      const chatBody = await chatResp.json();
      if (!chatResp.ok || !chatBody.ok) {
        clearTimeout(timeout);
        return {
          isConfigured: true,
          isVerified: false,
          status: 'CHANNEL_NOT_FOUND',
          channelUsername: CANONICAL_CHANNEL_USERNAME,
          error: `Channel ${CANONICAL_CHANNEL_USERNAME} not found or inaccessible: ${chatBody?.description || 'Not found'}`,
          checkedAt,
        };
      }

      const channelTitle = chatBody.result?.title;
      const channelType = chatBody.result?.type;

      // Step 3: getChatMember to verify bot is administrator with can_post_messages permission
      const memberResp = await fetchImpl(`https://api.telegram.org/bot${cfg.botToken}/getChatMember`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: CANONICAL_CHANNEL_USERNAME, user_id: botId }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const memberBody = await memberResp.json();
      if (!memberResp.ok || !memberBody.ok) {
        return {
          isConfigured: true,
          isVerified: false,
          status: 'NOT_ADMIN',
          channelUsername: CANONICAL_CHANNEL_USERNAME,
          channelTitle,
          channelType,
          isAdmin: false,
          error: `Bot is not an administrator in ${CANONICAL_CHANNEL_USERNAME}: ${memberBody?.description || 'Membership check failed'}`,
          checkedAt,
        };
      }

      const memberStatus = memberBody.result?.status; // 'creator' | 'administrator' | 'member' | 'restricted' | 'left' | 'kicked'
      const isCreator = memberStatus === 'creator';
      const isAdmin = memberStatus === 'administrator' || isCreator;

      if (!isAdmin) {
        return {
          isConfigured: true,
          isVerified: false,
          status: 'NOT_ADMIN',
          channelUsername: CANONICAL_CHANNEL_USERNAME,
          channelTitle,
          channelType,
          isAdmin: false,
          error: `Bot status in ${CANONICAL_CHANNEL_USERNAME} is '${memberStatus}', requires 'administrator'`,
          checkedAt,
        };
      }

      // Check posting permission specifically
      const canPostMessages = isCreator || Boolean(memberBody.result?.can_post_messages);
      if (!canPostMessages) {
        return {
          isConfigured: true,
          isVerified: false,
          status: 'MISSING_POST_PERMISSION',
          channelUsername: CANONICAL_CHANNEL_USERNAME,
          channelTitle,
          channelType,
          isAdmin: true,
          canPostMessages: false,
          error: `Bot is an administrator but lacks 'can_post_messages' permission in ${CANONICAL_CHANNEL_USERNAME}`,
          checkedAt,
        };
      }

      return {
        isConfigured: true,
        isVerified: true,
        status: 'VERIFIED',
        channelUsername: CANONICAL_CHANNEL_USERNAME,
        channelTitle,
        channelType,
        isAdmin: true,
        canPostMessages: true,
        checkedAt,
      };
    } catch (err: any) {
      return {
        isConfigured: true,
        isVerified: false,
        status: 'ERROR',
        channelUsername: CANONICAL_CHANNEL_USERNAME,
        error: err.name === 'AbortError' ? 'Channel verification timed out' : (err.message || 'Network error reaching Telegram API'),
        checkedAt,
      };
    }
  }

  // Compatibility wrapper
  public async verifyGroup(): Promise<ChannelVerificationResult> {
    return this.verifyChannel();
  }

  /**
   * Verify destination safety: Only @forexmetalsignals allowed
   */
  public verifyDestinationSafety(targetChat?: string): { isValid: boolean; errorCode?: string; error?: string } {
    const chat = (targetChat || CANONICAL_CHANNEL_USERNAME).trim().toLowerCase();
    if (chat.startsWith('-') || /^-?\d+$/.test(chat)) {
      return {
        isValid: false,
        errorCode: 'PRIVATE_GROUPS_PROHIBITED',
        error: `Private group destinations (${chat}) are prohibited. FEF CORTEX broadcasts exclusively to public channel ${CANONICAL_CHANNEL_USERNAME}.`,
      };
    }

    if (chat !== CANONICAL_CHANNEL_USERNAME) {
      return {
        isValid: false,
        errorCode: 'CHANNEL_NOT_ALLOWED',
        error: `Destination '${chat}' is not permitted. The sole authorized broadcast destination is ${CANONICAL_CHANNEL_USERNAME}.`,
      };
    }

    return { isValid: true };
  }

  /**
   * Send signal photo using Telegram sendPhoto with multipart form data
   */
  public async sendSignalPhoto(params: {
    chatId?: string;
    photoBuffer: Buffer;
    caption: string;
    forceLive?: boolean;
  }): Promise<TelegramSendResult> {
    const cfg = this.loadConfig();
    const targetChat = (params.chatId || cfg.channelUsername || CANONICAL_CHANNEL_USERNAME).trim().toLowerCase();
    const nowIso = new Date().toISOString();

    // 1. Strict Destination Boundary Check: Only @forexmetalsignals allowed
    const safetyCheck = this.verifyDestinationSafety(targetChat);
    if (!safetyCheck.isValid) {
      return {
        success: false,
        errorCode: safetyCheck.errorCode,
        error: safetyCheck.error,
      };
    }

    // 2. Caption Length Validation (Telegram strict 1024 character limit)
    if (params.caption && params.caption.length > 1024) {
      return {
        success: false,
        errorCode: 'CAPTION_TOO_LONG',
        error: `Caption length (${params.caption.length}) exceeds Telegram limit of 1024 characters`,
      };
    }

    // 3. Dry-Run Mode Gate (bypassed only when explicit admin test dispatch specifies forceLive: true)
    if (cfg.dryRun && !params.forceLive) {
      const syntheticMsgId = Math.floor(100000 + Math.random() * 900000);
      return {
        success: true,
        isDryRun: true,
        telegramMessageId: syntheticMsgId,
        deliveredAt: nowIso,
      };
    }

    // 4. Live Broadcast Delivery via Telegram Bot API
    if (!cfg.botToken) {
      return {
        success: false,
        errorCode: 'NOT_CONFIGURED',
        error: 'TELEGRAM_BOT_TOKEN is not configured',
      };
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout
      const fetchImpl = this.customOptions.fetchFn || fetch;

      // Build native FormData multipart payload for robust binary delivery
      const formData = new FormData();
      formData.append('chat_id', CANONICAL_CHANNEL_USERNAME);
      formData.append('caption', params.caption);
      formData.append('parse_mode', 'HTML');
      const blob = new Blob([params.photoBuffer], { type: 'image/png' });
      formData.append('photo', blob, 'signal.png');

      const resp = await fetchImpl(`https://api.telegram.org/bot${cfg.botToken}/sendPhoto`, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const body = await resp.json();

      if (!resp.ok || !body.ok) {
        if (resp.status === 429) {
          const retryAfter = body?.parameters?.retry_after || 60;
          return {
            success: false,
            errorCode: 'RATE_LIMITED',
            error: `Telegram rate limited. Retry after ${retryAfter}s`,
          };
        }

        return {
          success: false,
          errorCode: `TELEGRAM_${resp.status}`,
          error: body?.description || `Telegram returned HTTP ${resp.status}`,
        };
      }

      return {
        success: true,
        telegramMessageId: body.result?.message_id,
        deliveredAt: nowIso,
      };
    } catch (err: any) {
      return {
        success: false,
        errorCode: err.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR',
        error: err.name === 'AbortError' ? 'Telegram request timed out after 15s' : (err.message || 'Network transmission failed'),
      };
    }
  }

  /**
   * Generates a concise, institutional HTML-formatted caption fitting strictly under 1024 characters
   * Supports NEW_OPPORTUNITY, SETUP_UPDATE, and SETUP_INVALIDATED
   */
  public formatSignalCaption(payload: ValidatedSignalPayload): string {
    const escapeHtml = escapeTelegramHtml;
    const isBuy = payload.direction === 'BUY';
    const dirEmoji = isBuy ? '🟢' : '🔴';
    const validatedUtc = new Date(payload.timestamps.validatedAt || Date.now()).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
    const msgType = payload.messageType || 'NEW_OPPORTUNITY';

    const fmtNum = (val: number | undefined) => {
      if (val === undefined || isNaN(val)) return '-';
      if (val >= 1000) return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      if (val >= 100) return val.toFixed(2);
      if (val >= 1) return val.toFixed(4);
      return val.toFixed(5);
    };

    // Case 1: SETUP_INVALIDATED
    if (msgType === 'SETUP_INVALIDATED' || payload.setupIntelligence?.lifecycle === 'INVALIDATED') {
      return `<b>FEF CORTEX | SETUP INVALIDATED</b>
⚠️ <b>${escapeHtml(payload.direction)} ${escapeHtml(payload.symbol)}</b> (${escapeHtml(payload.timeframe)})

<b>Invalidation Details:</b>
• <b>Reference Level:</b> <code>${fmtNum(payload.setupIntelligence.invalidationPrice || payload.stopLoss.price)}</code>
• <b>Reason:</b> <i>Setup invalidated before trigger confirmation. Position cancelled.</i>

<b>Official Links:</b>
• <b>Dashboard:</b> <a href="https://app.feftradingsolutions.com">app.feftradingsolutions.com</a>
• <b>Website:</b> <a href="https://www.feftradingsolutions.com">www.feftradingsolutions.com</a>

<code>${escapeHtml(payload.signalId)}</code> · ${validatedUtc}
<i>FEF CORTEX · READ-ONLY Architecture · No Execution Advice</i>`;
    }

    // Case 2: SETUP_UPDATE
    if (msgType === 'SETUP_UPDATE' || (payload.setupRevision && payload.setupRevision > 1)) {
      return `<b>FEF CORTEX | SETUP UPDATE (Rev ${payload.setupRevision})</b>
${dirEmoji} <b>${escapeHtml(payload.direction)} ${escapeHtml(payload.symbol)}</b> (${escapeHtml(payload.timeframe)})

<b>Updated Geometry:</b>
• <b>Entry:</b> <code>${fmtNum(payload.entryZone.low)} – ${fmtNum(payload.entryZone.high)}</code>
• <b>Stop Loss:</b> <code>${fmtNum(payload.stopLoss.price)}</code> (-${fmtNum(payload.stopLoss.distance)})
• <b>TP1:</b> <code>${fmtNum(payload.takeProfit1.price)}</code> (+${fmtNum(payload.takeProfit1.distance)} · R:R ${payload.takeProfit1.riskReward}:1)${payload.takeProfit2 ? `\n• <b>TP2:</b> <code>${fmtNum(payload.takeProfit2.price)}</code> (+${fmtNum(payload.takeProfit2.distance)} · R:R ${payload.takeProfit2.riskReward}:1)` : ''}${payload.takeProfit3 ? `\n• <b>TP3:</b> <code>${fmtNum(payload.takeProfit3.price)}</code> (+${fmtNum(payload.takeProfit3.distance)} · R:R ${payload.takeProfit3.riskReward}:1)` : ''}
• <b>R:R:</b> <b>${payload.riskRewardRatio}:1</b> (Policy ≥ 2.0:1 ✓)

<b>Intelligence & Insight:</b>
• <b>Engine:</b> CORTEX Multi-Model (${payload.decisionEngine.confidencePct}% Conf)
• <b>Insight:</b> <i>${escapeHtml((payload.setupIntelligence.thesis || 'Adjusted trading zone per structure change.').slice(0, 140))}</i>

<b>Official Links:</b>
• <b>Dashboard:</b> <a href="https://app.feftradingsolutions.com">app.feftradingsolutions.com</a>
• <b>Website:</b> <a href="https://www.feftradingsolutions.com">www.feftradingsolutions.com</a>

<code>${escapeHtml(payload.signalId)}</code> · ${validatedUtc}
<i>FEF CORTEX · READ-ONLY Architecture · Analytical Setup</i>`;
    }

    // Case 3: NEW_OPPORTUNITY (Default)
    return `<b>FEF CORTEX | NEW OPPORTUNITY</b>
${dirEmoji} <b>${escapeHtml(payload.direction)} ${escapeHtml(payload.symbol)}</b> (${escapeHtml(payload.timeframe)})

<b>Trade Geometry:</b>
• <b>Entry:</b> <code>${fmtNum(payload.entryZone.low)} – ${fmtNum(payload.entryZone.high)}</code> (Mid: <code>${fmtNum(payload.entryZone.midpoint)}</code>)
• <b>Stop Loss:</b> <code>${fmtNum(payload.stopLoss.price)}</code> (-${fmtNum(payload.stopLoss.distance)})
• <b>TP1:</b> <code>${fmtNum(payload.takeProfit1.price)}</code> (+${fmtNum(payload.takeProfit1.distance)} · R:R ${payload.takeProfit1.riskReward}:1)${payload.takeProfit2 ? `\n• <b>TP2:</b> <code>${fmtNum(payload.takeProfit2.price)}</code> (+${fmtNum(payload.takeProfit2.distance)} · R:R ${payload.takeProfit2.riskReward}:1)` : ''}${payload.takeProfit3 ? `\n• <b>TP3:</b> <code>${fmtNum(payload.takeProfit3.price)}</code> (+${fmtNum(payload.takeProfit3.distance)} · R:R ${payload.takeProfit3.riskReward}:1)` : ''}
• <b>R:R:</b> <b>${payload.riskRewardRatio}:1</b> (Policy ≥ 2.0:1 ✓)

<b>Institutional Intelligence:</b>
• <b>Engine:</b> CORTEX Multi-Model (${payload.decisionEngine.confidencePct}% Conf · ${escapeHtml(payload.decisionEngine.maturity)})
• <b>Signal Insight:</b> <i>${escapeHtml((payload.setupIntelligence.thesis || 'Price is showing continuation above key support.').slice(0, 140))}</i>

<b>Official Links:</b>
• <b>Dashboard:</b> <a href="https://app.feftradingsolutions.com">app.feftradingsolutions.com</a>
• <b>Website:</b> <a href="https://www.feftradingsolutions.com">www.feftradingsolutions.com</a>

<code>${escapeHtml(payload.signalId)}</code> · ${validatedUtc}
<i>FEF CORTEX · READ-ONLY Architecture · Analytical Setup</i>`;
  }
}

export const telegramClient = new TelegramClient();
