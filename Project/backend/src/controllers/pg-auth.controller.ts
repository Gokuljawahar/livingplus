import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHash, randomInt, randomUUID, timingSafeEqual } from 'crypto';
import { prisma } from '../app.js';
import { getJwtSecret } from '../utils/auth-config.js';
import { createUniquePgSlug } from '../utils/pg-slug.js';
import { logger } from '../utils/logger.js';
import { isGenderPolicy, isStrongPassword, MESSAGES } from '@livingplus/shared';
import { INVALID_REQUEST, parseBody } from '../utils/validate.js';
import { adminResetPasswordBody, changePasswordBody, googleLoginBody, loginBody, otpRequestBody, otpVerifyBody, registerBody, updateProfileBody } from '../validation/request.schemas.js';
import { googleSignInEnabled, otpProvider, verifyFirebaseGoogleToken, verifyFirebasePhoneToken } from '../services/phone-verification.js';

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10 ? `91${digits}` : digits;
}

function toUserResponse(user: any) {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    name: user.name,
    role: user.role,
    profileImage: user.profileImage,
    googleLinked: Boolean(user.googleUid)
  };
}

function createToken(user: { id: string; role: string }, propertyId?: string): string {
  return jwt.sign({ userId: user.id, role: user.role, ...(propertyId ? { propertyId } : {}) }, getJwtSecret(), { expiresIn: '1d' });
}
/**
 * Single phone sign-in: if this number has an active stay, attach its resident
 * session (same proof of ownership as a resident OTP). Returns null when there
 * is no stay, or { forbidden: true } when the number belongs to a staff account.
 */
async function residentSessionForPhone(phone: string, propertyId?: string): Promise<{ token: string; user: any } | { forbidden: true } | null> {
  const digits = phone.startsWith('91') && phone.length === 12 ? phone.slice(2) : phone;
  const tenant = await prisma.pGTenant.findFirst({
    where: {
      phone: { in: [...new Set([phone, digits])] },
      status: { in: ['ACTIVE', 'NOTICE_PERIOD', 'RESERVED'] },
      ...(propertyId ? { propertyId } : {})
    },
    select: { id: true, name: true, propertyId: true }
  });
  if (!tenant) return null;
  let user = await prisma.user.findFirst({ where: { phone } });
  if (!user) {
    user = await prisma.user.create({
      data: { name: tenant.name, phone, password: await bcrypt.hash(randomUUID(), 10), role: 'PG_TENANT' }
    });
  }
  if (user.role !== 'PG_TENANT') return { forbidden: true };
  return { token: createToken(user, propertyId || tenant.propertyId), user: toUserResponse(user) };
}

/** On a PG host, staff may sign in only to the PGs they own or are warden of. */
async function hasPropertyAccess(user: { id: string; role: string }, propertyId?: string): Promise<boolean> {
  if (!propertyId || user.role === 'SUPER_ADMIN') return true;
  const propertyAccess = await prisma.pGPropertyAccess.findFirst({
    where: { propertyId, userId: user.id, role: user.role === 'PG_WARDEN' ? 'WARDEN' : 'OWNER' },
    select: { id: true }
  });
  return Boolean(propertyAccess);
}

