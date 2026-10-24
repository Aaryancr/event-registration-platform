import React, { useState, useEffect } from 'react';
import { X, Lock, Mail, User, AlertCircle, CheckCircle2, Shield, Ticket, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { login, register, error, clearError } = useAuth();
  const [tab, setTab] = useState<'login' | 'register'>('login');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<UserRole>('attendee');
  const [submitting, setSubmitting] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);

  // Close on ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setClientError(null);
    clearError();

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setClientError('Both email address and password are required.');
      return;
    }

    if (!trimmedEmail.includes('@') || !trimmedEmail.includes('.')) {
      setClientError('Please enter a valid email address.');
      return;
    }

    if (tab === 'register' && !displayName.trim()) {
      setClientError('Please provide your full display name.');
      return;
    }

    if (password.length < 6) {
      setClientError('Password must contain at least 6 characters.');
      return;
    }

    setSubmitting(true);
    try {
      if (tab === 'login') {
        await login(trimmedEmail, password);
      } else {
        await register(trimmedEmail, password, displayName.trim(), role);
      }
      onClose();
      if (onSuccess) onSuccess();
    } catch {
      // Errors handled via context state
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    clearError();
    setClientError(null);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div
        className="modal-content"
        style={{
          width: '100%',
          maxWidth: '460px',
          padding: '32px',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={handleClose}
          aria-label="Close dialog"
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
            transition: 'color var(--transition-fast)',
          }}
        >
          <X size={20} />
        </button>

        {/* Modal Header */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: '6px', color: '#f8fafc' }}>
            {tab === 'login' ? 'Welcome Back' : 'Create Your Account'}
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            {tab === 'login'
              ? 'Access your registrations, QR tickets, and event controls.'
              : 'Join EventFlow to register for events or manage them as an organizer.'}
          </p>

          {/* Tab Selector */}
          <div
            style={{
              display: 'flex',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '4px',
              marginTop: '18px',
            }}
          >
            <button
              type="button"
              onClick={() => {
                setTab('login');
                clearError();
                setClientError(null);
              }}
              style={{
                flex: 1,
                padding: '9px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                background: tab === 'login' ? 'var(--primary)' : 'transparent',
                color: tab === 'login' ? '#ffffff' : 'var(--text-secondary)',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
                transition: 'all var(--transition-fast)',
              }}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('register');
                clearError();
                setClientError(null);
              }}
              style={{
                flex: 1,
                padding: '9px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                background: tab === 'register' ? 'var(--primary)' : 'transparent',
                color: tab === 'register' ? '#ffffff' : 'var(--text-secondary)',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
                transition: 'all var(--transition-fast)',
              }}
            >
              Register
            </button>
          </div>
        </div>

        {/* Error Feedback Banner */}
        {(clientError || error) && (
          <div
            style={{
              background: 'var(--status-danger-bg)',
              border: '1px solid var(--status-danger-border)',
              borderRadius: 'var(--radius-md)',
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              color: '#f87171',
              fontSize: '0.85rem',
              marginBottom: '20px',
            }}
          >
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <span>{clientError || error}</span>
          </div>
        )}

        {/* Auth Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {tab === 'register' && (
            <div>
              <label className="input-label">Full Name</label>
              <div style={{ position: 'relative' }}>
                <User size={16} style={{ position: 'absolute', left: '14px', top: '13px', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="e.g. Alex Rivera"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="input-field"
                  style={{ paddingLeft: '40px' }}
                  required
                />
              </div>
            </div>
          )}

          <div>
            <label className="input-label">Email Address</label>
            <div style={{ position: 'relative' }}>
              <Mail size={16} style={{ position: 'absolute', left: '14px', top: '13px', color: 'var(--text-muted)' }} />
              <input
                type="email"
                placeholder="name@organization.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                style={{ paddingLeft: '40px' }}
                required
              />
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="input-label">Password</label>
              {tab === 'register' && (
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Min. 6 characters</span>
              )}
            </div>
            <div style={{ position: 'relative' }}>
              <Lock size={16} style={{ position: 'absolute', left: '14px', top: '13px', color: 'var(--text-muted)' }} />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
                style={{ paddingLeft: '40px', paddingRight: '40px' }}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '11px',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Role Selection Cards for Registration */}
          {tab === 'register' && (
            <div>
              <label className="input-label">Choose Account Purpose</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div
                  onClick={() => setRole('attendee')}
                  style={{
                    padding: '12px',
                    borderRadius: 'var(--radius-md)',
                    border: `1.5px solid ${role === 'attendee' ? 'var(--primary)' : 'var(--border-subtle)'}`,
                    background: role === 'attendee' ? 'rgba(99, 102, 241, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Ticket size={16} color={role === 'attendee' ? '#818cf8' : 'var(--text-muted)'} />
                      <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#f8fafc' }}>Attendee</span>
                    </div>
                    {role === 'attendee' && <CheckCircle2 size={16} color="var(--primary)" />}
                  </div>
                  <p style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', lineHeight: 1.35 }}>
                    Book tickets, manage seat holds, and earn certificates.
                  </p>
                </div>

                <div
                  onClick={() => setRole('organizer')}
                  style={{
                    padding: '12px',
                    borderRadius: 'var(--radius-md)',
                    border: `1.5px solid ${role === 'organizer' ? 'var(--accent-cyan)' : 'var(--border-subtle)'}`,
                    background: role === 'organizer' ? 'rgba(6, 182, 212, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Shield size={16} color={role === 'organizer' ? '#38bdf8' : 'var(--text-muted)'} />
                      <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#f8fafc' }}>Organizer</span>
                    </div>
                    {role === 'organizer' && <CheckCircle2 size={16} color="var(--accent-cyan)" />}
                  </div>
                  <p style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', lineHeight: 1.35 }}>
                    Create events, scan entry codes, and issue credentials.
                  </p>
                </div>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="btn btn-primary"
            style={{ width: '100%', padding: '13px', marginTop: '6px', fontSize: '0.95rem' }}
          >
            {submitting
              ? 'Authenticating...'
              : tab === 'login'
              ? 'Sign In to EventFlow'
              : 'Create Account & Continue'}
          </button>
        </form>
      </div>
    </div>
  );
};
