import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/licensing/member-session-token';
import { licenseService } from '@/lib/licensing/license-service';
import {
  CONNECTOR_RELEASE_MANIFEST,
  validateConnectorBinary,
} from '@/lib/downloads/connector-manifest';

export const dynamic = 'force-dynamic';

/**
 * GET /api/downloads/connector
 * Securely serves the compiled MT5 Bridge EA binary ONLY to authenticated Members or Master.
 * Anonymous / unauthenticated requests are strictly rejected with 401 Unauthorized.
 * Inactive accounts receive 403 Forbidden.
 * Fails closed if the binary does not match the canonical release manifest checksum or size.
 */
export async function GET(req: NextRequest) {
  try {
    // 1. Authenticate member via session cookie or authorization header
    const sessionCookie = req.cookies.get('fef_member_session')?.value;
    const authHeader = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    const token = sessionCookie || authHeader;

    if (!token) {
      return NextResponse.json(
        {
          error: 'MEMBER_AUTH_REQUIRED',
          message: 'Member authentication required. Sign in with your Member or Master account to download the MT5 connector.',
        },
        { status: 401 }
      );
    }

    const verification = verifySessionToken(token);
    if (!verification.valid || !verification.memberId) {
      return NextResponse.json(
        {
          error: 'INVALID_SESSION',
          message: 'Your member session has expired or is invalid. Please sign in again.',
        },
        { status: 401 }
      );
    }

    const member = licenseService.getMemberById(verification.memberId);
    if (!member || member.status !== 'ACTIVE') {
      return NextResponse.json(
        {
          error: 'MEMBER_NOT_AUTHORIZED',
          message: 'Member account is inactive or suspended. Access denied.',
        },
        { status: 403 }
      );
    }

    // 2. Validate binary on disk strictly against release manifest
    const validation = validateConnectorBinary();
    if (!validation.valid || !validation.buffer) {
      console.error('[DOWNLOAD ROUTE] Binary integrity validation failed:', validation.error);
      return NextResponse.json(
        {
          error: 'INTEGRITY_CHECK_FAILED',
          message: 'Connector binary verification failed or file is unavailable.',
          detail: process.env.NODE_ENV === 'development' ? validation.error : undefined,
        },
        { status: 500 }
      );
    }

    return new NextResponse(validation.buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${CONNECTOR_RELEASE_MANIFEST.filename}"`,
        'Content-Length': validation.buffer.length.toString(),
        'X-FEF-Binary-Version': CONNECTOR_RELEASE_MANIFEST.version,
        'X-FEF-SHA256': CONNECTOR_RELEASE_MANIFEST.expectedSha256,
        'X-FEF-Release-Date': CONNECTOR_RELEASE_MANIFEST.releaseDate,
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      },
    });
  } catch (err: any) {
    console.error('Connector download route error:', err);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to stream connector binary.' },
      { status: 500 }
    );
  }
}
