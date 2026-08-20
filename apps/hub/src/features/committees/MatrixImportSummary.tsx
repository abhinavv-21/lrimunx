import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import type { MatrixImportResult } from '@/types/api'

/** What an import did, in the same words whether it covered one room or all of them. */
export function MatrixImportSummary({ result }: { result: MatrixImportResult }) {
  return (
    <div className="flex flex-col gap-3 rounded-control border border-edge bg-surface-sunken p-3">
      <p className="flex items-center gap-2 text-body-sm text-ink">
        <CheckCircle2 size={16} className="shrink-0 text-success" aria-hidden />
        {result.added} added · {result.unchanged} already there · {result.removed} removed
        {result.committees.length > 0 ? ` — ${result.committees.join(', ')}` : ''}
      </p>

      {result.longForm ? (
        <p className="text-body-sm text-ink-secondary">
          Read as Committee/Country rows rather than one column per committee.
        </p>
      ) : null}

      {result.kept.length > 0 ? (
        <div>
          <p className="text-label uppercase text-ink-secondary">Kept — a delegate is sitting on them</p>
          <ul className="mt-1 flex flex-col gap-0.5 text-body-sm text-ink">
            {result.kept.map((k) => (
              <li key={`${k.committee}-${k.country}`}>
                {k.committee} · {k.country} — {k.delegateName}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {result.issues.length > 0 ? (
        <div>
          <p className="flex items-center gap-2 text-label uppercase text-ink-secondary">
            <AlertTriangle size={14} className="shrink-0 text-warning" aria-hidden />
            {result.issues.length} {result.issues.length === 1 ? 'issue' : 'issues'}
          </p>
          <ul className="mt-1 flex max-h-40 flex-col gap-0.5 overflow-y-auto text-body-sm text-ink-secondary">
            {result.issues.map((issue, index) => (
              <li key={index}>
                Row {issue.row}
                {issue.column ? ` · ${issue.column}` : ''} — {issue.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
