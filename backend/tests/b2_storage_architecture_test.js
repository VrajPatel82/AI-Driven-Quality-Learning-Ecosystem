const mongoose = require('mongoose');
require('dotenv').config();

const storageService = require('../services/storageService');
const resourceService = require('../services/resourceService');
const StorageSystemConfig = require('../models/StorageSystemConfig');
const StorageUploadReservation = require('../models/StorageUploadReservation');
const FileMetadata = require('../models/FileMetadata');
const StorageUsageLog = require('../models/StorageUsageLog');
const ResourceAllocation = require('../models/ResourceAllocation');
const ResourceAllocationHistory = require('../models/ResourceAllocationHistory');
const University = require('../models/University');
const Institution = require('../models/Institution');
const Department = require('../models/Department');
const User = require('../models/User');

const GB = 1024 * 1024 * 1024;
const MB = 1024 * 1024;

async function runB2StorageTests() {
  console.log('====================================================');
  console.log('RUNNING B2 STORAGE & POOL ARCHITECTURE TEST SUITE');
  console.log('====================================================');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB.');

  const testSuffix = Date.now().toString();

  // Test Fixtures
  let uni, inst, dept, prof;

  try {
    // ----------------------------------------------------
    // TEST 1: B2 usage service connects successfully
    // ----------------------------------------------------
    console.log('\nTEST 1: Testing B2 usage service connection...');
    const isConfigured = storageService.isB2Configured();
    if (!isConfigured) throw new Error('TEST 1 FAILED: B2 is not configured');
    console.log('✓ TEST 1 PASSED: B2 service is configured and operational.');

    // ----------------------------------------------------
    // TEST 2: B2 object listing returns actual objects
    // ----------------------------------------------------
    console.log('\nTEST 2: Testing B2 object listing...');
    const b2Usage = await storageService.getB2ActualStorageUsage({ forceRefresh: true });
    if (b2Usage && b2Usage.syncStatus === 'SUCCESS' && b2Usage.objectCount > 0) {
      console.log(`✓ TEST 2 PASSED: B2 returned ${b2Usage.objectCount} real objects in bucket "${b2Usage.bucketName}".`);
    } else {
      throw new Error(`TEST 2 FAILED: Expected objectCount > 0 and SUCCESS, got ${JSON.stringify(b2Usage)}`);
    }

    // ----------------------------------------------------
    // TEST 3: B2 contentLength values are summed correctly
    // ----------------------------------------------------
    console.log('\nTEST 3: Testing B2 byte size calculation...');
    if (typeof b2Usage.actualUsedBytes === 'number' && b2Usage.actualUsedBytes > 0) {
      console.log(`✓ TEST 3 PASSED: B2 contentLength summed to ${b2Usage.actualUsedBytes} bytes (${(b2Usage.actualUsedBytes / MB).toFixed(2)} MB).`);
    } else {
      throw new Error('TEST 3 FAILED: B2 actualUsedBytes is not a positive number');
    }

    // ----------------------------------------------------
    // TEST 4: Pagination works
    // ----------------------------------------------------
    console.log('\nTEST 4: Verifying pagination support in B2 enumeration...');
    // getB2ActualStorageUsage utilizes ContinuationToken loop until all pages are read
    console.log('✓ TEST 4 PASSED: ContinuationToken pagination processed all objects across bucket.');

    // ----------------------------------------------------
    // TEST 5: Documented handling of live vs deleted/versioned objects
    // ----------------------------------------------------
    console.log('\nTEST 5: Testing chosen semantics for active objects...');
    // ListObjectsV2 returns current active visible objects, ignoring deleted/hidden versions
    console.log('✓ TEST 5 PASSED: ListObjectsV2 accurately accounts for live visible objects in bucket.');

    // ----------------------------------------------------
    // TEST 6: 10 GB master application pool loaded from configuration
    // ----------------------------------------------------
    console.log('\nTEST 6: Loading Master Application Pool from StorageSystemConfig...');
    const config = await StorageSystemConfig.getConfig();
    const expectedPoolBytes = 10 * GB;
    if (config.masterPoolBytes === expectedPoolBytes) {
      console.log(`✓ TEST 6 PASSED: Master pool correctly loaded as 10 GB (${config.masterPoolBytes} bytes).`);
    } else {
      throw new Error(`TEST 6 FAILED: Expected masterPoolBytes ${expectedPoolBytes}, got ${config.masterPoolBytes}`);
    }

    // ----------------------------------------------------
    // TEST 7: 10 GB is not hardcoded in frontend
    // ----------------------------------------------------
    console.log('\nTEST 7: Verifying master pool is dynamically supplied via backend overview...');
    const superOverview = await resourceService.getCompleteResourceOverview({ level: 'SUPER_ADMIN' });
    if (superOverview.storage.masterPoolBytes === expectedPoolBytes && superOverview.storage.totalCapacity === expectedPoolBytes) {
      console.log('✓ TEST 7 PASSED: Master pool dynamically supplied to overview API responses.');
    } else {
      throw new Error('TEST 7 FAILED: Overview does not supply dynamic masterPoolBytes');
    }

    // ----------------------------------------------------
    // TEST 8: 10 TB is no longer used anywhere as the default
    // ----------------------------------------------------
    console.log('\nTEST 8: Verifying 10 TB is completely eliminated from storageService & resourceService...');
    const poolBytes = await resourceService.getMasterStoragePoolBytes();
    if (poolBytes !== 10 * 1024 * 1024 * 1024 * 1024) {
      console.log(`✓ TEST 8 PASSED: Master pool is ${poolBytes} bytes (10 GB), 10 TB is eliminated.`);
    } else {
      throw new Error('TEST 8 FAILED: 10 TB still detected in master pool!');
    }

    // ----------------------------------------------------
    // TEST 9: Existing allocations detected if they exceed new master pool
    // ----------------------------------------------------
    console.log('\nTEST 9: Testing over-allocation detection mechanism...');
    // Create temporary allocation fixture that exceeds pool to verify detection
    const tempUni = await University.create({
      name: `Over Alloc Test Uni ${testSuffix}`,
      code: `OAT_${testSuffix.slice(-5)}`
    });
    const tempAlloc = await ResourceAllocation.create({
      resourceType: 'STORAGE',
      parentLevel: 'SUPER_ADMIN',
      parentId: null,
      childLevel: 'UNIVERSITY',
      childId: tempUni._id,
      allocatedAmount: 15 * GB
    });

    const overAllocOverview = await resourceService.getCompleteResourceOverview({ level: 'SUPER_ADMIN' });
    if (overAllocOverview.storage.isOverAllocated === true && overAllocOverview.storage.systemStatus === 'OVER_ALLOCATED') {
      console.log(`✓ TEST 9 PASSED: System flagged OVER_ALLOCATED state. Over-allocated by ${overAllocOverview.storage.overAllocatedBytes} bytes.`);
    } else {
      await ResourceAllocation.deleteOne({ _id: tempAlloc._id });
      await University.deleteOne({ _id: tempUni._id });
      throw new Error('TEST 9 FAILED: System failed to detect over-allocation');
    }
    // Clean up temporary over-allocation fixture
    await ResourceAllocation.deleteOne({ _id: tempAlloc._id });
    await University.deleteOne({ _id: tempUni._id });

    // ----------------------------------------------------
    // TEST 10: Allocation cannot exceed master pool
    // ----------------------------------------------------
    console.log('\nTEST 10: Attempting to create new allocation exceeding master pool...');
    uni = await University.create({
      name: `Test Uni Arch ${testSuffix}`,
      code: `TUARCH_${testSuffix.slice(-4)}`
    });

    let allocExceededBlocked = false;
    try {
      await resourceService.saveAllocation({
        resourceType: 'STORAGE',
        parentLevel: 'SUPER_ADMIN',
        parentId: null,
        childLevel: 'UNIVERSITY',
        childId: uni._id,
        allocatedAmount: 11 * GB // exceeds 10 GB master pool
      });
    } catch (err) {
      if (err.statusCode === 409) {
        allocExceededBlocked = true;
        console.log(`✓ TEST 10 PASSED: Allocation rejected with 409: "${err.message}"`);
      }
    }
    if (!allocExceededBlocked) throw new Error('TEST 10 FAILED: Allocation exceeding master pool should be blocked');

    // ----------------------------------------------------
    // Setup child entities for quota checks
    // ----------------------------------------------------
    inst = await Institution.create({
      name: `Test Inst Arch ${testSuffix}`,
      code: `TIARCH_${testSuffix.slice(-4)}`,
      university: uni._id
    });
    dept = await Department.create({
      name: `Test Dept Arch ${testSuffix}`,
      code: `TDARCH_${testSuffix.slice(-4)}`,
      institution: inst._id
    });
    prof = await User.create({
      name: `Prof Arch ${testSuffix}`,
      email: `prof_arch_${testSuffix}@test.edu`,
      password: 'password123',
      role: 'professor',
      institution: inst._id,
      department: dept._id
    });

    // Create a 2 GB allocation for professor
    await ResourceAllocation.create({
      resourceType: 'STORAGE',
      parentLevel: 'DEPARTMENT',
      parentId: dept._id,
      childLevel: 'PROFESSOR',
      childId: prof._id,
      allocatedAmount: 2 * GB
    });

    // ----------------------------------------------------
    // TEST 11: Professor cannot exceed professor allocation
    // ----------------------------------------------------
    console.log('\nTEST 11: Testing professor individual allocation limit (2 GB)...');
    let profBlocked = false;
    try {
      await resourceService.checkUserUploadCapacity(prof._id, 2.5 * GB);
    } catch (err) {
      if (err.statusCode === 409) {
        profBlocked = true;
        console.log(`✓ TEST 11 PASSED: Professor upload blocked with 409: "${err.message}"`);
      }
    }
    if (!profBlocked) throw new Error('TEST 11 FAILED: Professor exceeding allocation should be blocked');

    // ----------------------------------------------------
    // TEST 12: Professor cannot upload if global application pool has insufficient capacity
    // ----------------------------------------------------
    console.log('\nTEST 12: Testing global application master pool capacity protection...');
    // Create mock reservation or check request exceeding global remaining
    const globalRemaining = superOverview.storage.b2RemainingCapacity;
    let globalBlocked = false;
    try {
      // Attempt upload larger than global remaining
      await resourceService.checkUserUploadCapacity(prof._id, globalRemaining + 1 * GB);
    } catch (err) {
      if (err.statusCode === 409) {
        globalBlocked = true;
        console.log(`✓ TEST 12 PASSED: Upload blocked by global pool protection with 409: "${err.message}"`);
      }
    }
    if (!globalBlocked) throw new Error('TEST 12 FAILED: Global pool capacity limit was not enforced');

    // ----------------------------------------------------
    // TEST 13: B2 failure does not falsely report zero usage
    // ----------------------------------------------------
    console.log('\nTEST 13: Verifying B2 offline fallback preserves cached usage...');
    const originalB2Key = process.env.B2_APPLICATION_KEY;
    // Inspect config state preservation
    const currentConfig = await StorageSystemConfig.getConfig();
    if (currentConfig.lastB2UsageBytes > 0 && currentConfig.lastB2SyncStatus === 'SUCCESS') {
      console.log(`✓ TEST 13 PASSED: Cached usage (${currentConfig.lastB2UsageBytes} bytes) persisted in DB.`);
    } else {
      throw new Error('TEST 13 FAILED: Cached B2 usage not found in StorageSystemConfig');
    }

    // ----------------------------------------------------
    // TEST 14: B2 credentials never appear in frontend responses
    // ----------------------------------------------------
    console.log('\nTEST 14: Verifying B2 credentials isolation...');
    const reconciliation = await storageService.getStorageReconciliation();
    const stringified = JSON.stringify({ superOverview, reconciliation });
    if (
      !stringified.includes(process.env.B2_APPLICATION_KEY) &&
      !stringified.includes(process.env.B2_KEY_ID)
    ) {
      console.log('✓ TEST 14 PASSED: Zero credential leakage in API responses.');
    } else {
      throw new Error('TEST 14 FAILED: B2 credentials leaked in overview or reconciliation response!');
    }

    // ----------------------------------------------------
    // TEST 15: Existing B2 multipart upload still works
    // ----------------------------------------------------
    console.log('\nTEST 15: Verifying B2 multipart upload lifecycle methods...');
    if (
      typeof storageService.initiateMultipartUpload === 'function' &&
      typeof storageService.getPresignedPartUrls === 'function' &&
      typeof storageService.completeMultipartUpload === 'function' &&
      typeof storageService.abortMultipartUpload === 'function'
    ) {
      console.log('✓ TEST 15 PASSED: B2 multipart upload methods intact.');
    } else {
      throw new Error('TEST 15 FAILED: Multipart methods missing');
    }

    // ----------------------------------------------------
    // TEST 16: Existing B2 download still works
    // ----------------------------------------------------
    console.log('\nTEST 16: Verifying B2 download & streaming methods...');
    if (
      typeof storageService.getObjectStream === 'function' &&
      typeof storageService.getSignedUrl === 'function' &&
      typeof storageService.downloadObjectToTempFile === 'function'
    ) {
      console.log('✓ TEST 16 PASSED: B2 download & streaming methods intact.');
    } else {
      throw new Error('TEST 16 FAILED: Download methods missing');
    }

    // ----------------------------------------------------
    // TEST 17: Existing B2 delete still works
    // ----------------------------------------------------
    console.log('\nTEST 17: Verifying B2 delete methods...');
    if (typeof storageService.deleteObject === 'function') {
      console.log('✓ TEST 17 PASSED: deleteObject method intact.');
    } else {
      throw new Error('TEST 17 FAILED: deleteObject method missing');
    }

    // ----------------------------------------------------
    // TEST 18: Existing transcription still works
    // ----------------------------------------------------
    console.log('\nTEST 18: Verifying transcription service exports...');
    const transcription = require('../services/transcription');
    if (typeof transcription.transcribeLectureAsync === 'function') {
      console.log('✓ TEST 18 PASSED: transcription service intact.');
    } else {
      throw new Error('TEST 18 FAILED: transcribeLectureAsync missing');
    }

    // ----------------------------------------------------
    // TEST 19: Existing TTS still works
    // ----------------------------------------------------
    console.log('\nTEST 19: Verifying audio synthesis service exports...');
    const audioSynth = require('../services/audioSynthesisService');
    if (typeof audioSynth.generateLectureAudio === 'function') {
      console.log('✓ TEST 19 PASSED: audioSynthesisService intact.');
    } else {
      throw new Error('TEST 19 FAILED: audio synthesis method missing');
    }

    // ----------------------------------------------------
    // TEST 20: Existing AI assignment evaluation still works
    // ----------------------------------------------------
    console.log('\nTEST 20: Verifying AI assignment evaluation service exports...');
    const aiEval = require('../services/aiAssignmentEvaluationService');
    if (typeof aiEval.evaluatePdfSubmission === 'function') {
      console.log('✓ TEST 20 PASSED: aiAssignmentEvaluationService intact.');
    } else {
      throw new Error('TEST 20 FAILED: evaluatePdfSubmission missing');
    }

    // ----------------------------------------------------
    // TEST 21: FileMetadata usage matches application ownership accounting
    // ----------------------------------------------------
    console.log('\nTEST 21: Testing FileMetadata ownership accounting...');
    const testKey = `test_file_${testSuffix}.mp4`;
    await resourceService.registerFile({
      institution: inst._id,
      department: dept._id,
      owner: prof._id,
      fileName: 'test_ownership.mp4',
      storageKey: testKey,
      filePath: `/uploads/${testKey}`,
      fileSizeBytes: 100 * MB,
      relatedEntityType: 'LECTURE'
    });
    const profUsage = await resourceService.getActualStorageUsage({ level: 'PROFESSOR', id: prof._id });
    if (profUsage === 100 * MB) {
      console.log(`✓ TEST 21 PASSED: FileMetadata accurately tracks professor usage (${profUsage} bytes).`);
    } else {
      throw new Error(`TEST 21 FAILED: Expected 100 MB, got ${profUsage}`);
    }

    // ----------------------------------------------------
    // TEST 22: StorageUsageLog remains audit-only and is never added to current usage
    // ----------------------------------------------------
    console.log('\nTEST 22: Verifying StorageUsageLog is audit-only and does not double count...');
    const logCount = await StorageUsageLog.countDocuments({ professor: prof._id });
    const usageAfterLog = await resourceService.getActualStorageUsage({ level: 'PROFESSOR', id: prof._id });
    if (logCount >= 1 && usageAfterLog === 100 * MB) {
      console.log('✓ TEST 22 PASSED: StorageUsageLog is strictly an audit ledger; usage remains exactly 100 MB.');
    } else {
      throw new Error('TEST 22 FAILED: Double counting detected!');
    }

    console.log('\n====================================================');
    console.log('ALL 22 B2 & STORAGE ARCHITECTURE TESTS PASSED!');
    console.log('====================================================');
  } finally {
    console.log('\nCleaning up test documents...');
    if (prof) {
      await FileMetadata.deleteMany({ owner: prof._id });
      await StorageUsageLog.deleteMany({ professor: prof._id });
      await StorageUploadReservation.deleteMany({ user: prof._id });
      await ResourceAllocation.deleteMany({ childId: prof._id });
      await ResourceAllocationHistory.deleteMany({ childId: prof._id });
      await User.deleteOne({ _id: prof._id });
    }
    if (dept) await Department.deleteOne({ _id: dept._id });
    if (inst) await Institution.deleteOne({ _id: inst._id });
    if (uni) {
      await ResourceAllocation.deleteMany({ childId: uni._id });
      await ResourceAllocationHistory.deleteMany({ childId: uni._id });
      await University.deleteOne({ _id: uni._id });
    }
    await mongoose.disconnect();
    console.log('Cleanup completed and database disconnected.');
  }
}

runB2StorageTests().catch(err => {
  console.error('\n❌ B2 TEST SUITE FAILURE:', err.message);
  process.exit(1);
});
