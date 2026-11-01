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

    const body = await req.json().catch(() => ({}));
    const reason = typeof body.reason === 'string' ? body.reason : 'Paused by administrator';

    telegramSignalService.pauseBroadcasting(reason);

    return NextResponse.json({
      success: true,
      isPaused: true,
      reason,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Failed to pause broadcasting',
      },
      { status: 500 }
    );
  }
}

