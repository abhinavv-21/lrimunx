import { useMemo } from 'react'
import type { SelectOption } from '@/components/ui/Select'
import { fold } from '@/lib/text'
import type { Committee } from '@/types/api'

export function useCommitteeFilterOptions(
  committees: readonly Committee[] | undefined,
  allLabel = 'All committees',
): SelectOption[] {
  return useMemo(
    () => [
      { value: '', label: allLabel },
      ...(committees ?? []).map((committee) => ({
        value: committee.id,
        label: committee.code,
        hint: committee.name,
      })),
    ],
    [committees, allLabel],
  )
}

export function useCommitteePlacementOptions(
  committees: readonly Committee[] | undefined,
  keepId: string,
  emptyLabel: string,
): SelectOption[] {
  return useMemo(
    () => [
      { value: '', label: emptyLabel },
      ...(committees ?? []).map((committee) => {
        const full = committee.seatsRemaining <= 0 && committee.id !== keepId
        return {
          value: committee.id,
          label: committee.code,
          hint: full ? 'Full' : `${committee.seatsRemaining} of ${committee.totalSeats} seats open`,
          disabled: full,
        }
      }),
    ],
    [committees, keepId, emptyLabel],
  )
}

export interface CountryChoices {
  options: SelectOption[]

  hasMatrix: boolean
}

export function useCountryOptions(
  committee: Committee | undefined,
  ownDelegateId: string | undefined,
  currentCountry: string,
): CountryChoices {
  return useMemo(() => {
    const matrix = committee?.matrixCountries ?? []
    const hasMatrix = matrix.length > 0

    const heldBy = new Map<string, string>()
    for (const taken of committee?.takenCountries ?? []) {
      if (taken.delegateId !== ownDelegateId) heldBy.set(fold(taken.country), taken.delegateName)
    }

    const options: SelectOption[] = [{ value: '', label: 'Unallocated' }]

    if (!hasMatrix) {
      for (const taken of committee?.takenCountries ?? []) {
        if (taken.delegateId === ownDelegateId) continue
        options.push({
          value: taken.country,
          label: taken.country,
          hint: taken.delegateName,
          disabled: true,
        })
      }
      return { options, hasMatrix }
    }

    const onMatrix = matrix.some((name) => fold(name) === fold(currentCountry))
    if (currentCountry !== '' && !onMatrix) {
      options.push({ value: currentCountry, label: currentCountry, hint: 'Not on the matrix' })
    }

    for (const name of matrix) {
      const holder = heldBy.get(fold(name))
      options.push({
        value: name,
        label: name,
        hint: holder,
        disabled: holder !== undefined,
      })
    }

    return { options, hasMatrix }
  }, [committee, ownDelegateId, currentCountry])
}
