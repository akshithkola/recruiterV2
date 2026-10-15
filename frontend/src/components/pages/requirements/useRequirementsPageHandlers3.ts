import { useMemo, useState } from 'react'
import { Requirement } from '../../../types'
import type { RequirementsVmState } from './useRequirementsPageState'

export function getRequirementTimestamp(r: Requirement): number {
  const rawDate = (r as any).emailArrivedTimeRaw || r.emailArrivedTime || (r as any).createdAt || (r as any).updatedAt || r.dueDate
  if (rawDate) {
    const t = new Date(rawDate).getTime()
    if (!isNaN(t) && t > 0) return t
  }
  const idMatch = (r.id || '').match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/)
  if (idMatch) {
    const d = new Date(`${idMatch[1]}-${idMatch[2].padStart(2, '0')}-${idMatch[3].padStart(2, '0')}`).getTime()
    if (!isNaN(d)) return d
  }
  return 0
}

export function parseRequirementCode(req: Requirement) {
  const code = (req.reqCode || req.id || '').trim()
  const m = code.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})-(\d+)/)
  if (m) {
    const dateNum = parseInt(`${m[1]}${m[2].padStart(2, '0')}${m[3].padStart(2, '0')}`, 10)
    const seqNum = parseInt(m[4], 10)
    return { hasCode: true, dateNum, seqNum }
  }
  return { hasCode: false, dateNum: 0, seqNum: 0 }
}

/** Original creation time of the canonical requirement (never its last update). */
export function getRequirementCreatedTime(r: Requirement): number {
  const raw = (r as any).firstDetectedAt || (r as any).first_detected_at || (r as any).createdAt
  const t = raw ? new Date(raw).getTime() : NaN
  return !isNaN(t) && t > 0 ? t : getRequirementTimestamp(r)
}

/**
 * Default list order, identical to the backend: newest original creation time first,
 * then database insertion order (_id). Updates, holds and reopens never move a requirement.
 */
export function compareRequirementsDescending(a: Requirement, b: Requirement): number {
  const diff = getRequirementCreatedTime(b) - getRequirementCreatedTime(a)
  if (diff !== 0) return diff
  const idA = String((a as any)._id || '')
  const idB = String((b as any)._id || '')
  if (idA !== idB) return idB.localeCompare(idA)
  return (b.reqCode || b.id || '').localeCompare(a.reqCode || a.id || '')
}

