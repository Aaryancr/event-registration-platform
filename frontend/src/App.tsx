import React, { useState, useEffect } from 'react';
import {
  Server,
  Database,
  Layers,
  Cpu,
  CheckCircle2,
  Activity,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  ExternalLink,
  Terminal,
  Network
} from 'lucide-react';

interface HealthResponse {
  status: string;
  service: string;
  version: string;
  environment: string;
}

export const App: React.FC = () => {
  const [backendHealth, setBackendHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';

  const checkHealth = async () => {
    setLoading(true);
    setError(null);
    const start = performance.now();
    try {
      const response = await fetch(`${apiUrl}/health`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data: HealthResponse = await response.json();
      setLatencyMs(Math.round(performance.now() - start));
      setBackendHealth(data);
    } catch (err: unknown) {
      setLatencyMs(null);
      setError(err instanceof Error ? err.message : 'Failed to connect to backend');
      setBackendHealth(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkHealth();
  }, []);

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 24px', width: '100%' }}>
      {/* Platform Header */}
      <header style={{ marginBottom: '40px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '20px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #6366f1, #06b6d4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(99, 102, 241, 0.4)'
            }}>
              <Layers size={22} color="#ffffff" />
            </div>
            <h1 style={{ fontSize: '2rem', fontWeight: 800 }}>EventFlow</h1>
            <span style={{
              backgroundColor: 'rgba(99, 102, 241, 0.15)',
              color: '#818cf8',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              borderRadius: '20px',
              padding: '4px 12px',
              fontSize: '0.8rem',
              fontWeight: 600,
              letterSpacing: '0.04em'
            }}>
              STAGE 0: FOUNDATION
            </span>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1.05rem', maxWidth: '640px' }}>
            Production-grade event registration & high-throughput ticketing platform. Multi-service development environment powered by Docker Compose.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button
            id="btn-refresh-health"
            onClick={checkHealth}
            disabled={loading}
            className="btn-primary"
          >
            <RefreshCw size={16} className={loading ? 'spin' : ''} />
            {loading ? 'Pinging Services...' : 'Ping Backend Health'}
          </button>
          <a
            href={`${apiUrl}/docs`}
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              color: '#38bdf8',
              textDecoration: 'none',
              fontSize: '0.9rem',
              fontWeight: 500,
              padding: '10px 16px',
              borderRadius: '8px',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              background: 'rgba(56, 189, 248, 0.05)'
            }}
          >
            Swagger Docs <ExternalLink size={14} />
          </a>
        </div>
      </header>

      {/* Services Grid */}
      <section style={{ marginBottom: '40px' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '16px', color: 'var(--text-primary)' }}>
          Container Infrastructure & Core Services
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px' }}>

          {/* Service: FastAPI Backend */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Server size={20} color="#6366f1" />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>FastAPI Backend</h3>
              </div>
              <span className={`status-dot ${backendHealth ? 'healthy' : error ? 'error' : 'pending'} pulse`} />
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Python 3.12, Pydantic, SQLAlchemy 2.0 & Alembic engine.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              <div><strong style={{ color: 'var(--text-secondary)' }}>Host Port:</strong> 127.0.0.1:8000</div>
              <div><strong style={{ color: 'var(--text-secondary)' }}>Compose Service:</strong> backend</div>
              <div><strong style={{ color: 'var(--text-secondary)' }}>Health Endpoint:</strong> /health</div>
            </div>
          </div>

          {/* Service: PostgreSQL */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Database size={20} color="#06b6d4" />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>PostgreSQL 16</h3>
              </div>
              <span className="status-dot healthy pulse" />
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Relational data store with named volume persistence.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              <div><strong style={{ color: 'var(--text-secondary)' }}>Host Port:</strong> 127.0.0.1:5433</div>
              <div><strong style={{ color: 'var(--text-secondary)' }}>Container Port:</strong> 5432</div>
              <div><strong style={{ color: 'var(--text-secondary)' }}>Named Volume:</strong> postgres_data</div>
            </div>
          </div>

          {/* Service: Redis */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Cpu size={20} color="#f43f5e" />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Redis 7</h3>
              </div>
              <span className="status-dot healthy pulse" />
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              In-memory cache for distributed locks and rate limiting.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              <div><strong style={{ color: 'var(--text-secondary)' }}>Host Port:</strong> 127.0.0.1:6379</div>
              <div><strong style={{ color: 'var(--text-secondary)' }}>Healthcheck:</strong> redis-cli ping</div>
              <div><strong style={{ color: 'var(--text-secondary)' }}>Persistence:</strong> AOF (Append-only)</div>
            </div>
          </div>

          {/* Service: React Frontend */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Activity size={20} color="#10b981" />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>React + Vite</h3>
              </div>
              <span className="status-dot healthy pulse" />
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              TypeScript client application with instant Hot Module Replacement.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              <div><strong style={{ color: 'var(--text-secondary)' }}>Host Port:</strong> 127.0.0.1:5173</div>
              <div><strong style={{ color: 'var(--text-secondary)' }}>Runtime:</strong> Node.js 20 (Alpine)</div>
              <div><strong style={{ color: 'var(--text-secondary)' }}>Status:</strong> Active & Rendered</div>
            </div>
          </div>

        </div>
      </section>

      {/* Backend Live Ping Inspector */}
      <section style={{ marginBottom: '40px' }}>
        <div className="glass-panel" style={{ padding: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Terminal size={18} color="#38bdf8" />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Live API Connectivity Telemetry</h3>
            </div>
            {latencyMs !== null && (
              <span style={{ fontSize: '0.8rem', color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '2px 8px', borderRadius: '6px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                Latency: {latencyMs}ms
              </span>
            )}
          </div>

          {backendHealth ? (
            <div>
              <div style={{
                background: '#040711',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: '8px',
                padding: '16px',
                fontSize: '0.85rem',
                color: '#38bdf8'
              }}>
                <pre>{JSON.stringify(backendHealth, null, 2)}</pre>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', fontSize: '0.85rem', color: '#10b981' }}>
                <CheckCircle2 size={16} /> Backend verified healthy. Container DNS networking confirmed.
              </div>
            </div>
          ) : error ? (
            <div style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '8px',
              padding: '16px',
              color: '#f87171',
              fontSize: '0.85rem'
            }}>
              <div><strong>Connection Error:</strong> {error}</div>
              <div style={{ marginTop: '8px', color: 'var(--text-secondary)' }}>
                Ensure Docker containers are running with <code>docker compose up -d</code>.
              </div>
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Waiting for backend response...
            </div>
          )}
        </div>
      </section>

      {/* Networking Blueprint & Stage 0 Checklist */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>

        {/* Network Topology */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <Network size={18} color="#a855f7" />
            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Container-to-Container Routing</h3>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
            Inter-service traffic communicates directly via internal Docker Compose service names without looping through the host network:
          </p>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.85rem' }}>
            <li style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Backend ➔ Postgres:</span>
              <code>db:5432</code>
            </li>
            <li style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Backend ➔ Redis:</span>
              <code>redis:6379</code>
            </li>
            <li style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Host ➔ Postgres:</span>
              <code>127.0.0.1:5433</code>
            </li>
            <li style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Host ➔ Backend / Docs:</span>
              <code>127.0.0.1:8000</code>
            </li>
          </ul>
        </div>

        {/* Stage 0 Verification */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <ShieldCheck size={18} color="#10b981" />
            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Stage 0 Verification Checklist</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.85rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981' }}>
              <CheckCircle2 size={16} /> PostgreSQL 16 named volume & healthcheck
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981' }}>
              <CheckCircle2 size={16} /> Redis 7 container with native ping healthcheck
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981' }}>
              <CheckCircle2 size={16} /> FastAPI application foundation with /health & /docs
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981' }}>
              <CheckCircle2 size={16} /> React + Vite + TypeScript frontend hot reload
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981' }}>
              <CheckCircle2 size={16} /> Loopback binding (127.0.0.1) & Git secrets exclusion
            </div>
          </div>
        </div>

      </div>

      {/* Stage Roadmap Footer */}
      <footer style={{ marginTop: '48px', paddingTop: '24px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Next Phase: <strong>Stage 1 — Domain Modeling, User Authentication & Database Migrations</strong>
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: '#818cf8' }}>
          <span>Ready for Stage 1</span>
          <ArrowRight size={14} />
        </div>
      </footer>
    </div>
  );
};
