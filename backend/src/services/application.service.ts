import { prisma } from '../config/db';
import { ForbiddenError, NotFoundError } from './matchScore.service';

// What a company is allowed to see about a student. No password, no codes.
const applicantStudentSelect = {
  id: true,
  email: true,
  studentProfile: true,
} as const;

// Loads an application and makes sure it belongs to a job owned by this company.
const loadOwnedApplication = async (applicationId: string, companyId: string) => {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { jobPosting: { select: { id: true, title: true, companyId: true } } },
  });
  if (!application) throw new NotFoundError('Application not found.');
  if (application.jobPosting.companyId !== companyId) {
    throw new ForbiddenError('You can only manage applications for your own jobs.');
  }
  return application;
};

interface CreateApplicationInput {
  studentId: string;
  jobPostingId: string;
  coverNote?: string;
}

export const createApplication = async (input: CreateApplicationInput) => {
  // Check if job exists and is active
  const job = await prisma.jobPosting.findUnique({
    where: { id: input.jobPostingId },
  });

  if (!job) throw new Error('Job posting not found.');
  if (!job.isActive) throw new Error('This job posting is no longer active.');

  // Check if student already applied
  const existing = await prisma.application.findUnique({
    where: {
      studentId_jobPostingId: {
        studentId: input.studentId,
        jobPostingId: input.jobPostingId,
      },
    },
  });

  if (existing) throw new Error('You have already applied for this job.');

  const application = await prisma.application.create({
    data: {
      studentId: input.studentId,
      jobPostingId: input.jobPostingId,
      coverNote: input.coverNote,
      status: 'PENDING',
    },
    include: {
      jobPosting: {
        include: {
          company: {
            include: {
              companyProfile: true,
            },
          },
        },
      },
    },
  });

  return application;
};

export const getStudentApplications = async (studentId: string) => {
  const applications = await prisma.application.findMany({
    where: { studentId },
    include: {
      jobPosting: {
        include: {
          company: {
            include: {
              companyProfile: true,
            },
          },
        },
      },
      documents: true,
    },
    orderBy: { appliedAt: 'desc' },
  });

  return applications;
};

export const getApplicationById = async (
  applicationId: string,
  viewer: { userId: string; role: string },
) => {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: {
      jobPosting: {
        include: {
          company: {
            include: {
              companyProfile: true,
            },
          },
        },
      },
      documents: true,
    },
  });

  if (!application) throw new NotFoundError('Application not found.');

  const allowed =
    viewer.role === 'ADMIN' ||
    (viewer.role === 'STUDENT' && application.studentId === viewer.userId) ||
    (viewer.role === 'COMPANY' && application.jobPosting.companyId === viewer.userId);
  if (!allowed) throw new ForbiddenError('You cannot view this application.');

  return application;
};

export const getJobApplications = async (jobPostingId: string, companyId: string) => {
  const job = await prisma.jobPosting.findUnique({
    where: { id: jobPostingId },
    select: { companyId: true },
  });
  if (!job) throw new NotFoundError('Job posting not found.');
  if (job.companyId !== companyId) {
    throw new ForbiddenError('You can only view applicants for your own jobs.');
  }

  const applications = await prisma.application.findMany({
    where: { jobPostingId },
    include: {
      student: { select: applicantStudentSelect },
      documents: true,
    },
    orderBy: { appliedAt: 'desc' },
  });

  return applications;
};

// Everything a company needs to review one applicant: profile, email,
// cover note and the CV and internship letter.
export const getApplicantDetail = async (applicationId: string, companyId: string) => {
  await loadOwnedApplication(applicationId, companyId);

  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: {
      jobPosting: { select: { id: true, title: true } },
      student: { select: applicantStudentSelect },
      documents: true,
    },
  });
  if (!application) throw new NotFoundError('Application not found.');

  // Students upload their CV and letter once and reuse them, so they are often
  // not attached to a single application. Fall back to their latest of each type.
  const linked = application.documents;
  const studentDocuments = await prisma.document.findMany({
    where: { userId: application.student.id },
    orderBy: { uploadedAt: 'desc' },
  });

  const pick = (type: 'CV' | 'LETTER') =>
    linked.find((d: { type: string }) => d.type === type) ??
    studentDocuments.find((d: { type: string }) => d.type === type) ??
    null;

  return {
    ...application,
    documents: undefined,
    cv: pick('CV'),
    letter: pick('LETTER'),
  };
};

export const updateApplicationStatus = async (
  applicationId: string,
  status: string,
  companyId: string,
) => {
  const validStatuses = ['PENDING', 'SHORTLISTED', 'INTERVIEWING', 'REJECTED', 'ACCEPTED'];
  if (!validStatuses.includes(status)) {
    throw new Error('Invalid status value.');
  }

  await loadOwnedApplication(applicationId, companyId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: any = { status };

  if (status === 'SHORTLISTED') updateData.shortlistedAt = new Date();
  if (status === 'INTERVIEWING') updateData.interviewedAt = new Date();
  if (status === 'ACCEPTED' || status === 'REJECTED') updateData.decidedAt = new Date();
  // Going back to an open stage clears the old final decision date.
  if (status === 'PENDING' || status === 'SHORTLISTED' || status === 'INTERVIEWING') {
    updateData.decidedAt = null;
  }

  const application = await prisma.application.update({
    where: { id: applicationId },
    data: updateData,
    include: {
      jobPosting: { select: { id: true, title: true } },
      student: { select: applicantStudentSelect },
    },
  });

  return application;
};