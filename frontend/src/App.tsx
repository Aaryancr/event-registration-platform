import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar, NavTab } from './components/Navbar';
import { AuthModal } from './components/AuthModal';
import { EventCard } from './components/EventCard';
import { EventDetailModal } from './components/EventDetailModal';
import { AttendeeView } from './components/AttendeeView';
import { OrganizerDashboard } from './components/OrganizerDashboard';
import { ObservabilityView } from './components/ObservabilityView';
import { ToastContainer, ToastMessage } from './components/Toast';
import { Event } from './types';
import { api } from './api/client';
import {
  Search,
  Calendar,
  RefreshCw,
  SlidersHorizontal,
  X,
  ShieldCheck,
  Zap,
  Lock,
} from 'lucide-react';

type FilterStatus = 'all' | 'available' | 'sold_out';
type SortOption = 'date_asc' | 'date_desc' | 'capacity_desc';

const MainApp: React.FC = () => {
  const { isOrganizer } = useAuth();

  const [currentTab, setCurrentTab] = useState<NavTab>('events');
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Events Catalog state
  const [events, setEvents] = useState<Event[]>([]);
  const [loadingEvents, setLoadingEvents] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [sortBy, setSortBy] = useState<SortOption>('date_asc');
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);

  const addToast = useCallback((type: 'success' | 'error' | 'info', message: string) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const loadEvents = useCallback(async () => {
    setLoadingEvents(true);
    try {
      const data = await api.events.list();
      setEvents(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load events';
      addToast('error', msg);
    } finally {
      setLoadingEvents(false);
    }
  }, [addToast]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // Filter and sort events based on search query, filter pill, and sort criteria
  const filteredAndSortedEvents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    const filtered = events.filter((ev) => {
      // Text search matching title, location, or description
      const matchesQuery =
        !query ||
        ev.title.toLowerCase().includes(query) ||
        ev.location.toLowerCase().includes(query) ||
        (ev.description && ev.description.toLowerCase().includes(query));

      if (!matchesQuery) return false;

      // Status filtering
      if (statusFilter === 'available') {
        return ev.capacity > 0;
      }
      if (statusFilter === 'sold_out') {
        return ev.capacity <= 0;
      }

      return true;
    });

    // Sorting
    return filtered.sort((a, b) => {
      if (sortBy === 'date_asc') {
        return new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();
      }
      if (sortBy === 'date_desc') {
        return new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime();
      }
      if (sortBy === 'capacity_desc') {
        return b.capacity - a.capacity;
      }
      return 0;
    });
  }, [events, searchQuery, statusFilter, sortBy]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-base)' }}>
      {/* Top Navbar */}
      <Navbar
        currentTab={currentTab}
        onTabChange={(tab) => setCurrentTab(tab)}
        onOpenAuth={() => setAuthModalOpen(true)}
      />

      <main style={{ flex: 1, padding: '24px 20px', maxWidth: '1240px', margin: '0 auto', width: '100%' }}>
        {/* TAB 1: BROWSE EVENTS */}
        {currentTab === 'events' && (
          <div>
            {/* Hero / Landing Section */}
            <section style={{ marginBottom: '36px', textAlign: 'center', padding: '36px 16px 20px' }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '5px 14px',
                  borderRadius: 'var(--radius-pill)',
                  background: 'rgba(99, 102, 241, 0.12)',
                  border: '1px solid rgba(99, 102, 241, 0.28)',
                  color: '#a5b4fc',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  marginBottom: '18px',
                }}
              >
                <Zap size={14} color="#818cf8" />
                <span>Next-Gen Event Ticketing SaaS</span>
              </div>

              <h1
                style={{
                  fontSize: 'clamp(2rem, 5vw, 3.2rem)',
                  fontWeight: 800,
                  marginBottom: '14px',
                  letterSpacing: '-0.035em',
                  lineHeight: 1.15,
                  color: '#f8fafc',
                }}
              >
                Mission-Critical Ticketing & Registration
              </h1>

              <p
                style={{
                  color: 'var(--text-secondary)',
                  fontSize: 'clamp(1rem, 2vw, 1.15rem)',
                  maxWidth: '720px',
                  margin: '0 auto 28px',
                  lineHeight: 1.6,
                }}
              >
                Row-level PostgreSQL concurrency isolation, 10-minute temporary seat holds, and real-time WebSocket availability feeds for high-demand tech gatherings.
              </p>

              {/* Feature Highlights Pills */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '16px',
                  flexWrap: 'wrap',
                  marginBottom: '32px',
                  fontSize: '0.82rem',
                  color: 'var(--text-secondary)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Lock size={15} color="#10b981" />
                  <span>Zero Overselling Guaranteed</span>
                </div>
                <span>•</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Zap size={15} color="#38bdf8" />
                  <span>Sub-second Live Seat Sync</span>
                </div>
                <span>•</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ShieldCheck size={15} color="#a5b4fc" />
                  <span>Verifiable SHA-256 Credentials</span>
                </div>
              </div>

              {/* Search Bar & Filter Controls */}
              <div
                style={{
                  maxWidth: '780px',
                  margin: '0 auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                }}
              >
                {/* Search Input Box */}
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <Search size={18} style={{ position: 'absolute', left: '18px', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    placeholder="Search by event title, topic, or venue location..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="input-field"
                    style={{
                      paddingLeft: '48px',
                      paddingRight: searchQuery ? '76px' : '48px',
                      height: '52px',
                      borderRadius: 'var(--radius-pill)',
                      fontSize: '0.96rem',
                      background: 'rgba(255, 255, 255, 0.05)',
                      boxShadow: 'var(--shadow-md)',
                    }}
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      aria-label="Clear search"
                      style={{
                        position: 'absolute',
                        right: '44px',
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        padding: '6px',
                      }}
                    >
                      <X size={16} />
                    </button>
                  )}
                  <button
                    onClick={loadEvents}
                    disabled={loadingEvents}
                    title="Refresh catalog"
                    style={{
                      position: 'absolute',
                      right: '14px',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      padding: '8px',
                      borderRadius: '50%',
                    }}
                  >
                    <RefreshCw size={17} className={loadingEvents ? 'spin' : ''} />
                  </button>
                </div>

                {/* Filter and Sort Toolbar */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px',
                    padding: '0 8px',
                  }}
                >
                  {/* Status Filter Buttons */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Filter:</span>
                    <button
                      type="button"
                      onClick={() => setStatusFilter('all')}
                      className={`btn btn-sm ${statusFilter === 'all' ? 'btn-primary' : 'btn-outline'}`}
                      style={{ borderRadius: 'var(--radius-pill)' }}
                    >
                      All Events ({events.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setStatusFilter('available')}
                      className={`btn btn-sm ${statusFilter === 'available' ? 'btn-primary' : 'btn-outline'}`}
                      style={{ borderRadius: 'var(--radius-pill)' }}
                    >
                      Available Now
                    </button>
                    <button
                      type="button"
                      onClick={() => setStatusFilter('sold_out')}
                      className={`btn btn-sm ${statusFilter === 'sold_out' ? 'btn-primary' : 'btn-outline'}`}
                      style={{ borderRadius: 'var(--radius-pill)' }}
                    >
                      Sold Out / Waitlist
                    </button>
                  </div>

                  {/* Sort Selection */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <SlidersHorizontal size={14} color="var(--text-muted)" />
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Sort:</span>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as SortOption)}
                      style={{
                        background: 'var(--bg-surface-elevated)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-md)',
                        padding: '6px 12px',
                        fontSize: '0.82rem',
                        outline: 'none',
                        cursor: 'pointer',
                        fontFamily: 'var(--font-body)',
                      }}
                    >
                      <option value="date_asc">Upcoming Date (Soonest)</option>
                      <option value="date_desc">Latest Date First</option>
                      <option value="capacity_desc">Highest Capacity</option>
                    </select>
                  </div>
                </div>
              </div>
            </section>

            {/* Events Grid */}
            {loadingEvents ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
                {[1, 2, 3].map((i) => (
                  <div key={i} className="card skeleton" style={{ height: '360px', borderRadius: 'var(--radius-lg)' }} />
                ))}
              </div>
            ) : filteredAndSortedEvents.length === 0 ? (
              <div className="card" style={{ padding: '64px 24px', textAlign: 'center', maxWidth: '560px', margin: '20px auto' }}>
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
                <h3 style={{ fontSize: '1.3rem', marginBottom: '8px', color: '#f8fafc' }}>
                  No Events Match Your Filter
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', marginBottom: '20px' }}>
                  {searchQuery
                    ? `No events found matching "${searchQuery}". Try broadening your query or clearing filters.`
                    : 'There are no published events currently scheduled in this category.'}
                </p>
                {(searchQuery || statusFilter !== 'all') && (
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setStatusFilter('all');
                    }}
                    className="btn btn-secondary btn-sm"
                  >
                    Reset Filters
                  </button>
                )}
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <span style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>
                    Displaying <strong>{filteredAndSortedEvents.length}</strong> scheduled events
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '24px' }}>
                  {filteredAndSortedEvents.map((ev) => (
                    <EventCard
                      key={ev.id}
                      event={ev}
                      onSelect={(event) => setSelectedEvent(event)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: ATTENDEE TICKETS */}
        {currentTab === 'tickets' && (
          <AttendeeView initialTab="tickets" onNotify={addToast} />
        )}

        {/* TAB 3: ATTENDEE CERTIFICATES */}
        {currentTab === 'certificates' && (
          <AttendeeView initialTab="certificates" onNotify={addToast} />
        )}

        {/* TAB 4: ORGANIZER CONSOLE */}
        {currentTab === 'organizer' && (
          isOrganizer ? (
            <OrganizerDashboard onNotify={addToast} />
          ) : (
            <div className="card" style={{ padding: '60px 24px', textAlign: 'center', maxWidth: '480px', margin: '60px auto' }}>
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  background: 'rgba(6, 182, 212, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                  color: 'var(--accent-cyan)',
                }}
              >
                <ShieldCheck size={28} />
              </div>
              <h3 style={{ fontSize: '1.3rem', marginBottom: '8px', color: '#f8fafc' }}>
                Organizer Credentials Required
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', marginBottom: '24px' }}>
                The Organizer Console is protected with role-based access control. Sign in with an account having the <strong>organizer</strong> role to manage events.
              </p>
              <button onClick={() => setAuthModalOpen(true)} className="btn btn-primary">
                Sign In with Organizer Account
              </button>
            </div>
          )
        )}

        {/* TAB 5: OBSERVABILITY & OPS */}
        {currentTab === 'observability' && (
          <ObservabilityView />
        )}
      </main>

      {/* Modern SaaS Footer */}
      <footer
        style={{
          borderTop: '1px solid var(--border-subtle)',
          padding: '28px 24px',
          textAlign: 'center',
          color: 'var(--text-muted)',
          fontSize: '0.85rem',
          backgroundColor: 'var(--bg-base)',
          marginTop: 'auto',
        }}
      >
        <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
          EventFlow Platform — High-Throughput Event Registration & Ticketing SaaS
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          PostgreSQL 16 Authoritative Store • FastAPI • WebSockets • Redis 7 • Prometheus Telemetry
        </div>
      </footer>

      {/* Modals & Overlays */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={() => {
          addToast('success', 'Authentication successful!');
          loadEvents();
        }}
      />

      <EventDetailModal
        event={selectedEvent}
        isOpen={selectedEvent !== null}
        onClose={() => setSelectedEvent(null)}
        onNotify={addToast}
        onOpenAuth={() => setAuthModalOpen(true)}
        onViewTickets={() => {
          setSelectedEvent(null);
          setCurrentTab('tickets');
        }}
      />

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
};
