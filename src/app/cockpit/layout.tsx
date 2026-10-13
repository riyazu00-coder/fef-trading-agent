import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'CORTEX Cockpit — Institutional Trading Intelligence Command Center',
  description:
    'Real-time multi-agent financial market surveillance, live MT5 broker telemetry streaming, and automated execution risk controls.',
  alternates: {
    canonical: 'https://app.feftradingsolutions.com',
  },
  robots: {
    index: false,
    follow: true,
  },
};

export default function CockpitLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
