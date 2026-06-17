import { useEffect, useMemo, useState } from 'react';
import './App.css';
import { createSocket } from './socket';
import { addPatient, callNextPatient, completePatient, fetchAnalytics, fetchQueue } from './services/api';

function formatTime(value) {
  if (!value) return '--';
  return new Intl.DateTimeFormat('en', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function App() {
  const [patientName, setPatientName] = useState('');
  const [queue, setQueue] = useState({ patients: [], waitingCount: 0, activeToken: null, completedToday: 0 });
  const [analytics, setAnalytics] = useState({ averageConsultationTime: 0, averageWaitTime: 0 });
  const [status, setStatus] = useState('Connecting to queue service');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const waitingPatients = useMemo(
    () => queue.patients.filter((patient) => patient.status === 'waiting'),
    [queue.patients],
  );

  useEffect(() => {
    fetchQueue()
      .then((snapshot) => {
        setQueue(snapshot);
        setStatus('Queue service online');
      })
      .catch(() => setStatus('Start Express API to sync live queue'));

    fetchAnalytics()
      .then(setAnalytics)
      .catch(() => setAnalytics({ averageConsultationTime: 0, averageWaitTime: 0 }));

    const socket = createSocket();
    socket.on('connect', () => setStatus('Live sync connected'));
    socket.on('disconnect', () => setStatus('Live sync disconnected'));
    socket.on('queue:update', setQueue);

    return () => socket.disconnect();
  }, []);

  async function handleAddPatient(event) {
    event.preventDefault();
    if (!patientName.trim()) return;

    setIsSubmitting(true);
    try {
      await addPatient(patientName);
      setPatientName('');
      const nextAnalytics = await fetchAnalytics().catch(() => analytics);
      setAnalytics(nextAnalytics);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCallNext() {
    await callNextPatient();
    const nextAnalytics = await fetchAnalytics().catch(() => analytics);
    setAnalytics(nextAnalytics);
  }

  async function handleCompleteActive() {
    if (!queue.activeToken) return;
    await completePatient(queue.activeToken._id);
    const nextAnalytics = await fetchAnalytics().catch(() => analytics);
    setAnalytics(nextAnalytics);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">QueueCure</p>
          <h1>Reception Queue</h1>
        </div>
        <span className="connection">{status}</span>
      </header>

      <section className="summary-grid" aria-label="Queue summary">
        <div className="metric">
          <span>Now serving</span>
          <strong>{queue.activeToken ? `#${queue.activeToken.tokenNumber}` : '--'}</strong>
        </div>
        <div className="metric">
          <span>Waiting</span>
          <strong>{queue.waitingCount}</strong>
        </div>
        <div className="metric">
          <span>Completed</span>
          <strong>{queue.completedToday}</strong>
        </div>
        <div className="metric">
          <span>Avg wait</span>
          <strong>{analytics.averageWaitTime || 0}m</strong>
        </div>
      </section>

      <section className="workspace">
        <div className="panel intake-panel">
          <div className="panel-heading">
            <h2>Add Patient</h2>
            <span>Token is generated automatically</span>
          </div>

          <form className="intake-form" onSubmit={handleAddPatient}>
            <label htmlFor="patientName">Patient name</label>
            <div className="form-row">
              <input
                id="patientName"
                value={patientName}
                onChange={(event) => setPatientName(event.target.value)}
                placeholder="Enter patient name"
              />
              <button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Adding' : 'Add'}
              </button>
            </div>
          </form>

          <div className="active-token">
            <span>Active consultation</span>
            <strong>{queue.activeToken?.patientName || 'No patient called'}</strong>
            <p>{queue.activeToken ? `Called at ${formatTime(queue.activeToken.calledAt)}` : 'Call the next waiting token to begin.'}</p>
            <div className="action-row">
              <button type="button" onClick={handleCallNext} disabled={!waitingPatients.length}>
                Call Next
              </button>
              <button type="button" className="secondary" onClick={handleCompleteActive} disabled={!queue.activeToken}>
                Complete
              </button>
            </div>
          </div>
        </div>

        <div className="panel queue-panel">
          <div className="panel-heading">
            <h2>Waiting Room</h2>
            <span>{analytics.averageConsultationTime || 0} min average consultation</span>
          </div>

          <div className="queue-list">
            {waitingPatients.length ? (
              waitingPatients.map((patient) => (
                <article className="queue-item" key={patient._id}>
                  <div className="token">#{patient.tokenNumber}</div>
                  <div>
                    <strong>{patient.patientName}</strong>
                    <span>Registered {formatTime(patient.createdAt)}</span>
                  </div>
                  <small>{patient.status}</small>
                </article>
              ))
            ) : (
              <div className="empty-state">No patients waiting</div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

export default App;
