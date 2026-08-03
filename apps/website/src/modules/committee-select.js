/**
 * committee-select.js — the registration form's listbox.
 *
 * Built for the committee preferences and since generalised: it now also backs
 * the academic level. The two option lists it serves are exported below; the
 * control itself knows nothing about either.
 *
 * WHY THIS EXISTS
 * The preference used to be a text <input> with a <datalist>. That pairing has
 * never been a designed control: the popup is drawn by the platform in the
 * platform's own font and colours, it cannot be styled to sit on this page, it
 * suggests without constraining (so "unsc pls" was a valid answer the
 * secretariat then had to interpret), and on several Android browsers it never
 * appears at all. A native <select> fails differently — six committees that
 * each need a CODE and a FULL NAME cannot be set as two distinct pieces of type
 * inside an <option>.
 *
 * So this is a real listbox, built to the ARIA select-only combobox pattern: a
 * button with role="combobox" owning a role="listbox" of role="option"
 * children, keeping DOM focus on itself and pointing at the active option with
 * aria-activedescendant. Nothing here is a div pretending to be a control.
 *
 * KEYBOARD CONTRACT
 *   ↓ / ↑         open, or move the active option
 *   Home / End    first / last option
 *   Enter / Space open, or commit the active option
 *   a–z, 0–9      type-ahead — matches the code first, then the name
 *   Escape        close without changing anything
 *   Tab           commit the active option and move on (as a native select does)
 */

/**
 * The six committees, in the order the rail lists them.
 * Source: index.html §2 COMMITTEES — `.committee__name` and `.committee__abbr`.
 *
 * `value` is what is submitted, and it is the same string the old datalist
 * offered, so the ops hub keeps seeing committee preferences in the shape it
 * already stores. Comfortably inside the server's 160-character limit.
 *
 * Held here rather than written into register.html: the page needs two of these
 * controls, and a list duplicated in markup is a list that drifts.
 */
export const COMMITTEES = [
  { code: 'UNSC', name: 'United Nations Security Council' },
  { code: 'UNHRC', name: 'Human Rights Council' },
  { code: 'DISEC', name: 'Disarmament & International Security' },
  { code: 'ECOSOC', name: 'Economic & Social Council' },
  { code: 'WHO', name: 'World Health Organization' },
  { code: 'HCC', name: 'Historical Crisis Committee' },
].map((committee) => ({ ...committee, value: `${committee.name} (${committee.code})` }))

/**
 * Academic level — what used to be a free-text "Grade" box.
 *
 * Free text produced "11", "Grade 11", "XI", "A2", "1st year" and "11 'B'" for
 * what is one of three answers, and the secretariat then had to normalise a
 * column by hand before it could count anything. Three options, and the counts
 * are correct the moment registration closes.
 *
 * `value` is what is submitted and what the ops hub stores, so it is kept short
 * and stable — the bracketed range is presentation, not data. It rides the
 * existing `grade` field on the wire: the column, the CSV header and every
 * import path already speak that name, and renaming it would have bought a
 * migration and nothing else.
 */
export const ACADEMIC_LEVELS = [
  { code: 'MS', name: 'Middle School (7–8)', value: 'Middle School' },
  { code: 'HS', name: 'High School (9–12)', value: 'High School' },
  { code: 'UG', name: "Undergraduate (Bachelor's)", value: 'Undergraduate' },
]

const TYPEAHEAD_RESET_MS = 700

/**
 * Upgrade one `[data-cselect]` block into a listbox.
 *
 * @param {HTMLElement} root
 * @param {object} [config]
 * @param {(message: string) => void} [config.announce]
 * @param {(code: string) => void} [config.onSelect]
 * @param {Array<{code: string, name: string, value: string}>} [config.options]
 *        The list to offer. Defaults to the six committees.
 * @param {boolean} [config.allowEmpty]
 *        Whether "no answer" is one of the choices. False for a required field.
 * @param {boolean} [config.showCodes]
 *        Whether each option leads with its short code. True for committees,
 *        where UNSC is how delegates refer to the thing; false for academic
 *        level, where "HS" is an abbreviation nobody asked for.
 * @returns {object|null} a controller, or null if the markup is not there
 */
