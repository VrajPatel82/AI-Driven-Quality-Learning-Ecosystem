const express = require('express');
const router = express.Router();
const multer = require('multer');
const {
  setComponents,
  enterGrades,
  enterBulkGrades,
  exportGradebookTemplate,
  previewGradebookImport,
  getCourseGradebook,
  getStudentGrades
} = require('../controllers/gradebookController');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');

// Configure in-memory storage for Excel/CSV import parsing (no permanent disk files)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const name = file.originalname.toLowerCase();
    if (name.endsWith('.xlsx') || name.endsWith('.csv') || file.mimetype === 'text/csv' || file.mimetype.includes('spreadsheetml')) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel (.xlsx) and CSV (.csv) files are allowed'));
    }
  }
});

router.use(auth);

// Download gradebook template / current marks (.xlsx)
router.get('/:courseId/template',
  roleCheck('professor', 'dept_admin', 'inst_admin', 'university_admin', 'super_admin'),
  exportGradebookTemplate
);

// Get student grades for a course
router.get('/:courseId/student/:studentId', getStudentGrades);

// Preview Excel/CSV import (professor & admins)
router.post('/:courseId/preview-import',
  roleCheck('professor', 'dept_admin', 'inst_admin', 'university_admin', 'super_admin'),
  upload.single('file'),
  previewGradebookImport
);

// Bulk enter grades (professor & admins)
router.post('/:courseId/grades/bulk',
  roleCheck('professor', 'dept_admin', 'inst_admin', 'university_admin', 'super_admin'),
  enterBulkGrades
);

// Enter grades (professor & admins)
router.post('/:courseId/grades',
  roleCheck('professor', 'dept_admin', 'inst_admin', 'university_admin', 'super_admin'),
  enterGrades
);

// Set grade components (professor & admins)
router.post('/:courseId/components',
  roleCheck('professor', 'dept_admin', 'inst_admin', 'university_admin', 'super_admin'),
  setComponents
);

// Get gradebook for a course (professors & admins only)
router.get('/:courseId',
  roleCheck('professor', 'dept_admin', 'inst_admin', 'university_admin', 'super_admin'),
  getCourseGradebook
);

module.exports = router;
