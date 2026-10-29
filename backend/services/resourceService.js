const mongoose = require('mongoose');
const ResourceAllocation = require('../models/ResourceAllocation');
const ResourceAllocationHistory = require('../models/ResourceAllocationHistory');
const FileMetadata = require('../models/FileMetadata');
const MeteredAIUsageLedger = require('../models/MeteredAIUsageLedger');
const AIMessage = require('../models/AIMessage');
const User = require('../models/User');
const Department = require('../models/Department');
const StorageUsageLog = require('../models/StorageUsageLog');

/**
 * Authoritative Resource Service
 * Centralized calculation & enforcement layer for STORAGE and METERED_AI resources.
 */

const StorageSystemConfig = require('../models/StorageSystemConfig');
const StorageUploadReservation = require('../models/StorageUploadReservation');

// Centralized master storage pool accessor (No fake 10 TB defaults)
async function getMasterStoragePoolBytes() {
  const config = await StorageSystemConfig.getConfig();
  return config.masterPoolBytes || (10 * 1024 * 1024 * 1024); // 10 GB default
}

/**
 * Derive high-level file category for breakdown and audit logging
 */
function deriveFileCategory(relatedEntityType, fileName = '') {
  const lowerName = (fileName || '').toLowerCase();
  if (relatedEntityType === 'GENERATED_AUDIO') return 'GENERATED_AUDIO';
  if (relatedEntityType === 'LECTURE_MATERIAL') return 'LECTURE_MATERIAL';
  if (relatedEntityType === 'LAB') return 'LAB';
  if (relatedEntityType === 'OTHER' && (lowerName.endsWith('.pdf') || lowerName.includes('transcript'))) {
    return 'TRANSCRIPT_PDF';
  }
  if (relatedEntityType === 'LECTURE') return 'LECTURE_VIDEO';
  return 'OTHER';
}

/**
 * Authoritative breakdown of a professor's storage usage from active FileMetadata
 */
async function getProfessorStorageBreakdown(professorId) {
  const match = {
    owner: new mongoose.Types.ObjectId(professorId),
    isDeleted: false
  };

  const files = await FileMetadata.find(match).lean();

  const breakdown = {
    lectureVideos: { bytes: 0, count: 0 },
    additionalMaterials: { bytes: 0, count: 0 },
    transcriptPdfs: { bytes: 0, count: 0 },
    generatedAudio: { bytes: 0, count: 0 },
    otherFiles: { bytes: 0, count: 0 },
    totalUsed: 0
  };

  for (const file of files) {
    const size = file.fileSizeBytes || 0;
    const cat = deriveFileCategory(file.relatedEntityType, file.fileName);

    if (cat === 'LECTURE_VIDEO') {
      breakdown.lectureVideos.bytes += size;
      breakdown.lectureVideos.count += 1;
    } else if (cat === 'LECTURE_MATERIAL') {
      breakdown.additionalMaterials.bytes += size;
      breakdown.additionalMaterials.count += 1;
    } else if (cat === 'TRANSCRIPT_PDF') {
      breakdown.transcriptPdfs.bytes += size;
      breakdown.transcriptPdfs.count += 1;
    } else if (cat === 'GENERATED_AUDIO') {
      breakdown.generatedAudio.bytes += size;
      breakdown.generatedAudio.count += 1;
    } else {
      breakdown.otherFiles.bytes += size;
      breakdown.otherFiles.count += 1;
    }
    breakdown.totalUsed += size;
  }

  return breakdown;
}

// Helper to sum pipeline results
async function aggregateSum(model, matchQuery, sumField) {
  const result = await model.aggregate([
    { $match: matchQuery },
    { $group: { _id: null, total: { $sum: `$${sumField}` } } }
  ]);
  return result.length > 0 ? result[0].total : 0;
}

/**
 * Get allocated amount for a specific entity
 */
async function getAllocatedResource(resourceType, childLevel, childId) {
  const query = { resourceType, childLevel, childId: new mongoose.Types.ObjectId(childId) };
  const record = await ResourceAllocation.findOne(query);
  return record ? record.allocatedAmount : 0;
}

/**
 * Get total amount distributed by a parent to its children
 */
async function getDistributedResource(resourceType, parentLevel, parentId, excludeChildId = null) {
  const matchQuery = { resourceType, parentLevel };
  if (parentId) {
    matchQuery.parentId = new mongoose.Types.ObjectId(parentId);
  } else {
    matchQuery.parentId = null;
  }
  if (excludeChildId) {
    matchQuery.childId = { $ne: new mongoose.Types.ObjectId(excludeChildId) };
  }
  return await aggregateSum(ResourceAllocation, matchQuery, 'allocatedAmount');
}

/**
 * Get actual storage usage from active FileMetadata
 */
async function getActualStorageUsage(scope) {
  const matchQuery = { isDeleted: false };
  if (scope.level === 'UNIVERSITY' && scope.id) {
    const Institution = require('../models/Institution');
    const insts = await Institution.find({ university: scope.id }).select('_id');
    const instIds = insts.map(i => i._id);
    matchQuery.institution = { $in: instIds };
  } else if (scope.level === 'INSTITUTION' && scope.id) {
    matchQuery.institution = new mongoose.Types.ObjectId(scope.id);
  } else if (scope.level === 'DEPARTMENT' && scope.id) {
    matchQuery.department = new mongoose.Types.ObjectId(scope.id);
  } else if (scope.level === 'PROFESSOR' && scope.id) {
    matchQuery.owner = new mongoose.Types.ObjectId(scope.id);
  }
  return await aggregateSum(FileMetadata, matchQuery, 'fileSizeBytes');
}

/**
 * Get actual metered AI usage from MeteredAIUsageLedger
 */
async function getActualMeteredAIUsage(scope) {
  const matchQuery = {};
  if (scope.level === 'INSTITUTION' && scope.id) {
    matchQuery.institution = new mongoose.Types.ObjectId(scope.id);
  } else if (scope.level === 'DEPARTMENT' && scope.id) {
    matchQuery.department = new mongoose.Types.ObjectId(scope.id);
  } else if (scope.level === 'PROFESSOR' && scope.id) {
    matchQuery.user = new mongoose.Types.ObjectId(scope.id);
  }
  return await aggregateSum(MeteredAIUsageLedger, matchQuery, 'quantity');
}

