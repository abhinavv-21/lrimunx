import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check } from 'lucide-react'
import { Select } from '@/components/ui/Select'
import { SaveIndicator } from '@/components/ui/SaveIndicator'
import { useUpdateDelegate } from '@/lib/hooks'
import { useInlineSave } from '@/lib/useInlineSave'
import { useCommitteePlacementOptions, useCountryOptions } from '@/lib/selectOptions'
import { fold } from '@/lib/text'
import { cn, munExperience } from '@/lib/utils'
import type { Committee, Delegate } from '@/types/api'

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

export function AllocationRow({
  delegate,
  committees,
}: {
  delegate: Delegate
  committees: Committee[]
}) {
  const [committeeId, setCommitteeId] = useState(delegate.assignment?.committee.id ?? '')
  const [country, setCountry] = useState(delegate.assignment?.country ?? '')

  const update = useUpdateDelegate()

  const savedCommitteeId = delegate.assignment?.committee.id ?? ''
  const savedCountry = delegate.assignment?.country ?? ''

  const { state, error, saving, save: runSave, refuse, clearError } = useInlineSave(
    'Could not save.',
    () => {
      setCommitteeId(savedCommitteeId)
      setCountry(savedCountry)
    },
  )

  const committeeControlId = `committee-${delegate.id}`
  const countryControlId = `country-${delegate.id}`

  const focusOnRelease = useRef<string | null>(null)

  const focusCountryNext = useRef(false)

  useEffect(() => {
    if (saving) return
    setCommitteeId(delegate.assignment?.committee.id ?? '')
    setCountry(delegate.assignment?.country ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delegate.assignment?.committee.id, delegate.assignment?.country])

  useEffect(() => {
    if (state === 'saving') return
    const id = focusOnRelease.current
    if (id === null) return
    focusOnRelease.current = null
    if (document.activeElement !== document.body) return
    document.getElementById(id)?.focus()
  }, [state])

  useEffect(() => {
    if (!focusCountryNext.current) return
    focusCountryNext.current = false
    document.getElementById(countryControlId)?.focus()
  }, [committeeId, countryControlId])

  const selected = committees.find((c) => c.id === committeeId)

  const clash = useMemo(
    () => findClash(selected, country, delegate.id),
    [selected, country, delegate.id],
  )

  const movingIn = committeeId !== '' && committeeId !== savedCommitteeId
  const full = Boolean(selected && movingIn && selected.seatsRemaining <= 0)

  const committeeOptions = useCommitteePlacementOptions(committees, savedCommitteeId, 'Unallocated')
  const { options: countryOptions, hasMatrix } = useCountryOptions(selected, delegate.id, country)

  const matrixCountries = selected?.matrixCountries ?? []
  const onMatrix = matrixCountries.some((name) => fold(name) === fold(country))
  const openOnMatrix = matrixCountries.filter(
    (name) =>
      !(selected?.takenCountries ?? []).some(
        (taken) => fold(taken.country) === fold(name) && taken.delegateId !== delegate.id,
      ),
  ).length

  async function save(nextCommitteeId: string, nextCountry: string) {
    if (nextCommitteeId === savedCommitteeId && nextCountry.trim() === savedCountry) return

    const target = committees.find((committee) => committee.id === nextCommitteeId)
    const blocked = nextCommitteeId !== '' ? findClash(target, nextCountry, delegate.id) : null
    if (blocked) {
      refuse(
        `Not saved — ${blocked.country} is already ${blocked.delegateName}’s in ${target?.code ?? 'this committee'}.`,
      )
      return
    }

    const active = document.activeElement
    focusOnRelease.current =
      active instanceof HTMLElement &&
      (active.id === committeeControlId || active.id === countryControlId)
        ? active.id
        : null

    await runSave(() =>
      update.mutateAsync({
        id: delegate.id,
        committeeId: nextCommitteeId === '' ? null : nextCommitteeId,
        country: nextCommitteeId === '' ? null : nextCountry.trim(),
      }),
    )
  }

  function handleCommitteeChange(next: string) {
    setCommitteeId(next)

    clearError()

    if (next === '') {
      void save('', '')
      return
    }
    if (country.trim() !== '') {
      void save(next, country)
      return
    }

    focusCountryNext.current = true
  }

  function handleCountryChange(next: string) {
    setCountry(next)
    clearError()
    void save(committeeId, next)
  }

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
          <p role="alert" className="mt-1 flex items-start gap-1.5 text-body-sm text-danger">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
            {error}
          </p>
        ) : null}
      </div>

      <div className="min-w-0">
        <Select
          id={committeeControlId}
          value={committeeId}
          options={committeeOptions}
          disabled={saving}
          aria-label={`Committee for ${delegate.fullName}`}
          onChange={handleCommitteeChange}
        />

        {selected ? (
          <p className={cn('mt-1 text-body-sm', full ? 'text-danger' : 'text-ink-secondary')}>
            {full
              ? 'No seats left in this committee'
              : `${selected.seatsRemaining} of ${selected.totalSeats} seats open`}
          </p>
        ) : null}
      </div>

      <div className="min-w-0">
        <Select
          id={countryControlId}
          value={country}
          options={countryOptions}
          searchable

          allowCustom={!hasMatrix}
          disabled={committeeId === '' || saving}
          placeholder={committeeId === '' ? 'Pick a committee' : 'Country'}
          aria-label={`Country for ${delegate.fullName}`}
          aria-invalid={clash ? true : undefined}
          emptyMessage={hasMatrix ? `Not on ${selected?.code}’s matrix` : undefined}
          onChange={handleCountryChange}
        />

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
