const mongoose = require('mongoose');
const AIPerformanceMetric = require('../models/AIPerformanceMetric');
const AIPerformanceConfig = require('../models/AIPerformanceConfig');
const aiPerformanceService = require('../services/aiPerformanceService');
const University = require('../models/University');
const Institution = require('../models/Institution');
const Department = require('../models/Department');
const User = require('../models/User');

/**
 * Build authorized MongoDB query filter based on authenticated user's role and hierarchy.
 * Enforces strict isolation - never trusts client-supplied scope IDs.
 */
const buildAuthorizedScopeQuery = async (user, queryParams = {}) => {
  const query = {};

  // 1. Enforce Role-Based Hierarchical Scope
  if (user.role === 'super_admin') {
    // Super Admin: platform-wide access, can optionally filter by any hierarchy parameter
    if (queryParams.professor && mongoose.Types.ObjectId.isValid(queryParams.professor)) {
      query.user = new mongoose.Types.ObjectId(queryParams.professor);
    }
    if (queryParams.department && mongoose.Types.ObjectId.isValid(queryParams.department)) {
      query.department = new mongoose.Types.ObjectId(queryParams.department);
    }
    if (queryParams.institution && mongoose.Types.ObjectId.isValid(queryParams.institution)) {
      query.institution = new mongoose.Types.ObjectId(queryParams.institution);
    } else if (queryParams.university && mongoose.Types.ObjectId.isValid(queryParams.university)) {
      const instIds = await Institution.find({ university: queryParams.university }).distinct('_id');
      query.$or = [
        { university: new mongoose.Types.ObjectId(queryParams.university) },
        { institution: { $in: instIds } }
      ];
    }
  } else if (user.role === 'university_admin') {
    // University Admin: strictly scoped to own university
    let uniId = user.university?._id || user.university;
    if (!uniId) {
      const uni = await University.findOne({ admin: user._id });
      if (uni) uniId = uni._id;
    }
    if (!uniId) {
      const err = new Error('Access denied: No university associated with this University Admin.');
      err.status = 403;
      throw err;
    }
    query.university = new mongoose.Types.ObjectId(uniId);

    // Filter by institution if requested and verified as child of university
    if (queryParams.institution && mongoose.Types.ObjectId.isValid(queryParams.institution)) {
      const verifiedInst = await Institution.findOne({ _id: queryParams.institution, university: uniId });
      if (verifiedInst) {
        query.institution = verifiedInst._id;
      } else {
        // Querying an institution outside own university yields no records
        query.institution = new mongoose.Types.ObjectId('000000000000000000000000');
      }
    }

    // Filter by department if requested and verified under university's institutions
    if (queryParams.department && mongoose.Types.ObjectId.isValid(queryParams.department)) {
      const verifiedDept = await Department.findById(queryParams.department).populate('institution');
      if (verifiedDept && verifiedDept.institution && String(verifiedDept.institution.university) === String(uniId)) {
        query.department = verifiedDept._id;
      } else {
        query.department = new mongoose.Types.ObjectId('000000000000000000000000');
      }
    }

    // Filter by professor if requested and verified under university
    if (queryParams.professor && mongoose.Types.ObjectId.isValid(queryParams.professor)) {
      const instIds = await Institution.find({ university: uniId }).distinct('_id');
      const verifiedProf = await User.findOne({
        _id: queryParams.professor,
        role: 'professor',
        $or: [{ university: uniId }, { institution: { $in: instIds } }]
      });
      if (verifiedProf) {
        query.user = verifiedProf._id;
      } else {
        query.user = new mongoose.Types.ObjectId('000000000000000000000000');
      }
    }
  } else if (user.role === 'inst_admin') {
    // Institution Admin: strictly scoped to own institution
    let instId = user.institution?._id || user.institution;
    if (!instId) {
      const inst = await Institution.findOne({ admin: user._id });
      if (inst) instId = inst._id;
    }
    if (!instId) {
      const err = new Error('Access denied: No institution associated with this Institution Admin.');
      err.status = 403;
      throw err;
    }
    query.institution = new mongoose.Types.ObjectId(instId);

    // Filter by department if verified under institution
    if (queryParams.department && mongoose.Types.ObjectId.isValid(queryParams.department)) {
      const verifiedDept = await Department.findOne({ _id: queryParams.department, institution: instId });
      if (verifiedDept) {
        query.department = verifiedDept._id;
      } else {
        query.department = new mongoose.Types.ObjectId('000000000000000000000000');
      }
    }

    // Filter by professor if verified under institution
    if (queryParams.professor && mongoose.Types.ObjectId.isValid(queryParams.professor)) {
      const verifiedProf = await User.findOne({
        _id: queryParams.professor,
        role: 'professor',
        institution: instId
      });
      if (verifiedProf) {
        query.user = verifiedProf._id;
      } else {
        query.user = new mongoose.Types.ObjectId('000000000000000000000000');
      }
    }
  } else if (user.role === 'dept_admin') {
    // Department Admin: strictly scoped to own department
    let deptId = user.department?._id || user.department;
    if (!deptId) {
      const dept = await Department.findOne({ admin: user._id });
      if (dept) deptId = dept._id;
    }
    if (!deptId) {
      const err = new Error('Access denied: No department associated with this Department Admin.');
      err.status = 403;
      throw err;
    }
    query.department = new mongoose.Types.ObjectId(deptId);

    // Filter by professor if verified under department
    if (queryParams.professor && mongoose.Types.ObjectId.isValid(queryParams.professor)) {
      const verifiedProf = await User.findOne({
        _id: queryParams.professor,
        role: 'professor',
        department: deptId
      });
      if (verifiedProf) {
        query.user = verifiedProf._id;
      } else {
        query.user = new mongoose.Types.ObjectId('000000000000000000000000');
      }
    }
  } else {
    // Explicitly reject any unauthorized roles
    const err = new Error('Access denied: Insufficient privileges for AI performance analytics.');
    err.status = 403;
    throw err;
  }

  // 2. Filter by Workflow
  if (queryParams.workflow && ['ASSIGNMENT_EVALUATION', 'TRANSCRIPTION', 'TTS_SYNTHESIS'].includes(queryParams.workflow)) {
    query.operationType = queryParams.workflow;
  }

  // 3. Filter by Status
  if (queryParams.status && ['success', 'failed'].includes(queryParams.status)) {
    query.status = queryParams.status;
  }

  // 4. Filter by Time Range
  const now = new Date();
  if (queryParams.timeRange === '24h') {
    query.startTime = { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) };
  } else if (queryParams.timeRange === '30d') {
    query.startTime = { $gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) };
  } else if (queryParams.timeRange === 'all') {
    // No time constraint
  } else if (queryParams.startDate || queryParams.endDate) {
    query.startTime = {};
    if (queryParams.startDate) query.startTime.$gte = new Date(queryParams.startDate);
    if (queryParams.endDate) query.startTime.$lte = new Date(queryParams.endDate);
  } else {
    // Default to 7 days
    query.startTime = { $gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) };
  }

  return query;
};

