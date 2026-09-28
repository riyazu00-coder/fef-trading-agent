import { NextResponse } from 'next/server';
import { workerStateManager } from '@/lib/worker/worker-state';

export const dynamic = 'force-dynamic';

export async function GET() {
  const state = workerStateManager.getState();
  return NextResponse.json(state, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
