import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHash, randomInt, randomUUID, timingSafeEqual } from 'crypto';
import { prisma } from '../app.js';
import { getJwtSecret } from '../utils/auth-config.js';

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
    profileImage: user.profileImage
  };
}

function createToken(user: { id: string; role: string }): string {
  return jwt.sign({ userId: user.id, role: user.role }, getJwtSecret(), { expiresIn: '1d' });
}

export const login = async (req: Request, res: Response): Promise<any> => {
  const { email, phone, password } = req.body;
  const loginId = String(phone || email || '').trim();
  if (!loginId || !password) return res.status(400).json({ message: 'Phone or email and password are required' });

  try {
    if (email === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
      const user = { id: 'env-admin', role: 'SUPER_ADMIN' };
      return res.json({
        token: createToken(user),
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

    res.json({ token: createToken(user), user: toUserResponse(user) });
  } catch (error) {
    console.error('PG login error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const register = async (req: Request, res: Response): Promise<any> => {
  const { name, email, phone, password, propertyName, propertyAddress, locality, contactPhone, city, genderPolicy, amenities, houseRules } = req.body;
  const normalizedPhone = normalizePhone(String(phone || ''));
  if (!name?.trim() || !propertyName?.trim() || !propertyAddress?.trim() || !locality?.trim() || normalizedPhone.length < 10 || !password) {
    return res.status(400).json({ message: 'Owner, PG name, phone, address, locality and password are required' });
  }

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
      const property = await tx.pGProperty.create({
        data: {
          name: propertyName.trim(),
          address: propertyAddress.trim(),
          locality: locality.trim(),
          contactPhone: contactPhone ? normalizePhone(String(contactPhone)) : null,
          city: city?.trim() || 'Chennai',
          genderPolicy: ['MEN', 'WOMEN', 'ANY'].includes(genderPolicy) ? genderPolicy : 'ANY',
          amenities: Array.isArray(amenities) ? amenities : [],
          houseRules: Array.isArray(houseRules) ? houseRules : [],
          access: { create: { userId: user.id, role: 'OWNER' } }
        }
      });
      return { user, property };
    });

    res.status(201).json({
      message: 'PG owner account created',
      token: createToken(created.user),
      user: toUserResponse(created.user),
      property: created.property
    });
  } catch (error: any) {
    if (error?.code === 'P2002') return res.status(400).json({ message: 'An account with this phone or email already exists' });
    console.error('PG registration error:', error);
    res.status(500).json({ message: 'Failed to create PG account' });
  }
};

function hashOtp(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

async function sendSms(phone: string, message: string): Promise<string | null> {
  const apiUrl = process.env.SMS_API_URL;
  if (!apiUrl) {
    if (process.env.NODE_ENV === 'production') throw new Error('SMS delivery is not configured');
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
  const phone = normalizePhone(String(req.body.phone || ''));
  const purpose = ['BOOKING', 'TENANT_LOGIN'].includes(String(req.body.purpose)) ? String(req.body.purpose) : 'BOOKING';
  if (phone.length < 10) return res.status(400).json({ message: 'A valid phone number is required' });

  try {
    const recent = await prisma.otpCode.count({
      where: { phone, purpose, consumedAt: null, createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) } }
    });
    if (recent >= 3) return res.status(429).json({ message: 'Too many codes requested. Try again in 10 minutes.' });

    const code = String(randomInt(100000, 1000000));
    await sendSms(phone, `Your LivingPlus verification code is ${code}. It expires in 5 minutes.`);
    await prisma.otpCode.create({
      data: { phone, purpose, codeHash: hashOtp(code), expiresAt: new Date(Date.now() + 5 * 60 * 1000) }
    });
    res.json({ message: 'Verification code sent', ...(process.env.SMS_API_URL || process.env.NODE_ENV === 'production' ? {} : { devCode: code }) });
  } catch (error) {
    console.error('PG OTP request error:', error);
    res.status(500).json({ message: 'Failed to send verification code' });
  }
};

export const verifyOtp = async (req: Request, res: Response): Promise<any> => {
  const phone = normalizePhone(String(req.body.phone || ''));
  const purpose = ['BOOKING', 'TENANT_LOGIN'].includes(String(req.body.purpose)) ? String(req.body.purpose) : 'BOOKING';
  const code = String(req.body.code || '').trim();
  if (!code) return res.status(400).json({ message: 'Verification code is required' });

  try {
    const record = await prisma.otpCode.findFirst({
      where: { phone, purpose, consumedAt: null },
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

    const verifiedToken = `vrf_${randomUUID().replace(/-/g, '')}`;
    await prisma.otpCode.update({
      where: { id: record.id },
      data: { verifiedToken, tokenExpiresAt: new Date(Date.now() + 15 * 60 * 1000) }
    });

    if (purpose === 'TENANT_LOGIN') {
      const digits = phone.startsWith('91') && phone.length === 12 ? phone.slice(2) : phone;
      const tenant = await prisma.pGTenant.findFirst({
        where: { phone: { in: [...new Set([phone, digits])] }, status: { in: ['ACTIVE', 'NOTICE_PERIOD', 'RESERVED'] } },
        select: { id: true, name: true }
      });
      if (!tenant) return res.status(404).json({ message: 'No active stay found for this phone number' });
      let user = await prisma.user.findFirst({ where: { phone } });
      if (!user) {
        user = await prisma.user.create({
          data: { name: tenant.name, phone, password: await bcrypt.hash(randomUUID(), 10), role: 'PG_TENANT' }
        });
      }
      return res.json({ token: createToken(user), user: toUserResponse(user) });
    }
    res.json({ phoneToken: verifiedToken });
  } catch (error) {
    console.error('PG OTP verify error:', error);
    res.status(500).json({ message: 'Failed to verify code' });
  }
};

export async function consumePhoneToken(phone: string, token: string | undefined, purpose = 'BOOKING'): Promise<boolean> {
  if (!token) return false;
  const consumed = await prisma.otpCode.updateMany({
    where: {
      verifiedToken: token,
      phone,
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
  const { userId } = (req as any).user || {};
  const { currentPassword, newPassword } = req.body;
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
    console.error('PG password change error:', error);
    res.status(500).json({ message: 'Failed to change password' });
  }
};

export const adminResetPassword = async (req: Request, res: Response): Promise<any> => {
  const { role } = (req as any).user || {};
  const { userId, newPassword } = req.body;
  if (role !== 'SUPER_ADMIN') return res.status(403).json({ message: 'Only Super Admins can reset passwords' });
  if (!userId || !newPassword) return res.status(400).json({ message: 'User ID and new password are required' });

  try {
    const password = await bcrypt.hash(String(newPassword), 10);
    await prisma.user.update({ where: { id: String(userId) }, data: { password } });
    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('PG admin password reset error:', error);
    res.status(500).json({ message: 'Failed to reset password' });
  }
};

export const updateProfile = async (req: Request, res: Response): Promise<any> => {
  const { userId } = (req as any).user || {};
  const { name, profileImage } = req.body;
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });
  if (userId === 'env-admin') return res.status(400).json({ message: 'The environment admin profile cannot be changed.' });

  try {
    const user = await prisma.user.update({
      where: { id: String(userId) },
      data: { name: name?.trim(), profileImage: profileImage || null }
    });
    res.json(toUserResponse(user));
  } catch (error) {
    console.error('PG profile update error:', error);
    res.status(500).json({ message: 'Failed to update profile' });
  }
};