/** Google accounts allowed to sign in as platform admin (ADMIN_GOOGLE_EMAILS, comma-separated). */
function isAdminGoogleEmail(email: string): boolean {
  return String(process.env.ADMIN_GOOGLE_EMAILS || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .includes(email);
}

export const login = async (req: Request, res: Response): Promise<any> => {
  // Shape check only; the rules below still validate values.
  const input: any = parseBody(loginBody, req, res, INVALID_REQUEST);
  if (!input) return;
  const { email, phone, password } = input;
  const loginId = String(phone || email || '').trim();
  const propertyId = (req as any).pgPropertyId as string | undefined;
  if (!loginId || !password) return res.status(400).json({ message: 'Phone or email and password are required' });

  try {
    if (email === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
      const user = { id: 'env-admin', role: 'SUPER_ADMIN' };
      return res.json({
        token: createToken(user, propertyId),
        user: { id: user.id, email: process.env.ADMIN_USERNAME, name: 'Super Admin', role: user.role, profileImage: null }
      });
    }

    const digits = normalizePhone(loginId);
    const phoneOptions = [...new Set([loginId, digits, digits.startsWith('91') ? digits.slice(2) : digits])];
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: loginId },
          { phone: { in: phoneOptions } }
        ]
      }
    });
    if (!user || !await bcrypt.compare(String(password), user.password)) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (!await hasPropertyAccess(user, propertyId)) return res.status(403).json({ message: 'This account does not have access to this PG' });

    res.json({ token: createToken(user, propertyId), user: toUserResponse(user) });
  } catch (error) {
    logger.error({ err: error }, 'PG login error');
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const register = async (req: Request, res: Response): Promise<any> => {
  // Shape check only; the rules below still validate values.
  const input: any = parseBody(registerBody, req, res, INVALID_REQUEST);
  if (!input) return;
  const { name, email, phone, password, propertyName, propertyAddress, locality, contactPhone, city, genderPolicy, amenities, houseRules } = input;
  const normalizedPhone = normalizePhone(String(phone || ''));
  const pgSlug = (req as any).pgSlug as string | undefined;
  if (!name?.trim() || !propertyName?.trim() || !propertyAddress?.trim() || !locality?.trim() || normalizedPhone.length < 10 || !password) {
    return res.status(400).json({ message: 'Owner, PG name, phone, address, locality and password are required' });
  }
  if (!isStrongPassword(String(password))) return res.status(400).json({ message: MESSAGES.strongPassword });

  try {
    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { phone: { in: [...new Set([normalizedPhone, normalizedPhone.slice(-10)])] } },
          ...(email ? [{ email: String(email).trim() }] : [])
        ]
      },
      select: { id: true }
    });
    if (existing) return res.status(400).json({ message: 'An account with this phone or email already exists' });

    const passwordHash = await bcrypt.hash(String(password), 10);
    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: name.trim(),
          email: email?.trim() || null,
          phone: normalizedPhone,
          password: passwordHash,
          role: 'PG_OWNER'
        }
      });
      const slug = pgSlug || await createUniquePgSlug(tx, propertyName);
      const property = await tx.pGProperty.create({
        data: {
          slug,
          name: propertyName.trim(),
          address: propertyAddress.trim(),
          locality: locality.trim(),
          contactPhone: contactPhone ? normalizePhone(String(contactPhone)) : null,
          city: city?.trim() || 'Chennai',
          genderPolicy: isGenderPolicy(String(genderPolicy)) ? genderPolicy : 'ANY',
          amenities: Array.isArray(amenities) ? amenities : [],
          houseRules: Array.isArray(houseRules) ? houseRules : [],
          access: { create: { userId: user.id, role: 'OWNER' } }
        }
      });
      return { user, property };
    });

    res.status(201).json({
      message: 'PG owner account created',
      pgSlug: created.property.slug,
      property: created.property
    });
  } catch (error: any) {
    if (error?.code === 'P2002') return res.status(400).json({ message: 'An account with this phone or email already exists' });
    logger.error({ err: error }, 'PG registration error');
    res.status(500).json({ message: 'Failed to create PG account' });
  }
};

/**
 * "Sign in with Google": the browser signs in with Firebase (Google provider)
 * and sends the Firebase ID token. Staff accounts sign in only with a Google
 * account they linked themselves after a password sign-in (matched by the
 * Google uid, never by the unverified email typed at registration), plus the
 * platform admins in ADMIN_GOOGLE_EMAILS. Residents keep using phone OTP.
 */
export const googleLogin = async (req: Request, res: Response): Promise<any> => {
  const input: any = parseBody(googleLoginBody, req, res, INVALID_REQUEST);
  if (!input) return;
  const idToken = typeof input.firebaseIdToken === 'string' ? input.firebaseIdToken.trim() : '';
  const propertyId = (req as any).pgPropertyId as string | undefined;
  if (!googleSignInEnabled()) return res.status(404).json({ message: 'Google sign-in is not enabled' });
  if (!idToken) return res.status(400).json({ message: 'Google sign-in is required' });

  let account;
  try {
    account = await verifyFirebaseGoogleToken(idToken);
  } catch (error: any) {
    if (error?.message === 'FIREBASE_NOT_CONFIGURED') {
      logger.error('ENABLE_GOOGLE_SIGN_IN=true but FIREBASE_PROJECT_ID is not set');
      return res.status(503).json({ message: 'Google sign-in is not available right now' });
    }
    return res.status(401).json({ message: 'Google sign-in failed. Please try again.' });
  }

  try {
    if (isAdminGoogleEmail(account.email)) {
      const admin = { id: 'env-admin', role: 'SUPER_ADMIN' };
      return res.json({
        token: createToken(admin, propertyId),
        user: { id: admin.id, email: account.email, name: account.name || 'Super Admin', role: admin.role, profileImage: null }
      });
    }

    const user = await prisma.user.findUnique({ where: { googleUid: account.uid } });
    if (!user) {
      return res.status(403).json({
        code: 'GOOGLE_NOT_LINKED',
        message: 'This Google account is not linked yet. Sign in with your mobile number and password, then link Google under Account security.'
      });
    }
    if (user.role === 'PG_TENANT') return res.status(403).json({ message: 'Residents sign in with their phone number on the resident portal.' });
    if (!await hasPropertyAccess(user, propertyId)) return res.status(403).json({ message: 'This account does not have access to this PG' });

    res.json({ token: createToken(user, propertyId), user: toUserResponse(user) });
  } catch (error) {
    logger.error({ err: error }, 'Google sign-in error');
    res.status(500).json({ message: 'Internal server error' });
  }
};

