import { NextRequest, NextResponse } from 'next/server';
import { telegramPersistence } from '../../../../lib/telegram/telegram-persistence';
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
    const signalId = typeof body.signalId === 'string' ? body.signalId.trim() : '';

    if (!signalId) {
      return NextResponse.json({ success: false, error: 'signalId is required' }, { status: 400 });
    }

    const delivery = telegramPersistence.getDeliveryBySignalId(signalId);
    if (!delivery) {
      return NextResponse.json({ success: false, error: 'Delivery record not found for signal' }, { status: 404 });
    }

    // 1. Duplicate Delivery Prevention Gate
    if (delivery.deliveryStatus === 'SENT') {
      return NextResponse.json({
        success: false,
        error: `Signal ${signalId} has already been successfully delivered. Duplicate broadcast prohibited.`
      }, { status: 400 });
    }

    // 2. Setup Revalidation Gate: Fetch authoritative signal event
    const signalEvent = (telegramPersistence as any).db?.prepare(`
      SELECT eligibility_status, payload_json, created_at FROM telegram_signal_events WHERE signal_id = ?
    `)?.get(signalId);

    if (!signalEvent || signalEvent.eligibility_status !== 'ELIGIBLE' || !signalEvent.payload_json) {
      return NextResponse.json({
        success: false,
        error: `Signal ${signalId} fails revalidation: eligibility status is '${signalEvent?.eligibility_status || 'NOT_FOUND'}'. Only verified ELIGIBLE setups can be queued.`
      }, { status: 400 });
    }

    // 3. Payload Freshness Revalidation Gate (15-minute / 900s timeout)
    let payload: any;
    try {
      payload = JSON.parse(signalEvent.payload_json);
    } catch {
      return NextResponse.json({ success: false, error: 'Signal payload is malformed' }, { status: 400 });
    }

    const signalTimestamp = payload.timestamps?.asOf || signalEvent.created_at || 0;
    const signalAgeMs = Date.now() - signalTimestamp;
    const maxSignalAgeMs = 15 * 60 * 1000; // 15 minutes

    if (signalAgeMs > maxSignalAgeMs) {
      return NextResponse.json({
        success: false,
        error: `Setup has expired (signal age: ${Math.round(signalAgeMs / 1000)}s > 900s). Revalidation failed. Stale setups cannot be broadcast.`
      }, { status: 400 });
    }

    // 4. Policy Revalidation: Risk/Reward ratio must meet ≥ 2.0:1
    if (!payload.riskRewardRatio || payload.riskRewardRatio < 2.0) {
      return NextResponse.json({
        success: false,
        error: `Setup fails policy revalidation: Risk/Reward ratio (${payload.riskRewardRatio}) is below 2.0:1 threshold.`
      }, { status: 400 });
    }

    // Revalidation passed: Reset status to QUEUED and next_attempt_at to now
    (telegramPersistence as any).db?.prepare(`
      UPDATE telegram_delivery_queue
      SET delivery_status = 'QUEUED', next_attempt_at = ?, attempts = 0, updated_at = ?
      WHERE id = ?
    `).run(Date.now(), Date.now(), delivery.id);

    telegramPersistence.recordAudit({
      signalId,
      eventType: 'RETRY_SCHEDULED',
      status: 'QUEUED',
      details: 'Manual retry initiated by administrator',
      timestamp: Date.now(),
    });

    telegramSignalService.processQueue().catch(() => {});

    return NextResponse.json({
      success: true,
      message: `Delivery retry initiated for signal ${signalId}`,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Failed to retry delivery',
      },
      { status: 500 }
    );
  }
}

