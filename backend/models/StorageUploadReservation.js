const mongoose = require('mongoose');

const storageUploadReservationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    fileName: {
      type: String,
      required: true
    },
    reservedBytes: {
      type: Number,
      required: true
    },
    uploadKey: {
      type: String,
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ['PENDING', 'COMPLETED', 'EXPIRED', 'CANCELLED'],
      default: 'PENDING',
      index: true
    },
    // Auto-expire reservations after 2 hours if abandoned
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 2 * 60 * 60 * 1000),
      index: { expires: 0 }
    }
  },
  {
    timestamps: true
  }
);

/**
 * Get total pending reserved bytes for a specific user
 */
storageUploadReservationSchema.statics.getUserPendingReservedBytes = async function (userId) {
  const result = await this.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
        status: 'PENDING',
        expiresAt: { $gt: new Date() }
      }
    },
    {
      $group: {
        _id: null,
        totalReserved: { $sum: '$reservedBytes' }
      }
    }
  ]);
  return result[0]?.totalReserved || 0;
};

/**
 * Get total global pending reserved bytes across all users
 */
storageUploadReservationSchema.statics.getGlobalPendingReservedBytes = async function () {
  const result = await this.aggregate([
    {
      $match: {
        status: 'PENDING',
        expiresAt: { $gt: new Date() }
      }
    },
    {
      $group: {
        _id: null,
        totalReserved: { $sum: '$reservedBytes' }
      }
    }
  ]);
  return result[0]?.totalReserved || 0;
};

/**
 * Mark a reservation completed when file is registered
 */
storageUploadReservationSchema.statics.completeReservation = async function (uploadKey) {
  if (!uploadKey) return null;
  return await this.updateMany(
    { uploadKey, status: 'PENDING' },
    { $set: { status: 'COMPLETED' } }
  );
};

/**
 * Cancel a reservation if upload is aborted
 */
storageUploadReservationSchema.statics.cancelReservation = async function (uploadKey) {
  if (!uploadKey) return null;
  return await this.updateMany(
    { uploadKey, status: 'PENDING' },
    { $set: { status: 'CANCELLED' } }
  );
};

module.exports = mongoose.model('StorageUploadReservation', storageUploadReservationSchema);
