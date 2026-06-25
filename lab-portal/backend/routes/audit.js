import express from 'express';
import { getAuditLogs } from '../controllers/auditController.js';
import { authenticateToken, requirePermission } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticateToken, requirePermission('View Audit Logs', 'Administration'), getAuditLogs);

export default router;
