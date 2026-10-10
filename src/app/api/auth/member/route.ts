import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { licenseService } from '@/lib/licensing/license-service';
import { getDeviceIdentity } from '@/lib/licensing/device-identity';
import { loadLocalActivationToken, saveLocalActivationToken, clearLocalActivationToken } from '@/lib/licensing/local-token-manager';
import { createSessionToken, verifySessionToken } from '@/lib/licensing/member-session-token';

export const dynamic = 'force-dynamic';

const SESSION_SECRET = process.env.FEF_SESSION_SECRET || 'FEF_CORTEX_MEMBER_SESSION_SECRET_V1';

// In-memory rate limiting map for login attempts: ip -> { count, lastAttempt }
const loginAttemptMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttemptMap.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttemptMap.set(ip, { count: 1, resetAt: now + 60 * 1000 }); // 1 min window
    return true;
  }
  if (entry.count >= 10) { // max 10 attempts per minute
    return false;
  }
  entry.count++;
  return true;
}


/**
 * GET /api/auth/member
 * Get current session profile & status
 */
export async function GET(req: NextRequest) {
  try {
    const sessionCookie = req.cookies.get('fef_member_session')?.value;
    const authHeader = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    const token = sessionCookie || authHeader;

    if (!token) {
      return NextResponse.json({
        authenticated: false,
        member: null,
        license: null,
        isDeviceAuthorized: false,
      });
    }

    const verification = verifySessionToken(token);
    if (!verification.valid || !verification.memberId) {
      return NextResponse.json({
        authenticated: false,
        member: null,
        license: null,
        isDeviceAuthorized: false,
      });
    }

    const member = licenseService.getMemberById(verification.memberId);
    if (!member) {
      return NextResponse.json({
        authenticated: false,
        member: null,
        license: null,
        isDeviceAuthorized: false,
      });
    }

    const isMaster = member.role === 'MASTER';
    const license = !isMaster && member.assignedLicenseId ? licenseService.getLicenseForMember(member.memberId) : null;
    const currentDevice = getDeviceIdentity();
    const localToken = loadLocalActivationToken();

    let isDeviceAuthorized = false;
    let deviceMatchStatus = 'NO_LICENSE';

    if (isMaster) {
      // MASTER has full access without community license or device restriction
      isDeviceAuthorized = true;
      deviceMatchStatus = 'MASTER_BYPASS';
    } else if (license) {
      if (license.status !== 'ACTIVE') {
        deviceMatchStatus = `LICENSE_${license.status}`;
      } else if (!license.activatedDeviceHash) {
        deviceMatchStatus = 'UNCLAIMED'; // 0/1 device slots used
      } else if (license.activatedDeviceHash === currentDevice.fingerprint) {
        deviceMatchStatus = 'AUTHORIZED'; // 1/1 device slots used, matches current computer
        isDeviceAuthorized = true;
      } else {
        deviceMatchStatus = 'ANOTHER_DEVICE'; // 1/1 device slots used on another computer
      }
    }

    return NextResponse.json({
      authenticated: true,
      member: {
        memberId: member.memberId,
        email: member.email,
        username: member.username || null,
        name: member.name,
        role: member.role || 'MEMBER',
        status: member.status || 'ACTIVE',
        mustChangePassword: Boolean(member.mustChangePassword),
        assignedLicenseId: member.assignedLicenseId,
        createdAt: member.createdAt,
        lastLoginAt: member.lastLoginAt ?? null,
      },
      license: license
        ? {
            licenseId: license.licenseId,
            prefix: license.licenseKeyPrefix,
            status: license.status,
            maxDevices: license.maxDevices,
            activatedDeviceHash: license.activatedDeviceHash ? 'BOUND' : null,
            expiresAt: license.expiresAt,
          }
        : null,
      device: {
        fingerprint: currentDevice.fingerprint.substring(0, 8) + '...',
        status: deviceMatchStatus,
        isAuthorized: isDeviceAuthorized,
        hasLocalToken: Boolean(localToken),
      },
      isDeviceAuthorized,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/auth/member
 * Actions: 'LOGIN', 'LOGOUT', 'CHANGE_PASSWORD', 'AUTHORIZE_DEVICE'
 */
export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1';
    const body = await req.json();
    const action = body.action || 'LOGIN';

    if (action === 'LOGIN') {
      if (!checkRateLimit(ip)) {
        return NextResponse.json(
          { success: false, error: 'RATE_LIMITED', message: 'Too many login attempts. Please wait 1 minute.' },
          { status: 429 }
        );
      }

      const identifier = body.identifier || body.email || body.username;
      const { password } = body;
      if (!identifier || !password) {
        return NextResponse.json({ success: false, error: 'Username or email, and password are required.' }, { status: 400 });
      }

      const member = licenseService.authenticateMember(identifier, password);
      if (!member) {
        return NextResponse.json({ success: false, error: 'INVALID_CREDENTIALS', message: 'Invalid username/email or password.' }, { status: 401 });
      }

      if (member.status === 'SUSPENDED') {
        return NextResponse.json({ success: false, error: 'ACCOUNT_SUSPENDED', message: 'Account suspended. Contact administrator.' }, { status: 403 });
      }

      const sessionToken = createSessionToken(member.memberId, member.email, member.role || 'MEMBER');
      const res = NextResponse.json({
        success: true,
        message: 'Authentication successful.',
        member: {
          memberId: member.memberId,
          email: member.email,
          username: member.username || null,
          name: member.name,
          role: member.role || 'MEMBER',
          status: member.status || 'ACTIVE',
          mustChangePassword: Boolean(member.mustChangePassword),
          assignedLicenseId: member.assignedLicenseId,
        },
        token: sessionToken,
      });

      // Set HTTP-only session cookie
      res.cookies.set('fef_member_session', sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 30 * 24 * 60 * 60,
      });

      return res;
    }

    if (action === 'LOGOUT') {
      const res = NextResponse.json({ success: true, message: 'Logged out successfully.' });
      res.cookies.delete('fef_member_session');
      return res;
    }

    if (action === 'CHANGE_PASSWORD') {
      const sessionCookie = req.cookies.get('fef_member_session')?.value;
      const authHeader = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
      const token = sessionCookie || authHeader;

      if (!token) {
        return NextResponse.json({ success: false, error: 'UNAUTHENTICATED' }, { status: 401 });
      }

      const verification = verifySessionToken(token);
      if (!verification.valid || !verification.memberId) {
        return NextResponse.json({ success: false, error: 'INVALID_SESSION' }, { status: 401 });
      }

      const { oldPassword, newPassword } = body;
      if (!oldPassword || !newPassword) {
        return NextResponse.json({ success: false, message: 'Current and new password are required.' }, { status: 400 });
      }

      const changeRes = licenseService.changeMemberPassword(verification.memberId, oldPassword, newPassword);
      if (!changeRes.success) {
        return NextResponse.json({ success: false, message: changeRes.message }, { status: 400 });
      }

      return NextResponse.json({ success: true, message: changeRes.message });
    }

    if (action === 'AUTHORIZE_DEVICE') {
      const sessionCookie = req.cookies.get('fef_member_session')?.value;
      const authHeader = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
      const token = sessionCookie || authHeader;

      if (!token) {
        return NextResponse.json({ success: false, error: 'UNAUTHENTICATED', message: 'Please sign in first.' }, { status: 401 });
      }

      const verification = verifySessionToken(token);
      if (!verification.valid || !verification.memberId) {
        return NextResponse.json({ success: false, error: 'INVALID_SESSION', message: 'Session expired. Please sign in again.' }, { status: 401 });
      }

      const member = licenseService.getMemberById(verification.memberId);
      if (!member) {
        return NextResponse.json({ success: false, error: 'MEMBER_NOT_FOUND', message: 'Member profile not found.' }, { status: 404 });
      }

      if (member.role === 'MASTER') {
        return NextResponse.json({
          success: true,
          message: 'MASTER role does not require single-device entitlement binding.',
        });
      }

      const currentDevice = getDeviceIdentity();
      const authResult = licenseService.authorizeMemberDevice(member.memberId, currentDevice.fingerprint);

      if (!authResult.success) {
        return NextResponse.json({
          success: false,
          error: authResult.error,
          message: authResult.message,
        }, { status: 403 });
      }

      // Save token locally
      if (authResult.token) {
        saveLocalActivationToken(authResult.token);
      }

      return NextResponse.json({
        success: true,
        message: 'This computer is now authorized for your member account (1/1 slots used).',
      });
    }

    return NextResponse.json({ success: false, error: 'UNSUPPORTED_ACTION' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