const STAFF_ROLES = ['PG_OWNER', 'PG_WARDEN', 'SUPER_ADMIN'];

/**
 * Links the Google account in the Firebase ID token to the signed-in staff
 * account. Doing this while signed in with the password proves the person
 * controls both, so later Google sign-ins can trust the link.
 */
export const linkGoogle = async (req: Request, res: Response): Promise<any> => {
  const input: any = parseBody(googleLoginBody, req, res, INVALID_REQUEST);
  if (!input) return;
  const { userId } = (req as any).user || {};
  if (!googleSignInEnabled()) return res.status(404).json({ message: 'Google sign-in is not enabled' });
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });
  if (userId === 'env-admin') return res.status(400).json({ message: 'The platform admin uses ADMIN_GOOGLE_EMAILS instead of linking.' });
  const idToken = typeof input.firebaseIdToken === 'string' ? input.firebaseIdToken.trim() : '';
  if (!idToken) return res.status(400).json({ message: 'Google sign-in is required' });

  let account;
  try {
    account = await verifyFirebaseGoogleToken(idToken);
  } catch (error: any) {
    if (error?.message === 'FIREBASE_NOT_CONFIGURED') return res.status(503).json({ message: 'Google sign-in is not available right now' });
    return res.status(401).json({ message: 'Google sign-in failed. Please try again.' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: String(userId) } });
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!STAFF_ROLES.includes(user.role)) return res.status(403).json({ message: 'Only owners, wardens and admins can link Google.' });
    const holder = await prisma.user.findUnique({ where: { googleUid: account.uid }, select: { id: true } });
    if (holder && holder.id !== user.id) return res.status(409).json({ message: 'This Google account is already linked to another LivingPlus account.' });
    const updated = await prisma.user.update({ where: { id: user.id }, data: { googleUid: account.uid, googleLinkedAt: new Date() } });
    res.json(toUserResponse(updated));
  } catch (error) {
    logger.error({ err: error }, 'Google link error');
    res.status(500).json({ message: 'Could not link Google account' });
  }
};

/** Removes the Google link; the account signs in with its password again. */
export const unlinkGoogle = async (req: Request, res: Response): Promise<any> => {
  const { userId } = (req as any).user || {};
  if (!userId || userId === 'env-admin') return res.status(400).json({ message: 'No linked Google account' });
  try {
    const updated = await prisma.user.update({ where: { id: String(userId) }, data: { googleUid: null, googleLinkedAt: null } });
    res.json(toUserResponse(updated));
  } catch (error) {
    logger.error({ err: error }, 'Google unlink error');
    res.status(500).json({ message: 'Could not unlink Google account' });
  }
};

function hashOtp(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

/** Demo deployments without SMS: codes are shown on screen (never use with real users). */
const otpDemoMode = () => process.env.OTP_DEMO_MODE === 'true';

async function sendSms(phone: string, message: string): Promise<string | null> {
  const apiUrl = process.env.SMS_API_URL;
  if (!apiUrl) {
    if (process.env.NODE_ENV === 'production' && !otpDemoMode()) throw new Error('SMS delivery is not configured');
    return null;
  }
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(process.env.SMS_API_KEY ? { Authorization: `Bearer ${process.env.SMS_API_KEY}` } : {}) },
    body: JSON.stringify({ to: phone, message })
  });
  if (!response.ok) throw new Error(`SMS provider returned HTTP ${response.status}`);
  return null;
}