/**
 * Get total AI Tutor message usage (Permanently Free / Non-metered)
 */
async function getAITutorUsage(scope) {
  if (scope.level === 'SUPER_ADMIN') {
    return await AIMessage.countDocuments({ role: 'user' });
  }
  if (scope.level === 'PROFESSOR' && scope.id) {
    return await AIMessage.countDocuments({ sender: scope.id });
  }
  // For institution/dept, count messages by users in that institution/dept
  let userQuery = {};
  if (scope.level === 'INSTITUTION' && scope.id) userQuery.institution = scope.id;
  if (scope.level === 'DEPARTMENT' && scope.id) userQuery.department = scope.id;
  const users = await User.find(userQuery).select('_id');
  const userIds = users.map(u => u._id);
  return await AIMessage.countDocuments({ sender: { $in: userIds } });
}

/**
 * Get remaining resource against allocated quota
 */
async function getRemainingResource(scope, resourceType = 'STORAGE') {
  if (resourceType !== 'STORAGE') {
    return 0;
  }
  let allocated = 0;
  let used = await getActualStorageUsage(scope);

  if (scope.level === 'SUPER_ADMIN') {
    allocated = await getMasterStoragePoolBytes();
  } else {
    allocated = await getAllocatedResource('STORAGE', scope.level, scope.id);
  }
  return Math.max(0, allocated - used);
}

/**
 * Complete resource overview for any scope
 */
async function getCompleteResourceOverview(scope) {
  let storageTotalCapacity = 0;
  let storageAllocated = 0;
  let storageDistributed = 0;

  if (scope.level === 'SUPER_ADMIN') {
    const masterPoolBytes = await getMasterStoragePoolBytes();
    storageTotalCapacity = masterPoolBytes;
    storageDistributed = await aggregateSum(ResourceAllocation, { resourceType: 'STORAGE', parentLevel: 'SUPER_ADMIN' }, 'allocatedAmount');
    storageAllocated = masterPoolBytes;
  } else {
    storageAllocated = await getAllocatedResource('STORAGE', scope.level, scope.id);
    storageTotalCapacity = storageAllocated;

    // Map scope level to parent level for child distribution calculation
    const parentLevelMap = { UNIVERSITY: 'UNIVERSITY', INSTITUTION: 'INSTITUTION', DEPARTMENT: 'DEPARTMENT' };
    if (parentLevelMap[scope.level]) {
      storageDistributed = await getDistributedResource('STORAGE', parentLevelMap[scope.level], scope.id);
    }
  }

  const storageUsed = await getActualStorageUsage(scope);
  const aiTutorCount = await getAITutorUsage(scope);

  if (scope.level === 'SUPER_ADMIN') {
    const storageConfig = await StorageSystemConfig.getConfig();
    const masterPoolBytes = storageConfig.masterPoolBytes || (10 * 1024 * 1024 * 1024);

    // Retrieve live or cached B2 actual usage
    const storageService = require('./storageService');
    const b2Usage = await storageService.getB2ActualStorageUsage({ forceRefresh: false });
    const b2ActualBytes = b2Usage.actualUsedBytes || 0;

    const isOverAllocated = storageDistributed > masterPoolBytes;
    const overAllocatedBytes = isOverAllocated ? storageDistributed - masterPoolBytes : 0;
    const storageUnallocated = isOverAllocated ? 0 : Math.max(0, masterPoolBytes - storageDistributed);
    const effectiveUsed = Math.max(b2ActualBytes, storageUsed);
    const remainingApplicationCapacity = Math.max(0, masterPoolBytes - effectiveUsed);
    const storagePct = masterPoolBytes > 0 ? Number(((effectiveUsed / masterPoolBytes) * 100).toFixed(2)) : 0;
    const remainingPct = masterPoolBytes > 0 ? Number(((remainingApplicationCapacity / masterPoolBytes) * 100).toFixed(2)) : 0;

    // Single-pass aggregated University Storage Overview
    const universityOverview = await getUniversityStorageOverview();

    return {
      scope,
      storage: {
        totalCapacity: masterPoolBytes,
        masterPoolBytes,
        masterPoolFormatted: formatBytes(masterPoolBytes),
        allocated: storageDistributed, // Sum of storage currently allocated to Universities
        distributed: storageDistributed,
        unallocated: storageUnallocated,
        availableToAllocate: storageUnallocated,
        used: storageUsed, // Authoritative FileMetadata usage
        actualUsed: storageUsed,
        b2ActualUsage: b2ActualBytes, // Verified Backblaze B2 physical bytes
        b2ObjectCount: b2Usage.objectCount || 0,
        b2RemainingCapacity: remainingApplicationCapacity,
        remaining: remainingApplicationCapacity,
        percentageUsed: storagePct,
        remainingPercentage: remainingPct,
        universityOverview,
        isOverAllocated,
        overAllocatedBytes,
        systemStatus: isOverAllocated ? 'OVER_ALLOCATED' : 'HEALTHY',
        migrationRequired: isOverAllocated,
        b2Status: {
          provider: storageConfig.provider,
          bucketName: storageConfig.bucketName,
          actualUsedBytes: b2ActualBytes,
          objectCount: b2Usage.objectCount || 0,
          lastSyncedAt: b2Usage.lastSyncedAt,
          syncStatus: b2Usage.syncStatus,
          isStale: b2Usage.isStale,
          error: b2Usage.error || null
        },
        globalLowStorageWarning: remainingPct <= 5
      },
      aiTutor: {
        used: aiTutorCount,
        metered: false,
        cost: 0
      }
    };
  }

  const storageRemaining = Math.max(0, storageAllocated - storageUsed);
  const storageUnallocated = Math.max(0, storageAllocated - storageDistributed);
  const storagePct = storageAllocated > 0 ? Number(((storageUsed / storageAllocated) * 100).toFixed(2)) : 0;
  const remainingPct = storageAllocated > 0 ? Number(((storageRemaining / storageAllocated) * 100).toFixed(2)) : 0;

  const resultOverview = {
    scope,
    storage: {
      totalCapacity: storageAllocated,
      allocated: storageAllocated,
      used: storageUsed,
      remaining: storageRemaining,
      distributed: storageDistributed,
      unallocated: storageUnallocated,
      availableToAllocate: storageUnallocated,
      percentageUsed: storagePct,
      remainingPercentage: remainingPct,
      lowStorageWarning: storageAllocated > 0 && remainingPct <= 5,
      isFull: storageAllocated > 0 && storageRemaining <= 0
    },
    aiTutor: {
      used: aiTutorCount,
      metered: false,
      cost: 0
    }
  };

  if (scope.level === 'UNIVERSITY' && scope.id) {
    const instOverview = await getInstitutionStorageOverviewForUniversity(scope.id);
    resultOverview.storage.institutionOverview = instOverview;
    resultOverview.storage.childOverview = instOverview;
  } else if (scope.level === 'INSTITUTION' && scope.id) {
    const deptOverview = await getDepartmentStorageOverviewForInstitution(scope.id);
    resultOverview.storage.departmentOverview = deptOverview;
    resultOverview.storage.childOverview = deptOverview;
  } else if (scope.level === 'DEPARTMENT' && scope.id) {
    const profOverview = await getProfessorStorageOverviewForDepartment(scope.id);
    resultOverview.storage.professorOverview = profOverview;
    resultOverview.storage.childOverview = profOverview;
  } else if (scope.level === 'PROFESSOR' && scope.id) {
    resultOverview.storage.breakdown = await getProfessorStorageBreakdown(scope.id);
  }

  return resultOverview;
}

