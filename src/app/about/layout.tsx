import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About FEF CORTEX — Quantitative Architecture & Quantitative Philosophy',
  description:
    'Discover FEF CORTEX: institutional multi-agent market intelligence, deterministic risk boundaries, and MetaTrader 5 broker connectivity developed by FEF Trading Solutions.',
  alternates: {
    canonical: 'https://app.feftradingsolutions.com/about',
  },
  openGraph: {
    title: 'About FEF CORTEX — Quantitative Architecture & Quantitative Philosophy',
    description:
      'Institutional multi-agent market intelligence, deterministic risk boundaries, and MetaTrader 5 connectivity developed by FEF Trading Solutions.',
    url: 'https://app.feftradingsolutions.com/about',
    type: 'website',
  },
};

export default function AboutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
