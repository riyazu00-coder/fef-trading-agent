/**
 * Centralized Brand & Institutional Support Configuration
 * Single source of truth for platform domain and support channels.
 */

export const BRAND_CONFIG = {
  siteName: 'FEF Trading Intelligence',
  tagline: 'AI • MARKETS • RISK • EXECUTION',
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || 'https://feftradingsolutions.com',
  domainDisplay: 'feftradingsolutions.com',
};

export interface SupportChannel {
  id: string;
  name: string;
  status: 'ONLINE' | 'COMING_SOON' | 'AVAILABLE' | 'CONFIGURATION_REQUIRED';
  statusLabel: string;
  description: string;
  actionType: 'mailto' | 'link' | 'none';
  destination?: string;
  badgeColor: string;
  icon: string;
}

/**
 * Authoritative FEF CORTEX WhatsApp Onboarding & EA Access Configuration.
 * 
 * Invariant: If NEXT_PUBLIC_SUPPORT_WHATSAPP is not provided in environment,
 * status is flagged as REQUIRED_CONFIGURATION and URL returns null rather than
 * inventing or using a placeholder phone number.
 */
const rawEnvWhatsApp = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP?.trim() || '';
const sanitizedDigits = rawEnvWhatsApp.replace(/[^0-9]/g, '');

const isWhatsAppConfigured = Boolean(
  rawEnvWhatsApp && 
  sanitizedDigits.length >= 8 && 
  !rawEnvWhatsApp.includes('1800') &&
  !rawEnvWhatsApp.includes('800')
);

export const CORTEX_WHATSAPP_CONFIG = {
  isConfigured: isWhatsAppConfigured,
  phoneNumber: isWhatsAppConfigured ? rawEnvWhatsApp : 'REQUIRED_CONFIGURATION',
  status: isWhatsAppConfigured ? ('CONFIGURED' as const) : ('REQUIRED_CONFIGURATION' as const),
  prefilledMessage: 
    'Hello FEF Trading Solutions,\nI would like to get access to FEF CORTEX and the official MT5 EA.\nPlease help me with onboarding and setup.',
  getWhatsAppUrl(): string | null {
    if (!isWhatsAppConfigured) return null;
    const digits = rawEnvWhatsApp.replace(/[^0-9]/g, '');
    const encoded = encodeURIComponent(this.prefilledMessage);
    return `https://wa.me/${digits}?text=${encoded}`;
  },
};

export const SUPPORT_CONFIG: {
  deskStatus: string;
  supportEmail: string;
  supportWhatsApp: string;
  supportUrl: string;
  supportMessage: string;
  safetyDisclaimer: string;
  channels: SupportChannel[];
} = {
  deskStatus: 'ACTIVE DESK',
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'support@feftradingsolutions.com',
  supportWhatsApp: isWhatsAppConfigured ? rawEnvWhatsApp : 'REQUIRED_CONFIGURATION',
  supportUrl: process.env.NEXT_PUBLIC_SUPPORT_URL || 'https://feftradingsolutions.com/support',
  supportMessage:
    'Need help with FEF Trading Solutions? Our technical team is available for platform onboarding and account assistance.',
  safetyDisclaimer:
    'Support is strictly for platform operations, account assistance, and technical diagnostics. FEF Trading Solutions does NOT provide guaranteed financial advice or investment signals.',
  channels: [
    {
      id: 'whatsapp',
      name: 'WhatsApp Support Desk',
      status: isWhatsAppConfigured ? 'AVAILABLE' : 'CONFIGURATION_REQUIRED',
      statusLabel: isWhatsAppConfigured ? 'Direct Hotline' : 'Config Required',
      description: 'Direct mobile communication for CORTEX onboarding, EA provisioning, and connectivity setup.',
      actionType: 'link',
      destination: isWhatsAppConfigured ? CORTEX_WHATSAPP_CONFIG.getWhatsAppUrl() || undefined : undefined,
      badgeColor: isWhatsAppConfigured ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40' : 'bg-amber-950/60 text-amber-300 border-amber-500/40',
      icon: '💬',
    },
    {
      id: 'email',
      name: 'Direct Support Desk (Email)',
      status: 'AVAILABLE',
      statusLabel: 'Email Desk',
      description: 'Support desk for account assistance, technical inquiries, and general platform queries.',
      actionType: 'mailto',
      destination: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'support@feftradingsolutions.com',
      badgeColor: 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40',
      icon: '✉️',
    },
    {
      id: 'bug_report',
      name: 'Report a Technical Issue',
      status: 'AVAILABLE',
      statusLabel: 'Issue Tracker',
      description: 'Submit tick discrepancies, vision misclassifications, or UI incident logs.',
      actionType: 'mailto',
      destination: `mailto:${process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'bugs@feftradingsolutions.com'}?subject=[Bug/Technical%20Report]%20FEF%20Cockpit`,
      badgeColor: 'bg-cyan-950/60 text-cyan-300 border-cyan-500/40',
      icon: '🐞',
    },
    {
      id: 'platform_help',
      name: 'Platform Knowledge Base',
      status: 'AVAILABLE',
      statusLabel: 'Documentation',
      description: 'Guides on CORTEX intelligence, MT5 EA installation, and Risk Guardian principles.',
      actionType: 'link',
      destination: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://feftradingsolutions.com'}/how-to-use`,
      badgeColor: 'bg-blue-950/60 text-blue-300 border-blue-500/40',
      icon: '📘',
    },
    {
      id: 'livechat',
      name: 'In-Terminal Live Chat',
      status: 'COMING_SOON',
      statusLabel: 'Coming in V1.1',
      description: 'Integrated terminal messaging with technical support specialists.',
      actionType: 'none',
      badgeColor: 'bg-gray-800/60 text-gray-400 border-gray-700',
      icon: '⚡',
    },
  ],
};