/**
 * Helper to fetch permissible hierarchy dropdown options based on current user's role
 */
const getPermittedFilterOptions = async (user) => {
  const options = {
    universities: [],
    institutions: [],
    departments: [],
    professors: []
  };

  try {
    if (user.role === 'super_admin') {
      options.universities = await University.find({ status: { $ne: 'inactive' } }).select('name code _id').sort({ name: 1 });
      options.institutions = await Institution.find({}).select('name code university _id').sort({ name: 1 });
      options.departments = await Department.find({}).select('name code institution _id').sort({ name: 1 });
      options.professors = await User.find({ role: 'professor', isActive: { $ne: false } }).select('name email department institution university _id').sort({ name: 1 });
    } else if (user.role === 'university_admin') {
      let uniId = user.university?._id || user.university;
      if (!uniId) {
        const uni = await University.findOne({ admin: user._id });
        if (uni) uniId = uni._id;
      }
      if (uniId) {
        options.institutions = await Institution.find({ university: uniId }).select('name code university _id').sort({ name: 1 });
        const instIds = options.institutions.map(i => i._id);
        if (instIds.length) {
          options.departments = await Department.find({ institution: { $in: instIds } }).select('name code institution _id').sort({ name: 1 });
          const deptIds = options.departments.map(d => d._id);
          options.professors = await User.find({
            role: 'professor',
            isActive: { $ne: false },
            $or: [{ university: uniId }, { institution: { $in: instIds } }, { department: { $in: deptIds } }]
          }).select('name email department institution university _id').sort({ name: 1 });
        }
      }
    } else if (user.role === 'inst_admin') {
      let instId = user.institution?._id || user.institution;
      if (!instId) {
        const inst = await Institution.findOne({ admin: user._id });
        if (inst) instId = inst._id;
      }
      if (instId) {
        options.departments = await Department.find({ institution: instId }).select('name code institution _id').sort({ name: 1 });
        const deptIds = options.departments.map(d => d._id);
        options.professors = await User.find({
          role: 'professor',
          isActive: { $ne: false },
          $or: [{ institution: instId }, { department: { $in: deptIds } }]
        }).select('name email department institution _id').sort({ name: 1 });
      }
    } else if (user.role === 'dept_admin') {
      let deptId = user.department?._id || user.department;
      if (!deptId) {
        const dept = await Department.findOne({ admin: user._id });
        if (dept) deptId = dept._id;
      }
      if (deptId) {
        options.professors = await User.find({
          role: 'professor',
          department: deptId,
          isActive: { $ne: false }
        }).select('name email _id').sort({ name: 1 });
      }
    }
  } catch (e) {
    console.error('[AIPerformanceController] Error resolving filter options:', e.message);
  }

  return options;
};

