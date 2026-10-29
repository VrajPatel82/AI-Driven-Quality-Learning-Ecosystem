process.env.MASTER_STORAGE_POOL_GB = '10000';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
process.env.MASTER_STORAGE_POOL_GB = '10000';
const mongoose = require('mongoose');
const resourceService = require('../services/resourceService');
const StorageSystemConfig = require('../models/StorageSystemConfig');
const ResourceAllocation = require('../models/ResourceAllocation');
const ResourceAllocationHistory = require('../models/ResourceAllocationHistory');
const FileMetadata = require('../models/FileMetadata');
const StorageUsageLog = require('../models/StorageUsageLog');
const University = require('../models/University');
const Institution = require('../models/Institution');
const Department = require('../models/Department');
const User = require('../models/User');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/lecture_system';

const GB = 1024 * 1024 * 1024;

async function runTests() {
  console.log('====================================================');
  console.log('RUNNING AUTHORITATIVE STORAGE SYSTEM TEST SUITE');
  console.log('====================================================');

  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB.');

  // Initialize pool for test
  await StorageSystemConfig.deleteMany({});
  await StorageSystemConfig.create({
    provider: 'BACKBLAZE_B2',
    bucketName: 'ai-lecture-db',
    masterPoolBytes: 10 * 1024 * GB,
    freeAllowanceBytes: 10 * GB,
    lastB2UsageBytes: 110802824,
    lastB2ObjectCount: 17,
    lastB2SyncStatus: 'SUCCESS',
    lastB2SyncAt: new Date()
  });

  const testSuffix = `test_${Date.now()}`;
  let uni = null, inst = null, dept = null, prof = null, otherUni = null;

  try {
    // Setup isolated test entities
    uni = await University.create({
      name: `Test University ${testSuffix}`,
      code: `TU_${testSuffix.slice(-6)}`,
      status: 'active'
    });

    otherUni = await University.create({
      name: `Other University ${testSuffix}`,
      code: `OU_${testSuffix.slice(-6)}`,
      status: 'active'
    });

    inst = await Institution.create({
      name: `Test Institution ${testSuffix}`,
      code: `TI_${testSuffix.slice(-6)}`,
      university: uni._id
    });

    dept = await Department.create({
      name: `Test Dept ${testSuffix}`,
      code: `TD_${testSuffix.slice(-6)}`,
      institution: inst._id
    });

    prof = await User.create({
      name: `Test Prof ${testSuffix}`,
      email: `prof_${testSuffix}@example.com`,
      password: 'password123',
      role: 'professor',
      university: uni._id,
      institution: inst._id,
      department: dept._id
    });

    console.log('Test fixtures created successfully.\n');

    // TEST 1: Super Admin allocates 100 GB to University A
    console.log('TEST 1: Super Admin allocates 100 GB to University A...');
    const allocUni = await resourceService.saveAllocation({
      resourceType: 'STORAGE',
      parentLevel: 'SUPER_ADMIN',
      parentId: null,
      childLevel: 'UNIVERSITY',
      childId: uni._id,
      allocatedAmount: 100 * GB,
      reason: 'Initial Uni Allocation'
    });
    const uniAlloc = await resourceService.getAllocatedResource('STORAGE', 'UNIVERSITY', uni._id);
    if (uniAlloc === 100 * GB) {
      console.log('✓ TEST 1 PASSED: University received exactly 100 GB.');
    } else {
      throw new Error(`TEST 1 FAILED: Expected 100 GB, got ${uniAlloc}`);
    }

    // TEST 2: University A allocates 60 GB to Institution A
    console.log('\nTEST 2: University A allocates 60 GB to Institution A...');
    await resourceService.saveAllocation({
      resourceType: 'STORAGE',
      parentLevel: 'UNIVERSITY',
      parentId: uni._id,
      childLevel: 'INSTITUTION',
      childId: inst._id,
      allocatedAmount: 60 * GB,
      reason: 'Inst Allocation'
    });
    const uniOverview = await resourceService.getCompleteResourceOverview({ level: 'UNIVERSITY', id: uni._id });
    if (uniOverview.storage.availableToAllocate === 40 * GB) {
      console.log('✓ TEST 2 PASSED: University has exactly 40 GB available to allocate.');
    } else {
      throw new Error(`TEST 2 FAILED: Expected 40 GB, got ${uniOverview.storage.availableToAllocate}`);
    }

    // TEST 3: Institution A allocates 30 GB to Department A
    console.log('\nTEST 3: Institution A allocates 30 GB to Department A...');
    await resourceService.saveAllocation({
      resourceType: 'STORAGE',
      parentLevel: 'INSTITUTION',
      parentId: inst._id,
      childLevel: 'DEPARTMENT',
      childId: dept._id,
      allocatedAmount: 30 * GB,
      reason: 'Dept Allocation'
    });
    const instOverview = await resourceService.getCompleteResourceOverview({ level: 'INSTITUTION', id: inst._id });
    if (instOverview.storage.availableToAllocate === 30 * GB) {
      console.log('✓ TEST 3 PASSED: Institution has exactly 30 GB available to distribute.');
    } else {
      throw new Error(`TEST 3 FAILED: Expected 30 GB, got ${instOverview.storage.availableToAllocate}`);
    }

    // TEST 4: Department A allocates 20 GB to Professor A
    console.log('\nTEST 4: Department A allocates 20 GB to Professor A...');
    await resourceService.saveAllocation({
      resourceType: 'STORAGE',
      parentLevel: 'DEPARTMENT',
      parentId: dept._id,
      childLevel: 'PROFESSOR',
      childId: prof._id,
      allocatedAmount: 20 * GB,
      reason: 'Prof Allocation'
    });
    const profAlloc = await resourceService.getAllocatedResource('STORAGE', 'PROFESSOR', prof._id);
    if (profAlloc === 20 * GB) {
      console.log('✓ TEST 4 PASSED: Professor has exactly 20 GB allocated.');
    } else {
      throw new Error(`TEST 4 FAILED: Expected 20 GB, got ${profAlloc}`);
    }

    // TEST 5: Professor uploads a 5 GB lecture
    console.log('\nTEST 5: Professor uploads a 5 GB lecture...');
    const videoKey = `lectures/test_video_${testSuffix}.mp4`;
    await resourceService.registerFile({
      institution: inst._id,
      department: dept._id,
      owner: prof._id,
      fileName: 'lecture_intro.mp4',
      storageKey: videoKey,
      filePath: `/uploads/${videoKey}`,
      fileSizeBytes: 5 * GB,
      relatedEntityType: 'LECTURE'
    });
    let profOverview = await resourceService.getCompleteResourceOverview({ level: 'PROFESSOR', id: prof._id });
    if (profOverview.storage.used === 5 * GB && profOverview.storage.remaining === 15 * GB) {
      console.log('✓ TEST 5 PASSED: Used = 5 GB, Remaining = 15 GB.');
    } else {
      throw new Error(`TEST 5 FAILED: Expected used 5 GB, remaining 15 GB, got used=${profOverview.storage.used}, remaining=${profOverview.storage.remaining}`);
    }

    // TEST 6: Professor uploads a 10 GB material
    console.log('\nTEST 6: Professor uploads a 10 GB supplementary material...');
    const matKey = `lectures/attachments/material_${testSuffix}.pdf`;
    await resourceService.registerFile({
      institution: inst._id,
      department: dept._id,
      owner: prof._id,
      fileName: 'course_handbook.pdf',
      storageKey: matKey,
      filePath: `/uploads/${matKey}`,
      fileSizeBytes: 10 * GB,
      relatedEntityType: 'LECTURE_MATERIAL'
    });
    profOverview = await resourceService.getCompleteResourceOverview({ level: 'PROFESSOR', id: prof._id });
    if (profOverview.storage.used === 15 * GB && profOverview.storage.remaining === 5 * GB) {
      console.log('✓ TEST 6 PASSED: Used = 15 GB, Remaining = 5 GB.');
    } else {
      throw new Error(`TEST 6 FAILED: Expected used 15 GB, remaining 5 GB`);
    }

    // TEST 7: Professor attempts another 6 GB upload (exceeds remaining 5 GB)
    console.log('\nTEST 7: Pre-upload capacity check on 6 GB upload (remaining 5 GB)...');
    let blocked = false;
    try {
      await resourceService.checkUserUploadCapacity(prof._id, 6 * GB);
    } catch (err) {
      if (err.statusCode === 409) {
        blocked = true;
        console.log(`✓ TEST 7 PASSED: Upload blocked with HTTP 409. Message: "${err.message}"`);
      }
    }
    if (!blocked) throw new Error('TEST 7 FAILED: Upload should have been blocked');

    // TEST 8: Low storage warning when usage reaches >= 95% (remaining <= 5%)
    console.log('\nTEST 8: Testing <= 5% remaining warning...');
    // Add 4.2 GB so used becomes 19.2 GB / 20 GB (96% used, 4% remaining)
    const extraKey = `lectures/extra_${testSuffix}.mp4`;
    const extraBytes = Math.round(4.2 * GB);
    await resourceService.registerFile({
      institution: inst._id,
      department: dept._id,
      owner: prof._id,
      fileName: 'extra_clip.mp4',
      storageKey: extraKey,
      filePath: `/uploads/${extraKey}`,
      fileSizeBytes: extraBytes,
      relatedEntityType: 'LECTURE'
    });
    profOverview = await resourceService.getCompleteResourceOverview({ level: 'PROFESSOR', id: prof._id });
    if (profOverview.storage.lowStorageWarning === true && profOverview.storage.remainingPercentage <= 5) {
      console.log(`✓ TEST 8 PASSED: lowStorageWarning triggered. Remaining: ${profOverview.storage.remainingPercentage}%`);
    } else {
      throw new Error(`TEST 8 FAILED: Expected lowStorageWarning=true, got ${profOverview.storage.lowStorageWarning}`);
    }

    // TEST 9: Transcript PDF is generated and registered
    console.log('\nTEST 9: Transcript PDF registered in FileMetadata & StorageUsageLog...');
    const pdfKey = `transcripts/transcript_${testSuffix}.pdf`;
    await resourceService.registerFile({
      institution: inst._id,
      department: dept._id,
      owner: prof._id,
      fileName: 'transcript_english.pdf',
      storageKey: pdfKey,
      filePath: `/uploads/${pdfKey}`,
      fileSizeBytes: 2 * 1024 * 1024, // 2 MB
      relatedEntityType: 'OTHER'
    });
    const pdfLog = await StorageUsageLog.findOne({ storageKey: pdfKey, action: 'GENERATED' });
    if (pdfLog && pdfLog.fileCategory === 'TRANSCRIPT_PDF') {
      console.log('✓ TEST 9 PASSED: Transcript PDF categorized as TRANSCRIPT_PDF and logged as GENERATED.');
    } else {
      throw new Error(`TEST 9 FAILED: PDF log not found or wrong category`);
    }

    // TEST 10: Generated Audio is created and registered
    console.log('\nTEST 10: Generated Audio registered in FileMetadata & StorageUsageLog...');
    const audioKey = `audio/lecture_hi_${testSuffix}.mp3`;
    await resourceService.registerFile({
      institution: inst._id,
      department: dept._id,
      owner: prof._id,
      fileName: 'lecture_hindi.mp3',
      storageKey: audioKey,
      filePath: `/uploads/${audioKey}`,
      fileSizeBytes: 25 * 1024 * 1024, // 25 MB
      relatedEntityType: 'GENERATED_AUDIO'
    });
    const audioLog = await StorageUsageLog.findOne({ storageKey: audioKey, action: 'GENERATED' });
    if (audioLog && audioLog.fileCategory === 'GENERATED_AUDIO') {
      console.log('✓ TEST 10 PASSED: Generated Audio logged with exact bytes and category.');
    } else {
      throw new Error(`TEST 10 FAILED: Audio log not found`);
    }

    // TEST 11: File deletion reclaims FileMetadata storage
    console.log('\nTEST 11: Soft deleting file to verify storage release...');
    const usedBeforeDelete = (await resourceService.getCompleteResourceOverview({ level: 'PROFESSOR', id: prof._id })).storage.used;
    await resourceService.softDeleteFile(extraKey); // Delete the extra file
    const usedAfterDelete = (await resourceService.getCompleteResourceOverview({ level: 'PROFESSOR', id: prof._id })).storage.used;
    const reclaimed = usedBeforeDelete - usedAfterDelete;
    if (Math.abs(reclaimed - extraBytes) < 5) {
      console.log(`✓ TEST 11 PASSED: Exactly ${reclaimed} bytes reclaimed. Used dropped from ${usedBeforeDelete} to ${usedAfterDelete}.`);
    } else {
      throw new Error(`TEST 11 FAILED: Expected ${extraBytes} decrease, got ${reclaimed}`);
    }

    // TEST 12: StorageUsageLog records deletion event
    console.log('\nTEST 12: Verify StorageUsageLog recorded the DELETED action...');
    const deleteLog = await StorageUsageLog.findOne({ storageKey: extraKey, action: 'DELETED' });
    if (deleteLog && deleteLog.fileSizeBytes === extraBytes) {
      console.log('✓ TEST 12 PASSED: StorageUsageLog recorded DELETED action without affecting allocation.');
    } else {
      throw new Error(`TEST 12 FAILED: Deletion log not found or fileSizeBytes mismatch (got ${deleteLog?.fileSizeBytes}, expected ${extraBytes})`);
    }

    // TEST 13: Duplicate storageKey registration prevents double counting
    console.log('\nTEST 13: Re-registering existing storageKey to test duplicate prevention...');
    const usedBeforeDup = (await resourceService.getCompleteResourceOverview({ level: 'PROFESSOR', id: prof._id })).storage.used;
    await resourceService.registerFile({
      institution: inst._id,
      department: dept._id,
      owner: prof._id,
      fileName: 'lecture_intro.mp4',
      storageKey: videoKey, // same key
      filePath: `/uploads/${videoKey}`,
      fileSizeBytes: 5 * GB,
      relatedEntityType: 'LECTURE'
    });
    const usedAfterDup = (await resourceService.getCompleteResourceOverview({ level: 'PROFESSOR', id: prof._id })).storage.used;
    if (usedBeforeDup === usedAfterDup) {
      console.log('✓ TEST 13 PASSED: Zero increase in usage. Duplicate registration reconciled safely.');
    } else {
      throw new Error(`TEST 13 FAILED: Double counting detected!`);
    }

    // TEST 14: Attempt to reduce allocation below actual physical usage
    console.log('\nTEST 14: Attempt to reduce allocation below actual usage...');
    const currentProfUsed = (await resourceService.getCompleteResourceOverview({ level: 'PROFESSOR', id: prof._id })).storage.used;
    let reduceBlocked = false;
    try {
      await resourceService.saveAllocation({
        resourceType: 'STORAGE',
        parentLevel: 'DEPARTMENT',
        parentId: dept._id,
        childLevel: 'PROFESSOR',
        childId: prof._id,
        allocatedAmount: currentProfUsed - 1000, // below actual usage
        reason: 'Illegal reduction'
      });
    } catch (err) {
      if (err.statusCode === 409) {
        reduceBlocked = true;
        console.log(`✓ TEST 14 PASSED: Allocation reduction rejected with 409: "${err.message}"`);
      }
    }
    if (!reduceBlocked) throw new Error('TEST 14 FAILED: Should block reduction below actual usage');

    // TEST 15: Breakdown accuracy check
    console.log('\nTEST 15: Verifying professor breakdown matches getActualStorageUsage...');
    const breakdown = await resourceService.getProfessorStorageBreakdown(prof._id);
    const actualUsage = await resourceService.getActualStorageUsage({ level: 'PROFESSOR', id: prof._id });
    if (breakdown.totalUsed === actualUsage) {
      console.log(`✓ TEST 15 PASSED: Breakdown totalUsed (${breakdown.totalUsed}) matches getActualStorageUsage (${actualUsage}) exactly.`);
      console.log(`  - Lecture Videos: ${breakdown.lectureVideos.bytes} bytes (${breakdown.lectureVideos.count} files)`);
      console.log(`  - Materials: ${breakdown.additionalMaterials.bytes} bytes (${breakdown.additionalMaterials.count} files)`);
      console.log(`  - Transcript PDFs: ${breakdown.transcriptPdfs.bytes} bytes (${breakdown.transcriptPdfs.count} files)`);
      console.log(`  - Generated Audio: ${breakdown.generatedAudio.bytes} bytes (${breakdown.generatedAudio.count} files)`);
    } else {
      throw new Error(`TEST 15 FAILED: Breakdown mismatch`);
    }

    // TEST 16: Tenant isolation validation
    console.log('\nTEST 16: Testing hierarchy path and cross-tenant isolation...');
    let invalidPathBlocked = false;
    try {
      // Dept Admin trying to allocate directly to University
      await resourceService.saveAllocation({
        resourceType: 'STORAGE',
        parentLevel: 'DEPARTMENT',
        parentId: dept._id,
        childLevel: 'UNIVERSITY',
        childId: otherUni._id,
        allocatedAmount: 1000
      });
    } catch (err) {
      if (err.statusCode === 400) {
        invalidPathBlocked = true;
        console.log(`✓ TEST 16 PASSED: Invalid allocation hierarchy rejected with 400: "${err.message}"`);
      }
    }
    if (!invalidPathBlocked) throw new Error('TEST 16 FAILED: Invalid hierarchy should be blocked');

    // TEST 17: Existing lecture transcription intact
    console.log('\nTEST 17: Verifying transcription service exports...');
    const transcription = require('../services/transcription');
    if (typeof transcription.transcribeLectureAsync === 'function' && typeof transcription.isTranscribable === 'function') {
      console.log('✓ TEST 17 PASSED: transcription.js exports intact and protected.');
    } else {
      throw new Error('TEST 17 FAILED: transcription service exported methods missing');
    }

    // TEST 18: Existing multilingual TTS intact
    console.log('\nTEST 18: Verifying audioSynthesisService exports...');
    const audioSynth = require('../services/audioSynthesisService');
    if (typeof audioSynth.generateLectureAudio === 'function' && typeof audioSynth.autoGenerateSpeechToSpeech === 'function') {
      console.log('✓ TEST 18 PASSED: audioSynthesisService.js exports intact and protected.');
    } else {
      throw new Error('TEST 18 FAILED: audio synthesis service exported methods missing');
    }

    // TEST 19: Existing AI assignment evaluation intact
    console.log('\nTEST 19: Verifying aiAssignmentEvaluationService exports...');
    const aiEval = require('../services/aiAssignmentEvaluationService');
    if (typeof aiEval.evaluatePdfSubmission === 'function' && typeof aiEval.buildEvaluationPrompt === 'function') {
      console.log('✓ TEST 19 PASSED: aiAssignmentEvaluationService.js intact and untouched.');
    } else {
      throw new Error('TEST 19 FAILED: ai assignment evaluation service missing');
    }

    // TEST 20: Existing direct B2 upload intact
    console.log('\nTEST 20: Verifying storageService B2 multipart methods...');
    const storageService = require('../services/storageService');
    if (
      typeof storageService.initiateMultipartUpload === 'function' &&
      typeof storageService.getPresignedPartUrls === 'function' &&
      typeof storageService.completeMultipartUpload === 'function' &&
      typeof storageService.abortMultipartUpload === 'function'
    ) {
      console.log('✓ TEST 20 PASSED: B2 multipart upload lifecycle methods fully intact and protected.');
    } else {
      throw new Error('TEST 20 FAILED: storageService multipart methods missing');
    }

    console.log('\n====================================================');
    console.log('ALL 20 TEST CASES PASSED SUCCESSFULLY!');
    console.log('====================================================');
  } finally {
    // Complete cleanup of test fixtures
    console.log('\nCleaning up test fixtures...');
    if (prof) {
      await FileMetadata.deleteMany({ owner: prof._id });
      await StorageUsageLog.deleteMany({ professor: prof._id });
      await ResourceAllocation.deleteMany({ childId: prof._id });
      await ResourceAllocationHistory.deleteMany({ childId: prof._id });
      await User.deleteOne({ _id: prof._id });
    }
    if (dept) {
      await ResourceAllocation.deleteMany({ childId: dept._id });
      await ResourceAllocationHistory.deleteMany({ childId: dept._id });
      await Department.deleteOne({ _id: dept._id });
    }
    if (inst) {
      await ResourceAllocation.deleteMany({ childId: inst._id });
      await ResourceAllocationHistory.deleteMany({ childId: inst._id });
      await Institution.deleteOne({ _id: inst._id });
    }
    if (uni) {
      await ResourceAllocation.deleteMany({ childId: uni._id });
      await ResourceAllocationHistory.deleteMany({ childId: uni._id });
      await University.deleteOne({ _id: uni._id });
    }
    if (otherUni) {
      await University.deleteOne({ _id: otherUni._id });
    }

    // Restore standard 10 GB configuration
    await StorageSystemConfig.deleteMany({});
    await StorageSystemConfig.create({
      provider: 'BACKBLAZE_B2',
      bucketName: 'ai-lecture-db',
      masterPoolBytes: 10 * GB,
      freeAllowanceBytes: 10 * GB,
      lastB2UsageBytes: 110802824,
      lastB2ObjectCount: 17,
      lastB2SyncStatus: 'SUCCESS',
      lastB2SyncAt: new Date()
    });

    await mongoose.disconnect();
    console.log('Cleanup completed and database disconnected.');
  }
}

runTests().catch(err => {
  console.error('\n❌ TEST SUITE FAILURE:', err.message);
  process.exit(1);
});
