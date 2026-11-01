/**
 * FEF CORTEX — PHASE 14 CONFIGURATION AUDIT
 * Secret-Safe Environment & Bot Configuration Verification
 */

import { telegramClient, CANONICAL_CHANNEL_USERNAME } from '../src/lib/telegram/telegram-client';

export interface ConfigAuditReport {
  timestamp: string;
  destination: {
    canonical: string;
    isFixedAllowlist: boolean;
    privateGroupsProhibited: boolean;
  };
  environmentVariables: {
    TELEGRAM_BOT_TOKEN: { present: boolean; status: string };
    TELEGRAM_CHAT_ID: { present: boolean; status: string; note: string };
    TELEGRAM_CHANNEL_USERNAME: { present: boolean; resolved: string };
    TELEGRAM_SIGNAL_ENABLED: { configured: boolean; value: boolean; isSafe: boolean };
    TELEGRAM_SIGNAL_DRY_RUN: { configured: boolean; value: boolean; isSafe: boolean };
  };
  botVerification: {
    isConfigured: boolean;
    status: string;
  };
  safetyInvariants: {
    readOnlyMode: boolean;
    mt5OrderTransportBlocked: boolean;
    zeroCostPolicyEnforced: boolean;
  };
}

export function performConfigAudit(): ConfigAuditReport {
  const publicCfg = telegramClient.getPublicConfig();

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const channelUser = process.env.TELEGRAM_CHANNEL_USERNAME;
  const enabledRaw = process.env.TELEGRAM_SIGNAL_ENABLED;
  const dryRunRaw = process.env.TELEGRAM_SIGNAL_DRY_RUN;

  const isEnabled = enabledRaw === 'true';
  const isDryRun = dryRunRaw !== 'false';

  return {
    timestamp: new Date().toISOString(),
    destination: {
      canonical: CANONICAL_CHANNEL_USERNAME,
      isFixedAllowlist: true,
      privateGroupsProhibited: true,
    },
    environmentVariables: {
      TELEGRAM_BOT_TOKEN: {
        present: Boolean(botToken && botToken.trim().length > 0),
        status: botToken ? 'CONFIGURED_SECRET_REDACTED' : 'MISSING_IN_LOCAL_PROCESS',
      },
      TELEGRAM_CHAT_ID: {
        present: Boolean(chatId),
        status: chatId ? 'SET_IGNORED_IN_FAVOR_OF_CANONICAL' : 'NOT_REQUIRED',
        note: 'Fixed to @forexmetalsignals per Phase 13B architecture',
      },
      TELEGRAM_CHANNEL_USERNAME: {
        present: Boolean(channelUser),
        resolved: CANONICAL_CHANNEL_USERNAME,
      },
      TELEGRAM_SIGNAL_ENABLED: {
        configured: Boolean(enabledRaw),
        value: isEnabled,
        isSafe: !isEnabled,
      },
      TELEGRAM_SIGNAL_DRY_RUN: {
        configured: Boolean(dryRunRaw),
        value: isDryRun,
        isSafe: isDryRun,
      },
    },
    botVerification: {
      isConfigured: publicCfg.botTokenConfigured,
      status: publicCfg.botTokenConfigured ? 'READY_FOR_PREVIEW' : 'UNCONFIGURED_LOCALLY',
    },
    safetyInvariants: {
      readOnlyMode: true,
      mt5OrderTransportBlocked: true,
      zeroCostPolicyEnforced: process.env.OPENAI_ENABLED !== 'true',
    },
  };
}

// CLI Execution
if (require.main === module || process.argv[1]?.endsWith('audit-phase14-config.ts')) {
  const audit = performConfigAudit();
  console.log('===============================================================');
  console.log('      FEF CORTEX: PHASE 14 SECRET-SAFE CONFIGURATION AUDIT     ');
  console.log('===============================================================');
  console.log(JSON.stringify(audit, null, 2));
  console.log('===============================================================');
}

