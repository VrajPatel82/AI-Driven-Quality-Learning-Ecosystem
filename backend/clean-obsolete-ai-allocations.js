require('dotenv').config();
const mongoose = require('mongoose');
const ResourceAllocation = require('./models/ResourceAllocation');
const ResourceAllocationHistory = require('./models/ResourceAllocationHistory');
const MeteredAIUsageLedger = require('./models/MeteredAIUsageLedger');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-lecture-system';

async function cleanObsoleteAIAllocations() {
  console.log('--- DATABASE AUDIT BEFORE CLEANUP ---');
  await mongoose.connect(MONGO_URI);

  const storageAllocCount = await ResourceAllocation.countDocuments({ resourceType: 'STORAGE' });
  const aiAllocCount = await ResourceAllocation.countDocuments({ resourceType: 'METERED_AI' });
  const storageHistCount = await ResourceAllocationHistory.countDocuments({ resourceType: 'STORAGE' });
  const aiHistCount = await ResourceAllocationHistory.countDocuments({ resourceType: 'METERED_AI' });
  const ledgerCount = await MeteredAIUsageLedger.countDocuments({});

  console.log(`ResourceAllocation (STORAGE): ${storageAllocCount}`);
  console.log(`ResourceAllocation (METERED_AI): ${aiAllocCount}`);
  console.log(`ResourceAllocationHistory (STORAGE): ${storageHistCount}`);
  console.log(`ResourceAllocationHistory (METERED_AI): ${aiHistCount}`);
  console.log(`MeteredAIUsageLedger (OPERATIONAL): ${ledgerCount}`);

  if (aiAllocCount > 0) {
    console.log(`\nRemoving ${aiAllocCount} obsolete commercial METERED_AI ResourceAllocation records...`);
    const deleteResult = await ResourceAllocation.deleteMany({ resourceType: 'METERED_AI' });
    console.log(`Successfully deleted ${deleteResult.deletedCount} METERED_AI ResourceAllocation records.`);
  } else {
    console.log('\nNo obsolete METERED_AI ResourceAllocation records found.');
  }

  const storageAllocCountAfter = await ResourceAllocation.countDocuments({ resourceType: 'STORAGE' });
  const aiAllocCountAfter = await ResourceAllocation.countDocuments({ resourceType: 'METERED_AI' });
  const ledgerCountAfter = await MeteredAIUsageLedger.countDocuments({});

  console.log('\n--- DATABASE AUDIT AFTER CLEANUP ---');
  console.log(`ResourceAllocation (STORAGE): ${storageAllocCountAfter}`);
  console.log(`ResourceAllocation (METERED_AI): ${aiAllocCountAfter}`);
  console.log(`MeteredAIUsageLedger (OPERATIONAL): ${ledgerCountAfter} (PRESERVED)`);

  await mongoose.disconnect();
  console.log('\nCleanup script completed successfully.');
}

cleanObsoleteAIAllocations().catch((err) => {
  console.error('Cleanup script error:', err);
  process.exit(1);
});
