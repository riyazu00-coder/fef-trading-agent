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
    const forceLive = body?.forceLive === true || req.nextUrl.searchParams.get('forceLive') === 'true';

    const testRes = await telegramSignalService.sendTestSignal(forceLive);
    return NextResponse.json({
      success: testRes.success,
      telegramMessageId: testRes.telegramMessageId,
      isDryRun: testRes.isDryRun,
      error: testRes.error,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Failed to dispatch test signal',
      },
      { status: 500 }
    );
  }
}