/**
 * @desc    Get scoped AI performance analytics overview
 * @route   GET /api/analytics/ai-performance/overview
 */
exports.getAIPerformanceOverview = async (req, res, next) => {
  try {
    const scopeQuery = await buildAuthorizedScopeQuery(req.user, req.query);

    // 1. Overall Aggregations across logical operations
    const [overallStats] = await AIPerformanceMetric.aggregate([
      { $match: scopeQuery },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          successful: {
            $sum: { $cond: [{ $in: ['$status', ['success', 'SUCCESS']] }, 1, 0] }
          },
          failed: {
            $sum: { $cond: [{ $in: ['$status', ['failed', 'FAILED']] }, 1, 0] }
          },
          totalDuration: { $sum: '$durationMs' },
          avgDuration: { $avg: '$durationMs' },
          minDuration: { $min: '$durationMs' },
          maxDuration: { $max: '$durationMs' }
        }
      }
    ]);

    const totalOperations = overallStats?.total || 0;
    const successfulOperations = overallStats?.successful || 0;
    const failedOperations = overallStats?.failed || 0;
    const successRate = totalOperations > 0 ? parseFloat(((successfulOperations / totalOperations) * 100).toFixed(1)) : 0;
    const failureRate = totalOperations > 0 ? parseFloat(((failedOperations / totalOperations) * 100).toFixed(1)) : 0;
    const avgDurationMs = overallStats ? Math.round(overallStats.avgDuration) : 0;

    // 2. Per-Workflow Aggregation
    const workflowStats = await AIPerformanceMetric.aggregate([
      { $match: scopeQuery },
      {
        $group: {
          _id: '$operationType',
          total: { $sum: 1 },
          successful: {
            $sum: { $cond: [{ $in: ['$status', ['success', 'SUCCESS']] }, 1, 0] }
          },
          failed: {
            $sum: { $cond: [{ $in: ['$status', ['failed', 'FAILED']] }, 1, 0] }
          },
          avgDuration: { $avg: '$durationMs' },
          minDuration: { $min: '$durationMs' },
          maxDuration: { $max: '$durationMs' }
        }
      }
    ]);

    // 3. Stage-level Latencies per workflow
    const stageStats = await AIPerformanceMetric.aggregate([
      { $match: scopeQuery },
      { $unwind: '$stages' },
      {
        $group: {
          _id: {
            workflow: '$operationType',
            stage: '$stages.stageName'
          },
          avgStageDuration: { $avg: '$stages.durationMs' },
          count: { $sum: 1 }
        }
      }
    ]);

    const stageMap = {};
    stageStats.forEach(st => {
      const wf = st._id.workflow;
      const stage = st._id.stage;
      if (!stageMap[wf]) stageMap[wf] = {};
      stageMap[wf][stage] = Math.round(st.avgStageDuration);
    });

    const standardWorkflows = ['ASSIGNMENT_EVALUATION', 'TRANSCRIPTION', 'TTS_SYNTHESIS'];
    const byWorkflow = {};

    standardWorkflows.forEach(wf => {
      const match = workflowStats.find(w => w._id === wf);
      const total = match ? match.total : 0;
      const success = match ? match.successful : 0;
      const failed = match ? match.failed : 0;
      byWorkflow[wf] = {
        total,
        successful: success,
        failed,
        successRate: total > 0 ? parseFloat(((success / total) * 100).toFixed(1)) : 0,
        failureRate: total > 0 ? parseFloat(((failed / total) * 100).toFixed(1)) : 0,
        avgDurationMs: match ? Math.round(match.avgDuration) : 0,
        minDurationMs: match ? match.minDuration : 0,
        maxDurationMs: match ? match.maxDuration : 0,
        stages: stageMap[wf] || {}
      };
    });

    // 4. Slowest Operations (top 5 for rapid diagnostic view)
    const slowestOperations = await AIPerformanceMetric.find(scopeQuery)
      .sort({ durationMs: -1 })
      .limit(5)
      .populate('user', 'name email role')
      .populate('department', 'name code')
      .populate('institution', 'name code')
      .populate('university', 'name code')
      .select('operationType durationMs status startTime endTime provider model targetLanguage errorCategory errorMessage resourceType resourceId stages user department institution university');

    // 5. Time series trend (average duration and counts per day per workflow)
    const timeTrend = await AIPerformanceMetric.aggregate([
      { $match: scopeQuery },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$startTime' } },
            workflow: '$operationType'
          },
          avgDuration: { $avg: '$durationMs' },
          count: { $sum: 1 },
          successful: {
            $sum: { $cond: [{ $in: ['$status', ['success', 'SUCCESS']] }, 1, 0] }
          },
          failed: {
            $sum: { $cond: [{ $in: ['$status', ['failed', 'FAILED']] }, 1, 0] }
          }
        }
      },
      { $sort: { '_id.date': 1 } }
    ]);

    // 6. Global Monitoring Status & Filter Options
    const isMonitoringEnabled = await aiPerformanceService.isMonitoringEnabled();
    const filterOptions = await getPermittedFilterOptions(req.user);

    res.json({
      success: true,
      data: {
        summary: {
          totalOperations,
          successfulOperations,
          failedOperations,
          successRate,
          failureRate,
          avgDurationMs
        },
        byWorkflow,
        slowestOperations,
        timeTrend,
        isMonitoringEnabled,
        filterOptions,
        userRole: req.user.role
      }
    });

  } catch (error) {
    console.error('[AIPerformanceController] Error in getAIPerformanceOverview:', error);
    if (error.status) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    next(error);
  }
};

