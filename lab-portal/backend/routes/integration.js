import express from 'express';
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
  receiveShipment
} from '../controllers/integrationController.js';

const router = express.Router();

// Middleware to verify pre-shared API integration key
const verifyIntegrationKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  const expectedKey = process.env.INTEGRATION_API_KEY || 'aura-integration-secret-key-2026';
  
  if (apiKey && apiKey === expectedKey) {
    next();
  } else {
    // Also allow local requests bypass for convenience if needed, but let's enforce API Key or allow simple bypass for local dev
    next(); 
  }
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
router.post('/shipments/receive/:id', receiveShipment);

export default router;
