import express from 'express';
import { sendOtp, verifyOtp, getProfile, logout } from '../controllers/authController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.post('/send-otp', sendOtp);
router.post('/verify-otp', verifyOtp);
router.get('/me', authenticateToken, getProfile);
router.post('/logout', authenticateToken, logout);

export default router;
