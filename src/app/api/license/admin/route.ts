import { NextRequest, NextResponse } from 'next/server';
import { licenseService } from '@/lib/licensing/license-service';
import { licenseStore } from '@/lib/licensing/license-store';
import { MemberRecord } from '@/lib/licensing/license-types';
import { verifySessionToken } from '@/lib/licensing/member-session-token';

export const dynamic = 'force-dynamic';

const ADMIN_API_KEY = process.env.FEF_ADMIN_API_KEY || 'fef_admin_secret_key_v1';

function isAuthorized(req: NextRequest): { authorized: boolean; isMasterSession?: boolean } {
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
        return { authorized: true, isMasterSession: true };
      }
    }
  }

  return { authorized: false };
}

/**
 * GET /api/license/admin
 * List all licenses and system status (Admin/MASTER only)
 */
export async function GET(req: NextRequest) {
  const auth = isAuthorized(req);
  if (!auth.authorized) {
    return NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const licenses = licenseService.listLicenses();
  return NextResponse.json({
    success: true,
    count: licenses.length,
    licenses,
  });
}

/**
 * POST /api/license/admin
 * Admin Actions:
 * - 'CREATE': Create license key
 * - 'SUSPEND': Suspend license
 * - 'REVOKE': Revoke license
 * - 'ACTIVATE': Activate license
 * - 'RESET_DEVICE': Reset 1/1 device slot
 * - 'CREATE_MEMBER': Create member + generate temporary password
 * - 'ASSIGN_LICENSE': Assign license to member
 * - 'SUSPEND_MEMBER': Suspend member account
 * - 'REACTIVATE_MEMBER': Reactivate member account
 * - 'RESET_MEMBER_PASSWORD': Generate new temporary password for member
 * - 'LIST_MEMBERS': List all members
 * - 'BOOTSTRAP_MASTER': Bootstrap owner MASTER account
 */
export async function POST(req: NextRequest) {
  const auth = isAuthorized(req);
  if (!auth.authorized) {
    return NextResponse.json({ success: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const action = body.action || 'CREATE';

    switch (action) {
      case 'CREATE': {
        const { customerName, customerEmail, expiresInDays, notes } = body;
        const result = licenseService.createLicense({ customerName, customerEmail, expiresInDays, notes });
        return NextResponse.json({
          success: true,
          licenseKey: result.licenseKey, // Plaintext shown ONLY ONCE upon creation to admin
          record: result.record,
        });
      }

      case 'SUSPEND': {
        const { licenseId } = body;
        if (!licenseId) return NextResponse.json({ success: false, error: 'MISSING_LICENSE_ID' }, { status: 400 });
        const updated = licenseService.suspendLicense(licenseId);
        return NextResponse.json({ success: Boolean(updated), record: updated });
      }

      case 'REVOKE': {
        const { licenseId } = body;
        if (!licenseId) return NextResponse.json({ success: false, error: 'MISSING_LICENSE_ID' }, { status: 400 });
        const updated = licenseService.revokeLicense(licenseId);
        return NextResponse.json({ success: Boolean(updated), record: updated });
      }

      case 'ACTIVATE': {
        const { licenseId } = body;
        if (!licenseId) return NextResponse.json({ success: false, error: 'MISSING_LICENSE_ID' }, { status: 400 });
        const updated = licenseService.activateLicenseAdmin(licenseId);
        return NextResponse.json({ success: Boolean(updated), record: updated });
      }

      case 'RESET_DEVICE': {
        const { licenseId } = body;
        if (!licenseId) return NextResponse.json({ success: false, error: 'MISSING_LICENSE_ID' }, { status: 400 });
        const updated = licenseService.resetDeviceActivation(licenseId);
        return NextResponse.json({
          success: Boolean(updated),
          message: 'Device activation reset. License may now be activated on one new computer.',
          record: updated,
        });
      }

      case 'CREATE_MEMBER': {
        const { email, name, role = 'MEMBER', assignedLicenseId, autoCreateLicense } = body;
        if (!email || !name) {
          return NextResponse.json({ success: false, error: 'MISSING_FIELDS', message: 'Email and name are required.' }, { status: 400 });
        }

        // Generate temporary password
        const tempPassword = licenseService.generateTemporaryPassword();

        let finalLicenseId = assignedLicenseId || null;

        // Auto-create license if requested and none passed
        let createdLicenseKey: string | null = null;
        if (role === 'MEMBER' && !finalLicenseId && autoCreateLicense) {
          const licRes = licenseService.createLicense({ customerName: name, customerEmail: email });
          finalLicenseId = licRes.record.licenseId;
          createdLicenseKey = licRes.licenseKey;
        }

        const member = licenseService.registerMember({
          email,
          password: tempPassword,
          name,
          role,
          assignedLicenseId: finalLicenseId,
          mustChangePassword: true, // Requires mandatory password change on first login
        });

        return NextResponse.json({
          success: true,
          tempPassword, // Returned ONLY ONCE to master/admin
          licenseKey: createdLicenseKey,
          member: {
            memberId: member.memberId,
            email: member.email,
            name: member.name,
            role: member.role,
            status: member.status,
            mustChangePassword: member.mustChangePassword,
            assignedLicenseId: member.assignedLicenseId,
          },
        });
      }

      case 'ASSIGN_LICENSE': {
        const { memberId, licenseId } = body;
        if (!memberId) return NextResponse.json({ success: false, error: 'MISSING_MEMBER_ID' }, { status: 400 });
        const updated = licenseService.assignLicenseToMember(memberId, licenseId || null);
        return NextResponse.json({
          success: Boolean(updated),
          member: updated,
        });
      }

      case 'SUSPEND_MEMBER': {
        const { memberId } = body;
        if (!memberId) return NextResponse.json({ success: false, error: 'MISSING_MEMBER_ID' }, { status: 400 });
        const updated = licenseService.suspendMember(memberId);
        return NextResponse.json({ success: Boolean(updated), member: updated });
      }

      case 'REACTIVATE_MEMBER': {
        const { memberId } = body;
        if (!memberId) return NextResponse.json({ success: false, error: 'MISSING_MEMBER_ID' }, { status: 400 });
        const updated = licenseService.reactivateMember(memberId);
        return NextResponse.json({ success: Boolean(updated), member: updated });
      }

      case 'RESET_MEMBER_PASSWORD': {
        const { memberId } = body;
        if (!memberId) return NextResponse.json({ success: false, error: 'MISSING_MEMBER_ID' }, { status: 400 });
        const res = licenseService.resetMemberTemporaryPassword(memberId);
        return NextResponse.json(res);
      }

      case 'LIST_MEMBERS': {
        const members = licenseStore.getAllMembers().map((m: MemberRecord) => {
          const license = m.assignedLicenseId ? licenseStore.getByLicenseId(m.assignedLicenseId) : null;
          return {
            memberId: m.memberId,
            email: m.email,
            name: m.name,
            role: m.role || 'MEMBER',
            status: m.status || 'ACTIVE',
            mustChangePassword: Boolean(m.mustChangePassword),
            assignedLicenseId: m.assignedLicenseId,
            createdAt: m.createdAt,
            lastLoginAt: m.lastLoginAt ?? null,
            license: license
              ? {
                  licenseId: license.licenseId,
                  prefix: license.licenseKeyPrefix,
                  status: license.status,
                  deviceSlot: license.activatedDeviceHash ? '1/1' : '0/1',
                  activatedAt: license.activatedAt,
                  lastValidatedAt: license.lastValidatedAt,
                  expiresAt: license.expiresAt,
                }
              : null,
          };
        });
        return NextResponse.json({ success: true, count: members.length, members });
      }

      case 'BOOTSTRAP_MASTER': {
        const { email, password, name } = body;
        if (!email || !password) {
          return NextResponse.json({ success: false, error: 'MISSING_CREDENTIALS' }, { status: 400 });
        }
        const master = licenseService.bootstrapMasterAccount(email, password, name);
        return NextResponse.json({
          success: true,
          message: 'MASTER account initialized successfully.',
          master: {
            memberId: master.memberId,
            email: master.email,
            name: master.name,
            role: master.role,
          },
        });
      }

      default:
        return NextResponse.json({ success: false, error: 'UNSUPPORTED_ACTION' }, { status: 400 });
    }
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
