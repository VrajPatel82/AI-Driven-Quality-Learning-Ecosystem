const express = require('express');
const router = express.Router();
const {
  createAssignment,
  getAssignments,
  getAssignmentById,
  submitAssignment,
  getSubmissions,
  gradeSubmission,
  triggerAIEvaluation,
  finalizeEvaluation,
  exportAssignmentExcel,
  deleteAssignment
} = require('../controllers/assignmentController');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');
const upload = require('../middleware/upload');

router.use(auth);

// Get all assignments
router.get('/', getAssignments);

// Export assignment submissions report to Excel (professors & admins)
router.get('/:id/export-excel',
  roleCheck('professor', 'dept_admin', 'inst_admin', 'super_admin'),
  exportAssignmentExcel
);

// Get single assignment
router.get('/:id', getAssignmentById);

// Create assignment (professor & admins)
router.post('/',
  roleCheck('professor', 'dept_admin', 'inst_admin', 'super_admin'),
  upload.any(),
  createAssignment
);

// Submit assignment (students)
router.post('/:id/submit',
  upload.any(),
  submitAssignment
);

// Get submissions for an assignment (professor & admins)
router.get('/:id/submissions',
  roleCheck('professor', 'dept_admin', 'inst_admin', 'super_admin'),
  getSubmissions
);

// Trigger/re-run AI evaluation (professor & admins)
router.post('/:assignmentId/submissions/:submissionId/evaluate',
  roleCheck('professor', 'dept_admin', 'inst_admin', 'super_admin'),
  triggerAIEvaluation
);

// Finalize submission evaluation (professor & admins)
router.put('/:assignmentId/submissions/:submissionId/finalize',
  roleCheck('professor', 'dept_admin', 'inst_admin', 'super_admin'),
  finalizeEvaluation
);

// Grade a submission (legacy compatibility endpoint)
router.put('/:assignmentId/submissions/:submissionId/grade',
  roleCheck('professor', 'dept_admin', 'inst_admin', 'super_admin'),
  gradeSubmission
);

// Delete assignment (professor & admins)
router.delete('/:id',
  roleCheck('professor', 'dept_admin', 'inst_admin', 'super_admin'),
  deleteAssignment
);

module.exports = router;
