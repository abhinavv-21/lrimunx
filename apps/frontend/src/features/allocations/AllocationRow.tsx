import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check } from 'lucide-react'
import { Select, Input } from '@/components/ui/Field'
import { SaveIndicator, type SaveState } from '@/components/ui/SaveIndicator'
import { ApiError } from '@/lib/api'
import { useUpdateDelegate } from '@/lib/hooks'
import { cn, munExperience } from '@/lib/utils'
import type { Committee, Delegate } from '@/types/api'

type RowState = SaveState

/** Countries are the same country however they were typed. */
const fold = (value: string) => value.trim().toLowerCase()

/**
 * Who already holds `value` in `committee`, ignoring this delegate's own
 * allocation so that re-typing a country's casing is not a clash with itself.
 *
 * Takes the value rather than reading component state, because `save` has to
 * ask about the country it is ABOUT to send. Asking about the rendered state
 * answered for the previous country: the select sets state and calls save in
 * the same tick, so the guard was one edit behind and waved through exactly
 * the requests it exists to stop.
 */
function findClash(
  committee: Committee | undefined,
  value: string,
  delegateId: string,
): { country: string; delegateName: string } | null {
  if (!committee || value.trim() === '') return null
  return (
    committee.takenCountries?.find(
      (taken) => fold(taken.country) === fold(value) && taken.delegateId !== delegateId,
    ) ?? null
  )
}

/**
 * One delegate, allocated in place.
 *
 * Committee is a dropdown and country is a text field, both saving without a
 * modal. A committee with no country is not a valid assignment, so the save is
 * deferred until both are present — picking a committee focuses the country
 * field rather than firing a request that the server would reject.
 *
 * The row also shows what the delegate asked for and what is still free, so a
 * clash is visible before it is saved rather than after the server refuses it.
 */