async function getSuperAdminResourceOverview() {
  return await getCompleteResourceOverview({ level: 'SUPER_ADMIN' });
}

async function getInstitutionResourceOverview(institutionId) {
  return await getCompleteResourceOverview({ level: 'INSTITUTION', id: institutionId });
}

async function getDepartmentResourceOverview(departmentId) {
  return await getCompleteResourceOverview({ level: 'DEPARTMENT', id: departmentId });
}

async function getProfessorResourceOverview(professorId) {
  return await getCompleteResourceOverview({ level: 'PROFESSOR', id: professorId });
}

/**
 * Create or update an allocation with strict parent-child limit checks
 */
async function saveAllocation({ resourceType = 'STORAGE', parentLevel, parentId, childLevel, childId, allocatedAmount, reason = '' }, performedBy = null) {
  if (resourceType !== 'STORAGE') {
    const err = new Error('AI token/quota allocation has been removed. Commercial resource management supports STORAGE only.');
    err.statusCode = 400;
    throw err;
  }

  if (allocatedAmount < 0) {
    const err = new Error('Allocation amount cannot be negative');
    err.statusCode = 400;
    throw err;
  }

  // Enforce valid hierarchy paths
  const validPaths = {
    SUPER_ADMIN: ['UNIVERSITY', 'INSTITUTION'],
    UNIVERSITY: ['INSTITUTION'],
    INSTITUTION: ['DEPARTMENT'],
    DEPARTMENT: ['PROFESSOR']
  };

  if (!validPaths[parentLevel] || !validPaths[parentLevel].includes(childLevel)) {
    const err = new Error(`Invalid allocation path: ${parentLevel} cannot allocate directly to ${childLevel}`);
    err.statusCode = 400;
    throw err;
  }

  // 1. Parent availability check
  let parentAllocated = 0;
  if (parentLevel === 'SUPER_ADMIN') {
    parentAllocated = await getMasterStoragePoolBytes();
  } else {
    const parentAllocationRecord = await ResourceAllocation.findOne({
      resourceType,
      childLevel: parentLevel,
      childId: new mongoose.Types.ObjectId(parentId)
    });
    parentAllocated = parentAllocationRecord ? parentAllocationRecord.allocatedAmount : 0;
  }

  const distributedToOthers = await getDistributedResource(resourceType, parentLevel, parentId, childId);
  const parentAvailable = parentAllocated - distributedToOthers;

  if (allocatedAmount > parentAvailable) {
    const err = new Error(
      parentLevel === 'SUPER_ADMIN'
        ? `Allocation request (${formatBytes(allocatedAmount)}) exceeds available unallocated master storage pool (${formatBytes(Math.max(0, parentAvailable))}). Total master pool: ${formatBytes(parentAllocated)}, already distributed: ${formatBytes(distributedToOthers)}.`
        : `Allocation request (${allocatedAmount} bytes) exceeds available unallocated storage pool (${parentAvailable} bytes)`
    );
    err.statusCode = 409;
    throw err;
  }

  // 2. Child current usage check (cannot reduce below actual usage)
  const childScope = { level: childLevel, id: childId };
  let childActualUsed = 0;
  if (resourceType === 'STORAGE') childActualUsed = await getActualStorageUsage(childScope);
  else childActualUsed = await getActualMeteredAIUsage(childScope);

  if (allocatedAmount < childActualUsed) {
    const err = new Error(`Cannot reduce allocation to ${allocatedAmount} because child has current actual usage of ${childActualUsed}`);
    err.statusCode = 409;
    throw err;
  }

  // Find existing record
  const filter = {
    resourceType,
    parentLevel,
    parentId: parentId ? new mongoose.Types.ObjectId(parentId) : null,
    childLevel,
    childId: new mongoose.Types.ObjectId(childId)
  };

  const existing = await ResourceAllocation.findOne(filter);
  const previousAllocation = existing ? existing.allocatedAmount : 0;
  const difference = allocatedAmount - previousAllocation;

  let action = 'ALLOCATED';
  if (existing) {
    if (allocatedAmount > previousAllocation) action = 'INCREASED';
    else if (allocatedAmount < previousAllocation) action = 'DECREASED';
    else action = 'INCREASED'; // no-op update
  }

  let allocation;
  if (existing) {
    existing.allocatedAmount = allocatedAmount;
    allocation = await existing.save();
  } else {
    allocation = await ResourceAllocation.create({ ...filter, allocatedAmount });
  }

  // Record history
  await ResourceAllocationHistory.create({
    resourceType,
    parentLevel,
    parentId: parentId ? new mongoose.Types.ObjectId(parentId) : null,
    childLevel,
    childId: new mongoose.Types.ObjectId(childId),
    previousAllocation,
    newAllocation: allocatedAmount,
    difference,
    action,
    performedBy: performedBy ? new mongoose.Types.ObjectId(performedBy) : null,
    reason
  });

  // Record Platform Configuration Critical Event
  const { recordCriticalEvent } = require('./auditService');
  recordCriticalEvent({
    actor: performedBy || new mongoose.Types.ObjectId(),
    eventFamily: 'CONFIGURATION',
    severity: 'HIGH',
    action: 'config_change',
    resource: 'platform',
    description: `Platform storage policy updated: ${parentLevel} allocated ${allocatedAmount} bytes to ${childLevel}`,
    changes: {
      parentLevel,
      childLevel,
      previousAllocation,
      newAllocation: allocatedAmount,
      difference,
      action
    },
    eventScope: 'PLATFORM'
  }).catch(() => {});

  return allocation;
}

