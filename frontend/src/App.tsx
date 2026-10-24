import React, { useState, useEffect, useCallback } from 'react';
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
import { Search, Calendar, RefreshCw } from 'lucide-react';

const MainApp: React.FC = () => {
  const { isOrganizer } = useAuth();

  const [currentTab, setCurrentTab] = useState<NavTab>('events');
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Events Catalog state
  const [events, setEvents] = useState<Event[]>([]);
  const [loadingEvents, setLoadingEvents] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
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

  // Filter events based on search query
  const filteredEvents = events.filter((ev) =>
    ev.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    ev.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (ev.description && ev.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar
        currentTab={currentTab}
        onTabChange={(tab) => setCurrentTab(tab)}
        onOpenAuth={() => setAuthModalOpen(true)}
      />

      <main style={{ flex: 1, padding: '24px', maxWidth: '1240px', margin: '0 auto', width: '100%' }}>
        {/* TAB 1: BROWSE EVENTS */}
        {currentTab === 'events' && (
          <div>
            {/* Hero / Banner */}
            <div style={{ marginBottom: '36px', textAlign: 'center', padding: '24px 0' }}>
              <h1 style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: '12px', letterSpacing: '-0.03em' }}>
                Discover & Reserve Premier Tech Events
              </h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', maxWidth: '680px', margin: '0 auto 28px' }}>
                High-throughput ticketing with row-level concurrency protection, temporary seat holds, and real-time live availability feeds.
              </p>

              {/* Search Bar */}
              <div
                style={{
                  maxWidth: '560px',
                  margin: '0 auto',
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <Search size={18} style={{ position: 'absolute', left: '16px', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="Search by event title, city, or topic..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input-field"
                  style={{
                    paddingLeft: '44px',
                    paddingRight: '44px',
                    height: '48px',
                    borderRadius: '24px',
                    fontSize: '0.95rem',
                  }}
                />
                <button
                  onClick={loadEvents}
                  disabled={loadingEvents}
                  title="Refresh catalog"
                  style={{
                    position: 'absolute',
                    right: '12px',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '6px',
                  }}
                >
                  <RefreshCw size={16} className={loadingEvents ? 'spin' : ''} />
                </button>
              </div>
            </div>

            {/* Events Grid */}
            {loadingEvents ? (
              <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
                <RefreshCw size={28} className="spin" style={{ margin: '0 auto 16px' }} />
                <div>Fetching live events...</div>
              </div>
            ) : filteredEvents.length === 0 ? (
              <div className="glass-panel" style={{ padding: '64px', textAlign: 'center' }}>
                <Calendar size={48} color="var(--text-muted)" style={{ margin: '0 auto 16px' }} />
                <h3 style={{ fontSize: '1.3rem', marginBottom: '8px' }}>No Events Found</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', maxWidth: '440px', margin: '0 auto' }}>
                  {searchQuery ? `No published events matching "${searchQuery}".` : 'No published events are currently scheduled.'}
                </p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
                {filteredEvents.map((ev) => (
                  <EventCard
                    key={ev.id}
                    event={ev}
                    onSelect={(event) => setSelectedEvent(event)}
                  />
                ))}
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
            <div className="glass-panel" style={{ padding: '48px', textAlign: 'center', maxWidth: '500px', margin: '60px auto' }}>
              <h3 style={{ fontSize: '1.25rem', marginBottom: '8px' }}>Organizer Access Required</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '20px' }}>
                You must be authenticated with an <strong>Organizer</strong> role to view and manage events.
              </p>
              <button onClick={() => setAuthModalOpen(true)} className="btn-primary">
                Sign in with Organizer Account
              </button>
            </div>
          )
        )}

        {/* TAB 5: OBSERVABILITY & OPS */}
        {currentTab === 'observability' && (
          <ObservabilityView />
        )}
      </main>

      {/* Footer */}
      <footer
        style={{
          borderTop: '1px solid var(--border-color)',
          padding: '24px',
          textAlign: 'center',
          color: 'var(--text-muted)',
          fontSize: '0.85rem',
          background: 'rgba(7, 9, 14, 0.95)',
        }}
      >
        <div>EventFlow Platform — Production-Grade Event Registration & Ticketing Engine</div>
        <div style={{ marginTop: '4px', fontSize: '0.8rem' }}>
          PostgreSQL 16 Authoritative Store • FastAPI • WebSockets • Redis 7 • Prometheus Exposition
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
