import { NextResponse } from 'next/server';
import { aggregateInfrastructureHealth } from '@/lib/infrastructure/infrastructure-aggregator';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const report = await aggregateInfrastructureHealth();
    return NextResponse.json(report, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: 'INFRASTRUCTURE_HEALTH_AGGREGATION_FAILED',
        message: err?.message || 'Failed to aggregate ecosystem health',
      },
      { status: 500 }
    );
  }
}

