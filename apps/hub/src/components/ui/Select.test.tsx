import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Select } from './Select'
import { Modal } from './Modal'
import type { SelectOption } from './selectState'

const COMMITTEES: SelectOption[] = [
  { value: '', label: 'Unallocated' },
  { value: 'unsc', label: 'UNSC', hint: '3 open' },
  { value: 'disec', label: 'DISEC', hint: 'full', disabled: true },
  { value: 'unhrc', label: 'UNHRC', hint: '7 open' },
]

function Controlled({
  onChange,
  ...rest
}: { onChange?: (v: string) => void } & Partial<React.ComponentProps<typeof Select>>) {
  const [value, setValue] = useState('')
  return (
    <Select
      value={value}
      onChange={(next) => {
        setValue(next)
        onChange?.(next)
      }}
      options={COMMITTEES}
      aria-label="Committee"
      {...rest}
    />
  )
}

describe('inside a form', () => {
  it('commits on Enter without submitting the form', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault())
    const onChange = vi.fn()

    render(
      <form onSubmit={onSubmit}>
        <Controlled onChange={onChange} />
        <button type="submit">Save</button>
      </form>,
    )

    const trigger = screen.getByRole('combobox', { name: 'Committee' })
    await user.click(trigger)
    await user.keyboard('{ArrowDown}{Enter}')

    expect(onChange).toHaveBeenCalledWith('unsc')

    expect(onSubmit).not.toHaveBeenCalled()
  })
})

describe('inside a dialog', () => {
  function Harness() {
    const [open, setOpen] = useState(true)
    return (
      <Modal open={open} onOpenChange={setOpen} title="Add delegate" holdsInput>
        <Controlled />
      </Modal>
    )
  }

  it('Escape closes the menu and leaves the dialog open; a second Escape closes the dialog', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    expect(screen.getByRole('dialog')).toBeInTheDocument()

    const trigger = screen.getByRole('combobox', { name: 'Committee' })
    await user.click(trigger)
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('ARIA wiring and focus', () => {
  it('wires the combobox to its listbox and always names a real option', async () => {
    const user = userEvent.setup()
    render(<Controlled />)

    const trigger = screen.getByRole('combobox', { name: 'Committee' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')

    const listbox = screen.getByRole('listbox')
    expect(trigger.getAttribute('aria-controls')).toBe(listbox.id)

    for (const _ of [0, 1, 2]) {
      const active = trigger.getAttribute('aria-activedescendant')
      expect(active).toBeTruthy()
      expect(document.getElementById(active as string)).toBeInTheDocument()
      await user.keyboard('{ArrowDown}')
    }
  })

  it('marks the disabled option rather than hiding it, so the reason stays readable', async () => {
    const user = userEvent.setup()
    render(<Controlled />)
    await user.click(screen.getByRole('combobox', { name: 'Committee' }))

    const disec = screen.getByRole('option', { name: /DISEC/ })
    expect(disec).toHaveAttribute('aria-disabled', 'true')

    expect(within(disec).getByText('full')).toBeInTheDocument()
  })

  it('keeps focus on the trigger after choosing with the mouse', async () => {
    const user = userEvent.setup()
    render(<Controlled />)

    const trigger = screen.getByRole('combobox', { name: 'Committee' })
    await user.click(trigger)
    await user.click(screen.getByRole('option', { name: /UNHRC/ }))

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(document.activeElement).toBe(trigger)
  })

  it('reveals the menu only once floating-ui has placed it, and does reveal it', async () => {
    const user = userEvent.setup()
    render(<Controlled />)

    await user.click(screen.getByRole('combobox', { name: 'Committee' }))
    const panel = screen.getByRole('listbox').parentElement as HTMLElement

    await waitFor(() => expect(panel).toBeVisible())
  })

  it('shows a value that matches no option verbatim, instead of the placeholder', () => {
    render(
      <Select
        value="Atlantis"
        onChange={() => {}}
        options={COMMITTEES}
        placeholder="Pick one"
        aria-label="Country"
      />,
    )
    expect(screen.getByRole('combobox', { name: 'Country' })).toHaveTextContent('Atlantis')
  })
})

describe('scrolling the menu', () => {
  function wheelOver(node: Element): WheelEvent {
    const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 120 })
    node.dispatchEvent(event)
    return event
  }

  function InDialog() {
    const [open, setOpen] = useState(true)
    return (
      <Modal open={open} onOpenChange={setOpen} title="Add delegate" holdsInput>
        <Controlled />
      </Modal>
    )
  }

  // Radix mounts react-remove-scroll with the dialog, and it cancels every
  // wheel event that lands outside the panel. The menu is portaled to the
  // body, so the lock counted it as outside and ate the scroll.
  it('lets the wheel through inside a dialog', async () => {
    const user = userEvent.setup()
    render(<InDialog />)

    await user.click(screen.getByRole('combobox', { name: 'Committee' }))
    expect(wheelOver(screen.getByRole('listbox')).defaultPrevented).toBe(false)
  })

  it('lets the wheel through outside a dialog', async () => {
    const user = userEvent.setup()
    render(<Controlled />)

    await user.click(screen.getByRole('combobox', { name: 'Committee' }))
    expect(wheelOver(screen.getByRole('listbox')).defaultPrevented).toBe(false)
  })

  // Pressing the scrollbar is a press on the list, not on a row. Without the
  // guard the trigger blurred, the menu closed, and the drag hit nothing.
  it('stays open when the scrollbar is pressed', async () => {
    const user = userEvent.setup()
    render(<Controlled />)

    const trigger = screen.getByRole('combobox', { name: 'Committee' })
    await user.click(trigger)

    await user.pointer({ target: screen.getByRole('listbox'), keys: '[MouseLeft>]' })

    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(document.activeElement).toBe(trigger)
  })
})

/**
 * These exist because every dropdown inside a dialog was completely inert for
 * days while this suite stayed green.
 *
 * Radix sets pointer-events: none on <body> for a modal dialog and re-enables it
 * only on its own layer. The menu portals to <body> as a sibling of that layer,
 * so it inherited the block: no hover, no click, and the outside-press listener
 * closed the menu instead of selecting.
 *
 * The existing wheel test did not catch it because it dispatches a raw event
 * through node.dispatchEvent, which bypasses the pointer-events check. These use
 * user-event, which refuses to interact with an element that cannot receive
 * pointer events, so they fail loudly when the block comes back.
 */
describe('a menu inside a dialog is actually usable with a mouse', () => {
  function InDialog({ onChange }: { onChange?: (v: string) => void }) {
    const [open, setOpen] = useState(true)
    return (
      <Modal open={open} onOpenChange={setOpen} title="Add delegate" holdsInput>
        <Controlled onChange={onChange} />
      </Modal>
    )
  }

  it('highlights the row under the pointer', async () => {
    const user = userEvent.setup()
    render(<InDialog />)

    await user.click(screen.getByRole('combobox', { name: 'Committee' }))

    const row = screen.getByRole('option', { name: /UNHRC/ })
    await user.hover(row)

    await waitFor(() => expect(row).toHaveClass('bg-edge'))
  })

  it('selects the row that was clicked, rather than dismissing the menu', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<InDialog onChange={onChange} />)

    await user.click(screen.getByRole('combobox', { name: 'Committee' }))
    await user.click(screen.getByRole('option', { name: /UNHRC/ }))

    expect(onChange).toHaveBeenCalledWith('unhrc')
    expect(screen.getByRole('combobox', { name: 'Committee' })).toHaveTextContent('UNHRC')
  })
})
