import React, { useMemo } from 'react'
import { ActiveReqRow } from './preamble'
import type { RecruiterDashboardVmState } from './useRecruiterDashboardState'
import { workspaceService } from '../../../services/workspace.service'
import { getSessionUser } from '../../../store/session'
import { Requirement } from '../../../types'

export function useRecruiterDashboardHandlers(s: RecruiterDashboardVmState) {
  const {
    submissions, interviews, requirements, selectedReqForDetail,
    setSelectedReqForDetail, setIsAssignModalOpen, isAssignMyselfChecked, setIsAssignMyselfChecked,
    selectedRecruiterNames, setSelectedRecruiterNames, recruiterSearchQuery, setRecruiterSearchQuery,
    setInlineReqId, searchQuery, statusFilter, reqDateFilter, reqCustomStartDate, reqCustomEndDate, currentPage, pageSize, recentSubmissionsFilter,
    currentUserName, currentUserEmail, dbUsers, showToast, onUpdateRequirements, onAddActivityLog,
    setIsRevokeModalOpen,
  } = s

  const handleOpenInlineCandidateRepo = (reqId: string) => {
    setInlineReqId(reqId)
    setTimeout(() => {
      const el = document.getElementById('inline-candidate-repo-section')
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }, 100)
  }

  const handleOpenReqOverview = (reqId: string, reqName?: string, reqClient?: string) => {
    const found = requirements.find(r => r.id === reqId) || {
      id: reqId,
      client: reqClient || 'harish',
      title: reqName || 'Implement and support SAP Transportation Management solutions in S 4HANA',
      priority: 'Medium' as const,
      status: 'Active' as const,
      assignmentStatus: 'Assigned' as const,
      owner: 'Harish Gadipally',
      submissions: 7,
      interviews: 0,
      placed: 0,
      rejections: 0,
      clientEmail: reqClient || 'harish',
      clientPhone: '+91 98765 43210',
      location: 'Remote, Hybrid, Onsite',
      openings: 1,
      dueDate: '2026-06-19',
      emailArrivedTime: 'Jun 19, 2026, 05:30 AM',
      budget: '₹5,000,000',
    }
    setSelectedReqForDetail(found)
  }

  const recruiterList = useMemo(() => {
    return (dbUsers || [])
      .filter(u => u && !u.deletedAt && u.active !== false)
      .filter(u => String(u.role || '').toLowerCase() === 'recruiter')
      .filter(u => u.name && (u.id || u._id))
      .map(u => ({
        id: String(u.id || u._id),
        name: String(u.name),
        email: u.email || '',
      }))
      .filter(r => r.name.toLowerCase() !== (currentUserName || '').toLowerCase())
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [dbUsers, currentUserName])

  const filteredRecruiterList = recruiterList.filter(
    r =>
      !recruiterSearchQuery.trim() ||
      r.name.toLowerCase().includes(recruiterSearchQuery.toLowerCase()) ||
      r.email.toLowerCase().includes(recruiterSearchQuery.toLowerCase())
  )

  const totalSelectedRecruitersCount = (isAssignMyselfChecked ? 1 : 0) + selectedRecruiterNames.size

  const toggleRecruiterSelection = (name: string) => {
    const next = new Set(selectedRecruiterNames)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    setSelectedRecruiterNames(next)
  }

  const handleConfirmReassign = async () => {
    const session = getSessionUser()
    const activeName = currentUserName || session?.name || 'Recruiter'
    if (totalSelectedRecruitersCount === 0 || !selectedReqForDetail) return

    const selectedOthers = recruiterList.filter(r => selectedRecruiterNames.has(r.name))
    const recruiterIds: string[] = []
    const ownerNames: string[] = []

    if (isAssignMyselfChecked) {
      recruiterIds.push(session?.id || activeName)
      ownerNames.push(activeName)
    }
    for (const rec of selectedOthers) {
      recruiterIds.push(rec.id)
      ownerNames.push(rec.name)
    }

    const reqKey = selectedReqForDetail._id || selectedReqForDetail.id
    try {
      await workspaceService.assignRequirement(reqKey, { recruiterIds })
    } catch (err: any) {
      console.error('Failed to reassign requirement:', err)
      showToast(err?.message || 'Failed to reassign requirement')
      return
    }

    const nowIso = new Date().toISOString()
    const ownersText = ownerNames.join(', ')
    const updatedReq: Requirement = {
      ...selectedReqForDetail,
      owner: ownersText,
      assignmentStatus: 'Assigned',
      status: 'Assigned',
      submissions: selectedReqForDetail.submissions || 0,
      updatedAt: nowIso,
    }

    const nextRequirements = requirements.map(r =>
      r.id === selectedReqForDetail.id || r._id === selectedReqForDetail._id ? updatedReq : r
    )
    onUpdateRequirements?.(nextRequirements)

    if (isAssignMyselfChecked) {
      setSelectedReqForDetail(updatedReq)
    } else {
      setSelectedReqForDetail(null)
    }

    showToast(
      isAssignMyselfChecked
        ? `Requirement reassigned to ${ownersText}.`
        : `Requirement reassigned to ${ownersText}. It left your My Work list.`
    )

    setIsAssignModalOpen(false)
    setSelectedRecruiterNames(new Set())
    setIsAssignMyselfChecked(true)
    setRecruiterSearchQuery('')
  }

  const handleConfirmRevoke = async (reqId: string, reason: string) => {
    const target = selectedReqForDetail?.id === reqId || selectedReqForDetail?._id === reqId
      ? selectedReqForDetail
      : requirements.find(r => r.id === reqId || r._id === reqId)
    if (!target) return

    const reqKey = target._id || target.id
    try {
      await workspaceService.revokeRequirement(reqKey, { reason })
    } catch (err: any) {
      console.error('Failed to revoke requirement:', err)
      showToast(err?.message || 'Failed to submit revoke request')
      return
    }

    const updatedReq: Requirement = {
      ...target,
      status: 'On Hold',
      revokeRequested: true,
      revokeReason: reason,
      revokeRequestedBy: currentUserName,
      revokeRequestedAt: 'Just now',
    }
    const nextRequirements = requirements.map(r =>
      r.id === target.id || r._id === target._id ? updatedReq : r
    )
    onUpdateRequirements?.(nextRequirements)
    setSelectedReqForDetail(updatedReq)
    setIsRevokeModalOpen(false)
    showToast('Revoke request submitted. Requirement is On Hold pending approval.')

    onAddActivityLog?.({
      id: `LOG-${Date.now()}`,
      timestamp: 'Just now',
      userName: currentUserName,
      userEmail: currentUserEmail || '',
      userRole: 'recruiter',
      userAvatar: currentUserName.charAt(0),
      action: `Requested Revoke Permission for Requirement ${target.id}`,
      category: 'Requirements',
      targetEntity: `Requirement ${target.id}`,
      targetId: target.id,
      clientName: target.client,
      ipAddress: '192.168.1.45',
      status: 'Warning',
      details: `Reason for revoke request: ${reason}. Pending approval from Team Lead / Admin.`,
    })
  }

  const assignedToMe = (owner?: string) => {
    const me = (currentUserName || '').trim().toLowerCase()
    if (!me) return false
    return (owner || '')
      .split(',')
      .map(name => name.trim().toLowerCase())
      .includes(me)
  }

  const assignedRequirements = [...requirements]
    .filter(r => r.assignmentStatus !== 'Unassigned' && assignedToMe(r.owner))
    .sort((a, b) => {
      const rawDateA = (a as any).updatedAt || a.emailArrivedTime || (a as any).createdAt || a.dueDate
      const rawDateB = (b as any).updatedAt || b.emailArrivedTime || (b as any).createdAt || b.dueDate
      const timeA = rawDateA ? new Date(rawDateA).getTime() || 0 : 0
      const timeB = rawDateB ? new Date(rawDateB).getTime() || 0 : 0
      if (timeB !== timeA) return timeB - timeA
      return (b.id || '').localeCompare(a.id || '')
    })

  const activeReqRows: ActiveReqRow[] = assignedRequirements
    .map(r => ({
      type: 'Requirement',
      id: r.id,
      name: r.title,
      client: r.client,
      status: r.status,
      timestamp: r.emailArrivedTime || r.dueDate || '',
    }))

  const filteredReqs = assignedRequirements.filter(req => {
    const q = searchQuery.trim().toLowerCase()
    const matchesQuery =
      !q ||
      req.title.toLowerCase().includes(q) ||
      req.client.toLowerCase().includes(q) ||
      (req.id || '').toLowerCase().includes(q)
    const filterLower = statusFilter.toLowerCase()
    let matchesStatus = true
    if (filterLower === 'assigned') {
      matchesStatus = req.status.toLowerCase().includes('assign') || req.status.toLowerCase() === 'active' || req.status.toLowerCase() === 'open'
    } else if (filterLower === 'submitted') {
      matchesStatus = req.status.toLowerCase().includes('submit')
    } else if (filterLower === 'selected for interview') {
      matchesStatus = req.status.toLowerCase().includes('interview') || req.status.toLowerCase() === 'select'
    }
    return matchesQuery && matchesStatus
  })

  const paginatedReqs = filteredReqs.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  const filteredSubmissions = submissions.filter(sub => {
    if (recentSubmissionsFilter === 'All Status' || recentSubmissionsFilter === 'All') return true
    return sub.stage.toLowerCase() === recentSubmissionsFilter.toLowerCase()
  })

  return {
    handleOpenInlineCandidateRepo, handleOpenReqOverview, recruiterList, filteredRecruiterList,
    totalSelectedRecruitersCount, toggleRecruiterSelection, handleConfirmReassign, handleConfirmRevoke,
    assignedRequirements, activeReqRows, filteredReqs, paginatedReqs, filteredSubmissions
  }
}
