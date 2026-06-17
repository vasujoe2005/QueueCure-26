const mongoose = require('mongoose');

const patientSchema = new mongoose.Schema(
  {
    patientName: {
      type: String,
      required: true,
      trim: true,
    },
    tokenNumber: {
      type: Number,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['waiting', 'called', 'completed'],
      default: 'waiting',
      index: true,
    },
    calledAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  },
);

module.exports = mongoose.model('Patient', patientSchema, 'patients');
