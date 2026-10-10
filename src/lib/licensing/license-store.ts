import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { LicenseRecord, LicenseStatus, MemberRecord } from './license-types';

const STORE_FILE = path.resolve(process.cwd(), 'data/fef-licenses-registry.json');
const MEMBERS_FILE = path.resolve(process.cwd(), 'data/fef-members-registry.json');
const LOCK_FILE = path.resolve(process.cwd(), 'data/fef-licenses-registry.lock');

/**
 * License & Member Store Interface.
 * Can be swapped with PostgreSQL, Prisma, Supabase, or Redis in production.
 * Uses atomic file locking for local server operations.
 */
class LicenseStore {
  private inMemoryCache: Map<string, LicenseRecord> = new Map(); // Keyed by licenseId
  private keyHashIndex: Map<string, string> = new Map(); // licenseKeyHash -> licenseId
  private membersCache: Map<string, MemberRecord> = new Map(); // Keyed by memberId
  private memberEmailIndex: Map<string, string> = new Map(); // email (lowercase) -> memberId
  private memberUsernameIndex: Map<string, string> = new Map(); // username (lowercase) -> memberId

  constructor() {
    this.ensureDataDir();
    this.loadFromDisk();
  }

  private ensureDataDir() {
    const dir = path.dirname(STORE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private loadFromDisk() {
    try {
      if (fs.existsSync(STORE_FILE)) {
        const raw = fs.readFileSync(STORE_FILE, 'utf8');
        const list: LicenseRecord[] = JSON.parse(raw);
        this.inMemoryCache.clear();
        this.keyHashIndex.clear();
        for (const record of list) {
          this.inMemoryCache.set(record.licenseId, record);
          this.keyHashIndex.set(record.licenseKeyHash, record.licenseId);
        }
      }

      if (fs.existsSync(MEMBERS_FILE)) {
        const rawMembers = fs.readFileSync(MEMBERS_FILE, 'utf8');
        const memberList: MemberRecord[] = JSON.parse(rawMembers);
        this.membersCache.clear();
        this.memberEmailIndex.clear();
        this.memberUsernameIndex.clear();
        for (const member of memberList) {
          // Normalize legacy records if missing role or status
          const normalized: MemberRecord = {
            ...member,
            username: member.username ? member.username.trim().toLowerCase() : null,
            role: member.role || 'MEMBER',
            status: member.status || 'ACTIVE',
            mustChangePassword: member.mustChangePassword ?? false,
          };
          this.membersCache.set(normalized.memberId, normalized);
          this.memberEmailIndex.set(normalized.email.toLowerCase(), normalized.memberId);
          if (normalized.username) {
            this.memberUsernameIndex.set(normalized.username.toLowerCase(), normalized.memberId);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load license or member store from disk:', err);
    }
  }

  private saveToDisk() {
    this.ensureDataDir();
    const list = Array.from(this.inMemoryCache.values());
    const tempFile = `${STORE_FILE}.tmp.${Date.now()}`;
    fs.writeFileSync(tempFile, JSON.stringify(list, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tempFile, STORE_FILE);

    const memberList = Array.from(this.membersCache.values());
    const tempMembersFile = `${MEMBERS_FILE}.tmp.${Date.now()}`;
    fs.writeFileSync(tempMembersFile, JSON.stringify(memberList, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tempMembersFile, MEMBERS_FILE);
  }

  /**
   * Acquire atomic lock for concurrent operations
   */
  private withLock<T>(fn: () => T): T {
    let retries = 50;
    while (retries > 0) {
      try {
        // wx flag fails if file exists (atomic creation)
        fs.writeFileSync(LOCK_FILE, String(process.pid), { flag: 'wx' });
        break;
      } catch {
        retries--;
        // Sleep briefly using atomics or synchronous delay
        const start = Date.now();
        while (Date.now() - start < 10) {}
      }
    }

    try {
      this.loadFromDisk();
      const result = fn();
      this.saveToDisk();
      return result;
    } finally {
      try {
        if (fs.existsSync(LOCK_FILE)) {
          fs.unlinkSync(LOCK_FILE);
        }
      } catch {}
    }
  }

  public createLicense(record: LicenseRecord): LicenseRecord {
    return this.withLock(() => {
      if (this.keyHashIndex.has(record.licenseKeyHash)) {
        throw new Error('License key hash already exists');
      }
      this.inMemoryCache.set(record.licenseId, record);
      this.keyHashIndex.set(record.licenseKeyHash, record.licenseId);
      return record;
    });
  }

  public getByLicenseId(licenseId: string): LicenseRecord | null {
    this.loadFromDisk();
    return this.inMemoryCache.get(licenseId) || null;
  }

  public getByKeyHash(keyHash: string): LicenseRecord | null {
    this.loadFromDisk();
    const id = this.keyHashIndex.get(keyHash);
    if (!id) return null;
    return this.inMemoryCache.get(id) || null;
  }

  public getAllLicenses(): LicenseRecord[] {
    this.loadFromDisk();
    return Array.from(this.inMemoryCache.values());
  }

  /**
   * Atomic device activation.
   * Ensures that if two computers race to activate the same license simultaneously,
   * exactly ONE succeeds and the other gets rejected.
   */
  public atomicActivate(
    licenseKeyHash: string,
    deviceFingerprint: string
  ): { success: boolean; record: LicenseRecord | null; error?: string } {
    return this.withLock(() => {
      const id = this.keyHashIndex.get(licenseKeyHash);
      if (!id) {
        return { success: false, record: null, error: 'LICENSE_INVALID' };
      }

      const record = this.inMemoryCache.get(id);
      if (!record) {
        return { success: false, record: null, error: 'LICENSE_INVALID' };
      }

      if (record.status !== 'ACTIVE') {
        return { success: false, record, error: `LICENSE_${record.status}` };
      }

      if (record.expiresAt && Date.now() > record.expiresAt) {
        record.status = 'EXPIRED';
        return { success: false, record, error: 'LICENSE_EXPIRED' };
      }

      // Check existing device binding
      if (record.activatedDeviceHash) {
        if (record.activatedDeviceHash === deviceFingerprint) {
          // Same computer re-activating / refreshing: ALLOWED
          record.lastValidatedAt = Date.now();
          return { success: true, record };
        } else {
          // Different computer: BLOCKED (maxDevices = 1)
          return { success: false, record, error: 'LICENSE_ALREADY_ACTIVATED_ON_ANOTHER_DEVICE' };
        }
      }

      // First computer claiming license: Bind atomically
      record.activatedDeviceHash = deviceFingerprint;
      record.activatedAt = Date.now();
      record.lastValidatedAt = Date.now();
      return { success: true, record };
    });
  }

  /**
   * Update license status (SUSPEND, REVOKE, ACTIVATE)
   */
  public updateStatus(licenseId: string, status: LicenseStatus): LicenseRecord | null {
    return this.withLock(() => {
      const record = this.inMemoryCache.get(licenseId);
      if (!record) return null;
      record.status = status;
      return record;
    });
  }

  /**
   * Reset device activation (Admin migration function)
   * Clears activatedDeviceHash so the license may be activated on a new computer.
   */
  public resetDeviceActivation(licenseId: string): LicenseRecord | null {
    return this.withLock(() => {
      const record = this.inMemoryCache.get(licenseId);
      if (!record) return null;
      record.activatedDeviceHash = null;
      record.activatedAt = null;
      record.lastValidatedAt = Date.now();
      return record;
    });
  }

  // ==========================================
  // MEMBER MANAGEMENT METHODS
  // ==========================================

  public createMember(member: MemberRecord): MemberRecord {
    return this.withLock(() => {
      const lowerEmail = member.email.toLowerCase();
      if (this.memberEmailIndex.has(lowerEmail)) {
        throw new Error('Member email already registered');
      }

      if (member.username) {
        const lowerUsername = member.username.trim().toLowerCase();
        if (this.memberUsernameIndex.has(lowerUsername)) {
          throw new Error('Member username already registered');
        }
        member.username = lowerUsername;
        this.memberUsernameIndex.set(lowerUsername, member.memberId);
      }

      this.membersCache.set(member.memberId, member);
      this.memberEmailIndex.set(lowerEmail, member.memberId);
      return member;
    });
  }

  public getMemberByEmail(email: string): MemberRecord | null {
    this.loadFromDisk();
    const id = this.memberEmailIndex.get(email.toLowerCase());
    if (!id) return null;
    return this.membersCache.get(id) || null;
  }

  public getMemberByUsername(username: string): MemberRecord | null {
    this.loadFromDisk();
    const id = this.memberUsernameIndex.get(username.trim().toLowerCase());
    if (!id) return null;
    return this.membersCache.get(id) || null;
  }

  public getMemberByIdentifier(identifier: string): MemberRecord | null {
    const clean = identifier.trim().toLowerCase();
    if (clean.includes('@')) {
      return this.getMemberByEmail(clean);
    }
    return this.getMemberByUsername(clean) || this.getMemberByEmail(clean);
  }

  public getMemberById(memberId: string): MemberRecord | null {
    this.loadFromDisk();
    return this.membersCache.get(memberId) || null;
  }

  public getAllMembers(): MemberRecord[] {
    this.loadFromDisk();
    return Array.from(this.membersCache.values());
  }

  public assignLicenseToMember(memberId: string, licenseId: string | null): MemberRecord | null {
    return this.withLock(() => {
      const member = this.membersCache.get(memberId);
      if (!member) return null;
      member.assignedLicenseId = licenseId;
      return member;
    });
  }

  public updateMemberStatus(memberId: string, status: 'ACTIVE' | 'SUSPENDED'): MemberRecord | null {
    return this.withLock(() => {
      const member = this.membersCache.get(memberId);
      if (!member) return null;
      member.status = status;
      return member;
    });
  }

  public updateMemberPassword(memberId: string, passwordHash: string, mustChangePassword = false): MemberRecord | null {
    return this.withLock(() => {
      const member = this.membersCache.get(memberId);
      if (!member) return null;
      member.passwordHash = passwordHash;
      member.mustChangePassword = mustChangePassword;
      return member;
    });
  }

  public updateLastLogin(memberId: string): MemberRecord | null {
    return this.withLock(() => {
      const member = this.membersCache.get(memberId);
      if (!member) return null;
      member.lastLoginAt = Date.now();
      return member;
    });
  }

  public deleteMember(memberId: string): boolean {
    return this.withLock(() => {
      const member = this.membersCache.get(memberId);
      if (!member) return false;
      this.membersCache.delete(memberId);
      this.memberEmailIndex.delete(member.email.toLowerCase());
      if (member.username) {
        this.memberUsernameIndex.delete(member.username.toLowerCase());
      }
      return true;
    });
  }
}

export const licenseStore = new LicenseStore();

