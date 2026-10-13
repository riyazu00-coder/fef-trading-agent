import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Multi-Asset Surveillance Desk — 26 Institutional Markets',
  description:
    'Real-time multi-asset market intelligence across Metals, Forex, Equity Indices, Energy Commodities, and Cryptocurrencies monitored by FEF CORTEX.',
  alternates: {
    canonical: 'https://app.feftradingsolutions.com/markets',
  },
  openGraph: {
    title: 'Multi-Asset Surveillance Desk — 26 Institutional Markets | FEF CORTEX',
    description:
      'Real-time multi-asset market intelligence across Metals, Forex, Indices, Energy Commodities, and Cryptocurrencies.',
    url: 'https://app.feftradingsolutions.com/markets',
    type: 'website',
  },
};

export default function MarketsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
