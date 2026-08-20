import { COMMITTEES as CATALOGUE, preferenceValue } from '../data/committees.js'

// One source of truth: src/data/committees.js. The listbox needs only what it
// shows and what it submits.
export const COMMITTEES = CATALOGUE.map((committee) => ({
  code: committee.code,
  name: committee.name,
  value: preferenceValue(committee),
}))

export const ACADEMIC_LEVELS = [
  { code: 'MS', name: 'Middle School (7–8)', value: 'Middle School' },
  { code: 'HS', name: 'High School (9–12)', value: 'High School' },
  { code: 'UG', name: "Undergraduate (Bachelor's)", value: 'Undergraduate' },
]

const TYPEAHEAD_RESET_MS = 700

export function initListbox(
  root,
  { announce, onSelect, options = COMMITTEES, allowEmpty = true, showCodes = true } = {}
) {
  if (!root) return null

  const button = root.querySelector('[data-cselect-button]')
  const list = root.querySelector('[data-cselect-list]')
  const valueEl = root.querySelector('[data-cselect-value]')
  const input = root.querySelector('[data-cselect-input]')

  const field = root.closest('[data-field]')
  const notice =
    root.querySelector('[data-cselect-notice]') ??
    field?.querySelector('[data-cselect-notice]') ??
    null
  if (!button || !list || !valueEl || !input) return null

  const idBase = root.dataset.cselectId || input.name || 'cselect'
  const emptyLabel = root.dataset.cselectEmpty || 'No preference'

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
      li.classList.add('cselect__option--plain')
    }

    const name = document.createElement('span')
    name.className = 'cselect__option-name'
    name.textContent = item.name
    li.append(name)

    const reason = document.createElement('span')
    reason.className = 'cselect__option-reason'
    reason.hidden = true
    li.append(reason)

    list.append(li)
    return li
  })

  let open = false

  const NONE = -1
  let selectedIndex = allowEmpty ? 0 : NONE
  let activeIndex = 0
  let typed = ''
  let typedTimer = null
  const blocked = new Map()

  const say = (message) => {
    if (typeof announce === 'function' && message) announce(message)
  }

  const isLocked = () => button.getAttribute('aria-disabled') === 'true'

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

  function keepActiveInView() {
    const node = nodes[activeIndex]
    const top = node.offsetTop
    const bottom = top + node.offsetHeight
    if (top < list.scrollTop) list.scrollTop = top
    else if (bottom > list.scrollTop + list.clientHeight) {
      list.scrollTop = bottom - list.clientHeight
    }
  }

  function openList(startIndex = selectedIndex) {
    if (open || isLocked()) return
    if (startIndex === NONE) startIndex = 0
    open = true
    list.hidden = false
    button.setAttribute('aria-expanded', 'true')
    root.classList.add('is-open')

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

  function commit(index, { silent = false } = {}) {
    if (blocked.has(index)) {
      say(blocked.get(index))
      return false
    }

    const changed = index !== selectedIndex
    selectedIndex = index

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
    if (!code) return allowEmpty ? 0 : NONE
    const wanted = String(code).trim().toUpperCase()
    return items.findIndex((item) => item.code && item.code === wanted)
  }

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

  root.addEventListener('focusout', (event) => {
    if (!open) return
    if (event.relatedTarget && root.contains(event.relatedTarget)) return
    closeList({ focusButton: false })
  })

  window.addEventListener('resize', () => closeList({ focusButton: false }))

  paintSelection()
  paintActive()

  return {
    name: input.name,
    button,
    get code() {
      return selectedIndex === NONE ? '' : items[selectedIndex].code
    },
    get value() {
      return selectedIndex === NONE ? '' : items[selectedIndex].value
    },
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
    markPreselected(text) {
      root.classList.add('is-preselected')
      field?.classList.add('is-preselected')
      showNotice(text)
    },
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
      button.setAttribute('aria-disabled', String(state))
      if (state) closeList({ focusButton: false })
    },
    showNotice,
    hideNotice,
  }
}
