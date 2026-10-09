import { Request, Response } from 'express';
import {
  createJob,
  getAllJobs,
  getJobById,
  getCompanyJobs,
  getCompanyPublicProfile,
  toggleJobPosting,
  updateJob,
} from '../services/job.service';
import {
  getMatchScore,
  getMatchScoresForStudent,
  NotFoundError,
  MAX_BATCH,
} from '../services/matchScore.service';
import { sendSuccess, sendCreated, sendError } from '../utils/responseHelper';

export const postJob = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      title,
      description,
      skillsRequired,
      responsibilities,
      academicRequirements,
      imageUrl,
      location,
      type,
      isPaid,
      stipend,
      duration,
      vacancies,
      deadline,
    } = req.body;

    if (!title || !description || !skillsRequired) {
      sendError(res, 'Title, description and skills are required.', 400);
      return;
    }

    if (!Array.isArray(skillsRequired) || skillsRequired.length === 0) {
      sendError(res, 'Skills required must be a non-empty array.', 400);
      return;
    }

    const job = await createJob({
      companyId: req.user!.userId,
      title,
      description,
      skillsRequired,
      responsibilities: Array.isArray(responsibilities) ? responsibilities : undefined,
      academicRequirements,
      imageUrl,
      location,
      type,
      isPaid,
      stipend,
      duration,
      vacancies,
      deadline,
    });

    sendCreated(res, job, 'Job posting created successfully.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create job.';
    sendError(res, message, 400);
  }
};

export const fetchAllJobs = async (req: Request, res: Response): Promise<void> => {
  try {
    const { search, location, type, isPaid, page, limit } = req.query;

    const result = await getAllJobs(
      {
        search: (Array.isArray(search) ? search[0] : search)?.toString(),
        location: (Array.isArray(location) ? location[0] : location)?.toString(),
        type: (Array.isArray(type) ? type[0] : type)?.toString(),
        isPaid: (Array.isArray(isPaid) ? isPaid[0] : isPaid)?.toString(),
      },
      page ? parseInt(page as string) : 1,
      limit ? parseInt(limit as string) : 10,
    );

    sendSuccess(res, result, 'Jobs fetched successfully.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch jobs.';
    sendError(res, message, 500);
  }
};

export const fetchJobById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const job = await getJobById(Array.isArray(id) ? id[0] : id);
    sendSuccess(res, job, 'Job fetched successfully.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch job.';
    sendError(res, message, 404);
  }
};

export const fetchCompanyJobs = async (req: Request, res: Response): Promise<void> => {
  try {
    const jobs = await getCompanyJobs(req.user!.userId);
    sendSuccess(res, jobs, 'Company jobs fetched successfully.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch jobs.';
    sendError(res, message, 500);
  }
};

export const fetchCompanyPublicProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const { companyId } = req.params;
    const profile = await getCompanyPublicProfile(
      Array.isArray(companyId) ? companyId[0] : companyId,
    );
    sendSuccess(res, profile, 'Company profile fetched successfully.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch company profile.';
    sendError(res, message, 404);
  }
};

export const getJobMatchScore = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const result = await getMatchScore(req.user!.userId, Array.isArray(id) ? id[0] : id);
    sendSuccess(res, result, 'Match score calculated.');
  } catch (error) {
    if (error instanceof NotFoundError) {
      sendError(res, error.message, 404);
      return;
    }
    const message = error instanceof Error ? error.message : 'Failed to calculate match score.';
    sendError(res, message, 500);
  }
};

// Scores for several jobs in one request, so list screens show the same numbers as the job page.
export const getJobMatchScores = async (req: Request, res: Response): Promise<void> => {
  try {
    const { jobIds } = req.body ?? {};

    if (
      !Array.isArray(jobIds) ||
      jobIds.length === 0 ||
      jobIds.length > MAX_BATCH ||
      !jobIds.every((id) => typeof id === 'string' && id.length > 0)
    ) {
      sendError(res, `jobIds must be a list of 1 to ${MAX_BATCH} job ids.`, 400);
      return;
    }

    const scores = await getMatchScoresForStudent(req.user!.userId, jobIds);
    sendSuccess(res, { scores }, 'Match scores calculated.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to calculate match scores.';
    sendError(res, message, 500);
  }
};

export const toggleJob = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      sendError(res, 'isActive must be a boolean.', 400);
      return;
    }

    const job = await toggleJobPosting(
      Array.isArray(id) ? id[0] : id,
      req.user!.userId,
      isActive,
    );

    sendSuccess(res, job, `Job ${isActive ? 'activated' : 'deactivated'} successfully.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update job status.';
    sendError(res, message, 400);
  }
};

export const editJob = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      skillsRequired,
      responsibilities,
      academicRequirements,
      imageUrl,
      location,
      type,
      isPaid,
      stipend,
      duration,
      vacancies,
      deadline,
    } = req.body;

    const job = await updateJob(
      Array.isArray(id) ? id[0] : id,
      req.user!.userId,
      {
        title,
        description,
        skillsRequired,
        responsibilities,
        academicRequirements,
        imageUrl,
        location,
        type,
        isPaid,
        stipend,
        duration,
        vacancies,
        deadline,
      },
    );

    sendSuccess(res, job, 'Job updated successfully.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update job.';
    sendError(res, message, 400);
  }
};