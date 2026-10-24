import React, { useState, useEffect, useCallback } from 'react';
import {
  Ticket,
  Award,
  QrCode,
  X,
  Printer,
  ShieldCheck,
  Trash2,
  Clock,
  CreditCard,
  Copy,
  Check,
  AlertCircle,
} from 'lucide-react';
import { Registration, Ticket as TicketType, Certificate, CertificateVerifyResponse, SeatHold } from '../types';
import { api } from '../api/client';

interface AttendeeViewProps {
  initialTab?: 'tickets' | 'certificates' | 'holds';
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void;
}

export const AttendeeView: React.FC<AttendeeViewProps> = ({ initialTab = 'tickets', onNotify }) => {
  const [activeTab, setActiveTab] = useState<'tickets' | 'certificates' | 'holds'>(initialTab);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [holds, setHolds] = useState<SeatHold[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Selected ticket for QR modal
  const [selectedTicket, setSelectedTicket] = useState<TicketType | null>(null);
  const [loadingTicketId, setLoadingTicketId] = useState<number | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  // Selected certificate for print modal
  const [selectedCert, setSelectedCert] = useState<Certificate | null>(null);

  // Verification lookup state
  const [verifyCode, setVerifyCode] = useState<string>('');
  const [verifyResult, setVerifyResult] = useState<CertificateVerifyResponse | null>(null);
  const [verifying, setVerifying] = useState<boolean>(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (activeTab === 'tickets') {
        const regs = await api.registrations.listMine();
        setRegistrations(regs);
      } else if (activeTab === 'holds') {
        const activeHolds = await api.holds.listMine();
        setHolds(activeHolds);
      } else {
        const certs = await api.certificates.listMine();
        setCertificates(certs);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to retrieve attendee records';
      onNotify('error', msg);
    } finally {
      setLoading(false);
    }
  }, [activeTab, onNotify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleViewTicket = async (reg: Registration) => {
    setLoadingTicketId(reg.id);
    try {
      const ticket = await api.tickets.getTicket(reg.id);
      setSelectedTicket(ticket);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not fetch ticket details';
      onNotify('error', msg);
    } finally {
      setLoadingTicketId(null);
    }
  };

  const handleCopyTicketCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const handleCancelRegistration = async (eventId: number) => {
    if (!window.confirm('Are you sure you want to cancel your confirmed registration? If there is a waiting queue, your seat will be automatically awarded to the next person in line.')) {
      return;
    }

    try {
      const res = await api.registrations.cancel(eventId);
      onNotify('info', res.promoted ? 'Registration cancelled. A waiting attendee has been promoted!' : 'Registration cancelled successfully.');
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to cancel registration';
      onNotify('error', msg);
    }
  };

  const handlePayHold = async (holdId: number, simulateFail = false) => {
    setActionInProgress(`pay-${holdId}`);
    try {
      const resp = await api.holds.pay(holdId, 10.0, simulateFail);
      onNotify('success', `Payment finalized! Ticket code generated: ${resp.ticket_code}`);
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Payment simulation failed';
      onNotify('error', msg);
      loadData();
    } finally {
      setActionInProgress(null);
    }
  };

  const handleCancelHold = async (holdId: number) => {
    setActionInProgress(`cancel-${holdId}`);
    try {
      await api.holds.cancel(holdId);
      onNotify('info', 'Seat hold cancelled and released.');
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to release hold';
      onNotify('error', msg);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyCode.trim()) return;
    setVerifying(true);
    setVerifyResult(null);
    try {
      const result = await api.certificates.verify(verifyCode.trim());
      setVerifyResult(result);
      onNotify('success', 'Certificate verified successfully!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Certificate code not found or cryptographic hash mismatch';
      onNotify('error', msg);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div style={{ maxWidth: '1060px', margin: '0 auto', width: '100%', padding: '16px 0 32px' }}>
      {/* Sub-navigation Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '28px',
          borderBottom: '1px solid var(--border-subtle)',
          paddingBottom: '12px',
          overflowX: 'auto',
        }}
      >
        <button
          className={`nav-tab-btn ${activeTab === 'tickets' ? 'active' : ''}`}
          onClick={() => setActiveTab('tickets')}
          style={{ padding: '10px 18px', fontSize: '0.92rem' }}
        >
          <Ticket size={17} />
          <span>My Tickets & Registrations</span>
        </button>

        <button
          className={`nav-tab-btn ${activeTab === 'holds' ? 'active' : ''}`}
          onClick={() => setActiveTab('holds')}
          style={{ padding: '10px 18px', fontSize: '0.92rem' }}
        >
          <Clock size={17} />
          <span>Active Seat Holds</span>
        </button>

        <button
          className={`nav-tab-btn ${activeTab === 'certificates' ? 'active' : ''}`}
          onClick={() => setActiveTab('certificates')}
          style={{ padding: '10px 18px', fontSize: '0.92rem' }}
        >
          <Award size={17} />
          <span>Certificates & Verification</span>
        </button>
      </div>

      {/* TAB 1: TICKETS */}
      {activeTab === 'tickets' && (
        <div>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {[1, 2].map((i) => (
                <div key={i} className="card skeleton" style={{ height: '140px' }} />
              ))}
            </div>
          ) : registrations.length === 0 ? (
            <div className="card" style={{ padding: '60px 24px', textAlign: 'center' }}>
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
                <Ticket size={28} />
              </div>
              <h3 style={{ fontSize: '1.3rem', marginBottom: '8px' }}>No Registrations Found</h3>
              <p style={{ color: 'var(--text-secondary)', maxWidth: '420px', margin: '0 auto 20px' }}>
                You have not registered for any events yet. Check our upcoming schedule to reserve seats!
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {registrations.map((reg) => {
                const isCancelled = reg.status === 'cancelled';
                return (
                  <div
                    key={reg.id}
                    className="ticket-card"
                    style={{
                      opacity: isCancelled ? 0.6 : 1,
                      filter: isCancelled ? 'grayscale(0.7)' : 'none',
                    }}
                  >
                    {/* Main Ticket Left Side */}
                    <div className="ticket-main">
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                          <span
                            className={`badge ${isCancelled ? 'badge-danger' : 'badge-success'}`}
                            style={{ fontSize: '0.72rem' }}
                          >
                            {reg.status}
                          </span>

                          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            Booked {new Date(reg.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                        </div>

                        <h3 style={{ fontSize: '1.35rem', fontWeight: 800, marginBottom: '6px', color: '#f8fafc' }}>
                          Event #{reg.event_id}
                        </h3>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '0.84rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                          <span>Registration Record: <strong>#{reg.id}</strong></span>
                          <span>•</span>
                          <span>User ID: <strong>#{reg.user_id}</strong></span>
                        </div>
                      </div>

                      {/* Ticket Action Buttons */}
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', paddingTop: '14px', borderTop: '1px solid var(--border-subtle)' }}>
                        {!isCancelled ? (
                          <>
                            <button
                              onClick={() => handleViewTicket(reg)}
                              disabled={loadingTicketId === reg.id}
                              className="btn btn-primary btn-sm"
                            >
                              <QrCode size={15} />
                              <span>{loadingTicketId === reg.id ? 'Loading...' : 'View Digital QR Ticket'}</span>
                            </button>

                            <button
                              onClick={() => handleCancelRegistration(reg.event_id)}
                              className="btn btn-danger btn-sm"
                            >
                              <Trash2 size={14} />
                              <span>Cancel Registration</span>
                            </button>
                          </>
                        ) : (
                          <div style={{ fontSize: '0.82rem', color: '#f87171', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <AlertCircle size={14} />
                            <span>This registration was cancelled and seat capacity was released.</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Perforated Divider */}
                    <div className="ticket-divider-line">
                      <div className="ticket-notch-top" />
                      <div className="ticket-notch-bottom" />
                    </div>

                    {/* Ticket Stub Right Side */}
                    <div className="ticket-stub">
                      <div
                        style={{
                          width: '48px',
                          height: '48px',
                          borderRadius: '12px',
                          background: isCancelled ? 'rgba(239, 68, 68, 0.15)' : 'rgba(99, 102, 241, 0.15)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginBottom: '10px',
                          color: isCancelled ? '#ef4444' : '#818cf8',
                        }}
                      >
                        <QrCode size={26} />
                      </div>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Admission Pass
                      </span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Click to Reveal QR
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: SEAT HOLDS */}
      {activeTab === 'holds' && (
        <div>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {[1].map((i) => (
                <div key={i} className="card skeleton" style={{ height: '140px' }} />
              ))}
            </div>
          ) : holds.length === 0 ? (
            <div className="card" style={{ padding: '60px 24px', textAlign: 'center' }}>
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  background: 'rgba(245, 158, 11, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                  color: '#f59e0b',
                }}
              >
                <Clock size={28} />
              </div>
              <h3 style={{ fontSize: '1.3rem', marginBottom: '8px' }}>No Active Seat Holds</h3>
              <p style={{ color: 'var(--text-secondary)', maxWidth: '440px', margin: '0 auto' }}>
                Temporary holds let you lock seats for 10 minutes while you complete mock payment. When you hold a seat, it will appear here.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {holds.map((hold) => {
                const isExpired = new Date(hold.expires_at) < new Date() || hold.status !== 'held';
                const remainingSecs = Math.max(0, Math.floor((new Date(hold.expires_at).getTime() - Date.now()) / 1000));

                return (
                  <div
                    key={hold.id}
                    className="card"
                    style={{
                      border: '1px solid rgba(99, 102, 241, 0.3)',
                      background: 'linear-gradient(135deg, rgba(14, 21, 38, 0.95), rgba(24, 33, 54, 0.75))',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className={`badge ${isExpired ? 'badge-neutral' : 'badge-primary'}`}>
                          {isExpired ? 'Expired / Finalized' : 'Active Hold'}
                        </span>
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                          Hold ID: #{hold.id}
                        </span>
                      </div>

                      {!isExpired && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: remainingSecs < 120 ? '#f43f5e' : '#38bdf8', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                          <Clock size={16} />
                          <span>{Math.floor(remainingSecs / 60)}:{String(remainingSecs % 60).padStart(2, '0')} remaining</span>
                        </div>
                      )}
                    </div>

                    <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '6px', color: '#f8fafc' }}>
                      Event #{hold.event_id}
                    </h3>
                    <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', marginBottom: '18px' }}>
                      Expires at: {new Date(hold.expires_at).toLocaleTimeString()} • Price: <strong>$10.00 USD (Mock)</strong>
                    </p>

                    {!isExpired && (
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <button
                          onClick={() => handlePayHold(hold.id, false)}
                          disabled={actionInProgress !== null}
                          className="btn btn-primary btn-sm"
                        >
                          <CreditCard size={15} />
                          <span>{actionInProgress === `pay-${hold.id}` ? 'Processing...' : 'Pay Mock $10.00'}</span>
                        </button>

                        <button
                          onClick={() => handlePayHold(hold.id, true)}
                          disabled={actionInProgress !== null}
                          className="btn btn-danger btn-sm"
                        >
                          <span>Test Payment Failure</span>
                        </button>

                        <button
                          onClick={() => handleCancelHold(hold.id)}
                          disabled={actionInProgress !== null}
                          className="btn btn-outline btn-sm"
                        >
                          Release Hold
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: CERTIFICATES & VERIFICATION */}
      {activeTab === 'certificates' && (
        <div>
          {/* Public Verification Box */}
          <div
            className="card"
            style={{
              padding: '24px',
              marginBottom: '32px',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(14, 21, 38, 0.95) 100%)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <ShieldCheck size={22} color="var(--primary)" />
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#f8fafc' }}>
                Verify Digital Certificate Fingerprint
              </h3>
            </div>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginBottom: '18px' }}>
              Enter any 32-character certificate code to cryptographically verify its SHA-256 fingerprint against the platform database.
            </p>

            <form onSubmit={handleVerify} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Enter certificate code (e.g. CERT-3f8d...)"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value)}
                className="input-field"
                style={{ flex: 1, minWidth: '240px', fontFamily: 'var(--font-mono)' }}
                required
              />
              <button
                type="submit"
                disabled={verifying}
                className="btn btn-primary"
                style={{ padding: '11px 22px' }}
              >
                {verifying ? 'Verifying Signature...' : 'Verify Authenticity'}
              </button>
            </form>

            {/* Verification Success Box */}
            {verifyResult && (
              <div
                style={{
                  marginTop: '18px',
                  padding: '18px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--status-success-bg)',
                  border: '1px solid var(--status-success-border)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--status-success)', fontWeight: 700, marginBottom: '8px' }}>
                  <ShieldCheck size={20} />
                  <span>Verified Cryptographic Authenticity</span>
                </div>
                <div style={{ fontSize: '0.88rem', color: 'var(--text-primary)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px' }}>
                  <div><span style={{ color: 'var(--text-muted)' }}>Attendee:</span> <strong>{verifyResult.attendee_name}</strong></div>
                  <div><span style={{ color: 'var(--text-muted)' }}>Event:</span> <strong>{verifyResult.event_title}</strong></div>
                  <div><span style={{ color: 'var(--text-muted)' }}>Date:</span> <strong>{new Date(verifyResult.issued_at).toLocaleDateString()}</strong></div>
                </div>
                <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(16, 185, 129, 0.2)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: '#a7f3d0' }}>
                  SHA-256 Fingerprint: {verifyResult.verification_hash}
                </div>
              </div>
            )}
          </div>

          {/* Certificate List */}
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '16px' }}>Your Earned Credentials</h3>
          {loading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
              {[1, 2].map((i) => (
                <div key={i} className="card skeleton" style={{ height: '180px' }} />
              ))}
            </div>
          ) : certificates.length === 0 ? (
            <div className="card" style={{ padding: '60px 24px', textAlign: 'center' }}>
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
                <Award size={28} />
              </div>
              <h3 style={{ fontSize: '1.3rem', marginBottom: '8px' }}>No Certificates Issued Yet</h3>
              <p style={{ color: 'var(--text-secondary)', maxWidth: '440px', margin: '0 auto' }}>
                Event organizers issue certificates asynchronously upon event completion. Once generated, your verifiable certificates will appear here.
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
              {certificates.map((cert) => (
                <div key={cert.id} className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <span className={`badge ${cert.status === 'generated' ? 'badge-success' : 'badge-warning'}`}>
                        {cert.status}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        #{cert.certificate_code.slice(0, 10)}...
                      </span>
                    </div>

                    <h4 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '6px', color: '#f8fafc' }}>
                      Event #{cert.event_id}
                    </h4>

                    <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', marginBottom: '18px' }}>
                      {cert.issued_at ? `Issued on ${new Date(cert.issued_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}` : 'Queued for generation...'}
                    </p>
                  </div>

                  {cert.rendered_content ? (
                    <button
                      onClick={() => setSelectedCert(cert)}
                      className="btn btn-primary btn-sm"
                      style={{ width: '100%', padding: '10px' }}
                    >
                      <Printer size={15} />
                      <span>View & Print Certificate</span>
                    </button>
                  ) : (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', padding: '8px' }}>
                      Rendering certificate...
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* QR TICKET MODAL */}
      {selectedTicket && (
        <div className="modal-overlay" onClick={() => setSelectedTicket(null)}>
          <div
            className="modal-content"
            style={{
              width: '100%',
              maxWidth: '420px',
              padding: '32px',
              textAlign: 'center',
              position: 'relative',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelectedTicket(null)}
              aria-label="Close ticket"
              style={{
                position: 'absolute',
                top: '18px',
                right: '18px',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              <X size={20} />
            </button>

            <span className="badge badge-primary" style={{ marginBottom: '12px' }}>
              Digital Admission Pass
            </span>

            <h3 style={{ fontSize: '1.45rem', fontWeight: 800, marginBottom: '6px', color: '#f8fafc' }}>
              Your Admission Ticket
            </h3>
            <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', marginBottom: '22px' }}>
              Present this QR code or 32-character code at the venue check-in desk.
            </p>

            {/* Pure SVG QR Code Frame */}
            <div
              style={{
                background: '#ffffff',
                padding: '18px',
                borderRadius: 'var(--radius-lg)',
                display: 'inline-block',
                marginBottom: '20px',
                boxShadow: '0 8px 30px rgba(0, 0, 0, 0.55)',
              }}
            >
              {selectedTicket.qr_code_data ? (
                <img
                  src={selectedTicket.qr_code_data}
                  alt="Official Admission QR Code"
                  style={{ width: '220px', height: '220px', display: 'block' }}
                />
              ) : (
                <div style={{ width: '220px', height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#090d16' }}>
                  QR Code Unavailable
                </div>
              )}
            </div>

            {/* 32-Character Ticket Code with Copy Button */}
            <div
              style={{
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                padding: '10px 14px',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '16px',
              }}
            >
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.88rem', color: '#38bdf8', letterSpacing: '0.04em' }}>
                {selectedTicket.ticket_code}
              </span>

              <button
                onClick={() => handleCopyTicketCode(selectedTicket.ticket_code)}
                title="Copy ticket code"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: copiedCode ? '#34d399' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '0.75rem',
                }}
              >
                {copiedCode ? <Check size={16} /> : <Copy size={16} />}
                <span>{copiedCode ? 'Copied' : 'Copy'}</span>
              </button>
            </div>

            {/* Check-in status badge */}
            <div
              style={{
                fontSize: '0.84rem',
                color: 'var(--text-secondary)',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span>Status:</span>
              <span
                className={`badge ${selectedTicket.status === 'used' ? 'badge-success' : 'badge-primary'}`}
              >
                {selectedTicket.status === 'used' ? 'Admitted / Checked In' : 'Valid for Entry'}
              </span>
            </div>

            {selectedTicket.checked_in_at && (
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                Checked in on {new Date(selectedTicket.checked_in_at).toLocaleString()}
              </div>
            )}
          </div>
        </div>
      )}

      {/* PRINT CERTIFICATE MODAL */}
      {selectedCert && selectedCert.rendered_content && (
        <div className="modal-overlay" onClick={() => setSelectedCert(null)}>
          <div
            className="modal-content"
            style={{
              width: '100%',
              maxWidth: '880px',
              maxHeight: '92vh',
              overflowY: 'auto',
              padding: '24px',
              position: 'relative',
              backgroundColor: '#ffffff',
              color: '#0f172a',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }} className="no-print">
              <button
                onClick={() => window.print()}
                className="btn btn-primary btn-sm"
              >
                <Printer size={16} />
                <span>Print Official Credential</span>
              </button>

              <button
                onClick={() => setSelectedCert(null)}
                aria-label="Close"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#64748b',
                  cursor: 'pointer',
                  padding: '4px',
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Rendered HTML Certificate Content */}
            <div
              dangerouslySetInnerHTML={{ __html: selectedCert.rendered_content }}
              style={{ width: '100%' }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
