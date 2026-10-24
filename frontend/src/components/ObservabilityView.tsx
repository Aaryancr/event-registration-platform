import React, { useState, useEffect, useCallback } from 'react';
import {
  Server,
  Database,
  RefreshCw,
  AlertTriangle,
  Cpu,
  ShieldAlert,
  BarChart2,
  Layers,
} from 'lucide-react';
import { HealthResponse, ReadinessResponse, MetricsSummary } from '../types';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

export const ObservabilityView: React.FC = () => {
  const { isAuthenticated } = useAuth();

  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [readiness, setReadiness] = useState<ReadinessResponse | null>(null);
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [h, r] = await Promise.all([
        api.observability.getHealth(),
        api.observability.getReadiness(),
      ]);
      setHealth(h);
      setReadiness(r);

      // Fetch protected metrics if authenticated
      if (isAuthenticated) {
        try {
          const m = await api.observability.getMetricsSummary();
          setMetrics(m);
        } catch {
          // Non-organizer or token missing
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to query observability endpoints');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 15000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', width: '100%', padding: '24px 0' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '1.85rem', fontWeight: 800 }}>System Health & Observability</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
            Real-time liveness probes, upstream dependency readiness, and Prometheus performance metrics.
          </p>
        </div>

        <button
          onClick={fetchStatus}
          disabled={loading}
          className="btn-primary"
          style={{ padding: '8px 16px', fontSize: '0.85rem' }}
        >
          <RefreshCw size={15} className={loading ? 'spin' : ''} />
          <span>{loading ? 'Polling...' : 'Refresh Metrics'}</span>
        </button>
      </div>

      {error && (
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '10px',
            padding: '16px',
            color: '#ef4444',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* PROBES & DEPENDENCY READINESS GRID */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginBottom: '32px' }}>
        {/* Liveness Probe */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Server size={20} color="#6366f1" />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Application Liveness</h3>
            </div>
            <span className={`status-dot ${health?.status === 'healthy' ? 'healthy' : 'error'} pulse`} />
          </div>

          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div><strong>Status:</strong> <span style={{ color: health?.status === 'healthy' ? '#10b981' : '#ef4444' }}>{health?.status || 'Unknown'}</span></div>
            <div><strong>Endpoint:</strong> <code>/health</code> (Liveness Probe)</div>
            <div><strong>Version:</strong> {health?.version || '0.1.0'}</div>
            <div><strong>Environment:</strong> {health?.environment || 'development'}</div>
          </div>
        </div>

        {/* PostgreSQL Readiness */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Database size={20} color="#38bdf8" />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>PostgreSQL 16 Readiness</h3>
            </div>
            <span className={`status-dot ${readiness?.checks?.database === 'healthy' ? 'healthy' : 'error'} pulse`} />
          </div>

          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div><strong>Check:</strong> <span style={{ color: readiness?.checks?.database === 'healthy' ? '#10b981' : '#ef4444' }}>{readiness?.checks?.database || 'Unchecked'}</span></div>
            <div><strong>Role:</strong> Single source of truth for transactions & row locks</div>
            <div><strong>Endpoint:</strong> <code>/ready</code> (Readiness Probe)</div>
          </div>
        </div>

        {/* Redis 7 Readiness */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Cpu size={20} color="#06b6d4" />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Redis 7 Readiness</h3>
            </div>
            <span className={`status-dot ${readiness?.checks?.redis === 'healthy' ? 'healthy' : 'error'} pulse`} />
          </div>

          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div><strong>Check:</strong> <span style={{ color: readiness?.checks?.redis === 'healthy' ? '#10b981' : '#ef4444' }}>{readiness?.checks?.redis || 'Unchecked'}</span></div>
            <div><strong>Role:</strong> Cache & future multi-process Pub/Sub broadcaster</div>
            <div><strong>Endpoint:</strong> <code>/ready</code> (Readiness Probe)</div>
          </div>
        </div>
      </div>

      {/* PROMETHEUS METRICS SUMMARY */}
      <div className="glass-panel" style={{ padding: '28px', marginBottom: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <BarChart2 size={22} color="#818cf8" />
            <h3 style={{ fontSize: '1.3rem', fontWeight: 700 }}>Telemetry & Prometheus Metrics</h3>
          </div>

          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              padding: '4px 10px',
              borderRadius: '20px',
              background: 'rgba(99, 102, 241, 0.15)',
              color: '#818cf8',
            }}
          >
            PROTECTED ENDPOINT: /api/v1/metrics
          </span>
        </div>

        {metrics ? (
          <div>
            {/* Top Counters */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
              <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '16px', borderRadius: '10px' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Total HTTP Requests</div>
                <div style={{ fontSize: '1.7rem', fontWeight: 800, color: '#f8fafc' }}>{metrics.http_requests_total}</div>
              </div>

              <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '16px', borderRadius: '10px' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>HTTP 4xx/5xx Errors</div>
                <div style={{ fontSize: '1.7rem', fontWeight: 800, color: metrics.http_errors_total > 0 ? '#ef4444' : '#10b981' }}>
                  {metrics.http_errors_total}
                </div>
              </div>

              <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '16px', borderRadius: '10px' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Capacity Exhaustions</div>
                <div style={{ fontSize: '1.7rem', fontWeight: 800, color: '#f59e0b' }}>
                  {metrics.capacity_conflicts_total}
                </div>
              </div>

              <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '16px', borderRadius: '10px' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Async Background Tasks</div>
                <div style={{ fontSize: '1.7rem', fontWeight: 800, color: '#38bdf8' }}>
                  {Object.values(metrics.background_tasks).reduce((a, b) => a + b, 0)}
                </div>
              </div>
            </div>

            {/* Breakdown Tables */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
              {/* Registration Outcomes */}
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '16px', borderRadius: '10px' }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '10px', color: 'var(--text-primary)' }}>
                  Registration Outcomes
                </h4>
                {Object.keys(metrics.registration_outcomes).length === 0 ? (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No registrations recorded yet</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.85rem' }}>
                    {Object.entries(metrics.registration_outcomes).map(([outcome, count]) => (
                      <div key={outcome} style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>{outcome}</span>
                        <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Seat Hold Lifecycle */}
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '16px', borderRadius: '10px' }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '10px', color: 'var(--text-primary)' }}>
                  Seat Hold Lifecycle Transitions
                </h4>
                {Object.keys(metrics.seat_hold_outcomes).length === 0 ? (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No seat holds recorded yet</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.85rem' }}>
                    {Object.entries(metrics.seat_hold_outcomes).map(([outcome, count]) => (
                      <div key={outcome} style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>{outcome}</span>
                        <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Check-in Outcomes */}
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '16px', borderRadius: '10px' }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '10px', color: 'var(--text-primary)' }}>
                  Entrance Check-in Results
                </h4>
                {Object.keys(metrics.checkin_outcomes).length === 0 ? (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No check-ins recorded yet</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.85rem' }}>
                    {Object.entries(metrics.checkin_outcomes).map(([outcome, count]) => (
                      <div key={outcome} style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>{outcome}</span>
                        <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            <ShieldAlert size={32} color="#f59e0b" style={{ margin: '0 auto 12px' }} />
            <p>
              {isAuthenticated
                ? 'Prometheus metrics summary is reserved for organizers. Log in with an organizer account to view detailed telemetry.'
                : 'Sign in to access detailed telemetry and performance counters.'}
            </p>
          </div>
        )}
      </div>

      {/* Architecture Documentation Box */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <Layers size={18} color="#06b6d4" />
          <h4 style={{ fontSize: '1.05rem', fontWeight: 600 }}>Observability Architecture Notes</h4>
        </div>
        <ul style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.6, paddingLeft: '20px' }}>
          <li>
            <strong>Structured Logging:</strong> All requests emit JSON-formatted logs with correlation <code>X-Request-ID</code>, execution latency, and client IP. Credential headers and password/token payload keys are sanitized with <code>[REDACTED]</code>.
          </li>
          <li>
            <strong>Health vs Readiness:</strong> <code>/health</code> acts as a liveness probe (checking whether FastAPI process is responding), whereas <code>/ready</code> actively tests database transactions and Redis responsiveness.
          </li>
          <li>
            <strong>Prometheus Protection:</strong> The <code>/api/v1/metrics</code> endpoint is protected and requires an authorized Bearer token or organizer credentials to prevent public telemetry leakage.
          </li>
        </ul>
      </div>
    </div>
  );
};