/**
 * Revoke/delete an allocation if actual usage is 0
 */
async function revokeAllocation(allocationId, performedBy = null) {
  const allocation = await ResourceAllocation.findById(allocationId);
  if (!allocation) {
    const err = new Error('Allocation record not found');
    err.statusCode = 404;
    throw err;
  }

  const childScope = { level: allocation.childLevel, id: allocation.childId };
  let actualUsed = 0;
  if (allocation.resourceType === 'STORAGE') actualUsed = await getActualStorageUsage(childScope);
  else actualUsed = await getActualMeteredAIUsage(childScope);

  if (actualUsed > 0) {
    const err = new Error(`Cannot revoke allocation with active resource usage (${actualUsed})`);
    err.statusCode = 409;
    throw err;
  }

  await ResourceAllocationHistory.create({
    resourceType: allocation.resourceType,
    parentLevel: allocation.parentLevel,
    parentId: allocation.parentId,
    childLevel: allocation.childLevel,
    childId: allocation.childId,
    previousAllocation: allocation.allocatedAmount,
    newAllocation: 0,
    difference: -allocation.allocatedAmount,
    action: 'REVOKED',
    performedBy: performedBy ? new mongoose.Types.ObjectId(performedBy) : null,
    reason: 'Allocation revoked'
  });

  await ResourceAllocation.findByIdAndDelete(allocationId);
  return { success: true, message: 'Allocation revoked successfully' };
}

/**
 * Register a physical storage file (Duplicate-safe idempotency)
 */
async function registerFile(fileData) {
  const { institution, department, owner, fileName, storageKey, filePath, fileSizeBytes, relatedEntityType, relatedEntityId } = fileData;

  if (!storageKey) {
    const err = new Error('storageKey is required for FileMetadata registration');
    err.statusCode = 400;
    throw err;
  }

  // Check if FileMetadata already exists for storageKey
  let existing = await FileMetadata.findOne({ storageKey });
  if (existing) {
    // If existing was soft-deleted, reactivate it
    existing.isDeleted = false;
    existing.deletedAt = null;
    existing.fileName = fileName || existing.fileName;
    existing.fileSizeBytes = fileSizeBytes !== undefined ? fileSizeBytes : existing.fileSizeBytes;
    if (institution) existing.institution = institution;
    if (department) existing.department = department;
    if (owner) existing.owner = owner;
    if (relatedEntityType) existing.relatedEntityType = relatedEntityType;
    if (relatedEntityId) existing.relatedEntityId = relatedEntityId;
    return await existing.save();
  }

  // Create new
  const metadata = await FileMetadata.create({
    institution,
    department: department || null,
    owner,
    resourceType: 'STORAGE',
    fileName,
    storageKey,
    filePath: filePath || storageKey,
    fileSizeBytes: fileSizeBytes || 0,
    relatedEntityType: relatedEntityType || 'OTHER',
    relatedEntityId: relatedEntityId || null,
    isDeleted: false,
    deletedAt: null
  });

  // Evaluate storage thresholds
  if (owner) {
    await checkStorageThresholds({ level: 'PROFESSOR', id: owner });
  }

  // Audit in StorageUsageLog (Audit Layer - never summed with FileMetadata)
  try {
    const fileCategory = deriveFileCategory(relatedEntityType, fileName);
    const action = (relatedEntityType === 'GENERATED_AUDIO' || (fileName && fileName.toLowerCase().includes('transcript')))
      ? 'GENERATED'
      : 'UPLOADED';

    const existingLog = await StorageUsageLog.findOne({ storageKey, action });
    if (!existingLog) {
      await StorageUsageLog.create({
        professor: owner,
        institution,
        department: department || null,
        lecture: (relatedEntityType === 'LECTURE' || relatedEntityType === 'LAB' || relatedEntityType === 'LECTURE_MATERIAL') ? relatedEntityId : null,
        fileMetadata: metadata._id,
        action,
        fileCategory,
        fileName,
        fileSizeBytes: metadata.fileSizeBytes,
        storageKey,
        metadata: { relatedEntityType, relatedEntityId }
      });
    }
  } catch (logErr) {
    console.error('[StorageUsageLog] Error logging file registration event:', logErr.message);
  }

  // Complete any pending upload reservation
  try {
    await StorageUploadReservation.completeReservation(storageKey);
  } catch (resErr) {
    // Non-blocking
  }

  return metadata;
}

/**
 * Soft delete FileMetadata to reclaim actual storage (Allocations remain unchanged!)
 */
