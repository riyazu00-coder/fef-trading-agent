import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'How to Use FEF CORTEX — Onboarding Guide & MT5 Bridge Protocol',
  description:
    'Comprehensive documentation for FEF CORTEX: platform orientation, multi-agent analysis workflows, MT5 HTTP Bridge EA installation, and execution safety protocols.',
  alternates: {
    canonical: 'https://app.feftradingsolutions.com/how-to-use',
  },
  openGraph: {
    title: 'How to Use FEF CORTEX — Onboarding Guide & MT5 Bridge Protocol',
    description:
      'Comprehensive documentation for FEF CORTEX: platform orientation, MT5 HTTP Bridge EA setup, and execution safety protocols.',
    url: 'https://app.feftradingsolutions.com/how-to-use',
    type: 'website',
  },
};

export default function HowToUseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
