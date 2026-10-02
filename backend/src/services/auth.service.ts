import bcrypt from 'bcryptjs';
import { Role } from '@prisma/client';
import { prisma } from '../config/db';
import { signToken } from '../utils/jwt';
import crypto from 'crypto';


interface RegisterInput {
  email: string;
  password: string;
  role: Role;
  firstName?: string;
  lastName?: string;
  companyName?: string;
}

interface UpdateStudentProfileInput {
  userId: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  university?: string;
  yearOfStudy?: number;
  skills?: string[];
  biography?: string;
  courseOfStudy?: string;
  avatarUrl?: string;
  coverUrl?: string;
}

export const registerUser = async (input: RegisterInput) => {
  const { password, role, firstName, lastName, companyName } = input;
  const email = input.email.trim().toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new Error('An account with this email already exists.');
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      role,
      isVerified: true,
      otp: null,
      otpExpiry: null,
      ...(role === Role.STUDENT && {
        studentProfile: {
          create: {
            firstName: firstName ?? '',
            lastName: lastName ?? '',
          },
        },
      }),
      ...(role === Role.COMPANY && {
        companyProfile: {
          create: {
            companyName: companyName ?? '',
          },
        },
      }),
    },
    include: {
      studentProfile: true,
      companyProfile: true,
    },
  });

  const token = signToken({
    userId: user.id,
    email: user.email,
    role: user.role,
  });

  return { user, token };
};

export const loginUser = async (email: string, password: string) => {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    include: {
      studentProfile: true,
      companyProfile: true,
    },
  });

  if (!user) throw new Error('Invalid email or password.');
  if (!user.isActive) throw new Error('Your account has been deactivated.');

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) throw new Error('Invalid email or password.');

  const token = signToken({
    userId: user.id,
    email: user.email,
    role: user.role,
  });

  return { user, token };
};

export const getMe = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      studentProfile: true,
      companyProfile: true,
    },
  });

  if (!user) throw new Error('User not found.');
  return user;
};

export const updateStudentProfile = async (input: UpdateStudentProfileInput) => {
  const { userId, ...data } = input;

  await prisma.studentProfile.update({
    where: { userId },
    data: {
      ...(data.firstName !== undefined && { firstName: data.firstName }),
      ...(data.lastName !== undefined && { lastName: data.lastName }),
      ...(data.phone !== undefined && { phone: data.phone }),
      ...(data.university !== undefined && { university: data.university }),
      ...(data.yearOfStudy !== undefined && { yearOfStudy: data.yearOfStudy }),
      ...(data.skills !== undefined && { skills: data.skills }),
      ...(data.biography !== undefined && { biography: data.biography }),
      ...(data.courseOfStudy !== undefined && { courseOfStudy: data.courseOfStudy }),
      ...(data.avatarUrl !== undefined && { avatarUrl: data.avatarUrl }),
      ...(data.coverUrl !== undefined && { coverUrl: data.coverUrl }),
    },
  });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      studentProfile: true,
      companyProfile: true,
    },
  });

  return user;
};

interface UpdateCompanyProfileInput {
  userId: string;
  companyName?: string;
  industry?: string;
  description?: string;
  website?: string;
  location?: string;
  logoUrl?: string;
  coverUrl?: string;
}

export const updateCompanyProfile = async (input: UpdateCompanyProfileInput) => {
  const { userId, ...data } = input;

  await prisma.companyProfile.update({
    where: { userId },
    data: {
      ...(data.companyName !== undefined && { companyName: data.companyName }),
      ...(data.industry !== undefined && { industry: data.industry }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.website !== undefined && { website: data.website }),
      ...(data.location !== undefined && { location: data.location }),
      ...(data.logoUrl !== undefined && { logoUrl: data.logoUrl }),
      ...(data.coverUrl !== undefined && { coverUrl: data.coverUrl }),
    },
  });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      studentProfile: true,
      companyProfile: true,
    },
  });

  return user;
};


export const forgotPassword = async (email: string) => {
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
  });

  if (!user) throw new Error('No account found with this email.');

  // Generate reset token
  const resetToken = crypto.randomBytes(32).toString('hex');
  const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await prisma.user.update({
    where: { id: user.id },
    data: { resetToken, resetTokenExpiry },
  });

  return { resetToken, email: user.email };
};

export const resetPassword = async (token: string, newPassword: string) => {
  const user = await prisma.user.findFirst({
    where: {
      resetToken: token,
      resetTokenExpiry: { gt: new Date() },
    },
  });

  if (!user) throw new Error('Invalid or expired reset token.');

  const hashedPassword = await bcrypt.hash(newPassword, 12);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashedPassword,
      resetToken: null,
      resetTokenExpiry: null,
    },
  });

  return { email: user.email };
};