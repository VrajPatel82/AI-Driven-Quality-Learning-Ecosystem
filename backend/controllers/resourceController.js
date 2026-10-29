const resourceService = require('../services/resourceService');
const ResourceAllocation = require('../models/ResourceAllocation');
const ResourceAllocationHistory = require('../models/ResourceAllocationHistory');
const FileMetadata = require('../models/FileMetadata');
const MeteredAIUsageLedger = require('../models/MeteredAIUsageLedger');
const Department = require('../models/Department');
const Institution = require('../models/Institution');
const StorageUsageLog = require('../models/StorageUsageLog');

/**
 * Helper to batch-populate dynamic parentId and childId entities across all 5 tiers
 */
async function populateAllocationEntities(items) {
  if (!Array.isArray(items) || items.length === 0) return items;
  const University = require('../models/University');
  const User = require('../models/User');

  const modelMap = {
    UNIVERSITY: University,
    INSTITUTION: Institution,
    DEPARTMENT: Department,
    PROFESSOR: User
  };

  const plainItems = items.map(it => (it.toObject ? it.toObject() : { ...it }));

  const childIdsByLevel = {};
  const parentIdsByLevel = {};

  for (const it of plainItems) {
    if (it.childLevel && it.childId) {
      const cId = it.childId._id ? it.childId._id.toString() : it.childId.toString();
      if (!childIdsByLevel[it.childLevel]) childIdsByLevel[it.childLevel] = [];
      if (!childIdsByLevel[it.childLevel].includes(cId)) childIdsByLevel[it.childLevel].push(cId);
    }
    if (it.parentLevel && it.parentId && it.parentLevel !== 'SUPER_ADMIN') {
      const pId = it.parentId._id ? it.parentId._id.toString() : it.parentId.toString();
      if (!parentIdsByLevel[it.parentLevel]) parentIdsByLevel[it.parentLevel] = [];
      if (!parentIdsByLevel[it.parentLevel].includes(pId)) parentIdsByLevel[it.parentLevel].push(pId);
    }
  }

  const entityDocs = {};
  for (const [level, ids] of Object.entries(childIdsByLevel)) {
    const Model = modelMap[level];
    if (Model && ids.length) {
      const docs = await Model.find({ _id: { $in: ids } }).select('name email code departmentId professorId status isDeleted').lean();
      for (const d of docs) {
        entityDocs[`${level}_${d._id.toString()}`] = d;
      }
    }
  }

  for (const [level, ids] of Object.entries(parentIdsByLevel)) {
    const Model = modelMap[level];
    if (Model && ids.length) {
      const docs = await Model.find({ _id: { $in: ids } }).select('name email code status isDeleted').lean();
      for (const d of docs) {
        entityDocs[`${level}_${d._id.toString()}`] = d;
      }
    }
  }

  for (const it of plainItems) {
    if (it.childLevel && it.childId) {
      const cIdStr = it.childId._id ? it.childId._id.toString() : it.childId.toString();
      const resolved = entityDocs[`${it.childLevel}_${cIdStr}`];
      if (resolved) it.childId = resolved;
    }
    if (it.parentLevel && it.parentId) {
      const pIdStr = it.parentId._id ? it.parentId._id.toString() : it.parentId.toString();
      const resolved = entityDocs[`${it.parentLevel}_${pIdStr}`];
      if (resolved) it.parentId = resolved;
    }
  }

  return plainItems;
}

/**
 * Controller for /api/resources endpoints
 */

