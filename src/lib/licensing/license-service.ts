import crypto from 'crypto';
import {
  LicenseRecord,
  MemberRecord,
  LicenseValidationResult,
  ActivationTokenPayload,
  LICENSE_CONFIG,
} from './license-types';
import { hashLicenseKey, generateLicenseKey } from './device-identity';
import { licenseStore } from './license-store';
import { signTokenPayload } from './local-token-manager';

export class LicenseService {
  /**
   * Admin: Create a new cryptographically random license key and store its hash
   */
  public createLicense(params: {
    customerName?: string;
    customerEmail?: string;
    expiresInDays?: number;
    notes?: string;
  }): { licenseKey: string; record: LicenseRecord } {
    const rawKey = generateLicenseKey();
    const keyHash = hashLicenseKey(rawKey);
    const prefix = rawKey.substring(0, 8); // e.g. "FEF-A1B2"
    const licenseId = `lic_${crypto.randomBytes(8).toString('hex')}`;
    const now = Date.now();
    const expiresAt = params.expiresInDays ? now + params.expiresInDays * 24 * 60 * 60 * 1000 : null;

    const record: LicenseRecord = {
      licenseId,
      licenseKeyHash: keyHash,
      licenseKeyPrefix: prefix,
      status: 'ACTIVE',
      maxDevices: LICENSE_CONFIG.MAX_DEVICES_PER_LICENSE,
      activatedDeviceHash: null,
      activatedAt: null,
      lastValidatedAt: null,
      customerName: params.customerName,
      customerEmail: params.customerEmail,
      createdAt: now,
      expiresAt,
      notes: params.notes,
    };

    const created = licenseStore.createLicense(record);
    return { licenseKey: rawKey, record: created };
  }

  /**
   * Activate license on a device
   */
  public activate(
    rawLicenseKey: string,
    deviceFingerprint: string
  ): { success: boolean; token?: ActivationTokenPayload; error?: string; message?: string } {
    if (!rawLicenseKey || !LICENSE_CONFIG.LICENSE_KEY_REGEX.test(rawLicenseKey.trim().toUpperCase())) {
      return { success: false, error: 'LICENSE_INVALID', message: 'License key format is invalid. Expected format: FEF-XXXX-XXXX-XXXX-XXXX' };
    }

    const keyHash = hashLicenseKey(rawLicenseKey);
    const result = licenseStore.atomicActivate(keyHash, deviceFingerprint);

    if (!result.success || !result.record) {
      if (result.error === 'LICENSE_ALREADY_ACTIVATED_ON_ANOTHER_DEVICE') {
        return {
          success: false,
          error: result.error,
          message: 'License already activated on another computer. Each license is valid for 1 computer only.',
        };
      }
      return {
        success: false,
        error: result.error || 'LICENSE_INVALID',
        message: `Activation rejected: ${result.error || 'Invalid license key'}`,
      };
    }

    const record = result.record;
    const now = Date.now();
    const token = signTokenPayload({
      licenseId: record.licenseId,
      licenseKeyHash: record.licenseKeyHash,
      deviceFingerprint,
      issuedAt: now,
      lastValidatedAt: now,
      expiresAt: record.expiresAt,
    });

    return { success: true, token, message: 'License successfully activated.' };
  }

  /**
   * Validate existing token against server record
   */
  public validate(
    token: ActivationTokenPayload,
    currentDeviceFingerprint: string
  ): LicenseValidationResult {
    // 1. Device fingerprint mismatch check
    if (token.deviceFingerprint !== currentDeviceFingerprint) {
      return {
        valid: false,
        status: 'UNLICENSED',
        code: 'LICENSE_DEVICE_MISMATCH',
        message: 'Device fingerprint does not match the activated license.',
      };
    }

    // 2. Fetch server record
    const record = licenseStore.getByLicenseId(token.licenseId);
    if (!record) {
      return {
        valid: false,
        status: 'UNLICENSED',
        code: 'LICENSE_INVALID',
        message: 'License record not found.',
      };
    }

    // 3. Verify server device binding
    if (record.activatedDeviceHash !== currentDeviceFingerprint) {
      return {
        valid: false,
        status: record.status,
        code: 'LICENSE_ALREADY_ACTIVATED_ON_ANOTHER_DEVICE',
        message: 'License has been migrated or activated on another computer.',
      };
    }

    // 4. Status checks
    if (record.status === 'REVOKED') {
      return {
        valid: false,
        status: 'REVOKED',
        code: 'LICENSE_REVOKED',
        message: 'This license has been revoked by the administrator.',
      };
    }

    if (record.status === 'SUSPENDED') {
      return {
        valid: false,
        status: 'SUSPENDED',
        code: 'LICENSE_SUSPENDED',
        message: 'This license has been temporarily suspended.',
      };
    }

    if (record.expiresAt && Date.now() > record.expiresAt) {
      return {
        valid: false,
        status: 'EXPIRED',
        code: 'LICENSE_EXPIRED',
        message: 'This license has expired.',
      };
    }

    // Update lastValidatedAt on server
    record.lastValidatedAt = Date.now();

    return {
      valid: true,
      status: 'ACTIVE',
      code: 'LICENSE_VALID',
      message: 'License is valid and authorized for this computer.',
      licenseId: record.licenseId,
      customerName: record.customerName,
      expiresAt: record.expiresAt,
    };
  }

