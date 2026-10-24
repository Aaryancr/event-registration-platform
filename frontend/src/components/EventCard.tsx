import React from 'react';
import { Calendar, MapPin, Users, ArrowRight, Radio } from 'lucide-react';
import { Event } from '../types';

interface EventCardProps {
  event: Event;
  liveAvailable?: number | null;
  onSelect: (event: Event) => void;
}

export const EventCard: React.FC<EventCardProps> = ({ event, liveAvailable, onSelect }) => {
  const startDate = new Date(event.starts_at);
  const formattedDate = startDate.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const formattedTime = startDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  const available = liveAvailable !== undefined && liveAvailable !== null ? liveAvailable : event.capacity;
  const isSoldOut = available <= 0;

  return (
    <div
      className="glass-panel"
      onClick={() => onSelect(event)}
      style={{
        padding: '24px',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div>
        {/* Header Tags */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              padding: '4px 10px',
              borderRadius: '20px',
              background: event.status === 'published' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
              color: event.status === 'published' ? '#10b981' : '#f59e0b',
              border: `1px solid ${event.status === 'published' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
            }}
          >
            {event.status}
          </span>

          {/* Real-time Seat Badge */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '20px',
              background: isSoldOut ? 'rgba(239, 68, 68, 0.15)' : 'rgba(99, 102, 241, 0.15)',
              color: isSoldOut ? '#ef4444' : '#818cf8',
              fontSize: '0.8rem',
              fontWeight: 600,
            }}
          >
            <Radio size={12} className="pulse" />
            <span>
              {isSoldOut ? 'Sold Out (Waitlist Open)' : `${available} / ${event.capacity} seats`}
            </span>
          </div>
        </div>

        {/* Title */}
        <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '10px', lineHeight: 1.3 }}>
          {event.title}
        </h3>

        {/* Description Snippet */}
        {event.description && (
          <p
            style={{
              color: 'var(--text-secondary)',
              fontSize: '0.88rem',
              marginBottom: '16px',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {event.description}
          </p>
        )}
      </div>

      <div>
        {/* Event Meta */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calendar size={15} color="#38bdf8" />
            <span>{formattedDate} at {formattedTime}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <MapPin size={15} color="#818cf8" />
            <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{event.location}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Users size={15} color="#10b981" />
            <span>Capacity: {event.capacity} max attendees</span>
          </div>
        </div>

        {/* CTA Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: '12px',
            borderTop: '1px solid var(--border-color)',
            color: '#38bdf8',
            fontSize: '0.85rem',
            fontWeight: 600,
          }}
        >
          <span>View Details & Register</span>
          <ArrowRight size={16} />
        </div>
      </div>
    </div>
  );
};
