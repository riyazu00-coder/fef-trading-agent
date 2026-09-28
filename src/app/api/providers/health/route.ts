import { NextResponse } from 'next/server';
import { providerRegistry } from '@/lib/providers/provider-registry';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const health = await providerRegistry.getAllProviderHealth();
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      providers: health,
      summary: {
        total: health.length,
        healthy: health.filter((h) => h.status === 'HEALTHY').length,
        degraded: health.filter((h) => h.status === 'DEGRADED').length,
        offline: health.filter((h) => h.status === 'OFFLINE').length,
      }
    }, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (err: any) {
    return NextResponse.json({
      error: 'Failed to retrieve provider health',
      details: err?.message || 'Unknown error'
    }, { status: 500 });
  }
}
