import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CONFIRM_PHRASE, ConfirmDialog } from './Modal'

function open(props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const onConfirm = vi.fn()
  render(
    <ConfirmDialog
      open
      onOpenChange={() => {}}
      title="Delete committee?"
      description="Delete UNSC — United Nations Security Council?"
      onConfirm={onConfirm}
      confirmPhrase={CONFIRM_PHRASE}
      {...props}
    />,
  )
  return { onConfirm, confirm: screen.getByRole('button', { name: props.confirmLabel ?? 'Delete' }) }
}

describe('a confirmation that asks for the phrase', () => {
  it('keeps the destructive button dead until the phrase is spelled out', async () => {
    const user = userEvent.setup()
    const { onConfirm, confirm } = open()

    expect(confirm).toBeDisabled()

    const input = screen.getByLabelText(`Type ${CONFIRM_PHRASE} to confirm`)
    await user.type(input, 'lrimun')
    expect(confirm).toBeDisabled()

    await user.type(input, 'x')
    expect(confirm).toBeEnabled()

    await user.click(confirm)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('stays dead while a second gate is closed, however right the phrase is', async () => {
    const user = userEvent.setup()
    const { onConfirm, confirm } = open({ confirmDisabled: true })

    await user.type(screen.getByLabelText(`Type ${CONFIRM_PHRASE} to confirm`), CONFIRM_PHRASE)

    expect(confirm).toBeDisabled()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('asks for nothing when no phrase is set', async () => {
    const user = userEvent.setup()
    const { onConfirm, confirm } = open({ confirmPhrase: undefined })

    expect(screen.queryByLabelText(`Type ${CONFIRM_PHRASE} to confirm`)).toBeNull()

    await user.click(confirm)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})
