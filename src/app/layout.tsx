import '../styles/globals.css';
import { ActiveAssetProvider } from '@/context/ActiveAssetContext';
import { MT5TelemetryProvider } from '@/context/MT5TelemetryContext';
import { LicenseProvider } from '@/context/LicenseContext';
import { MemberAuthProvider } from '@/context/MemberAuthContext';
import { TradeOpportunityPopup } from '@/components/cockpit/TradeOpportunityPopup';
import { InteractiveGlassProvider } from '@/components/common/InteractiveGlassProvider';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  metadataBase: new URL('https://app.feftradingsolutions.com'),
  applicationName: 'FEF CORTEX',
  title: {
    default: 'FEF CORTEX | AI Market Intelligence & Multi-Agent Trading Analytics',
    template: '%s | FEF CORTEX',
  },
  description:
    'FEF CORTEX is a quantitative multi-agent financial market intelligence platform providing real-time technical analysis, macro correlation tracking, risk guardian boundaries, and MetaTrader 5 broker connectivity.',
  creator: 'FEF Trading Solutions',
  publisher: 'FEF Trading Solutions',
  category: 'Finance',
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    siteName: 'FEF CORTEX',
    type: 'website',
    locale: 'en_US',
    title: 'FEF CORTEX | AI Market Intelligence & Multi-Agent Trading Analytics',
    description:
      'Quantitative multi-agent financial intelligence and execution risk support for MetaTrader 5 connected markets.',
    url: 'https://app.feftradingsolutions.com',
  },
  twitter: {
    card: 'summary',
    title: 'FEF CORTEX | AI Market Intelligence & Multi-Agent Trading Analytics',
    description:
      'Quantitative multi-agent financial intelligence and execution risk support for MetaTrader 5 connected markets.',
  },
};

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': 'https://www.feftradingsolutions.com/#organization',
      name: 'FEF Trading Solutions',
      url: 'https://www.feftradingsolutions.com',
      logo: 'https://app.feftradingsolutions.com/images/fef-logo.png',
    },
    {
      '@type': 'WebApplication',
      '@id': 'https://app.feftradingsolutions.com/#software',
      name: 'FEF CORTEX',
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web, MetaTrader 5',
      description:
        'Quantitative multi-agent financial market intelligence, automated risk guardian boundaries, and MetaTrader 5 broker connectivity.',
      provider: {
        '@id': 'https://www.feftradingsolutions.com/#organization',
      },
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </head>
      <body className="bg-[#030711] text-[#F8FAFC] min-h-screen antialiased flex flex-col font-sans selection:bg-[#22D3EE] selection:text-black">
        <LicenseProvider>
          <MemberAuthProvider>
            <ActiveAssetProvider>
              <MT5TelemetryProvider>
                {children}
                <TradeOpportunityPopup />
                <InteractiveGlassProvider />
              </MT5TelemetryProvider>
            </ActiveAssetProvider>
          </MemberAuthProvider>
        </LicenseProvider>
      </body>
    </html>
  );
}
