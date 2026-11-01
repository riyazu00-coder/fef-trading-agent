import { NextResponse } from 'next/server';
import { telegramSignalService } from '../../../../lib/telegram/telegram-signal-service';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const status = await telegramSignalService.getStatus();
    return NextResponse.json({
      success: true,
      ...status,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Failed to retrieve Telegram Signal Center status',
      },
      { status: 500 }
    );
  }
}

