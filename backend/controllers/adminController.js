const mongoose = require('mongoose');
const Institution = require('../models/Institution');
const Department = require('../models/Department');
const Course = require('../models/Course');
const User = require('../models/User');
const Lecture = require('../models/Lecture');
const Quiz = require('../models/Quiz');
const QuizResult = require('../models/QuizResult');
const Assignment = require('../models/Assignment');
const University = require('../models/University');
const AttendanceSession = require('../models/AttendanceSession');
const AttendanceRecord = require('../models/AttendanceRecord');
const { recordCriticalEvent } = require('../services/auditService');

// Helper to reliably resolve an institutional admin's institution ID
async function resolveInstAdminInstitution(user) {
  if (!user) return null;
  let instId = user.institution?._id || user.institution;
  if (!instId && user.role === 'inst_admin') {
    const foundInst = await Institution.findOne({
      $or: [
        { admin: user._id },
        ...(user.university ? [{ university: user.university?._id || user.university }] : [])
      ]
    }).sort({ createdAt: -1 });
    if (foundInst) {
      instId = foundInst._id;
      user.institution = foundInst._id;
      await User.findByIdAndUpdate(user._id, { institution: foundInst._id });
    }
  }
  return instId;
}

// ========== INSTITUTIONS ==========

// @desc    Get all institutions
// @route   GET /api/admin/institutions
exports.getInstitutions = async (req, res, next) => {
  try {
    const filter = {};

    if (req.user && req.user.role === 'university_admin') {
      const uniId = req.user.university?._id || req.user.university;
      filter.university = uniId;
    } else if (req.user && req.user.role === 'inst_admin') {
      const instId = await resolveInstAdminInstitution(req.user);
      filter._id = instId || new mongoose.Types.ObjectId();
    } else if (req.query.university) {
      filter.university = req.query.university;
    }

    const institutions = await Institution.aggregate([
      { $match: filter },
      {
        $lookup: {
          from: 'departments',
          localField: '_id',
          foreignField: 'institution',
          as: 'departments'
        }
      },
      {
        $lookup: {
          from: 'universities',
          localField: 'university',
          foreignField: '_id',
          as: 'university'
        }
      },
      {
        $unwind: { path: '$university', preserveNullAndEmptyArrays: true }
      },
      {
        $sort: { name: 1 }
      }
    ]);
    res.json({ data: institutions });
  } catch (error) {
    next(error);
  }
};

