import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { LicenseRecord, LicenseStatus, MemberRecord } from './license-types';

const STORE_FILE = process.env.FEF_LICENSES_STORE_FILE
  ? path.resolve(process.env.FEF_LICENSES_STORE_FILE)
  : path.resolve(process.cwd(), 'data/fef-licenses-registry.json');
const MEMBERS_FILE = process.env.FEF_MEMBERS_STORE_FILE
  ? path.resolve(process.env.FEF_MEMBERS_STORE_FILE)
  : path.resolve(process.cwd(), 'data/fef-members-registry.json');
const LOCK_FILE = process.env.FEF_STORE_LOCK_FILE
  ? path.resolve(process.env.FEF_STORE_LOCK_FILE)
  : path.resolve(process.cwd(), 'data/fef-licenses-registry.lock');

function cleanEnvVar(val: string | undefined): string {
  if (!val) return '';
  let str = val.trim();
  // Strip enclosing quotes (double or single)
  if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
    str = str.slice(1, -1).trim();
  }
  return str;
}

/**
 * License & Member Store Interface.
 * Can be swapped with PostgreSQL, Prisma, Supabase, or Redis in production.
 * Uses atomic file locking for local server operations with safe read-only fallback for serverless.
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
    try {
      const dir = path.dirname(STORE_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch (err) {
      // In read-only serverless runtime (e.g. Vercel), dir creation may fail; ignore gracefully
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
            username: member.username ? cleanEnvVar(member.username).toLowerCase() : null,
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

      // Dual-Source Persistence: In serverless (Vercel) or containerized environments,
      // allow Master account to be securely hydrated or updated from server-side environment variables.
      // Clean quotes and whitespace defensively.
      const envMasterEmail = cleanEnvVar(process.env.FEF_MASTER_EMAIL).toLowerCase();
      const envMasterPasswordHash = cleanEnvVar(process.env.FEF_MASTER_PASSWORD_HASH);
      const envMasterUsername = cleanEnvVar(process.env.FEF_MASTER_USERNAME).toLowerCase();
      const envMasterName = cleanEnvVar(process.env.FEF_MASTER_NAME) || 'Master Administrator';
      const envMasterId = cleanEnvVar(process.env.FEF_MASTER_ID) || 'master_89411f3884cc';

      if (envMasterEmail && envMasterPasswordHash) {
        // Environment Master is authoritative: create or update memory cache
        const existingMaster = Array.from(this.membersCache.values()).find(m => m.role === 'MASTER');
        const targetMemberId = existingMaster ? existingMaster.memberId : envMasterId;

        // If existing master had an old username/email index, clean them up
        if (existingMaster) {
          this.memberEmailIndex.delete(existingMaster.email.toLowerCase());
          if (existingMaster.username) {
            this.memberUsernameIndex.delete(existingMaster.username.toLowerCase());
          }
        }

        const envMaster: MemberRecord = {
          memberId: targetMemberId,
          email: envMasterEmail,
          username: envMasterUsername || 'master',
          passwordHash: envMasterPasswordHash,
          name: envMasterName,
          role: 'MASTER',
          status: 'ACTIVE',
          mustChangePassword: false,
          assignedLicenseId: null,
          createdAt: existingMaster ? existingMaster.createdAt : 1704067200000,
          lastLoginAt: existingMaster ? existingMaster.lastLoginAt : null,
        };

        this.membersCache.set(envMaster.memberId, envMaster);
        this.memberEmailIndex.set(envMaster.email.toLowerCase(), envMaster.memberId);
        if (envMaster.username) {
          this.memberUsernameIndex.set(envMaster.username.toLowerCase(), envMaster.memberId);
        }
      }
    } catch (err) {
      console.error('Failed to load license or member store from disk:', err);
    }
  }

  private saveToDisk() {
    try {
      this.ensureDataDir();
      const list = Array.from(this.inMemoryCache.values());
      const tempFile = `${STORE_FILE}.tmp.${Date.now()}`;
      fs.writeFileSync(tempFile, JSON.stringify(list, null, 2), { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(tempFile, STORE_FILE);

      const memberList = Array.from(this.membersCache.values());
      const tempMembersFile = `${MEMBERS_FILE}.tmp.${Date.now()}`;
      fs.writeFileSync(tempMembersFile, JSON.stringify(memberList, null, 2), { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(tempMembersFile, MEMBERS_FILE);
    } catch (err: any) {
      // In read-only serverless environments (EROFS), persist to disk is impossible.
      // In-memory cache continues operating flawlessly for the lifetime of the invocation.
      if (err.code !== 'EROFS' && err.code !== 'EACCES') {
        console.warn('Warning: Could not persist store to disk:', err.message);
      }
    }
  }

  /**
   * Acquire atomic lock for concurrent operations.
   * Gracefully degrades to direct in-memory mutation if the filesystem is read-only.
   */
  private withLock<T>(fn: () => T): T {
    let hasLock = false;
    let isReadOnly = false;
    let retries = 50;

    while (retries > 0) {
      try {
        // wx flag fails if file exists (atomic creation)
        fs.writeFileSync(LOCK_FILE, String(process.pid), { flag: 'wx' });
        hasLock = true;
        break;
      } catch (err: any) {
        if (err.code === 'EROFS' || err.code === 'EACCES') {
          // Read-only filesystem (e.g. Vercel serverless): skip lock file
          isReadOnly = true;
          break;
        }
        retries--;
        // Sleep briefly using atomics or synchronous delay
        const start = Date.now();
        while (Date.now() - start < 10) {}
      }
    }

    try {
      this.loadFromDisk();
      const result = fn();
      if (!isReadOnly) {
        this.saveToDisk();
      }
      return result;
    } finally {
      if (hasLock) {
        try {
          if (fs.existsSync(LOCK_FILE)) {
            fs.unlinkSync(LOCK_FILE);
          }
        } catch {}
      }
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

