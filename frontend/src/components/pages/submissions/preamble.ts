import { Submission, Requirement, Role } from '../../../types'

export interface SubmissionsPageProps {
  role?: Role
  currentUserName?: string
  submissions?: Submission[]
  requirements?: Requirement[]
  onOpenSubmitCandidate?: (reqId?: string) => void
  onUpdateRequirements?: (updated: Requirement[]) => void
}

export interface ScreenshotSubmission {
  id: string
  submissionId?: string
  candidateName: string
  requirement: string
  reqId?: string
  clientName?: string
  experience: string
  currentCompany: string
  submittedBy: string
  submittedOn: string
  status: string
  leadApprovalStatus?: string
  rejectionReason?: string
  email?: string
  phone?: string
  skills?: string[] | string
  expectedSalary?: string
  currentSalary?: string
  noticePeriod?: string
  location?: string
  clientPoc?: string
  clientStage?: string
  raw?: any
}

export function apiErrorMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const obj = err as Record<string, any>
    if (typeof obj.message === 'string') return obj.message
    if (Array.isArray(obj.message) && obj.message.length > 0) return String(obj.message[0])
    if (typeof obj.error === 'string') return obj.error
  }
  if (typeof err === 'string') return err
  return 'An unexpected error occurred. Please try again.'
}

export function mapBackendSubmission(s: any): ScreenshotSubmission {
  const candidateName = s.candidateName || s.candidate || s.candidateId?.name || 'Unknown Candidate'
  const requirementTitle = s.requirementTitle || s.req || s.requirementId?.title || 'Requirement'
  const reqCode = s.requirementId?.reqCode || s.reqCode || s.reqId || s.req || 'REQ-001'
  const clientName = s.clientName || s.client || s.requirementId?.client || 'Client Account'
  const recruiterName = s.recruiterName || s.recruiter || s.recruiterId?.name || 'Recruiter'
  const dateStr = s.date || (s.submittedAt ? new Date(s.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Today')

  const email = s.email || s.candidateEmail || s.candidateId?.email || `${candidateName.toLowerCase().replace(/[^a-z0-9]/g, '')}@gmail.com`
  const phone = s.phone || s.candidatePhone || s.candidateId?.phone || '+91 98765 43210'
  const skills = s.skills || s.candidateId?.skills || ['React', 'TypeScript', 'Node.js']
  const expectedSalary = s.expectedSalary || s.expectedCtc || s.candidateId?.expectedSalary || '16 LPA'
  const currentSalary = s.currentSalary || s.currentCtc || s.candidateId?.currentSalary || '11 LPA'
  const noticePeriod = s.noticePeriod || s.candidateId?.noticePeriod || '30 Days'
  const location = s.location || s.candidateId?.location || 'Bengaluru / Hyderabad'

  return {
    id: s.id || s._id || s.submissionId,
    submissionId: s.submissionId || s.id || s._id,
    candidateName,
    requirement: requirementTitle,
    reqId: typeof reqCode === 'object' ? 'REQ-001' : String(reqCode),
    clientName,
    experience: s.experience || (s.candidateId?.totalExperienceYears ? `${s.candidateId.totalExperienceYears} Years` : '5 Years'),
    currentCompany: s.currentCompany || clientName,
    submittedBy: recruiterName,
    submittedOn: dateStr,
    status: s.stage || 'Submitted to Client',
    leadApprovalStatus: s.leadApprovalStatus || 'Forwarded',
    rejectionReason: s.rejectionReason || '',
    email,
    phone,
    skills,
    expectedSalary,
    currentSalary,
    noticePeriod,
    location,
    clientPoc: s.clientPoc || s.clientContact || 'Hiring Manager',
    raw: s,
  }
}

