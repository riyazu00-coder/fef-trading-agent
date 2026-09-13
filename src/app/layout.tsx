import '../styles/globals.css';
import { ActiveAssetProvider } from '@/context/ActiveAssetContext';
import { MT5TelemetryProvider } from '@/context/MT5TelemetryContext';
import { TradeOpportunityPopup } from '@/components/cockpit/TradeOpportunityPopup';

export const metadata = {
  title: 'FEF Trading Solutions | AI-Powered Market Intelligence Operating System',
  description: 'Multi-Asset Institutional AI Market Intelligence, Vision Technical Analysis, and Automated Risk Guardian for Exness Markets',
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#030711] text-[#F8FAFC] min-h-screen antialiased flex flex-col font-sans selection:bg-[#22D3EE] selection:text-black">
        <ActiveAssetProvider>
          <MT5TelemetryProvider>
            {children}
            <TradeOpportunityPopup />
          </MT5TelemetryProvider>
        </ActiveAssetProvider>
      </body>
    </html>
  );
}
