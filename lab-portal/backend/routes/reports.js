import express from 'express';
import { getReportData } from '../controllers/reportsController.js';
import { authenticateToken, requirePermission } from '../middleware/auth.js';

const router = express.Router();

router.get('/:reportType', authenticateToken, requirePermission('View Reports', 'Reports'), getReportData);

export default router;
