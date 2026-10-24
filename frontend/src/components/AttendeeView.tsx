import React, { useState, useEffect, useCallback } from 'react';
import {
  Ticket,
  Award,
  QrCode,
  X,
  Printer,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { Registration, Ticket as TicketType, Certificate, CertificateVerifyResponse } from '../types';
import { api } from '../api/client';

interface AttendeeViewProps {
  initialTab?: 'tickets' | 'certificates';
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void;
}

export const AttendeeView: React.FC<AttendeeViewProps> = ({ initialTab = 'tickets', onNotify }) => {
  const [activeTab, setActiveTab] = useState<'tickets' | 'certificates'>(initialTab);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Selected ticket for QR modal
  const [selectedTicket, setSelectedTicket] = useState<TicketType | null>(null);
  const [loadingTicketId, setLoadingTicketId] = useState<number | null>(null);

  // Selected certificate for print modal
  const [selectedCert, setSelectedCert] = useState<Certificate | null>(null);

  // Verification lookup state
  const [verifyCode, setVerifyCode] = useState<string>('');
  const [verifyResult, setVerifyResult] = useState<CertificateVerifyResponse | null>(null);
  const [verifying, setVerifying] = useState<boolean>(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (activeTab === 'tickets') {
        const regs = await api.registrations.listMine();
        setRegistrations(regs);
      } else {
        const certs = await api.certificates.listMine();
        setCertificates(certs);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load attendee records';
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

  const handleCancelRegistration = async (eventId: number) => {
    if (!window.confirm('Are you sure you want to cancel your registration? If attendees are waiting, your seat will be automatically given to the next person in line.')) {
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

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyCode.trim()) return;
    setVerifying(true);
    setVerifyResult(null);
    try {
      const result = await api.certificates.verify(verifyCode.trim());
      setVerifyResult(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Certificate code not found or invalid';
      onNotify('error', msg);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', width: '100%', padding: '24px 0' }}>
      {/* Tab Switcher */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '28px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
        <button
          className={`nav-tab-btn ${activeTab === 'tickets' ? 'active' : ''}`}
          onClick={() => setActiveTab('tickets')}
          style={{ fontSize: '1rem', padding: '10px 18px' }}
        >
          <Ticket size={18} />
          <span>My Registrations & Tickets</span>
        </button>
        <button
          className={`nav-tab-btn ${activeTab === 'certificates' ? 'active' : ''}`}
          onClick={() => setActiveTab('certificates')}
          style={{ fontSize: '1rem', padding: '10px 18px' }}
        >
          <Award size={18} />
          <span>My Certificates & Verification</span>
        </button>
      </div>

      {/* TICKETS TAB */}
      {activeTab === 'tickets' && (
        <div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
              Loading your registrations...
            </div>
          ) : registrations.length === 0 ? (
            <div className="glass-panel" style={{ padding: '48px', textAlign: 'center' }}>
              <Ticket size={40} color="var(--text-muted)" style={{ margin: '0 auto 16px' }} />
              <h3 style={{ fontSize: '1.2rem', marginBottom: '8px' }}>No Registrations Yet</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', maxWidth: '400px', margin: '0 auto' }}>
                You have not registered for any events yet. Browse our published events to reserve your seat!
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {registrations.map((reg) => {
                const isCancelled = reg.status === 'cancelled';
                return (
                  <div
                    key={reg.id}
                    className="glass-panel"
                    style={{
                      padding: '24px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '16px',
                      opacity: isCancelled ? 0.6 : 1,
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            padding: '3px 8px',
                            borderRadius: '12px',
                            background: isCancelled ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                            color: isCancelled ? '#ef4444' : '#10b981',
                          }}
                        >
                          {reg.status}
                        </span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          Registered on {new Date(reg.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '6px' }}>
                        Event #{reg.event_id}
                      </h3>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        Registration ID: #{reg.id}
                      </p>
                    </div>

                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      {!isCancelled && (
                        <>
                          <button
                            onClick={() => handleViewTicket(reg)}
                            disabled={loadingTicketId === reg.id}
                            className="btn-primary"
                            style={{ padding: '8px 16px', fontSize: '0.85rem' }}
                          >
                            <QrCode size={16} />
                            <span>{loadingTicketId === reg.id ? 'Loading...' : 'View QR Ticket'}</span>
                          </button>

                          <button
                            onClick={() => handleCancelRegistration(reg.event_id)}
                            style={{
                              background: 'transparent',
                              border: '1px solid rgba(239, 68, 68, 0.3)',
                              color: '#ef4444',
                              borderRadius: '8px',
                              padding: '8px 12px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              fontSize: '0.85rem',
                            }}
                          >
                            <Trash2 size={14} />
                            <span>Cancel</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* CERTIFICATES TAB */}
      {activeTab === 'certificates' && (
        <div>
          {/* Public Verification Box */}
          <div
            className="glass-panel"
            style={{ padding: '24px', marginBottom: '32px', background: 'rgba(99, 102, 241, 0.05)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <ShieldCheck size={20} color="#818cf8" />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Verify Digital Certificate Fingerprint</h3>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Enter any 32-character certificate code to publicly verify its cryptographic SHA-256 fingerprint.
            </p>

            <form onSubmit={handleVerify} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="e.g. CERT-..."
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value)}
                className="input-field"
                style={{ flex: 1, minWidth: '240px' }}
                required
              />
              <button
                type="submit"
                disabled={verifying}
                className="btn-primary"
                style={{ padding: '10px 20px', fontSize: '0.85rem' }}
              >
                {verifying ? 'Verifying...' : 'Verify Authenticity'}
              </button>
            </form>

            {verifyResult && (
              <div
                style={{
                  marginTop: '16px',
                  padding: '16px',
                  borderRadius: '8px',
                  background: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981', fontWeight: 700, marginBottom: '6px' }}>
                  <ShieldCheck size={18} />
                  <span>Verified Authenticity Signature</span>
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                  <div><strong>Attendee:</strong> {verifyResult.attendee_name}</div>
                  <div><strong>Event:</strong> {verifyResult.event_title}</div>
                  <div><strong>Date Issued:</strong> {new Date(verifyResult.issued_at).toLocaleDateString()}</div>
                  <div style={{ marginTop: '6px', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    SHA-256: {verifyResult.verification_hash}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Certificate List */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
              Loading your certificates...
            </div>
          ) : certificates.length === 0 ? (
            <div className="glass-panel" style={{ padding: '48px', textAlign: 'center' }}>
              <Award size={40} color="var(--text-muted)" style={{ margin: '0 auto 16px' }} />
              <h3 style={{ fontSize: '1.2rem', marginBottom: '8px' }}>No Certificates Issued Yet</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', maxWidth: '440px', margin: '0 auto' }}>
                Certificates are generated asynchronously by event organizers after event conclusion.
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
              {certificates.map((cert) => (
                <div key={cert.id} className="glass-panel" style={{ padding: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        padding: '3px 8px',
                        borderRadius: '12px',
                        background: cert.status === 'generated' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                        color: cert.status === 'generated' ? '#10b981' : '#f59e0b',
                      }}
                    >
                      {cert.status}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      #{cert.certificate_code.slice(0, 8)}...
                    </span>
                  </div>

                  <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '8px' }}>
                    Event #{cert.event_id}
                  </h3>

                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                    {cert.issued_at ? `Issued on ${new Date(cert.issued_at).toLocaleDateString()}` : 'Generating asynchronously...'}
                  </p>

                  {cert.rendered_content && (
                    <button
                      onClick={() => setSelectedCert(cert)}
                      className="btn-primary"
                      style={{ width: '100%', justifyContent: 'center', padding: '10px', fontSize: '0.85rem' }}
                    >
                      <Printer size={15} />
                      <span>View & Print Certificate</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* QR TICKET MODAL */}
      {selectedTicket && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '16px',
          }}
          onClick={() => setSelectedTicket(null)}
        >
          <div
            className="glass-panel"
            style={{
              width: '100%',
              maxWidth: '400px',
              padding: '32px',
              textAlign: 'center',
              position: 'relative',
              background: '#0d121f',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelectedTicket(null)}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              <X size={20} />
            </button>

            <h3 style={{ fontSize: '1.35rem', fontWeight: 800, marginBottom: '6px' }}>
              Your Event Ticket
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '20px' }}>
              Present this QR code or ticket code at the entrance for operator check-in.
            </p>

            {/* SVG QR Code Image Container */}
            <div
              style={{
                background: '#ffffff',
                padding: '20px',
                borderRadius: '16px',
                display: 'inline-block',
                marginBottom: '20px',
                boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
              }}
            >
              {selectedTicket.qr_code_data ? (
                <img
                  src={selectedTicket.qr_code_data}
                  alt="Ticket QR Code"
                  style={{ width: '220px', height: '220px', display: 'block' }}
                />
              ) : (
                <div style={{ width: '220px', height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000' }}>
                  QR Code Unavailable
                </div>
              )}
            </div>

            {/* Ticket Code */}
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                padding: '10px',
                borderRadius: '8px',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.9rem',
                color: '#38bdf8',
                letterSpacing: '0.05em',
                marginBottom: '16px',
              }}
            >
              {selectedTicket.ticket_code}
            </div>

            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Status:{' '}
              <span style={{ fontWeight: 700, color: selectedTicket.status === 'used' ? '#10b981' : '#818cf8', textTransform: 'uppercase' }}>
                {selectedTicket.status}
              </span>
              {selectedTicket.checked_in_at && (
                <div>Checked in at {new Date(selectedTicket.checked_in_at).toLocaleTimeString()}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* PRINT CERTIFICATE MODAL */}
      {selectedCert && selectedCert.rendered_content && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '16px',
          }}
          onClick={() => setSelectedCert(null)}
        >
          <div
            className="glass-panel"
            style={{
              width: '100%',
              maxWidth: '850px',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '24px',
              position: 'relative',
              background: '#ffffff',
              color: '#000000',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }} className="no-print">
              <button
                onClick={() => window.print()}
                className="btn-primary"
                style={{ padding: '8px 16px', fontSize: '0.85rem' }}
              >
                <Printer size={16} />
                <span>Print Certificate</span>
              </button>
              <button
                onClick={() => setSelectedCert(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#64748b',
                  cursor: 'pointer',
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Embedded Rendered HTML Content */}
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
