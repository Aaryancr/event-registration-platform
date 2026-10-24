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
} from 'lucide-react';
import { Event, SeatHold, WaitlistEntry } from '../types';
import { useAuth } from '../context/AuthContext';
import { useEventWebSocket } from '../hooks/useEventWebSocket';
import { api } from '../api/client';

interface EventDetailModalProps {
  event: Event | null;
  isOpen: boolean;
  onClose: () => void;
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void;
  onOpenAuth: () => void;
}

export const EventDetailModal: React.FC<EventDetailModalProps> = ({
  event,
  isOpen,
  onClose,
  onNotify,
  onOpenAuth,
}) => {
  const { isAuthenticated } = useAuth();

  const [activeHold, setActiveHold] = useState<SeatHold | null>(null);
  const [waitlistEntry, setWaitlistEntry] = useState<WaitlistEntry | null>(null);
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

  // Fetch attendee's active hold or waitlist status for this event
  const checkAttendeeState = useCallback(async () => {
    if (!event || !isAuthenticated) return;
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
      onNotify('success', 'Successfully registered! Ticket generated in My Tickets.');
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
      onNotify('success', '10-minute temporary seat hold secured! Complete mock payment to confirm.');
      refreshLiveSeats();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Hold creation failed';
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
      const msg = err instanceof Error ? err.message : 'Payment failed';
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
      onNotify('info', 'Seat hold cancelled and capacity released.');
      refreshLiveSeats();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to cancel hold';
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
      onNotify('success', `Joined waitlist! Current queue position: #${entry.queue_position ?? 1}`);
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
  const formattedStart = `${startDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} at ${startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        className="glass-panel"
        style={{
          width: '100%',
          maxWidth: '650px',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '32px',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
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

        {/* Title & Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              padding: '3px 10px',
              borderRadius: '20px',
              background: event.status === 'published' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
              color: event.status === 'published' ? '#10b981' : '#f59e0b',
            }}
          >
            {event.status}
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            <span className={`status-dot ${wsConnected ? 'healthy' : 'pending'}`} />
            <span>{wsConnected ? 'WebSocket Live Feed' : 'Connecting to Live Feed...'}</span>
          </div>
        </div>

        <h2 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '14px', lineHeight: 1.25 }}>
          {event.title}
        </h2>

        {/* Description */}
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.6, marginBottom: '24px' }}>
          {event.description || 'No detailed description provided for this event.'}
        </p>

        {/* Live Seat Capacity Bar */}
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '24px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Radio size={14} className={wsConnected ? 'pulse' : ''} color={wsConnected ? '#10b981' : '#f59e0b'} />
              Real-time Seat Allocation
            </span>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: isSoldOut ? '#ef4444' : '#38bdf8' }}>
              {isSoldOut ? 'Capacity Exhausted (0 Available)' : `${available} of ${capacity} seats remaining`}
            </span>
          </div>

          {/* Progress Bar */}
          <div
            style={{
              width: '100%',
              height: '8px',
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              borderRadius: '4px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${occupancyPercent}%`,
                height: '100%',
                background: isSoldOut ? '#ef4444' : occupancyPercent > 80 ? '#f59e0b' : 'linear-gradient(90deg, #6366f1, #06b6d4)',
                transition: 'width 0.4s ease',
              }}
            />
          </div>
        </div>

        {/* Event Schedule & Location */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '28px' }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
            <Calendar size={18} color="#38bdf8" style={{ marginTop: '2px' }} />
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Date & Time</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{formattedStart}</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
            <MapPin size={18} color="#818cf8" style={{ marginTop: '2px' }} />
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Location</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{event.location}</div>
            </div>
          </div>
        </div>

        {/* Active Hold Banner if Attendee currently holds a seat */}
        {activeHold && (
          <div
            style={{
              background: 'rgba(99, 102, 241, 0.12)',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '24px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#818cf8', fontWeight: 600, fontSize: '0.9rem' }}>
                <Clock size={16} />
                <span>Temporary Seat Hold Active</span>
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: timeLeftSeconds !== null && timeLeftSeconds < 120 ? '#ef4444' : '#38bdf8' }}>
                {timeLeftSeconds !== null ? `${Math.floor(timeLeftSeconds / 60)}:${String(timeLeftSeconds % 60).padStart(2, '0')}` : '--:--'}
              </div>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>
              This seat is exclusively reserved for you. Confirm with mock payment ($10.00 USD) before expiration to finalize your ticket.
            </p>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                onClick={() => handlePayHold(false)}
                disabled={loadingAction !== null}
                className="btn-primary"
                style={{ padding: '8px 16px', fontSize: '0.85rem' }}
              >
                <CreditCard size={15} />
                <span>{loadingAction === 'pay' ? 'Processing...' : 'Pay Mock $10.00'}</span>
              </button>
              <button
                onClick={() => handlePayHold(true)}
                disabled={loadingAction !== null}
                style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#ef4444',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                }}
              >
                <span>Simulate Payment Failure</span>
              </button>
              <button
                onClick={handleCancelHold}
                disabled={loadingAction !== null}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-secondary)',
                  borderRadius: '8px',
                  padding: '8px 14px',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                Cancel Hold
              </button>
            </div>
          </div>
        )}

        {/* Waitlist Status Banner */}
        {waitlistEntry && (
          <div
            style={{
              background: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '24px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f59e0b', fontWeight: 600, fontSize: '0.9rem' }}>
                <ListOrdered size={16} />
                <span>You are on the Waitlist</span>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Queue Position: <strong>#{waitlistEntry.queue_position ?? 1}</strong>. You will automatically be promoted if a seat is cancelled.
              </p>
            </div>
            <button
              onClick={handleLeaveWaitlist}
              disabled={loadingAction === 'leave-waitlist'}
              style={{
                background: 'transparent',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                color: '#f59e0b',
                borderRadius: '8px',
                padding: '8px 14px',
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              Leave Waitlist
            </button>
          </div>
        )}

        {/* Action Controls for Attendee */}
        {!activeHold && !waitlistEntry && (
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {!isSoldOut ? (
              <>
                <button
                  onClick={handleDirectRegister}
                  disabled={loadingAction !== null}
                  className="btn-primary"
                  style={{ flex: 1, justifyContent: 'center', padding: '12px' }}
                >
                  <CheckCircle2 size={16} />
                  <span>{loadingAction === 'register' ? 'Registering...' : 'Direct Register (Free)'}</span>
                </button>

                <button
                  onClick={handleCreateHold}
                  disabled={loadingAction !== null}
                  style={{
                    flex: 1,
                    background: 'rgba(99, 102, 241, 0.15)',
                    border: '1px solid rgba(99, 102, 241, 0.3)',
                    color: '#818cf8',
                    borderRadius: '8px',
                    padding: '12px',
                    fontWeight: 600,
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                >
                  <Clock size={16} />
                  <span>{loadingAction === 'hold' ? 'Securing Hold...' : 'Reserve 10-Min Hold'}</span>
                </button>
              </>
            ) : (
              <button
                onClick={handleJoinWaitlist}
                disabled={loadingAction !== null}
                className="btn-primary"
                style={{
                  width: '100%',
                  justifyContent: 'center',
                  padding: '12px',
                  background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                }}
              >
                <ListOrdered size={16} />
                <span>{loadingAction === 'waitlist' ? 'Joining Waitlist...' : 'Join Waitlist Queue'}</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
