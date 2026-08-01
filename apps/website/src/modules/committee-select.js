/**
 * committee-select.js — the committee preference listbox.
 *
 * WHY THIS EXISTS
 * The preference used to be a text <input> with a <datalist>. That pairing has
 * never been a designed control: the popup is drawn by the platform in the
 * platform's own font and colours, it cannot be styled to sit on this page, it
 * suggests without constraining (so "unsc pls" was a valid answer the
 * secretariat then had to interpret), and on several Android browsers it does
 * not appear at all. A native <select> is worse for a different reason — six
 * committees that each need a CODE and a FULL NAME cannot be shown as two
 * distinct pieces of type inside an <option>.
 *
 * So this is a real listbox, built to the ARIA select-only combobox pattern:
 * a button with role="combobox" that owns a role="listbox" of role="option"
 * children, keeps DOM focus on itself, and points at the active option with
 * aria-activedescendant. Nothing here is a div pretending to be a control.
 *
 * KEYBOARD CONTRACT
 *   ↓ / ↑         open, or move the active option
 *   Home / End    first / last option
 *   Enter / Space open, or commit the active option
 *   a–z, 0–9      type-ahead — matches the code first, then the name
 *   Escape        close without changing anything
 *   Tab           commit the active option and move on (as a native select does)
 *
 * The committees are read from the landing page's committees section. They are
 * held here rather than written into register.html twice — the page needs two
 * of these controls, and a list duplicated in markup is a list that drifts.
 */

/**
 * The six committees, in the order the rail lists them.
 * Source: index.html §2 COMMITTEES — `.committee__name` and `.committee__abbr`.
 *
 * `value` is what is submitted, and it is the same string the old datalist
 * offered, so the ops hub keeps seeing committee preferences in the shape it
 * already stores. Well inside the server's 160-character limit.
 */
export const COMMITTEES = [
  { code: 'UNSC', name: 'United Nations Security Council' },
  { code: 'UNHRC', name: 'Human Rights Council' },
  { code: 'DISEC', name: 'Disarmament & International Security' },
  { code: 'ECOSOC', name: 'Economic & Social Council' },
  { code: 'WHO', name: 'World Health Organization' },
  { code: 'HCC', name: 'Historical Crisis Committee' },
].map((committee) => ({ ...committee, value: `${committee.name} (${committee.code})` }))

const TYPEAHEAD_RESET_MS = 700

/**
 * Upgrade one `[data-cselect]` block into a listbox.
 *
 * @param {HTMLElement} root
 * @param {{ announce?: (message: string) => void, onSelect?: (code: string) => void }} options
 * @returns {object|null} a controller, or null if the markup is not there
 */
