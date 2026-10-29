const Gradebook = require('../models/Gradebook');
const User = require('../models/User');
const Course = require('../models/Course');
const Department = require('../models/Department');
const Enrollment = require('../models/Enrollment');
const { isStudentEnrolledInCourse } = require('../utils/enrollmentHelper');

/**
 * Helper to check whether a user (professor/admin) is authorized to access a course gradebook
 */
async function canUserAccessCourseGradebook(user, courseId) {
  const course = await Course.findById(courseId).populate('department');
  if (!course) {
    return { allowed: false, status: 404, message: 'Course not found', course: null };
  }

  if (user.role === 'super_admin') {
    return { allowed: true, course };
  }

  const deptId = course.department?._id || course.department;

  if (user.role === 'dept_admin') {
    const userDeptId = user.department?._id || user.department;
    if (deptId && userDeptId && deptId.toString() === userDeptId.toString()) {
      return { allowed: true, course };
    }
    return { allowed: false, status: 403, message: 'Access denied. Course does not belong to your department.', course };
  }

  if (user.role === 'inst_admin') {
    const userInstId = user.institution?._id || user.institution;
    const dept = await Department.findById(deptId);
    if (dept && userInstId && dept.institution?.toString() === userInstId.toString()) {
      return { allowed: true, course };
    }
    return { allowed: false, status: 403, message: 'Access denied. Course does not belong to your institution.', course };
  }

  if (user.role === 'university_admin') {
    const userUniId = user.university?._id || user.university;
    const dept = await Department.findById(deptId).populate('institution');
    const inst = dept?.institution;
    if (inst && userUniId && inst.university?.toString() === userUniId.toString()) {
      return { allowed: true, course };
    }
    return { allowed: false, status: 403, message: 'Access denied. Course does not belong to your university.', course };
  }

  if (user.role === 'professor') {
    const isPrimaryProf = course.professor && course.professor.toString() === user._id.toString();
    const userCourseIds = (user.courses || []).map(c => (c._id || c).toString());
    const isAssignedProf = userCourseIds.includes(course._id.toString());
    const userDeptId = user.department?._id || user.department;
    const isSameDeptProf = deptId && userDeptId && deptId.toString() === userDeptId.toString();

    if (isPrimaryProf || isAssignedProf || isSameDeptProf) {
      return { allowed: true, course };
    }
    return { allowed: false, status: 403, message: 'Access denied. You are not authorized to access gradebook for this course.', course };
  }

  return { allowed: false, status: 403, message: 'Access denied.', course };
}

