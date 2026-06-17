const Patient = require('../models/Patient');

async function getQueueSnapshot() {
  const patients = await Patient.find()
    .sort({ status: 1, tokenNumber: 1 })
    .lean();

  const waiting = patients.filter((patient) => patient.status === 'waiting');
  const called = patients.find((patient) => patient.status === 'called') || null;
  const completedToday = patients.filter((patient) => patient.status === 'completed').length;

  return {
    patients,
    waitingCount: waiting.length,
    activeToken: called,
    completedToday,
  };
}

async function emitQueueUpdate(req) {
  const io = req.app.get('io');
  io.emit('queue:update', await getQueueSnapshot());
}

async function listQueue(_req, res, next) {
  try {
    res.json(await getQueueSnapshot());
  } catch (error) {
    next(error);
  }
}

async function addPatient(req, res, next) {
  try {
    const patientName = String(req.body.patientName || '').trim();

    if (!patientName) {
      return res.status(400).json({ message: 'patientName is required' });
    }

    const lastPatient = await Patient.findOne().sort({ tokenNumber: -1 }).lean();
    const tokenNumber = lastPatient ? lastPatient.tokenNumber + 1 : 1;
    const patient = await Patient.create({ patientName, tokenNumber });

    await emitQueueUpdate(req);
    return res.status(201).json(patient);
  } catch (error) {
    return next(error);
  }
}

async function callNext(req, res, next) {
  try {
    await Patient.updateMany({ status: 'called' }, { status: 'completed', completedAt: new Date() });

    const nextPatient = await Patient.findOneAndUpdate(
      { status: 'waiting' },
      { status: 'called', calledAt: new Date() },
      { new: true, sort: { tokenNumber: 1 } },
    );

    await emitQueueUpdate(req);

    if (!nextPatient) {
      return res.status(404).json({ message: 'No waiting patients' });
    }

    return res.json(nextPatient);
  } catch (error) {
    return next(error);
  }
}

async function completePatient(req, res, next) {
  try {
    const patient = await Patient.findByIdAndUpdate(
      req.params.id,
      { status: 'completed', completedAt: new Date() },
      { new: true },
    );

    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    await emitQueueUpdate(req);
    return res.json(patient);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  addPatient,
  callNext,
  completePatient,
  getQueueSnapshot,
  listQueue,
};