async function softDeleteFile(storageKeyOrQuery) {
  let query = {};
  if (typeof storageKeyOrQuery === 'string') {
    query = { storageKey: storageKeyOrQuery };
  } else if (typeof storageKeyOrQuery === 'object') {
    query = storageKeyOrQuery;
  }

  const files = await FileMetadata.find({ ...query, isDeleted: false });
  for (const file of files) {
    file.isDeleted = true;
    file.deletedAt = new Date();
    await file.save();

    // Evaluate storage thresholds after reclamation
    if (file.owner) {
      await checkStorageThresholds({ level: 'PROFESSOR', id: file.owner });
    }

    // Audit release in StorageUsageLog (Audit Layer)
    try {
      const fileCategory = deriveFileCategory(file.relatedEntityType, file.fileName);
      const existingReleaseLog = await StorageUsageLog.findOne({ storageKey: file.storageKey, action: 'DELETED' });
      if (!existingReleaseLog) {
        await StorageUsageLog.create({
          professor: file.owner,
          institution: file.institution,
          department: file.department,
          lecture: file.relatedEntityId,
          fileMetadata: file._id,
          action: 'DELETED',
          fileCategory,
          fileName: file.fileName,
          fileSizeBytes: file.fileSizeBytes,
          storageKey: file.storageKey,
          metadata: { reason: 'Soft-deleted physical file; storage reclaimed' }
        });
      }
    } catch (logErr) {
      console.error('[StorageUsageLog] Error logging file deletion event:', logErr.message);
    }
  }
  return { modifiedCount: files.length };
}

/**
 * Check and consume Metered AI Quota
 * Throws HTTP 409 if quota is insufficient.
 */
async function checkAndConsumeMeteredAIQuota({ user, operationType, quantity = 1, relatedEntityType = null, relatedEntityId = null }) {
  // AI Tutor is permanently free and non-metered!
  if (operationType === 'AI_TUTOR') {
    return { metered: false, success: true };
  }

  const userDoc = await User.findById(user);
  if (!userDoc) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }

  const institutionId = userDoc.institution;
  const departmentId = userDoc.department;

  // Record operational usage ledger entry (AI functionality is not blocked by commercial quota allocation)
  const ledgerRecord = await MeteredAIUsageLedger.create({
    institution: institutionId,
    department: departmentId || null,
    user: userDoc._id,
    resourceType: 'METERED_AI',
    operationType,
    quantity,
    relatedEntityType,
    relatedEntityId
  });

  return { metered: true, success: true, ledgerRecord };
}

/**
 * Format bytes helper for human-readable error messages
 */
function formatBytes(bytes, decimals = 2) {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Check user upload capacity before persisting files.
 * Throws HTTP 409 Conflict if upload exceeds remaining storage.
 */
async function checkUserUploadCapacity(userId, incomingFileSizeBytes = 0, options = {}) {
  const userDoc = await User.findById(userId);
  if (!userDoc) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }

  // 1. User level quota check
  const allocated = await getAllocatedResource('STORAGE', 'PROFESSOR', userId);
  if (allocated === 0) {
    const err = new Error('Insufficient storage. No storage allocation has been assigned to your account. Please contact your administrator.');
    err.statusCode = 409;
    throw err;
  }

  // Find actual used storage and pending reservations
  const used = await getActualStorageUsage({ level: 'PROFESSOR', id: userId });
  const userPendingReserved = await StorageUploadReservation.getUserPendingReservedBytes(userId);
  const effectiveUserUsed = used + userPendingReserved;

  if (effectiveUserUsed >= allocated) {
    const err = new Error(`Insufficient storage. Your allocated storage capacity of ${formatBytes(allocated)} is full. Please delete unnecessary files or contact your administrator.`);
    err.statusCode = 409;
    throw err;
  }

  const userRemaining = Math.max(0, allocated - effectiveUserUsed);
  if (incomingFileSizeBytes > userRemaining) {
    const err = new Error(`Insufficient storage capacity. Your remaining storage is ${formatBytes(userRemaining)}, but the uploaded file requires ${formatBytes(incomingFileSizeBytes)}.`);
    err.statusCode = 409;
    throw err;
  }

  // 2. Global Application Master Pool / Physical Cloud Storage Check
  const storageConfig = await StorageSystemConfig.getConfig();
  const masterPoolBytes = storageConfig.masterPoolBytes || (10 * 1024 * 1024 * 1024);
  const globalPendingReserved = await StorageUploadReservation.getGlobalPendingReservedBytes();
  const b2ActualBytes = storageConfig.lastB2UsageBytes || 0;
  const totalActiveFileBytes = await getActualStorageUsage({});
  const totalGlobalUsed = Math.max(b2ActualBytes, totalActiveFileBytes) + globalPendingReserved;
  const globalRemaining = Math.max(0, masterPoolBytes - totalGlobalUsed);

  if (incomingFileSizeBytes > globalRemaining) {
    const err = new Error(`Insufficient global storage pool. Platform remaining capacity is ${formatBytes(globalRemaining)}, but the uploaded file requires ${formatBytes(incomingFileSizeBytes)}. Please contact your administrator.`);
    err.statusCode = 409;
    throw err;
  }

  // 3. Optional Concurrency Reservation
  let reservation = null;
  if (options.uploadKey && incomingFileSizeBytes > 0) {
    try {
      reservation = await StorageUploadReservation.create({
        user: userId,
        fileName: options.fileName || 'upload',
        reservedBytes: incomingFileSizeBytes,
        uploadKey: options.uploadKey,
        status: 'PENDING'
      });
    } catch (resErr) {
      console.warn('[StorageReservation] Could not create reservation:', resErr.message);
    }
  }

  return {
    success: true,
    allocated,
    used: effectiveUserUsed,
    remaining: userRemaining,
    globalRemaining,
    reservation
  };
}

/**
 * Evaluate storage thresholds (70%, 80%, 90%, 95%, 100%) for a scope.
 * Persistently deduplicates using existing Notification collection state.
 */
