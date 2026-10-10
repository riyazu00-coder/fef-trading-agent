import { NextRequest, NextResponse } from 'next/server';
import { clientLicenseController } from '@/lib/licensing/client-license-controller';

export const dynamic = 'force-dynamic';

/**
 * GET /api/license/status
 * Returns current device licensing status
 */
export async function GET() {
  try {
    const evaluation = clientLicenseController.evaluateClientLicense();
    return NextResponse.json({
      success: evaluation.valid,
      ...evaluation,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        valid: false,
        status: 'ERROR',
        code: 'LICENSE_VALIDATION_UNAVAILABLE',
        message: err.message || 'Error evaluating license status',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/license/status
 * Action: 'ACTIVATE' or 'DEACTIVATE'
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action || 'ACTIVATE';

    if (action === 'ACTIVATE') {
      const licenseKey = body.licenseKey;
      if (!licenseKey) {
        return NextResponse.json(
          { success: false, error: 'MISSING_PARAM', message: 'License key is required.' },
          { status: 400 }
        );
      }

      const result = clientLicenseController.activateClient(licenseKey);
      if (!result.success) {
        return NextResponse.json(
          { success: false, error: result.code, message: result.message },
          { status: 403 }
        );
      }

      const currentStatus = clientLicenseController.evaluateClientLicense();
      return NextResponse.json({
        success: true,
        message: result.message,
        license: currentStatus,
      });
    }

    if (action === 'DEACTIVATE') {
      clientLicenseController.deactivateClient();
      return NextResponse.json({
        success: true,
        message: 'License removed from this computer.',
      });
    }

    return NextResponse.json(
      { success: false, error: 'UNSUPPORTED_ACTION', message: `Action ${action} not supported.` },
      { status: 400 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: 'EXCEPTION', message: err.message || 'Failed to process licensing action' },
      { status: 500 }
    );
  }
}