/**
 * @desc    Get paginated AI performance operations history
 * @route   GET /api/analytics/ai-performance/history
 */
exports.getAIPerformanceHistory = async (req, res, next) => {
  try {
    const scopeQuery = await buildAuthorizedScopeQuery(req.user, req.query);

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const sortBy = req.query.sortBy || 'startTime';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
    const sort = { [sortBy]: sortOrder };

    const [total, records] = await Promise.all([
      AIPerformanceMetric.countDocuments(scopeQuery),
      AIPerformanceMetric.find(scopeQuery)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate('user', 'name email role')
        .populate('department', 'name code')
        .populate('institution', 'name code')
        .populate('university', 'name code')
        .lean()
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    res.json({
      success: true,
      pagination: {
        total,
        page,
        limit,
        totalPages
      },
      data: records
    });

  } catch (error) {
    console.error('[AIPerformanceController] Error in getAIPerformanceHistory:', error);
    if (error.status) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    next(error);
  }
};

/**
 * @desc    Get global AI performance monitoring configuration
 * @route   GET /api/analytics/ai-performance/config
 */
exports.getAIPerformanceConfig = async (req, res, next) => {
  try {
    let config = await AIPerformanceConfig.findOne({ configKey: 'GLOBAL_AI_MONITORING' })
      .populate('updatedBy', 'name email');

    if (!config) {
      config = await AIPerformanceConfig.create({
        configKey: 'GLOBAL_AI_MONITORING',
        enabled: true
      });
    }

    res.json({
      success: true,
      data: {
        enabled: config.enabled,
        updatedAt: config.updatedAt,
        updatedBy: config.updatedBy
      }
    });

  } catch (error) {
    console.error('[AIPerformanceController] Error in getAIPerformanceConfig:', error);
    next(error);
  }
};

/**
 * @desc    Update global AI performance monitoring configuration (Super Admin ONLY)
 * @route   PUT /api/analytics/ai-performance/config
 */
exports.updateAIPerformanceConfig = async (req, res, next) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Only Super Admin can change global AI performance monitoring settings.'
      });
    }

    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'Field "enabled" must be a boolean.'
      });
    }

    const updatedConfig = await aiPerformanceService.setMonitoringEnabled(enabled, req.user._id);

    res.json({
      success: true,
      message: `Global AI performance monitoring ${enabled ? 'enabled' : 'disabled'} successfully.`,
      data: {
        enabled: updatedConfig.enabled,
        updatedAt: updatedConfig.updatedAt
      }
    });

  } catch (error) {
    console.error('[AIPerformanceController] Error in updateAIPerformanceConfig:', error);
    next(error);
  }
};
