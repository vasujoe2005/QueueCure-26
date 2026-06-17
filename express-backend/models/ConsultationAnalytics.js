const mongoose = require('mongoose');

const consultationAnalyticsSchema = new mongoose.Schema(
  {
    visitReason: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    averageConsultationTime: {
      type: Number,
      required: true,
      default: 8,
    },
    totalVisits: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model('ConsultationAnalytics', consultationAnalyticsSchema, 'consultation_analytics');
