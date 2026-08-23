/**
 * The committee grid's entry animation, and nothing else.
 *
 * This module used to run a horizontal rail: arrow buttons, a position readout,
 * a progress bar, drag-to-scroll, a wheel hijack, arrow-key handling, a
 * focusin scroll-into-view and an elementFromPoint hover sync. All twelve
 * committees are on the page at once now, so none of it has anything to drive.
 * The hover sync in particular only existed because CSS :hover goes stale when
 * content slides under a stationary pointer, which cannot happen in a grid.
 */
export function initCommittees({ gsap, ScrollTrigger, reduced }) {
  if (reduced) return

  const grid = document.querySelector('[data-committees-grid]')
  if (!grid) return

  const items = Array.from(grid.querySelectorAll('[data-committee]'))
  if (!items.length) return

  // No rotation. The rail used to tilt each card 0.6deg on the way in, which
  // its own overflow clipped; in a grid the tilted corners hang 2px outside the
  // shell and make every measurement of a card disagree with its layout box.
  gsap.set(items, { opacity: 0, y: 26 })

  // Batched rather than one trigger on the grid: four rows of three stand about
  // 1400px tall, and a single trigger would spend the bottom two rows' animation
  // while they are still below the fold.
  ScrollTrigger.batch(items, {
    start: 'top 94%',
    once: true,
    onEnter: (batch) =>
      gsap.to(batch, {
        opacity: 1,
        y: 0,
        duration: 1.15,
        ease: 'expo.out',
        stagger: 0.075,
        overwrite: true,
        clearProps: 'transform',
      }),
  })
}
