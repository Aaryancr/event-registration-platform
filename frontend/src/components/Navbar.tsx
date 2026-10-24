import React, { useState } from 'react';
import {
  Layers,
  Calendar,
  Ticket,
  Award,
  LayoutDashboard,
  Activity,
  LogIn,
  LogOut,
  User as UserIcon,
  Menu,
  X,
  Radio,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export type NavTab = 'events' | 'tickets' | 'certificates' | 'organizer' | 'observability';

interface NavbarProps {
  currentTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  onOpenAuth: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentTab, onTabChange, onOpenAuth }) => {
  const { user, isAuthenticated, isOrganizer, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleTabClick = (tab: NavTab) => {
    onTabChange(tab);
    setMobileMenuOpen(false);
  };

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        backgroundColor: 'rgba(7, 10, 18, 0.88)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--border-subtle)',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
      }}
    >
      <div
        style={{
          maxWidth: '1280px',
          margin: '0 auto',
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
        }}
      >
        {/* Brand */}
        <div
          onClick={() => handleTabClick('events')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(99, 102, 241, 0.45)',
            }}
          >
            <Layers size={20} color="#ffffff" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.03em', color: '#f8fafc' }}>
                EventFlow
              </span>
              <span
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  background: 'rgba(99, 102, 241, 0.15)',
                  color: '#818cf8',
                  border: '1px solid rgba(99, 102, 241, 0.3)',
                }}
              >
                SaaS
              </span>
            </div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '0.01em' }}>
              High-Throughput Ticketing
            </span>
          </div>
        </div>

        {/* Desktop Navigation Links */}
        <nav
          style={{
            display: 'none',
            alignItems: 'center',
            gap: '6px',
          }}
          className="desktop-nav"
        >
          <button
            className={`nav-tab-btn ${currentTab === 'events' ? 'active' : ''}`}
            onClick={() => handleTabClick('events')}
          >
            <Calendar size={16} />
            <span>Discover Events</span>
          </button>

          {isAuthenticated && (
            <>
              <button
                className={`nav-tab-btn ${currentTab === 'tickets' ? 'active' : ''}`}
                onClick={() => handleTabClick('tickets')}
              >
                <Ticket size={16} />
                <span>My Tickets</span>
              </button>

              <button
                className={`nav-tab-btn ${currentTab === 'certificates' ? 'active' : ''}`}
                onClick={() => handleTabClick('certificates')}
              >
                <Award size={16} />
                <span>Certificates</span>
              </button>
            </>
          )}

          {isOrganizer && (
            <button
              className={`nav-tab-btn ${currentTab === 'organizer' ? 'active' : ''}`}
              onClick={() => handleTabClick('organizer')}
            >
              <LayoutDashboard size={16} />
              <span>Organizer Console</span>
            </button>
          )}

          <button
            className={`nav-tab-btn ${currentTab === 'observability' ? 'active' : ''}`}
            onClick={() => handleTabClick('observability')}
          >
            <Activity size={16} />
            <span>System Ops</span>
          </button>
        </nav>

        {/* User Session & Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {/* Live Sync Status Pill */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: 'var(--radius-pill)',
              background: 'rgba(16, 185, 129, 0.08)',
              border: '1px solid rgba(16, 185, 129, 0.22)',
              fontSize: '0.75rem',
              color: '#34d399',
              fontWeight: 500,
            }}
            title="Real-time seat engine active"
          >
            <Radio size={12} className="pulse" />
            <span className="live-status-text">Live Sync</span>
          </div>

          {isAuthenticated && user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '9px',
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    background: isOrganizer
                      ? 'linear-gradient(135deg, #06b6d4, #3b82f6)'
                      : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '0.75rem',
                  }}
                >
                  {user.display_name ? user.display_name.charAt(0).toUpperCase() : <UserIcon size={14} />}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                    {user.display_name}
                  </span>
                  <span
                    style={{
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      color: isOrganizer ? '#38bdf8' : '#34d399',
                      letterSpacing: '0.04em',
                    }}
                  >
                    {user.role}
                  </span>
                </div>
              </div>

              <button
                onClick={logout}
                title="Sign Out"
                className="btn btn-outline btn-sm"
                style={{ padding: '7px 10px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}
              >
                <LogOut size={14} />
                <span className="logout-text">Sign Out</span>
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              className="btn btn-primary btn-sm"
              style={{ padding: '8px 16px', fontSize: '0.85rem' }}
            >
              <LogIn size={15} />
              <span>Sign In / Register</span>
            </button>
          )}

          {/* Mobile Menu Hamburger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="mobile-menu-btn"
            style={{
              display: 'none',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              padding: '6px',
            }}
            aria-label="Toggle Navigation Menu"
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile Dropdown Nav */}
      {mobileMenuOpen && (
        <div
          style={{
            padding: '16px 24px',
            backgroundColor: 'var(--bg-surface-elevated)',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
          className="mobile-nav-panel"
        >
          <button
            className={`nav-tab-btn ${currentTab === 'events' ? 'active' : ''}`}
            onClick={() => handleTabClick('events')}
            style={{ justifyContent: 'flex-start', width: '100%' }}
          >
            <Calendar size={18} />
            <span>Discover Events</span>
          </button>

          {isAuthenticated && (
            <>
              <button
                className={`nav-tab-btn ${currentTab === 'tickets' ? 'active' : ''}`}
                onClick={() => handleTabClick('tickets')}
                style={{ justifyContent: 'flex-start', width: '100%' }}
              >
                <Ticket size={18} />
                <span>My Tickets</span>
              </button>

              <button
                className={`nav-tab-btn ${currentTab === 'certificates' ? 'active' : ''}`}
                onClick={() => handleTabClick('certificates')}
                style={{ justifyContent: 'flex-start', width: '100%' }}
              >
                <Award size={18} />
                <span>Certificates</span>
              </button>
            </>
          )}

          {isOrganizer && (
            <button
              className={`nav-tab-btn ${currentTab === 'organizer' ? 'active' : ''}`}
              onClick={() => handleTabClick('organizer')}
              style={{ justifyContent: 'flex-start', width: '100%' }}
            >
              <LayoutDashboard size={18} />
              <span>Organizer Console</span>
            </button>
          )}

          <button
            className={`nav-tab-btn ${currentTab === 'observability' ? 'active' : ''}`}
            onClick={() => handleTabClick('observability')}
            style={{ justifyContent: 'flex-start', width: '100%' }}
          >
            <Activity size={18} />
            <span>System Ops</span>
          </button>
        </div>
      )}

      {/* Responsive Inline Media Styles */}
      <style>{`
        @media (min-width: 768px) {
          .desktop-nav {
            display: flex !important;
          }
          .mobile-menu-btn {
            display: none !important;
          }
        }
        @media (max-width: 767px) {
          .desktop-nav {
            display: none !important;
          }
          .mobile-menu-btn {
            display: block !important;
          }
          .logout-text, .live-status-text {
            display: none;
          }
        }
      `}</style>
    </header>
  );
};
