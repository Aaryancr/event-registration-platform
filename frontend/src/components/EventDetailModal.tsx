import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Calendar,
  MapPin,
  Radio,
  Clock,
  CreditCard,
  CheckCircle2,
  ListOrdered,
  AlertTriangle,
  Sparkles,
  Users,
  Ticket,
} from 'lucide-react';
import { Event, SeatHold, WaitlistEntry, Registration } from '../types';
import { useAuth } from '../context/AuthContext';
import { useEventWebSocket } from '../hooks/useEventWebSocket';
import { api } from '../api/client';

interface EventDetailModalProps {
  event: Event | null;
  isOpen: boolean;
  onClose: () => void;
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void;
  onOpenAuth: () => void;
  onViewTickets?: () => void;
}

export const EventDetailModal: React.FC<EventDetailModalProps> = ({
  event,
  isOpen,
  onClose,
  onNotify,
  onOpenAuth,
  onViewTickets,
}) => {
  const { isAuthenticated } = useAuth();

  const [activeHold, setActiveHold] = useState<SeatHold | null>(null);
  const [waitlistEntry, setWaitlistEntry] = useState<WaitlistEntry | null>(null);
  const [existingRegistration, setExistingRegistration] = useState<Registration | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [timeLeftSeconds, setTimeLeftSeconds] = useState<number | null>(null);

  // Hook up WebSocket for live seat counts
  const {
    connected: wsConnected,
    liveCapacity,
    liveOccupied,
    liveAvailable,
    reconnect: refreshLiveSeats,
  } = useEventWebSocket({
    eventId: event ? event.id : null,
    enabled: isOpen && !!event,
  });

  const capacity = liveCapacity ?? event?.capacity ?? 0;
  const occupied = liveOccupied ?? 0;
  const available = liveAvailable !== null ? liveAvailable : Math.max(0, capacity - occupied);
  const isSoldOut = available <= 0;
  const occupancyPercent = capacity > 0 ? Math.min(100, Math.round((occupied / capacity) * 100)) : 0;

  // Fetch attendee's active hold, waitlist status, or existing registration for this event
  const checkAttendeeState = useCallback(async () => {
    if (!event || !isAuthenticated) return;
    try {
      const regs = await api.registrations.listMine();
      const currentReg = regs.find(
        (r) => r.event_id === event.id && r.status === 'registered'
      );
      setExistingRegistration(currentReg || null);
    } catch {
      setExistingRegistration(null);
    }

    try {
      const holds = await api.holds.listMine();
      const currentHold = holds.find(
        (h) => h.event_id === event.id && h.status === 'held' && new Date(h.expires_at) > new Date()
      );
      setActiveHold(currentHold || null);
    } catch {
      setActiveHold(null);
    }

    try {
      const wl = await api.waitlist.getMine(event.id);
      setWaitlistEntry(wl);
    } catch {
      setWaitlistEntry(null);
    }
  }, [event, isAuthenticated]);

  useEffect(() => {
    if (isOpen && event) {
      checkAttendeeState();
    } else {
      setActiveHold(null);
      setWaitlistEntry(null);
      setExistingRegistration(null);
      setTimeLeftSeconds(null);
    }
  }, [isOpen, event, checkAttendeeState]);

  // Countdown timer for active seat hold
  useEffect(() => {
    if (!activeHold) {
      setTimeLeftSeconds(null);
      return;
    }

    const updateTimer = () => {
      const remainingMs = new Date(activeHold.expires_at).getTime() - Date.now();
      if (remainingMs <= 0) {
        setTimeLeftSeconds(0);
        setActiveHold(null);
      } else {
        setTimeLeftSeconds(Math.floor(remainingMs / 1000));
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [activeHold]);

  // Close on ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !event) return null;

  // Actions
  const handleDirectRegister = async () => {
    if (!isAuthenticated) {
      onOpenAuth();
      return;
    }
    setLoadingAction('register');
    try {
      await api.registrations.register(event.id);
      onNotify('success', 'Registration confirmed! Digital QR ticket generated in My Tickets.');
      refreshLiveSeats();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Registration failed';
      onNotify('error', msg);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleCreateHold = async () => {
    if (!isAuthenticated) {
      onOpenAuth();
      return;
    }
    setLoadingAction('hold');
    try {
      const hold = await api.holds.create(event.id, 10);
      setActiveHold(hold);
      onNotify('success', '10-minute temporary seat hold secured! Finalize with mock payment.');
      refreshLiveSeats();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Hold reservation failed';
      onNotify('error', msg);
    } finally {
      setLoadingAction(null);
    }
  };

  const handlePayHold = async (simulateFail = false) => {
    if (!activeHold) return;
    setLoadingAction(simulateFail ? 'pay-fail' : 'pay');
    try {
      const resp = await api.holds.pay(activeHold.id, 10.0, simulateFail);
      setActiveHold(null);
      onNotify('success', `Payment confirmed! Ticket code: ${resp.ticket_code}`);
      refreshLiveSeats();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Payment simulation failed';
      onNotify('error', msg);
      checkAttendeeState();
    } finally {
      setLoadingAction(null);
    }
  };

  const handleCancelHold = async () => {
    if (!activeHold) return;
    setLoadingAction('cancel-hold');
    try {
      await api.holds.cancel(activeHold.id);
      setActiveHold(null);
      onNotify('info', 'Seat hold cancelled and returned to pool.');
      refreshLiveSeats();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to release hold';
      onNotify('error', msg);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleJoinWaitlist = async () => {
    if (!isAuthenticated) {
      onOpenAuth();
      return;
    }
    setLoadingAction('waitlist');
    try {
      const entry = await api.waitlist.join(event.id);
      setWaitlistEntry(entry);
      onNotify('success', `Added to waitlist! Queue position: #${entry.queue_position ?? 1}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to join waitlist';
      onNotify('error', msg);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleLeaveWaitlist = async () => {
    setLoadingAction('leave-waitlist');
    try {
      await api.waitlist.leave(event.id);
      setWaitlistEntry(null);
      onNotify('info', 'You have left the waitlist for this event.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to leave waitlist';
      onNotify('error', msg);
    } finally {
      setLoadingAction(null);
    }
  };

  const startDate = new Date(event.starts_at);
  const formattedStart = `${startDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} at ${startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{
          width: '100%',
          maxWidth: '680px',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '32px',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          aria-label="Close modal"
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: '6px',
            borderRadius: 'var(--radius-sm)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <X size={20} />
        </button>

        {/* Top Badges & Real-time Indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
          <span className={`badge ${event.status === 'published' ? 'badge-success' : 'badge-warning'}`}>
            {event.status}
          </span>

          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '3px 9px',
              borderRadius: 'var(--radius-pill)',
              background: wsConnected ? 'rgba(16, 185, 129, 0.08)' : 'rgba(245, 158, 11, 0.08)',
              border: `1px solid ${wsConnected ? 'rgba(16, 185, 129, 0.25)' : 'rgba(245, 158, 11, 0.25)'}`,
              fontSize: '0.75rem',
              color: wsConnected ? '#34d399' : '#fbbf24',
            }}
          >
            <Radio size={12} className={wsConnected ? 'pulse' : ''} />
            <span>{wsConnected ? 'Live Seat Sync Connected' : 'Connecting to Live Seat Feed...'}</span>
          </div>
        </div>

        {/* Event Title */}
        <h2 style={{ fontSize: '1.85rem', fontWeight: 800, marginBottom: '14px', lineHeight: 1.25, color: '#f8fafc' }}>
          {event.title}
        </h2>

        {/* Description */}
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.96rem', lineHeight: 1.65, marginBottom: '24px' }}>
          {event.description || 'Join leading practitioners and industry peers for an immersive architectural walkthrough and discussion.'}
        </p>

        {/* Live Seat Allocation Progress Bar */}
        <div
          style={{
            background: 'var(--bg-surface-elevated)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            padding: '18px 20px',
            marginBottom: '24px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Users size={16} color="var(--primary)" />
              <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                Authoritative Capacity Allocation
              </span>
            </div>

            <span
              style={{
                fontSize: '0.88rem',
                fontWeight: 700,
                color: isSoldOut ? '#f43f5e' : occupancyPercent > 85 ? '#f59e0b' : '#38bdf8',
              }}
            >
              {isSoldOut ? 'Capacity Exhausted (0 Seats Available)' : `${available} of ${capacity} seats remaining`}
            </span>
          </div>

          <div className="progress-container" style={{ height: '9px' }}>
            <div
              className={`progress-fill ${isSoldOut ? 'full' : occupancyPercent > 85 ? 'warning' : 'normal'}`}
              style={{ width: `${isSoldOut ? 100 : occupancyPercent}%` }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            <span>Row-level concurrency protected</span>
            <span>{occupancyPercent}% Booked</span>
          </div>
        </div>

        {/* Metadata Details Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '16px',
            marginBottom: '28px',
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '16px',
          }}
        >
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
            <Calendar size={18} color="#38bdf8" style={{ marginTop: '2px', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Date & Schedule
              </div>
              <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#f8fafc', marginTop: '2px' }}>
                {formattedStart}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
            <MapPin size={18} color="#818cf8" style={{ marginTop: '2px', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Venue Location
              </div>
              <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#f8fafc', marginTop: '2px' }}>
                {event.location}
              </div>
            </div>
          </div>
        </div>

        {/* Active Hold Banner if Attendee currently holds a seat */}
        {activeHold && (
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.14), rgba(14, 21, 38, 0.8))',
              border: '1px solid rgba(99, 102, 241, 0.35)',
              borderRadius: 'var(--radius-lg)',
              padding: '20px',
              marginBottom: '24px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#a5b4fc', fontWeight: 700, fontSize: '0.95rem' }}>
                <Clock size={18} />
                <span>Temporary Seat Hold Active</span>
              </div>
              <div
                style={{
                  fontSize: '1.25rem',
                  fontWeight: 800,
                  fontFamily: 'var(--font-mono)',
                  color: timeLeftSeconds !== null && timeLeftSeconds < 120 ? '#f43f5e' : '#38bdf8',
                }}
              >
                {timeLeftSeconds !== null ? `${Math.floor(timeLeftSeconds / 60)}:${String(timeLeftSeconds % 60).padStart(2, '0')}` : '--:--'}
              </div>
            </div>

            <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Your seat is locked and protected against competing requests. Complete mock payment ($10.00 USD) before the timer expires to confirm your admission.
            </p>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                onClick={() => handlePayHold(false)}
                disabled={loadingAction !== null}
                className="btn btn-primary btn-sm"
                style={{ padding: '9px 18px' }}
              >
                <CreditCard size={15} />
                <span>{loadingAction === 'pay' ? 'Simulating Payment...' : 'Pay Mock $10.00'}</span>
              </button>

              <button
                onClick={() => handlePayHold(true)}
                disabled={loadingAction !== null}
                className="btn btn-danger btn-sm"
                title="Test payment failure handling"
              >
                <AlertTriangle size={14} />
                <span>Simulate Payment Failure</span>
              </button>

              <button
                onClick={handleCancelHold}
                disabled={loadingAction !== null}
                className="btn btn-outline btn-sm"
              >
                Release Hold
              </button>
            </div>
          </div>
        )}

        {/* Waitlist Status Banner */}
        {waitlistEntry && (
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(14, 21, 38, 0.8))',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              borderRadius: 'var(--radius-lg)',
              padding: '20px',
              marginBottom: '24px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '14px',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fbbf24', fontWeight: 700, fontSize: '0.95rem' }}>
                <ListOrdered size={18} />
                <span>You are on the Waiting List</span>
              </div>
              <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Current Priority: <strong>Queue Position #{waitlistEntry.queue_position ?? 1}</strong>.
                If any confirmed attendee cancels, your seat will be automatically awarded.
              </p>
            </div>

            <button
              onClick={handleLeaveWaitlist}
              disabled={loadingAction === 'leave-waitlist'}
              className="btn btn-warning btn-sm"
            >
              Leave Waitlist
            </button>
          </div>
        )}

        {/* Existing Registration Banner */}
        {existingRegistration && (
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(14, 21, 38, 0.95))',
              border: '1.5px solid var(--status-success-border)',
              borderRadius: 'var(--radius-lg)',
              padding: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '14px',
              marginBottom: '16px',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--status-success)', fontWeight: 700, fontSize: '0.98rem' }}>
                <CheckCircle2 size={19} />
                <span>You are Registered for this Event!</span>
              </div>
              <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Registration Record #{existingRegistration.id}. Your digital QR admission pass is active and confirmed.
              </p>
            </div>
            {onViewTickets && (
              <button
                onClick={onViewTickets}
                className="btn btn-primary btn-sm"
                style={{ padding: '9px 18px' }}
              >
                <Ticket size={16} />
                <span>View My Digital Ticket</span>
              </button>
            )}
          </div>
        )}

        {/* Action Controls for Attendee */}
        {!activeHold && !waitlistEntry && !existingRegistration && (
          <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginTop: '8px' }}>
            {!isSoldOut ? (
              <>
                <button
                  onClick={handleDirectRegister}
                  disabled={loadingAction !== null}
                  className="btn btn-primary"
                  style={{ flex: 1, padding: '14px', fontSize: '0.95rem' }}
                >
                  <CheckCircle2 size={18} />
                  <span>{loadingAction === 'register' ? 'Registering...' : 'Direct Register (Free)'}</span>
                </button>

                <button
                  onClick={handleCreateHold}
                  disabled={loadingAction !== null}
                  className="btn btn-secondary"
                  style={{ flex: 1, padding: '14px', fontSize: '0.95rem', border: '1px solid var(--border-highlight)' }}
                >
                  <Clock size={17} color="#818cf8" />
                  <span>{loadingAction === 'hold' ? 'Reserving...' : 'Reserve 10-Min Hold'}</span>
                </button>
              </>
            ) : (
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div
                  style={{
                    background: 'var(--status-danger-bg)',
                    border: '1px solid var(--status-danger-border)',
                    borderRadius: 'var(--radius-md)',
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    color: '#f87171',
                    fontSize: '0.88rem',
                  }}
                >
                  <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                  <span>All seats have been allocated. Join the waitlist to receive priority promotion upon any cancellation.</span>
                </div>

                <button
                  onClick={handleJoinWaitlist}
                  disabled={loadingAction !== null}
                  className="btn btn-primary"
                  style={{
                    width: '100%',
                    padding: '14px',
                    fontSize: '0.95rem',
                    background: 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)',
                    border: '1px solid rgba(245, 158, 11, 0.4)',
                  }}
                >
                  <Sparkles size={17} />
                  <span>{loadingAction === 'waitlist' ? 'Entering Queue...' : 'Join Waitlist Queue'}</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
