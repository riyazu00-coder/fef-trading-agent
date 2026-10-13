import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Vision Chart Analyzer — AI Technical Analysis & Geometry Scanner',
  description:
    'Upload multi-timeframe charts to receive quantitative pattern recognition, institutional liquidity sweep verification, and risk-bounded invalidation levels.',
  alternates: {
    canonical: 'https://app.feftradingsolutions.com/chart-analyzer',
  },
  openGraph: {
    title: 'Vision Chart Analyzer — AI Technical Analysis & Geometry Scanner',
    description:
      'Upload multi-timeframe charts for quantitative pattern recognition, liquidity sweep verification, and risk-bounded invalidation levels.',
    url: 'https://app.feftradingsolutions.com/chart-analyzer',
    type: 'website',
  },
};

export default function ChartAnalyzerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
