const express = require('express');
const router = express.Router();
const resourceController = require('../controllers/resourceController');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');

// All resource routes require authentication
router.use(auth);

// Overview available to all authenticated non-student users
router.get('/overview', resourceController.getOverview);

// Allocation routes
router.get('/allocations', roleCheck('super_admin', 'university_admin', 'inst_admin', 'dept_admin', 'professor'), resourceController.getAllocations);
router.post('/allocations', roleCheck('super_admin', 'university_admin', 'inst_admin', 'dept_admin'), resourceController.createAllocation);
router.put('/allocations/:id', roleCheck('super_admin', 'university_admin', 'inst_admin', 'dept_admin'), resourceController.updateAllocation);
router.delete('/allocations/:id', roleCheck('super_admin', 'university_admin', 'inst_admin', 'dept_admin'), resourceController.revokeAllocation);

// History and details
router.get('/history', roleCheck('super_admin', 'university_admin', 'inst_admin', 'dept_admin', 'professor'), resourceController.getHistory);
router.get('/files', roleCheck('super_admin', 'university_admin', 'inst_admin', 'dept_admin', 'professor'), resourceController.getFiles);
router.get('/ai-usage', roleCheck('super_admin', 'university_admin', 'inst_admin', 'dept_admin', 'professor'), resourceController.getAIUsage);
router.get('/professor/breakdown', roleCheck('super_admin', 'university_admin', 'inst_admin', 'dept_admin', 'professor'), resourceController.getProfessorBreakdown);
router.get('/usage-logs', roleCheck('super_admin', 'university_admin', 'inst_admin', 'dept_admin', 'professor'), resourceController.getStorageUsageLogs);
router.get('/storage/b2-status', roleCheck('super_admin', 'university_admin'), resourceController.getB2StorageStatus);
router.post('/storage/b2-sync', roleCheck('super_admin'), resourceController.syncB2Storage);
router.get('/storage/reconciliation', roleCheck('super_admin', 'university_admin'), resourceController.getStorageReconciliation);
router.get('/storage/object/*', resourceController.streamObject);

module.exports = router;

