import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Send,
  Award,
  CheckCircle2,
  AlertCircle,
  Scan,
  Calendar,
  X,
  Users,
  MapPin,
  Clock,
  Layers,
  Sparkles,
} from 'lucide-react';
import { Event, EventCreatePayload, CheckInResponse } from '../types';
import { api } from '../api/client';

interface OrganizerDashboardProps {
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void;
}

export const OrganizerDashboard: React.FC<OrganizerDashboardProps> = ({ onNotify }) => {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeConsoleTab, setActiveConsoleTab] = useState<'events' | 'checkin'>('events');
  const [eventFilter, setEventFilter] = useState<'all' | 'published' | 'draft'>('all');

  // Create Event Modal
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [creating, setCreating] = useState<boolean>(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [capacity, setCapacity] = useState<number>(100);

  // Check-in state
  const [scanCode, setScanCode] = useState('');
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkInResult, setCheckInResult] = useState<CheckInResponse | null>(null);
  const [checkInError, setCheckInError] = useState<string | null>(null);

  // Issuing certificates state
  const [issuingEventId, setIssuingEventId] = useState<number | null>(null);

  const loadMyEvents = useCallback(async () => {
    setLoading(true);
    try {
      const myEvents = await api.events.listMine();
      setEvents(myEvents);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to retrieve organizer events';
      onNotify('error', msg);
    } finally {
      setLoading(false);
    }
  }, [onNotify]);

  useEffect(() => {
    loadMyEvents();
  }, [loadMyEvents]);

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !location.trim() || !startsAt || !endsAt || capacity <= 0) {
      onNotify('error', 'All fields are required and capacity must be positive');
      return;
    }

    if (new Date(startsAt) >= new Date(endsAt)) {
      onNotify('error', 'Event end time must follow the start time');
      return;
    }

    setCreating(true);
    try {
      const payload: EventCreatePayload = {
        title: title.trim(),
        description: description.trim() || undefined,
        location: location.trim(),
        starts_at: new Date(startsAt).toISOString(),
        ends_at: new Date(endsAt).toISOString(),
        capacity: Number(capacity),
      };

      await api.events.create(payload);
      onNotify('success', 'Event successfully created in draft status!');
      setShowCreateModal(false);
      // Reset form
      setTitle('');
      setDescription('');
      setLocation('');
      setStartsAt('');
      setEndsAt('');
      setCapacity(100);
      loadMyEvents();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create event';
      onNotify('error', msg);
    } finally {
      setCreating(false);
    }
  };

  const handlePublishEvent = async (eventId: number) => {
    if (!window.confirm('Are you sure you want to publish this event? It will immediately become visible to attendees and open for registration.')) {
      return;
    }

    try {
      await api.events.update(eventId, { status: 'published' });
      onNotify('success', 'Event published! It is now live in the public discovery catalog.');
      loadMyEvents();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to publish event';
      onNotify('error', msg);
    }
  };

  const handleIssueCertificates = async (eventId: number) => {
    setIssuingEventId(eventId);
    try {
      const resp = await api.certificates.issue(eventId);
      onNotify('success', `Certificate issuance dispatched! ${resp.count} certificates queued for async generation.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Certificate issuance failed';
      onNotify('error', msg);
    } finally {
      setIssuingEventId(null);
    }
  };

  const handleCheckInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = scanCode.trim();
    if (!cleanCode) return;

    setCheckingIn(true);
    setCheckInResult(null);
    setCheckInError(null);

    try {
      const result = await api.tickets.checkIn(cleanCode);
      setCheckInResult(result);
      onNotify('success', `Attendee ${result.attendee_name} successfully admitted!`);
      setScanCode('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Check-in rejected';
      setCheckInError(msg);
      onNotify('error', msg);
    } finally {
      setCheckingIn(false);
    }
  };

  // Aggregated operational metrics
  const totalCapacity = events.reduce((acc, ev) => acc + ev.capacity, 0);
  const publishedCount = events.filter((e) => e.status === 'published').length;
  const draftCount = events.filter((e) => e.status === 'draft').length;

  return (
    <div style={{ maxWidth: '1140px', margin: '0 auto', width: '100%', padding: '16px 0 32px' }}>
      {/* Console Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span className="badge badge-info" style={{ fontSize: '0.72rem' }}>Organizer Console</span>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Role-Enforced Operations</span>
          </div>
          <h2 style={{ fontSize: '1.85rem', fontWeight: 800, color: '#f8fafc' }}>
            Event Operations & Control
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.94rem' }}>
            Publish events, manage capacity thresholds, validate live admissions, and dispatch credentials.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="btn btn-primary"
          style={{ padding: '11px 22px' }}
        >
          <Plus size={18} />
          <span>Create New Event</span>
        </button>
      </div>

      {/* Operations Metric Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '18px',
          marginBottom: '32px',
        }}
      >
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Managed Events
            </span>
            <div style={{ padding: '8px', borderRadius: 'var(--radius-md)', background: 'rgba(99, 102, 241, 0.12)', color: 'var(--primary)' }}>
              <Layers size={18} />
            </div>
          </div>
          <div style={{ fontSize: '2.1rem', fontWeight: 800, color: '#f8fafc', lineHeight: 1 }}>{events.length}</div>
          <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '8px', display: 'block' }}>
            Total event listings in your portfolio
          </span>
        </div>

        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Platform Capacity
            </span>
            <div style={{ padding: '8px', borderRadius: 'var(--radius-md)', background: 'rgba(16, 185, 129, 0.12)', color: '#34d399' }}>
              <Users size={18} />
            </div>
          </div>
          <div style={{ fontSize: '2.1rem', fontWeight: 800, color: '#34d399', lineHeight: 1 }}>{totalCapacity}</div>
          <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '8px', display: 'block' }}>
            Max seat allocation across all events
          </span>
        </div>

        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Published & Active
            </span>
            <div style={{ padding: '8px', borderRadius: 'var(--radius-md)', background: 'rgba(56, 189, 248, 0.12)', color: '#38bdf8' }}>
              <Calendar size={18} />
            </div>
          </div>
          <div style={{ fontSize: '2.1rem', fontWeight: 800, color: '#38bdf8', lineHeight: 1 }}>{publishedCount}</div>
          <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '8px', display: 'block' }}>
            Open for attendee discovery & booking
          </span>
        </div>

        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Draft Pipeline
            </span>
            <div style={{ padding: '8px', borderRadius: 'var(--radius-md)', background: 'rgba(245, 158, 11, 0.12)', color: '#fbbf24' }}>
              <Clock size={18} />
            </div>
          </div>
          <div style={{ fontSize: '2.1rem', fontWeight: 800, color: '#fbbf24', lineHeight: 1 }}>{draftCount}</div>
          <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '8px', display: 'block' }}>
            Unpublished drafts in preparation
          </span>
        </div>
      </div>

      {/* Sub-nav Console Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '24px',
          borderBottom: '1px solid var(--border-subtle)',
          paddingBottom: '12px',
        }}
      >
        <button
          className={`nav-tab-btn ${activeConsoleTab === 'events' ? 'active' : ''}`}
          onClick={() => setActiveConsoleTab('events')}
          style={{ padding: '10px 18px', fontSize: '0.92rem' }}
        >
          <Calendar size={17} />
          <span>Events Portfolio ({events.length})</span>
        </button>

        <button
          className={`nav-tab-btn ${activeConsoleTab === 'checkin' ? 'active' : ''}`}
          onClick={() => setActiveConsoleTab('checkin')}
          style={{ padding: '10px 18px', fontSize: '0.92rem' }}
        >
          <Scan size={17} />
          <span>Live Entrance Check-in Station</span>
        </button>
      </div>

      {/* CONSOLE TAB 1: EVENTS PORTFOLIO */}
      {activeConsoleTab === 'events' && (
        <div>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {[1, 2].map((i) => (
                <div key={i} className="card skeleton" style={{ height: '140px' }} />
              ))}
            </div>
          ) : events.length === 0 ? (
            <div className="card" style={{ padding: '60px 24px', textAlign: 'center' }}>
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  background: 'rgba(99, 102, 241, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                  color: 'var(--primary)',
                }}
              >
                <Calendar size={28} />
              </div>
              <h3 style={{ fontSize: '1.3rem', marginBottom: '8px' }}>No Events in Your Catalog</h3>
              <p style={{ color: 'var(--text-secondary)', maxWidth: '420px', margin: '0 auto 20px' }}>
                Create your first event listing to establish registration limits and start ticketing.
              </p>
              <button onClick={() => setShowCreateModal(true)} className="btn btn-primary">
                <Plus size={16} />
                <span>Create New Event</span>
              </button>
            </div>
          ) : (
            <div>
              {/* Filter Pills */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => setEventFilter('all')}
                  className={`btn btn-sm ${eventFilter === 'all' ? 'btn-primary' : 'btn-outline'}`}
                  style={{ borderRadius: 'var(--radius-pill)' }}
                >
                  All Events ({events.length})
                </button>
                <button
                  onClick={() => setEventFilter('published')}
                  className={`btn btn-sm ${eventFilter === 'published' ? 'btn-primary' : 'btn-outline'}`}
                  style={{ borderRadius: 'var(--radius-pill)' }}
                >
                  Published ({publishedCount})
                </button>
                <button
                  onClick={() => setEventFilter('draft')}
                  className={`btn btn-sm ${eventFilter === 'draft' ? 'btn-primary' : 'btn-outline'}`}
                  style={{ borderRadius: 'var(--radius-pill)' }}
                >
                  Drafts ({draftCount})
                </button>
              </div>

              {events.filter((e) => eventFilter === 'all' || e.status === eventFilter).length === 0 ? (
                <div className="card" style={{ padding: '40px 24px', textAlign: 'center' }}>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                    No events currently in <strong>{eventFilter}</strong> status.
                  </p>
                  <button
                    onClick={() => setEventFilter('all')}
                    className="btn btn-secondary btn-sm"
                    style={{ marginTop: '12px' }}
                  >
                    Reset Filter
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {events
                    .filter((e) => eventFilter === 'all' || e.status === eventFilter)
                    .map((ev) => (
                      <div
                        key={ev.id}
                        className="card"
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: '16px',
                          padding: '22px 24px',
                        }}
                      >
                        <div style={{ flex: 1, minWidth: '280px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                            <span className={`badge ${ev.status === 'published' ? 'badge-success' : 'badge-warning'}`}>
                              {ev.status}
                            </span>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                              Event #{ev.id} • Created {new Date(ev.created_at).toLocaleDateString()}
                            </span>
                          </div>

                          <h4 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '6px', color: '#f8fafc' }}>
                            {ev.title}
                          </h4>

                          <div style={{ display: 'flex', gap: '16px', fontSize: '0.85rem', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                              <Calendar size={14} color="#38bdf8" />
                              {new Date(ev.starts_at).toLocaleDateString()} at {new Date(ev.starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                              <MapPin size={14} color="#818cf8" />
                              {ev.location}
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                              <Users size={14} color="#34d399" />
                              Capacity: {ev.capacity} seats
                            </span>
                          </div>
                        </div>

                        {/* Actions for this event */}
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                          {ev.status === 'draft' && (
                            <button
                              onClick={() => handlePublishEvent(ev.id)}
                              className="btn btn-primary btn-sm"
                            >
                              <Send size={15} />
                              <span>Publish Event</span>
                            </button>
                          )}

                          {ev.status === 'published' && (
                            <button
                              onClick={() => handleIssueCertificates(ev.id)}
                              disabled={issuingEventId === ev.id}
                              className="btn btn-secondary btn-sm"
                              style={{ border: '1px solid var(--border-highlight)' }}
                            >
                              <Award size={15} color="var(--primary)" />
                              <span>{issuingEventId === ev.id ? 'Dispatching...' : 'Issue Certificates'}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* CONSOLE TAB 2: LIVE ENTRANCE SCANNER */}
      {activeConsoleTab === 'checkin' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
          {/* Scanner Card */}
          <div
            className="card"
            style={{
              background: 'linear-gradient(135deg, rgba(14, 21, 38, 0.95), rgba(21, 31, 54, 0.9))',
              border: '1px solid var(--border-highlight)',
              padding: '28px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <div style={{ padding: '8px', borderRadius: 'var(--radius-md)', background: 'rgba(6, 182, 212, 0.15)', color: '#06b6d4' }}>
                <Scan size={22} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f8fafc' }}>
                  Live Entrance Scanner Station
                </h3>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Single-Use Token Validation Engine
                </span>
              </div>
            </div>

            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', margin: '14px 0 20px', lineHeight: 1.55 }}>
              Scan barcodes with hardware scanners or manually input the attendee's 32-character ticket code to verify cryptographic authenticity and record check-in.
            </p>

            <form onSubmit={handleCheckInSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label className="input-label">Ticket Code or Scanner Input</label>
                <input
                  type="text"
                  placeholder="Paste or scan 32-char ticket code..."
                  value={scanCode}
                  onChange={(e) => setScanCode(e.target.value)}
                  className="input-field"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem' }}
                  required
                  autoFocus
                />
              </div>

              <button
                type="submit"
                disabled={checkingIn}
                className="btn btn-primary"
                style={{ width: '100%', padding: '13px' }}
              >
                {checkingIn ? 'Verifying Admission...' : 'Validate & Admit Attendee'}
              </button>
            </form>

            {/* Instant Admission Confirmation */}
            {checkInResult && (
              <div
                style={{
                  marginTop: '20px',
                  padding: '18px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--status-success-bg)',
                  border: '1.5px solid var(--status-success-border)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--status-success)', fontWeight: 800, marginBottom: '8px' }}>
                  <CheckCircle2 size={20} />
                  <span>Valid Admission Confirmed!</span>
                </div>
                <div style={{ fontSize: '0.88rem', color: 'var(--text-primary)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div><strong>Attendee:</strong> {checkInResult.attendee_name}</div>
                  <div><strong>Event:</strong> {checkInResult.event_title}</div>
                  <div><strong>Admitted At:</strong> {new Date(checkInResult.checked_in_at).toLocaleTimeString()}</div>
                </div>
              </div>
            )}

            {/* Instant Rejection Banner */}
            {checkInError && (
              <div
                style={{
                  marginTop: '20px',
                  padding: '18px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--status-danger-bg)',
                  border: '1.5px solid var(--status-danger-border)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--status-danger)', fontWeight: 800, marginBottom: '6px' }}>
                  <AlertCircle size={20} />
                  <span>Admission Rejected</span>
                </div>
                <div style={{ fontSize: '0.88rem', color: '#fca5a5' }}>
                  {checkInError}
                </div>
              </div>
            )}
          </div>

          {/* Check-in Security Notes */}
          <div className="card" style={{ padding: '28px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                <Sparkles size={18} color="var(--primary)" />
                <h4 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc' }}>
                  Entrance Enforcement Standards
                </h4>
              </div>

              <ul style={{ color: 'var(--text-secondary)', fontSize: '0.86rem', lineHeight: 1.7, paddingLeft: '18px' }}>
                <li>
                  <strong>Single-Use Enforced:</strong> Each ticket can only be checked in once. Duplicate scans are rejected with <code>409 Conflict</code>.
                </li>
                <li>
                  <strong>Counterfeit Protection:</strong> 32-character high-entropy tokens backed by cryptographic SHA-256 signatures prevent forged credentials.
                </li>
                <li>
                  <strong>Sub-second Latency:</strong> Immediate database lock validation ensures entrance lines keep moving with minimal delay.
                </li>
              </ul>
            </div>

            <div
              style={{
                marginTop: '20px',
                padding: '14px',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid var(--border-subtle)',
                fontSize: '0.8rem',
                color: 'var(--text-muted)',
              }}
            >
              Tip: Keep this screen open on tablets or entrance laptops for continuous barcode scanning.
            </div>
          </div>
        </div>
      )}

      {/* CREATE EVENT MODAL */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div
            className="modal-content"
            style={{
              width: '100%',
              maxWidth: '600px',
              padding: '32px',
              position: 'relative',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowCreateModal(false)}
              aria-label="Close modal"
              style={{
                position: 'absolute',
                top: '20px',
                right: '20px',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              <X size={20} />
            </button>

            <span className="badge badge-primary" style={{ marginBottom: '10px' }}>
              Organizer Creation Wizard
            </span>
            <h3 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '6px', color: '#f8fafc' }}>
              Create New Event
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: '22px' }}>
              Events are initially saved as <strong>Draft</strong> and can be previewed or modified before publishing.
            </p>

            <form onSubmit={handleCreateEvent} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="input-label">Event Title *</label>
                <input
                  type="text"
                  placeholder="e.g. Distributed Systems & Concurrency Summit 2026"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="input-field"
                  required
                />
              </div>

              <div>
                <label className="input-label">Event Description</label>
                <textarea
                  placeholder="Outline topics, agenda, keynote speakers, and attendee prerequisites..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="input-field"
                  rows={3}
                  style={{ resize: 'vertical' }}
                />
              </div>

              <div>
                <label className="input-label">Venue Location *</label>
                <input
                  type="text"
                  placeholder="e.g. Moscone Center, San Francisco, CA or Online Livestream"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="input-field"
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                <div>
                  <label className="input-label">Start Date & Time *</label>
                  <input
                    type="datetime-local"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                    className="input-field"
                    required
                  />
                </div>

                <div>
                  <label className="input-label">End Date & Time *</label>
                  <input
                    type="datetime-local"
                    value={endsAt}
                    onChange={(e) => setEndsAt(e.target.value)}
                    className="input-field"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="input-label">Total Seat Capacity *</label>
                <input
                  type="number"
                  min="1"
                  max="50000"
                  value={capacity}
                  onChange={(e) => setCapacity(Number(e.target.value))}
                  className="input-field"
                  required
                />
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                  Authoritative limit strictly enforced via PostgreSQL row-level locks
                </span>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button
                  type="submit"
                  disabled={creating}
                  className="btn btn-primary"
                  style={{ flex: 1, padding: '13px' }}
                >
                  {creating ? 'Saving Event...' : 'Create Draft Event'}
                </button>

                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="btn btn-outline"
                  style={{ padding: '13px 20px' }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
