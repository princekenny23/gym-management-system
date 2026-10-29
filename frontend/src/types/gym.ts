export type MemberStatus = "active" | "inactive";
export type PlanStatus = "active" | "inactive";
export type MembershipStatus = "active" | "expired" | "pending" | "expiring-soon";
export type PaymentMethod = "Cash" | "Bank transfer" | "Mobile money";
export type PaymentStatus = "paid" | "partial" | "unpaid";
export type UserRole = "administrator" | "receptionist" | "member";

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isActive: boolean;
  memberId?: string;
  gymName?: string;
  logoText?: string;
}

export interface Member {
  id: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  emergencyContact: string;
  notes?: string;
  status: MemberStatus;
  isArchived?: boolean;
  joinedAt: string;
  initials: string;
}

export interface MembershipPlan {
  id: string;
  name: string;
  description: string;
  durationDays: number;
  price: number;
  cadence: "Daily" | "Weekly" | "Monthly" | "Quarterly" | "Annual" | "Custom";
  status: PlanStatus;
}

export interface Membership {
  id: string;
  memberId: string;
  memberName: string;
  planId: string;
  planName: string;
  startDate: string;
  endDate: string;
  status: MembershipStatus;
  paymentStatus: PaymentStatus;
  amountPaid: number;
  amountDue: number;
  isArchived?: boolean;
  accessApproved?: boolean;
  approvedBy?: string | null;
  approvedAt?: string | null;
}

export interface Payment {
  id: string;
  membershipId?: string;
  correctionOf?: string;
  memberId: string;
  memberName: string;
  planName: string;
  date: string;
  amount: number;
  method: PaymentMethod;
  reference?: string;
  status: "cleared" | "pending";
  type: "membership" | "correction" | "top-up";
  note?: string;
}

export interface AttendanceRecord {
  id: string;
  memberId: string;
  memberName: string;
  checkedInAt: string;
  status: "checked-in" | "duplicate";
}

export interface GymSettings {
  gymName: string;
  address: string;
  phone: string;
  email: string;
  currency: string;
  primaryColor: string;
  receiptFooter: string;
  expiryWarningDays: number;
  duplicateCheckInMinutes: number;
  logoText: string;
}

export interface RevenuePoint {
  label: string;
  revenue: number;
}

export interface AttendancePoint {
  label: string;
  count: number;
}
