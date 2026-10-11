import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { verifySessionToken } from '@/lib/licensing/member-session-token';
import { licenseService } from '@/lib/licensing/license-service';

export const dynamic = 'force-dynamic';

const BINARY_FILENAME = 'FEF_HTTP_Bridge.ex5';
const EXPECTED_SIZE = 99806;
const EXPECTED_SHA256 = '104b63a6989b032aa48ac2e79932693a9bd0ba43c0f022354ee4ea9c82d938fc';

/**
 * GET /api/downloads/connector
 * Securely serves the compiled MT5 Bridge EA binary ONLY to authenticated Members or Master.
 * Anonymous / unauthenticated requests are strictly rejected with 401 Unauthorized.
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

    // 2. Locate binary on disk (primary: storage/binaries, fallback: public/downloads for local resilience)
    const primaryPath = path.resolve(process.cwd(), 'storage/binaries', BINARY_FILENAME);
    const fallbackPath = path.resolve(process.cwd(), 'public/downloads', BINARY_FILENAME);
    const filePath = fs.existsSync(primaryPath) ? primaryPath : fallbackPath;

    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        {
          error: 'FILE_NOT_FOUND',
          message: 'Connector binary is temporarily unavailable. Contact support.',
        },
        { status: 404 }
      );
    }

    const fileBuffer = fs.readFileSync(filePath);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${BINARY_FILENAME}"`,
        'Content-Length': fileBuffer.length.toString(),
        'X-FEF-Binary-Version': '1.21',
        'X-FEF-SHA256': EXPECTED_SHA256,
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      },
    });
  } catch (err: any) {
    console.error('Connector download error:', err);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to stream connector binary.' },
      { status: 500 }
    );
  }
}

