import { NextRequest } from 'next/server';
import { licenseService } from '../licensing/license-service';
import { verifySessionToken } from '../licensing/member-session-token';

const ADMIN_API_KEY = process.env.FEF_ADMIN_API_KEY || 'fef_admin_secret_key_v1';

export function isTelegramAdminAuthorized(req: NextRequest): { authorized: boolean; memberId?: string } {
  // 1. Check API Key header
  const authHeader = req.headers.get('authorization') || req.headers.get('x-admin-key');
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (token === ADMIN_API_KEY) {
      return { authorized: true };
    }
  }

  // 2. Check Session Cookie for MASTER role
  const sessionCookie = req.cookies.get('fef_member_session')?.value;
  if (sessionCookie) {
    const verified = verifySessionToken(sessionCookie);
    if (verified.valid && verified.memberId) {
      const member = licenseService.getMemberById(verified.memberId);
      if (member && member.role === 'MASTER' && member.status === 'ACTIVE') {
        return { authorized: true, memberId: verified.memberId };
      }
    }
  }

  return { authorized: false };
}

