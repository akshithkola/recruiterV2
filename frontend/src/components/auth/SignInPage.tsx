import React, { useState } from 'react'
import { KeyRound, Lock, Mail, ShieldCheck, ArrowLeft } from 'lucide-react'
import { Role } from '../../types'
import { SEED_ACCOUNTS } from '../../data/seedCredentials'
import { authenticate, requestLoginOtp, verifyLoginOtp } from '../../data/authService'
import { roleTheme } from '../../theme'
import { AuthCard, AuthShell } from './AuthShell'
import { AuthAlert, PasswordField, SubmitButton, TextField } from './AuthFormControls'
import { VerifyCodePage } from './VerifyCodePage'

interface SignInPageProps {
  /** Called with the authenticated role — wires into the existing App session flow. */
  onLogin: (role: Role) => void
  onForgot: (email?: string) => void
  onSignup: () => void
  /** Back to the landing page */
  onBack: () => void
}

type AuthMode = 'otp-email' | 'otp-verify' | 'password'

export function SignInPage({ onLogin, onForgot, onSignup, onBack }: SignInPageProps) {
  const [mode, setMode] = useState<AuthMode>('otp-email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [errors, setErrors] = useState<{ email?: string; password?: string; general?: string }>({})
  const [loading, setLoading] = useState(false)
  const [otpInfoMessage, setOtpInfoMessage] = useState('')

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrors({})
    setLoading(true)

    try {
      const res = await requestLoginOtp(email)
      setOtpInfoMessage(res.message || 'OTP sent to registered email')
      setMode('otp-verify')
    } catch (err) {
      setErrors({ general: err instanceof Error ? err.message : 'Failed to request OTP code.' })
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyOtp = async (code: string) => {
    setErrors({})
    const result = await verifyLoginOtp(email, code)
    if (!result.ok) {
      throw new Error(result.message)
    }
    onLogin(result.account.role)
  }

  const handleResendOtp = async () => {
    const res = await requestLoginOtp(email)
    setOtpInfoMessage(res.message || 'OTP code resent to registered email.')
  }

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrors({})
    setLoading(true)

    const result = await authenticate(email, password)
    if (!result.ok) {
      setErrors({ [result.field]: result.message })
      setLoading(false)
      return
    }

    const role = result.account.role
    window.setTimeout(() => {
      onLogin(role)
    }, 600)
  }

  if (mode === 'otp-verify') {
    return (
      <VerifyCodePage
        email={email}
        onVerified={handleVerifyOtp}
        onResend={handleResendOtp}
        onBack={() => setMode('otp-email')}
      />
    )
  }

  return (
    <AuthShell
      backLabel="Back to home"
      onBack={onBack}
      eyebrow="Secure Workspace Access"
      headline={
        <>
          Sign in to your
          <br />
          <span className="bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent">
            recruitment command centre.
          </span>
        </>
      }
      description="One sign-in for requirements, candidates, submissions, interviews and recruiter performance — scoped to your role the moment you land."
      bullets={[
        'Secure 4-digit corporate Email OTP verification',
        'Role-based access for Super Admin, Admin, Lead and Recruiter',
        'Every action captured in the platform audit trail',
      ]}
      aside={<DemoCredentialsPanel onPick={(e, p) => { setEmail(e); setPassword(p); setErrors({}); setMode('otp-email') }} />}
    >
      <AuthCard>
        <div className="flex items-center justify-between mb-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-blue-50 text-blue-700 text-[11px] font-bold font-mono tracking-wide">
            <ShieldCheck className="w-3.5 h-3.5" />
            MRAP Console
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            {mode === 'password' ? 'Password Auth' : 'Email OTP Auth'}
          </span>
        </div>

        <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight mb-1 font-sans">
          {mode === 'password' ? 'Password Sign In' : 'Welcome back'}
        </h2>
        <p className="text-xs text-slate-500 mb-5 font-normal leading-relaxed">
          {mode === 'password'
            ? 'Enter your work email and password to sign in.'
            : 'Enter your registered corporate email to receive a 4-digit login OTP.'}
        </p>

        {mode === 'otp-email' ? (
          <form onSubmit={handleRequestOtp} className="space-y-4" noValidate>
            <TextField
              label="Work Email Address"
              type="email"
              icon={Mail}
              value={email}
              onChange={v => {
                setEmail(v)
                setErrors(prev => ({ ...prev, email: undefined, general: undefined }))
              }}
              placeholder="registered@email.com"
              autoComplete="username"
              error={errors.email}
              disabled={loading}
            />

            {errors.general && <AuthAlert tone="error">{errors.general}</AuthAlert>}

            <SubmitButton loading={loading} loadingLabel="Sending 4-digit OTP via Graph…">
              Request Login OTP
            </SubmitButton>

            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => setMode('password')}
                className="text-xs text-blue-600 font-semibold hover:underline cursor-pointer"
              >
                Sign in with password instead →
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handlePasswordSubmit} className="space-y-4" noValidate>
            <TextField
              label="Work Email Address"
              type="email"
              icon={Mail}
              value={email}
              onChange={v => {
                setEmail(v)
                setErrors(prev => ({ ...prev, email: undefined, general: undefined }))
              }}
              placeholder="you@company.com"
              autoComplete="username"
              error={errors.email}
              disabled={loading}
            />

            <PasswordField
              label="Account Password"
              icon={Lock}
              value={password}
              onChange={v => {
                setPassword(v)
                setErrors(prev => ({ ...prev, password: undefined, general: undefined }))
              }}
              placeholder="Enter your password"
              autoComplete="current-password"
              error={errors.password}
              disabled={loading}
              action={
                <button
                  type="button"
                  onClick={() => onForgot(email)}
                  className="text-xs text-blue-600 font-semibold hover:underline cursor-pointer"
                >
                  Forgot password?
                </button>
              }
            />

            {errors.general && <AuthAlert tone="error">{errors.general}</AuthAlert>}

            <SubmitButton loading={loading} loadingLabel="Authenticating & loading workspace…">
              Sign In with Password
            </SubmitButton>

            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => setMode('otp-email')}
                className="text-xs text-blue-600 font-semibold hover:underline cursor-pointer"
              >
                ← Request Email OTP instead
              </button>
            </div>
          </form>
        )}

        <div className="mt-5 pt-4 border-t border-slate-200/80">
          <p className="text-center text-xs text-slate-500 font-normal">
            Don&apos;t have workspace access?{' '}
            <button type="button" onClick={onSignup} className="text-blue-600 font-semibold hover:underline cursor-pointer">
              Request an account →
            </button>
          </p>
        </div>
      </AuthCard>
    </AuthShell>
  )
}

/** Credential hints for the demo accounts, matching the existing RoleLoginPage pattern. */
function DemoCredentialsPanel({ onPick }: { onPick: (email: string, password: string) => void }) {
  const roles: Role[] = ['superadmin', 'admin', 'lead', 'recruiter']

  return (
    <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-3.5 shadow-xl">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 font-bold flex items-center gap-1.5">
          <KeyRound className="w-3 h-3 text-blue-400" /> Demo Credentials
        </span>
        <span className="text-[9px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
          Ready to Sign In
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {roles.map(r => {
          const acc = SEED_ACCOUNTS[r]
          return (
            <button
              key={r}
              type="button"
              onClick={() => onPick(acc.email, acc.password)}
              className="flex flex-col justify-center px-2.5 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.09] border border-white/5 hover:border-blue-500/30 transition-all text-left cursor-pointer group"
            >
              <div className="flex items-center justify-between gap-1 w-full">
                <span className="text-[11px] font-bold text-white truncate">{roleTheme[r].label}</span>
                <span className="text-[9px] font-mono text-slate-500 group-hover:text-blue-300">
                  Fill →
                </span>
              </div>
              <span className="text-[9px] font-mono text-blue-300 truncate w-full">{acc.email}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