// @desc    Create institution
// @route   POST /api/admin/institutions
exports.createInstitution = async (req, res, next) => {
  try {
    const payload = { ...req.body };
    if (req.user && req.user.role === 'university_admin') {
      payload.university = req.user.university?._id || req.user.university;
    }

    const institution = await Institution.create(payload);
    await institution.populate('university', 'name code');
    res.status(201).json({ institution, message: 'Institution created successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Update institution
// @route   PUT /api/admin/institutions/:id
exports.updateInstitution = async (req, res, next) => {
  try {
    const inst = await Institution.findById(req.params.id);
    if (!inst) return res.status(404).json({ message: 'Institution not found' });

    if (req.user && req.user.role === 'university_admin') {
      const uniId = req.user.university?._id || req.user.university;
      if (!inst.university || inst.university.toString() !== uniId?.toString()) {
        return res.status(403).json({ message: 'Access denied: Institution does not belong to your university.' });
      }
      delete req.body.university; // Protect university association
    }

    const institution = await Institution.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    }).populate('university', 'name code');

    res.json({ institution, message: 'Institution updated successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete institution
// @route   DELETE /api/admin/institutions/:id
exports.deleteInstitution = async (req, res, next) => {
  try {
    const inst = await Institution.findById(req.params.id);
    if (!inst) return res.status(404).json({ message: 'Institution not found' });

    if (req.user && req.user.role === 'university_admin') {
      const uniId = req.user.university?._id || req.user.university;
      if (!inst.university || inst.university.toString() !== uniId?.toString()) {
        return res.status(403).json({ message: 'Access denied: Institution does not belong to your university.' });
      }
    }

    await Institution.findByIdAndDelete(req.params.id);

    // Cascade: remove departments, courses, and unset user references
    const departments = await Department.find({ institution: req.params.id });
    const deptIds = departments.map(d => d._id);
    await Course.deleteMany({ department: { $in: deptIds } });
    await Department.deleteMany({ institution: req.params.id });
    await User.updateMany({ institution: req.params.id }, { $unset: { institution: 1, department: 1 } });

    recordCriticalEvent({
      actor: req.user,
      eventFamily: 'DESTRUCTIVE',
      severity: 'HIGH',
      action: 'destructive_operation',
      resource: 'institution',
      resourceId: inst._id,
      description: `Institution deleted: "${inst.name}" (${inst.code}) and all associated departments cascade purged.`,
      changes: { institutionId: inst._id, name: inst.name, code: inst.code },
      ipAddress: req.ip || '',
      userAgent: req.headers ? (req.headers['user-agent'] || '') : '',
      university: inst.university,
      eventScope: req.user?.role === 'super_admin' ? 'PLATFORM' : 'UNIVERSITY'
    }).catch(() => {});

    res.json({ message: 'Institution and related data deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// ========== DEPARTMENTS ==========

// @desc    Get all departments
// @route   GET /api/admin/departments
exports.getDepartments = async (req, res, next) => {
  try {
    const { institution } = req.query;
    const filter = {};

    if (req.user && req.user.role === 'university_admin') {
      const uniId = req.user.university?._id || req.user.university;
      const insts = await Institution.find({ university: uniId }).select('_id');
      const instIds = insts.map(i => i._id);
      if (institution) {
        if (instIds.some(id => id.toString() === institution.toString())) {
          filter.institution = institution;
        } else {
          filter.institution = { $in: [] };
        }
      } else {
        filter.institution = { $in: instIds };
      }
    } else if (req.user && req.user.role === 'inst_admin') {
      const instId = await resolveInstAdminInstitution(req.user);
      filter.institution = instId || new mongoose.Types.ObjectId();
    } else if (req.user && (req.user.role === 'dept_admin' || req.user.role === 'academic_administrator' || req.user.role === 'academic_admin')) {
      const instId = req.user.institution?._id || req.user.institution;
      if (instId) filter.institution = instId;
      if (req.user.department) filter._id = req.user.department?._id || req.user.department;
    } else if (institution) {
      filter.institution = institution;
    }

    const departments = await Department.find(filter)
      .populate('institution', 'name code')
      .sort({ name: 1 });

    // Enhance with courses, professors, and students info
    const enriched = await Promise.all(
      departments.map(async (dept) => {
        // Get all courses in department
        const courses = await Course.find({ department: dept._id })
          .select('_id name code semester')
          .sort({ name: 1 });

        // Get all professors in department
        const professors = await User.find({
          department: dept._id,
          role: 'professor'
        }).select('_id name email');

        // Get student count in department
        const studentsCount = await User.countDocuments({
          department: dept._id,
          role: 'student'
        });

        // Enrich courses with their teaching professors (from lectures)
        const enrichedCourses = await Promise.all(
          courses.map(async (course) => {
            // Find unique professors teaching this course
            const teachingProfs = await Lecture.find({ course: course._id })
              .distinct('uploadedBy');
            
            return {
              ...course.toObject(),
              teachers: professors.filter(p => teachingProfs.includes(p._id.toString()))
            };
          })
        );

        return {
          ...dept.toObject(),
          courses: enrichedCourses,
          professors,
          coursesCount: courses.length,
          professorsCount: professors.length,
          studentsCount
        };
      })
    );

    res.json({ data: enriched });
  } catch (error) {
    next(error);
  }
};

// @desc    Create department
// @route   POST /api/admin/departments
exports.createDepartment = async (req, res, next) => {
  try {
    let { name, code, institution, description } = req.body;
    if (code) code = code.trim().toUpperCase();

    // Infer institution from logged in user if not explicitly supplied
    if (!institution && req.user) {
      if (req.user.institution) {
        institution = req.user.institution._id || req.user.institution;
      }
      if (!institution && req.user.role === 'inst_admin') {
        institution = await resolveInstAdminInstitution(req.user);
      }
    }

    if (!institution) {
      return res.status(400).json({ message: 'Institution is required to create a department' });
    }

    const deptData = { name, code, institution };
    if (description) deptData.description = description;

    // Generate unique departmentId if institution is provided
    const inst = await Institution.findById(institution);
    if (inst) {
      const instCode = inst.code || 'UNK';
      const deptCode = code || 'UNK';
      const count = await Department.countDocuments({ institution });
      deptData.departmentId = `${instCode}-${deptCode}-${String(count + 1).padStart(3, '0')}`;
    }

    const department = await Department.create(deptData);
    await department.populate('institution', 'name code');
    res.status(201).json({ department, message: 'Department created successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Update department
// @route   PUT /api/admin/departments/:id
exports.updateDepartment = async (req, res, next) => {
  try {
    const updateData = { ...req.body };
    if (updateData.code) updateData.code = updateData.code.trim().toUpperCase();

    const department = await Department.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true
    }).populate('institution', 'name code');
    if (!department) return res.status(404).json({ message: 'Department not found' });
    res.json({ department, message: 'Department updated successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete department
// @route   DELETE /api/admin/departments/:id
exports.deleteDepartment = async (req, res, next) => {
  try {
    const department = await Department.findByIdAndDelete(req.params.id);
    if (!department) return res.status(404).json({ message: 'Department not found' });

    // Cascade: remove courses under this department and unset user department references
    await Course.deleteMany({ department: req.params.id });
    await User.updateMany({ department: req.params.id }, { $unset: { department: 1 } });

    res.json({ message: 'Department and related courses deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// ========== COURSES ==========

// @desc    Get all courses
// @route   GET /api/admin/courses
exports.getCourses = async (req, res, next) => {
  try {
    const { department, semester } = req.query;
    const filter = {};

    if (req.user && req.user.role === 'university_admin') {
      const uniId = req.user.university?._id || req.user.university;
      const insts = await Institution.find({ university: uniId }).select('_id');
      const instIds = insts.map(i => i._id);
      const depts = await Department.find({ institution: { $in: instIds } }).select('_id');
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
    } else if (req.user && req.user.role === 'inst_admin') {
      const instId = req.user.institution?._id || req.user.institution;
      const depts = await Department.find({ institution: instId }).select('_id');
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
    } else if (req.user && (req.user.role === 'dept_admin' || req.user.role === 'academic_administrator' || req.user.role === 'academic_admin' || req.user.role === 'professor')) {
      const deptId = req.user.department?._id || req.user.department;
      if (deptId) {
        filter.department = deptId;
      } else if (department) {
        filter.department = department;
      }
    } else if (department) {
      filter.department = department;
    }

    if (semester) filter.semester = parseInt(semester);

    const courses = await Course.find(filter)
      .populate('department', 'name code')
      .populate('professor', 'name email professorId')
      .sort({ name: 1 });

    res.json({ data: courses });
  } catch (error) {
    next(error);
  }
};

// @desc    Create course
// @route   POST /api/admin/courses
exports.createCourse = async (req, res, next) => {
  try {
    const { name, code, department, semester, professor } = req.body;
    const courseData = { name, code, department, semester };
    if (professor) courseData.professor = professor;

    const course = await Course.create(courseData);
    if (professor) {
      await User.findByIdAndUpdate(professor, { $addToSet: { courses: course._id } });
    }
    await course.populate('department', 'name code');
    await course.populate('professor', 'name email professorId');
    res.status(201).json({ course, message: 'Course created successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Update course
// @route   PUT /api/admin/courses/:id
exports.updateCourse = async (req, res, next) => {
  try {
    const existingCourse = await Course.findById(req.params.id);
    if (!existingCourse) return res.status(404).json({ message: 'Course not found' });

    let newProfIds = null;
    if (Array.isArray(req.body.professors)) {
      newProfIds = req.body.professors
        .filter(id => id && mongoose.Types.ObjectId.isValid(id))
        .map(id => id.toString());
    } else if (req.body.professor !== undefined) {
      newProfIds = req.body.professor && mongoose.Types.ObjectId.isValid(req.body.professor)
        ? [req.body.professor.toString()]
        : [];
    }

    const updateData = { ...req.body };
    if (newProfIds !== null) {
      updateData.professors = newProfIds;
      updateData.professor = newProfIds[0] || null;
    }

    const oldSemester = existingCourse.semester;
    const newSemester = req.body.semester !== undefined ? parseInt(req.body.semester, 10) : oldSemester;

    const course = await Course.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true
    })
      .populate('department', 'name code')
      .populate('professor', 'name email professorId')
      .populate('professors', 'name email professorId');

    // Sync User.courses array if faculty assignment changed
    if (newProfIds !== null) {
      const oldProfIds = (existingCourse.professors || []).map(id => id.toString());
      if (existingCourse.professor && !oldProfIds.includes(existingCourse.professor.toString())) {
        oldProfIds.push(existingCourse.professor.toString());
      }

      const removedProfIds = oldProfIds.filter(id => !newProfIds.includes(id));
      const addedProfIds = newProfIds.filter(id => !oldProfIds.includes(id));

      if (removedProfIds.length > 0) {
        await User.updateMany({ _id: { $in: removedProfIds } }, { $pull: { courses: req.params.id } });
      }
      if (addedProfIds.length > 0) {
        await User.updateMany({ _id: { $in: addedProfIds } }, { $addToSet: { courses: req.params.id } });
      }
    }

    // Reconcile enrollments if course semester changed
    if (oldSemester !== undefined && newSemester !== undefined && oldSemester !== newSemester) {
      const Enrollment = require('../models/Enrollment');
      
      // 1. Reconcile active Enrollment records: any student whose currentSemester does not match newSemester
      const activeEnrollments = await Enrollment.find({ course: course._id, status: 'active' }).populate('student', 'currentSemester');
      const incompatibleStudentIds = [];

      for (const enr of activeEnrollments) {
        if (!enr.student || enr.student.currentSemester !== newSemester) {
          incompatibleStudentIds.push(enr.student?._id || enr.student);
        }
      }

      // 2. Also check students who have this course in their courses array with incompatible currentSemester
      const usersWithCourse = await User.find({
        role: 'student',
        courses: course._id,
        currentSemester: { $ne: newSemester }
      }).select('_id');

      usersWithCourse.forEach(u => {
        if (!incompatibleStudentIds.some(id => id.toString() === u._id.toString())) {
          incompatibleStudentIds.push(u._id);
        }
      });

      // 3. Mark incompatible enrollments as dropped so they are no longer active
      if (incompatibleStudentIds.length > 0) {
        await Enrollment.updateMany(
          {
            course: course._id,
            student: { $in: incompatibleStudentIds },
            status: 'active'
          },
          {
            $set: { status: 'dropped' }
          }
        );

        // 4. Pull course from incompatible students' courses array
        await User.updateMany(
          {
            _id: { $in: incompatibleStudentIds },
            courses: course._id
          },
          {
            $pull: { courses: course._id }
          }
        );
      }
    }

    res.json({ course, message: 'Course updated successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete course
// @route   DELETE /api/admin/courses/:id
exports.deleteCourse = async (req, res, next) => {
  try {
    const course = await Course.findByIdAndDelete(req.params.id);
    if (!course) return res.status(404).json({ message: 'Course not found' });
    res.json({ message: 'Course deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// ========== REPORTS / STATS ==========

// @desc    Get dashboard stats
// @route   GET /api/admin/stats
exports.getStats = async (req, res, next) => {
  try {
    const userRole = req.user?.role;
    const instId = req.user?.institution?._id || req.user?.institution;

    const normRole = (userRole || '').toLowerCase();
    if (normRole === 'university_admin' || normRole === 'universityadmin') {
      let uniId = req.user?.university?._id || req.user?.university;
      if (!uniId) {
        const University = require('../models/University');
        const uni = await University.findOne({ admin: req.user._id });
        if (uni) uniId = uni._id;
      }
      if (!uniId && req.query.university) {
        uniId = req.query.university;
      }

      const insts = uniId ? await Institution.find({ university: uniId }).select('_id') : [];
      const instIds = insts.map(i => i._id);
      const depts = instIds.length ? await Department.find({ institution: { $in: instIds } }).select('_id') : [];
      const deptIds = depts.map(d => d._id);
      const courses = deptIds.length ? await Course.find({ department: { $in: deptIds } }).select('_id') : [];
      const courseIds = courses.map(c => c._id);

      const userScopeCriteria = [];
      if (uniId) userScopeCriteria.push({ university: uniId });
      if (instIds.length) userScopeCriteria.push({ institution: { $in: instIds } });
      if (deptIds.length) userScopeCriteria.push({ department: { $in: deptIds } });

      const userScopeFilter = userScopeCriteria.length > 0 ? { $or: userScopeCriteria } : { _id: { $in: [] } };

      const [totalStudents, totalProfessors, totalCourses, totalLectures, totalQuizzes] = await Promise.all([
        User.countDocuments({
          role: 'student',
          ...userScopeFilter
        }),
        User.countDocuments({
          role: 'professor',
          ...userScopeFilter
        }),
        courses.length,
        courseIds.length ? Lecture.countDocuments({ course: { $in: courseIds } }) : 0,
        courseIds.length ? Quiz.countDocuments({ course: { $in: courseIds } }) : 0
      ]);

      let attendanceAvg = 0;
      let totalPresent = 0;
      let totalRecords = 0;

      if (instIds.length > 0 || courseIds.length > 0) {
        const sessionQueryCriteria = [];
        if (instIds.length > 0) sessionQueryCriteria.push({ institution: { $in: instIds } });
        if (courseIds.length > 0) sessionQueryCriteria.push({ course: { $in: courseIds } });

        const sessions = await AttendanceSession.find({
          $or: sessionQueryCriteria,
          status: { $in: ['CONDUCTED', 'conducted', 'ACTIVE', 'active', 'COMPLETED', 'completed'] }
        }).select('_id');
        const sessionIds = sessions.map(s => s._id);

        if (sessionIds.length > 0) {
          const [presCount, recCount] = await Promise.all([
            AttendanceRecord.countDocuments({ session: { $in: sessionIds }, status: { $in: ['PRESENT', 'present'] } }),
            AttendanceRecord.countDocuments({ session: { $in: sessionIds } })
          ]);
          totalPresent += presCount;
          totalRecords += recCount;
        }

        // Also check Attendance (legacy/direct model) for courses belonging to this university
        if (courseIds.length > 0) {
          const Attendance = require('../models/Attendance');
          const legacyDocs = await Attendance.find({ course: { $in: courseIds } }).select('students');
          for (const doc of legacyDocs) {
            if (Array.isArray(doc.students)) {
              for (const s of doc.students) {
                totalRecords++;
                const st = (s.status || '').toLowerCase();
                if (st === 'present' || st === 'late') {
                  totalPresent++;
                }
              }
            }
          }
        }

        attendanceAvg = totalRecords > 0 ? Number(((totalPresent / totalRecords) * 100).toFixed(1)) : 0;
      }

      const resourceService = require('../services/resourceService');
      const storageUsed = uniId ? await resourceService.getActualStorageUsage({ level: 'UNIVERSITY', id: uniId }) : 0;

      return res.json({
        totalInstitutions: instIds.length,
        institutions: instIds.length,
        totalDepartments: deptIds.length,
        departments: deptIds.length,
        totalStudents,
        students: totalStudents,
        totalProfessors,
        professors: totalProfessors,
        totalCourses,
        courses: totalCourses,
        totalLectures,
        lectures: totalLectures,
        totalQuizzes,
        quizzes: totalQuizzes,
        attendanceAvg,
        storageUsed
      });
    }

    if (userRole === 'inst_admin' || (userRole === 'dept_admin' && instId)) {
      const totalDepartments = await Department.countDocuments({ institution: instId });

      const depts = await Department.find({ institution: instId }).select('_id');
      const deptIds = depts.map(d => d._id);

      const [totalStudents, totalProfessors, totalDeptAdmins, totalInstAdmins, totalUsers] = await Promise.all([
        User.countDocuments({ institution: instId, role: 'student' }),
        User.countDocuments({ institution: instId, role: 'professor' }),
        User.countDocuments({ institution: instId, role: 'dept_admin' }),
        User.countDocuments({ institution: instId, role: 'inst_admin' }),
        User.countDocuments({ institution: instId })
      ]);

      const courses = deptIds.length ? await Course.find({ department: { $in: deptIds } }).select('_id') : [];
      const courseIds = courses.map(c => c._id);
      const totalCourses = courses.length;

      const [totalLectures, totalAssignments, totalQuizzes] = await Promise.all([
        courseIds.length ? Lecture.countDocuments({ course: { $in: courseIds } }) : 0,
        courseIds.length ? Assignment.countDocuments({ course: { $in: courseIds } }) : 0,
        courseIds.length ? Quiz.countDocuments({ course: { $in: courseIds } }) : 0
      ]);

      const quizzes = courseIds.length ? await Quiz.find({ course: { $in: courseIds } }).select('_id') : [];
      const quizIds = quizzes.map(q => q._id);
      const totalQuizResults = quizIds.length ? await QuizResult.countDocuments({ quiz: { $in: quizIds } }) : 0;

      const resourceService = require('../services/resourceService');
      const storageUsed = await resourceService.getActualStorageUsage({ level: 'INSTITUTION', id: instId });
      const meteredAIUsed = await resourceService.getActualMeteredAIUsage({ level: 'INSTITUTION', id: instId });

      return res.json({
        totalUsers,
        totalStudents,
        totalProfessors,
        totalDeptAdmins,
        totalInstAdmins,
        totalInstitutions: 1,
        totalDepartments,
        totalCourses,
        totalLectures,
        totalAssignments,
        totalQuizzes,
        totalQuizResults,
        departments: totalDepartments,
        courses: totalCourses,
        students: totalStudents,
        professors: totalProfessors,
        lectures: totalLectures,
        assignments: totalAssignments,
        quizzes: totalQuizzes,
        storageUsed,
        meteredAIUsed
      });
    }

    // Super admin global stats (scoped to active universities)
    const activeUniversities = await University.find().select('_id');
    const activeUniIds = activeUniversities.map(u => u._id);

    const validInsts = activeUniIds.length ? await Institution.find({ university: { $in: activeUniIds } }).select('_id') : [];
    const validInstIds = validInsts.map(i => i._id);

    const validDepts = validInstIds.length ? await Department.find({ institution: { $in: validInstIds } }).select('_id') : [];
    const validDeptIds = validDepts.map(d => d._id);

    const validCourses = validDeptIds.length ? await Course.find({ department: { $in: validDeptIds } }).select('_id') : [];
    const validCourseIds = validCourses.map(c => c._id);

    const resourceService = require('../services/resourceService');
    const [
      totalStudents,
      totalProfessors,
      totalDeptAdmins,
      totalInstAdmins,
      totalSuperAdmins,
      totalUniAdmins,
      totalLectures,
      totalQuizzes,
      totalQuizResults,
      storageUsed,
      meteredAIUsed
    ] = await Promise.all([
      User.countDocuments({
        role: 'student',
        $or: [
          { university: { $in: activeUniIds } },
          { institution: { $in: validInstIds } },
          { department: { $in: validDeptIds } }
        ]
      }),
      User.countDocuments({
        role: 'professor',
        $or: [
          { university: { $in: activeUniIds } },
          { institution: { $in: validInstIds } },
          { department: { $in: validDeptIds } }
        ]
      }),
      validDeptIds.length ? User.countDocuments({ role: 'dept_admin', department: { $in: validDeptIds } }) : 0,
      validInstIds.length ? User.countDocuments({ role: 'inst_admin', institution: { $in: validInstIds } }) : 0,
      User.countDocuments({ role: 'super_admin' }),
      activeUniIds.length ? User.countDocuments({ role: 'university_admin', university: { $in: activeUniIds } }) : 0,
      validCourseIds.length ? Lecture.countDocuments({ course: { $in: validCourseIds } }) : 0,
      validCourseIds.length ? Quiz.countDocuments({ course: { $in: validCourseIds } }) : 0,
      validCourseIds.length ? QuizResult.countDocuments({ course: { $in: validCourseIds } }) : 0,
      resourceService.getActualStorageUsage({ level: 'SUPER_ADMIN' }),
      resourceService.getActualMeteredAIUsage({ level: 'SUPER_ADMIN' })
    ]);

    const totalUsers = totalStudents + totalProfessors + totalDeptAdmins + totalInstAdmins + totalSuperAdmins + totalUniAdmins;

    res.json({
      totalUsers,
      totalStudents,
      totalProfessors,
      totalDeptAdmins,
      totalInstAdmins,
      totalSuperAdmins,
      totalUniversities: activeUniIds.length,
      universities: activeUniIds.length,
      totalInstitutions: validInstIds.length,
      institutions: validInstIds.length,
      totalDepartments: validDeptIds.length,
      departments: validDeptIds.length,
      totalCourses: validCourseIds.length,
      courses: validCourseIds.length,
      totalLectures,
      lectures: totalLectures,
      totalQuizzes,
      quizzes: totalQuizzes,
      totalQuizResults,
      students: totalStudents,
      professors: totalProfessors,
      storageUsed,
      meteredAIUsed
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get progress reports
// @route   GET /api/admin/reports
exports.getReports = async (req, res, next) => {
  try {
    const userRole = req.user?.role;
    const instId = req.user?.institution?._id || req.user?.institution;
    let quizMatchFilter = {};

    if ((userRole === 'inst_admin' || userRole === 'dept_admin') && instId) {
      const depts = await Department.find({ institution: instId }).select('_id');
      const deptIds = depts.map(d => d._id);
      const courses = await Course.find({ department: { $in: deptIds } }).select('_id');
      const courseIds = courses.map(c => c._id);
      const quizzes = await Quiz.find({ course: { $in: courseIds } }).select('_id');
      const quizIds = quizzes.map(q => q._id);

      quizMatchFilter = { quiz: { $in: quizIds } };
    }

    // Top performing students
    const topStudents = await QuizResult.aggregate([
      ...(Object.keys(quizMatchFilter).length ? [{ $match: quizMatchFilter }] : []),
      {
        $group: {
          _id: '$student',
          totalQuizzes: { $sum: 1 },
          avgScore: { $avg: { $multiply: [{ $divide: ['$totalScore', '$maxScore'] }, 100] } }
        }
      },
      { $sort: { avgScore: -1 } },
      { $limit: 10 }
    ]);

    // Populate student names
    await User.populate(topStudents, { path: '_id', select: 'name email' });

    // Recent quiz results
    const recentResults = await QuizResult.find(quizMatchFilter)
      .populate('quiz', 'title')
      .populate('student', 'name email')
      .sort({ createdAt: -1 })
      .limit(20);

    res.json({ topStudents, recentResults });
  } catch (error) {
    next(error);
  }
};

// ========== UNIVERSITIES ==========

// @desc    Get all universities with dynamic counts
// @route   GET /api/admin/universities
exports.getUniversities = async (req, res, next) => {
  try {
    const universities = await University.find().sort({ name: 1 });

    const enriched = await Promise.all(
      universities.map(async (uni) => {
        const insts = await Institution.find({ university: uni._id }).select('_id');
        const instIds = insts.map(i => i._id);
        const depts = instIds.length ? await Department.find({ institution: { $in: instIds } }).select('_id') : [];
        const deptIds = depts.map(d => d._id);

        const [studentsCount, professorsCount, coursesCount] = await Promise.all([
          User.countDocuments({
            role: 'student',
            $or: [{ institution: { $in: instIds } }, { department: { $in: deptIds } }]
          }),
          User.countDocuments({
            role: 'professor',
            $or: [{ institution: { $in: instIds } }, { department: { $in: deptIds } }]
          }),
          deptIds.length ? Course.countDocuments({ department: { $in: deptIds } }) : 0
        ]);

        return {
          ...uni.toObject(),
          institutionsCount: instIds.length,
          departmentsCount: deptIds.length,
          studentsCount,
          professorsCount,
          coursesCount
        };
      })
    );

    res.json({ data: enriched });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single university
// @route   GET /api/admin/universities/:id
exports.getUniversityById = async (req, res, next) => {
  try {
    const university = await University.findById(req.params.id);
    if (!university) return res.status(404).json({ message: 'University not found' });
    res.json({ data: university });
  } catch (error) {
    next(error);
  }
};

// @desc    Create university
// @route   POST /api/admin/universities
exports.createUniversity = async (req, res, next) => {
  try {
    const payload = { ...req.body };
    if (payload.acronym) payload.acronym = payload.acronym.trim().toUpperCase();
    if (payload.code) payload.code = payload.code.trim().toUpperCase();
    if (payload.acronym && !payload.code) payload.code = payload.acronym;
    if (payload.code && !payload.acronym) payload.acronym = payload.code;

    const university = await University.create(payload);

    recordCriticalEvent({
      actor: req.user,
      eventFamily: 'UNIVERSITY',
      severity: 'CRITICAL',
      action: 'university_change',
      resource: 'university',
      resourceId: university._id,
      description: `New University created: "${university.name}" (${university.code})`,
      changes: { name: university.name, code: university.code, state: university.state },
      ipAddress: req.ip || '',
      userAgent: req.headers ? (req.headers['user-agent'] || '') : '',
      university: university._id,
      eventScope: 'PLATFORM'
    }).catch(() => {});

    res.status(201).json({ data: university, message: 'University created successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Update university
// @route   PUT /api/admin/universities/:id
exports.updateUniversity = async (req, res, next) => {
  try {
    const payload = { ...req.body };
    if (payload.acronym) payload.acronym = payload.acronym.trim().toUpperCase();
    if (payload.code) payload.code = payload.code.trim().toUpperCase();
    if (payload.acronym && !payload.code) payload.code = payload.acronym;
    if (payload.code && !payload.acronym) payload.acronym = payload.code;

    const university = await University.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true
    });
    if (!university) return res.status(404).json({ message: 'University not found' });

    recordCriticalEvent({
      actor: req.user,
      eventFamily: 'UNIVERSITY',
      severity: 'HIGH',
      action: 'university_change',
      resource: 'university',
      resourceId: university._id,
      description: `University configuration updated: "${university.name}"`,
      changes: payload,
      ipAddress: req.ip || '',
      userAgent: req.headers ? (req.headers['user-agent'] || '') : '',
      university: university._id,
      eventScope: 'PLATFORM'
    }).catch(() => {});

    res.json({ data: university, message: 'University updated successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete university
// @route   DELETE /api/admin/universities/:id
exports.deleteUniversity = async (req, res, next) => {
  try {
    const university = await University.findById(req.params.id);
    if (!university) return res.status(404).json({ message: 'University not found' });

    // Find all institutions under this university
    const institutions = await Institution.find({ university: req.params.id }).select('_id');
    const instIds = institutions.map(i => i._id);

    // Find all departments under these institutions
    const departments = instIds.length ? await Department.find({ institution: { $in: instIds } }).select('_id') : [];
    const deptIds = departments.map(d => d._id);

    // Find all courses under these departments
    const courses = deptIds.length ? await Course.find({ department: { $in: deptIds } }).select('_id') : [];
    const courseIds = courses.map(c => c._id);

    // Cascade delete lectures and quizzes for courses
    if (courseIds.length) {
      await Lecture.deleteMany({ course: { $in: courseIds } });
      await Quiz.deleteMany({ course: { $in: courseIds } });
      await QuizResult.deleteMany({ course: { $in: courseIds } });
      await Assignment.deleteMany({ course: { $in: courseIds } });
      await Course.deleteMany({ _id: { $in: courseIds } });
    }

    // Delete departments
    if (deptIds.length) {
      await Department.deleteMany({ _id: { $in: deptIds } });
    }

    // Delete institutions
    if (instIds.length) {
      await Institution.deleteMany({ _id: { $in: instIds } });
    }

    // Delete university admins and cleanup users
    await User.deleteMany({ university: req.params.id, role: { $in: ['university_admin', 'inst_admin', 'dept_admin'] } });
    await User.deleteMany({
      $or: [
        { university: req.params.id },
        { institution: { $in: instIds } },
        { department: { $in: deptIds } }
      ]
    });

    await University.findByIdAndDelete(req.params.id);

    recordCriticalEvent({
      actor: req.user,
      eventFamily: 'DESTRUCTIVE',
      severity: 'CRITICAL',
      action: 'destructive_operation',
      resource: 'university',
      resourceId: university._id,
      description: `PERMANENT DESTRUCTION: University "${university.name}" (${university.code}) and all associated institutions/departments/users were permanently deleted.`,
      changes: { universityId: university._id, name: university.name, code: university.code },
      ipAddress: req.ip || '',
      userAgent: req.headers ? (req.headers['user-agent'] || '') : '',
      university: university._id,
      eventScope: 'PLATFORM'
    }).catch(() => {});

    res.json({ message: 'University and related data deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Get university dynamic statistics
// @route   GET /api/admin/universities/:id/stats
exports.getUniversityStats = async (req, res, next) => {
  try {
    const university = await University.findById(req.params.id);
    if (!university) return res.status(404).json({ message: 'University not found' });

    const insts = await Institution.find({ university: req.params.id }).select('_id');
    const instIds = insts.map(i => i._id);
    const depts = instIds.length ? await Department.find({ institution: { $in: instIds } }).select('_id') : [];
    const deptIds = depts.map(d => d._id);

    const [studentsCount, facultyCount, courseCount] = await Promise.all([
      User.countDocuments({
        role: 'student',
        $or: [{ institution: { $in: instIds } }, { department: { $in: deptIds } }]
      }),
      User.countDocuments({
        role: 'professor',
        $or: [{ institution: { $in: instIds } }, { department: { $in: deptIds } }]
      }),
      deptIds.length ? Course.countDocuments({ department: { $in: deptIds } }) : 0
    ]);

    const resourceService = require('../services/resourceService');
    const storageOverview = await resourceService.getCompleteResourceOverview({
      level: 'UNIVERSITY',
      id: req.params.id
    });

    res.json({
      data: {
        institutionsCount: instIds.length,
        departmentsCount: deptIds.length,
        studentsCount,
        facultyCount,
        courseCount,
        storageAllocatedTB: Number((storageOverview.storage.allocated / (1024 * 1024 * 1024 * 1024)).toFixed(2)),
        storageUsedTB: Number((storageOverview.storage.used / (1024 * 1024 * 1024 * 1024)).toFixed(2)),
        storageAllocatedBytes: storageOverview.storage.allocated,
        storageUsedBytes: storageOverview.storage.used
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get institutions scoped to university
// @route   GET /api/admin/universities/:id/institutions
exports.getUniversityInstitutions = async (req, res, next) => {
  try {
    const institutions = await Institution.find({ university: req.params.id }).sort({ name: 1 });
    res.json({ data: institutions });
  } catch (error) {
    next(error);
  }
};

// ========== UNIVERSITY ADMINS ==========

// @desc    Get all university administrators
// @route   GET /api/admin/university-admins
exports.getUniversityAdmins = async (req, res, next) => {
  try {
    const admins = await User.find({ role: { $in: ['university_admin', 'UNIVERSITY_ADMIN'] } })
      .populate('university', 'name code state')
      .sort({ createdAt: -1 });
    res.json({ data: admins });
  } catch (error) {
    next(error);
  }
};

// @desc    Create university administrator
// @route   POST /api/admin/university-admins
exports.createUniversityAdmin = async (req, res, next) => {
  try {
    const { name, email, password, universityId, university } = req.body;
    const targetUni = universityId || university;

    if (!targetUni) {
      return res.status(400).json({ message: 'University association is mandatory for University Admin' });
    }

    const uniDoc = await University.findById(targetUni);
    if (!uniDoc) {
      return res.status(404).json({ message: 'Referenced University does not exist' });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: 'User already exists with this email address' });
    }

    const user = await User.create({
      name,
      email,
      password: password || 'Password@123',
      role: 'university_admin',
      university: targetUni
    });

    await user.populate('university', 'name code state');

    recordCriticalEvent({
      actor: req.user,
      eventFamily: 'PRIVILEGE',
      severity: 'CRITICAL',
      action: 'privilege_change',
      resource: 'user',
      resourceId: user._id,
      description: `New University Admin assigned for ${uniDoc.name}: ${user.email}`,
      changes: { newRole: 'university_admin', universityId: targetUni, email: user.email },
      ipAddress: req.ip || '',
      userAgent: req.headers ? (req.headers['user-agent'] || '') : '',
      university: targetUni,
      eventScope: 'PLATFORM'
    }).catch(() => {});

    res.status(201).json({ data: user, message: 'University Admin created successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Update university administrator
// @route   PUT /api/admin/university-admins/:id
exports.updateUniversityAdmin = async (req, res, next) => {
  try {
    const { name, email, universityId, university, status } = req.body;
    const updateData = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (status !== undefined) updateData.isActive = status === 'active';
    if (universityId || university) {
      updateData.university = universityId || university;
    }

    const user = await User.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true
    }).populate('university', 'name code state');

    if (!user) return res.status(404).json({ message: 'University Admin not found' });
    res.json({ data: user, message: 'University Admin updated successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete university administrator
// @route   DELETE /api/admin/university-admins/:id
exports.deleteUniversityAdmin = async (req, res, next) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: 'University Admin not found' });

    recordCriticalEvent({
      actor: req.user,
      eventFamily: 'PRIVILEGE',
      severity: 'CRITICAL',
      action: 'privilege_change',
      resource: 'user',
      resourceId: user._id,
      description: `University Admin privilege revoked / account deleted: ${user.email}`,
      changes: { role: 'university_admin', email: user.email },
      ipAddress: req.ip || '',
      userAgent: req.headers ? (req.headers['user-agent'] || '') : '',
      university: user.university,
      eventScope: 'PLATFORM'
    }).catch(() => {});

    res.json({ message: 'University Admin removed successfully' });
  } catch (error) {
    next(error);
  }
};

// ========== UNIVERSITY ANALYTICS ==========

// @desc    Get dynamic comparative university analytics
// @route   GET /api/admin/university-analytics
exports.getUniversityAnalytics = async (req, res, next) => {
  try {
    const universities = await University.find().sort({ name: 1 });
    const resourceService = require('../services/resourceService');
    const AttendanceRecord = require('../models/AttendanceRecord');

    // Retrieve authoritative storage overview for all universities using the existing service
    const storageOverviewList = await resourceService.getUniversityStorageOverview();
    const storageMap = new Map();
    for (const s of storageOverviewList) {
      storageMap.set(s.universityId.toString(), s);
    }

    const analytics = await Promise.all(
      universities.map(async (uni) => {
        const insts = await Institution.find({ university: uni._id }).select('_id');
        const instIds = insts.map(i => i._id);
        const depts = instIds.length ? await Department.find({ institution: { $in: instIds } }).select('_id') : [];
        const deptIds = depts.map(d => d._id);

        const [studentsCount, professorsCount, coursesCount] = await Promise.all([
          User.countDocuments({
            role: 'student',
            $or: [{ institution: { $in: instIds } }, { department: { $in: deptIds } }]
          }),
          User.countDocuments({
            role: 'professor',
            $or: [{ institution: { $in: instIds } }, { department: { $in: deptIds } }]
          }),
          deptIds.length ? Course.countDocuments({ department: { $in: deptIds } }) : 0
        ]);

        const uStorage = storageMap.get(uni._id.toString()) || {
          allocated: 0,
          allocatedFormatted: '0 B',
          used: 0,
          usedFormatted: '0 B',
          remaining: 0,
          remainingFormatted: '0 B',
          usagePercentage: 0,
          fileCount: 0
        };

        // Calculate actual attendance rate for university students
        let attendanceRate = 'N/A';
        const uniStudents = await User.find({
          role: 'student',
          $or: [{ institution: { $in: instIds } }, { department: { $in: deptIds } }]
        }).select('_id');
        const studentIds = uniStudents.map(s => s._id);

        if (studentIds.length > 0) {
          const attRecords = await AttendanceRecord.aggregate([
            { $match: { student: { $in: studentIds } } },
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } }
              }
            }
          ]);
          if (attRecords.length > 0 && attRecords[0].total > 0) {
            attendanceRate = `${((attRecords[0].present / attRecords[0].total) * 100).toFixed(1)}%`;
          }
        }

        return {
          _id: uni._id,
          name: uni.name,
          code: uni.code,
          institutions: instIds.length,
          departments: deptIds.length,
          students: studentsCount,
          professors: professorsCount,
          courses: coursesCount,
          storageAllocated: uStorage.allocated,
          storageUsed: uStorage.used,
          storageRemaining: uStorage.remaining,
          storageAllocatedFormatted: uStorage.allocatedFormatted,
          storageUsedFormatted: uStorage.usedFormatted,
          storageRemainingFormatted: uStorage.remainingFormatted,
          storageUsagePercentage: uStorage.usagePercentage,
          storage: {
            allocated: uStorage.allocated,
            used: uStorage.used,
            remaining: uStorage.remaining,
            allocatedFormatted: uStorage.allocatedFormatted,
            usedFormatted: uStorage.usedFormatted,
            remainingFormatted: uStorage.remainingFormatted,
            usagePercentage: uStorage.usagePercentage
          },
          storageAllocatedTB: Number((uStorage.allocated / (1024 * 1024 * 1024 * 1024)).toFixed(2)),
          storageUsedTB: Number((uStorage.used / (1024 * 1024 * 1024 * 1024)).toFixed(2)),
          attendanceRate
        };
      })
    );

    res.json({ data: analytics });
  } catch (error) {
    next(error);
  }
};

// @desc    Bulk assign students to a division (Academic Admin)
// @route   POST /api/admin/divisions/assign
exports.assignDivisions = async (req, res, next) => {
  try {
    const { studentIds, division } = req.body;

    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ message: 'studentIds must be a non-empty array' });
    }

    if (!division || typeof division !== 'string' || !division.trim()) {
      return res.status(400).json({ message: 'Target division is required' });
    }

    const targetDivision = division.trim().toUpperCase();

    // Validate ObjectIds format
    const validObjectIds = studentIds.every(id => mongoose.Types.ObjectId.isValid(id));
    if (!validObjectIds) {
      return res.status(400).json({ message: 'One or more student IDs are invalid or malformed' });
    }

    // 1. All-or-nothing validation: Fetch all target students
    const targetStudents = await User.find({ _id: { $in: studentIds } });

    if (targetStudents.length !== studentIds.length) {
      return res.status(400).json({ message: 'One or more student IDs are invalid or do not exist in the database' });
    }

    // Validate that ALL specified users are students
    const nonStudents = targetStudents.filter(s => s.role !== 'student');
    if (nonStudents.length > 0) {
      return res.status(400).json({ message: 'One or more specified users are not students' });
    }

    // 2. Role-based tenant scope authorization
    const adminRole = req.user.role;
    if (['dept_admin', 'academic_administrator', 'academic_admin'].includes(adminRole)) {
      const adminDeptId = (req.user.department?._id || req.user.department)?.toString();
      const unauthorized = targetStudents.filter(s => {
        const studentDeptId = (s.department?._id || s.department)?.toString();
        return !adminDeptId || !studentDeptId || adminDeptId !== studentDeptId;
      });
      if (unauthorized.length > 0) {
        return res.status(403).json({ message: 'Access denied. You can only assign divisions to students in your department.' });
      }
    } else if (adminRole === 'inst_admin') {
      const adminInstId = (req.user.institution?._id || req.user.institution)?.toString();
      const unauthorized = targetStudents.filter(s => {
        const studentInstId = (s.institution?._id || s.institution)?.toString();
        return !adminInstId || !studentInstId || adminInstId !== studentInstId;
      });
      if (unauthorized.length > 0) {
        return res.status(403).json({ message: 'Access denied. You can only assign divisions to students in your institution.' });
      }
    } else if (adminRole === 'university_admin') {
      const adminUniId = (req.user.university?._id || req.user.university)?.toString();
      const unauthorized = targetStudents.filter(s => {
        const studentUniId = (s.university?._id || s.university)?.toString();
        return !adminUniId || !studentUniId || adminUniId !== studentUniId;
      });
      if (unauthorized.length > 0) {
        return res.status(403).json({ message: 'Access denied. You can only assign divisions to students in your university.' });
      }
    }

    // 3. Batch Update User.division
    await User.updateMany(
      { _id: { $in: studentIds } },
      { $set: { division: targetDivision } }
    );

    // 4. Synchronize Enrollment.division for active current-semester enrollments of affected students
    const Enrollment = require('../models/Enrollment');
    for (const st of targetStudents) {
      const deptId = st.department?._id || st.department;
      if (deptId && st.currentSemester) {
        const currentCourses = await Course.find({
          department: deptId,
          semester: st.currentSemester
        }).select('_id');

        const currentCourseIds = currentCourses.map(c => c._id);
        if (currentCourseIds.length > 0) {
          await Enrollment.updateMany(
            {
              student: st._id,
              course: { $in: currentCourseIds },
              status: 'active'
            },
            { $set: { division: targetDivision } }
          );
        }
      }
    }

    if (studentIds.length > 20) {
      recordCriticalEvent({
        actor: req.user,
        eventFamily: 'BULK',
        severity: 'HIGH',
        action: 'bulk_operation',
        resource: 'user',
        description: `Mass division assignment: ${studentIds.length} students reassigned to Division ${targetDivision}`,
        changes: { affectedCount: studentIds.length, targetDivision },
        ipAddress: req.ip || '',
        userAgent: req.headers ? (req.headers['user-agent'] || '') : '',
        university: req.user.university,
        eventScope: 'UNIVERSITY'
      }).catch(() => {});
    }

    res.json({
      message: `Successfully assigned ${studentIds.length} student(s) to Division ${targetDivision}`,
      updatedCount: studentIds.length,
      division: targetDivision
    });
  } catch (error) {
    next(error);
  }
};

