import crypto from 'crypto';

const SESSION_SECRET = process.env.FEF_SESSION_SECRET || 'FEF_CORTEX_MEMBER_SESSION_SECRET_V1';

export function createSessionToken(memberId: string, email: string, role: string): string {
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
  const content = `${memberId}:${email}:${role}:${expiresAt}`;
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(content).digest('hex');
  return Buffer.from(`${content}:${sig}`).toString('base64');
}

export function verifySessionToken(token: string): { valid: boolean; memberId?: string; email?: string; role?: string } {
  try {
    const raw = Buffer.from(token, 'base64').toString('utf8');
    const parts = raw.split(':');
    // Supports 4-part (legacy) or 5-part (with role) format
    if (parts.length === 5) {
      const [memberId, email, role, expiresAtStr, sig] = parts;
      const expiresAt = Number(expiresAtStr);
      if (Date.now() > expiresAt) return { valid: false };

      const content = `${memberId}:${email}:${role}:${expiresAtStr}`;
      const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(content).digest('hex');
      if (crypto.timingSafeEqual(Buffer.from(sig, 'utf8'), Buffer.from(expectedSig, 'utf8'))) {
        return { valid: true, memberId, email, role };
      }
      return { valid: false };
    } else if (parts.length === 4) {
      // Legacy format backwards compatibility: [memberId, email, expiresAtStr, sig]
      const [memberId, email, expiresAtStr, sig] = parts;
      const expiresAt = Number(expiresAtStr);
      if (Date.now() > expiresAt) return { valid: false };

      const content = `${memberId}:${email}:${expiresAtStr}`;
      const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(content).digest('hex');
      if (crypto.timingSafeEqual(Buffer.from(sig, 'utf8'), Buffer.from(expectedSig, 'utf8'))) {
        return { valid: true, memberId, email, role: 'MEMBER' };
      }
      return { valid: false };
    }
    return { valid: false };
  } catch {
    return { valid: false };
  }
}

