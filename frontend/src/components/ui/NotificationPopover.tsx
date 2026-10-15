import React from 'react'
import { Bell, CheckCircle2, Clock, Calendar, UserCheck, AlertCircle, X, Check, Trash2, RefreshCw } from 'lucide-react'
import { NotificationItem } from '../../hooks/useNotificationSystem'

interface NotificationPopoverProps {
  isOpen: boolean
  onClose: () => void
  notifications: NotificationItem[]
  unreadCount: number
  loading: boolean
  errorMsg: string | null
  onRefresh: () => void
  onMarkAllAsRead: () => void
  onMarkRead: (id: string, read: boolean) => void
  onDelete: (id: string, wasUnread: boolean) => void
}

export function NotificationPopover({
  isOpen,
  onClose,
  notifications,
  unreadCount,
  loading,
  errorMsg,
  onRefresh,
  onMarkAllAsRead,
  onMarkRead,
  onDelete,
}: NotificationPopoverProps) {
  if (!isOpen) return null

  return (
    <div className="absolute right-0 top-12 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200/90 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900 text-white">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-blue-400" />
          <span className="font-sans font-bold text-sm">Activity Feed</span>
          {unreadCount > 0 && (
            <span className="bg-blue-600 text-white text-[10px] font-mono px-2 py-0.5 rounded-full font-bold">
              {unreadCount} new
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            title="Refresh"
            className="text-slate-400 hover:text-white p-1 rounded-lg"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="px-4 py-2 bg-red-50 text-red-700 text-xs font-medium border-b border-red-100 flex items-center justify-between">
          <span>{errorMsg}</span>
        </div>
      )}

      {/* List */}
      <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
        {loading && notifications.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs font-mono">
            Loading notifications...
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs font-mono">
            No notifications available
          </div>
        ) : (
          notifications.map(n => (
            <div
              key={n.id}
              onClick={() => onMarkRead(n.id, n.read)}
              className={`p-3.5 transition-colors flex items-start gap-3 cursor-pointer group ${
                n.read ? 'bg-white opacity-75' : 'bg-blue-50/40 hover:bg-blue-50/70'
              }`}
            >
              <div className="mt-0.5 flex-shrink-0">
                {n.type === 'interview' || n.type === 'interview_scheduled' ? (
                  <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                    <Calendar className="w-3.5 h-3.5" />
                  </div>
                ) : n.type === 'submission' || n.type === 'submission_approved' || n.type === 'lead_approval_requested' ? (
                  <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center">
                    <UserCheck className="w-3.5 h-3.5" />
                  </div>
                ) : n.type === 'placement' || n.type === 'offer_released' || n.type === 'candidate_placed' ? (
                  <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </div>
                ) : (
                  <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                    <AlertCircle className="w-3.5 h-3.5" />
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <p className="text-xs font-bold text-slate-900 font-sans truncate">{n.title}</p>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" /> {n.time}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onDelete(n.id, !n.read)
                      }}
                      title="Delete notification"
                      className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <p className="text-xs text-slate-600 font-body leading-relaxed">{n.message}</p>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="p-2.5 bg-slate-50 border-t border-slate-100 text-center">
        <span className="text-[11px] font-mono text-slate-500 font-medium">Real-time enterprise notifications active</span>
      </div>
    </div>
  )
}
