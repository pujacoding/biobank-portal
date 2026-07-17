import express from 'express';
import {
  getActiveTypes,
  getAllTypes,
  createType,
  updateType
} from '../controllers/specimenTypeController.js';
import { authenticateToken, requirePermission } from '../middleware/auth.js';

const router = express.Router();

router.get('/active', getActiveTypes);
router.get('/', authenticateToken, requirePermission('View Specimen Types', 'Specimen Type Master'), getAllTypes);
router.post('/', authenticateToken, requirePermission('Manage Specimen Types', 'Specimen Type Master'), createType);
router.put('/:id', authenticateToken, requirePermission('Manage Specimen Types', 'Specimen Type Master'), updateType);

export default router;
