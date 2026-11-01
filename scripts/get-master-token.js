const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function getMasterToken() {
  const SESSION_SECRET = process.env.FEF_SESSION_SECRET || 'FEF_CORTEX_MEMBER_SESSION_SECRET_V1';
  try {
    const rawMembers = fs.readFileSync(path.resolve(process.cwd(), 'data/fef-members-registry.json'), 'utf8');
    const members = JSON.parse(rawMembers);
    const master = members.find(m => m.role === 'MASTER') || members[0];
    if (!master) return null;

    const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
    const content = `${master.memberId}:${master.email}:${master.role}:${expiresAt}`;
    const sig = crypto.createHmac('sha256', SESSION_SECRET).update(content).digest('hex');
    return Buffer.from(`${content}:${sig}`).toString('base64');
  } catch (err) {
    return null;
  }
}

module.exports = getMasterToken;

