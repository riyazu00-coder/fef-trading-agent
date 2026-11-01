import { NextRequest, NextResponse } from 'next/server';
import { telegramSignalService } from '../../../../lib/telegram/telegram-signal-service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
    const signals = telegramSignalService.getRecentSignals(limit);

    return NextResponse.json({
      success: true,
      count: signals.length,
      signals,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Failed to list Telegram signals',
      },
      { status: 500 }
    );
  }
}

