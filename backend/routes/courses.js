const express = require('express');
const router = express.Router();
const Course = require('../models/Course');
const { paginate } = require('../utils/pagination');
const auth = require('../middleware/auth');

// @route   GET /api/courses
// @desc    Get all courses (paginated, with filters)
// @access  Private (any role)
const mongoose = require('mongoose');
const { getStudentEnrolledCourseIds, isStudentEnrolledInCourse } = require('../utils/enrollmentHelper');

// @route   GET /api/courses
// @desc    Get all courses (paginated, with filters)
// @access  Private (any role)
router.get('/', auth, async (req, res, next) => {
  try {
    const { department, semester, search, page, limit } = req.query;
    const filter = {};

    // For students, course access MUST be strictly based on Enrollment (Single Source of Truth)
    if (req.user.role === 'student') {
      const enrolledCourseIds = await getStudentEnrolledCourseIds(req.user._id, req.user);
      if (enrolledCourseIds.length === 0) {
        return res.json({
          data: [],
          pagination: { total: 0, totalItems: 0, currentPage: 1, totalPages: 0, limit: parseInt(limit) || 20, hasNextPage: false, hasPrevPage: false }
        });
      }
      filter._id = { $in: enrolledCourseIds.map(id => new mongoose.Types.ObjectId(id)) };
    } else if (req.user.role === 'university_admin' || req.user.role === 'universityadmin') {
      let uniId = req.user.university?._id || req.user.university;
      if (!uniId) {
        const University = require('../models/University');
        const uni = await University.findOne({ admin: req.user._id });
        if (uni) uniId = uni._id;
      }
      const Institution = require('../models/Institution');
      const Department = require('../models/Department');
      const insts = uniId ? await Institution.find({ university: uniId }).select('_id') : [];
      const depts = insts.length ? await Department.find({ institution: { $in: insts.map(i => i._id) } }).select('_id') : [];
      const deptIds = depts.map(d => d._id);
      if (department) {
        if (deptIds.some(id => id.toString() === department.toString())) {
          filter.department = department;
        } else {
          filter.department = { $in: [] };
        }
      } else {
        filter.department = { $in: deptIds };
      }
    } else if (req.user.role === 'inst_admin') {
      const instId = req.user.institution?._id || req.user.institution;
      const Department = require('../models/Department');
      const depts = await Department.find({ institution: instId }).select('_id');
      filter.department = { $in: depts.map(d => d._id) };
    } else if (req.user.role === 'dept_admin' || req.user.role === 'academic_administrator' || req.user.role === 'academic_admin') {
      filter.department = req.user.department?._id || req.user.department;
    } else if (req.user.role === 'professor') {
      const userDeptId = req.user.department?._id || req.user.department;
      if (userDeptId) {
        filter.department = userDeptId;
      }
    }

    if (department && !['student', 'dept_admin', 'academic_administrator', 'academic_admin', 'university_admin', 'universityadmin'].includes(req.user.role)) filter.department = department;
    if (semester) filter.semester = parseInt(semester);
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } }
      ];
    }

    const result = await paginate(Course, filter, { page, limit, sort: { name: 1 } }, [
      { path: 'department', select: 'name code' },
      { path: 'professor', select: 'name email professorId' },
      { path: 'professors', select: 'name email professorId' }
    ]);

    res.json({
      data: result.data,
      pagination: { total: result.pagination.totalItems, ...result.pagination }
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/courses/:id
// @desc    Get course by ID
// @access  Private (Authorized users)
router.get('/:id', auth, async (req, res, next) => {
  try {
    const course = await Course.findById(req.params.id)
      .populate('department', 'name code')
      .populate('professor', 'name email professorId')
      .populate('professors', 'name email professorId');
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    if (req.user.role === 'student') {
      const enrolled = await isStudentEnrolledInCourse(req.user._id, course._id, req.user);
      if (!enrolled) {
        return res.status(403).json({ message: 'Access denied. You are not enrolled in this course.' });
      }
    } else if (req.user.role === 'inst_admin') {
      const instId = req.user.institution?._id || req.user.institution;
      const Department = require('../models/Department');
      const dept = await Department.findById(course.department?._id || course.department);
      if (!dept || dept.institution?.toString() !== instId?.toString()) {
        return res.status(403).json({ message: 'Access denied.' });
      }
    } else if (req.user.role === 'dept_admin' || req.user.role === 'academic_administrator' || req.user.role === 'academic_admin') {
      const deptId = req.user.department?._id || req.user.department;
      if (!deptId || (course.department?._id || course.department).toString() !== deptId?.toString()) {
        return res.status(403).json({ message: 'Access denied.' });
      }
    }

    res.json({ data: course });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/courses/:id/students
// @desc    Get officially enrolled students for a course matching course semester & department
// @access  Private (Authorized users)
router.get('/:id/students', auth, async (req, res, next) => {
  try {
    const course = await Course.findById(req.params.id)
      .populate('department', 'name code')
      .populate('professor', 'name email professorId');

    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    // Role-based tenant isolation check
    const userRole = (req.user?.role || '').toLowerCase();
    const courseDeptId = (course.department?._id || course.department)?.toString();

    if (['dept_admin', 'academic_administrator', 'academic_admin'].includes(userRole)) {
      const adminDeptId = (req.user.department?._id || req.user.department)?.toString();
      if (adminDeptId && courseDeptId && adminDeptId !== courseDeptId) {
        return res.status(403).json({ success: false, message: 'Access denied. Course belongs to another department.' });
      }
    }

    const Enrollment = require('../models/Enrollment');
    const User = require('../models/User');

    // 1. Check explicit active enrollments in Enrollment collection
    const activeEnrollments = await Enrollment.find({
      course: course._id,
      status: 'active'
    }).populate({
      path: 'student',
      select: 'name email enrollmentNumber currentSemester division isActive department createdAt',
      populate: { path: 'department', select: 'name code' }
    });

    const enrolledMap = new Map();

    activeEnrollments.forEach(e => {
      // Must match course semester, be active, and match course department
      if (e.student && e.student.isActive !== false && e.student.currentSemester === course.semester) {
        const studentDeptId = (e.student.department?._id || e.student.department)?.toString();
        if (!courseDeptId || !studentDeptId || studentDeptId === courseDeptId) {
          enrolledMap.set(e.student._id.toString(), {
            _id: e.student._id,
            name: e.student.name,
            email: e.student.email,
            enrollmentNumber: e.student.enrollmentNumber || '',
            currentSemester: e.student.currentSemester,
            division: e.division || e.student.division || 'A',
            department: e.student.department,
            createdAt: e.student.createdAt || e.createdAt,
            status: 'Enrolled'
          });
        }
      }
    });

    // 2. Also check students who have this course in User.courses array (strictly matching currentSemester === course.semester)
    const studentsWithCourse = await User.find({
      role: 'student',
      department: course.department?._id || course.department,
      courses: course._id,
      currentSemester: course.semester,
      isActive: { $ne: false }
    }).select('name email enrollmentNumber currentSemester division department createdAt').populate('department', 'name code');

    studentsWithCourse.forEach(s => {
      if (!enrolledMap.has(s._id.toString())) {
        enrolledMap.set(s._id.toString(), {
          _id: s._id,
          name: s.name,
          email: s.email,
          enrollmentNumber: s.enrollmentNumber || '',
          currentSemester: s.currentSemester,
          division: s.division || 'A',
          department: s.department,
          createdAt: s.createdAt,
          status: 'Enrolled'
        });
      }
    });

    // 3. Department compulsory curriculum matching:
    // If no explicit enrollments exist for this course, students in this department
    // whose currentSemester matches the course semester are enrolled in the semester course
    if (enrolledMap.size === 0 && course.department) {
      const anyEnrollmentForCourse = await Enrollment.countDocuments({ course: course._id, status: 'active' });
      const anyUserWithCourse = await User.countDocuments({ courses: course._id, role: 'student' });

      if (anyEnrollmentForCourse === 0 && anyUserWithCourse === 0) {
        const semesterStudents = await User.find({
          role: 'student',
          department: course.department?._id || course.department,
          currentSemester: course.semester,
          isActive: { $ne: false }
        }).select('name email enrollmentNumber currentSemester division department createdAt').populate('department', 'name code');

        semesterStudents.forEach(s => {
          enrolledMap.set(s._id.toString(), {
            _id: s._id,
            name: s.name,
            email: s.email,
            enrollmentNumber: s.enrollmentNumber || '',
            currentSemester: s.currentSemester,
            division: s.division || 'A',
            department: s.department,
            createdAt: s.createdAt,
            status: 'Enrolled'
          });
        });
      }
    }

    const students = Array.from(enrolledMap.values());
    res.json({ success: true, count: students.length, data: students });
  } catch (error) {
    next(error);
  }
});
// @route   POST /api/courses
// @desc    Create a new course
// @access  Private (Professors, Admins)
router.post('/', auth, async (req, res, next) => {
  try {
    const userRole = (req.user?.role || '').toLowerCase();
    const allowedRoles = [
      'super_admin', 'superadmin',
      'university_admin', 'universityadmin',
      'inst_admin', 'institution_admin', 'instadmin',
      'dept_admin', 'department_admin', 'deptadmin',
      'academic_administrator', 'academic_admin', 'academicadmin',
      'professor', 'faculty'
    ];

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({ success: false, message: 'Not authorized to create courses' });
    }
    
    const { name, code, semester, department, professor } = req.body;
    
    // Department resolution & strict scoping
    let targetDepartment = department;
    const isDeptLevel = [
      'academic_administrator', 'academic_admin', 'academicadmin',
      'dept_admin', 'department_admin', 'deptadmin',
      'professor', 'faculty'
    ].includes(userRole);
    
    if (isDeptLevel) {
      let userDeptId = req.user.department?._id || req.user.department;
      if (!userDeptId) {
        const User = require('../models/User');
        const userDoc = await User.findById(req.user._id).select('department');
        userDeptId = userDoc?.department?._id || userDoc?.department;
      }
      
      if (department && userDeptId && department.toString() !== userDeptId.toString()) {
        return res.status(403).json({ success: false, message: 'Not authorized to create courses for another department' });
      }
      targetDepartment = userDeptId || department;
    }
    
    if (!name || !code || !targetDepartment) {
      return res.status(400).json({ success: false, message: 'Name, code, and department are required' });
    }

    // Check if course code already exists
    const existing = await Course.findOne({ code: code.toUpperCase() });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Course with this code already exists' });
    }

    const courseData = {
      name,
      code: code.toUpperCase(),
      semester: parseInt(semester) || 1,
      department: targetDepartment
    };

    let profIds = [];
    if (Array.isArray(req.body.professors)) {
      profIds = req.body.professors.filter(id => id && mongoose.Types.ObjectId.isValid(id));
    } else if (professor && mongoose.Types.ObjectId.isValid(professor)) {
      profIds = [professor];
    }

    if (profIds.length > 0) {
      courseData.professors = profIds;
      courseData.professor = profIds[0];
    }

    const course = await Course.create(courseData);

    if (profIds.length > 0) {
      const User = require('../models/User');
      await User.updateMany({ _id: { $in: profIds } }, { $addToSet: { courses: course._id } });
    }

    await course.populate('department', 'name code');
    await course.populate('professor', 'name email professorId');
    await course.populate('professors', 'name email professorId');

    res.status(201).json({ success: true, data: course, course });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
