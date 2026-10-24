import {
  User,
  Event,
  EventCreatePayload,
  Registration,
  SeatHold,
  PaymentResponse,
  Ticket,
  CheckInResponse,
  WaitlistEntry,
  Certificate,
  CertificateVerifyResponse,
  HealthResponse,
  ReadinessResponse,
  MetricsSummary,
} from '../types';

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, message: string, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const API_V1 = `${API_BASE_URL}/api/v1`;

function getAuthHeader(): Record<string, string> {
  const token = sessionStorage.getItem('eventflow_token');
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}

function generateIdempotencyKey(): string {
  // Generate RFC4122 v4 UUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function request<T>(
  url: string,
  options: RequestInit = {},
  useIdempotency = false,
): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');

  // Inject authentication header if available
  const authHeaders = getAuthHeader();
  for (const [key, val] of Object.entries(authHeaders)) {
    headers.set(key, val);
  }

  // Inject Idempotency-Key on state-mutating requests (POST, PUT, PATCH, DELETE)
  if (useIdempotency && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(options.method?.toUpperCase() || '')) {
    if (!headers.has('Idempotency-Key')) {
      headers.set('Idempotency-Key', generateIdempotencyKey());
    }
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorDetail = response.statusText;
    let errorData = null;
    try {
      const parsed = await response.json();
      errorData = parsed;
      if (parsed.detail) {
        errorDetail = typeof parsed.detail === 'string' ? parsed.detail : JSON.stringify(parsed.detail);
      }
    } catch {
      // Body not JSON
    }
    throw new ApiError(response.status, errorDetail, errorData);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

export const api = {
  // Authentication
  auth: {
    login: async (email: string, password: string):Promise<{ access_token: string; token_type: string }> => {
      return request<{ access_token: string; token_type: string }>(`${API_V1}/auth/login`, {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
    },
    register: async (email: string, password: string, display_name: string, role: string): Promise<User> => {
      return request<User>(`${API_V1}/auth/register`, {
        method: 'POST',
        body: JSON.stringify({ email, password, display_name, role }),
      });
    },
    me: async (): Promise<User> => {
      return request<User>(`${API_V1}/auth/me`);
    },
  },

  // Events
  events: {
    list: async (skip = 0, limit = 20): Promise<Event[]> => {
      return request<Event[]>(`${API_V1}/events?skip=${skip}&limit=${limit}`);
    },
    get: async (id: number): Promise<Event> => {
      return request<Event>(`${API_V1}/events/${id}`);
    },
    create: async (payload: EventCreatePayload): Promise<Event> => {
      return request<Event>(`${API_V1}/events`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }, true);
    },
    update: async (id: number, payload: Partial<EventCreatePayload & { status: string }>): Promise<Event> => {
      return request<Event>(`${API_V1}/events/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
    },
    listMine: async (): Promise<Event[]> => {
      return request<Event[]>(`${API_V1}/events/mine`);
    },
  },

  // Registrations
  registrations: {
    register: async (eventId: number): Promise<Registration> => {
      return request<Registration>(`${API_V1}/events/${eventId}/registrations`, {
        method: 'POST',
        body: JSON.stringify({}),
      }, true);
    },
    cancel: async (eventId: number): Promise<{ message: string; promoted: boolean; promoted_user_id?: number }> => {
      return request<{ message: string; promoted: boolean; promoted_user_id?: number }>(
        `${API_V1}/events/${eventId}/registrations/cancel`,
        {
          method: 'POST',
        },
        true,
      );
    },
    listMine: async (): Promise<Registration[]> => {
      return request<Registration[]>(`${API_V1}/registrations/mine`);
    },
  },

  // Seat Holds & Mock Payments
  holds: {
    create: async (eventId: number, ttlMinutes = 10): Promise<SeatHold> => {
      return request<SeatHold>(`${API_V1}/events/${eventId}/holds`, {
        method: 'POST',
        body: JSON.stringify({ ttl_minutes: ttlMinutes }),
      }, true);
    },
    pay: async (holdId: number, amount = 10.0, simulateFailure = false): Promise<PaymentResponse> => {
      return request<PaymentResponse>(`${API_V1}/holds/${holdId}/pay`, {
        method: 'POST',
        body: JSON.stringify({ amount, currency: 'USD', simulate_failure: simulateFailure }),
      }, true);
    },
    cancel: async (holdId: number): Promise<{ message: string }> => {
      return request<{ message: string }>(`${API_V1}/holds/${holdId}/cancel`, {
        method: 'POST',
      });
    },
    listMine: async (): Promise<SeatHold[]> => {
      return request<SeatHold[]>(`${API_V1}/holds/mine`);
    },
  },

  // Waitlist
  waitlist: {
    join: async (eventId: number): Promise<WaitlistEntry> => {
      return request<WaitlistEntry>(`${API_V1}/events/${eventId}/waitlist`, {
        method: 'POST',
      }, true);
    },
    getMine: async (eventId: number): Promise<WaitlistEntry> => {
      return request<WaitlistEntry>(`${API_V1}/events/${eventId}/waitlist/mine`);
    },
    leave: async (eventId: number): Promise<{ message: string }> => {
      return request<{ message: string }>(`${API_V1}/events/${eventId}/waitlist`, {
        method: 'DELETE',
      });
    },
  },

  // Digital Tickets & Check-in
  tickets: {
    getTicket: async (registrationId: number): Promise<Ticket> => {
      return request<Ticket>(`${API_V1}/registrations/${registrationId}/ticket`);
    },
    checkIn: async (ticketCode: string): Promise<CheckInResponse> => {
      return request<CheckInResponse>(`${API_V1}/tickets/check-in`, {
        method: 'POST',
        body: JSON.stringify({ ticket_code: ticketCode }),
      });
    },
  },

  // Certificates
  certificates: {
    issue: async (eventId: number): Promise<{ message: string; count: number }> => {
      return request<{ message: string; count: number }>(`${API_V1}/events/${eventId}/certificates/issue`, {
        method: 'POST',
      });
    },
    listMine: async (): Promise<Certificate[]> => {
      return request<Certificate[]>(`${API_V1}/certificates/mine`);
    },
    verify: async (code: string): Promise<CertificateVerifyResponse> => {
      return request<CertificateVerifyResponse>(`${API_V1}/certificates/verify/${code}`);
    },
  },

  // Observability & Operations
  observability: {
    getHealth: async (): Promise<HealthResponse> => {
      return request<HealthResponse>(`${API_BASE_URL}/health`);
    },
    getReadiness: async (): Promise<ReadinessResponse> => {
      return request<ReadinessResponse>(`${API_BASE_URL}/ready`);
    },
    getMetricsSummary: async (): Promise<MetricsSummary> => {
      return request<MetricsSummary>(`${API_V1}/metrics/summary`);
    },
  },
};
