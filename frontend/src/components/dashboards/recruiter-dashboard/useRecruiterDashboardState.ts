import type { Props } from './preamble'
import { ActivityLogItem, Requirement } from '../../../types'
import { useEffect, useState } from 'react'
import React from 'react'
import { getSessionUser } from '../../../store/session'
import { usersService } from '../../../services/workspace.service'

export function useRecruiterDashboardState(props: Props) {
  const session = getSessionUser()
  const {
    candidates = [],
    submissions,
    interviews,
    requirements,
    activityLogs,
    currentUserName = session?.name || 'Recruiter',
    currentUserEmail = session?.email || '',
    onOpenSubmitCandidate,
    onOpenCandidateRepo,
    onOpenFeedbackModal,
    onOpenCandidateDetail,
    onAddActivityLog,
    onUpdateRequirements,
  }: Props = props as Props & Record<string, never>
  const [dbUsers, setDbUsers] = useState<any[]>([])
  const [isRevokeModalOpen, setIsRevokeModalOpen] = useState(false)

  useEffect(() => {
    usersService.list().then((data: any) => {
      const list = Array.isArray(data) ? data : data?.items || data?.data || []
      setDbUsers(list)
    }).catch(() => {})
  }, [])
  // Filter activity logs specifically performed by or relevant to the logged-in user/recruiter
  const userActivityLogs = React.useMemo(() => {
    const targetName = (currentUserName || session?.name || 'Recruiter').toLowerCase()
    const targetEmail = (currentUserEmail || session?.email || '').toLowerCase()

    // 1. Explicit activity logs matching user name or email
    const explicitLogs = (activityLogs || []).filter(log => {
      const matchName = log.userName && log.userName.toLowerCase().includes(targetName)
      const matchEmail = targetEmail && log.userEmail && log.userEmail.toLowerCase().includes(targetEmail)
      return matchName || matchEmail
    })

    // 2. Synthesize log items from candidate submissions performed by this recruiter
    const submissionLogs: ActivityLogItem[] = submissions
      .filter(s => !targetName || s.recruiter.toLowerCase().includes(targetName))
      .map(s => ({
        id: `sub-activity-${s.id}`,
        timestamp: s.date || 'Recently',
        userName: s.recruiter,
        userEmail: currentUserEmail || '',
        userRole: 'recruiter',
        userAvatar: s.recruiter.charAt(0).toUpperCase(),
        action: `Submitted candidate ${s.candidate} for ${s.req}`,
        category: 'Submissions',
        targetEntity: `Candidate ${s.candidate}`,
        targetId: s.id,
        clientName: s.client,
        ipAddress: '192.168.1.45',
        status: s.stage.toLowerCase().includes('reject') ? 'Warning' : 'Success',
        details: `Submitted to client ${s.client} | Current Stage: ${s.stage}`,
      }))

    // 3. Synthesize log items from interview tracking
    const interviewLogs: ActivityLogItem[] = interviews
      .filter(i => !targetName || (i.recruiter && i.recruiter.toLowerCase().includes(targetName)))
      .map(i => ({
        id: `iv-activity-${i.id}`,
        timestamp: i.date || 'Recently',
        userName: i.recruiter || currentUserName || 'Recruiter',
        userEmail: currentUserEmail || '',
        userRole: 'recruiter',
        userAvatar: (i.recruiter || currentUserName || 'R').charAt(0).toUpperCase(),
        action: `Scheduled interview (${i.stage || 'Round'}) for ${i.candidate}`,
        category: 'Interviews',
        targetEntity: `Interview with ${i.candidate}`,
        targetId: i.id,
        clientName: i.client || 'Client',
        ipAddress: '192.168.1.45',
        status: i.status === 'Passed' ? 'Success' : 'Warning',
        details: `Status: ${i.status} | Client: ${i.client || 'Partner'}`,
      }))

    // Combine and deduplicate
    const combined = [...explicitLogs, ...submissionLogs, ...interviewLogs]
    const seen = new Set<string>()
    return combined.filter(item => {
      const key = `${item.action}-${item.timestamp}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [activityLogs, submissions, interviews, currentUserName, currentUserEmail])
  const [selectedReqForDetail, setSelectedReqForDetail] = useState<Requirement | null>(null)
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false)
  const [isAssignMyselfChecked, setIsAssignMyselfChecked] = useState(true)
  const [selectedRecruiterNames, setSelectedRecruiterNames] = useState<Set<string>>(new Set())
  const [recruiterSearchQuery, setRecruiterSearchQuery] = useState('')

  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('Assigned')
  const [reqDateFilter, setReqDateFilter] = useState('All')
  const [reqCustomStartDate, setReqCustomStartDate] = useState('')
  const [reqCustomEndDate, setReqCustomEndDate] = useState('')
  const [selectedReqIds, setSelectedReqIds] = useState<Set<string>>(new Set())
  const [recentSubmissionsFilter, setRecentSubmissionsFilter] = useState('All Status')

  // Pagination state for active requirements table
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(5)

  // Inline View state for KPI cards (Assigned Requirements, Total Submissions, Interviews Handled, Onboarding)
  const [inlineView, setInlineView] = useState<'requirements' | 'submissions' | 'interviews' | 'onboarding' | null>(null)

  // Inline Candidate Repository & Submission workflow state (kept strictly inside My Work page)
  const [inlineReqId, setInlineReqId] = useState<string | null>(null)
  const [toastMsg, setToastMsg] = useState<string | null>(null)

  const showToast = (msg: string) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(null), 3500)
  }

  return {
    candidates,
    submissions,
    interviews,
    requirements,
    activityLogs,
    currentUserName,
    currentUserEmail,
    onOpenSubmitCandidate,
    onOpenCandidateRepo,
    onOpenFeedbackModal,
    onOpenCandidateDetail,
    onAddActivityLog,
    selectedReqForDetail,
    setSelectedReqForDetail,
    isAssignModalOpen,
    setIsAssignModalOpen,
    isAssignMyselfChecked,
    setIsAssignMyselfChecked,
    selectedRecruiterNames,
    setSelectedRecruiterNames,
    recruiterSearchQuery,
    setRecruiterSearchQuery,
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    reqDateFilter,
    setReqDateFilter,
    reqCustomStartDate,
    setReqCustomStartDate,
    reqCustomEndDate,
    setReqCustomEndDate,
    selectedReqIds,
    setSelectedReqIds,
    recentSubmissionsFilter,
    setRecentSubmissionsFilter,
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    inlineView,
    setInlineView,
    inlineReqId,
    setInlineReqId,
    toastMsg,
    setToastMsg,
    userActivityLogs,
    showToast,
    dbUsers,
    isRevokeModalOpen,
    setIsRevokeModalOpen,
    onUpdateRequirements,
  }
}
export type RecruiterDashboardVmState = ReturnType<typeof useRecruiterDashboardState>
