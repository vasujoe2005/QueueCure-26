const nodemailer = require('nodemailer');

let transporter;

function getTransporter() {
  if (transporter) return transporter;

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return null;
  }

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT || 587) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return transporter;
}

async function sendQueueEmail({ to, subject, text }) {
  if (!to) return;

  const activeTransporter = getTransporter();
  const from = process.env.SMTP_FROM || 'QueueCure <no-reply@queuecure.app>';

  if (!activeTransporter) {
    console.log('[email:preview]', { to, from, subject, text });
    return;
  }

  await activeTransporter.sendMail({ to, from, subject, text });
}

function patientFirstName(patient) {
  return String(patient?.patientName || 'Patient').split(' ')[0];
}

function tokenGeneratedEmail(visit) {
  return {
    to: visit.patient.email,
    subject: 'QueueCure - Token Generated',
    text: `Hello ${patientFirstName(visit.patient)},

Your token has been generated.

Token Number: ${visit.displayToken}
Visit Type: ${visit.visitReason}

Track Your Queue Live:

${visit.trackingUrl}

Cancel Token:

${visit.cancellationUrl}

Thank you.`,
  };
}

function approachingEmail(visit) {
  return {
    to: visit.patient.email,
    subject: 'QueueCure - Your Turn Is Approaching',
    text: `Hello ${patientFirstName(visit.patient)},

Your consultation is approaching.

Patients Ahead: ${visit.patientsAhead}

Estimated Wait:
${visit.estimatedWait} minutes

Track Live:

${visit.trackingUrl}`,
  };
}

function nextEmail(visit, currentToken) {
  return {
    to: visit.patient.email,
    subject: 'QueueCure - You Are Next',
    text: `Hello ${patientFirstName(visit.patient)},

You are next in line.

Current Token:
${currentToken || '--'}

Your Token:
${visit.displayToken}

Estimated Wait:
${visit.estimatedWait} minutes

Please stay near the clinic.

Track Live:

${visit.trackingUrl}`,
  };
}

function calledEmail(visit) {
  const doctorRoom = process.env.DOCTOR_ROOM || 'Doctor Room 1';

  return {
    to: visit.patient.email,
    subject: 'QueueCure - Please Proceed',
    text: `Hello ${patientFirstName(visit.patient)},

Token ${visit.displayToken} has been called.

Please proceed to:

${doctorRoom}

Thank you.`,
  };
}

function cancellationUpdatedEmail(visit, cancelledToken) {
  return {
    to: visit.patient.email,
    subject: 'QueueCure - Estimated Wait Updated',
    text: `Hello ${patientFirstName(visit.patient)},

The patient before you cancelled token ${cancelledToken}.

Your updated queue estimate is:
Patients Ahead: ${visit.patientsAhead}
Estimated Wait: ${visit.estimatedWait} minutes

Track Live:

${visit.trackingUrl}`,
  };
}

module.exports = {
  approachingEmail,
  calledEmail,
  cancellationUpdatedEmail,
  nextEmail,
  sendQueueEmail,
  tokenGeneratedEmail,
};