async function checkStorageThresholds(scope) {
  try {
    let allocated = 0;
    let used = 0;
    let targetUserId = null;

    if (scope.level === 'PROFESSOR') {
      allocated = await getAllocatedResource('STORAGE', 'PROFESSOR', scope.id);
      used = await getActualStorageUsage({ level: 'PROFESSOR', id: scope.id });
      targetUserId = scope.id;
    } else if (scope.level === 'DEPARTMENT') {
      const deptDoc = await Department.findById(scope.id);
      allocated = await getAllocatedResource('STORAGE', 'DEPARTMENT', scope.id);
      used = await getActualStorageUsage({ level: 'DEPARTMENT', id: scope.id });
      if (deptDoc && deptDoc.departmentAdmin) targetUserId = deptDoc.departmentAdmin;
    } else if (scope.level === 'INSTITUTION') {
      const instDoc = await Institution.findById(scope.id);
      allocated = await getAllocatedResource('STORAGE', 'INSTITUTION', scope.id);
      used = await getActualStorageUsage({ level: 'INSTITUTION', id: scope.id });
      if (instDoc && instDoc.institutionAdmin) targetUserId = instDoc.institutionAdmin;
    } else if (scope.level === 'SUPER_ADMIN') {
      allocated = await getMasterStoragePoolBytes();
      used = await getActualStorageUsage({ level: 'SUPER_ADMIN' });
      const superAdminUser = await User.findOne({ role: 'super_admin' });
      if (superAdminUser) targetUserId = superAdminUser._id;
    }

    if (!targetUserId || allocated <= 0) return;

    const targetObjId = new mongoose.Types.ObjectId(targetUserId);
    const Notification = require('../models/Notification');
    const { createNotification } = require('../controllers/notificationController');

    const pct = (used / allocated) * 100;
    const thresholds = [
      { level: 70, label: '70% Capacity Reached', msg: `Storage usage reached 70% (${formatBytes(used)} / ${formatBytes(allocated)}).` },
      { level: 80, label: '80% Capacity Reached', msg: `Warning: Storage usage reached 80% (${formatBytes(used)} / ${formatBytes(allocated)}).` },
      { level: 90, label: '90% Capacity Reached', msg: `Critical Warning: Storage usage reached 90% (${formatBytes(used)} / ${formatBytes(allocated)}).` },
      { level: 95, label: '95% Capacity Reached (5% Remaining)', msg: `Storage almost full. Only 5% of your allocated storage remains (${formatBytes(used)} / ${formatBytes(allocated)}).` },
      { level: 100, label: '100% Storage Full', msg: `Storage full: Allocated capacity (${formatBytes(allocated)}) reached. Delete existing files or contact your Department Admin for more storage.` }
    ];

    for (const t of thresholds) {
      const titleStr = `Storage Alert: ${t.label}`;
      const existing = await Notification.findOne({ userId: targetObjId, title: titleStr });

      if (pct >= t.level) {
        if (!existing) {
          await createNotification(targetObjId, 'general', titleStr, t.msg);
        }
      } else {
        // If usage falls below threshold, clear persistent alert record so it can re-trigger if crossed again
        if (existing) {
          await Notification.deleteOne({ _id: existing._id });
        }
      }
    }
  } catch (err) {
    console.error('Storage threshold check error:', err.message);
  }
}

/**
 * Single-pass aggregation for University Storage Overview
 * Calculates Allocated, Used, Remaining, and Usage % for all universities
 * without N+1 query explosions.
 */
async function getUniversityStorageOverview() {
  const University = require('../models/University');
  const Institution = require('../models/Institution');

  // 1. Fetch all universities
  const universities = await University.find({}).select('_id name code acronym').lean();
  if (!universities || universities.length === 0) {
    return [];
  }

  // 2. Fetch all STORAGE allocations granted by Super Admin to Universities
  const allocations = await ResourceAllocation.find({
    resourceType: 'STORAGE',
    parentLevel: 'SUPER_ADMIN',
    childLevel: 'UNIVERSITY'
  }).lean();

  const allocMap = {};
  for (const alloc of allocations) {
    const key = alloc.childId.toString();
    allocMap[key] = (allocMap[key] || 0) + (alloc.allocatedAmount || 0);
  }

  // 3. Map all institutions to their parent universities
  const institutions = await Institution.find({}).select('_id university').lean();
  const instToUnivMap = {};
  for (const inst of institutions) {
    if (inst.university) {
      instToUnivMap[inst._id.toString()] = inst.university.toString();
    }
  }

  // 4. Single aggregation grouping FileMetadata by institution
  const fileUsageByInst = await FileMetadata.aggregate([
    { $match: { isDeleted: false } },
    { $group: { _id: '$institution', totalBytes: { $sum: '$fileSizeBytes' }, fileCount: { $sum: 1 } } }
  ]);

  // Accumulate usage per university
  const usedMap = {};
  const countMap = {};
  for (const group of fileUsageByInst) {
    if (!group._id) continue;
    const instIdStr = group._id.toString();
    const univIdStr = instToUnivMap[instIdStr];
    if (univIdStr) {
      usedMap[univIdStr] = (usedMap[univIdStr] || 0) + (group.totalBytes || 0);
      countMap[univIdStr] = (countMap[univIdStr] || 0) + (group.fileCount || 0);
    }
  }

  // 5. Build consolidated university list
  return universities.map(u => {
    const uId = u._id.toString();
    const allocated = allocMap[uId] || 0;
    const used = usedMap[uId] || 0;
    const remaining = Math.max(0, allocated - used);
    const percentage = allocated > 0 ? Number(((used / allocated) * 100).toFixed(2)) : 0;

    return {
      universityId: u._id,
      name: u.name,
      code: u.code,
      acronym: u.acronym || u.code,
      allocated,
      allocatedFormatted: formatBytes(allocated),
      used,
      usedFormatted: formatBytes(used),
      remaining,
      remainingFormatted: formatBytes(remaining),
      usagePercentage: percentage,
      fileCount: countMap[uId] || 0
    };
  });
}

/**
 * Single-pass aggregated Institution Storage Overview for a specific University
 */
