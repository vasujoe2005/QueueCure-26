const Patient = require('../models/Patient');
const Visit = require('../models/Visit');
const ConsultationAnalytics = require('../models/ConsultationAnalytics');
const {
  approachingEmail,
  calledEmail,
  cancellationUpdatedEmail,
  nextEmail,
  sendQueueEmail,
  tokenGeneratedEmail,
} = require('../services/emailService');

const REASON_DEFAULTS = {
  Fever: 6,
  Cold: 5,
  'Diabetes Review': 15,
  'BP Checkup': 7,
  'General Consultation': 8,
  'Lab Report Review': 7,
  Vaccination: 5,
  Emergency: 20,
  'Follow-Up': 5,
  'Prescription Renewal': 4,
};

function cleanPhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function publicAppUrl() {
  return (process.env.PUBLIC_APP_URL || 'http://localhost:5173').replace(/\/$/, '');
}

function visitSort() {
  return { priority: -1, tokenNumber: 1, createdAt: 1 };
}

function toVisitDto(visit) {
  const plainVisit = visit.toObject ? visit.toObject() : visit;
  const patient = plainVisit.patientId && typeof plainVisit.patientId === 'object' ? plainVisit.patientId : null;

  return {
    ...plainVisit,
    patient,
    patientId: patient?._id || plainVisit.patientId,
  };
}

function minutesElapsedSince(value) {
  if (!value) return 0;
  return Math.max(Math.floor((Date.now() - new Date(value).getTime()) / 60000), 0);
}

function remainingConsultationMinutes(visit) {
  if (!visit) return 0;
  const planned = visit.estimatedMinutes || REASON_DEFAULTS[visit.visitReason] || 8;
  return Math.max(planned - minutesElapsedSince(visit.calledAt), 0);
}

async function estimateForReason(visitReason) {
  const analytics = await ConsultationAnalytics.findOne({ visitReason }).lean();
  return analytics?.averageConsultationTime || REASON_DEFAULTS[visitReason] || 8;
}

async function getReasonStats() {
  const storedStats = await ConsultationAnalytics.find().sort({ totalVisits: -1, visitReason: 1 }).lean();
  const knownReasons = new Set(storedStats.map((item) => item.visitReason));
  const defaults = Object.entries(REASON_DEFAULTS)
    .filter(([visitReason]) => !knownReasons.has(visitReason))
    .map(([visitReason, averageConsultationTime]) => ({ visitReason, averageConsultationTime, totalVisits: 0 }));

  return [...storedStats, ...defaults];
}

function predictedQueue(waiting, inProgress) {
  const activeRemaining = remainingConsultationMinutes(inProgress);

  return waiting.map((visit, index) => ({
    ...toVisitDto(visit),
    patientsAhead: index,
    estimatedWait: activeRemaining + waiting
      .slice(0, index)
      .reduce((sum, item) => sum + (item.estimatedMinutes || REASON_DEFAULTS[item.visitReason] || 8), 0),
  }));
}

async function getQueueSnapshot() {
  const visits = await Visit.find()
    .populate('patientId')
    .sort(visitSort())
    .lean();

  const waiting = visits.filter((visit) => visit.status === 'waiting');
  const inProgress = visits.find((visit) => visit.status === 'in_progress') || null;
  const completedToday = visits.filter((visit) => visit.status === 'completed').length;
  const waitingWithPredictions = predictedQueue(waiting, inProgress);

  return {
    visits: visits.map(toVisitDto),
    waiting: waitingWithPredictions,
    waitingCount: waiting.length,
    activeToken: inProgress ? { ...toVisitDto(inProgress), remainingMinutes: remainingConsultationMinutes(inProgress) } : null,
    completedToday,
    reasonStats: await getReasonStats(),
    averageWait: waiting.length
      ? Math.round(waitingWithPredictions.reduce((sum, visit) => sum + visit.estimatedWait, 0) / waiting.length)
      : 0,
  };
}

async function maybeSendQueueAlerts(snapshot) {
  const currentToken = snapshot.activeToken?.displayToken;

  for (const visit of snapshot.waiting) {
    const updates = {};

    if (visit.patientsAhead === 3 && !visit.alertsSent?.approaching) {
      await sendQueueEmail(approachingEmail(visit));
      updates['alertsSent.approaching'] = true;
    }

    if (visit.patientsAhead === 0 && !visit.alertsSent?.next) {
      await sendQueueEmail(nextEmail(visit, currentToken));
      updates['alertsSent.next'] = true;
    }

    if (Object.keys(updates).length) {
      await Visit.findByIdAndUpdate(visit._id, { $set: updates });
    }
  }
}

