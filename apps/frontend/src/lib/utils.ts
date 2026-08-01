import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/** Turns an enum-ish value like CHECKED_IN into "Checked in". */
export function humanise(value: string): string {
  const lower = value.toLowerCase().replace(/_/g, ' ')
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function initialsOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : ''
  return (first + last).toUpperCase()
}

export function pluralise(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}

/**
 * Resolves a file from `public/` against the app's base path.
 *
 * The hub is served under /admin, and Vite only rewrites absolute asset URLs it
 * can see — those in index.html and in imported modules. A bare "/logo.png" in
 * JSX is just a string, so it survives the build untouched and then resolves
 * against the domain root, where the public conference site lives and the file
 * does not exist. That is why the crest 404'd in production but looked fine in
 * a root-served dev build.
 */
export function asset(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`
}
