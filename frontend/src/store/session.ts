export interface SessionUser {
  id: string
  email: string
  name: string
  role: string
  title?: string
  permissions?: string[] | Record<string, boolean>
  capabilities?: Record<string, boolean>
}

export type CapabilityKey =
  | 'addCandidates'
  | 'submitToClients'
  | 'scheduleInterviews'
  | 'exportReportsCsv'
  | 'viewTeamAnalytics'
  | 'reassignRequirements'
  | 'deleteRecords'

export function hasCapability(key: CapabilityKey, user?: SessionUser | null): boolean {
  const current = user !== undefined ? user : getSessionUser()
  if (!current) return false
  const roleCode = String(current.role || '').toLowerCase()

  // Super Admin & Dev Team have unrestricted access
  if (roleCode === 'superadmin' || roleCode === 'devteam') {
    return true
  }

  // Check explicit capability override set by Super Admin
  if (current.capabilities && typeof current.capabilities === 'object' && current.capabilities[key] !== undefined) {
    return Boolean(current.capabilities[key])
  }

  // Fallback defaults by role if no override was explicitly saved by Super Admin
  const isSuperOrAdmin = roleCode === 'superadmin' || roleCode === 'admin'
  const isLead = roleCode === 'lead' || roleCode === 'team lead'

  switch (key) {
    case 'addCandidates':
    case 'submitToClients':
    case 'scheduleInterviews':
      return roleCode !== 'client'
    case 'exportReportsCsv':
    case 'viewTeamAnalytics':
    case 'reassignRequirements':
      return isSuperOrAdmin || isLead
    case 'deleteRecords':
      return isSuperOrAdmin
    default:
      return false
  }
}

const TOKEN_KEY = 'metaforge_access_token'
const USER_KEY = 'metaforge_session_user'

let accessToken: string | null = typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null
let sessionUser: SessionUser | null = typeof window !== 'undefined' ? (() => {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
})() : null

export function getAccessToken(): string | null {
  if (!accessToken && typeof window !== 'undefined') {
    accessToken = localStorage.getItem(TOKEN_KEY)
  }
  return accessToken
}

export function setAccessToken(token: string | null): void {
  accessToken = token
  if (typeof window !== 'undefined') {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token)
    } else {
      localStorage.removeItem(TOKEN_KEY)
    }
  }
}

export function getSessionUser(): SessionUser | null {
  if (!sessionUser && typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(USER_KEY)
      sessionUser = raw ? JSON.parse(raw) : null
    } catch {
      sessionUser = null
    }
  }
  return sessionUser
}

export function setSessionUser(user: SessionUser | null): void {
  sessionUser = user
  if (typeof window !== 'undefined') {
    if (user) {
      localStorage.setItem(USER_KEY, JSON.stringify(user))
    } else {
      localStorage.removeItem(USER_KEY)
    }
  }
}

export function clearSession(): void {
  accessToken = null
  sessionUser = null
  if (typeof window !== 'undefined') {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  }
}