async function getInstitutionStorageOverviewForUniversity(universityId) {
  const Institution = require('../models/Institution');
  const uniObjectId = new mongoose.Types.ObjectId(universityId);

  // 1. Fetch institutions belonging strictly to this university
  const institutions = await Institution.find({ university: uniObjectId }).select('_id name code').lean();
  if (!institutions || institutions.length === 0) {
    return [];
  }
  const instIds = institutions.map(i => i._id);

  // 2. Fetch active allocations granted by this University to its Institutions
  const allocations = await ResourceAllocation.find({
    resourceType: 'STORAGE',
    parentLevel: 'UNIVERSITY',
    parentId: uniObjectId,
    childLevel: 'INSTITUTION',
    childId: { $in: instIds }
  }).lean();

  const allocMap = {};
  for (const alloc of allocations) {
    const key = alloc.childId.toString();
    allocMap[key] = (allocMap[key] || 0) + (alloc.allocatedAmount || 0);
  }

  // 3. Single-pass aggregation of active FileMetadata by institution
  const fileUsageByInst = await FileMetadata.aggregate([
    { $match: { isDeleted: false, institution: { $in: instIds } } },
    { $group: { _id: '$institution', totalBytes: { $sum: '$fileSizeBytes' }, fileCount: { $sum: 1 } } }
  ]);

  const usedMap = {};
  const countMap = {};
  for (const group of fileUsageByInst) {
    if (!group._id) continue;
    const instIdStr = group._id.toString();
    usedMap[instIdStr] = group.totalBytes || 0;
    countMap[instIdStr] = group.fileCount || 0;
  }

  // 4. Fetch department details for optional nested accordion/expansion
  const departments = await Department.find({ institution: { $in: instIds } }).select('_id name code institution').lean();
  const deptIds = departments.map(d => d._id);

  const deptAllocs = await ResourceAllocation.find({
    resourceType: 'STORAGE',
    parentLevel: 'INSTITUTION',
    childLevel: 'DEPARTMENT',
    childId: { $in: deptIds }
  }).lean();

  const deptAllocMap = {};
  for (const da of deptAllocs) {
    const key = da.childId.toString();
    deptAllocMap[key] = (deptAllocMap[key] || 0) + (da.allocatedAmount || 0);
  }

  const deptUsage = await FileMetadata.aggregate([
    { $match: { isDeleted: false, department: { $in: deptIds } } },
    { $group: { _id: '$department', totalBytes: { $sum: '$fileSizeBytes' }, fileCount: { $sum: 1 } } }
  ]);

  const deptUsedMap = {};
  const deptCountMap = {};
  for (const group of deptUsage) {
    if (!group._id) continue;
    deptUsedMap[group._id.toString()] = group.totalBytes || 0;
    deptCountMap[group._id.toString()] = group.fileCount || 0;
  }

  const deptsByInst = {};
  for (const dept of departments) {
    const instIdStr = dept.institution ? dept.institution.toString() : '';
    if (!deptsByInst[instIdStr]) deptsByInst[instIdStr] = [];
    const dAlloc = deptAllocMap[dept._id.toString()] || 0;
    const dUsed = deptUsedMap[dept._id.toString()] || 0;
    const dRemaining = Math.max(0, dAlloc - dUsed);
    const dPct = dAlloc > 0 ? Number(((dUsed / dAlloc) * 100).toFixed(2)) : 0;
    deptsByInst[instIdStr].push({
      departmentId: dept._id,
      name: dept.name,
      code: dept.code,
      allocated: dAlloc,
      allocatedFormatted: formatBytes(dAlloc),
      used: dUsed,
      usedFormatted: formatBytes(dUsed),
      remaining: dRemaining,
      remainingFormatted: formatBytes(dRemaining),
      usagePercentage: dPct,
      fileCount: deptCountMap[dept._id.toString()] || 0
    });
  }

  // 5. Build consolidated institution records
  return institutions.map(inst => {
    const instIdStr = inst._id.toString();
    const allocated = allocMap[instIdStr] || 0;
    const used = usedMap[instIdStr] || 0;
    const remaining = Math.max(0, allocated - used);
    const percentage = allocated > 0 ? Number(((used / allocated) * 100).toFixed(2)) : 0;

    return {
      institutionId: inst._id,
      name: inst.name,
      code: inst.code,
      allocated,
      allocatedFormatted: formatBytes(allocated),
      used,
      usedFormatted: formatBytes(used),
      remaining,
      remainingFormatted: formatBytes(remaining),
      usagePercentage: percentage,
      fileCount: countMap[instIdStr] || 0,
      departments: deptsByInst[instIdStr] || []
    };
  });
}

/**
 * Single-pass aggregated Department Storage Overview for a specific Institution
 */
