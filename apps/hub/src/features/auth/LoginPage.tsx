import { useEffect, useState, type FormEvent } from 'react'
import { AlertTriangle, Clock } from 'lucide-react'
import { useAuth } from '@/providers/AuthProvider'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { ApiError, warmApi } from '@/lib/api'
import { asset } from '@/lib/utils'

export function LoginPage() {
  const { login, sessionExpired } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    warmApi()
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      await login(username.trim(), password)
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Sign-in failed. Check your connection and try again.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="grid min-h-dvh bg-canvas lg:grid-cols-2">

      <aside className="relative hidden flex-col justify-between bg-surface-inverted p-12 lg:flex">
        <div className="flex items-center gap-3">
          <img src={asset("logo.png")} alt="" aria-hidden width={48} height={48} className="size-12 object-contain" />
          <span>
            <span className="block font-heading text-h2 text-ink-inverted">LRI MUN X</span>
            <span className="block text-label uppercase text-ink-tertiary">Operations Hub</span>
          </span>
        </div>

        <div className="max-w-prose">
          <p className="font-heading text-display text-ink-inverted">Six committees. One desk.</p>
          <span className="page-rule mt-6" aria-hidden />
          <p className="mt-6 text-body text-ink-tertiary">
            Delegates, country assignments, placards and attendance — tracked in one place, and still
            working when the venue wifi is not.
          </p>
        </div>

        <p className="text-body-sm text-ink-tertiary">Secretariat access only.</p>
      </aside>

      <main className="flex items-center justify-center px-4 py-12 md:px-8">
        <div className="w-full max-w-sm">
          <div className="lg:hidden">
            <span
              aria-hidden
              className="grid size-10 place-items-center rounded-control bg-accent font-heading text-h3 font-bold text-white"
            >
              X
            </span>
          </div>

          <h1 className="mt-6 text-h1 text-ink lg:mt-0">Sign in</h1>
          <span className="page-rule mt-3" aria-hidden />
          <p className="mt-4 text-body text-ink-secondary">
            Use the account issued to you by the secretariat.
          </p>

          {sessionExpired ? (
            <div
              role="status"
              className="mt-4 flex items-start gap-2.5 rounded-card border border-info bg-info-wash p-3.5"
            >
              <Clock size={18} className="mt-0.5 shrink-0 text-info" aria-hidden />
              <p className="text-body-sm text-ink">
                Your session ended. Sign in again to pick up where you left off — nothing already
                saved was lost.
              </p>
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4" noValidate>
            {error ? (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-card border border-danger bg-danger-wash p-3.5"
              >
                <AlertTriangle size={18} className="mt-0.5 shrink-0 text-danger" aria-hidden />
                <p className="text-body-sm text-ink">{error}</p>
              </div>
            ) : null}

            <Field label="Username" required>
              {({ id, invalid }) => (
                <Input
                  id={id}
                  name="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  aria-invalid={invalid}
                />
              )}
            </Field>

            <Field label="Password" required>
              {({ id, invalid }) => (
                <Input
                  id={id}
                  name="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                  aria-invalid={invalid}
                />
              )}
            </Field>

            <Button type="submit" loading={submitting} className="mt-2 w-full">
              Sign in
            </Button>
          </form>
        </div>
      </main>
    </div>
  )
}
