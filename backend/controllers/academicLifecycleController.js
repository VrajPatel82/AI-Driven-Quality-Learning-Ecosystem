const academicLifecycleService = require('../services/academicLifecycleService');

/**
 * Controller for Academic Lifecycle operations.
 */

// @desc    Transition student academic semester & course memberships
// @route   POST /api/academic-lifecycle/transition
// @access  Private (Admins)
exports.transitionStudent = async (req, res, next) => {
  try {
    const { studentId, targetSemester, academicTerm, division } = req.body;
    if (!studentId || !targetSemester) {
      return res.status(400).json({ message: 'studentId and targetSemester are required' });
    }

    const result = await academicLifecycleService.transitionStudentSemester({
      studentId,
      targetSemester,
      academicTerm,
      division,
      performedBy: req.user
    });

    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    next(error);
  }
};

// @desc    Bulk transition students academic semester & course memberships
// @route   POST /api/academic-lifecycle/transition-bulk
// @access  Private (Admins)
exports.transitionBulk = async (req, res, next) => {
  try {
    const { studentIds, targetSemester, reason, divisionMapping, validateOnly } = req.body;
    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0 || !targetSemester) {
      return res.status(400).json({ message: 'studentIds array and targetSemester are required' });
    }

    if (validateOnly) {
      const validation = await academicLifecycleService.validateBulkTransition({
        studentIds,
        targetSemester,
        reason,
        divisionMapping,
        performedBy: req.user
      });
      return res.json(validation);
    }

    const result = await academicLifecycleService.transitionBulkStudents({
      studentIds,
      targetSemester,
      reason,
      divisionMapping,
      performedBy: req.user
    });

    res.json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        message: error.message,
        errors: error.validationErrors || [error.message]
      });
    }
    next(error);
  }
};

