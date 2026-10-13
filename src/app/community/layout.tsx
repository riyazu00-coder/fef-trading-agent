import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Community & Access Desk — FEF CORTEX Licensing & Onboarding',
  description:
    'Inquire about FEF CORTEX access entitlements, official MT5 Bridge EA downloads, quantitative community onboarding, and dedicated technical integration support.',
  alternates: {
    canonical: 'https://app.feftradingsolutions.com/community',
  },
  openGraph: {
    title: 'Community & Access Desk — FEF CORTEX Licensing & Onboarding',
    description:
      'Inquire about FEF CORTEX access entitlements, official MT5 Bridge EA downloads, and dedicated technical integration support.',
    url: 'https://app.feftradingsolutions.com/community',
    type: 'website',
  },
};

export default function CommunityLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
