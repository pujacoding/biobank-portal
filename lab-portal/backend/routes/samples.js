import express from 'express';
import {
  registerSample,
  getSamples,
  getSampleAudit,
  getPublicSample,
  getDashboardStats,
  disposeSample
} from '../controllers/sampleController.js';
import { authenticateToken, requirePermission } from '../middleware/auth.js';

const router = express.Router();

router.post('/register', authenticateToken, requirePermission('Create Sample', 'Sample Management'), registerSample);
router.get('/dashboard-stats', authenticateToken, getDashboardStats);
router.get('/', authenticateToken, requirePermission('View Sample', 'Sample Management'), getSamples);
router.get('/audit/:id', authenticateToken, requirePermission('View Sample', 'Sample Management'), getSampleAudit);
router.get('/public/:id', getPublicSample);
router.post('/dispose/:id', authenticateToken, requirePermission('Edit Sample', 'Sample Management'), disposeSample);

export default router;

