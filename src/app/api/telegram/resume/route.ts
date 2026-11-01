import { NextRequest, NextResponse } from 'next/server';
import { telegramSignalService } from '../../../../lib/telegram/telegram-signal-service';
import { isTelegramAdminAuthorized } from '../../../../lib/telegram/telegram-auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const auth = isTelegramAdminAuthorized(req);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 401 });
    }

    telegramSignalService.resumeBroadcasting();

    return NextResponse.json({
      success: true,
      isPaused: false,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Failed to resume broadcasting',
      },
      { status: 500 }
    );
  }
}

