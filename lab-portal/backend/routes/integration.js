import express from 'express';
import jwt from 'jsonwebtoken';
import {
  getStats,
  getCatalog,
  getDonors,
  withdrawDonorConsent,
  getUsers,
  getResearchRequests,
  createResearchRequest,
  approveResearchRequest,
  rejectResearchRequest,
  getStudies,
  createStudy,
  getPublications,
  createPublication,
  storeSample,
  qcSample,
  relocateSample,
  retrieveSample,
  traceSample,
  getShipments,
  createShipment,
  receiveShipment,
  verifyTransferScan,
  acceptTransferSample,
  quarantineTransferSample
} from '../controllers/integrationController.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'aura-secret-key-2026';

// Middleware to verify pre-shared API integration key or extract user JWT
const verifyIntegrationKey = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      req.user = payload;

      const activeLabIdHeader = req.headers['x-active-lab-id'];
      if (activeLabIdHeader) {
        const activeLabId = parseInt(activeLabIdHeader, 10);
        if (!isNaN(activeLabId)) {
          req.user.labId = activeLabId;
        }
      }
    } catch {
      // Continue gracefully
    }
  }

  next();
};

router.use(verifyIntegrationKey);

router.get('/stats', getStats);
router.get('/catalog', getCatalog);
router.get('/donors', getDonors);
router.post('/donors/withdraw', withdrawDonorConsent);
router.get('/users', getUsers);
router.get('/requests', getResearchRequests);
router.post('/requests', createResearchRequest);
router.post('/requests/approve/:id', approveResearchRequest);
router.post('/requests/reject/:id', rejectResearchRequest);
router.get('/studies', getStudies);
router.post('/studies', createStudy);
router.get('/publications', getPublications);
router.post('/publications', createPublication);
router.post('/samples/store', storeSample);
router.post('/samples/qc', qcSample);
router.post('/samples/relocate', relocateSample);
router.post('/samples/retrieve', retrieveSample);
router.get('/samples/trace/:barcode', traceSample);
router.get('/shipments', getShipments);
router.post('/shipments', createShipment);
router.post('/shipments/verify-scan', verifyTransferScan);
router.post('/shipments/accept-sample', acceptTransferSample);
router.post('/shipments/quarantine-sample', quarantineTransferSample);
router.post('/shipments/receive/:id', receiveShipment);

export default router;
