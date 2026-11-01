import { NextResponse } from 'next/server';
import { getPipelineTrace } from '@/lib/telegram/telegram-pipeline-monitor';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const trace = await getPipelineTrace();
    return NextResponse.json({
      success: true,
      ...trace,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Failed to aggregate Telegram Signal Pipeline health trace',
      },
      { status: 500 }
    );
  }
}

