import {
  ClipboardList, FileClock, Globe2, Inbox, LayoutDashboard, Landmark, PackageSearch, Settings,
  UserCheck, Users, UsersRound,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Role } from '@/types/api'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  roles: Role[]

  primary?: boolean

  requires?: 'canManageUsers'
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['ADMIN', 'CONTRIBUTOR'], primary: true },
  { to: '/delegates', label: 'Delegates', icon: Users, roles: ['ADMIN', 'CONTRIBUTOR'], primary: true },
  { to: '/logistics', label: 'Logistics', icon: PackageSearch, roles: ['ADMIN', 'CONTRIBUTOR'], primary: true },
  { to: '/attendance', label: 'Attendance', icon: UserCheck, roles: ['ADMIN', 'CONTRIBUTOR'], primary: true },
  { to: '/registrations', label: 'Registrations', icon: Inbox, roles: ['ADMIN', 'CONTRIBUTOR'] },
  { to: '/allocations', label: 'Allocations', icon: ClipboardList, roles: ['ADMIN'] },
  { to: '/committees', label: 'Committees', icon: Landmark, roles: ['ADMIN', 'CONTRIBUTOR'] },
  { to: '/matrix', label: 'Country matrix', icon: Globe2, roles: ['ADMIN', 'CONTRIBUTOR'] },
  { to: '/settings', label: 'Settings', icon: Settings, roles: ['ADMIN'] },
  { to: '/users', label: 'Users', icon: UsersRound, roles: ['ADMIN'], requires: 'canManageUsers' },
  { to: '/audit', label: 'Audit log', icon: FileClock, roles: ['ADMIN'] },
]

export function navFor(user: { role: Role; canManageUsers?: boolean }): NavItem[] {
  return NAV_ITEMS.filter(
    (item) =>
      item.roles.includes(user.role) &&
      (item.requires !== 'canManageUsers' || user.canManageUsers === true),
  )
}
