const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mongoose = require('mongoose');

const ResourceAllocation = require('./models/ResourceAllocation');
const ResourceAllocationHistory = require('./models/ResourceAllocationHistory');
const University = require('./models/University');
const Institution = require('./models/Institution');

async function safeCleanupStaleAllocations() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-lecture-system';
  console.log('Connecting to MongoDB at:', mongoUri);
  await mongoose.connect(mongoUri);

  console.log('\n======================================================');
  console.log('      SAFE STALE STORAGE ALLOCATION CLEANUP AUDIT     ');
  console.log('======================================================\n');

  // 1. Fetch current Universities
  const currentUniversities = await University.find({}).lean();
  const uniMap = {};
  currentUniversities.forEach(u => { uniMap[u._id.toString()] = u; });

  console.log(`Current Real Universities in DB (${currentUniversities.length}):`);
  currentUniversities.forEach(u => console.log(`  - [ID: ${u._id}] ${u.name} (${u.code})`));

  // 2. Fetch all Super Admin level storage allocations
  const superAdminAllocations = await ResourceAllocation.find({
    resourceType: 'STORAGE',
    parentLevel: 'SUPER_ADMIN'
  }).lean();

  console.log(`\nCurrent Super Admin Storage Allocations in DB (${superAdminAllocations.length}):`);

  const toDeleteIds = [];

  for (const alloc of superAdminAllocations) {
    let referencedEntityName = 'UNKNOWN';
    let targetExists = false;
    let isStale = false;
    let staleReason = '';

    if (alloc.childLevel === 'UNIVERSITY') {
      const u = uniMap[alloc.childId.toString()];
      if (u) {
        referencedEntityName = u.name;
        targetExists = true;
      } else {
        isStale = true;
        staleReason = 'Target University no longer exists in University collection.';
      }
    } else if (alloc.childLevel === 'INSTITUTION') {
      const inst = await Institution.findById(alloc.childId).lean();
      if (inst) {
        referencedEntityName = inst.name;
        targetExists = true;
      }
      isStale = true;
      staleReason = `Obsolete direct Super Admin -> Institution allocation (Child Level: INSTITUTION). Super Admin allocations must target UNIVERSITY level in multi-tenant hierarchy.`;
    }

    const amountTB = (alloc.allocatedAmount / (1024 * 1024 * 1024 * 1024)).toFixed(2);
    console.log(`\nAllocation ID: ${alloc._id}`);
    console.log(`  - Child Level: ${alloc.childLevel}`);
    console.log(`  - Child ID: ${alloc.childId}`);
    console.log(`  - Referenced Entity: "${referencedEntityName}"`);
    console.log(`  - Referenced Entity Exists: ${targetExists}`);
    console.log(`  - Allocated Amount: ${alloc.allocatedAmount} bytes (${amountTB} TB)`);
    console.log(`  - Created At: ${alloc.createdAt}`);
    console.log(`  - Status: ${isStale ? 'STALE / ORPHANED (Marked for Cleanup)' : 'VALID / AUTHORITATIVE (Preserved)'}`);
    if (isStale) console.log(`  - Reason: ${staleReason}`);

    if (isStale) {
      toDeleteIds.push(alloc._id);
    }
  }

  // Also check downstream allocations under IIT Delhi Institution (6aa228a2b4804256e8be2fbc)
  const iitdInstId = '6aa228a2b4804256e8be2fbc';
  const iitdChildAllocations = await ResourceAllocation.find({
    $or: [
      { parentLevel: 'INSTITUTION', parentId: iitdInstId },
      { parentLevel: 'DEPARTMENT', parentId: { $in: ['6aa228a2b4804256e8be2fc0', '6aa228a2b4804256e8be2fc1'] } }
    ]
  }).lean();

  console.log(`\nDownstream Orphaned Allocations under IIT Delhi Institution (${iitdChildAllocations.length}):`);
  for (const alloc of iitdChildAllocations) {
    console.log(`  - Child Allocation ID: ${alloc._id} | Parent: ${alloc.parentLevel}:${alloc.parentId} -> Child: ${alloc.childLevel}:${alloc.childId}`);
    toDeleteIds.push(alloc._id);
  }

  console.log('\n======================================================');
  console.log(`TOTAL STALE ALLOCATION RECORDS TO REMOVE: ${toDeleteIds.length}`);
  console.log('======================================================');

  if (toDeleteIds.length > 0) {
    const deleteResult = await ResourceAllocation.deleteMany({ _id: { $in: toDeleteIds } });
    console.log(`Successfully removed ${deleteResult.deletedCount} stale ResourceAllocation record(s).`);

    // Also remove matching history records if any exist for these allocation IDs
    await ResourceAllocationHistory.deleteMany({ allocationId: { $in: toDeleteIds } });
  } else {
    console.log('No stale allocation records to remove.');
  }

  console.log('\n======================================================');
  console.log('      VERIFICATION POST-CLEANUP SUMMARY              ');
  console.log('======================================================');

  const remainingSuperAdminAllocs = await ResourceAllocation.find({ parentLevel: 'SUPER_ADMIN', resourceType: 'STORAGE' }).lean();
  console.log(`Remaining Super Admin Storage Allocations: ${remainingSuperAdminAllocs.length}`);
  let totalAllocated = 0;
  for (const alloc of remainingSuperAdminAllocs) {
    totalAllocated += alloc.allocatedAmount;
    let name = 'UNKNOWN';
    if (alloc.childLevel === 'UNIVERSITY') {
      const u = await University.findById(alloc.childId).lean();
      if (u) name = u.name;
    }
    console.log(`  - [ID: ${alloc._id}] ${alloc.childLevel}: "${name}" -> ${(alloc.allocatedAmount / (1024*1024*1024*1024)).toFixed(2)} TB`);
  }

  const masterPoolBytes = 10 * 1024 * 1024 * 1024; // 10 GB
  const totalTB = (totalAllocated / (1024 * 1024 * 1024 * 1024)).toFixed(2);
  console.log(`\nTotal Allocated at Super Admin Level: ${totalAllocated} bytes (${totalTB} TB)`);
  console.log(`Master Pool Capacity: ${masterPoolBytes} bytes (10 GB)`);
  console.log(`Over-allocation Status: ${totalAllocated > masterPoolBytes ? 'OVER_ALLOCATED' : 'HEALTHY'}`);

  await mongoose.disconnect();
  console.log('\nCleanup script finished successfully.');
}

safeCleanupStaleAllocations().catch(err => {
  console.error('Error in cleanup script:', err);
  process.exit(1);
});