async function emitQueueUpdate(req) {
  const io = req.app.get('io');
  const snapshot = await getQueueSnapshot();
  await maybeSendQueueAlerts(snapshot);
  io.emit('queue:update', await getQueueSnapshot());
}

async function listQueue(_req, res, next) {
  try {
    res.json(await getQueueSnapshot());
  } catch (error) {
    next(error);
  }
}

async function lookupPatient(req, res, next) {
  try {
    const contact = String(req.params.contact || '').trim().toLowerCase();
    const phone = cleanPhone(contact);
    const patientQuery = {
      $or: [
        ...(phone ? [{ phone }] : []),
        { email: contact },
      ],
    };
    const patients = await Patient.find(patientQuery).sort({ updatedAt: -1, patientName: 1 }).lean();

    if (!patients.length) {
      return res.status(404).json({ found: false });
    }

    const patientIds = patients.map((patient) => patient._id);
    const history = await Visit.find({ patientId: { $in: patientIds } })
      .populate('patientId')
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    return res.json({
      found: true,
      patients: patients.map((patient) => ({
        ...patient,
        previousVisits: history.filter((visit) => String(visit.patientId?._id || visit.patientId) === String(patient._id)).length,
      })),
      previousVisits: history.length,
      history: history.map(toVisitDto),
    });
  } catch (error) {
    return next(error);
  }
}

