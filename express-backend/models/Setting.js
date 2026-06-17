const mongoose = require('mongoose');

const settingSchema = new mongoose.Schema(
  {
    averageConsultationTime: {
      type: Number,
      default: 7,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model('Setting', settingSchema, 'settings');
