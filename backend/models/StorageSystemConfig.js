const mongoose = require('mongoose');

const storageSystemConfigSchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      default: 'BACKBLAZE_B2',
      uppercase: true
    },
    bucketName: {
      type: String,
      default: process.env.B2_BUCKET_NAME || 'ai-lecture-db'
    },
    // Master storage pool configured for this educational platform
    // Default: 10 GB (10 * 1024 * 1024 * 1024 bytes) = 10,737,418,240 bytes
    masterPoolBytes: {
      type: Number,
      default: () => {
        const envBytes = Number(process.env.MASTER_STORAGE_POOL_BYTES);
        if (!isNaN(envBytes) && envBytes > 0) return envBytes;
        const envGb = Number(process.env.MASTER_STORAGE_POOL_GB);
        if (!isNaN(envGb) && envGb > 0) return envGb * 1024 * 1024 * 1024;
        return 10 * 1024 * 1024 * 1024; // 10 GB free allowance default
      }
    },
    freeAllowanceBytes: {
      type: Number,
      default: 10 * 1024 * 1024 * 1024 // 10 GB
    },
    lastB2UsageBytes: {
      type: Number,
      default: 0
    },
    lastB2ObjectCount: {
      type: Number,
      default: 0
    },
    lastB2SyncAt: {
      type: Date,
      default: null
    },
    lastB2SyncStatus: {
      type: String,
      enum: ['SUCCESS', 'FAILED', 'PENDING', 'UNAVAILABLE'],
      default: 'PENDING'
    },
    lastB2SyncError: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true
  }
);

/**
 * Singleton configuration retrieval / initialization
 */
storageSystemConfigSchema.statics.getConfig = async function () {
  let config = await this.findOne();
  if (!config) {
    const envBytes = Number(process.env.MASTER_STORAGE_POOL_BYTES);
    const envGb = Number(process.env.MASTER_STORAGE_POOL_GB);
    let masterPoolBytes = 10 * 1024 * 1024 * 1024;
    if (!isNaN(envBytes) && envBytes > 0) {
      masterPoolBytes = envBytes;
    } else if (!isNaN(envGb) && envGb > 0) {
      masterPoolBytes = envGb * 1024 * 1024 * 1024;
    }

    config = await this.create({
      provider: (process.env.STORAGE_PROVIDER || 'b2').toUpperCase() === 'B2' ? 'BACKBLAZE_B2' : 'CLOUDFLARE_R2',
      bucketName: process.env.B2_BUCKET_NAME || process.env.R2_BUCKET_NAME || 'ai-lecture-db',
      masterPoolBytes,
      freeAllowanceBytes: 10 * 1024 * 1024 * 1024,
      lastB2SyncStatus: 'PENDING'
    });
  } else {
    // If environment variable explicitly forces a new master pool override
    const envBytes = Number(process.env.MASTER_STORAGE_POOL_BYTES);
    const envGb = Number(process.env.MASTER_STORAGE_POOL_GB);
    if (!isNaN(envBytes) && envBytes > 0 && config.masterPoolBytes !== envBytes) {
      config.masterPoolBytes = envBytes;
      await config.save();
    } else if (!isNaN(envGb) && envGb > 0 && config.masterPoolBytes !== envGb * 1024 * 1024 * 1024) {
      config.masterPoolBytes = envGb * 1024 * 1024 * 1024;
      await config.save();
    }
  }
  return config;
};

module.exports = mongoose.model('StorageSystemConfig', storageSystemConfigSchema);
