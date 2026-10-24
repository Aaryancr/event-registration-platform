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
} from 'lucide-react';
import { Event, EventCreatePayload, CheckInResponse } from '../types';
import { api } from '../api/client';

interface OrganizerDashboardProps {
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void;
}

export const OrganizerDashboard: React.FC<OrganizerDashboardProps> = ({ onNotify }) => {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

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
      const msg = err instanceof Error ? err.message : 'Failed to load organizer events';
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
    if (!title || !location || !startsAt || !endsAt || capacity <= 0) {
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
        title,
        description: description || undefined,
        location,
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
    try {
      await api.events.update(eventId, { status: 'published' });
      onNotify('success', 'Event published and visible to all attendees!');
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
    if (!scanCode.trim()) return;

    setCheckingIn(true);
    setCheckInResult(null);
    setCheckInError(null);

    try {
      const result = await api.tickets.checkIn(scanCode.trim());
      setCheckInResult(result);
      onNotify('success', `Attendee ${result.attendee_name} successfully checked in!`);
      setScanCode('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Check-in rejected';
      setCheckInError(msg);
      onNotify('error', msg);
    } finally {
      setCheckingIn(false);
    }
  };

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', width: '100%', padding: '24px 0' }}>
      {/* Header & Create CTA */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '1.85rem', fontWeight: 800 }}>Organizer Operations Console</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
            Manage event publishing, live entrance check-ins, and asynchronous certificate delivery.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="btn-primary"
          style={{ padding: '10px 20px', fontSize: '0.9rem' }}
        >
          <Plus size={18} />
          <span>Create New Event</span>
        </button>
      </div>

      {/* Grid: Events Management & Live Check-in Scanner */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '28px', marginBottom: '40px' }}>
        {/* CHECK-IN SCANNER WIDGET */}
        <div
          className="glass-panel"
          style={{
            padding: '28px',
            background: 'linear-gradient(135deg, rgba(13, 18, 31, 0.95), rgba(24, 33, 54, 0.85))',
            border: '1px solid var(--border-highlight)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
            <Scan size={22} color="#06b6d4" />
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Live Entrance Check-in</h3>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '20px' }}>
            Verify attendee ownership, enforce single-use check-ins, and prevent counterfeit tickets in real time.
          </p>

          <form onSubmit={handleCheckInSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <input
              type="text"
              placeholder="Enter or scan 32-character ticket code"
              value={scanCode}
              onChange={(e) => setScanCode(e.target.value)}
              className="input-field"
              style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}
              required
            />
            <button
              type="submit"
              disabled={checkingIn}
              className="btn-primary"
              style={{ justifyContent: 'center', padding: '12px' }}
            >
              {checkingIn ? 'Verifying Ticket...' : 'Validate & Check In'}
            </button>
          </form>

          {/* Instant Success Feedback */}
          {checkInResult && (
            <div
              style={{
                marginTop: '16px',
                padding: '16px',
                borderRadius: '8px',
                background: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.4)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981', fontWeight: 700, marginBottom: '4px' }}>
                <CheckCircle2 size={18} />
                <span>Valid Admission Confirmed!</span>
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                <div><strong>Attendee:</strong> {checkInResult.attendee_name}</div>
                <div><strong>Event:</strong> {checkInResult.event_title}</div>
                <div><strong>Time:</strong> {new Date(checkInResult.checked_in_at).toLocaleTimeString()}</div>
              </div>
            </div>
          )}

          {/* Instant Error Feedback */}
          {checkInError && (
            <div
              style={{
                marginTop: '16px',
                padding: '16px',
                borderRadius: '8px',
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ef4444', fontWeight: 700, marginBottom: '4px' }}>
                <AlertCircle size={18} />
                <span>Check-in Rejected</span>
              </div>
              <div style={{ fontSize: '0.85rem', color: '#fca5a5' }}>{checkInError}</div>
            </div>
          )}
        </div>

        {/* ORGANIZER STATS OVERVIEW */}
        <div className="glass-panel" style={{ padding: '28px' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '16px' }}>Operations Summary</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '16px', borderRadius: '10px' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Total Events Managed</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#38bdf8' }}>{events.length}</div>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '16px', borderRadius: '10px' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Total Platform Capacity</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#10b981' }}>
                {events.reduce((acc, ev) => acc + ev.capacity, 0)}
              </div>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '16px', borderRadius: '10px' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Published Events</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#818cf8' }}>
                {events.filter((e) => e.status === 'published').length}
              </div>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '16px', borderRadius: '10px' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Draft Events</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#f59e0b' }}>
                {events.filter((e) => e.status === 'draft').length}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* EVENTS LIST */}
      <div>
        <h3 style={{ fontSize: '1.35rem', fontWeight: 700, marginBottom: '16px' }}>Your Events</h3>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
            Loading your events...
          </div>
        ) : events.length === 0 ? (
          <div className="glass-panel" style={{ padding: '48px', textAlign: 'center' }}>
            <Calendar size={40} color="var(--text-muted)" style={{ margin: '0 auto 16px' }} />
            <h4 style={{ fontSize: '1.2rem', marginBottom: '8px' }}>No Events Created Yet</h4>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '20px' }}>
              Create your first event to start accepting registrations and ticket sales.
            </p>
            <button onClick={() => setShowCreateModal(true)} className="btn-primary">
              <Plus size={16} />
              <span>Create Event</span>
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {events.map((ev) => (
              <div
                key={ev.id}
                className="glass-panel"
                style={{
                  padding: '24px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '16px',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        padding: '3px 8px',
                        borderRadius: '12px',
                        background: ev.status === 'published' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                        color: ev.status === 'published' ? '#10b981' : '#f59e0b',
                      }}
                    >
                      {ev.status}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Capacity: {ev.capacity} seats
                    </span>
                  </div>

                  <h4 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '6px' }}>{ev.title}</h4>
                  <div style={{ display: 'flex', gap: '16px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    <span>{new Date(ev.starts_at).toLocaleDateString()}</span>
                    <span>{ev.location}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {ev.status === 'draft' && (
                    <button
                      onClick={() => handlePublishEvent(ev.id)}
                      className="btn-primary"
                      style={{ padding: '8px 16px', fontSize: '0.85rem' }}
                    >
                      <Send size={15} />
                      <span>Publish Event</span>
                    </button>
                  )}

                  {ev.status === 'published' && (
                    <button
                      onClick={() => handleIssueCertificates(ev.id)}
                      disabled={issuingEventId === ev.id}
                      style={{
                        background: 'rgba(99, 102, 241, 0.15)',
                        border: '1px solid rgba(99, 102, 241, 0.3)',
                        color: '#818cf8',
                        borderRadius: '8px',
                        padding: '8px 16px',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <Award size={15} />
                      <span>{issuingEventId === ev.id ? 'Dispatching...' : 'Issue Certificates'}</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CREATE EVENT MODAL */}
      {showCreateModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '16px',
          }}
          onClick={() => setShowCreateModal(false)}
        >
          <div
            className="glass-panel"
            style={{
              width: '100%',
              maxWidth: '560px',
              padding: '32px',
              position: 'relative',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowCreateModal(false)}
              style={{
                position: 'absolute',
                top: '20px',
                right: '20px',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              <X size={20} />
            </button>

            <h3 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '6px' }}>Create New Event</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: '20px' }}>
              Events are initially created in <strong>Draft</strong> status and can be published when ready.
            </p>

            <form onSubmit={handleCreateEvent} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '6px' }}>
                  Event Title
                </label>
                <input
                  type="text"
                  placeholder="e.g. Distributed Systems Summit 2026"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="input-field"
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '6px' }}>
                  Description
                </label>
                <textarea
                  placeholder="Provide an overview of the agenda, speakers, and topics..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="input-field"
                  rows={3}
                  style={{ resize: 'vertical' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '6px' }}>
                  Location / Venue
                </label>
                <input
                  type="text"
                  placeholder="e.g. Moscone Center, San Francisco or Online Stream"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="input-field"
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '6px' }}>
                    Start Date & Time
                  </label>
                  <input
                    type="datetime-local"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                    className="input-field"
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '6px' }}>
                    End Date & Time
                  </label>
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
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '6px' }}>
                  Total Capacity (Seats)
                </label>
                <input
                  type="number"
                  min="1"
                  max="10000"
                  value={capacity}
                  onChange={(e) => setCapacity(Number(e.target.value))}
                  className="input-field"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={creating}
                className="btn-primary"
                style={{ width: '100%', justifyContent: 'center', padding: '12px', marginTop: '8px' }}
              >
                {creating ? 'Creating Event...' : 'Create Draft Event'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
