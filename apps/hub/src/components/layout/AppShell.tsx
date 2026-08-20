import { Suspense, useState } from 'react'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import * as Tooltip from '@radix-ui/react-tooltip'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { LogOut, MoreHorizontal } from 'lucide-react'
import { useAuth } from '@/providers/AuthProvider'
import { navFor, type NavItem } from './navigation'
import { ConnectionPill } from './ConnectionPill'
import { ConferencePill } from '@/features/conference/ConferencePill'
import { UpdatePrompt } from './UpdatePrompt'
import { Button } from '@/components/ui/Button'
import { RoleBadge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { PageSkeleton } from '@/components/ui/States'
import { asset, cn, initialsOf } from '@/lib/utils'

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">

      <img
        src={asset("logo.png")}
        alt=""
        aria-hidden
        width={36}
        height={36}
        className="size-9 shrink-0 object-contain"
      />
      {!compact ? (
        <span className="min-w-0">
          <span className="block truncate font-heading text-h3 text-ink-inverted">LRI MUN X</span>
          <span className="block truncate text-label uppercase text-ink-tertiary">Operations Hub</span>
        </span>
      ) : null}
    </div>
  )
}

const NAV_LINK_BASE = cn(
  'relative flex items-center gap-3 rounded-control px-3 text-body font-medium',
  'min-h-tap md:min-h-11',
  'transition-colors duration-micro ease-out',
)

function SidebarLink({ item, compact }: { item: NavItem; compact: boolean }) {
  const Icon = item.icon

  const link = (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        cn(
          NAV_LINK_BASE,
          compact && 'justify-center px-0',
          isActive
            ?
              'bg-white/5 text-ink-inverted before:absolute before:inset-y-1.5 before:left-0 before:w-rule before:rounded-pill before:bg-accent-bright'
            : 'text-ink-tertiary hover:bg-white/5 hover:text-ink-inverted',
        )
      }
    >
      <Icon size={20} className="shrink-0" aria-hidden />
      {compact ? <span className="sr-only">{item.label}</span> : <span className="truncate">{item.label}</span>}
    </NavLink>
  )

  if (!compact) return link

  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{link}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="right"
          sideOffset={8}
          className="z-50 rounded-control border border-edge bg-surface px-2.5 py-1.5 text-body-sm text-ink shadow-overlay"
        >
          {item.label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}

