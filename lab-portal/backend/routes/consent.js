import express from 'express';
import {
  getTemplates,
  getAllTemplates,
  createTemplate,
  updateTemplate,
  submitConsent,
  transitionConsent,
  verifyConsent,
  withdrawConsent
} from '../controllers/consentController.js';
import { authenticateToken, requirePermission } from '../middleware/auth.js';

const router = express.Router();

router.get('/templates', authenticateToken, getTemplates);
router.get('/templates/all', authenticateToken, getAllTemplates);
router.post('/templates', authenticateToken, createTemplate);
router.put('/templates/:id', authenticateToken, updateTemplate);
router.post('/submit', authenticateToken, requirePermission('Create Consent', 'Consent Management'), submitConsent);
router.post('/transition', authenticateToken, transitionConsent);
router.post('/verify', authenticateToken, verifyConsent);
router.post('/withdraw', authenticateToken, requirePermission('Verify Consent', 'Consent Management'), withdrawConsent);

export default router;
