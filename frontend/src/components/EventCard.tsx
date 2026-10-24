import React from 'react';
import { Calendar, MapPin, Users, ArrowRight, Radio, Sparkles } from 'lucide-react';
import { Event } from '../types';

interface EventCardProps {
  event: Event;
  liveAvailable?: number | null;
  onSelect: (event: Event) => void;
}

// Helper to deduce topic category and header theme based on event content
const getEventTheme = (title: string, description?: string | null) => {
  const text = `${title} ${description || ''}`.toLowerCase();

  if (text.includes('cloud') || text.includes('aws') || text.includes('gcp') || text.includes('k8s') || text.includes('docker')) {
    return {
      category: 'Cloud Infrastructure',
      accentColor: '#06b6d4',
      gradient: 'linear-gradient(135deg, rgba(6, 182, 212, 0.16) 0%, rgba(14, 21, 38, 0.8) 100%)',
    };
  }
  if (text.includes('security') || text.includes('crypt') || text.includes('auth') || text.includes('cyber')) {
    return {
      category: 'Security & Auth',
      accentColor: '#10b981',
      gradient: 'linear-gradient(135deg, rgba(16, 185, 129, 0.16) 0%, rgba(14, 21, 38, 0.8) 100%)',
    };
  }
  if (text.includes('concurrency') || text.includes('distributed') || text.includes('scale') || text.includes('systems') || text.includes('database')) {
    return {
      category: 'Distributed Systems',
      accentColor: '#6366f1',
      gradient: 'linear-gradient(135deg, rgba(99, 102, 241, 0.18) 0%, rgba(14, 21, 38, 0.8) 100%)',
    };
  }
  if (text.includes('ai') || text.includes('ml') || text.includes('data') || text.includes('learning')) {
    return {
      category: 'AI & Data Science',
      accentColor: '#8b5cf6',
      gradient: 'linear-gradient(135deg, rgba(139, 92, 246, 0.18) 0%, rgba(14, 21, 38, 0.8) 100%)',
    };
  }
  return {
    category: 'Engineering & Tech',
    accentColor: '#38bdf8',
    gradient: 'linear-gradient(135deg, rgba(56, 189, 248, 0.14) 0%, rgba(14, 21, 38, 0.8) 100%)',
  };
};

export const EventCard: React.FC<EventCardProps> = ({ event, liveAvailable, onSelect }) => {
  const theme = getEventTheme(event.title, event.description);

  const startDate = new Date(event.starts_at);
  const formattedDate = startDate.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const formattedTime = startDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  const available = liveAvailable !== undefined && liveAvailable !== null ? liveAvailable : event.capacity;
  const isSoldOut = available <= 0;
  const occupiedCount = Math.max(0, event.capacity - available);
  const fillPercent = Math.min(100, Math.round((occupiedCount / event.capacity) * 100));

  return (
    <div
      className="card-interactive"
      onClick={() => onSelect(event)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        overflow: 'hidden',
        position: 'relative',
        padding: '0',
      }}
    >
      {/* Decorative Curated Header Banner */}
      <div
        style={{
          background: theme.gradient,
          borderBottom: '1px solid var(--border-subtle)',
          padding: '18px 20px 14px',
          position: 'relative',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {/* Topic Badge */}
          <span
            style={{
              fontSize: '0.72rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              padding: '3px 9px',
              borderRadius: 'var(--radius-pill)',
              background: 'rgba(7, 10, 18, 0.65)',
              color: theme.accentColor,
              border: `1px solid ${theme.accentColor}40`,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Sparkles size={11} />
            {theme.category}
          </span>

          {/* Status Pill */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              className={`badge ${event.status === 'published' ? 'badge-success' : 'badge-warning'}`}
              style={{ fontSize: '0.68rem', padding: '2px 8px' }}
            >
              {event.status}
            </span>
          </div>
        </div>

        {/* Start Date Banner */}
        <div
          style={{
            marginTop: '12px',
            display: 'flex',
            alignItems: 'baseline',
            gap: '8px',
            color: 'var(--text-secondary)',
            fontSize: '0.85rem',
          }}
        >
          <Calendar size={14} color={theme.accentColor} />
          <span style={{ fontWeight: 600, color: '#f8fafc' }}>{formattedDate}</span>
          <span style={{ color: 'var(--text-muted)' }}>• {formattedTime}</span>
        </div>
      </div>

      {/* Main Body */}
      <div style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <h3
          style={{
            fontSize: '1.25rem',
            fontWeight: 700,
            marginBottom: '8px',
            lineHeight: 1.35,
            color: '#f8fafc',
          }}
        >
          {event.title}
        </h3>

        <p
          style={{
            color: 'var(--text-secondary)',
            fontSize: '0.88rem',
            lineHeight: 1.55,
            marginBottom: '20px',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            flex: 1,
          }}
        >
          {event.description || 'Join technology leaders and practitioners for an intensive session on engineering architecture.'}
        </p>

        {/* Location & Capacity Info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
            <MapPin size={15} color="var(--text-muted)" style={{ flexShrink: 0 }} />
            <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
              {event.location}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
            <Users size={15} color="var(--text-muted)" style={{ flexShrink: 0 }} />
            <span>Capacity: {event.capacity} seats</span>
          </div>
        </div>

        {/* Live Seat Allocation Meter */}
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.025)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '12px',
            marginBottom: '16px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              <Radio size={12} className={isSoldOut ? '' : 'pulse'} color={isSoldOut ? '#f43f5e' : '#34d399'} />
              <span>Availability</span>
            </div>

            <span
              style={{
                fontSize: '0.78rem',
                fontWeight: 700,
                color: isSoldOut ? '#f43f5e' : fillPercent > 85 ? '#f59e0b' : '#38bdf8',
              }}
            >
              {isSoldOut ? 'Sold Out (Waitlist Available)' : `${available} seats left`}
            </span>
          </div>

          <div className="progress-container">
            <div
              className={`progress-fill ${isSoldOut ? 'full' : fillPercent > 85 ? 'warning' : 'normal'}`}
              style={{ width: `${isSoldOut ? 100 : fillPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Card Action Footer */}
      <div
        style={{
          padding: '12px 20px',
          backgroundColor: 'var(--bg-surface-elevated)',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontSize: '0.84rem', fontWeight: 600, color: theme.accentColor }}>
          {isSoldOut ? 'Join Waiting List' : 'Reserve Tickets'}
        </span>
        <div
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.05)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#f8fafc',
            transition: 'transform var(--transition-fast)',
          }}
        >
          <ArrowRight size={14} />
        </div>
      </div>
    </div>
  );
};
