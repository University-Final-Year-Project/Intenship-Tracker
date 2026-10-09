import { Request, Response } from 'express';
import {
  createApplication,
  getStudentApplications,
  getApplicationById,
  getJobApplications,
  updateApplicationStatus,
} from '../services/application.service';
import {
  getApplicantScores,
  ForbiddenError,
  NotFoundError,
} from '../services/matchScore.service';
import { sendSuccess, sendCreated, sendError } from '../utils/responseHelper';

export const applyForJob = async (req: Request, res: Response): Promise<void> => {
  try {
    const { jobPostingId, coverNote } = req.body;

    if (!jobPostingId) {
      sendError(res, 'Job posting ID is required.', 400);
      return;
    }

    const application = await createApplication({
      studentId: req.user!.userId,
      jobPostingId,
      coverNote,
    });

    sendCreated(res, application, 'Application submitted successfully.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to apply.';
    sendError(res, message, 400);
  }
};

export const fetchStudentApplications = async (req: Request, res: Response): Promise<void> => {
  try {
    const applications = await getStudentApplications(req.user!.userId);
    sendSuccess(res, applications, 'Applications fetched successfully.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch applications.';
    sendError(res, message, 500);
  }
};

export const fetchApplicationById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const application = await getApplicationById(Array.isArray(id) ? id[0] : id);
    sendSuccess(res, application, 'Application fetched successfully.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch application.';
    sendError(res, message, 404);
  }
};

export const fetchJobApplications = async (req: Request, res: Response): Promise<void> => {
  try {
    const { jobId } = req.params;
    const applications = await getJobApplications(Array.isArray(jobId) ? jobId[0] : jobId);
    sendSuccess(res, applications, 'Applications fetched successfully.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch applications.';
    sendError(res, message, 500);
  }
};

// Match scores for every applicant of one job. Same service the students use,
// so a company sees the same number the student sees on their own screens.
export const fetchApplicantScores = async (req: Request, res: Response): Promise<void> => {
  try {
    const { jobId } = req.params;
    const scores = await getApplicantScores(
      req.user!.userId,
      Array.isArray(jobId) ? jobId[0] : jobId,
    );
    sendSuccess(res, { scores }, 'Applicant match scores fetched.');
  } catch (error) {
    if (error instanceof NotFoundError) {
      sendError(res, error.message, 404);
      return;
    }
    if (error instanceof ForbiddenError) {
      sendError(res, error.message, 403);
      return;
    }
    const message = error instanceof Error ? error.message : 'Failed to fetch applicant scores.';
    sendError(res, message, 500);
  }
};

export const updateStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      sendError(res, 'Status is required.', 400);
      return;
    }

    const application = await updateApplicationStatus(
      Array.isArray(id) ? id[0] : id,
      status,
    );

    sendSuccess(res, application, 'Application status updated successfully.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update status.';
    sendError(res, message, 400);
  }
};