  /**
   * Admin actions
   */
  public suspendLicense(licenseId: string): LicenseRecord | null {
    return licenseStore.updateStatus(licenseId, 'SUSPENDED');
  }

  public revokeLicense(licenseId: string): LicenseRecord | null {
    return licenseStore.updateStatus(licenseId, 'REVOKED');
  }

  public activateLicenseAdmin(licenseId: string): LicenseRecord | null {
    return licenseStore.updateStatus(licenseId, 'ACTIVE');
  }

  public resetDeviceActivation(licenseId: string): LicenseRecord | null {
    return licenseStore.resetDeviceActivation(licenseId);
  }

  public listLicenses(): LicenseRecord[] {
    return licenseStore.getAllLicenses();
  }

  // ==========================================
  // MEMBER AUTHENTICATION & MANAGEMENT
  // ==========================================

  public hashPassword(password: string): string {
    let salt = (process.env.FEF_MEMBER_SALT || 'FEF_CORTEX_MEMBER_AUTH_SALT_V1').trim();
    if ((salt.startsWith('"') && salt.endsWith('"')) || (salt.startsWith("'") && salt.endsWith("'"))) {
      salt = salt.slice(1, -1).trim();
    }
    return crypto.createHmac('sha256', salt || 'FEF_CORTEX_MEMBER_AUTH_SALT_V1').update(password).digest('hex');
  }

  /**
   * Validate Master username format:
   * Letters, numbers, underscore, period allowed. Must contain at least 1 letter or number.
   * Length between 3 and 30 characters.
   */
  public validateUsernameFormat(username: string): { valid: boolean; error?: string } {
    if (!username || typeof username !== 'string') {
      return { valid: false, error: 'Username is required.' };
    }
    const clean = username.trim().toLowerCase();
    if (clean.length < 3 || clean.length > 30) {
      return { valid: false, error: 'Username must be between 3 and 30 characters.' };
    }
    const usernameRegex = /^[a-zA-Z0-9_.]+$/;
    if (!usernameRegex.test(clean)) {
      return { valid: false, error: 'Username may only contain letters, numbers, underscore (_), and period (.).' };
    }
    return { valid: true };
  }

