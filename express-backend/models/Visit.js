const mongoose = require('mongoose');

const visitSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },
    tokenNumber: {
      type: Number,
      required: true,
      index: true,
    },
    displayToken: {
      type: String,
      required: true,
      index: true,
    },
    visitReason: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    priority: {
      type: Number,
      default: 0,
      index: true,
    },
    status: {
      type: String,
      enum: ['waiting', 'in_progress', 'completed', 'cancelled'],
      default: 'waiting',
      index: true,
    },
    trackingUrl: {
      type: String,
      default: '',
    },
    cancellationUrl: {
      type: String,
      default: '',
    },
    alertsSent: {
      approaching: {
        type: Boolean,
        default: false,
      },
      next: {
        type: Boolean,
        default: false,
      },
      called: {
        type: Boolean,
        default: false,
      },
    },
    estimatedMinutes: {
      type: Number,
      default: 8,
    },
    calledAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  },
);

module.exports = mongoose.model('Visit', visitSchema, 'visits');
