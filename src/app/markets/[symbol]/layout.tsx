import type { Metadata } from 'next';
import { getMarketDefinition } from '@/lib/registry/market-registry';

interface Props {
  params: { symbol: string } | Promise<{ symbol: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const resolvedParams = await Promise.resolve(params);
  const rawSymbol = resolvedParams?.symbol?.toUpperCase() || 'XAUUSD';
  const def = getMarketDefinition(rawSymbol);

  const displayName = def?.displayName || `${rawSymbol} Market`;
  const category = def?.category || 'Financial Markets';
  const description = def?.description
    ? `${displayName} (${rawSymbol}) real-time market intelligence, multi-agent quantitative analysis, and risk-managed execution parameters on FEF CORTEX.`
    : `${rawSymbol} real-time market intelligence, multi-agent quantitative analysis, and risk-managed execution parameters on FEF CORTEX.`;

  return {
    title: `${rawSymbol} — ${displayName} Market Intelligence & Analytics`,
    description,
    alternates: {
      canonical: `https://app.feftradingsolutions.com/markets/${rawSymbol}`,
    },
    openGraph: {
      title: `${rawSymbol} — ${displayName} Market Intelligence | FEF CORTEX`,
      description,
      url: `https://app.feftradingsolutions.com/markets/${rawSymbol}`,
      type: 'website',
    },
  };
}

export default function MarketSymbolLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
