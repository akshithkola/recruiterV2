import React from 'react'
import { SubmitToLeadVm } from './useSubmitToLeadPage'
import { columnLabel, submissionIntroduction } from './trackerPresets.data'

export function SubmitToLeadReview({ vm }: { vm: SubmitToLeadVm }) {
  const {
    emailGreeting,
    setEmailGreeting,
    introduction,
    setIntroduction,
    submissionRole,
    setSubmissionRole,
    toRecipients,
    visibleColumns,
    trackerRows,
    headerColor,
  } = vm

  return (
    <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-2xs space-y-5">
      {/* 1. EMAIL GREETING */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-slate-700 font-extrabold text-xs">EMAIL GREETING</label>
          <button
            onClick={() => {
              if (toRecipients.length > 0) {
                const names = toRecipients.map(e => e.split('@')[0].split('.')[0]).map(n => n.charAt(0).toUpperCase() + n.slice(1))
                setEmailGreeting(`Dear ${names.join(', ')},`)
              } else {
                setEmailGreeting('Dear ,')
              }
            }}
            className="text-[11px] text-blue-600 font-bold hover:underline cursor-pointer"
          >
            Reset from To recipients
          </button>
        </div>
        <input
          type="text"
          value={emailGreeting || 'Dear ,'}
          onChange={e => setEmailGreeting(e.target.value)}
          className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-500 shadow-2xs"
        />
        <span className="text-[11px] text-slate-400 block">
          Uses the requirement sender or client POC when that name is available. Edit it before sending.
        </span>
      </div>

      <div className="space-y-1.5">
        <label className="text-slate-700 font-extrabold text-xs">ROLE</label>
        <input
          type="text"
          value={submissionRole}
          onChange={e => {
            setSubmissionRole(e.target.value)
            setIntroduction(submissionIntroduction(e.target.value))
          }}
          className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-500 shadow-2xs"
        />
      </div>

      {/* 2. INTRODUCTION */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-slate-700 font-extrabold text-xs">INTRODUCTION</label>
          <button
            onClick={() => setIntroduction(submissionIntroduction(submissionRole))}
            className="text-[11px] text-blue-600 font-bold hover:underline cursor-pointer"
          >
            Reset to default
          </button>
        </div>
        <textarea
          rows={5}
          value={introduction}
          onChange={e => setIntroduction(e.target.value)}
          className="w-full p-3.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-500 leading-relaxed shadow-2xs"
        />
      </div>

      {/* 3. PREVIEW BOX MATCHING SCREENSHOT 2 */}
      <div className="space-y-1.5">
        <label className="text-slate-700 font-extrabold text-xs block">PREVIEW</label>
        <div className="p-4 bg-slate-50/80 border border-slate-200 rounded-2xl text-xs text-slate-700 space-y-3 font-sans leading-relaxed">
          <p className="font-bold text-slate-900">{emailGreeting || 'Dear ,'}</p>
          <div className="whitespace-pre-line">{introduction}</div>
          <div className="overflow-x-auto bg-white rounded-xl border border-slate-200">
            <table className="w-full text-left border-collapse text-[10px]">
              <thead>
                <tr style={{ backgroundColor: headerColor }}>
                  {(visibleColumns || []).map((col: string, index: number) => (
                    <th key={`${col}-${index}`} className="p-1.5 border border-slate-300 font-extrabold text-slate-900">{columnLabel(col)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(trackerRows || []).map((row: Record<string, string>, rowIndex: number) => (
                  <tr key={rowIndex}>
                    {(visibleColumns || []).map((col: string, index: number) => (
                      <td key={`${col}-${index}`} className="p-1.5 border border-slate-200 text-slate-800">{row[col] || ''}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="pt-1">
            Thank you for your time and consideration.<br />
            We look forward to your feedback.
          </p>
        </div>
      </div>
    </div>
  )
}