// @desc    Create/update grade components for a course
// @route   POST /api/gradebook/:courseId/components
exports.setComponents = async (req, res, next) => {
  try {
    const { components, academicTerm } = req.body;
    const term = academicTerm || req.query.academicTerm || 'CURRENT';

    const access = await canUserAccessCourseGradebook(req.user, req.params.courseId);
    if (!access.allowed) {
      return res.status(access.status || 403).json({ message: access.message });
    }

    // Validate total weightage = 100
    const totalWeight = components.reduce((sum, c) => sum + c.weightage, 0);
    if (totalWeight !== 100) {
      return res.status(400).json({ message: `Total weightage must be 100%, currently ${totalWeight}%` });
    }

    let gradebook = await Gradebook.findOne({ course: req.params.courseId, academicTerm: term });
    if (!gradebook && term === 'CURRENT') {
      gradebook = await Gradebook.findOne({ course: req.params.courseId });
    }

    if (gradebook) {
      gradebook.components = components;
      await gradebook.save();
    } else {
      gradebook = await Gradebook.create({
        course: req.params.courseId,
        academicTerm: term,
        components,
        createdBy: req.user._id
      });
    }

    await gradebook.populate('course', 'name code');
    res.json({ gradebook, message: 'Grade components saved successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Enter grades for students
// @route   POST /api/gradebook/:courseId/grades
exports.enterGrades = async (req, res, next) => {
  try {
    const { grades, academicTerm } = req.body; // [{student, componentName, marksObtained}]
    const term = academicTerm || req.query.academicTerm || 'CURRENT';

    const access = await canUserAccessCourseGradebook(req.user, req.params.courseId);
    if (!access.allowed) {
      return res.status(access.status || 403).json({ message: access.message });
    }

    let gradebook = await Gradebook.findOne({ course: req.params.courseId, academicTerm: term });
    if (!gradebook && term === 'CURRENT') {
      gradebook = await Gradebook.findOne({ course: req.params.courseId });
    }
    if (!gradebook) {
      return res.status(404).json({ message: 'Gradebook not found. Set up components first.' });
    }

    // Verify all students being graded are actively enrolled in this course for this attempt
    if (Array.isArray(grades)) {
      for (const entry of grades) {
        const activeEnrollment = await Enrollment.findOne({
          student: entry.student,
          course: req.params.courseId,
          status: 'active'
        });
        if (!activeEnrollment) {
          return res.status(400).json({ message: `Student ${entry.student} is not actively enrolled in this course.` });
        }
        entry._resolvedEnrollmentId = activeEnrollment._id;
      }

      grades.forEach(entry => {
        const encId = entry._resolvedEnrollmentId;
        // Find existing grade entry for exact student + enrollment attempt + component
        const existingIdx = gradebook.grades.findIndex(
          g => g.student && g.student.toString() === entry.student.toString()
            && g.enrollment && g.enrollment.toString() === encId.toString()
            && g.componentName === entry.componentName
        );
        if (existingIdx >= 0) {
          gradebook.grades[existingIdx].marksObtained = entry.marksObtained;
          gradebook.grades[existingIdx].date = new Date();
        } else {
          gradebook.grades.push({
            student: entry.student,
            enrollment: encId,
            componentName: entry.componentName,
            marksObtained: entry.marksObtained,
            date: new Date()
          });
        }
      });
    }

    await gradebook.save();
    res.json({ message: 'Grades entered successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Get gradebook for a course
// @route   GET /api/gradebook/:courseId
exports.getCourseGradebook = async (req, res, next) => {
  try {
    const term = req.query.academicTerm || 'CURRENT';

    const access = await canUserAccessCourseGradebook(req.user, req.params.courseId);
    if (!access.allowed) {
      return res.status(access.status || 403).json({ message: access.message });
    }

    let gradebook = await Gradebook.findOne({ course: req.params.courseId, academicTerm: term })
      .populate('course', 'name code')
      .populate('grades.student', 'name email')
      .populate('grades.enrollment', 'attemptNumber isBacklog status academicTerm');

    if (!gradebook && term === 'CURRENT') {
      gradebook = await Gradebook.findOne({ course: req.params.courseId })
        .populate('course', 'name code')
        .populate('grades.student', 'name email')
        .populate('grades.enrollment', 'attemptNumber isBacklog status academicTerm');
    }

    if (!gradebook) {
      return res.status(404).json({ message: 'Gradebook not set up for this course' });
    }

    // Calculate final grades per student / enrollment attempt
    const studentMap = {};
    gradebook.grades.forEach(g => {
      if (!g.student) return;
      const sid = g.student._id ? g.student._id.toString() : g.student.toString();
      const encId = g.enrollment ? (g.enrollment._id ? g.enrollment._id.toString() : g.enrollment.toString()) : sid;
      const key = `${sid}_${encId}`;

      if (!studentMap[key]) {
        studentMap[key] = {
          student: g.student,
          enrollment: g.enrollment || null,
          components: {},
          totalWeighted: 0
        };
      }
      const component = gradebook.components.find(c => c.name === g.componentName);
      if (component) {
        const percentage = (g.marksObtained / component.maxMarks) * component.weightage;
        studentMap[key].components[g.componentName] = {
          obtained: g.marksObtained,
          max: component.maxMarks,
          weightage: component.weightage,
          weighted: parseFloat(percentage.toFixed(2))
        };
        studentMap[key].totalWeighted = Object.values(studentMap[key].components)
          .reduce((sum, c) => sum + c.weighted, 0);
      }
    });

    // Calculate letter grades
    const calculateLetterGrade = (pct) => {
      if (pct >= 90) return 'A+';
      if (pct >= 80) return 'A';
      if (pct >= 70) return 'B';
      if (pct >= 60) return 'C';
      if (pct >= 50) return 'D';
      return 'F';
    };

    const studentGrades = Object.values(studentMap).map(s => ({
      ...s,
      totalWeighted: parseFloat(s.totalWeighted.toFixed(2)),
      letterGrade: calculateLetterGrade(s.totalWeighted)
    }));

    // Class statistics
    const totals = studentGrades.map(s => s.totalWeighted);
    const stats = totals.length ? {
      average: parseFloat((totals.reduce((a, b) => a + b, 0) / totals.length).toFixed(2)),
      highest: Math.max(...totals),
      lowest: Math.min(...totals),
      totalStudents: totals.length,
      passCount: totals.filter(t => t >= 50).length,
      failCount: totals.filter(t => t < 50).length
    } : null;

    res.json({
      gradebook: {
        course: gradebook.course,
        academicTerm: gradebook.academicTerm,
        components: gradebook.components
      },
      studentGrades,
      stats
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get a student's grades for a course
// @route   GET /api/gradebook/:courseId/student/:studentId
exports.getStudentGrades = async (req, res, next) => {
  try {
    const { courseId, studentId } = req.params;
    let targetEnrollment = null;

    if (req.user.role === 'student') {
      if (req.user._id.toString() !== studentId.toString()) {
        return res.status(403).json({ message: 'Access denied. You can only view your own grades.' });
      }

      // Historical & Active enrollment check: student must have an Enrollment record (active or completed)
      const enrollments = await Enrollment.find({
        student: req.user._id,
        course: courseId,
        status: { $in: ['active', 'completed'] }
      }).sort({ attemptNumber: -1 });

      if (!enrollments || enrollments.length === 0) {
        return res.status(403).json({ message: 'Access denied. You are not enrolled in this course.' });
      }

      if (req.query.enrollmentId) {
        const explicitEnc = await Enrollment.findById(req.query.enrollmentId);
        if (!explicitEnc) {
          return res.status(404).json({ message: 'Enrollment record not found' });
        }
        if (explicitEnc.student.toString() !== studentId.toString()) {
          return res.status(403).json({ message: 'Access denied. Enrollment belongs to another student.' });
        }
        if (explicitEnc.course.toString() !== courseId.toString()) {
          return res.status(403).json({ message: 'Access denied. Enrollment belongs to another course.' });
        }
        targetEnrollment = explicitEnc;
      }
      if (!targetEnrollment) {
        targetEnrollment = enrollments.find(e => e.status === 'active') || enrollments[0];
      }
    } else {
      // Professor / Admin authorization check
      const access = await canUserAccessCourseGradebook(req.user, courseId);
      if (!access.allowed) {
        return res.status(access.status || 403).json({ message: access.message });
      }

      const targetStudent = await User.findById(studentId);
      if (!targetStudent) {
        return res.status(404).json({ message: 'Student not found' });
      }

      const enrollments = await Enrollment.find({
        student: studentId,
        course: courseId,
        status: { $in: ['active', 'completed'] }
      }).sort({ attemptNumber: -1 });

      if (req.query.enrollmentId) {
        const explicitEnc = await Enrollment.findById(req.query.enrollmentId);
        if (!explicitEnc) {
          return res.status(404).json({ message: 'Enrollment record not found' });
        }
        if (explicitEnc.student.toString() !== studentId.toString()) {
          return res.status(403).json({ message: 'Access denied. Enrollment belongs to another student.' });
        }
        if (explicitEnc.course.toString() !== courseId.toString()) {
          return res.status(403).json({ message: 'Access denied. Enrollment belongs to another course.' });
        }
        targetEnrollment = explicitEnc;
      }
      if (!targetEnrollment && enrollments.length > 0) {
        targetEnrollment = enrollments.find(e => e.status === 'active') || enrollments[0];
      }
    }

    const term = req.query.academicTerm || (targetEnrollment ? targetEnrollment.academicTerm : null) || 'CURRENT';

    let gradebook = await Gradebook.findOne({ course: courseId, academicTerm: term })
      .populate('course', 'name code');

    if (!gradebook) {
      gradebook = await Gradebook.findOne({ course: courseId })
        .populate('course', 'name code');
    }

    if (!gradebook) {
      return res.status(404).json({ message: 'Gradebook not found' });
    }

    const studentGrades = gradebook.grades.filter(g => {
      if (!g.student || g.student.toString() !== studentId.toString()) return false;
      if (targetEnrollment && g.enrollment) {
        return g.enrollment.toString() === targetEnrollment._id.toString();
      }
      return true;
    });

    let totalWeighted = 0;
    const breakdown = gradebook.components.map(comp => {
      const entry = studentGrades.find(g => g.componentName === comp.name);
      const obtained = entry ? entry.marksObtained : 0;
      const weighted = (obtained / comp.maxMarks) * comp.weightage;
      totalWeighted += weighted;
      return {
        name: comp.name,
        obtained,
        maxMarks: comp.maxMarks,
        weightage: comp.weightage,
        weighted: parseFloat(weighted.toFixed(2))
      };
    });

    const calculateLetterGrade = (pct) => {
      if (pct >= 90) return 'A+';
      if (pct >= 80) return 'A';
      if (pct >= 70) return 'B';
      if (pct >= 60) return 'C';
      if (pct >= 50) return 'D';
      return 'F';
    };

    res.json({
      course: gradebook.course,
      academicTerm: gradebook.academicTerm,
      enrollment: targetEnrollment ? {
        _id: targetEnrollment._id,
        attemptNumber: targetEnrollment.attemptNumber,
        isBacklog: targetEnrollment.isBacklog,
        academicTerm: targetEnrollment.academicTerm,
        status: targetEnrollment.status
      } : null,
      breakdown,
      totalWeighted: parseFloat(totalWeighted.toFixed(2)),
      letterGrade: calculateLetterGrade(totalWeighted)
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Bulk enter grades for a course component
// @route   POST /api/gradebook/:courseId/grades/bulk
exports.enterBulkGrades = async (req, res, next) => {
  try {
    const { grades, componentName, academicTerm } = req.body;
    const term = academicTerm || req.query.academicTerm || 'CURRENT';

    const access = await canUserAccessCourseGradebook(req.user, req.params.courseId);
    if (!access.allowed) {
      return res.status(access.status || 403).json({ success: false, message: access.message });
    }

    let gradebook = await Gradebook.findOne({ course: req.params.courseId, academicTerm: term });
    if (!gradebook && term === 'CURRENT') {
      gradebook = await Gradebook.findOne({ course: req.params.courseId });
    }
    if (!gradebook) {
      return res.status(404).json({ success: false, message: 'Gradebook not found. Set up components first.' });
    }

    if (!componentName) {
      return res.status(400).json({ success: false, message: 'componentName is required' });
    }

    const component = gradebook.components.find(c => c.name === componentName);
    if (!component) {
      return res.status(400).json({ success: false, message: `Component "${componentName}" not found in gradebook.` });
    }

    if (!Array.isArray(grades)) {
      return res.status(400).json({ success: false, message: 'grades must be an array' });
    }

    const errors = [];
    const seenStudents = new Set();

    // Check duplicate student IDs in submission
    for (let i = 0; i < grades.length; i++) {
      const entry = grades[i];
      if (!entry || !entry.student) {
        errors.push({ index: i, message: 'Student ID is required' });
      } else {
        const sidStr = entry.student.toString();
        if (seenStudents.has(sidStr)) {
          errors.push({ index: i, student: sidStr, message: `Duplicate student ID ${sidStr} in bulk request` });
        }
        seenStudents.add(sidStr);
      }
    }

    // Batch load active enrollments for verification
    const studentIds = grades.map(g => g?.student).filter(Boolean);
    const explicitEnrollmentIds = grades.map(g => g?.enrollment).filter(Boolean);

    const activeEnrollments = await Enrollment.find({
      student: { $in: studentIds },
      course: req.params.courseId,
      status: 'active'
    });

    const activeEnrollmentByStudent = new Map();
    const enrollmentById = new Map();

    activeEnrollments.forEach(e => {
      activeEnrollmentByStudent.set(e.student.toString(), e);
      enrollmentById.set(e._id.toString(), e);
    });

    // Also fetch any explicit enrollment IDs passed in payload that might not be active
    if (explicitEnrollmentIds.length > 0) {
      const explicitEnrollments = await Enrollment.find({
        _id: { $in: explicitEnrollmentIds }
      });
      explicitEnrollments.forEach(e => {
        enrollmentById.set(e._id.toString(), e);
      });
    }

    // Row-by-row authoritative validation BEFORE writing anything
    for (let i = 0; i < grades.length; i++) {
      const entry = grades[i];
      if (!entry) continue;

      const sidStr = entry.student ? entry.student.toString() : '';
      let enc = null;

      if (entry.enrollment) {
        enc = enrollmentById.get(entry.enrollment.toString());
      } else {
        enc = activeEnrollmentByStudent.get(sidStr);
      }

      if (!enc) {
        errors.push({ index: i, student: sidStr, message: `Enrollment is not active or does not exist for student ${sidStr}.` });
        continue;
      }

      if (enc.student.toString() !== sidStr) {
        errors.push({ index: i, student: sidStr, enrollment: enc._id, message: `Enrollment ${enc._id} does not belong to student ${sidStr}.` });
        continue;
      }

      if (enc.course.toString() !== req.params.courseId.toString()) {
        errors.push({ index: i, student: sidStr, enrollment: enc._id, message: `Enrollment ${enc._id} belongs to a different course.` });
        continue;
      }

      if (enc.status !== 'active') {
        errors.push({ index: i, student: sidStr, enrollment: enc._id, message: `Enrollment ${enc._id} status is '${enc.status}', must be 'active'.` });
        continue;
      }

      if (entry.marksObtained === undefined || entry.marksObtained === null || entry.marksObtained === '') {
        errors.push({ index: i, student: sidStr, message: 'Marks obtained is required' });
        continue;
      }

      const marks = Number(entry.marksObtained);
      if (isNaN(marks)) {
        errors.push({ index: i, student: sidStr, message: 'Marks obtained must be numeric' });
        continue;
      }

      if (marks < 0) {
        errors.push({ index: i, student: sidStr, message: 'Marks obtained cannot be negative' });
        continue;
      }

      if (marks > component.maxMarks) {
        errors.push({ index: i, student: sidStr, message: `Marks obtained (${marks}) exceeds maximum allowed (${component.maxMarks})` });
        continue;
      }

      // Attach verified enrollment record
      entry._verifiedEnrollmentId = enc._id;
    }

    // All-or-nothing validation failure
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed. No grades were saved.',
        errors
      });
    }

    // Atomic update/insert to gradebook
    let insertedCount = 0;
    let updatedCount = 0;

    grades.forEach(entry => {
      const sidStr = entry.student.toString();
      const encIdStr = entry._verifiedEnrollmentId.toString();
      const marks = Number(entry.marksObtained);

      const existingIdx = gradebook.grades.findIndex(
        g => g.student && g.student.toString() === sidStr
          && g.enrollment && g.enrollment.toString() === encIdStr
          && g.componentName === componentName
      );

      if (existingIdx >= 0) {
        gradebook.grades[existingIdx].marksObtained = marks;
        gradebook.grades[existingIdx].date = new Date();
        updatedCount++;
      } else {
        gradebook.grades.push({
          student: entry.student,
          enrollment: entry._verifiedEnrollmentId,
          componentName: componentName,
          marksObtained: marks,
          date: new Date()
        });
        insertedCount++;
      }
    });

    await gradebook.save();

    res.json({
      success: true,
      message: `Successfully saved ${grades.length} grades.`,
      insertedCount,
      updatedCount,
      totalProcessed: grades.length
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Export gradebook template / current marks as Excel (.xlsx)
// @route   GET /api/gradebook/:courseId/template
exports.exportGradebookTemplate = async (req, res, next) => {
  try {
    const { componentName, academicTerm, includeExisting } = req.query;
    const term = academicTerm || 'CURRENT';

    const access = await canUserAccessCourseGradebook(req.user, req.params.courseId);
    if (!access.allowed) {
      return res.status(access.status || 403).json({ message: access.message });
    }

    const course = access.course;

    let gradebook = await Gradebook.findOne({ course: req.params.courseId, academicTerm: term });
    if (!gradebook && term === 'CURRENT') {
      gradebook = await Gradebook.findOne({ course: req.params.courseId });
    }
    if (!gradebook) {
      return res.status(404).json({ message: 'Gradebook not found for this course' });
    }

    const isAllExport = componentName === 'ALL' || componentName === 'All Components';
    const compName = isAllExport ? null : (componentName || gradebook.components[0]?.name);
    const compObj = isAllExport ? null : gradebook.components.find(c => c.name === compName);

    if (!isAllExport && !compObj) {
      return res.status(400).json({ message: `Component "${compName}" not found` });
    }

    // Fetch active enrollments
    const activeEnrollments = await Enrollment.find({
      course: req.params.courseId,
      status: 'active'
    }).populate({
      path: 'student',
      select: 'name email enrollmentNumber currentSemester'
    });

    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'AI Multilingual Lecture System';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet(isAllExport ? 'Full Gradebook' : 'Grade Template');

    activeEnrollments.sort((a, b) => {
      const nameA = a.student?.name || '';
      const nameB = b.student?.name || '';
      return nameA.localeCompare(nameB);
    });

    const isIncludeExisting = includeExisting === 'true' || includeExisting === true;

    let filename = '';

    if (isAllExport) {
      worksheet.mergeCells('A1:E1');
      worksheet.getCell('A1').value = `Course: ${course.name} (${course.code}) | Full Gradebook Export (All Components)`;
      worksheet.getCell('A1').font = { bold: true, size: 12, color: { argb: '1E3A8A' } };

      const headers = ['Enrollment Number', 'Student Name', ...gradebook.components.map(c => `${c.name} (Max: ${c.maxMarks}, Wt: ${c.weightage}%)`), 'Total Weighted (%)', 'Final Grade'];
      const headerRow = worksheet.getRow(3);
      headerRow.values = headers;
      headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '1E3A8A' }
      };

      worksheet.getColumn(1).width = 25;
      worksheet.getColumn(2).width = 30;
      gradebook.components.forEach((_, idx) => {
        worksheet.getColumn(3 + idx).width = 28;
      });
      worksheet.getColumn(3 + gradebook.components.length).width = 20;
      worksheet.getColumn(4 + gradebook.components.length).width = 15;

      activeEnrollments.forEach(enc => {
        if (!enc.student) return;
        let totalWeighted = 0;
        const rowMarks = gradebook.components.map(c => {
          const gradeEntry = gradebook.grades.find(
            g => g.student && g.student.toString() === enc.student._id.toString()
              && g.enrollment && g.enrollment.toString() === enc._id.toString()
              && g.componentName === c.name
          );
          if (gradeEntry !== undefined && gradeEntry.marksObtained !== undefined && gradeEntry.marksObtained !== null) {
            const marks = gradeEntry.marksObtained;
            const weighted = (marks / c.maxMarks) * c.weightage;
            totalWeighted += weighted;
            return marks;
          }
          return '';
        });

        const pctVal = parseFloat(totalWeighted.toFixed(2));
        let letterGrade = 'F';
        if (pctVal >= 90) letterGrade = 'A+';
        else if (pctVal >= 80) letterGrade = 'A';
        else if (pctVal >= 70) letterGrade = 'B';
        else if (pctVal >= 60) letterGrade = 'C';
        else if (pctVal >= 50) letterGrade = 'D';

        worksheet.addRow([
          enc.student.enrollmentNumber || 'N/A',
          enc.student.name || 'N/A',
          ...rowMarks,
          `${pctVal}%`,
          letterGrade
        ]);
      });

      filename = `${course.code}_Full_Gradebook.xlsx`;
    } else {
      worksheet.mergeCells('A1:C1');
      worksheet.getCell('A1').value = `Course: ${course.name} (${course.code}) | Component: ${compObj.name} (Max: ${compObj.maxMarks})`;
      worksheet.getCell('A1').font = { bold: true, size: 12, color: { argb: '1E3A8A' } };

      const headerRow = worksheet.getRow(3);
      headerRow.values = ['Enrollment Number', 'Student Name', `Marks Obtained (Max: ${compObj.maxMarks})`];
      headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '1E3A8A' }
      };

      worksheet.getColumn(1).width = 25;
      worksheet.getColumn(2).width = 30;
      worksheet.getColumn(3).width = 30;

      activeEnrollments.forEach(enc => {
        if (!enc.student) return;
        let existingMark = '';
        if (isIncludeExisting) {
          const gradeEntry = gradebook.grades.find(
            g => g.student && g.student.toString() === enc.student._id.toString()
              && g.enrollment && g.enrollment.toString() === enc._id.toString()
              && g.componentName === compObj.name
          );
          if (gradeEntry !== undefined && gradeEntry.marksObtained !== undefined && gradeEntry.marksObtained !== null) {
            existingMark = gradeEntry.marksObtained;
          }
        }

        worksheet.addRow([
          enc.student.enrollmentNumber || 'N/A',
          enc.student.name || 'N/A',
          existingMark
        ]);
      });

      filename = `${course.code}_${compObj.name.replace(/[^a-z0-9]/gi, '_')}_${isIncludeExisting ? 'CurrentMarks' : 'Template'}.xlsx`;
    }

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
};

// @desc    Preview Excel/CSV grade import before saving
// @route   POST /api/gradebook/:courseId/preview-import
exports.previewGradebookImport = async (req, res, next) => {
  try {
    const { componentName, academicTerm } = req.body;
    const term = academicTerm || req.query.academicTerm || 'CURRENT';

    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, message: 'Please upload an Excel (.xlsx) or CSV (.csv) file' });
    }

    const access = await canUserAccessCourseGradebook(req.user, req.params.courseId);
    if (!access.allowed) {
      return res.status(access.status || 403).json({ success: false, message: access.message });
    }

    const course = access.course;

    let gradebook = await Gradebook.findOne({ course: req.params.courseId, academicTerm: term });
    if (!gradebook && term === 'CURRENT') {
      gradebook = await Gradebook.findOne({ course: req.params.courseId });
    }
    if (!gradebook) {
      return res.status(404).json({ success: false, message: 'Gradebook not found for this course' });
    }

    if (!componentName) {
      return res.status(400).json({ success: false, message: 'componentName is required' });
    }

    const component = gradebook.components.find(c => c.name === componentName);
    if (!component) {
      return res.status(400).json({ success: false, message: `Component "${componentName}" not found in gradebook.` });
    }

    // Load active enrollments for this course
    const activeEnrollments = await Enrollment.find({
      course: req.params.courseId,
      status: 'active'
    }).populate({
      path: 'student',
      select: 'name email enrollmentNumber'
    });

    const activeEnrollmentByEnrNum = new Map();
    activeEnrollments.forEach(e => {
      if (e.student && e.student.enrollmentNumber) {
        activeEnrollmentByEnrNum.set(e.student.enrollmentNumber.trim().toUpperCase(), e);
      }
    });

    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();

    const originalName = req.file.originalname || '';
    const isCsv = originalName.toLowerCase().endsWith('.csv') || req.file.mimetype === 'text/csv';

    if (isCsv) {
      const { Readable } = require('stream');
      const stream = Readable.from(req.file.buffer);
      await workbook.csv.read(stream);
    } else {
      await workbook.xlsx.load(req.file.buffer);
    }

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      return res.status(400).json({ success: false, message: 'Spreadsheet contains no worksheets' });
    }

    let enrColIdx = -1;
    let nameColIdx = -1;
    let marksColIdx = -1;
    let headerRowIndex = -1;

    // Detect header row
    worksheet.eachRow((row, rowNumber) => {
      if (headerRowIndex !== -1) return;
      const values = Array.isArray(row.values) ? row.values.map(v => (v ? String(v).trim().toLowerCase() : '')) : [];
      values.forEach((v, colIdx) => {
        if (v.includes('enrollment') || v.includes('enrollment number') || v.includes('enrollmentno') || v.includes('roll')) {
          enrColIdx = colIdx;
          headerRowIndex = rowNumber;
        }
        if (v.includes('name') || v.includes('student name')) {
          nameColIdx = colIdx;
        }
        if (v.includes('mark') || v.includes('marks') || v.includes('score') || v.includes('obtained')) {
          marksColIdx = colIdx;
        }
      });
    });

    // Fallbacks if header labels were not matched by keywords
    if (enrColIdx === -1) enrColIdx = 1;
    if (nameColIdx === -1) nameColIdx = 2;
    if (marksColIdx === -1) marksColIdx = 3;

    const previewRows = [];
    const seenEnrNums = new Set();
    let validCount = 0;
    let errorCount = 0;

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber <= headerRowIndex) return; // Skip title / header rows

      const getCellVal = (colIdx) => {
        const val = row.getCell(colIdx).value;
        if (val === null || val === undefined) return '';
        if (typeof val === 'object' && val.result !== undefined) return String(val.result).trim();
        if (typeof val === 'object' && val.text !== undefined) return String(val.text).trim();
        return String(val).trim();
      };

      const rawEnrNum = getCellVal(enrColIdx);
      const rawName = getCellVal(nameColIdx);
      const rawMarks = getCellVal(marksColIdx);

      // Skip completely empty rows
      if (!rawEnrNum && !rawName && !rawMarks) return;

      const normEnrNum = rawEnrNum.toUpperCase();
      let status = 'Valid';
      let reason = null;

      if (!rawEnrNum) {
        status = 'Error';
        reason = 'Enrollment Number is required';
      } else if (seenEnrNums.has(normEnrNum)) {
        status = 'Error';
        reason = `Duplicate Enrollment Number "${rawEnrNum}" in file`;
      } else {
        seenEnrNums.add(normEnrNum);
      }

      let activeEnc = null;
      if (status === 'Valid') {
        activeEnc = activeEnrollmentByEnrNum.get(normEnrNum);
        if (!activeEnc) {
          status = 'Error';
          reason = `Enrollment Number "${rawEnrNum}" is not actively enrolled in this course`;
        }
      }

      let marksVal = null;
      if (status === 'Valid' && rawMarks !== '') {
        const num = Number(rawMarks);
        if (isNaN(num)) {
          status = 'Error';
          reason = `Marks "${rawMarks}" must be a valid number`;
        } else if (num < 0) {
          status = 'Error';
          reason = `Marks (${num}) cannot be negative`;
        } else if (num > component.maxMarks) {
          status = 'Error';
          reason = `Marks (${num}) exceed maximum allowed (${component.maxMarks})`;
        } else {
          marksVal = num;
        }
      }

      if (status === 'Valid') {
        validCount++;
      } else {
        errorCount++;
      }

      previewRows.push({
        rowNumber,
        enrollmentNumber: rawEnrNum,
        studentName: activeEnc?.student?.name || rawName || 'Unknown',
        studentId: activeEnc?.student?._id || null,
        enrollmentId: activeEnc?._id || null,
        marks: marksVal,
        rawMarks: rawMarks,
        status,
        reason
      });
    });

    const canImport = errorCount === 0 && validCount > 0;

    res.json({
      success: true,
      canImport,
      summary: {
        totalRows: previewRows.length,
        validRows: validCount,
        errorRows: errorCount
      },
      course: {
        _id: course._id,
        name: course.name,
        code: course.code
      },
      component: {
        name: component.name,
        maxMarks: component.maxMarks
      },
      previewRows
    });
  } catch (error) {
    next(error);
  }
};



