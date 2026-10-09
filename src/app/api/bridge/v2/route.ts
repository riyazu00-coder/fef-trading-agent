import { NextRequest, NextResponse } from 'next/server';
import { executionBridgeV2Client } from '@/lib/bridge/execution-bridge-v2-client';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const resource = (searchParams.get('resource') || 'telemetry').toLowerCase();

  try {
    switch (resource) {
      case 'health': {
        const health = await executionBridgeV2Client.getHealth();
        return NextResponse.json(health || { status: 'OFFLINE', error: 'Bridge V2 unreachable' });
      }
      case 'account': {
        const account = await executionBridgeV2Client.getAccount();
        return NextResponse.json(account || { success: false, error: 'Bridge V2 unreachable' });
      }
      case 'specs': {
        const specs = await executionBridgeV2Client.getSpecs();
        return NextResponse.json(specs || { success: false, error: 'Bridge V2 unreachable' });
      }
      case 'quotes': {
        const quotes = await executionBridgeV2Client.getQuotes();
        return NextResponse.json(quotes || { success: false, error: 'Bridge V2 unreachable' });
      }
      case 'positions': {
        const positions = await executionBridgeV2Client.getPositions();
        return NextResponse.json(positions || { success: false, error: 'Bridge V2 unreachable' });
      }
      case 'telemetry':
      default: {
        const telemetry = await executionBridgeV2Client.getUnifiedTelemetry();
        if (telemetry) {
          return NextResponse.json({ success: true, ...telemetry });
        }
        return NextResponse.json({
          success: false,
          localBridgeOnline: false,
          mt5Connected: false,
          state: 'BRIDGE_OFFLINE',
          error: 'Bridge V2 unreachable on :5560',
        });
      }
    }
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Bridge V2 API error' },
      { status: 500 }
    );
  }
}