// GET /api/resources/overview
exports.getOverview = async (req, res) => {
  try {
    const { role, university, institution, department, _id } = req.user;
    let overview;

    if (role === 'super_admin') {
      overview = await resourceService.getSuperAdminResourceOverview();
    } else if (role === 'university_admin') {
      const uniId = university?._id || university;
      if (!uniId) return res.status(400).json({ message: 'User is not assigned to a university' });
      overview = await resourceService.getCompleteResourceOverview({ level: 'UNIVERSITY', id: uniId });
    } else if (role === 'inst_admin') {
      const instId = institution?._id || institution;
      if (!instId) return res.status(400).json({ message: 'User is not assigned to an institution' });
      overview = await resourceService.getInstitutionResourceOverview(instId);
    } else if (role === 'dept_admin') {
      const deptId = department?._id || department;
      if (!deptId) return res.status(400).json({ message: 'User is not assigned to a department' });
      overview = await resourceService.getDepartmentResourceOverview(deptId);
    } else if (role === 'professor') {
      overview = await resourceService.getProfessorResourceOverview(_id);
    } else {
      return res.status(403).json({ message: 'Students do not have resource management access' });
    }

    res.json({ success: true, data: overview });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

// GET /api/resources/allocations
exports.getAllocations = async (req, res) => {
  try {
    const { role, university, institution, department } = req.user;
    let filter = {};

    if (role === 'super_admin') {
      filter = { parentLevel: 'SUPER_ADMIN', resourceType: 'STORAGE' };
    } else if (role === 'university_admin') {
      const uniId = university?._id || university;
      filter = { parentLevel: 'UNIVERSITY', parentId: uniId, resourceType: 'STORAGE' };
    } else if (role === 'inst_admin') {
      filter = { parentLevel: 'INSTITUTION', parentId: institution, resourceType: 'STORAGE' };
    } else if (role === 'dept_admin') {
      filter = { parentLevel: 'DEPARTMENT', parentId: department, resourceType: 'STORAGE' };
    } else if (role === 'professor') {
      filter = { childLevel: 'PROFESSOR', childId: req.user._id, resourceType: 'STORAGE' };
    } else {
      return res.status(403).json({ message: 'Access denied' });
    }

    const rawAllocations = await ResourceAllocation.find(filter)
      .sort({ createdAt: -1 });

    const allocations = await populateAllocationEntities(rawAllocations);

    res.json({ success: true, data: allocations });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/resources/allocations
exports.createAllocation = async (req, res) => {
  try {
    const { role, university, institution, department, _id: userId } = req.user;
    const { resourceType, parentLevel, childLevel, childId, allocatedAmount, reason } = req.body;

    if (resourceType && resourceType !== 'STORAGE') {
      return res.status(400).json({ message: 'AI token/quota allocation has been removed. Commercial resource management supports STORAGE only.' });
    }

    let effectiveParentLevel = parentLevel;
    let effectiveParentId = null;
    let effectiveChildLevel = childLevel;

    if (role === 'super_admin') {
      effectiveParentLevel = 'SUPER_ADMIN';
      effectiveParentId = null;
      effectiveChildLevel = childLevel === 'INSTITUTION' ? 'INSTITUTION' : 'UNIVERSITY';
    } else if (role === 'university_admin') {
      const uniId = university?._id || university;
      if (!uniId) return res.status(400).json({ message: 'User is not assigned to a university' });
      const childInst = await Institution.findById(childId);
      if (!childInst || !childInst.university || childInst.university.toString() !== uniId.toString()) {
        return res.status(403).json({ message: 'Can only allocate storage to institutions belonging to your university' });
      }
      effectiveParentLevel = 'UNIVERSITY';
      effectiveParentId = uniId;
      effectiveChildLevel = 'INSTITUTION';
    } else if (role === 'inst_admin') {
      const instId = institution?._id || institution;
      if (!instId) return res.status(400).json({ message: 'User is not assigned to an institution' });
      if (req.body.parentId && String(req.body.parentId) !== String(instId)) {
        return res.status(403).json({ message: 'Institutional Admin can only allocate within their own institution to departments' });
      }
      effectiveParentLevel = 'INSTITUTION';
      effectiveParentId = instId;
      effectiveChildLevel = 'DEPARTMENT';
    } else if (role === 'dept_admin') {
      const deptId = department?._id || department;
      if (!deptId) return res.status(400).json({ message: 'User is not assigned to a department' });
      if (req.body.parentId && String(req.body.parentId) !== String(deptId)) {
        return res.status(403).json({ message: 'Departmental Admin can only allocate within their own department to professors' });
      }
      effectiveParentLevel = 'DEPARTMENT';
      effectiveParentId = deptId;
      effectiveChildLevel = 'PROFESSOR';
    } else {
      return res.status(403).json({ message: 'Unauthorized to manage allocations' });
    }

    if (!childId) {
      return res.status(400).json({ message: 'Target recipient (childId) is required' });
    }

    const allocation = await resourceService.saveAllocation(
      {
        resourceType,
        parentLevel: effectiveParentLevel,
        parentId: effectiveParentId,
        childLevel: effectiveChildLevel,
        childId,
        allocatedAmount: Number(allocatedAmount),
        reason
      },
      userId
    );

    res.status(201).json({ success: true, data: allocation });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

// PUT /api/resources/allocations/:id
exports.updateAllocation = async (req, res) => {
  try {
    const { role, university, institution, department, _id: userId } = req.user;
    const { id } = req.params;
    const { allocatedAmount, reason } = req.body;

    const existing = await ResourceAllocation.findById(id);
    if (!existing) return res.status(404).json({ message: 'Allocation record not found' });

    // Authorization check
    if (role === 'university_admin' && String(existing.parentId) !== String(university?._id || university)) {
      return res.status(403).json({ message: 'Cannot modify allocation belonging to another university' });
    }
    if (role === 'inst_admin' && String(existing.parentId) !== String(institution)) {
      return res.status(403).json({ message: 'Cannot modify allocation belonging to another institution' });
    }
    if (role === 'dept_admin' && String(existing.parentId) !== String(department)) {
      return res.status(403).json({ message: 'Cannot modify allocation belonging to another department' });
    }
    if (role !== 'super_admin' && role !== 'university_admin' && role !== 'inst_admin' && role !== 'dept_admin') {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const updated = await resourceService.saveAllocation(
      {
        resourceType: existing.resourceType,
        parentLevel: existing.parentLevel,
        parentId: existing.parentId,
        childLevel: existing.childLevel,
        childId: existing.childId,
        allocatedAmount: Number(allocatedAmount),
        reason
      },
      userId
    );

    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

// DELETE /api/resources/allocations/:id
exports.revokeAllocation = async (req, res) => {
  try {
    const { role, university, institution, department, _id: userId } = req.user;
    const { id } = req.params;

    const existing = await ResourceAllocation.findById(id);
    if (!existing) return res.status(404).json({ message: 'Allocation record not found' });

    if (role === 'university_admin' && String(existing.parentId) !== String(university?._id || university)) {
      return res.status(403).json({ message: 'Cannot revoke allocation belonging to another university' });
    }
    if (role === 'inst_admin' && String(existing.parentId) !== String(institution)) {
      return res.status(403).json({ message: 'Cannot revoke allocation belonging to another institution' });
    }
    if (role === 'dept_admin' && String(existing.parentId) !== String(department)) {
      return res.status(403).json({ message: 'Cannot revoke allocation belonging to another department' });
    }
    if (role !== 'super_admin' && role !== 'university_admin' && role !== 'inst_admin' && role !== 'dept_admin') {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const result = await resourceService.revokeAllocation(id, userId);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

// GET /api/resources/history
exports.getHistory = async (req, res) => {
  try {
    const { role, university, institution, department } = req.user;
    let filter = {};

    if (role === 'super_admin') {
      // view all history
    } else if (role === 'university_admin') {
      const uniId = university?._id || university;
      filter = {
        $or: [
          { parentLevel: 'UNIVERSITY', parentId: uniId },
          { childLevel: 'UNIVERSITY', childId: uniId }
        ]
      };
    } else if (role === 'inst_admin') {
      const instId = institution?._id || institution;
      filter = {
        $or: [
          { parentLevel: 'INSTITUTION', parentId: instId },
          { childLevel: 'INSTITUTION', childId: instId }
        ]
      };
    } else if (role === 'dept_admin') {
      const deptId = department?._id || department;
      filter = {
        $or: [
          { parentLevel: 'DEPARTMENT', parentId: deptId },
          { childLevel: 'DEPARTMENT', childId: deptId }
        ]
      };
    } else if (role === 'professor') {
      filter = { childLevel: 'PROFESSOR', childId: req.user._id };
    } else {
      return res.status(403).json({ message: 'Access denied' });
    }

    const rawHistory = await ResourceAllocationHistory.find(filter)
      .populate('performedBy', 'name role email')
      .sort({ createdAt: -1 })
      .limit(100);

    const history = await populateAllocationEntities(rawHistory);

    res.json({ success: true, data: history });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/resources/files
exports.getFiles = async (req, res) => {
  try {
    const { role, university, institution, department, _id } = req.user;
    let filter = { isDeleted: false };

    if (role === 'super_admin') {
      // view all
    } else if (role === 'university_admin') {
      const insts = await Institution.find({ university: university?._id || university }).select('_id');
      filter.institution = { $in: insts.map(i => i._id) };
    } else if (role === 'inst_admin') {
      filter.institution = institution;
    } else if (role === 'dept_admin') {
      filter.department = department;
    } else if (role === 'professor') {
      filter.owner = _id;
    } else {
      return res.status(403).json({ message: 'Access denied' });
    }

    const files = await FileMetadata.find(filter)
      .populate('owner', 'name email')
      .sort({ createdAt: -1 });

    res.json({ success: true, data: files });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/resources/ai-usage
exports.getAIUsage = async (req, res) => {
  try {
    const { role, university, institution, department, _id } = req.user;
    let filter = {};

    if (role === 'super_admin') {
      // view all
    } else if (role === 'university_admin') {
      const insts = await Institution.find({ university: university?._id || university }).select('_id');
      filter.institution = { $in: insts.map(i => i._id) };
    } else if (role === 'inst_admin') {
      filter.institution = institution;
    } else if (role === 'dept_admin') {
      filter.department = department;
    } else if (role === 'professor') {
      filter.user = _id;
    } else {
      return res.status(403).json({ message: 'Access denied' });
    }

    const usage = await MeteredAIUsageLedger.find(filter)
      .populate('user', 'name email role')
      .sort({ createdAt: -1 })
      .limit(100);

    res.json({ success: true, data: usage });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/resources/professor/breakdown
exports.getProfessorBreakdown = async (req, res) => {
  try {
    const { role, department, institution, university, _id: userId } = req.user;
    let targetProfessorId = userId;

    if (role !== 'professor') {
      const requestedId = req.query.professorId;
      if (!requestedId) {
        return res.status(400).json({ message: 'professorId query parameter is required for administrative lookup' });
      }

      const User = require('../models/User');
      const targetUser = await User.findById(requestedId);
      if (!targetUser || targetUser.role !== 'professor') {
        return res.status(404).json({ message: 'Professor not found' });
      }

      // Tenant isolation checks
      if (role === 'dept_admin') {
        const deptId = department?._id || department;
        if (!targetUser.department || targetUser.department.toString() !== deptId.toString()) {
          return res.status(403).json({ message: 'Access denied: Professor is not in your department' });
        }
      } else if (role === 'inst_admin') {
        const instId = institution?._id || institution;
        if (!targetUser.institution || targetUser.institution.toString() !== instId.toString()) {
          return res.status(403).json({ message: 'Access denied: Professor is not in your institution' });
        }
      } else if (role === 'university_admin') {
        const uniId = university?._id || university;
        const Institution = require('../models/Institution');
        const insts = await Institution.find({ university: uniId }).select('_id');
        const instIds = insts.map(i => i._id.toString());
        if (!targetUser.institution || !instIds.includes(targetUser.institution.toString())) {
          return res.status(403).json({ message: 'Access denied: Professor does not belong to your university' });
        }
      }

      targetProfessorId = targetUser._id;
    }

    const breakdown = await resourceService.getProfessorStorageBreakdown(targetProfessorId);
    const overview = await resourceService.getProfessorResourceOverview(targetProfessorId);

    res.json({
      success: true,
      data: {
        professorId: targetProfessorId,
        overview: overview.storage,
        breakdown
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/resources/usage-logs
exports.getStorageUsageLogs = async (req, res) => {
  try {
    const { role, department, institution, university, _id: userId } = req.user;
    const { limit = 50, page = 1, fileCategory, action } = req.query;

    let filter = {};

    if (role === 'professor') {
      filter.professor = userId;
    } else if (role === 'dept_admin') {
      const deptId = department?._id || department;
      filter.department = deptId;
      if (req.query.professorId) {
        filter.professor = req.query.professorId;
      }
    } else if (role === 'inst_admin') {
      const instId = institution?._id || institution;
      filter.institution = instId;
      if (req.query.professorId) filter.professor = req.query.professorId;
    } else if (role === 'university_admin') {
      const uniId = university?._id || university;
      const Institution = require('../models/Institution');
      const insts = await Institution.find({ university: uniId }).select('_id');
      filter.institution = { $in: insts.map(i => i._id) };
      if (req.query.professorId) filter.professor = req.query.professorId;
    } else if (role === 'super_admin') {
      if (req.query.professorId) filter.professor = req.query.professorId;
      if (req.query.institutionId) filter.institution = req.query.institutionId;
      if (req.query.departmentId) filter.department = req.query.departmentId;
    } else {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (fileCategory) filter.fileCategory = fileCategory;
    if (action) filter.action = action;

    const parsedLimit = Math.min(100, Math.max(1, parseInt(limit) || 50));
    const parsedPage = Math.max(1, parseInt(page) || 1);
    const skip = (parsedPage - 1) * parsedLimit;

    const [logs, total] = await Promise.all([
      StorageUsageLog.find(filter)
        .populate('professor', 'name email')
        .populate('lecture', 'title')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parsedLimit)
        .lean(),
      StorageUsageLog.countDocuments(filter)
    ]);

    res.json({
      success: true,
      data: logs,
      pagination: {
        total,
        page: parsedPage,
        limit: parsedLimit,
        pages: Math.ceil(total / parsedLimit)
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const Lecture = require('../models/Lecture');
const LectureAudio = require('../models/LectureAudio');
const Course = require('../models/Course');
const path = require('path');
const { isStudentEnrolledInCourse } = require('../utils/enrollmentHelper');

/**
 * Helper to validate whether an authenticated user is authorized to stream/access an objectKey.
 * Resolves storage key to FileMetadata / Lecture / Course domain entities and applies RBAC / Student enrollment rules.
 */
async function validateObjectAccess(user, rawObjectKey) {
  if (!user || !rawObjectKey) return false;

  // 1. Prevent path traversal & malicious key manipulation
  const decodedKey = decodeURIComponent(rawObjectKey);
  if (decodedKey.includes('..') || decodedKey.includes('\\') || decodedKey.includes('%2e%2e')) {
    console.warn(`[Security] Path traversal attempt blocked: ${rawObjectKey}`);
    return false;
  }

  // Clean object key
  let objectKey = decodedKey;
  if (objectKey.includes('?')) {
    objectKey = objectKey.split('?')[0];
  }
  if (objectKey.startsWith('/uploads/')) {
    objectKey = objectKey.replace('/uploads/', '');
  } else if (objectKey.includes('/api/resources/storage/object/')) {
    objectKey = objectKey.split('/api/resources/storage/object/')[1];
    if (objectKey.includes('?')) {
      objectKey = objectKey.split('?')[0];
    }
  }

  // 2. Reject assignment files and student submission files from lecture storage streaming
  if (
    objectKey.toLowerCase().startsWith('assignments') ||
    objectKey.toLowerCase().startsWith('submissions') ||
    objectKey.toLowerCase().includes('assignment')
  ) {
    console.warn(`[Security] Assignment storage access attempt blocked via lecture media route: ${objectKey}`);
    return false;
  }

  // 3. Super Admin has platform-wide access
  if (user.role === 'super_admin') {
    return true;
  }

  // 4. Resolve FileMetadata and/or Lecture domain entities
  let fileMeta = await FileMetadata.findOne({
    $or: [{ storageKey: objectKey }, { fileName: objectKey }],
    isDeleted: false
  });

  // Explicit check for assignment/submission metadata
  if (fileMeta && (fileMeta.relatedEntityType === 'LAB_SUBMISSION' || fileMeta.relatedEntityType === 'ASSIGNMENT')) {
    return false;
  }

  let lecture = null;
  let courseId = null;

  if (fileMeta) {
    if (['LECTURE', 'LAB', 'LECTURE_MATERIAL', 'TRANSCRIPT_PDF'].includes(fileMeta.relatedEntityType)) {
      if (fileMeta.relatedEntityId) {
        lecture = await Lecture.findById(fileMeta.relatedEntityId);
      }
    } else if (fileMeta.relatedEntityType === 'GENERATED_AUDIO') {
      if (fileMeta.relatedEntityId) {
        const audioRec = await LectureAudio.findById(fileMeta.relatedEntityId);
        if (audioRec?.lecture) {
          lecture = await Lecture.findById(audioRec.lecture);
        }
      }
    }
  }

  // Fallback domain lookup if FileMetadata record missing (e.g. legacy local uploads)
  if (!lecture) {
    const baseKey = path.basename(objectKey);
    lecture = await Lecture.findOne({
      $or: [
        { fileKey: objectKey },
        { fileKey: baseKey },
        { fileUrl: { $regex: baseKey } }
      ]
    });

    if (!lecture) {
      const audioRec = await LectureAudio.findOne({
        $or: [
          { storageKey: objectKey },
          { storageKey: baseKey },
          { audioUrl: { $regex: baseKey } }
        ]
      });
      if (audioRec?.lecture) {
        lecture = await Lecture.findById(audioRec.lecture);
      }
    }
  }

  // If object cannot be resolved to FileMetadata or a valid Lecture entity, reject
  if (!fileMeta && !lecture) {
    console.warn(`[Security] Storage object could not be resolved to authorized entity: ${objectKey}`);
    return false;
  }

  if (lecture) {
    courseId = lecture.course?._id || lecture.course;
  }

  // 5. Role-Specific Authorization Check

  // STUDENT ROLE
  if (user.role === 'student') {
    if (!courseId) return false;
    return await isStudentEnrolledInCourse(user._id, courseId, user);
  }

  // PROFESSOR ROLE
  if (user.role === 'professor') {
    if (fileMeta && fileMeta.owner && fileMeta.owner.toString() === user._id.toString()) return true;
    if (lecture && lecture.uploadedBy && lecture.uploadedBy.toString() === user._id.toString()) return true;

    if (user.department && courseId) {
      const course = await Course.findById(courseId);
      const userDeptId = (user.department._id || user.department).toString();
      if (course && course.department.toString() === userDeptId) return true;
    }
    return false;
  }

  // DEPARTMENT ADMIN ROLE
  if (user.role === 'dept_admin') {
    const userDeptId = user.department?._id || user.department;
    if (!userDeptId) return false;

    if (fileMeta && fileMeta.department && fileMeta.department.toString() === userDeptId.toString()) {
      return true;
    }
    if (courseId) {
      const course = await Course.findById(courseId);
      if (course && course.department.toString() === userDeptId.toString()) {
        return true;
      }
    }
    return false;
  }

  // INSTITUTION ADMIN ROLE
  if (user.role === 'inst_admin') {
    const userInstId = user.institution?._id || user.institution;
    if (!userInstId) return false;

    if (fileMeta && fileMeta.institution && fileMeta.institution.toString() === userInstId.toString()) {
      return true;
    }
    if (courseId) {
      const Department = require('../models/Department');
      const course = await Course.findById(courseId);
      if (course) {
        const dept = await Department.findById(course.department);
        if (dept && dept.institution.toString() === userInstId.toString()) {
          return true;
        }
      }
    }
    return false;
  }

  // UNIVERSITY ADMIN ROLE
  if (user.role === 'university_admin') {
    const userUniId = user.university?._id || user.university;
    if (!userUniId) return false;

    const fileInstId = fileMeta?.institution;
    if (fileInstId) {
      const inst = await Institution.findById(fileInstId);
      if (inst && inst.university.toString() === userUniId.toString()) {
        return true;
      }
    }
    if (courseId) {
      const Department = require('../models/Department');
      const course = await Course.findById(courseId);
      if (course) {
        const dept = await Department.findById(course.department);
        if (dept) {
          const inst = await Institution.findById(dept.institution);
          if (inst && inst.university.toString() === userUniId.toString()) {
            return true;
          }
        }
      }
    }
    return false;
  }

  return false;
}

// GET /api/resources/storage/object/*
exports.streamObject = async (req, res) => {
  try {
    const storageService = require('../services/storageService');
    const objectKey = req.params[0] || req.params.key;
    if (!objectKey) {
      return res.status(400).json({ message: 'Object key is required' });
    }

    // Object-Level Authorization Enforcement (BPOA / IDOR Prevention)
    const isAuthorized = await validateObjectAccess(req.user, objectKey);
    if (!isAuthorized) {
      return res.status(403).json({ message: 'Access denied. You are not authorized to view this resource.' });
    }

    // 2. Range-Aware Object Streaming
    const rangeHeader = req.headers.range || null;
    const result = await storageService.getObjectStream(objectKey, rangeHeader);

    // 3. Handle 416 Range Not Satisfiable
    if (result.isInvalidRange || result.statusCode === 416) {
      res.setHeader('Accept-Ranges', 'bytes');
      if (result.totalSize) {
        res.setHeader('Content-Range', `bytes */${result.totalSize}`);
      }
      return res.status(416).json({ message: 'Requested range not satisfiable' });
    }

    // 4. Set Range & Content Response Headers
    res.setHeader('Accept-Ranges', 'bytes');
    if (result.contentType) res.setHeader('Content-Type', result.contentType);
    if (result.contentLength !== undefined && result.contentLength !== null) {
      res.setHeader('Content-Length', result.contentLength);
    }
    if (result.contentRange) {
      res.setHeader('Content-Range', result.contentRange);
    }

    // 5. Set HTTP Status Code (206 for partial content, 200 for full content)
    res.status(result.statusCode || (result.isPartial ? 206 : 200));

    result.stream.pipe(res);
  } catch (err) {
    res.status(404).json({ message: err.message || 'Storage object not found' });
  }
};

function formatBytes(bytes, decimals = 2) {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// GET /api/resources/storage/b2-status
exports.getB2StorageStatus = async (req, res) => {
  try {
    const { role } = req.user;
    if (role !== 'super_admin' && role !== 'university_admin') {
      return res.status(403).json({ message: 'Unauthorized. Storage pool status is restricted to administrative roles.' });
    }

    const StorageSystemConfig = require('../models/StorageSystemConfig');
    const storageService = require('../services/storageService');
    const ResourceAllocation = require('../models/ResourceAllocation');

    const config = await StorageSystemConfig.getConfig();
    const b2Usage = await storageService.getB2ActualStorageUsage({ forceRefresh: false });

    // Top level allocated check
    const topAllocations = await ResourceAllocation.aggregate([
      { $match: { resourceType: 'STORAGE', parentLevel: 'SUPER_ADMIN' } },
      { $group: { _id: null, total: { $sum: '$allocatedAmount' } } }
    ]);
    const totalAllocated = topAllocations[0]?.total || 0;
    const isOverAllocated = totalAllocated > config.masterPoolBytes;
    const overAllocatedBytes = isOverAllocated ? totalAllocated - config.masterPoolBytes : 0;

    res.json({
      success: true,
      data: {
        provider: config.provider,
        bucketName: config.bucketName,
        actualUsedBytes: b2Usage.actualUsedBytes,
        actualUsedFormatted: formatBytes(b2Usage.actualUsedBytes),
        objectCount: b2Usage.objectCount,
        masterPoolBytes: config.masterPoolBytes,
        masterPoolFormatted: formatBytes(config.masterPoolBytes),
        remainingPoolBytes: b2Usage.remainingPoolBytes,
        remainingPoolFormatted: formatBytes(b2Usage.remainingPoolBytes),
        lastSyncedAt: b2Usage.lastSyncedAt,
        syncStatus: b2Usage.syncStatus,
        isStale: b2Usage.isStale,
        error: b2Usage.error || null,
        allocatedBytes: totalAllocated,
        allocatedFormatted: formatBytes(totalAllocated),
        isOverAllocated,
        overAllocatedBytes,
        overAllocatedFormatted: formatBytes(overAllocatedBytes),
        systemStatus: isOverAllocated ? 'OVER_ALLOCATED' : 'HEALTHY'
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/resources/storage/b2-sync
exports.syncB2Storage = async (req, res) => {
  try {
    const { role } = req.user;
    if (role !== 'super_admin') {
      return res.status(403).json({ message: 'Unauthorized. Only Super Admin can initiate live Backblaze B2 synchronization.' });
    }

    const storageService = require('../services/storageService');
    const b2Usage = await storageService.getB2ActualStorageUsage({ forceRefresh: true });

    res.json({
      success: true,
      message: 'Backblaze B2 storage scan completed successfully',
      data: b2Usage
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/resources/storage/reconciliation
exports.getStorageReconciliation = async (req, res) => {
  try {
    const { role } = req.user;
    if (role !== 'super_admin' && role !== 'university_admin') {
      return res.status(403).json({ message: 'Unauthorized. Reconciliation diagnostics are restricted to administrators.' });
    }

    const storageService = require('../services/storageService');
    const reconciliation = await storageService.getStorageReconciliation();

    res.json({
      success: true,
      data: reconciliation
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

