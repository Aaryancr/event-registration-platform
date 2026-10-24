export type UserRole = 'attendee' | 'organizer';

export interface User {
  id: number;
  email: string;
  display_name: string;
  role: UserRole;
  created_at: string;
}

export type EventStatus = 'draft' | 'published' | 'cancelled';

export interface Event {
  id: number;
  organizer_id: number;
  title: string;
  description?: string | null;
  location: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  status: EventStatus;
  created_at: string;
}

export interface EventCreatePayload {
  title: string;
  description?: string;
  location: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
}

export type RegistrationStatus = 'registered' | 'cancelled';

export interface Registration {
  id: number;
  event_id: number;
  user_id: number;
  status: RegistrationStatus;
  created_at: string;
  event?: Event;
}

export type SeatHoldStatus = 'held' | 'converted' | 'released' | 'cancelled' | 'expired';

export interface SeatHold {
  id: number;
  event_id: number;
  user_id: number;
  status: SeatHoldStatus;
  expires_at: string;
  created_at: string;
}

export interface PaymentResponse {
  payment_id: number;
  provider_payment_id: string;
  status: string;
  amount: number;
  currency: string;
  hold_id: number;
  registration_id: number;
  ticket_code: string;
  message: string;
}

export type TicketStatus = 'valid' | 'used' | 'cancelled';

export interface Ticket {
  id: number;
  registration_id: number;
  event_id: number;
  user_id: number;
  ticket_code: string;
  qr_code_data?: string | null;
  status: TicketStatus;
  created_at: string;
  checked_in_at?: string | null;
  checked_in_by?: number | null;
}

export interface CheckInResponse {
  ticket_code: string;
  status: string;
  checked_in_at: string;
  event_id: number;
  event_title: string;
  attendee_name: string;
  message: string;
}

export type WaitlistStatus = 'waiting' | 'promoted' | 'cancelled';

export interface WaitlistEntry {
  id: number;
  event_id: number;
  user_id: number;
  status: WaitlistStatus;
  created_at: string;
  queue_position?: number;
}

export type CertificateStatus = 'pending' | 'generated' | 'failed';

export interface Certificate {
  id: number;
  event_id: number;
  user_id: number;
  registration_id: number;
  certificate_code: string;
  status: CertificateStatus;
  rendered_content?: string | null;
  issued_at?: string | null;
  created_at: string;
  error_message?: string | null;
}

export interface CertificateVerifyResponse {
  certificate_code: string;
  event_title: string;
  attendee_name: string;
  issued_at: string;
  verification_hash: string;
  valid: boolean;
}

export interface HealthResponse {
  status: string;
  service: string;
  version: string;
  environment: string;
}

export interface ReadinessResponse {
  status: 'ready' | 'unready';
  service: string;
  timestamp: string;
  checks: {
    database: string;
    redis: string;
  };
}

export interface MetricsSummary {
  http_requests_total: number;
  http_errors_total: number;
  registration_outcomes: Record<string, number>;
  seat_hold_outcomes: Record<string, number>;
  capacity_conflicts_total: number;
  checkin_outcomes: Record<string, number>;
  background_tasks: Record<string, number>;
}

export interface SeatUpdateMessage {
  type: 'CONNECTED' | 'SEAT_UPDATE' | 'PONG';
  event_id?: number;
  capacity?: number;
  occupied_seats?: number;
  available_seats?: number;
  timestamp: string;
}
