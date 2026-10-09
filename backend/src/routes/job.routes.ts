import { Router } from 'express';
import {
  postJob,
  fetchAllJobs,
  fetchJobById,
  fetchCompanyJobs,
  fetchCompanyPublicProfile,
  getJobMatchScore,
  getJobMatchScores,
  toggleJob,
  editJob,
} from '../controllers/job.controller';
import { protect } from '../middleware/auth.middleware';
import { restrictTo } from '../middleware/role.middleware';

const router = Router();

// Public routes
router.get('/', protect, fetchAllJobs);
router.get('/company/my-jobs', protect, restrictTo('COMPANY'), fetchCompanyJobs);
router.get('/company/:companyId', protect, fetchCompanyPublicProfile);
router.post('/match-scores', protect, restrictTo('STUDENT'), getJobMatchScores);
router.get('/:id/match', protect, restrictTo('STUDENT'), getJobMatchScore);
router.patch('/:id', protect, restrictTo('COMPANY'), editJob);
router.get('/:id', protect, fetchJobById);
router.patch('/:id/toggle', protect, restrictTo('COMPANY'), toggleJob);

// Company only routes
router.post('/', protect, restrictTo('COMPANY'), postJob);

export default router;