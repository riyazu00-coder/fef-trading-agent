import { NextRequest, NextResponse } from 'next/server';
import { telegramClient } from '../../../../lib/telegram/telegram-client';
import { isTelegramAdminAuthorized } from '../../../../lib/telegram/telegram-auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const auth = isTelegramAdminAuthorized(req);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 401 });
    }

    const botCheck = await telegramClient.verifyBot();
    const channelCheck = await telegramClient.verifyChannel();

    return NextResponse.json({
      success: botCheck.isValid && channelCheck.isVerified,
      bot: botCheck,
      channel: channelCheck,
      destination: channelCheck,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Failed to verify Telegram connectivity',
      },
      { status: 500 }
    );
  }
}

