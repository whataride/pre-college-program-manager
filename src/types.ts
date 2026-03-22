export type Role = 'admin' | 'counselor';

export interface UserProfile {
  uid: string;
  email: string;
  role: Role;
  displayName?: string;
  photoURL?: string;
}

export interface Invitation {
  id: string;
  email: string;
  role: Role;
  invitedBy: string;
  createdAt: string;
}

export interface Program {
  id: string;
  name: string;
  institution: string;
  location?: string;
  category: string;
  deadline?: string;
  startDate?: string;
  endDate?: string;
  cost?: number;
  isResidential?: boolean;
  eligibility?: string;
  website?: string;
  selectivity?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
}

export const CATEGORIES = [
  'STEM',
  'Humanities',
  'Social Sciences',
  'Arts',
  'Business',
  'Pre-Med',
  'Pre-Law',
  'Leadership',
  'Community Service',
  'Other'
];
