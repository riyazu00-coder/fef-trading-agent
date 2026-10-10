import '../styles/globals.css';
import { ActiveAssetProvider } from '@/context/ActiveAssetContext';
import { MT5TelemetryProvider } from '@/context/MT5TelemetryContext';
import { LicenseProvider } from '@/context/LicenseContext';
import { MemberAuthProvider } from '@/context/MemberAuthContext';
import { TradeOpportunityPopup } from '@/components/cockpit/TradeOpportunityPopup';
import { InteractiveGlassProvider } from '@/components/common/InteractiveGlassProvider';

export const metadata = {
  title: 'FEF CORTEX | Autonomous AI Trading Intelligence Operating System',
  description: 'FEF CORTEX: Multi-Asset Autonomous AI Market Intelligence, Vision Technical Analysis, and Automated Risk Guardian for MT5 Connected Markets',
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#030711] text-[#F8FAFC] min-h-screen antialiased flex flex-col font-sans selection:bg-[#22D3EE] selection:text-black">
        <LicenseProvider>
          <MemberAuthProvider>
            <ActiveAssetProvider>
              <MT5TelemetryProvider>
                {children}
                <TradeOpportunityPopup />
                <InteractiveGlassProvider />
              </MT5TelemetryProvider>
            </ActiveAssetProvider>
          </MemberAuthProvider>
        </LicenseProvider>
      </body>
    </html>
  );
}
