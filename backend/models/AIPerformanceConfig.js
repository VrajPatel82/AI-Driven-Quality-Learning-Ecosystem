const mongoose = require('mongoose');

const aiPerformanceConfigSchema = new mongoose.Schema({
  enabled: {
    type: Boolean,
    default: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, {
  timestamps: true
});

aiPerformanceConfigSchema.statics.getConfig = async function() {
  let config = await this.findOne();
  if (!config) {
    config = await this.create({ enabled: true });
  }
  return config;
};

module.exports = mongoose.model('AIPerformanceConfig', aiPerformanceConfigSchema);
