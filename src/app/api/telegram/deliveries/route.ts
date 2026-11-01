import { NextRequest, NextResponse } from 'next/server';
import { telegramPersistence } from '../../../../lib/telegram/telegram-persistence';
import { isTelegramAdminAuthorized } from '../../../../lib/telegram/telegram-auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const auth = isTelegramAdminAuthorized(req);
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const signalId = searchParams.get('signalId');

    if (signalId) {
      const delivery = telegramPersistence.getDeliveryBySignalId(signalId);
      const auditTrail = telegramPersistence.getAuditTrail(signalId);
      return NextResponse.json({
        success: true,
        delivery,
        auditTrail,
        timestamp: new Date().toISOString(),
      });
    }

    const stats = telegramPersistence.getQueueStats();
    return NextResponse.json({
      success: true,
      stats,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Failed to get delivery queue information',
      },
      { status: 500 }
    );
  }
}

