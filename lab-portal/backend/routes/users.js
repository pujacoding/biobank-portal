import express from 'express';
import {
  getMetadata,
  getUsers,
  createUser,
  updateUser,
  updateUserStatus,
  resetAccess,
  getUserHistory,
  getAccessibleLabs,
  getLabs,
  createLab,
  getLabSubunits,
  updateLab,
  deleteLab
} from '../controllers/userController.js';
import { authenticateToken, requirePermission } from '../middleware/auth.js';

const router = express.Router();

router.get('/metadata', authenticateToken, getMetadata);
router.get('/', authenticateToken, requirePermission('View Users', 'User Management'), getUsers);
router.post('/', authenticateToken, requirePermission('Create User', 'User Management'), createUser);
router.put('/:id', authenticateToken, requirePermission('Edit User', 'User Management'), updateUser);
router.put('/:id/status', authenticateToken, updateUserStatus);
router.post('/:id/reset-access', authenticateToken, requirePermission('Edit User', 'User Management'), resetAccess);
router.get('/:id/history', authenticateToken, requirePermission('View Users', 'User Management'), getUserHistory);

router.get('/labs/accessible', authenticateToken, getAccessibleLabs);
router.get('/labs', authenticateToken, getLabs);
router.post('/labs', authenticateToken, createLab);
router.get('/labs/:id/subunits', authenticateToken, getLabSubunits);
router.put('/labs/:id', authenticateToken, updateLab);
router.delete('/labs/:id', authenticateToken, deleteLab);

export default router;