export function AppShell() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)

  const rail = !useMediaQuery('(min-width: 1024px)')

  if (!user) return null

  const items = navFor(user)
  const primary = items.filter((item) => item.primary)
  const overflow = items.filter((item) => !item.primary)

  return (
    <Tooltip.Provider delayDuration={300}>
      <div className="flex min-h-dvh bg-canvas">

        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-30 hidden flex-col bg-surface-inverted',
            'md:flex md:w-rail lg:w-sidebar',
          )}
        >
          <div className="flex h-16 items-center px-3 lg:px-4">
            <BrandMark compact={rail} />
          </div>

          <nav aria-label="Main" className="flex-1 overflow-y-auto px-2 py-2 lg:px-3">
            <ul className="flex flex-col gap-1">
              {items.map((item) => (
                <li key={item.to}>
                  <SidebarLink item={item} compact={rail} />
                </li>
              ))}
            </ul>
          </nav>

          <div className="border-t border-white/10 p-2 lg:p-3">
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-center gap-3 rounded-control px-2 py-2 text-left',
                    'min-h-tap md:min-h-11 transition-colors duration-micro hover:bg-white/5',
                  )}
                >
                  <span
                    aria-hidden
                    className="grid size-8 shrink-0 place-items-center rounded-pill bg-white/10 text-body-sm font-medium text-ink-inverted"
                  >
                    {initialsOf(user.fullName)}
                  </span>
                  <span className="hidden min-w-0 flex-1 lg:block">
                    <span className="block truncate text-body-sm text-ink-inverted">{user.fullName}</span>
                    <span className="block truncate text-label uppercase text-ink-tertiary">
                      {user.role === 'ADMIN' ? 'Admin' : 'Contributor'}
                    </span>
                  </span>
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  side="top"
                  align="start"
                  sideOffset={8}
                  className="z-50 min-w-[200px] rounded-card border border-edge bg-surface p-1 shadow-overlay"
                >
                  <DropdownMenu.Item
                    onSelect={() => void logout()}
                    className="flex min-h-tap cursor-pointer items-center gap-2 rounded-control px-3 text-body-sm text-ink outline-none data-[highlighted]:bg-surface-sunken md:min-h-10"
                  >
                    <LogOut size={16} aria-hidden />
                    Sign out
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col md:ml-rail lg:ml-sidebar">
          <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-edge bg-canvas/95 px-4 backdrop-blur md:px-8">
            <span className="md:hidden"><BrandMark compact /></span>
            <span className="hidden md:block" />
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <ConferencePill />
              <ConnectionPill />
              <span className="hidden lg:block"><RoleBadge role={user.role} /></span>
            </div>
          </header>

          <main
            id="main"
            className={cn(
              'mx-auto w-full max-w-app flex-1 px-4 py-6 md:px-8 md:py-8',
              'pb-[calc(theme(spacing.tabbar)+env(safe-area-inset-bottom)+24px)] md:pb-8',
            )}
          >

            <Suspense fallback={<PageSkeleton />}>
              <Outlet />
            </Suspense>
          </main>
        </div>

        <nav
          aria-label="Main"
          className="fixed inset-x-0 bottom-0 z-30 border-t border-edge bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
        >
          <ul className="flex h-tabbar items-stretch">
            {primary.map((item) => {
              const Icon = item.icon
              return (
                <li key={item.to} className="flex-1">
                  <NavLink
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) =>
                      cn(
                        'relative flex h-full min-h-tap flex-col items-center justify-center gap-0.5 px-1',
                        'transition-colors duration-micro ease-out',
                        isActive ? 'text-accent' : 'text-ink-secondary',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive ? <span aria-hidden className="absolute top-0 h-rule w-10 rounded-pill bg-accent" /> : null}
                        <Icon size={20} aria-hidden />
                        <span className="text-label uppercase">{item.label}</span>
                      </>
                    )}
                  </NavLink>
                </li>
              )
            })}

            {overflow.length > 0 ? (
              <li className="flex-1">
                <button
                  type="button"
                  onClick={() => setMoreOpen(true)}
                  aria-haspopup="dialog"
                  className={cn(
                    'flex h-full w-full min-h-tap flex-col items-center justify-center gap-0.5 px-1',
                    overflow.some((item) => item.to === location.pathname) ? 'text-accent' : 'text-ink-secondary',
                  )}
                >
                  <MoreHorizontal size={20} aria-hidden />
                  <span className="text-label uppercase">More</span>
                </button>
              </li>
            ) : null}
          </ul>
        </nav>

        <Modal open={moreOpen} onOpenChange={setMoreOpen} title="More">
          <ul className="flex flex-col gap-1">
            {overflow.map((item) => {
              const Icon = item.icon
              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    onClick={() => setMoreOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        NAV_LINK_BASE,
                        isActive ? 'bg-accent-wash text-accent' : 'text-ink hover:bg-surface-sunken',
                      )
                    }
                  >
                    <Icon size={20} aria-hidden />
                    {item.label}
                  </NavLink>
                </li>
              )
            })}
            <li className="mt-2 border-t border-edge pt-2">
              <Button variant="secondary" className="w-full" onClick={() => void logout()}>
                <LogOut size={16} aria-hidden />
                Sign out
              </Button>
            </li>
          </ul>
        </Modal>

        <UpdatePrompt />
      </div>
    </Tooltip.Provider>
  )
}