async function getDepartmentStorageOverviewForInstitution(institutionId) {
  const instObjectId = new mongoose.Types.ObjectId(institutionId);

  // 1. Fetch departments belonging strictly to this institution
  const departments = await Department.find({ institution: instObjectId }).select('_id name code').lean();
  if (!departments || departments.length === 0) {
    return [];
  }
  const deptIds = departments.map(d => d._id);

  // 2. Fetch active allocations granted by this Institution to its Departments
  const allocations = await ResourceAllocation.find({
    resourceType: 'STORAGE',
    parentLevel: 'INSTITUTION',
    parentId: instObjectId,
    childLevel: 'DEPARTMENT',
    childId: { $in: deptIds }
  }).lean();

  const allocMap = {};
  for (const alloc of allocations) {
    const key = alloc.childId.toString();
    allocMap[key] = (allocMap[key] || 0) + (alloc.allocatedAmount || 0);
  }

  // 3. Single-pass aggregation of active FileMetadata by department
  const fileUsageByDept = await FileMetadata.aggregate([
    { $match: { isDeleted: false, department: { $in: deptIds } } },
    { $group: { _id: '$department', totalBytes: { $sum: '$fileSizeBytes' }, fileCount: { $sum: 1 } } }
  ]);

  const usedMap = {};
  const countMap = {};
  for (const group of fileUsageByDept) {
    if (!group._id) continue;
    const deptIdStr = group._id.toString();
    usedMap[deptIdStr] = group.totalBytes || 0;
    countMap[deptIdStr] = group.fileCount || 0;
  }

  // 4. Fetch professor details for optional nested accordion/expansion
  const professors = await User.find({ department: { $in: deptIds }, role: 'professor' }).select('_id name email department professorId').lean();
  const profIds = professors.map(p => p._id);

  const profAllocs = await ResourceAllocation.find({
    resourceType: 'STORAGE',
    parentLevel: 'DEPARTMENT',
    childLevel: 'PROFESSOR',
    childId: { $in: profIds }
  }).lean();

  const profAllocMap = {};
  for (const pa of profAllocs) {
    profAllocMap[pa.childId.toString()] = (profAllocMap[pa.childId.toString()] || 0) + (pa.allocatedAmount || 0);
  }

  const profUsage = await FileMetadata.aggregate([
    { $match: { isDeleted: false, owner: { $in: profIds } } },
    { $group: { _id: '$owner', totalBytes: { $sum: '$fileSizeBytes' }, fileCount: { $sum: 1 } } }
  ]);

  const profUsedMap = {};
  const profCountMap = {};
  for (const group of profUsage) {
    if (!group._id) continue;
    profUsedMap[group._id.toString()] = group.totalBytes || 0;
    profCountMap[group._id.toString()] = group.fileCount || 0;
  }

  const profsByDept = {};
  for (const prof of professors) {
    const deptIdStr = prof.department ? prof.department.toString() : '';
    if (!profsByDept[deptIdStr]) profsByDept[deptIdStr] = [];
    const pAlloc = profAllocMap[prof._id.toString()] || 0;
    const pUsed = profUsedMap[prof._id.toString()] || 0;
    const pRemaining = Math.max(0, pAlloc - pUsed);
    const pPct = pAlloc > 0 ? Number(((pUsed / pAlloc) * 100).toFixed(2)) : 0;
    profsByDept[deptIdStr].push({
      professorId: prof._id,
      name: prof.name,
      email: prof.email,
      code: prof.professorId || prof.email,
      allocated: pAlloc,
      allocatedFormatted: formatBytes(pAlloc),
      used: pUsed,
      usedFormatted: formatBytes(pUsed),
      remaining: pRemaining,
      remainingFormatted: formatBytes(pRemaining),
      usagePercentage: pPct,
      fileCount: profCountMap[prof._id.toString()] || 0
    });
  }

  // 5. Build consolidated department records
  return departments.map(dept => {
    const deptIdStr = dept._id.toString();
    const allocated = allocMap[deptIdStr] || 0;
    const used = usedMap[deptIdStr] || 0;
    const remaining = Math.max(0, allocated - used);
    const percentage = allocated > 0 ? Number(((used / allocated) * 100).toFixed(2)) : 0;

    return {
      departmentId: dept._id,
      name: dept.name,
      code: dept.code,
      allocated,
      allocatedFormatted: formatBytes(allocated),
      used,
      usedFormatted: formatBytes(used),
      remaining,
      remainingFormatted: formatBytes(remaining),
      usagePercentage: percentage,
      fileCount: countMap[deptIdStr] || 0,
      professors: profsByDept[deptIdStr] || []
    };
  });
}

/**
 * Single-pass aggregated Professor Storage Overview for a specific Department
 */
async function getProfessorStorageOverviewForDepartment(departmentId) {
  const deptObjectId = new mongoose.Types.ObjectId(departmentId);

  // 1. Fetch professors belonging strictly to this department
  const professors = await User.find({ department: deptObjectId, role: 'professor' }).select('_id name email professorId').lean();
  if (!professors || professors.length === 0) {
    return [];
  }
  const profIds = professors.map(p => p._id);

  // 2. Fetch active allocations granted by this Department to its Professors
  const allocations = await ResourceAllocation.find({
    resourceType: 'STORAGE',
    parentLevel: 'DEPARTMENT',
    parentId: deptObjectId,
    childLevel: 'PROFESSOR',
    childId: { $in: profIds }
  }).lean();

  const allocMap = {};
  for (const alloc of allocations) {
    const key = alloc.childId.toString();
    allocMap[key] = (allocMap[key] || 0) + (alloc.allocatedAmount || 0);
  }

  // 3. Single-pass aggregation of active FileMetadata by owner (professor)
  const fileUsageByProf = await FileMetadata.aggregate([
    { $match: { isDeleted: false, owner: { $in: profIds } } },
    { $group: { _id: '$owner', totalBytes: { $sum: '$fileSizeBytes' }, fileCount: { $sum: 1 } } }
  ]);

  const usedMap = {};
  const countMap = {};
  for (const group of fileUsageByProf) {
    if (!group._id) continue;
    const profIdStr = group._id.toString();
    usedMap[profIdStr] = group.totalBytes || 0;
    countMap[profIdStr] = group.fileCount || 0;
  }

  // 4. Build consolidated professor records
  return professors.map(prof => {
    const profIdStr = prof._id.toString();
    const allocated = allocMap[profIdStr] || 0;
    const used = usedMap[profIdStr] || 0;
    const remaining = Math.max(0, allocated - used);
    const percentage = allocated > 0 ? Number(((used / allocated) * 100).toFixed(2)) : 0;

    return {
      professorId: prof._id,
      name: prof.name,
      email: prof.email,
      code: prof.professorId || prof.email,
      allocated,
      allocatedFormatted: formatBytes(allocated),
      used,
      usedFormatted: formatBytes(used),
      remaining,
      remainingFormatted: formatBytes(remaining),
      usagePercentage: percentage,
      fileCount: countMap[profIdStr] || 0
    };
  });
}

module.exports = {
  getMasterStoragePoolBytes,
  getSuperAdminResourceOverview,
  getInstitutionResourceOverview,
  getDepartmentResourceOverview,
  getProfessorResourceOverview,
  getAllocatedResource,
  getDistributedResource,
  getActualStorageUsage,
  getActualMeteredAIUsage,
  getAITutorUsage,
  getRemainingResource,
  getCompleteResourceOverview,
  getUniversityStorageOverview,
  getInstitutionStorageOverviewForUniversity,
  getDepartmentStorageOverviewForInstitution,
  getProfessorStorageOverviewForDepartment,
  saveAllocation,
  revokeAllocation,
  registerFile,
  softDeleteFile,
  deleteFile: softDeleteFile,
  checkAndConsumeMeteredAIQuota,
  checkUserUploadCapacity,
  checkStorageThresholds,
  getProfessorStorageBreakdown,
  deriveFileCategory
};