export const requestOtp = async (req: Request, res: Response): Promise<any> => {
  // Shape check only; the rules below still validate values.
  const input: any = parseBody(otpRequestBody, req, res, INVALID_REQUEST);
  if (!input) return;
  const phone = normalizePhone(String(input.phone || ''));
  const purpose = ['BOOKING', 'TENANT_LOGIN'].includes(String(input.purpose)) ? String(input.purpose) : 'BOOKING';
  const propertyId = (req as any).pgPropertyId as string | undefined;
  if (phone.length < 10) return res.status(400).json({ message: 'A valid phone number is required' });
  if (purpose === 'TENANT_LOGIN' && !propertyId && process.env.NODE_ENV === 'production' && process.env.SINGLE_HOST_MODE !== 'true') {
    return res.status(400).json({ message: 'Open your PG-specific resident portal to sign in' });
  }
  if (otpProvider() === 'firebase') {
    return res.status(409).json({ message: 'This server verifies phones with Firebase; send the code from the app.', provider: 'firebase' });
  }

  try {
    const recent = await prisma.otpCode.count({
      where: { phone, purpose, propertyId: propertyId || null, consumedAt: null, verifiedToken: null, createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) } }
    });
    if (recent >= 3) return res.status(429).json({ message: 'Too many codes requested. Try again in 10 minutes.' });
    // Retire older pending codes so only the newest code works.
    await prisma.otpCode.updateMany({
      where: { phone, purpose, propertyId: propertyId || null, consumedAt: null, verifiedToken: null },
      data: { consumedAt: new Date() }
    });

    const code = String(randomInt(100000, 1000000));
    await sendSms(phone, `Your LivingPlus verification code is ${code}. It expires in 5 minutes.`);
    await prisma.otpCode.create({
      data: { phone, propertyId: propertyId || null, purpose, codeHash: hashOtp(code), expiresAt: new Date(Date.now() + 5 * 60 * 1000) }
    });
    const showCode = !process.env.SMS_API_URL && (process.env.NODE_ENV !== 'production' || otpDemoMode());
    res.json({ message: 'Verification code sent', ...(showCode ? { devCode: code } : {}) });
  } catch (error) {
    logger.error({ err: error }, 'PG OTP request error');
    res.status(500).json({ message: 'Failed to send verification code' });
  }
};

export const verifyOtp = async (req: Request, res: Response): Promise<any> => {
  // Shape check only; the rules below still validate values.
  const input: any = parseBody(otpVerifyBody, req, res, INVALID_REQUEST);
  if (!input) return;
  const phone = normalizePhone(String(input.phone || ''));
  const purpose = ['BOOKING', 'TENANT_LOGIN'].includes(String(input.purpose)) ? String(input.purpose) : 'BOOKING';
  const propertyId = (req as any).pgPropertyId as string | undefined;
  if (purpose === 'TENANT_LOGIN' && !propertyId && process.env.NODE_ENV === 'production' && process.env.SINGLE_HOST_MODE !== 'true') {
    return res.status(400).json({ message: 'Open your PG-specific resident portal to sign in' });
  }

  try {
    let recordId: string;
    if (otpProvider() === 'firebase') {
      const idToken = typeof input.firebaseIdToken === 'string' ? input.firebaseIdToken.trim() : '';
      if (!idToken) return res.status(400).json({ message: 'Phone verification is required' });
      let verified;
      try {
        verified = await verifyFirebasePhoneToken(idToken);
      } catch (error: any) {
        if (error?.message === 'FIREBASE_NOT_CONFIGURED') {
          logger.error('OTP_PROVIDER=firebase but FIREBASE_PROJECT_ID is not set');
          return res.status(503).json({ message: 'Phone verification is not available right now' });
        }
        return res.status(400).json({ message: 'Phone verification failed. Request a new code.' });
      }
      if (verified.phone !== phone) return res.status(400).json({ message: 'The verified number does not match the phone you entered' });
      // One phone token per Firebase sign-in: a replayed ID token is refused.
      const proofHash = hashOtp(`firebase:${verified.uid}:${verified.authTime}`);
      if (await prisma.otpCode.findFirst({ where: { codeHash: proofHash }, select: { id: true } })) {
        return res.status(400).json({ message: 'This verification was already used. Request a new code.' });
      }
      const record = await prisma.otpCode.create({
        data: { phone, propertyId: propertyId || null, purpose, codeHash: proofHash, expiresAt: new Date(Date.now() + 5 * 60 * 1000) }
      });
      recordId = record.id;
    } else {
      const code = String(input.code || '').trim();
      if (!code) return res.status(400).json({ message: 'Verification code is required' });
      const record = await prisma.otpCode.findFirst({
        where: { phone, purpose, propertyId: propertyId || null, consumedAt: null },
        orderBy: { createdAt: 'desc' }
      });
      if (!record || record.expiresAt < new Date()) return res.status(400).json({ message: 'Code expired. Request a new one.' });
      if (record.attempts >= 5) return res.status(429).json({ message: 'Too many attempts. Request a new code.' });

      const expected = Buffer.from(record.codeHash, 'hex');
      const actual = Buffer.from(hashOtp(code), 'hex');
      if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
        await prisma.otpCode.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });
        return res.status(400).json({ message: 'Invalid verification code' });
      }
      recordId = record.id;
    }

    const verifiedToken = `vrf_${randomUUID().replace(/-/g, '')}`;
    await prisma.otpCode.update({
      where: { id: recordId },
      data: { verifiedToken, tokenExpiresAt: new Date(Date.now() + 15 * 60 * 1000) }
    });

    if (purpose === 'TENANT_LOGIN') {
      const resident = await residentSessionForPhone(phone, propertyId);
      if (!resident) return res.status(404).json({ message: 'No active stay found for this phone number' });
      if ('forbidden' in resident) return res.status(403).json({ message: 'This account cannot sign in as a resident' });
      return res.json({ token: resident.token, user: resident.user });
    }
    const resident = await residentSessionForPhone(phone, propertyId);
    res.json({
      phoneToken: verifiedToken,
      ...(!resident || 'forbidden' in resident ? {} : { resident })
    });
  } catch (error) {
    logger.error({ err: error }, 'PG OTP verify error');
    res.status(500).json({ message: 'Failed to verify code' });
  }
};

