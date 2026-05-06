// ── Event types ───────────────────────────────────────────────────────────────
export type EventType = 'masterclass' | 'workshop' | 'retreat' | 'challenge' | 'openhouse' | 'special';
export type EventStatus = 'draft' | 'published' | 'cancelled' | 'completed';
export type RegistrationStatus = 'confirmed' | 'pending' | 'waitlist' | 'cancelled' | 'no_show';
export type EventPaymentMethod = 'transfer' | 'cash' | 'free';

export interface EventTypeInfo {
  value: EventType;
  label: string;
  iconName: 'star' | 'wrench' | 'leaf' | 'flame' | 'home' | 'sparkles';
  color: string;
}

export const EVENT_TYPES: EventTypeInfo[] = [
  { value: 'masterclass', label: 'Masterclass',        iconName: 'star',     color: '#8B5CF6' },
  { value: 'workshop',    label: 'Workshop / Taller',  iconName: 'wrench',   color: '#F59E0B' },
  { value: 'retreat',     label: 'Retiro',             iconName: 'leaf',     color: '#10B981' },
  { value: 'challenge',   label: 'Challenge / Reto',   iconName: 'flame',    color: '#EF4444' },
  { value: 'openhouse',   label: 'Open House',         iconName: 'home',     color: '#3B82F6' },
  { value: 'special',     label: 'Clase Especial',     iconName: 'sparkles', color: '#EC4899' },
];

export interface EventRegistration {
  id: string;
  userId?: string | null;
  name: string;
  email: string;
  phone: string;
  status: RegistrationStatus;
  amount: number;
  paymentMethod?: string | null;
  paymentReference?: string | null;
  hasPaymentProof?: boolean;
  paymentProofFileName?: string | null;
  transferDate?: string | null;
  paidAt?: string | null;
  checkedIn?: boolean;
  checkedInAt?: string | null;
  waitlistPosition?: number | null;
  notes?: string | null;
  eventPassId?: string | null;
  eventPassCode?: string | null;
  eventPassStatus?: "issued" | "used" | "cancelled" | null;
  eventPassIssuedAt?: string | null;
  eventPassUsedAt?: string | null;
  createdAt?: string;
}

export interface StudioEvent {
  id: string;
  title: string;
  description: string;
  type: EventType;
  instructor: string;
  instructorPhoto?: string | null;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  capacity: number;
  registered: number;
  price: number;
  currency?: string;
  earlyBirdPrice?: number | null;
  earlyBirdDeadline?: string | null;
  memberDiscount: number;
  image?: string | null;
  status: EventStatus;
  tags: string[];
  requirements: string;
  includes: string[];
  registrations: EventRegistration[];
  createdAt?: string;
  updatedAt?: string;
}

export interface ClientEvent {
  id: string;
  title: string;
  description: string;
  type: string;
  instructor: string;
  instructorPhoto: string | null;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  capacity: number;
  registered: number;
  price: number;
  earlyBirdPrice: number | null;
  earlyBirdDeadline: string | null;
  memberDiscount: number;
  image: string | null;
  status: string;
  tags: string[];
  requirements: string;
  includes: string[];
  myRegistration?: {
    id: string;
    status: string;
    amount: number;
    checkedIn: boolean;
    paymentMethod: string | null;
    paymentReference: string | null;
    hasPaymentProof: boolean;
    paymentProofFileName: string | null;
    transferDate: string | null;
    eventPassCode?: string | null;
    eventPassStatus?: "issued" | "used" | "cancelled" | null;
  } | null;
}
