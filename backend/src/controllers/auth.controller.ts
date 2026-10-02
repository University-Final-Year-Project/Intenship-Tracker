import { Request, Response } from 'express';
import {
  registerUser,
  loginUser,
  getMe,
  updateStudentProfile,
  updateCompanyProfile,
  forgotPassword,
  resetPassword,
} from '../services/auth.service';
import { sendSuccess, sendCreated, sendError } from '../utils/responseHelper';


import { Role } from '@prisma/client';

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, role, firstName, lastName, companyName } = req.body;

    if (!email || !password || !role) {
      sendError(res, 'Email, password and role are required.', 400);
      return;
    }

    if (!Object.values(Role).includes(role)) {
      sendError(res, 'Role must be STUDENT or COMPANY.', 400);
      return;
    }

    if (password.length < 6) {
      sendError(res, 'Password must be at least 6 characters.', 400);
      return;
    }

    const { user, token } = await registerUser({
      email,
      password,
      role,
      firstName,
      lastName,
      companyName,
    });

    sendCreated(res, {
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        studentProfile: user.studentProfile,
        companyProfile: user.companyProfile,
      },
    }, 'Registration successful.');

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Registration failed.';
    sendError(res, message, 400);
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      sendError(res, 'Email and password are required.', 400);
      return;
    }

    const { user, token } = await loginUser(email, password);

    sendSuccess(res, {
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        studentProfile: user.studentProfile,
        companyProfile: user.companyProfile,
      },
    }, 'Login successful.');

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Login failed.';
    sendError(res, message, 401);
  }
};

export const me = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await getMe(req.user!.userId);

    sendSuccess(res, {
      id: user.id,
      email: user.email,
      role: user.role,
      studentProfile: user.studentProfile,
      companyProfile: user.companyProfile,
    }, 'User fetched successfully.');

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not fetch user.';
    sendError(res, message, 404);
  }
};

export const updateProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      firstName,
      lastName,
      phone,
      university,
      yearOfStudy,
      skills,
      biography,
      courseOfStudy,
      avatarUrl,
      coverUrl,
    } = req.body;

    const user = await updateStudentProfile({
      userId: req.user!.userId,
      firstName,
      lastName,
      phone,
      university,
      yearOfStudy: yearOfStudy ? parseInt(yearOfStudy) : undefined,
      skills: Array.isArray(skills) ? skills : skills?.split(',').map((s: string) => s.trim()).filter(Boolean),
      biography,
      courseOfStudy,
      avatarUrl,
      coverUrl,
    });

    sendSuccess(res, {
      id: user!.id,
      email: user!.email,
      role: user!.role,
      studentProfile: user!.studentProfile,
      companyProfile: user!.companyProfile,
    }, 'Profile updated successfully.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update profile.';
    sendError(res, message, 400);
  }
};

export const updateCompanyProfileHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      companyName,
      industry,
      description,
      website,
      location,
      logoUrl,
      coverUrl,
    } = req.body;

    const user = await updateCompanyProfile({
      userId: req.user!.userId,
      companyName,
      industry,
      description,
      website,
      location,
      logoUrl,
      coverUrl,
    });

    sendSuccess(res, {
      id: user!.id,
      email: user!.email,
      role: user!.role,
      studentProfile: user!.studentProfile,
      companyProfile: user!.companyProfile,
    }, 'Company profile updated successfully.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update profile.';
    sendError(res, message, 400);
  }
};

export const clearMatchScoreCache = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { prisma } = await import('../config/db');
    await prisma.matchScore.deleteMany({
      where: { studentId: userId },
    });
    sendSuccess(res, null, 'Match score cache cleared.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to clear cache.';
    sendError(res, message, 500);
  }
};

export const forgotPasswordHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;
    if (!email) {
      sendError(res, 'Email is required.', 400);
      return;
    }

    const { resetToken, email: userEmail } = await forgotPassword(email);
    
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
    const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;

    sendSuccess(res, { resetUrl }, 'Password reset link generated. Email sending coming soon.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send reset email.';
    sendError(res, message, 400);
  }
};

export const resetPasswordHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      sendError(res, 'Token and password are required.', 400);
      return;
    }
    if (password.length < 6) {
      sendError(res, 'Password must be at least 6 characters.', 400);
      return;
    }

    await resetPassword(token, password);
    sendSuccess(res, null, 'Password reset successfully. You can now login.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to reset password.';
    sendError(res, message, 400);
  }
};