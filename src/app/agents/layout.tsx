import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Agent Intelligence Network — 32 Quantitative Analysis Agents',
  description:
    'Explore the FEF CORTEX 32-agent neural consensus network: 15 Core Council agents and 17 Institutional Quant Specialists evaluating technicals, macro catalysts, order flow, and risk parameters.',
  alternates: {
    canonical: 'https://app.feftradingsolutions.com/agents',
  },
  openGraph: {
    title: 'Agent Intelligence Network — 32 Quantitative Analysis Agents | FEF CORTEX',
    description:
      'Explore the FEF CORTEX 32-agent neural consensus network evaluating technicals, macro catalysts, order flow, and risk parameters.',
    url: 'https://app.feftradingsolutions.com/agents',
    type: 'website',
  },
};

export default function AgentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
