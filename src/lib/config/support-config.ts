/**
 * Centralized Brand & Institutional Support Configuration
 * Single source of truth for platform domain and support channels.
 */

export const BRAND_CONFIG = {
  siteName: 'FEF Trading Solutions',
  tagline: 'AI Intelligence • Risk Tools • Market Opportunities',
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || 'https://feftradingsolutions.com',
  domainDisplay: 'feftradingsolutions.com',
};

export interface SupportChannel {
  id: string;
  name: string;
  status: 'ONLINE' | 'COMING_SOON' | 'ACTIVE_24_7';
  statusLabel: string;
  description: string;
  actionType: 'mailto' | 'link' | 'none';
  destination?: string;
  badgeColor: string;
  icon: string;
}

export const SUPPORT_CONFIG: {
  deskStatus: string;
  supportEmail: string;
  supportWhatsApp: string;
  supportUrl: string;
  supportMessage: string;
  safetyDisclaimer: string;
  channels: SupportChannel[];
} = {
  deskStatus: '24/7 ACTIVE DESK',
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'support@feftradingsolutions.com',
  supportWhatsApp: process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP || '+1 (800) 333-8723',
  supportUrl: process.env.NEXT_PUBLIC_SUPPORT_URL || 'https://feftradingsolutions.com/support',
  supportMessage:
    'Need help with FEF Trading Solutions? Our support channels are available 24/7 for platform operations and account assistance.',
  safetyDisclaimer:
    'Support is strictly for platform operations, account assistance, and technical diagnostics. FEF Trading Solutions does NOT provide guaranteed financial advice or investment signals.',
  channels: [
    {
      id: 'whatsapp',
      name: 'WhatsApp Risk Hotline',
      status: 'ACTIVE_24_7',
      statusLabel: 'Online 24/7',
      description: 'Immediate mobile escalation for trade anomalies, connectivity, and risk alerts.',
      actionType: 'link',
      destination: 'https://wa.me/18003338723',
      badgeColor: 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40',
      icon: '💬',
    },
    {
      id: 'email',
      name: 'Direct Priority Desk (Email)',
      status: 'ACTIVE_24_7',
      statusLabel: '24/7 Available',
      description: 'Response SLA: < 15 minutes for verified institutional accounts.',
      actionType: 'mailto',
      destination: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'support@feftradingsolutions.com',
      badgeColor: 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40',
      icon: '✉️',
    },
    {
      id: 'bug_report',
      name: 'Report a Technical Problem',
      status: 'ACTIVE_24_7',
      statusLabel: 'Ticket Tracker',
      description: 'Submit tick discrepancies, vision misclassifications, or UI incident logs.',
      actionType: 'mailto',
      destination: `mailto:${process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'bugs@feftradingsolutions.com'}?subject=[Bug/Technical%20Report]%20FEF%20Cockpit`,
      badgeColor: 'bg-cyan-950/60 text-cyan-300 border-cyan-500/40',
      icon: '🐞',
    },
    {
      id: 'platform_help',
      name: 'Trading Platform Help',
      status: 'ACTIVE_24_7',
      statusLabel: 'Knowledge Base',
      description: 'Guides on Chart Analyzer, 15-Agent Council interpretations, and Risk Guardian.',
      actionType: 'link',
      destination: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://feftradingsolutions.com'}/docs`,
      badgeColor: 'bg-blue-950/60 text-blue-300 border-blue-500/40',
      icon: '📘',
    },
    {
      id: 'billing_help',
      name: 'Account & Subscription Help',
      status: 'ACTIVE_24_7',
      statusLabel: 'Account Desk',
      description: 'Subscription tier management, MT5 API key provisioning, and seat licenses.',
      actionType: 'mailto',
      destination: `mailto:${process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'billing@feftradingsolutions.com'}?subject=[Account/Subscription%20Query]%20FEF%20Cockpit`,
      badgeColor: 'bg-purple-950/60 text-purple-300 border-purple-500/40',
      icon: '💳',
    },
    {
      id: 'livechat',
      name: 'Cockpit Terminal Live Chat',
      status: 'COMING_SOON',
      statusLabel: 'Coming Soon in V1.1',
      description: 'Native in-cockpit WebSocket chat with quantitative analysts & engineers.',
      actionType: 'none',
      badgeColor: 'bg-gray-800/60 text-gray-400 border-gray-700',
      icon: '⚡',
    },
  ],
};
