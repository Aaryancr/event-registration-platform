import React from 'react';
import { Layers, Calendar, Ticket, Award, LayoutDashboard, Activity, LogIn, LogOut, User as UserIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export type NavTab = 'events' | 'tickets' | 'certificates' | 'organizer' | 'observability';

interface NavbarProps {
  currentTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  onOpenAuth: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentTab, onTabChange, onOpenAuth }) => {
  const { user, isAuthenticated, isOrganizer, logout } = useAuth();

  return (
    <nav
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 24px',
        borderBottom: '1px solid var(--border-color)',
        background: 'rgba(7, 9, 14, 0.85)',
        backdropFilter: 'blur(16px)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        flexWrap: 'wrap',
        gap: '16px',
      }}
    >
      {/* Brand */}
      <div
        onClick={() => onTabChange('events')}
        style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
      >
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '9px',
            background: 'linear-gradient(135deg, #6366f1, #06b6d4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(99, 102, 241, 0.4)',
          }}
        >
          <Layers size={20} color="#ffffff" />
        </div>
        <span style={{ fontSize: '1.35rem', fontWeight: 800, letterSpacing: '-0.03em' }}>
          EventFlow
        </span>
      </div>

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
        <button
          className={`nav-tab-btn ${currentTab === 'events' ? 'active' : ''}`}
          onClick={() => onTabChange('events')}
        >
          <Calendar size={16} />
          <span>Browse Events</span>
        </button>

        {isAuthenticated && (
          <>
            <button
              className={`nav-tab-btn ${currentTab === 'tickets' ? 'active' : ''}`}
              onClick={() => onTabChange('tickets')}
            >
              <Ticket size={16} />
              <span>My Tickets</span>
            </button>

            <button
              className={`nav-tab-btn ${currentTab === 'certificates' ? 'active' : ''}`}
              onClick={() => onTabChange('certificates')}
            >
              <Award size={16} />
              <span>Certificates</span>
            </button>
          </>
        )}

        {isOrganizer && (
          <button
            className={`nav-tab-btn ${currentTab === 'organizer' ? 'active' : ''}`}
            onClick={() => onTabChange('organizer')}
          >
            <LayoutDashboard size={16} />
            <span>Organizer Console</span>
          </button>
        )}

        <button
          className={`nav-tab-btn ${currentTab === 'observability' ? 'active' : ''}`}
          onClick={() => onTabChange('observability')}
        >
          <Activity size={16} />
          <span>System Ops</span>
        </button>
      </div>

      {/* User Session & Auth Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {isAuthenticated && user ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: 'rgba(99, 102, 241, 0.2)',
                  border: '1px solid rgba(99, 102, 241, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#818cf8',
                }}
              >
                <UserIcon size={16} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {user.display_name}
                </span>
                <span
                  style={{
                    fontSize: '0.7rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: isOrganizer ? '#38bdf8' : '#10b981',
                    fontWeight: 700,
                  }}
                >
                  {user.role}
                </span>
              </div>
            </div>

            <button
              onClick={logout}
              title="Sign Out"
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-secondary)',
                borderRadius: '8px',
                padding: '8px 12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.8rem',
                transition: 'all 0.2s',
              }}
            >
              <LogOut size={14} />
              <span>Logout</span>
            </button>
          </div>
        ) : (
          <button
            onClick={onOpenAuth}
            className="btn-primary"
            style={{ padding: '8px 16px', fontSize: '0.85rem' }}
          >
            <LogIn size={15} />
            <span>Sign In / Register</span>
          </button>
        )}
      </div>
    </nav>
  );
};