async function createVisit(req, res, next) {
  try {
    const phone = cleanPhone(req.body.phone);
    const patientName = String(req.body.patientName || req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const visitReason = String(req.body.visitReason || '').trim();
    const selectedPatientId = String(req.body.patientId || '').trim();

    if (!patientName || !phone || !email || !visitReason) {
      return res.status(400).json({ message: 'patientName, phone, email, and visitReason are required' });
    }

    let patient = selectedPatientId ? await Patient.findById(selectedPatientId) : null;

    if (!patient) {
      patient = await Patient.findOne({ phone, email, patientName });
    }

    if (!patient) {
      patient = await Patient.create({
        patientName,
        phone,
        email,
        age: req.body.age ? Number(req.body.age) : null,
        gender: req.body.gender || '',
      });
    } else {
      patient.patientName = patientName;
      patient.email = email;
      patient.age = req.body.age ? Number(req.body.age) : patient.age;
      patient.gender = req.body.gender || patient.gender;
      await patient.save();
    }

    const lastVisit = await Visit.findOne().sort({ tokenNumber: -1 }).lean();
    const tokenNumber = lastVisit ? lastVisit.tokenNumber + 1 : 1;
    const isEmergency = visitReason === 'Emergency';
    const displayToken = isEmergency ? `E${tokenNumber}` : String(tokenNumber);
    const estimatedMinutes = await estimateForReason(visitReason);
    const trackingUrl = `${publicAppUrl()}/track/${displayToken}`;
    const cancellationUrl = `${trackingUrl}?cancel=1`;

    const visit = await Visit.create({
      patientId: patient._id,
      tokenNumber,
      displayToken,
      visitReason,
      trackingUrl,
      cancellationUrl,
      priority: isEmergency ? 10 : 0,
      estimatedMinutes,
    });

    const populatedVisit = await Visit.findById(visit._id).populate('patientId');
    const visitDto = toVisitDto(populatedVisit);

    await sendQueueEmail(tokenGeneratedEmail(visitDto));
    await emitQueueUpdate(req);

    return res.status(201).json(visitDto);
  } catch (error) {
    return next(error);
  }
}

async function updateReasonAnalytics(visit) {
  if (!visit.calledAt || !visit.completedAt) return;

  const actualMinutes = Math.max((visit.completedAt - visit.calledAt) / 60000, 1);
  const current = await ConsultationAnalytics.findOne({ visitReason: visit.visitReason });

  if (!current) {
    await ConsultationAnalytics.create({
      visitReason: visit.visitReason,
      averageConsultationTime: Number(actualMinutes.toFixed(1)),
      totalVisits: 1,
    });
    return;
  }

  const totalVisits = current.totalVisits + 1;
  const averageConsultationTime = ((current.averageConsultationTime * current.totalVisits) + actualMinutes) / totalVisits;
  current.averageConsultationTime = Number(averageConsultationTime.toFixed(1));
  current.totalVisits = totalVisits;
  await current.save();
}

async function callNext(req, res, next) {
  try {
    const existingInProgress = await Visit.findOne({ status: 'in_progress' });
    if (existingInProgress) {
      existingInProgress.status = 'completed';
      existingInProgress.completedAt = new Date();
      await existingInProgress.save();
      await updateReasonAnalytics(existingInProgress);
    }

    const nextVisit = await Visit.findOneAndUpdate(
      { status: 'waiting' },
      { $set: { status: 'in_progress', calledAt: new Date(), 'alertsSent.called': true } },
      { new: true, sort: visitSort() },
    ).populate('patientId');

    if (!nextVisit) {
      await emitQueueUpdate(req);
      return res.status(404).json({ message: 'No waiting patients' });
    }

    const visitDto = toVisitDto(nextVisit);
    await sendQueueEmail(calledEmail(visitDto));
    await emitQueueUpdate(req);

    return res.json(visitDto);
  } catch (error) {
    return next(error);
  }
}

async function completeVisit(req, res, next) {
  try {
    const visit = await Visit.findByIdAndUpdate(
      req.params.id,
      { status: 'completed', completedAt: new Date() },
      { new: true },
    ).populate('patientId');

    if (!visit) {
      return res.status(404).json({ message: 'Visit not found' });
    }

    await updateReasonAnalytics(visit);
    await emitQueueUpdate(req);
    return res.json(toVisitDto(visit));
  } catch (error) {
    return next(error);
  }
}

async function notifyCancellationImpact(cancelledVisit) {
  const snapshot = await getQueueSnapshot();
  const impactedVisits = snapshot.waiting.filter((visit) => (
    visit.priority < cancelledVisit.priority
    || (visit.priority === cancelledVisit.priority && visit.tokenNumber > cancelledVisit.tokenNumber)
  ));

  for (const visit of impactedVisits) {
    await sendQueueEmail(cancellationUpdatedEmail(visit, cancelledVisit.displayToken));
  }
}

async function cancelVisit(req, res, next) {
  try {
    const token = String(req.params.token || '').trim().toUpperCase();
    const filter = req.params.id
      ? { _id: req.params.id, status: 'waiting' }
      : { displayToken: token, status: 'waiting' };

    const visit = await Visit.findOneAndUpdate(
      filter,
      { $set: { status: 'cancelled', cancelledAt: new Date() } },
      { new: true },
    ).populate('patientId');

    if (!visit) {
      return res.status(404).json({ message: 'Waiting visit not found or already started' });
    }

    await notifyCancellationImpact(toVisitDto(visit));
    await emitQueueUpdate(req);

    return res.json({ message: 'Token cancelled', visit: toVisitDto(visit) });
  } catch (error) {
    return next(error);
  }
}

async function findTrackedVisit({ phone, token }) {
  const filter = token
    ? { displayToken: token.toUpperCase(), status: { $in: ['waiting', 'in_progress'] } }
    : { status: { $in: ['waiting', 'in_progress'] } };

  if (phone) {
    const patient = await Patient.findOne({ phone }).lean();
    if (!patient) return null;
    filter.patientId = patient._id;
  }

  return Visit.findOne(filter).sort({ createdAt: -1 }).populate('patientId');
}

async function trackVisit(req, res, next) {
  try {
    const phone = cleanPhone(req.query.phone);
    const token = String(req.query.token || req.params.token || '').trim();
    const visit = await findTrackedVisit({ phone, token });

    if (!visit) return res.status(404).json({ message: 'Active visit not found' });

    const snapshot = await getQueueSnapshot();
    const activeOrWaiting = snapshot.activeToken?._id?.toString() === visit._id.toString()
      ? snapshot.activeToken
      : snapshot.waiting.find((item) => item._id.toString() === visit._id.toString());

    return res.json({
      nowServing: snapshot.activeToken,
      visit: activeOrWaiting || toVisitDto(visit),
      patientsAhead: activeOrWaiting?.patientsAhead || 0,
      estimatedWait: activeOrWaiting?.estimatedWait || 0,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  callNext,
  cancelVisit,
  completeVisit,
  createVisit,
  getQueueSnapshot,
  listQueue,
  lookupPatient,
  trackVisit,
};