export function AllocationRow({
  delegate,
  committees,
}: {
  delegate: Delegate
  committees: Committee[]
}) {
  const [committeeId, setCommitteeId] = useState(delegate.assignment?.committee.id ?? '')
  const [country, setCountry] = useState(delegate.assignment?.country ?? '')
  const [state, setState] = useState<RowState>('idle')
  const [error, setError] = useState<string | null>(null)

  const update = useUpdateDelegate()

  // Re-sync when the row is replaced by a refetch, but never mid-edit.
  useEffect(() => {
    if (state === 'saving') return
    setCommitteeId(delegate.assignment?.committee.id ?? '')
    setCountry(delegate.assignment?.country ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delegate.assignment?.committee.id, delegate.assignment?.country])

  const savedCommitteeId = delegate.assignment?.committee.id ?? ''
  const savedCountry = delegate.assignment?.country ?? ''

  const selected = committees.find((c) => c.id === committeeId)

  /** Who already holds the country now in the field, for the banner below. */
  const clash = useMemo(
    () => findClash(selected, country, delegate.id),
    [selected, country, delegate.id],
  )

  // Entering a committee they are not already in consumes a seat.
  const movingIn = committeeId !== '' && committeeId !== savedCommitteeId
  const full = Boolean(selected && movingIn && selected.seatsRemaining <= 0)

  async function save(nextCommitteeId: string, nextCountry: string) {
    if (nextCommitteeId === savedCommitteeId && nextCountry.trim() === savedCountry) return
    // Never send a request the data already says will fail — asked about the
    // committee and country being saved, not the ones currently rendered.
    const target = committees.find((committee) => committee.id === nextCommitteeId)
    if (nextCommitteeId !== '' && findClash(target, nextCountry, delegate.id)) return

    setState('saving')
    setError(null)
    try {
      await update.mutateAsync({
        id: delegate.id,
        committeeId: nextCommitteeId === '' ? null : nextCommitteeId,
        country: nextCommitteeId === '' ? null : nextCountry.trim(),
      })
      setState('saved')
      setTimeout(() => setState((s) => (s === 'saved' ? 'idle' : s)), 1600)
    } catch (caught) {
      setState('error')
      setError(caught instanceof ApiError ? caught.message : 'Could not save.')
      // Put the controls back to the truth held by the server.
      setCommitteeId(savedCommitteeId)
      setCountry(savedCountry)
    }
  }

  function handleCommitteeChange(next: string) {
    setCommitteeId(next)

    if (next === '') {
      void save('', '')
      return
    }
    if (country.trim() !== '') {
      void save(next, country)
      return
    }
    /*
      Needs a country before it can be saved — send them straight there.

      Deferred past the render this change causes, and looked up by id rather
      than through the ref. Picking a committee can swap the country control
      from the free-text input to the matrix pick-list, and at this point in
      the event the OLD input is still mounted: focusing the input's own ref
      put the caret into an element React was about to unmount, so focus ended
      up on <body> and the `??` fallback never ran. Both controls carry the
      same id, so one lookup after the swap works for either.
    */
    const id = `country-${delegate.id}`
    requestAnimationFrame(() => {
      const target = document.getElementById(id)
      if (target instanceof HTMLElement) target.focus()
    })
  }

  const countryListId = `taken-${delegate.id}`

  /* --------------------------------------------------------------------
     The country matrix, when the selected committee has one.

     An EMPTY list means unconstrained, not "nothing available" — the server
     reads it the same way. So this is the switch between a pick-list and the
     old free-text box, and it is per committee rather than global.
     -------------------------------------------------------------------- */
  const matrixCountries = selected?.matrixCountries ?? []
  const hasMatrix = matrixCountries.length > 0

  /** Country → the delegate holding it, excluding this row's own allocation. */
  const takenBy = useMemo(() => {
    const map = new Map<string, string>()
    selected?.takenCountries?.forEach((taken) => {
      if (taken.delegateId !== delegate.id) map.set(taken.country, taken.delegateName)
    })
    return map
  }, [selected, delegate.id])

  /**
   * The matrix entry this row's country refers to, spelled the way the matrix
   * spells it — which is what the `<option>` values are.
   *
   * Matching is case- and space-insensitive so that a country saved before the
   * matrix was imported still finds its row, but the SELECTED value has to be
   * the exact option string or the browser silently selects nothing.
   */
  const matrixMatch = matrixCountries.find((name) => fold(name) === fold(country))

  /** Whether what is currently in the field is a country this committee has. */
  const onMatrix = matrixMatch !== undefined

  const openOnMatrix = matrixCountries.filter((name) => !takenBy.has(name)).length

  /**
   * Both choices on one line — "DISEC, then UNHRC".
   *
   * The fallback only matters at the moment the first choice turns out to be
   * full, which is the moment this row is being edited, so splitting it onto a
   * line of its own would cost a row of height for something read together.
   */
  const askedFor = [delegate.committeePreference, delegate.committeePreference2]
    .filter((choice): choice is string => Boolean(choice))
    .join(', then ')

  const experience = munExperience(delegate.munsAttended, delegate.awardsWon)

  return (
    <li
      className={cn(
        'grid gap-3 rounded-card border bg-surface p-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1.4fr)_auto] md:items-start md:gap-4 md:p-4',
        state === 'error' || clash ? 'border-danger' : 'border-edge',
      )}
    >
      <div className="min-w-0 md:pt-2">
        <p className="truncate text-body font-medium text-ink">{delegate.fullName}</p>
        <p className="truncate text-body-sm text-ink-secondary">{delegate.schoolName}</p>
        {askedFor ? (
          <p className="mt-1 truncate text-body-sm text-ink-secondary" title={askedFor}>
            <span className="text-ink-tertiary">Asked for:</span>{' '}
            <span className="text-ink">{askedFor}</span>
          </p>
        ) : null}
        {/*
          Always rendered, including when there is no answer.

          It used to vanish when both numbers were null, which made "we never
          asked this person" look identical to "this feature does not exist" —
          and every delegate added by hand was null, so on most rows it simply
          was not there. An allocator about to put somebody in UNSC needs to
          see the difference between a first-timer, a veteran, and an unknown.
        */}
        <p
          className="mt-1 truncate text-body-sm text-ink-secondary"
          title={experience ?? 'No MUN experience recorded'}
        >
          <span className="text-ink-tertiary">Experience:</span>{' '}
          {experience ? (
            <span className="text-ink">{experience}</span>
          ) : (
            <span className="text-ink-tertiary">not stated</span>
          )}
        </p>
        {error ? (
          <p className="mt-1 flex items-start gap-1.5 text-body-sm text-danger">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
            {error}
          </p>
        ) : null}
      </div>

      <div className="min-w-0">
        <label className="sr-only" htmlFor={`committee-${delegate.id}`}>
          Committee for {delegate.fullName}
        </label>
        <Select
          id={`committee-${delegate.id}`}
          value={committeeId}
          disabled={state === 'saving'}
          onChange={(event) => handleCommitteeChange(event.target.value)}
        >
          <option value="">Unallocated</option>
          {committees.map((committee) => (
            <option
              key={committee.id}
              value={committee.id}
              disabled={committee.seatsRemaining <= 0 && committee.id !== savedCommitteeId}
            >
              {committee.code}
              {committee.seatsRemaining > 0 ? ` — ${committee.seatsRemaining} open` : ' — full'}
            </option>
          ))}
        </Select>

        {selected ? (
          <p className={cn('mt-1 text-body-sm', full ? 'text-danger' : 'text-ink-secondary')}>
            {full
              ? 'No seats left in this committee'
              : `${selected.seatsRemaining} of ${selected.totalSeats} seats open`}
          </p>
        ) : null}
      </div>

      <div className="min-w-0">
        <label className="sr-only" htmlFor={`country-${delegate.id}`}>
          Country for {delegate.fullName}
        </label>

        {/*
          Two controls, and which one you get is decided by the data.

          A committee with an imported matrix knows what countries are in the
          room, so the honest control is a list of them — with the taken ones
          disabled and named. The server enforces the same rule, so a free-text
          box here would only be an invitation to type something that gets
          refused on save.

          A committee with NO matrix is unconstrained, and the text box stays.
          That is what lets one committee's matrix be imported without freezing
          the others, and it is why this keys off the array rather than off a
          global setting.
        */}
        {hasMatrix ? (
          <Select
            id={`country-${delegate.id}`}
            /*
              Every branch here has to name an option that actually exists, or
              the select falls back to its first one and reads "Unallocated"
              over a delegate who is placed.

              - on the matrix   → the matrix's own spelling, which is the option
              - off the matrix  → the saved country, which the extra option below
                                  is rendered with
              - nothing set     → the empty option

              This used to be `onMatrix || country === '' ? country : ''`, which
              sent the off-matrix case to '' — so a delegate holding a country
              the matrix does not list showed as unallocated, contradicting both
              the committee column beside it and the database.
            */
            value={country === '' ? '' : (matrixMatch ?? country)}
            disabled={committeeId === '' || state === 'saving'}
            onChange={(event) => {
              setCountry(event.target.value)
              void save(committeeId, event.target.value)
            }}
          >
            <option value="">Unallocated</option>
            {/*
              An off-matrix country the delegate already holds is offered so the
              select can show what is actually saved. Without it the control
              would read "Unallocated" over a delegate who is placed — the row
              would be lying about the database.
            */}
            {!onMatrix && country !== '' ? (
              <option value={country}>{country} — not on the matrix</option>
            ) : null}
            {matrixCountries.map((name) => {
              const heldBy = takenBy.get(name)
              const mine = name === savedCountry
              return (
                <option key={name} value={name} disabled={Boolean(heldBy) && !mine}>
                  {name}
                  {heldBy && !mine ? ` — ${heldBy}` : ''}
                </option>
              )
            })}
          </Select>
        ) : (
          <Input
            id={`country-${delegate.id}`}
            value={country}
            list={selected ? countryListId : undefined}
            placeholder={committeeId === '' ? 'Pick a committee' : 'Country'}
            disabled={committeeId === '' || state === 'saving'}
            aria-invalid={clash ? true : undefined}
            onChange={(event) => setCountry(event.target.value)}
            onBlur={() => void save(committeeId, country)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                event.currentTarget.blur()
              }
              if (event.key === 'Escape') {
                setCountry(savedCountry)
                event.currentTarget.blur()
              }
            }}
          />
        )}

        {/*
          A datalist of countries already taken. Suggesting them looks backwards
          until you use it: typing "Fr" and seeing France offered is exactly how
          you discover the clash before committing to it. Only for the free-text
          case — the select already names its holders inline.
        */}
        {selected && !hasMatrix ? (
          <datalist id={countryListId}>
            {selected.takenCountries?.map((taken) => (
              <option key={taken.delegateId} value={taken.country}>
                taken — {taken.delegateName}
              </option>
            ))}
          </datalist>
        ) : null}

        {selected ? (
          clash ? (
            <p className="mt-1 flex items-start gap-1.5 text-body-sm text-danger">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
              {clash.country} is already {clash.delegateName}’s in {selected.code}
            </p>
          ) : hasMatrix && country !== '' && !onMatrix ? (
            <p className="mt-1 flex items-start gap-1.5 text-body-sm text-warning">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
              Not on {selected.code}’s matrix — add it there, or choose another
            </p>
          ) : country.trim() !== '' ? (
            <p className="mt-1 flex items-start gap-1.5 text-body-sm text-success">
              <Check size={14} className="mt-0.5 shrink-0" aria-hidden />
              Free in {selected.code}
            </p>
          ) : hasMatrix ? (
            <p className="mt-1 text-body-sm text-ink-secondary">
              {openOnMatrix} of {matrixCountries.length} countries open
            </p>
          ) : (
            <p className="mt-1 text-body-sm text-ink-secondary">
              {selected.takenCountries?.length ?? 0} already allocated
            </p>
          )
        ) : null}
      </div>

      <div className="flex min-h-6 items-center justify-end md:w-16 md:pt-2" aria-live="polite">
        <SaveIndicator state={state} />
      </div>
    </li>
  )
}
