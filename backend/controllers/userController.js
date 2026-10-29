const mongoose = require('mongoose');
const User = require('../models/User');
const { paginate } = require('../utils/pagination');
const { recordCriticalEvent } = require('../services/auditService');

// Helper to reliably resolve an institutional admin's institution ID
async function resolveInstAdminInstitution(user) {
  if (!user) return null;
  let instId = user.institution?._id || user.institution;
  if (!instId && user.role === 'inst_admin') {
    const Institution = require('../models/Institution');
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

// @desc    Get all users (admin only, or professor viewing their students, paginated)
// @route   GET /api/users?page=1&limit=20&role=student&search=keyword
exports.getAllUsers = async (req, res, next) => {
  try {
    const { role, search, department, institution, page, limit } = req.query;
    const andFilters = [];

    // Role-based tenant scoping
    if (req.user.role === 'university_admin') {
      const uniId = req.user.university?._id || req.user.university;
      const Institution = require('../models/Institution');
      const Department = require('../models/Department');
      const instsInUni = uniId ? await Institution.find({ university: uniId }).select('_id') : [];
      const instIds = instsInUni.map(i => i._id);
      const deptsInUni = instIds.length ? await Department.find({ institution: { $in: instIds } }).select('_id') : [];
      const deptIds = deptsInUni.map(d => d._id);

      andFilters.push({
        $or: [
          { university: uniId },
          { institution: { $in: instIds } },
          { department: { $in: deptIds } }
        ]
      });
      if (role) {
        if (role === 'academic_administrator' || role === 'academic_admin') {
          andFilters.push({ role: { $in: ['academic_administrator', 'academic_admin'] } });
        } else {
          andFilters.push({ role });
        }
      }
    } else if (req.user.role === 'inst_admin') {
      const Department = require('../models/Department');
      const instId = await resolveInstAdminInstitution(req.user);

      if (!instId) {
        andFilters.push({ institution: new mongoose.Types.ObjectId() });
      } else {
        const deptsInInst = await Department.find({ institution: instId }).select('_id');
        const deptIds = deptsInInst.map(d => d._id);

        andFilters.push({
          $or: [
            { institution: instId },
            { department: { $in: deptIds } }
          ]
        });
      }

      if (role) {
        if (role === 'academic_administrator' || role === 'academic_admin') {
          andFilters.push({ role: { $in: ['academic_administrator', 'academic_admin'] } });
        } else {
          andFilters.push({ role });
        }
      }
      if (department) andFilters.push({ department });
    } else if (req.user.role === 'dept_admin' || req.user.role === 'academic_administrator' || req.user.role === 'academic_admin') {
      const deptId = req.user.department?._id || req.user.department;
      if (deptId) {
        andFilters.push({ department: deptId });
      } else if (req.user.institution) {
        andFilters.push({ institution: req.user.institution?._id || req.user.institution });
      }
      if (role) {
        if (role === 'academic_administrator' || role === 'academic_admin') {
          andFilters.push({ role: { $in: ['academic_administrator', 'academic_admin'] } });
        } else {
          andFilters.push({ role });
        }
      }
    } else if (req.user.role === 'professor') {
      const Course = require('../models/Course');
      const Enrollment = require('../models/Enrollment');
      const profId = req.user._id;
      const userCourseIds = (req.user.courses || []).map(c => (c._id || c));
      const profCourses = await Course.find({
        $or: [
          { professor: profId },
          { _id: { $in: userCourseIds } }
        ]
      }).select('_id');
      const profCourseIds = profCourses.map(c => c._id);
      const activeEnrollments = await Enrollment.find({
        course: { $in: profCourseIds },
        status: 'active'
      }).select('student');
      const enrolledStudentIds = activeEnrollments.map(e => e.student);
      andFilters.push({ _id: { $in: enrolledStudentIds } });
      if (role) andFilters.push({ role });
      if (department) andFilters.push({ department });
    } else {
      // Super admin or unconstrained admin
      if (role) {
        if (role === 'academic_administrator' || role === 'academic_admin') {
          andFilters.push({ role: { $in: ['academic_administrator', 'academic_admin'] } });
        } else {
          andFilters.push({ role });
        }
      }
      if (department) andFilters.push({ department });
      if (institution) andFilters.push({ institution });
    }

    if (search) {
      andFilters.push({
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { enrollmentNumber: { $regex: search, $options: 'i' } }
        ]
      });
    }

    const filter = andFilters.length > 0 ? { $and: andFilters } : {};

    console.log(`[DEBUG] User Role: ${req.user.role}, Filter:`, JSON.stringify(filter));

    const result = await paginate(User, filter, { page, limit }, [
      { path: 'university', select: 'name code state' },
      { path: 'institution', select: 'name code' },
      { path: 'department', select: 'name code' },
      { path: 'courses', select: 'name code semester' }
    ]);

    res.json({
      data: result.data,
      pagination: { total: result.pagination.totalItems, ...result.pagination }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get user by ID
// @route   GET /api/users/:id
exports.getUserById = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id)
      .populate('institution', 'name code')
      .populate('department', 'name code')
      .populate('courses', 'name code semester');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    next(error);
  }
};

// Helper: normalize student name for college email (lowercase, first word, alphanumeric only)
function normalizeStudentUsername(fullName) {
  if (!fullName) return 'student';
  const firstToken = fullName.trim().toLowerCase().split(/\s+/)[0];
  const cleaned = firstToken.replace(/[^a-z0-9]/g, '');
  return cleaned || 'student';
}

// Helper: generate unique college email: <normalized_name>@<uniAcronym>.ac.in
// Collision handling: <normalized_name>01@..., <normalized_name>02@..., etc.
// Supports checking both database and in-flight/batch reserved emails
async function generateUniqueCollegeEmail(name, uniAcronym, extraExistingEmails = null) {
  const baseUsername = normalizeStudentUsername(name);
  const domain = `${uniAcronym.toLowerCase()}.ac.in`;

  // 1st candidate: rahul@iitb.ac.in
  const initialEmail = `${baseUsername}@${domain}`;
  const inBatchFirst = extraExistingEmails && extraExistingEmails.has(initialEmail);
  if (!inBatchFirst) {
    const existingFirst = await User.findOne({ email: initialEmail });
    if (!existingFirst) {
      if (extraExistingEmails) extraExistingEmails.add(initialEmail);
      return initialEmail;
    }
  }

  // Next candidates: rahul01@iitb.ac.in, rahul02@iitb.ac.in, ...
  let counter = 1;
  while (counter <= 999) {
    const suffix = String(counter).padStart(2, '0');
    const candidate = `${baseUsername}${suffix}@${domain}`;
    const inBatch = extraExistingEmails && extraExistingEmails.has(candidate);
    if (!inBatch) {
      const exists = await User.findOne({ email: candidate });
      if (!exists) {
        if (extraExistingEmails) extraExistingEmails.add(candidate);
        return candidate;
      }
    }
    counter++;
  }
  const fallback = `${baseUsername}${Date.now().toString().slice(-4)}@${domain}`;
  if (extraExistingEmails) extraExistingEmails.add(fallback);
  return fallback;
}

// Helper: generate sequential enrollment number: <UniAcronym>-<DeptCode>-<Semester>-<Sequence>
// Scoped by University + Department + Semester
async function generateEnrollmentNumber(uniAcronym, deptCode, semester, batchSeqTracker = null) {
  const semPadded = String(semester).padStart(2, '0');
  const prefix = `${uniAcronym}-${deptCode}-${semPadded}-`;
  const scopeKey = `${uniAcronym}-${deptCode}-${semPadded}`;

  const regex = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)`);
  const matchingStudents = await User.find({ enrollmentNumber: regex }).select('enrollmentNumber');

  let maxSeq = 0;
  for (const st of matchingStudents) {
    const match = st.enrollmentNumber ? st.enrollmentNumber.match(regex) : null;
    if (match && match[1]) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxSeq) {
        maxSeq = num;
      }
    }
  }

  if (batchSeqTracker && batchSeqTracker.has(scopeKey)) {
    const batchSeq = batchSeqTracker.get(scopeKey);
    if (batchSeq > maxSeq) {
      maxSeq = batchSeq;
    }
  }

  const nextSeq = maxSeq + 1;
  if (batchSeqTracker) {
    batchSeqTracker.set(scopeKey, nextSeq);
  }

  return `${prefix}${String(nextSeq).padStart(3, '0')}`;
}

// @desc    Create user (admin only)
// @route   POST /api/users
exports.createUser = async (req, res, next) => {
  try {
    let { email, password, name, role, institution, department } = req.body;

    let targetInst = institution || req.body.institutionId;
    let targetDept = department;

    if (req.user && req.user.role === 'inst_admin') {
      if (!targetInst) targetInst = await resolveInstAdminInstitution(req.user);
    }

    if (req.user && (req.user.role === 'academic_administrator' || req.user.role === 'academic_admin')) {
      targetDept = req.user.department?._id || req.user.department;
      targetInst = req.user.institution?._id || req.user.institution;
      role = 'student';
    }

    if (req.user && req.user.role === 'dept_admin') {
      if (!targetDept) targetDept = req.user.department?._id || req.user.department;
      if (!targetInst) targetInst = req.user.institution?._id || req.user.institution;
      const allowedRolesForDeptAdmin = ['professor', 'student', 'academic_administrator', 'academic_admin'];
      if (role && !allowedRolesForDeptAdmin.includes(role)) {
        return res.status(403).json({ message: 'Access denied: Department Admins cannot create users with this role.' });
      }
    }

    if (!targetInst && targetDept) {
      const Department = require('../models/Department');
      const deptDoc = await Department.findById(targetDept);
      if (deptDoc && deptDoc.institution) {
        targetInst = deptDoc.institution;
      }
    }
    if (!targetInst && req.user && req.user.institution) {
      targetInst = req.user.institution._id || req.user.institution;
    }

    const Department = require('../models/Department');
    const Institution = require('../models/Institution');
    const University = require('../models/University');

    const deptDoc = targetDept ? await Department.findById(targetDept) : null;
    const instDoc = targetInst ? await Institution.findById(targetInst) : null;

    if (deptDoc && instDoc && deptDoc.institution.toString() !== instDoc._id.toString()) {
      return res.status(400).json({ message: 'Department does not belong to the specified institution' });
    }

    let uniId = req.user?.university?._id || req.user?.university;
    if (!uniId && instDoc?.university) uniId = instDoc.university;
    const uniDoc = uniId ? await University.findById(uniId) : null;

    if (instDoc && uniDoc && instDoc.university && instDoc.university.toString() !== uniDoc._id.toString()) {
      return res.status(400).json({ message: 'Institution does not belong to the specified university' });
    }

    if (req.user && req.user.role === 'university_admin') {
      const myUniId = (req.user.university?._id || req.user.university)?.toString();
      if (uniId && uniId.toString() !== myUniId) {
        return res.status(403).json({ message: 'Access denied: Target entity does not belong to your university.' });
      }
    }

    const uniAcronym = (uniDoc?.acronym || uniDoc?.code || 'UNI').trim().toUpperCase();
    const deptCode = (deptDoc?.code || 'DEPT').trim().toUpperCase();

    const currentSemester = req.body.currentSemester !== undefined
      ? Math.min(8, Math.max(1, parseInt(req.body.currentSemester, 10)))
      : 1;
    const division = req.body.division ? req.body.division.trim().toUpperCase() : 'A';

    // Special automated handling for Student creation
    if (role === 'student' || (!role && req.user && (req.user.role === 'academic_administrator' || req.user.role === 'academic_admin'))) {
      const personalEmail = (req.body.personalEmail || req.body.personalGmail || email || '').trim().toLowerCase();
      if (!personalEmail) {
        return res.status(400).json({ message: 'Personal email/Gmail is required for student registration' });
      }

      let user = null;
      let attempts = 0;
      let lastErr = null;

      while (!user && attempts < 5) {
        attempts++;
        try {
          const enrollmentNumber = await generateEnrollmentNumber(uniAcronym, deptCode, currentSemester);
          const collegeEmail = await generateUniqueCollegeEmail(name, uniAcronym);

          user = await User.create({
            name,
            email: collegeEmail,
            personalEmail,
            enrollmentNumber,
            password: password || 'Student@123',
            role: 'student',
            currentSemester,
            division,
            department: targetDept,
            institution: targetInst,
            university: uniDoc?._id
          });
        } catch (err) {
          lastErr = err;
          if (err.code !== 11000 || attempts >= 5) {
            throw err;
          }
        }
      }

      if (!user) {
        throw lastErr || new Error('Failed to generate unique student identity');
      }

      const populatedUser = await User.findById(user._id)
        .populate('university', 'name code acronym state')
        .populate('institution', 'name code')
        .populate('department', 'name code');

      return res.status(201).json({
        user: populatedUser,
        message: 'Student enrolled successfully with permanent enrollment number and college email'
      });
    }

    // Non-student creation (professors, admins)
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    const userData = {
      email,
      password,
      name,
      role,
      institution: targetInst,
      department: targetDept,
      university: uniDoc?._id
    };

    if (role === 'professor' && targetInst && targetDept) {
      const instCode = instDoc?.code || 'UNK';
      const count = await User.countDocuments({ role: 'professor', department: targetDept });
      const sequence = String(count + 1).padStart(3, '0');
      userData.professorId = `${instCode}-${deptCode}-PROF-${sequence}`;
    }

    const user = await User.create(userData);
    const populatedUser = await User.findById(user._id)
      .populate('university', 'name code state')
      .populate('institution', 'name code')
      .populate('department', 'name code');

    if (user && (user.role === 'super_admin' || user.role === 'university_admin')) {
      recordCriticalEvent({
        actor: req.user,
        eventFamily: 'PRIVILEGE',
        severity: 'CRITICAL',
        action: 'privilege_change',
        resource: 'user',
        resourceId: user._id,
        description: `New ${user.role} created: ${user.email}`,
        changes: { newRole: user.role, email: user.email },
        ipAddress: req.ip || '',
        userAgent: req.headers ? (req.headers['user-agent'] || '') : '',
        university: user.university,
        eventScope: user.role === 'super_admin' ? 'PLATFORM' : 'UNIVERSITY'
      }).catch(() => {});
    }

    res.status(201).json({ user: populatedUser, message: 'User created successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Update user (admin only)
// @route   PUT /api/users/:id
exports.updateUser = async (req, res, next) => {
  try {
    const targetUser = await User.findById(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (req.user.role === 'student') {
      return res.status(403).json({ message: 'Access denied. Students cannot modify user profiles.' });
    }

    if (req.user.role === 'dept_admin' || req.user.role === 'academic_administrator' || req.user.role === 'academic_admin') {
      const adminDeptId = (req.user.department?._id || req.user.department)?.toString();
      const userDeptId = (targetUser.department?._id || targetUser.department)?.toString();
      if (!adminDeptId || !userDeptId || adminDeptId !== userDeptId) {
        return res.status(403).json({ message: 'Access denied. You can only manage users in your department.' });
      }
    } else if (req.user.role === 'inst_admin') {
      const adminInstId = (req.user.institution?._id || req.user.institution)?.toString();
      const userInstId = (targetUser.institution?._id || targetUser.institution)?.toString();
      if (!adminInstId || !userInstId || adminInstId !== userInstId) {
        return res.status(403).json({ message: 'Access denied. You can only manage users in your institution.' });
      }
    } else if (req.user.role === 'university_admin') {
      const uniId = (req.user.university?._id || req.user.university)?.toString();
      const userUniId = (targetUser.university?._id || targetUser.university)?.toString();
      let belongsToUni = userUniId && userUniId === uniId;
      if (!belongsToUni && targetUser.institution) {
        const Institution = require('../models/Institution');
        const instDoc = await Institution.findById(targetUser.institution);
        if (instDoc && instDoc.university && instDoc.university.toString() === uniId) {
          belongsToUni = true;
        }
      }
      if (!belongsToUni) {
        return res.status(403).json({ message: 'Access denied. You can only manage users in your university.' });
      }
    }

    const { name, email, role, institution, department, currentSemester, division, personalEmail, personalGmail } = req.body;
    const updates = {};

    if (name) updates.name = name;
    if (req.body.phone !== undefined) updates.phone = req.body.phone;
    if (req.body.password) {
      const bcrypt = require('bcryptjs');
      updates.password = await bcrypt.hash(req.body.password, 10);
    }
    if (targetUser.role === 'student') {
      // Permanent identity: never modify enrollmentNumber or login email (College Gmail) for existing students!
      if (personalEmail || personalGmail) {
        updates.personalEmail = (personalEmail || personalGmail).trim().toLowerCase();
      }
    } else {
      if (email) updates.email = email;
    }
    const newDivision = division !== undefined ? (division ? String(division).trim().toUpperCase() : '') : undefined;
    if (newDivision !== undefined) updates.division = newDivision;
    if (role && req.user.role === 'super_admin') updates.role = role;
    const targetInstitution = institution || req.body.institutionId;
    if (targetInstitution && ['super_admin', 'university_admin'].includes(req.user.role)) updates.institution = targetInstitution;
    const targetDepartment = department || req.body.departmentId;
    if (targetDepartment && ['super_admin', 'inst_admin', 'university_admin'].includes(req.user.role)) updates.department = targetDepartment;

    // Allow authorized admins to update student semester
    if (currentSemester !== undefined && targetUser.role === 'student') {
      updates.currentSemester = Math.min(8, Math.max(1, parseInt(currentSemester)));
    }

    // Allow updating assigned courses ONLY for professors (Students MUST use Enrollment SOT)
    if (req.body.courses !== undefined && targetUser.role === 'professor') {
      updates.courses = req.body.courses;
      const Course = require('../models/Course');
      // Unset professor on courses previously assigned to this prof but no longer in array
      await Course.updateMany(
        { professor: targetUser._id, _id: { $nin: req.body.courses } },
        { $unset: { professor: 1 } }
      );
      // Set professor on all courses in the new array
      if (req.body.courses && req.body.courses.length > 0) {
        await Course.updateMany(
          { _id: { $in: req.body.courses } },
          { $set: { professor: targetUser._id } }
        );
      }
    }

    const updatedUser = await User.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true
    })
      .populate('university', 'name code state')
      .populate('institution', 'name code')
      .populate('department', 'name code')
      .populate('courses', 'name code semester');

    if (role && targetUser.role !== role && (targetUser.role === 'super_admin' || role === 'super_admin' || targetUser.role === 'university_admin' || role === 'university_admin')) {
      recordCriticalEvent({
        actor: req.user,
        eventFamily: 'PRIVILEGE',
        severity: 'CRITICAL',
        action: 'privilege_change',
        resource: 'user',
        resourceId: targetUser._id,
        description: `User role changed from ${targetUser.role} to ${role} for ${targetUser.email}`,
        changes: { previousRole: targetUser.role, newRole: role, email: targetUser.email },
        ipAddress: req.ip || '',
        userAgent: req.headers ? (req.headers['user-agent'] || '') : '',
        university: updatedUser.university,
        eventScope: (role === 'super_admin' || targetUser.role === 'super_admin') ? 'PLATFORM' : 'UNIVERSITY'
      }).catch(() => {});
    }

    // Phase 3.4B: Division Synchronization for Student Active Current-Semester Enrollments ONLY
    if (targetUser.role === 'student' && newDivision !== undefined) {
      const Enrollment = require('../models/Enrollment');
      const Course = require('../models/Course');
      const deptId = targetUser.department?._id || targetUser.department;
      if (deptId) {
        const currentCourses = await Course.find({
          department: deptId,
          semester: updatedUser.currentSemester
        }).select('_id');
        const currentCourseIds = currentCourses.map(c => c._id);
        if (currentCourseIds.length > 0) {
          await Enrollment.updateMany(
            {
              student: targetUser._id,
              course: { $in: currentCourseIds },
              status: 'active'
            },
            { $set: { division: newDivision } }
          );
        }
      }
    }

    res.json({ user: updatedUser, message: 'User updated successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Update student semester (dept admin / academic admin)
// @route   PUT /api/users/:id/update-semester
exports.updateStudentSemester = async (req, res, next) => {
  try {
    const { currentSemester, academicTerm, division } = req.body;

    if (currentSemester === undefined) {
      return res.status(400).json({ message: 'currentSemester is required' });
    }

    const { transitionStudentSemester } = require('../services/academicLifecycleService');

    const result = await transitionStudentSemester({
      studentId: req.params.id,
      targetSemester: currentSemester,
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

// @desc    Delete user (admin only)
// @route   DELETE /api/users/:id
exports.deleteUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prevent deleting yourself
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: 'Cannot delete your own account' });
    }

    if (req.user.role === 'dept_admin' || req.user.role === 'academic_administrator' || req.user.role === 'academic_admin') {
      const adminDeptId = (req.user.department?._id || req.user.department)?.toString();
      const userDeptId = (user.department?._id || user.department)?.toString();
      if (!adminDeptId || !userDeptId || adminDeptId !== userDeptId) {
        return res.status(403).json({ message: 'Access denied. You can only delete users in your department.' });
      }
    } else if (req.user.role === 'inst_admin') {
      const adminInstId = (req.user.institution?._id || req.user.institution)?.toString();
      const userInstId = (user.institution?._id || user.institution)?.toString();
      if (!adminInstId || !userInstId || adminInstId !== userInstId) {
        return res.status(403).json({ message: 'Access denied. You can only delete users in your institution.' });
      }
    } else if (req.user.role === 'university_admin') {
      const uniId = (req.user.university?._id || req.user.university)?.toString();
      const userUniId = (user.university?._id || user.university)?.toString();
      let belongsToUni = userUniId && userUniId === uniId;
      if (!belongsToUni && user.institution) {
        const Institution = require('../models/Institution');
        const instDoc = await Institution.findById(user.institution);
        if (instDoc && instDoc.university && instDoc.university.toString() === uniId) {
          belongsToUni = true;
        }
      }
      if (!belongsToUni) {
        return res.status(403).json({ message: 'Access denied. You can only delete users in your university.' });
      }
    }

    if (user && (user.role === 'super_admin' || user.role === 'university_admin')) {
      recordCriticalEvent({
        actor: req.user,
        eventFamily: 'PRIVILEGE',
        severity: 'CRITICAL',
        action: 'privilege_change',
        resource: 'user',
        resourceId: user._id,
        description: `${user.role} account deleted: ${user.email}`,
        changes: { role: user.role, email: user.email },
        ipAddress: req.ip || '',
        userAgent: req.headers ? (req.headers['user-agent'] || '') : '',
        university: user.university,
        eventScope: user.role === 'super_admin' ? 'PLATFORM' : 'UNIVERSITY'
      }).catch(() => {});
    }

    await User.findByIdAndDelete(req.params.id);

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Import students in bulk (academic admin / inst admin)
// @route   POST /api/users/import-students
exports.importStudents = async (req, res, next) => {
  try {
    let { students } = req.body;

    // Support CSV text if provided as csvText, csvContent, or csv
    const rawCsv = req.body.csvText || req.body.csvContent || req.body.csv;
    if (!students && rawCsv) {
      const lines = rawCsv.trim().split(/\r?\n/);
      if (lines.length > 1) {
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/^["']|["']$/g, ''));
        students = [];
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          const row = line.split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
          if (row.length === 0 || (row.length === 1 && !row[0])) continue;
          const st = {};
          headers.forEach((h, idx) => {
            const clean = h.replace(/[^a-z0-9]/g, '');
            if (clean.includes('name')) st.name = row[idx];
            else if (clean.includes('personal') || clean.includes('gmail') || clean === 'email') st.personalGmail = row[idx];
            else if (clean.includes('dept') || clean.includes('department')) st.department = row[idx];
            else if (clean.includes('semester') || clean === 'sem') st.currentSemester = parseInt(row[idx], 10);
            else if (clean.includes('division') || clean === 'div' || clean.includes('sec')) st.division = row[idx];
          });
          students.push(st);
        }
      }
    }

    if (!Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ message: 'No student records provided for import' });
    }

    const Department = require('../models/Department');
    const Institution = require('../models/Institution');
    const University = require('../models/University');

    // 1. Resolve Academic Admin's authorized organizational scope (University & Institution)
    let adminInstId = req.user?.institution?._id || req.user?.institution;
    let adminDeptId = req.user?.department?._id || req.user?.department;
    let adminUniId = req.user?.university?._id || req.user?.university;

    let adminDeptDoc = adminDeptId ? await Department.findById(adminDeptId) : null;
    if (!adminInstId && adminDeptDoc?.institution) {
      adminInstId = adminDeptDoc.institution;
    }
    if (!adminInstId && req.body.institution) {
      adminInstId = req.body.institution;
    }

    const instDoc = adminInstId ? await Institution.findById(adminInstId) : null;
    if (!instDoc) {
      return res.status(400).json({ message: 'Authorized institution could not be determined from your administrative scope.' });
    }

    if (!adminUniId && instDoc.university) {
      adminUniId = instDoc.university;
    }
    const uniDoc = adminUniId ? await University.findById(adminUniId) : null;
    if (!uniDoc) {
      return res.status(400).json({ message: 'Authorized university could not be determined from your administrative scope.' });
    }

    // University acronym is determined strictly from the authorized university record
    const uniAcronym = (uniDoc.acronym || uniDoc.code || 'UNI').trim().toUpperCase();

    // Cache all existing departments belonging to this authorized institution
    const availableDepts = await Department.find({ institution: instDoc._id });

    const created = [];
    const failures = [];
    const usedEmailsInBatch = new Set();
    const batchSeqTracker = new Map();

    for (let i = 0; i < students.length; i++) {
      const row = students[i];
      const rowNum = i + 1;
      const name = row.name?.trim();
      const personalEmail = (row.personalGmail || row.personalEmail || row.email || '').trim().toLowerCase();
      const currentSemester = Math.min(8, Math.max(1, parseInt(row.currentSemester || row.semester || 1, 10)));
      const division = (row.division || 'A').trim().toUpperCase();

      if (!name) {
        failures.push({ row: rowNum, reason: 'Student name is required' });
        continue;
      }
      if (!personalEmail) {
        failures.push({ row: rowNum, name, reason: 'Personal email/Gmail is required' });
        continue;
      }

      // 2. Validate Department from CSV against existing database records
      const rowDeptRaw = (row.department || row.dept || row.departmentName || '').trim();
      let targetDeptDoc = null;

      if (rowDeptRaw) {
        const cleanCsvDept = rowDeptRaw.toLowerCase();
        targetDeptDoc = availableDepts.find(d => 
          d.name.toLowerCase().trim() === cleanCsvDept ||
          (d.code && d.code.toLowerCase().trim() === cleanCsvDept) ||
          d.name.toLowerCase().replace(/&/g, 'and').trim() === cleanCsvDept.replace(/&/g, 'and').trim()
        );
      } else if (adminDeptDoc) {
        targetDeptDoc = adminDeptDoc;
      }

      if (!targetDeptDoc) {
        failures.push({
          row: rowNum,
          name,
          reason: `Department "${rowDeptRaw}" does not exist in authorized institution "${instDoc.name}". Departments must already exist in database.`
        });
        continue;
      }

      // Department scope authorization check
      if (targetDeptDoc.institution.toString() !== instDoc._id.toString()) {
        failures.push({
          row: rowNum,
          name,
          reason: `Department "${targetDeptDoc.name}" does not belong to your authorized institution (${instDoc.name}).`
        });
        continue;
      }

      if (adminDeptDoc && (req.user.role === 'dept_admin' || req.user.role === 'academic_admin' || req.user.role === 'academic_administrator')) {
        if (adminDeptDoc._id.toString() !== targetDeptDoc._id.toString()) {
          failures.push({
            row: rowNum,
            name,
            reason: `Department "${targetDeptDoc.name}" is outside your authorized department scope (${adminDeptDoc.name}).`
          });
          continue;
        }
      }

      const deptCode = (targetDeptDoc.code || 'DEPT').trim().toUpperCase();

      let user = null;
      let attempts = 0;
      let lastErr = null;

      while (!user && attempts < 5) {
        attempts++;
        try {
          const enrollmentNumber = await generateEnrollmentNumber(uniAcronym, deptCode, currentSemester, batchSeqTracker);
          const collegeEmail = await generateUniqueCollegeEmail(name, uniAcronym, usedEmailsInBatch);

          user = await User.create({
            name,
            email: collegeEmail,
            personalEmail,
            enrollmentNumber,
            password: row.password || 'Student@123',
            role: 'student',
            currentSemester,
            division,
            department: targetDeptDoc._id,
            institution: instDoc._id,
            university: uniDoc._id
          });
        } catch (err) {
          lastErr = err;
          if (err.code !== 11000 || attempts >= 5) {
            failures.push({ row: rowNum, name, reason: err.message });
            break;
          }
        }
      }

      if (user) {
        created.push(user);
      }
    }

    if (created.length > 0) {
      recordCriticalEvent({
        actor: req.user,
        eventFamily: 'BULK',
        severity: 'HIGH',
        action: 'bulk_operation',
        resource: 'user',
        description: `Bulk student import: ${created.length} student accounts created (${failures.length} failed)`,
        changes: { importedCount: created.length, failureCount: failures.length, targetResource: 'student' },
        ipAddress: req.ip || '',
        userAgent: req.headers ? (req.headers['user-agent'] || '') : '',
        university: uniDoc?._id,
        eventScope: 'UNIVERSITY'
      }).catch(() => {});
    }

    res.status(201).json({
      success: true,
      message: `Imported ${created.length} students successfully (${failures.length} failed)`,
      successCount: created.length,
      importedCount: created.length,
      failures,
      students: created
    });
  } catch (error) {
    next(error);
  }
};