export async function consumePhoneToken(phone: string, token: string | undefined, purpose = 'BOOKING', propertyId?: string): Promise<boolean> {
  if (!token) return false;
  const consumed = await prisma.otpCode.updateMany({
    where: {
      verifiedToken: token,
      phone,
      propertyId: propertyId || null,
      purpose,
      consumedAt: null,
      tokenExpiresAt: { gt: new Date() }
    },
    data: { consumedAt: new Date() }
  });
  return consumed.count === 1;
}

export const forgotPassword = async (_req: Request, res: Response): Promise<any> => {
  res.json({ message: 'Contact your PG administrator to reset your password.' });
};

export const changePassword = async (req: Request, res: Response): Promise<any> => {
  // Shape check only; the rules below still validate values.
  const input: any = parseBody(changePasswordBody, req, res, INVALID_REQUEST);
  if (!input) return;
  const { userId } = (req as any).user || {};
  const { currentPassword, newPassword } = input;
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });
  if (!currentPassword || !newPassword) return res.status(400).json({ message: 'Current and new password are required' });

  try {
    const user = await prisma.user.findUnique({ where: { id: String(userId) } });
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!await bcrypt.compare(String(currentPassword), user.password)) return res.status(400).json({ message: 'Invalid current password' });
    const password = await bcrypt.hash(String(newPassword), 10);
    await prisma.user.update({ where: { id: user.id }, data: { password } });
    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    logger.error({ err: error }, 'PG password change error');
    res.status(500).json({ message: 'Failed to change password' });
  }
};

export const adminResetPassword = async (req: Request, res: Response): Promise<any> => {
  // Shape check only; the rules below still validate values.
  const input: any = parseBody(adminResetPasswordBody, req, res, INVALID_REQUEST);
  if (!input) return;
  const { role } = (req as any).user || {};
  const { userId, newPassword } = input;
  if (role !== 'SUPER_ADMIN') return res.status(403).json({ message: 'Only Super Admins can reset passwords' });
  if (!userId || !newPassword) return res.status(400).json({ message: 'User ID and new password are required' });

  try {
    const password = await bcrypt.hash(String(newPassword), 10);
    await prisma.user.update({ where: { id: String(userId) }, data: { password } });
    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    logger.error({ err: error }, 'PG admin password reset error');
    res.status(500).json({ message: 'Failed to reset password' });
  }
};

export const updateProfile = async (req: Request, res: Response): Promise<any> => {
  // Shape check only; the rules below still validate values.
  const input: any = parseBody(updateProfileBody, req, res, INVALID_REQUEST);
  if (!input) return;
  const { userId } = (req as any).user || {};
  const { name, profileImage } = input;
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });
  if (userId === 'env-admin') return res.status(400).json({ message: 'The environment admin profile cannot be changed.' });

  try {
    const user = await prisma.user.update({
      where: { id: String(userId) },
      data: { name: name?.trim(), profileImage: profileImage || null }
    });
    res.json(toUserResponse(user));
  } catch (error) {
    logger.error({ err: error }, 'PG profile update error');
    res.status(500).json({ message: 'Failed to update profile' });
  }
};