  /**
   * Strict Master Password Policy:
   * - minimum 12 characters
   * - at least 1 uppercase letter
   * - at least 1 lowercase letter
   * - at least 1 number
   * - at least 1 special character
   */
  public validateMasterPasswordPolicy(password: string): { valid: boolean; error?: string } {
    if (!password || typeof password !== 'string') {
      return { valid: false, error: 'Password is required.' };
    }
    if (password.length < 12) {
      return { valid: false, error: 'Master password must be at least 12 characters long.' };
    }
    if (!/[A-Z]/.test(password)) {
      return { valid: false, error: 'Master password must contain at least 1 uppercase letter.' };
    }
    if (!/[a-z]/.test(password)) {
      return { valid: false, error: 'Master password must contain at least 1 lowercase letter.' };
    }
    if (!/[0-9]/.test(password)) {
      return { valid: false, error: 'Master password must contain at least 1 number.' };
    }
    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(password)) {
      return { valid: false, error: 'Master password must contain at least 1 special character.' };
    }
    return { valid: true };
  }

  public registerMember(params: {
    email: string;
    password: string;
    name: string;
    username?: string | null;
    role?: 'MASTER' | 'MEMBER';
    assignedLicenseId?: string;
    mustChangePassword?: boolean;
  }): MemberRecord {
    const memberId = params.role === 'MASTER' ? `master_${crypto.randomBytes(6).toString('hex')}` : `mem_${crypto.randomBytes(8).toString('hex')}`;
    const passwordHash = this.hashPassword(params.password);
    const member: MemberRecord = {
      memberId,
      email: params.email.trim().toLowerCase(),
      username: params.username ? params.username.trim().toLowerCase() : null,
      passwordHash,
      name: params.name.trim(),
      role: params.role || 'MEMBER',
      status: 'ACTIVE',
      mustChangePassword: params.mustChangePassword ?? false,
      assignedLicenseId: params.role === 'MASTER' ? null : (params.assignedLicenseId || null),
      createdAt: Date.now(),
      lastLoginAt: null,
    };
    return licenseStore.createMember(member);
  }

  public authenticateMember(identifier: string, password: string): MemberRecord | null {
    const member = licenseStore.getMemberByIdentifier(identifier);
    if (!member) return null;
    if (member.status === 'SUSPENDED') return null; // Suspended accounts cannot login
    const computedHash = this.hashPassword(password);
    if (crypto.timingSafeEqual(Buffer.from(member.passwordHash, 'utf8'), Buffer.from(computedHash, 'utf8'))) {
      licenseStore.updateLastLogin(member.memberId);
      return licenseStore.getMemberById(member.memberId);
    }
    return null;
  }

  public changeMemberPassword(
    identifier: string, // memberId, email, or username
    oldPassword: string,
    newPassword: string
  ): { success: boolean; member?: MemberRecord; message?: string } {
    const member = identifier.startsWith('mem_') || identifier.startsWith('master_')
      ? licenseStore.getMemberById(identifier)
      : licenseStore.getMemberByIdentifier(identifier);
    if (!member) return { success: false, message: 'Member not found.' };

    const oldHash = this.hashPassword(oldPassword);
    if (!crypto.timingSafeEqual(Buffer.from(member.passwordHash, 'utf8'), Buffer.from(oldHash, 'utf8'))) {
      return { success: false, message: 'Current password incorrect.' };
    }

    if (!newPassword || newPassword.length < 8) {
      return { success: false, message: 'New password must be at least 8 characters long.' };
    }

    const newHash = this.hashPassword(newPassword);
    const updated = licenseStore.updateMemberPassword(member.memberId, newHash, false);
    return { success: true, member: updated || undefined, message: 'Password updated successfully.' };
  }

  public resetMemberTemporaryPassword(
    identifier: string // memberId or email
  ): { success: boolean; tempPassword?: string; member?: MemberRecord; message?: string } {
    const member = identifier.includes('@')
      ? licenseStore.getMemberByEmail(identifier)
      : licenseStore.getMemberById(identifier);
    if (!member) return { success: false, message: 'Member not found.' };

    const tempPassword = this.generateTemporaryPassword();
    const tempHash = this.hashPassword(tempPassword);
    const updated = licenseStore.updateMemberPassword(member.memberId, tempHash, true);

    return {
      success: true,
      tempPassword,
      member: updated || undefined,
      message: 'Temporary password generated.',
    };
  }

  public generateTemporaryPassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
    let result = '';
    const bytes = crypto.randomBytes(12);
    for (let i = 0; i < 12; i++) {
      result += chars[bytes[i] % chars.length];
    }
    return result;
  }

  public getMasterAccount(): MemberRecord | null {
    const all = licenseStore.getAllMembers();
    return all.find(m => m.role === 'MASTER' && m.status === 'ACTIVE') || null;
  }

  public getAllMasterAccounts(): MemberRecord[] {
    const all = licenseStore.getAllMembers();
    return all.filter(m => m.role === 'MASTER');
  }

  public createMasterAccount(params: {
    name: string;
    username: string;
    email: string;
    password: string;
  }): { success: boolean; member?: MemberRecord; error?: string } {
    // 1. Check duplicate master account
    const existingMaster = this.getMasterAccount();
    if (existingMaster) {
      return {
        success: false,
        error: `An active MASTER account already exists (${existingMaster.username || existingMaster.email}). Use 'npm run cortex:master:reset-password' to update credentials or manage the existing account.`
      };
    }

    // 2. Validate username format
    const usernameValidation = this.validateUsernameFormat(params.username);
    if (!usernameValidation.valid) {
      return { success: false, error: usernameValidation.error };
    }

    // 3. Validate email
    const cleanEmail = params.email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      return { success: false, error: 'A valid email address is required.' };
    }

    // 4. Validate password policy
    const passwordValidation = this.validateMasterPasswordPolicy(params.password);
    if (!passwordValidation.valid) {
      return { success: false, error: passwordValidation.error };
    }

    // 5. Check uniqueness
    if (licenseStore.getMemberByUsername(params.username)) {
      return { success: false, error: `Username '${params.username.trim().toLowerCase()}' is already registered.` };
    }
    if (licenseStore.getMemberByEmail(cleanEmail)) {
      return { success: false, error: `Email '${cleanEmail}' is already registered.` };
    }

    // 6. Register Master record
    try {
      const created = this.registerMember({
        name: params.name.trim(),
        username: params.username.trim().toLowerCase(),
        email: cleanEmail,
        password: params.password,
        role: 'MASTER',
        mustChangePassword: false,
      });
      return { success: true, member: created };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to create Master record.' };
    }
  }

  public resetMasterPassword(newPassword: string): { success: boolean; member?: MemberRecord; error?: string } {
    const master = this.getMasterAccount();
    if (!master) {
      return { success: false, error: 'No active Master account exists to reset. Run cortex:master:create first.' };
    }

    const passwordValidation = this.validateMasterPasswordPolicy(newPassword);
    if (!passwordValidation.valid) {
      return { success: false, error: passwordValidation.error };
    }

    const newHash = this.hashPassword(newPassword);
    const updated = licenseStore.updateMemberPassword(master.memberId, newHash, false);
    return { success: true, member: updated || undefined };
  }

  public bootstrapMasterAccount(email?: string, password?: string, name?: string): MemberRecord {
    const existing = this.getMasterAccount();
    if (existing) return existing;
    return this.registerMember({
      email: email || 'master@feftrading.com',
      username: 'master',
      password: password || 'MasterPassword123!',
      name: name || 'Master Administrator',
      role: 'MASTER',
      mustChangePassword: false,
    });
  }

  public deleteMember(memberId: string): boolean {
    return licenseStore.deleteMember(memberId);
  }

  public getMemberById(memberId: string): MemberRecord | null {
    return licenseStore.getMemberById(memberId);
  }

  public getMemberByEmail(email: string): MemberRecord | null {
    return licenseStore.getMemberByEmail(email);
  }

  public getMemberByUsername(username: string): MemberRecord | null {
    return licenseStore.getMemberByUsername(username);
  }

  public getMemberByIdentifier(identifier: string): MemberRecord | null {
    return licenseStore.getMemberByIdentifier(identifier);
  }

  public assignLicenseToMember(memberId: string, licenseId: string | null): MemberRecord | null {
    return licenseStore.assignLicenseToMember(memberId, licenseId);
  }

  public getLicenseForMember(memberId: string): LicenseRecord | null {
    const member = licenseStore.getMemberById(memberId);
    if (!member || !member.assignedLicenseId) return null;
    return licenseStore.getByLicenseId(member.assignedLicenseId);
  }

  /**
   * Bind the current device to the member's assigned license (Slot 0/1 -> 1/1)
   */
  public authorizeMemberDevice(
    memberId: string,
    deviceFingerprint: string
  ): { success: boolean; token?: ActivationTokenPayload; error?: string; message?: string } {
    const member = licenseStore.getMemberById(memberId);
    if (!member) {
      return { success: false, error: 'MEMBER_NOT_FOUND', message: 'Member profile not found.' };
    }

    if (!member.assignedLicenseId) {
      return { success: false, error: 'NO_LICENSE_ASSIGNED', message: 'No active license assigned to this member. Contact administrator.' };
    }

    const license = licenseStore.getByLicenseId(member.assignedLicenseId);
    if (!license) {
      return { success: false, error: 'LICENSE_NOT_FOUND', message: 'Assigned license record not found.' };
    }

    const result = licenseStore.atomicActivate(license.licenseKeyHash, deviceFingerprint);
    if (!result.success || !result.record) {
      if (result.error === 'LICENSE_ALREADY_ACTIVATED_ON_ANOTHER_DEVICE') {
        return {
          success: false,
          error: result.error,
          message: 'License is already active on another computer (1/1 device slots used). Contact administrator to reset device slot.',
        };
      }
      return {
        success: false,
        error: result.error || 'ACTIVATION_FAILED',
        message: `Device authorization rejected: ${result.error}`,
      };
    }

    const now = Date.now();
    const token = signTokenPayload({
      licenseId: result.record.licenseId,
      licenseKeyHash: result.record.licenseKeyHash,
      deviceFingerprint,
      issuedAt: now,
      lastValidatedAt: now,
      expiresAt: result.record.expiresAt,
    });

    return {
      success: true,
      token,
      message: 'Device authorized successfully for this member account.',
    };
  }

  public suspendMember(memberId: string): MemberRecord | null {
    return licenseStore.updateMemberStatus(memberId, 'SUSPENDED');
  }

  public reactivateMember(memberId: string): MemberRecord | null {
    return licenseStore.updateMemberStatus(memberId, 'ACTIVE');
  }
}

export const licenseService = new LicenseService();

