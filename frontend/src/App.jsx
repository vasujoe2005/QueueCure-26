import { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import { createSocket } from './socket';
import {
  callNextVisit,
  cancelVisit,
  completeVisit,
  createVisit,
  fetchQueue,
  lookupPatient,
  trackVisit,
} from './services/api';

const VISIT_REASONS = [
  'Fever',
  'Cold',
  'Diabetes Review',
  'BP Checkup',
  'General Consultation',
  'Lab Report Review',
  'Vaccination',
  'Emergency',
  'Follow-Up',
  'Prescription Renewal',
];

const emptyForm = {
  patientId: '',
  patientName: '',
  phone: '',
  email: '',
  age: '',
  gender: '',
  visitReason: 'Fever',
};

function getTrackTokenFromPath() {
  if (!window.location.pathname.startsWith('/track/')) return '';
  return decodeURIComponent(window.location.pathname.split('/track/')[1] || '');
}

function formatDate(value) {
  if (!value) return '--';
  return new Intl.DateTimeFormat('en', {
    day: '2-digit',
    month: 'short',
  }).format(new Date(value));
}

function formatToken(visit) {
  if (!visit) return '--';
  return visit.displayToken || visit.tokenNumber;
}

function App() {
  const pathToken = getTrackTokenFromPath();
  const startWithCancel = new URLSearchParams(window.location.search).get('cancel') === '1';
  const [screen, setScreen] = useState(pathToken ? 'waiting' : 'reception');
  const [queue, setQueue] = useState({ waiting: [], visits: [], waitingCount: 0, activeToken: null, completedToday: 0, reasonStats: [], averageWait: 0 });
  const [form, setForm] = useState(emptyForm);
  const [patientLookup, setPatientLookup] = useState(null);
  const [lookupStatus, setLookupStatus] = useState('Enter phone to search patient history');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [connection, setConnection] = useState('Connecting');
  const [trackForm, setTrackForm] = useState({ phone: '', token: pathToken });
  const [tracking, setTracking] = useState(null);
  const [trackingMessage, setTrackingMessage] = useState('');
  const [cancelMessage, setCancelMessage] = useState(startWithCancel ? 'Review your token details, then confirm cancellation.' : '');
  const [lastGeneratedVisit, setLastGeneratedVisit] = useState(null);
  const trackFormRef = useRef(trackForm);

  const waiting = queue.waiting || [];
  const active = queue.activeToken;
  const mostUsed = useMemo(
    () => [...(queue.reasonStats || [])].sort((a, b) => b.totalVisits - a.totalVisits).slice(0, 3),
    [queue.reasonStats],
  );

  useEffect(() => {
    trackFormRef.current = trackForm;
  }, [trackForm]);

  useEffect(() => {
    refreshQueue();

    const socket = createSocket();
    socket.on('connect', () => setConnection('Live sync connected'));
    socket.on('disconnect', () => setConnection('Live sync disconnected'));
    socket.on('queue:update', (snapshot) => {
      setQueue(snapshot);
      const currentTrackForm = trackFormRef.current;
      const shouldRefreshTracking = currentTrackForm.phone || currentTrackForm.token;
      if (shouldRefreshTracking) {
        refreshTracking(currentTrackForm);
      }
    });

    return () => socket.disconnect();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      refreshQueue();
      const currentTrackForm = trackFormRef.current;
      if (currentTrackForm.phone || currentTrackForm.token) {
        refreshTracking(currentTrackForm);
      }
    }, 60000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (pathToken) {
      refreshTracking({ phone: '', token: pathToken });
    }
  }, [pathToken]);

  async function refreshQueue() {
    try {
      const snapshot = await fetchQueue();
      setQueue(snapshot);
      setConnection('Queue service online');
    } catch {
      setConnection('Start Express API to sync live queue');
    }
  }

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handlePhoneBlur() {
    const phone = form.phone.replace(/\D/g, '');
    if (phone.length < 10) return;
    await lookupContact(phone);
  }

  async function handleEmailBlur() {
    if (!form.email.includes('@')) return;
    await lookupContact(form.email);
  }

  async function lookupContact(contact) {
    if (form.patientId) return;

    try {
      const result = await lookupPatient(contact);
      setPatientLookup(result);
      if (result.patients.length === 1) {
        selectPatient(result.patients[0], result);
        setLookupStatus('Existing patient found');
      } else {
        setLookupStatus(`${result.patients.length} matching patient profiles found`);
      }
    } catch {
      setPatientLookup(null);
      setLookupStatus('New patient: enter patient details');
    }
  }

  function selectPatient(patient, lookup = patientLookup) {
    setForm((current) => ({
      ...current,
      patientId: patient._id,
      patientName: patient.patientName,
      phone: patient.phone || current.phone,
      email: patient.email || current.email,
      age: patient.age || '',
      gender: patient.gender || '',
    }));
    setPatientLookup(lookup);
    setLookupStatus(`Selected ${patient.patientName}`);
  }

  function startNewPatientProfile() {
    setForm((current) => ({
      ...emptyForm,
      phone: current.phone,
      email: current.email,
      visitReason: current.visitReason,
    }));
    setLookupStatus('Creating a new patient profile for this contact');
  }

  async function handleGenerateToken(event) {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      const visit = await createVisit(form);
      setLastGeneratedVisit(visit);
      setForm({ ...emptyForm, phone: '' });
      setPatientLookup(null);
      setLookupStatus('Token generated and email sent.');
      await refreshQueue();
    } catch (error) {
      setLookupStatus(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCallNext() {
    await callNextVisit();
    await refreshQueue();
  }

  async function handleComplete() {
    if (!active) return;
    await completeVisit(active._id);
    await refreshQueue();
  }

  async function handleTrack(event) {
    event.preventDefault();
    await refreshTracking(trackForm);
  }

  async function refreshTracking(query) {
    setTrackingMessage('');
    try {
      const result = await trackVisit(query);
      setTracking(result);
    } catch (error) {
      setTracking(null);
      setTrackingMessage(error.message);
    }
  }

  async function handleCancelTrackedVisit() {
    if (!tracking?.visit?._id) return;

    try {
      const result = await cancelVisit(tracking.visit._id);
      setCancelMessage(result.message);
      setTracking(null);
      await refreshQueue();
    } catch (error) {
      setCancelMessage(error.message);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">QueueCure</p>
          <h1>{screen === 'reception' ? 'Receptionist Dashboard' : 'Patient Waiting Room'}</h1>
        </div>
        <div className="top-actions">
          <button type="button" className={screen === 'reception' ? 'tab active' : 'tab'} onClick={() => setScreen('reception')}>
            Reception
          </button>
          <button type="button" className={screen === 'waiting' ? 'tab active' : 'tab'} onClick={() => setScreen('waiting')}>
            Waiting Room
          </button>
          <span className="connection">{connection}</span>
        </div>
      </header>

      <section className="summary-grid" aria-label="Queue summary">
        <div className="metric">
          <span>Now serving</span>
          <strong>{active ? `#${formatToken(active)}` : '--'}</strong>
        </div>
        <div className="metric">
          <span>Waiting</span>
          <strong>{queue.waitingCount}</strong>
        </div>
        <div className="metric">
          <span>Average wait</span>
          <strong>{queue.averageWait || 0}m</strong>
        </div>
        <div className="metric">
          <span>Today's patients</span>
          <strong>{queue.completedToday + queue.waitingCount + (active ? 1 : 0)}</strong>
        </div>
      </section>

      {screen === 'reception' ? (
        <ReceptionScreen
          active={active}
          form={form}
          handleCallNext={handleCallNext}
          handleComplete={handleComplete}
          handleGenerateToken={handleGenerateToken}
          handlePhoneBlur={handlePhoneBlur}
          handleEmailBlur={handleEmailBlur}
          isSubmitting={isSubmitting}
          lastGeneratedVisit={lastGeneratedVisit}
          lookupStatus={lookupStatus}
          mostUsed={mostUsed}
          patientLookup={patientLookup}
          selectPatient={selectPatient}
          startNewPatientProfile={startNewPatientProfile}
          updateForm={updateForm}
          waiting={waiting}
        />
      ) : (
        <WaitingRoomScreen
          active={active}
          handleTrack={handleTrack}
          setTrackForm={setTrackForm}
          trackForm={trackForm}
          tracking={tracking}
          trackingMessage={trackingMessage}
          cancelMessage={cancelMessage}
          handleCancelTrackedVisit={handleCancelTrackedVisit}
          waiting={waiting}
        />
      )}
    </main>
  );
}

function ReceptionScreen({
  active,
  form,
  handleCallNext,
  handleComplete,
  handleGenerateToken,
  handleEmailBlur,
  handlePhoneBlur,
  isSubmitting,
  lastGeneratedVisit,
  lookupStatus,
  mostUsed,
  patientLookup,
  selectPatient,
  startNewPatientProfile,
  updateForm,
  waiting,
}) {
  return (
    <section className="workspace">
      <div className="panel intake-panel">
        <div className="panel-heading">
          <h2>Quick Registration</h2>
          <span>Email and tracking link are sent automatically</span>
        </div>

        <form className="intake-form" onSubmit={handleGenerateToken}>
          <div className="form-grid primary">
            <label>
              Patient Name *
              <input value={form.patientName} onChange={(event) => updateForm('patientName', event.target.value)} placeholder="Rahul Kumar" />
            </label>
            <label>
              Phone Number *
              <input value={form.phone} onBlur={handlePhoneBlur} onChange={(event) => updateForm('phone', event.target.value)} placeholder="9876543210" />
            </label>
            <label>
              Email Address *
              <input value={form.email} onBlur={handleEmailBlur} onChange={(event) => updateForm('email', event.target.value)} placeholder="rahul@gmail.com" />
            </label>
          </div>

          <div className="lookup-card">
            <strong>{lookupStatus}</strong>
            {patientLookup?.patients?.length ? (
              <div className="patient-match-list">
                {patientLookup.patients.map((patient) => (
                  <button type="button" className="patient-match" onClick={() => selectPatient(patient)} key={patient._id}>
                    <strong>{patient.patientName}</strong>
                    <span>{patient.age || '--'} years - {patient.gender || '--'} - {patient.previousVisits || 0} visits</span>
                    <span>{patient.phone} - {patient.email}</span>
                  </button>
                ))}
                <button type="button" className="mini-chip" onClick={startNewPatientProfile}>
                  Add different family member
                </button>
              </div>
            ) : null}
          </div>

          <div className="form-grid secondary-fields">
            <label>
              Age
              <input value={form.age} onChange={(event) => updateForm('age', event.target.value)} placeholder="42" />
            </label>
            <label>
              Gender
              <select value={form.gender} onChange={(event) => updateForm('gender', event.target.value)}>
                <option value="">Select</option>
                <option>Male</option>
                <option>Female</option>
                <option>Other</option>
              </select>
            </label>
          </div>

          <div className="reason-section">
            <div className="panel-heading compact">
              <h2>Visit Reason *</h2>
              <span>One-click classification</span>
            </div>
            <div className="chip-grid">
              {VISIT_REASONS.map((reason) => (
                <button
                  type="button"
                  className={form.visitReason === reason ? 'chip selected' : 'chip'}
                  onClick={() => updateForm('visitReason', reason)}
                  key={reason}
                >
                  {reason}
                </button>
              ))}
            </div>
          </div>

          {mostUsed.length ? (
            <div className="quick-reasons">
              <span>Most used today</span>
              {mostUsed.map((item) => (
                <button type="button" className="mini-chip" onClick={() => updateForm('visitReason', item.visitReason)} key={item.visitReason}>
                  {item.visitReason}
                </button>
              ))}
            </div>
          ) : null}

          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Generating' : 'Generate Token'}
          </button>
        </form>

        {lastGeneratedVisit ? (
          <div className="token-generated">
            <strong>Token Generated: {formatToken(lastGeneratedVisit)}</strong>
            <a href={lastGeneratedVisit.trackingUrl} target="_blank" rel="noreferrer">
              {lastGeneratedVisit.trackingUrl}
            </a>
          </div>
        ) : null}
      </div>

      <div className="panel queue-panel">
        <div className="panel-heading">
          <h2>Live Queue</h2>
          <span>Socket.IO keeps every screen in sync</span>
        </div>

        <div className="active-token">
          <span>Current patient</span>
          <strong>{active ? `#${formatToken(active)} ${active.patient?.patientName}` : 'No patient called'}</strong>
          <p>{active ? active.visitReason : 'Call next patient when the doctor is ready.'}</p>
          <div className="action-row">
            <button type="button" onClick={handleCallNext} disabled={!waiting.length}>
              Call Next
            </button>
            <button type="button" className="secondary" onClick={handleComplete} disabled={!active}>
              Complete
            </button>
          </div>
        </div>

        <VisitList visits={waiting} />
      </div>

      <div className="panel history-panel">
        <div className="panel-heading">
          <h2>Patient History</h2>
          <span>Auto-filled by phone lookup</span>
        </div>
        {patientLookup?.history?.length ? (
          <div className="history-list">
            {patientLookup.history.map((visit) => (
              <article className="history-item" key={visit._id}>
                <strong>{formatDate(visit.createdAt)}</strong>
                <span>{visit.visitReason}</span>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state small">No history selected</div>
        )}
      </div>
    </section>
  );
}

function WaitingRoomScreen({
  active,
  cancelMessage,
  handleCancelTrackedVisit,
  handleTrack,
  setTrackForm,
  trackForm,
  tracking,
  trackingMessage,
  waiting,
}) {
  return (
    <section className="patient-view">
      <div className="panel track-panel">
        <div className="panel-heading">
          <h2>Track Your Token</h2>
          <span>Use phone number or token number</span>
        </div>
        <form className="track-form" onSubmit={handleTrack}>
          <input value={trackForm.phone} onChange={(event) => setTrackForm((current) => ({ ...current, phone: event.target.value }))} placeholder="Phone number" />
          <input value={trackForm.token} onChange={(event) => setTrackForm((current) => ({ ...current, token: event.target.value }))} placeholder="Token number" />
          <button type="submit">Track</button>
        </form>
        {trackingMessage ? <p className="status-message">{trackingMessage}</p> : null}
        {cancelMessage ? <p className="status-message">{cancelMessage}</p> : null}
      </div>

      <div className="patient-status-grid">
        <div className="metric large">
          <span>Now serving</span>
          <strong>{tracking?.nowServing ? `#${formatToken(tracking.nowServing)}` : active ? `#${formatToken(active)}` : '--'}</strong>
        </div>
        <div className="metric large">
          <span>Your token</span>
          <strong>{tracking?.visit ? `#${formatToken(tracking.visit)}` : '--'}</strong>
        </div>
        <div className="metric large">
          <span>Patients ahead</span>
          <strong>{tracking?.patientsAhead ?? '--'}</strong>
        </div>
        <div className="metric large">
          <span>Estimated wait</span>
          <strong>{tracking ? `${tracking.estimatedWait}m` : '--'}</strong>
        </div>
        <div className="metric large">
          <span>Visit type</span>
          <strong>{tracking?.visit?.visitReason || '--'}</strong>
        </div>
        <div className="metric large">
          <span>Status</span>
          <strong>{tracking?.visit?.status || '--'}</strong>
        </div>
      </div>

      {tracking?.visit?.status === 'waiting' ? (
        <div className="panel cancel-panel">
          <div className="panel-heading">
            <h2>Cancel Token</h2>
            <span>Waiting patients behind you receive updated estimates</span>
          </div>
          <button type="button" className="danger" onClick={handleCancelTrackedVisit}>
            Cancel My Token
          </button>
        </div>
      ) : null}

      <div className="panel">
        <div className="panel-heading">
          <h2>Queue Preview</h2>
          <span>Prediction sums visit types ahead of you</span>
        </div>
        <VisitList visits={waiting.slice(0, 6)} />
      </div>
    </section>
  );
}

function VisitList({ visits }) {
  if (!visits.length) {
    return <div className="empty-state">No patients waiting</div>;
  }

  return (
    <div className="queue-list">
      {visits.map((visit) => (
        <article className={visit.priority > 0 ? 'queue-item priority' : 'queue-item'} key={visit._id}>
          <div className="token">#{formatToken(visit)}</div>
          <div>
            <strong>{visit.patient?.patientName || 'Patient'}</strong>
            <span>{visit.visitReason} - {visit.estimatedMinutes} min consult</span>
          </div>
          <small>{visit.estimatedWait}m wait</small>
        </article>
      ))}
    </div>
  );
}

export default App;