export function useRequirementsPageHandlers3(s: RequirementsVmState) {
  const {
    role, localRequirements,
    globalSearch, setGlobalSearch, statusDropdown, setStatusDropdown,
    clientDropdown, setClientDropdown, dateFilter, customStartDate, customEndDate,
    activeCardFilter, setActiveCardFilter,
    selectedReqIds, setSelectedReqIds,
    sortField = 'reqId', sortOrder = 'desc',
  } = s

  const filteredRequirements = useMemo(() => {
    const list = localRequirements.filter(r => {
      // Date filter
      if (dateFilter && dateFilter !== 'All') {
        const rawDate = r.emailArrivedTime || r.dueDate || (r as any).createdAt || ''
        if (!rawDate) return false
        const d = new Date(rawDate)
        if (isNaN(d.getTime())) return false

        const now = new Date()
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)

        if (dateFilter === 'Today') {
          if (d < startOfToday || d > endOfToday) return false
        } else if (dateFilter === 'Yesterday') {
          const startOfYesterday = new Date(startOfToday.getTime() - 86400000)
          const endOfYesterday = new Date(endOfToday.getTime() - 86400000)
          if (d < startOfYesterday || d > endOfYesterday) return false
        } else if (dateFilter === 'This week') {
          const day = (now.getDay() + 6) % 7
          const startOfWeek = new Date(startOfToday.getTime() - day * 86400000)
          if (d < startOfWeek || d > endOfToday) return false
        } else if (dateFilter === 'This month') {
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
          if (d < startOfMonth || d > endOfToday) return false
        } else if (dateFilter === 'Custom range') {
          if (customStartDate) {
            const start = new Date(`${customStartDate}T00:00:00`)
            if (d < start) return false
          }
          if (customEndDate) {
            const end = new Date(`${customEndDate}T23:59:59.999`)
            if (d > end) return false
          }
        }
      }

      if (globalSearch.trim()) {
        const query = globalSearch.trim().toLowerCase()
        const matchId = r.id.toLowerCase().includes(query)
        const matchClient = r.client.toLowerCase().includes(query)
        const matchTitle = r.title.toLowerCase().includes(query)
        const matchLocation = (r.location || '').toLowerCase().includes(query)
        const matchOwner = (r.owner || '').toLowerCase().includes(query)
        const matchEmail = (r.clientEmail || '').toLowerCase().includes(query)
        const matchLead = (r.assignedLead || '').toLowerCase().includes(query)
        const matchSkills = (r.skills || []).some(skill => skill.toLowerCase().includes(query))

        if (!matchId && !matchClient && !matchTitle && !matchLocation && !matchOwner && !matchEmail && !matchLead && !matchSkills) {
          return false
        }
      }

      if (clientDropdown !== 'All') {
        if (r.client !== clientDropdown) return false
      }

      if (statusDropdown !== 'All') {
        if (statusDropdown === 'Unassigned') {
          if (r.owner && r.owner !== 'Unassigned' && r.assignmentStatus !== 'Unassigned') return false
        } else if (statusDropdown === 'Assigned') {
          if (!r.owner || r.owner === 'Unassigned' || r.assignmentStatus === 'Unassigned') return false
        } else if (statusDropdown === 'Submitted' || statusDropdown === 'Submitted to Lead' || statusDropdown === 'Submitted to Client') {
          if ((r.submissions || 0) === 0) return false
        } else if (statusDropdown === 'Interview') {
          if ((r.interviews || 0) === 0) return false
        } else if (statusDropdown === 'Selected') {
          if ((r.placed || r.selections || 0) === 0) return false
        } else if (statusDropdown === 'Rejected') {
          if ((r.rejections || 0) === 0) return false
        } else if (statusDropdown === 'Closed') {
          if (r.status !== 'Closed' && r.assignmentStatus !== 'Closed') return false
        } else if (statusDropdown === 'Custom') {
          if (r.status === 'Closed' || r.assignmentStatus === 'Closed') return false
        }
      }

      if (activeCardFilter === 'UNASSIGNED') {
        return !r.owner || r.owner === 'Unassigned'
      } else if (activeCardFilter === 'ASSIGNED') {
        return r.owner && r.owner !== 'Unassigned'
      } else if (activeCardFilter === 'IN_PROGRESS') {
        return r.status === 'Active' || r.assignmentStatus === 'In Progress'
      } else if (activeCardFilter === 'SUBMISSIONS') {
        return r.submissions > 0
      } else if (activeCardFilter === 'INTERVIEWS') {
        return r.interviews > 0
      } else if (activeCardFilter === 'SELECTIONS') {
        return (r.placed || r.selections || 0) > 0
      } else if (activeCardFilter === 'REJECTIONS') {
        return (r.rejections || 0) > 0
      }

      return true
    })

    // Dynamic sorting: default to Requirement ID descending (highest sequence first)
    const mult = sortOrder === 'asc' ? -1 : 1
    return [...list].sort((a, b) => {
      if (sortField === 'reqId') {
        return compareRequirementsDescending(a, b) * mult
      } else if (sortField === 'client') {
        const cA = a.client || ''
        const cB = b.client || ''
        const comp = cA.localeCompare(cB)
        if (comp !== 0) return comp * (sortOrder === 'asc' ? 1 : -1)
        return compareRequirementsDescending(a, b) * mult
      } else if (sortField === 'role') {
        const rA = a.title || ''
        const rB = b.title || ''
        const comp = rA.localeCompare(rB)
        if (comp !== 0) return comp * (sortOrder === 'asc' ? 1 : -1)
        return compareRequirementsDescending(a, b) * mult
      } else if (sortField === 'arrivedTime') {
        const timeA = getRequirementTimestamp(a)
        const timeB = getRequirementTimestamp(b)
        if (timeB !== timeA) return (timeB - timeA) * mult
        return compareRequirementsDescending(a, b) * mult
      }
      return compareRequirementsDescending(a, b) * mult
    })
  }, [localRequirements, globalSearch, statusDropdown, clientDropdown, dateFilter, customStartDate, customEndDate, activeCardFilter, sortField, sortOrder])

  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(5)

  const paginatedRequirements = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredRequirements.slice(start, start + pageSize)
  }, [filteredRequirements, currentPage, pageSize])

  const selectablePaginatedReqs = useMemo(() => {
    return paginatedRequirements.filter(r => r.status !== 'Hold' && r.status !== 'On Hold')
  }, [paginatedRequirements])

  const isAllSelected =
    selectablePaginatedReqs.length > 0 &&
    selectablePaginatedReqs.every(r => selectedReqIds.has(r.id))

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedReqIds(new Set())
    } else {
      setSelectedReqIds(new Set(selectablePaginatedReqs.map(r => r.id)))
    }
  }

  const toggleSelectRow = (id: string) => {
    const target = localRequirements.find(r => r.id === id)
    if (target && (target.status === 'Hold' || target.status === 'On Hold')) {
      return
    }
    const next = new Set(selectedReqIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedReqIds(next)
  }

  const handleResetFilters = () => {
    setGlobalSearch('')
    setStatusDropdown('Unassigned')
    setClientDropdown('All')
    setActiveCardFilter('ALL')
  }

  const roleLabel =
    role === 'superadmin' || role === 'devteam'
      ? 'Super Admin View'
      : role === 'admin'
        ? 'Admin View'
        : role === 'lead'
          ? 'Team Lead View'
          : 'Recruiter View'

  const [isEditingDemand, setIsEditingDemand] = useState(false)
  const [editingReq, setEditingReq] = useState<Requirement | null>(null)

  const pendingRevokeRequests = useMemo(() => {
    return localRequirements.filter(r => r.revokeRequested)
  }, [localRequirements])

  return {
    filteredRequirements, currentPage, setCurrentPage, pageSize, setPageSize,
    paginatedRequirements, isAllSelected, toggleSelectAll, toggleSelectRow, handleResetFilters,
    roleLabel, isEditingDemand, setIsEditingDemand, editingReq, setEditingReq, pendingRevokeRequests
  }
}