export function initCommitteeSelect(root, { announce, onSelect } = {}) {
  if (!root) return null

  const button = root.querySelector('[data-cselect-button]')
  const list = root.querySelector('[data-cselect-list]')
  const valueEl = root.querySelector('[data-cselect-value]')
  const input = root.querySelector('[data-cselect-input]')
  const notice = root.querySelector('[data-cselect-notice]')
  if (!button || !list || !valueEl || !input) return null

  const idBase = root.dataset.cselectId || input.name || 'cselect'
  const emptyLabel = root.dataset.cselectEmpty || 'No preference'

  /* --------------------------------------------------------------------
     Options.

     The empty option is a real option, first in the list, not an absence.
     "No preference" is a normal answer here — most delegates have not read
     six rules of procedure before applying — so it has to be something you
     can choose, and something you can choose AGAIN after choosing wrongly.
     -------------------------------------------------------------------- */
  const items = [{ code: '', name: emptyLabel, value: '', empty: true }, ...COMMITTEES]

  const nodes = items.map((item, index) => {
    const li = document.createElement('li')
    li.className = 'cselect__option'
    li.id = `${idBase}-opt-${index}`
    li.setAttribute('role', 'option')
    li.setAttribute('aria-selected', 'false')
    li.dataset.code = item.code

    if (item.empty) {
      li.classList.add('cselect__option--empty')
      const name = document.createElement('span')
      name.className = 'cselect__option-name'
      name.textContent = item.name
      li.append(name)
    } else {
      const code = document.createElement('span')
      code.className = 'cselect__option-code'
      code.textContent = item.code
      const name = document.createElement('span')
      name.className = 'cselect__option-name'
      name.textContent = item.name
      li.append(code, name)
    }

    // The reason an option is unavailable lives with the option. An option
    // that silently disappears is indistinguishable from one that was never
    // there, and the reader is left wondering whether they misremembered.
    const reason = document.createElement('span')
    reason.className = 'cselect__option-reason'
    reason.hidden = true
    li.append(reason)

    list.append(li)
    return li
  })

  let open = false
  let selectedIndex = 0
  let activeIndex = 0
  let typed = ''
  let typedTimer = null
  const blocked = new Map() // index → reason

  const say = (message) => {
    if (typeof announce === 'function' && message) announce(message)
  }

  /* --------------------------------------------------------------------
     Painting.
     -------------------------------------------------------------------- */
  function paintSelection() {
    nodes.forEach((node, index) => {
      node.setAttribute('aria-selected', String(index === selectedIndex))
      node.classList.toggle('is-selected', index === selectedIndex)
    })

    const item = items[selectedIndex]
    valueEl.textContent = item.empty ? emptyLabel : `${item.code} — ${item.name}`
    root.classList.toggle('is-empty', Boolean(item.empty))
    input.value = item.value
  }

  function paintActive() {
    nodes.forEach((node, index) => node.classList.toggle('is-active', open && index === activeIndex))
    if (open) button.setAttribute('aria-activedescendant', nodes[activeIndex].id)
    else button.removeAttribute('aria-activedescendant')
  }

  /**
   * Keep the active option inside the scrolled list.
   *
   * Done by arithmetic rather than by scrollIntoView: scrollIntoView walks up
   * every scrollable ancestor, and on a phone that means the page itself
   * lurches while the reader is only moving down a list of six.
   */
  function keepActiveInView() {
    const node = nodes[activeIndex]
    const top = node.offsetTop
    const bottom = top + node.offsetHeight
    if (top < list.scrollTop) list.scrollTop = top
    else if (bottom > list.scrollTop + list.clientHeight) {
      list.scrollTop = bottom - list.clientHeight
    }
  }

  /* --------------------------------------------------------------------
     Open / close.
     -------------------------------------------------------------------- */
  function openList(startIndex = selectedIndex) {
    if (open) return
    open = true
    list.hidden = false
    button.setAttribute('aria-expanded', 'true')
    root.classList.add('is-open')

    // Flip upward when there is not room below. Measured after the list is
    // painted, because a hidden element has no height to measure.
    const space = window.innerHeight - button.getBoundingClientRect().bottom
    const needed = list.offsetHeight + 16
    root.classList.toggle('is-above', space < needed && button.getBoundingClientRect().top > needed)

    activeIndex = startIndex
    paintActive()
    keepActiveInView()
  }

  function closeList({ focusButton = true } = {}) {
    if (!open) return
    open = false
    list.hidden = true
    button.setAttribute('aria-expanded', 'false')
    root.classList.remove('is-open', 'is-above')
    paintActive()
    if (focusButton) button.focus()
  }

  /* --------------------------------------------------------------------
     Committing a choice.
     -------------------------------------------------------------------- */
  function commit(index, { silent = false } = {}) {
    if (blocked.has(index)) {
      // Refused, not ignored: the reason is on the option AND is announced,
      // and the list stays open so the next choice is one keystroke away.
      say(blocked.get(index))
      return false
    }

    const changed = index !== selectedIndex
    selectedIndex = index
    root.classList.remove('is-preselected')
    hideNotice()
    paintSelection()

    if (changed && !silent && typeof onSelect === 'function') onSelect(items[index].code)
    return true
  }

  function indexOfCode(code) {
    if (!code) return 0
    const wanted = String(code).trim().toUpperCase()
    const found = items.findIndex((item) => item.code && item.code === wanted)
    return found === -1 ? -1 : found
  }

  /* --------------------------------------------------------------------
     The notice line — used for preselection and for the "cleared because…"
     case. Never for an error; errors belong to .regfield__error.
     -------------------------------------------------------------------- */
  function showNotice(text) {
    if (!notice) return
    notice.textContent = text
    notice.hidden = false
  }

  function hideNotice() {
    if (!notice) return
    notice.textContent = ''
    notice.hidden = true
  }

  /* --------------------------------------------------------------------
     Type-ahead. Code first, then name, then anywhere in either — typing
     "un" should land on UNSC, and typing "health" should land on WHO.
     -------------------------------------------------------------------- */
  function typeahead(char) {
    typed += char.toLowerCase()
    window.clearTimeout(typedTimer)
    typedTimer = window.setTimeout(() => {
      typed = ''
    }, TYPEAHEAD_RESET_MS)

    const match =
      items.findIndex((item) => item.code.toLowerCase().startsWith(typed)) !== -1
        ? items.findIndex((item) => item.code.toLowerCase().startsWith(typed))
        : items.findIndex((item) => item.name.toLowerCase().startsWith(typed)) !== -1
          ? items.findIndex((item) => item.name.toLowerCase().startsWith(typed))
          : items.findIndex((item) =>
              `${item.code} ${item.name}`.toLowerCase().includes(typed)
            )

    if (match === -1) return

    if (open) {
      activeIndex = match
      paintActive()
      keepActiveInView()
    } else {
      commit(match)
    }
  }

  /* --------------------------------------------------------------------
     Keyboard.
     -------------------------------------------------------------------- */
  function move(delta) {
    const next = Math.min(items.length - 1, Math.max(0, activeIndex + delta))
    activeIndex = next
    paintActive()
    keepActiveInView()
  }

  button.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        if (!open) openList()
        else move(1)
        return
      case 'ArrowUp':
        event.preventDefault()
        if (!open) openList()
        else move(-1)
        return
      case 'Home':
        event.preventDefault()
        if (!open) openList(0)
        else {
          activeIndex = 0
          paintActive()
          keepActiveInView()
        }
        return
      case 'End':
        event.preventDefault()
        if (!open) openList(items.length - 1)
        else {
          activeIndex = items.length - 1
          paintActive()
          keepActiveInView()
        }
        return
      case 'Enter':
      case ' ':
      case 'Spacebar':
        event.preventDefault()
        if (!open) openList()
        else if (commit(activeIndex)) closeList()
        return
      case 'Escape':
        if (!open) return
        event.preventDefault()
        closeList()
        return
      case 'Tab':
        // Committing on Tab is what a native select does on Windows, and it is
        // the behaviour that stops a keyboard user losing a choice they have
        // visibly made by leaving the field the ordinary way.
        if (open) {
          commit(activeIndex)
          closeList({ focusButton: false })
        }
        return
      default:
    }

    if (event.key.length === 1 && /\S/.test(event.key)) {
      event.preventDefault()
      typeahead(event.key)
    }
  })

  button.addEventListener('click', () => {
    if (open) closeList()
    else openList()
  })

  /* --------------------------------------------------------------------
     Pointer.

     `mousedown` is prevented on the list so the button never loses focus —
     the ARIA pattern requires focus to stay on the combobox while the popup
     is open, and a blur would close the list before the click landed.
     -------------------------------------------------------------------- */
  list.addEventListener('mousedown', (event) => event.preventDefault())

  list.addEventListener('click', (event) => {
    const option = event.target.closest('.cselect__option')
    if (!option) return
    const index = nodes.indexOf(option)
    if (index === -1) return
    if (commit(index)) closeList()
  })

  list.addEventListener('mousemove', (event) => {
    const option = event.target.closest('.cselect__option')
    if (!option) return
    const index = nodes.indexOf(option)
    if (index === -1 || index === activeIndex) return
    activeIndex = index
    paintActive()
  })

  document.addEventListener('pointerdown', (event) => {
    if (!open || root.contains(event.target)) return
    closeList({ focusButton: false })
  })

  // A focus that lands outside the control — Tab, or a click into another
  // field — closes the popup rather than leaving it hanging over the form.
  root.addEventListener('focusout', (event) => {
    if (!open) return
    if (event.relatedTarget && root.contains(event.relatedTarget)) return
    closeList({ focusButton: false })
  })

  window.addEventListener('resize', () => closeList({ focusButton: false }))

  paintSelection()
  paintActive()

  /* --------------------------------------------------------------------
     Controller.
     -------------------------------------------------------------------- */
  return {
    name: input.name,
    button,
    get code() {
      return items[selectedIndex].code
    },
    get value() {
      return items[selectedIndex].value
    },

    /** Select by committee code. Returns false for an unknown code. */
    selectByCode(code, { silent = false } = {}) {
      const index = indexOfCode(code)
      if (index === -1) return false
      return commit(index, { silent })
    },

    clear({ reason = '' } = {}) {
      commit(0, { silent: true })
      if (reason) {
        showNotice(reason)
        say(reason)
      }
    },

    /** Mark this control as having been filled in from the query string. */
    markPreselected(text) {
      root.classList.add('is-preselected')
      showNotice(text)
    },

    /**
     * Make one option unselectable, with the reason stated on it. Passing an
     * empty code releases whatever was blocked before.
     */
    blockCode(code, reason) {
      blocked.clear()
      nodes.forEach((node, index) => {
        const off = Boolean(code) && items[index].code === String(code).toUpperCase()
        node.classList.toggle('is-blocked', off)
        node.setAttribute('aria-disabled', String(off))
        const reasonEl = node.querySelector('.cselect__option-reason')
        if (reasonEl) {
          reasonEl.textContent = off ? reason : ''
          reasonEl.hidden = !off
        }
        if (off) blocked.set(index, `${items[index].code}: ${reason}`)
      })
    },

    focus() {
      button.focus()
    },

    setReadOnly(state) {
      // aria-disabled, never `disabled` — a disabled button throws focus to
      // <body>, and on a form this tall that strands a keyboard user at the top
      // of the document with no account of what just happened.
      button.setAttribute('aria-disabled', String(state))
      if (state) closeList({ focusButton: false })
    },

    showNotice,
    hideNotice,
  }
}
