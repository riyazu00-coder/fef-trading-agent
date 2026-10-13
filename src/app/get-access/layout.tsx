import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Get Access — FEF CORTEX Community & Licensing',
  description:
    'Join the FEF Trading Solutions quantitative community and obtain authorized access to FEF CORTEX trading intelligence platform.',
  alternates: {
    canonical: 'https://app.feftradingsolutions.com/community',
  },
  robots: {
    index: false,
    follow: true,
  },
};

export default function GetAccessLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