export function initListbox(
  root,
  { announce, onSelect, options = COMMITTEES, allowEmpty = true, showCodes = true } = {}
) {
  if (!root) return null

  const button = root.querySelector('[data-cselect-button]')
  const list = root.querySelector('[data-cselect-list]')
  const valueEl = root.querySelector('[data-cselect-value]')
  const input = root.querySelector('[data-cselect-input]')
  /* The notice line is a sibling of this root, not a child of it — it is styled
     as a `.regfield` row and has to sit at that level to get the layout. Looked
     up from the field wrapper for that reason; a root-scoped query finds nothing
     and every notice this control can raise (the ?committee= preselection, the
     "second preference cleared" line) is then silently dropped. */
  const field = root.closest('[data-field]')
  const notice =
    root.querySelector('[data-cselect-notice]') ??
    field?.querySelector('[data-cselect-notice]') ??
    null
  if (!button || !list || !valueEl || !input) return null

  const idBase = root.dataset.cselectId || input.name || 'cselect'
  const emptyLabel = root.dataset.cselectEmpty || 'No preference'

  /* --------------------------------------------------------------------
     Options.

     The empty option is a real option, first in the list, not an absence.
     "No preference" is a normal answer here — most delegates have not read six
     rules of procedure before applying — so it has to be something you can
     choose, and something you can choose AGAIN after choosing wrongly.

     A required field has no such option: there, the placeholder is a prompt
     ("Choose one"), not a selectable answer, and `is-empty` styles it as the
     unfilled state it is.
     -------------------------------------------------------------------- */
  const items = allowEmpty
    ? [{ code: '', name: emptyLabel, value: '', empty: true }, ...options]
    : [...options]

  const nodes = items.map((item, index) => {
    const li = document.createElement('li')
    li.className = 'cselect__option'
    li.id = `${idBase}-opt-${index}`
    li.setAttribute('role', 'option')
    li.setAttribute('aria-selected', 'false')
    li.dataset.code = item.code

    if (item.empty) {
      li.classList.add('cselect__option--empty')
    } else if (showCodes) {
      const code = document.createElement('span')
      code.className = 'cselect__option-code'
      code.textContent = item.code
      li.append(code)
    } else {
      // No code means no code column. Without this the name is laid into the
      // 5.25rem gutter the code would have occupied and wraps a word per line.
      li.classList.add('cselect__option--plain')
    }

    const name = document.createElement('span')
    name.className = 'cselect__option-name'
    name.textContent = item.name
    li.append(name)

    // The reason an option is unavailable lives with the option. An option that
    // silently disappears is indistinguishable from one that was never there,
    // and the reader is left wondering whether they misremembered.
    const reason = document.createElement('span')
    reason.className = 'cselect__option-reason'
    reason.hidden = true
    li.append(reason)

    list.append(li)
    return li
  })

  let open = false
  // -1 is "nothing chosen yet", and it only exists on a required field. Landing
  // on index 0 there would answer the question on the reader's behalf, and an
  // answer nobody gave is worse than a blank one — it is indistinguishable from
  // a deliberate one on the other side.
  const NONE = -1
  let selectedIndex = allowEmpty ? 0 : NONE
  let activeIndex = 0
  let typed = ''
  let typedTimer = null
  const blocked = new Map() // index → the reason, phrased for announcement

  const say = (message) => {
    if (typeof announce === 'function' && message) announce(message)
  }

  const isLocked = () => button.getAttribute('aria-disabled') === 'true'

  /* --------------------------------------------------------------------
     Painting.
     -------------------------------------------------------------------- */
  function paintSelection() {
    nodes.forEach((node, index) => {
      node.setAttribute('aria-selected', String(index === selectedIndex))
      node.classList.toggle('is-selected', index === selectedIndex)
    })

    const item = selectedIndex === NONE ? null : items[selectedIndex]
    const blank = !item || item.empty
    valueEl.textContent = blank ? emptyLabel : showCodes ? `${item.code} — ${item.name}` : item.name
    root.classList.toggle('is-empty', blank)
    input.value = item ? item.value : ''
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
    if (open || isLocked()) return
    if (startIndex === NONE) startIndex = 0
    open = true
    list.hidden = false
    button.setAttribute('aria-expanded', 'true')
    root.classList.add('is-open')

    // Flip upward when there is no room below. Measured after the list is
    // painted, because a hidden element has no height to measure.
    const box = button.getBoundingClientRect()
    const needed = list.offsetHeight + 16
    root.classList.toggle(
      'is-above',
      window.innerHeight - box.bottom < needed && box.top > needed
    )

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
      // Refused, not ignored: the reason is printed on the option AND
      // announced, and the list stays open so the next choice is one keystroke
      // away.
      say(blocked.get(index))
      return false
    }

    const changed = index !== selectedIndex
    selectedIndex = index
    // Cleared from BOTH, because the mark is painted from the field wrapper
    // (`.regfield.is-preselected .regfield__label::after`). Dropping it from the
    // root alone left the tick standing beside a value the reader chose
    // themselves, which is the one thing the tick is there to deny.
    root.classList.remove('is-preselected')
    field?.classList.remove('is-preselected')
    hideNotice()
    paintSelection()

    if (changed && !silent && typeof onSelect === 'function') {
      onSelect(index === NONE ? '' : items[index].code)
    }
    return true
  }

  function indexOfCode(code) {
    // On a required list there is no index 0 meaning "none" to fall back to.
    if (!code) return allowEmpty ? 0 : NONE
    const wanted = String(code).trim().toUpperCase()
    return items.findIndex((item) => item.code && item.code === wanted)
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
     Type-ahead.

     Three passes, in the order somebody actually types: the code, because
     "un" should land on UNSC; then the name, because "health" should land on
     WHO; then anywhere in either, which catches "security" for both UNSC and
     DISEC and settles on the first.
     -------------------------------------------------------------------- */
  function findByTyped(query) {
    const haystacks = items.map((item) => ({
      code: item.code.toLowerCase(),
      name: item.name.toLowerCase(),
    }))

    let match = haystacks.findIndex((item) => item.code.startsWith(query))
    if (match === -1) match = haystacks.findIndex((item) => item.name.startsWith(query))
    if (match === -1) {
      match = haystacks.findIndex(
        (item) => item.code.includes(query) || item.name.includes(query)
      )
    }
    return match
  }

  function typeahead(char) {
    typed += char.toLowerCase()
    window.clearTimeout(typedTimer)
    typedTimer = window.setTimeout(() => {
      typed = ''
    }, TYPEAHEAD_RESET_MS)

    const match = findByTyped(typed)
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
  function setActive(index) {
    activeIndex = Math.min(items.length - 1, Math.max(0, index))
    paintActive()
    keepActiveInView()
  }

  button.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    if (isLocked()) return

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        if (open) setActive(activeIndex + 1)
        else openList()
        return
      case 'ArrowUp':
        event.preventDefault()
        if (open) setActive(activeIndex - 1)
        else openList()
        return
      case 'Home':
        event.preventDefault()
        if (open) setActive(0)
        else openList(0)
        return
      case 'End':
        event.preventDefault()
        if (open) setActive(items.length - 1)
        else openList(items.length - 1)
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
        // Committing on Tab is what a native select does, and it is what stops
        // a keyboard user losing a choice they have visibly made by leaving the
        // field in the ordinary way.
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
    if (isLocked()) return
    if (open) closeList()
    else openList()
  })

  /* --------------------------------------------------------------------
     Pointer.

     `mousedown` is prevented on the list so the button never loses focus — the
     ARIA pattern requires focus to stay on the combobox while the popup is
     open, and a blur would close the list before the click landed.
     -------------------------------------------------------------------- */
  list.addEventListener('mousedown', (event) => event.preventDefault())

  list.addEventListener('click', (event) => {
    const option = event.target.closest('.cselect__option')
    if (!option) return
    const index = nodes.indexOf(option)
    if (index === -1) return
    if (commit(index)) closeList()
  })

  // Hover follows the pointer, as it does in a native popup. `mousemove` rather
  // than `pointermove`, so a touch drag over the list does not silently move
  // the active option under the reader's finger.
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

  // A focus landing outside the control — Tab, or a click into another field —
  // closes the popup rather than leaving it hanging over the form.
  root.addEventListener('focusout', (event) => {
    if (!open) return
    if (event.relatedTarget && root.contains(event.relatedTarget)) return
    closeList({ focusButton: false })
  })

  // The popup is positioned against the button; a resize invalidates both the
  // flip decision and the width it was measured at.
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
      return selectedIndex === NONE ? '' : items[selectedIndex].code
    },
    get value() {
      return selectedIndex === NONE ? '' : items[selectedIndex].value
    },

    /** Select by option code. Returns false for an unknown or empty code. */
    selectByCode(code, { silent = false } = {}) {
      const index = indexOfCode(code)
      if (index === NONE) return false
      return commit(index, { silent })
    },

    clear({ reason = '' } = {}) {
      commit(allowEmpty ? 0 : NONE, { silent: true })
      if (reason) {
        showNotice(reason)
        say(reason)
      }
    },

    /** Mark this control as having been filled in from the query string. */
    markPreselected(text) {
      root.classList.add('is-preselected')
      field?.classList.add('is-preselected')
      showNotice(text)
    },

    /**
     * Make one option unselectable, with the reason stated on it. An empty code
     * releases whatever was blocked before.
     */
    blockCode(code, reason) {
      blocked.clear()
      const wanted = code ? String(code).toUpperCase() : ''

      nodes.forEach((node, index) => {
        const off = Boolean(wanted) && items[index].code === wanted
        node.classList.toggle('is-blocked', off)
        node.setAttribute('aria-disabled', String(off))

        const reasonEl = node.querySelector('.cselect__option-reason')
        if (reasonEl) {
          reasonEl.textContent = off ? reason : ''
          reasonEl.hidden = !off
        }

        if (off) blocked.set(index, `${items[index].code} is ${reason}.`)
      })
    },

    focus() {
      button.focus()
    },

    setReadOnly(state) {
      // aria-disabled, never `disabled` — a disabled button throws focus back to
      // <body>, and on a form this tall that strands a keyboard user at the top
      // of the document with no account of what just happened.
      button.setAttribute('aria-disabled', String(state))
      if (state) closeList({ focusButton: false })
    },

    showNotice,
    hideNotice,
  }
}
