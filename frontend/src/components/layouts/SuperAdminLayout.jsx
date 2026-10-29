import { useState, useEffect } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Icons } from '../shared/Icons'
import OrgBreadcrumb from '../shared/OrgBreadcrumb'
import { useAuth } from '../../context/AuthContext'

const navItems = [
  { to: '/super-admin/overview', label: 'Overview', icon: Icons.Dashboard },
  { to: '/super-admin/universities', label: 'Universities', icon: Icons.Building },
  { to: '/super-admin/university-admins', label: 'University Admins', icon: Icons.UserCog },
  { to: '/super-admin/university-analytics', label: 'University Analytics', icon: Icons.BarChart },
  { to: '/super-admin/storage', label: 'Storage Allocation', icon: Icons.HardDrive },
  { to: '/super-admin/policies', label: 'Policies', icon: Icons.FileText },
  { to: '/super-admin/monitoring', label: 'System Monitoring', icon: Icons.Activity },
  { to: '/super-admin/security-logs', label: 'Security Logs', icon: Icons.Shield },
  { to: '/super-admin/profile', label: 'Profile & Security', icon: Icons.Lock },
]

export default function SuperAdminLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Automatically close sidebar when route changes
  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  // Close sidebar on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && sidebarOpen) {
        setSidebarOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [sidebarOpen])

  const getInitials = (name) => {
    if (!name) return 'SA'
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  const handleLogout = () => {
    setSidebarOpen(false)
    logout()
    navigate('/signin')
  }

  return (
    <div className="flex h-screen w-full bg-gradient-to-b from-[#f2f7ff] to-white overflow-hidden">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden backdrop-blur-xs transition-opacity"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-[260px] max-w-[85vw] bg-white border-r border-[#e6eaf2] flex flex-col shrink-0 h-full transition-transform duration-200 ease-in-out shadow-lg lg:shadow-none ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
        aria-label="Super Admin Sidebar"
      >
        <div className="h-12 sm:h-14 lg:h-[80px] flex items-center justify-between px-5 lg:px-6 border-b border-[#e6eaf2] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-b from-[#2563eb] to-[#1e40af] rounded-[14px] flex items-center justify-center shadow-xs shrink-0">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M10 2L2 7L10 12L18 7L10 2Z" fill="white" />
                <path d="M2 13L10 18L18 13" stroke="white" strokeWidth="2" />
              </svg>
            </div>
            <div>
              <p className="font-bold text-[17px] lg:text-[18px] leading-[24px] lg:leading-[27px] text-[#0f172a]">GlobalFlow AI</p>
              <p className="text-[12px] leading-[16px] lg:leading-[18px] text-[#64748b]">Super Admin</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-2 -mr-1 text-[#64748b] hover:text-[#0f172a] hover:bg-slate-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto overscroll-contain flex flex-col py-4">
          <div className="flex flex-col gap-1 px-3 sm:px-4">
            {navItems.map((item) => {
              const isActive = location.pathname === item.to || location.pathname.startsWith(item.to + '/')
              const IconComp = item.icon || Icons.Dashboard
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3.5 h-11 lg:h-12 rounded-[14px] text-[14px] lg:text-[15px] font-medium transition-colors ${
                    isActive
                      ? 'bg-[#eff6ff] text-[#2563eb]'
                      : 'text-[#64748b] hover:bg-slate-50 hover:text-[#0f172a]'
                  }`}
                >
                  <IconComp className="w-5 h-5 flex-shrink-0" />
                  <span className="truncate">{item.label}</span>
                  {isActive && (
                    <div className="ml-auto w-1 h-5 lg:h-6 bg-[#2563eb] rounded-full shrink-0" />
                  )}
                </NavLink>
              )
            })}
          </div>
        </nav>

        <div className="mt-auto border-t border-[#e6eaf2] p-3 sm:p-4 shrink-0 bg-white">
          <Link
            to="/super-admin/profile"
            onClick={() => setSidebarOpen(false)}
            className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 transition-colors"
          >
            <div className="w-9 h-9 lg:w-10 lg:h-10 bg-[#2563eb] rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0">
              {getInitials(user?.name)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[#0f172a] truncate">{user?.name || 'Super Admin'}</p>
              <p className="text-xs text-[#64748b] truncate">{user?.email || 'Platform Owner'}</p>
            </div>
          </Link>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-[#64748b] hover:bg-red-50 hover:text-red-600 transition-colors w-full mt-1"
          >
            <Icons.Logout className="w-[18px] h-[18px] shrink-0" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-12 sm:h-14 lg:h-[80px] bg-white border-b border-[#e6eaf2] flex items-center justify-between px-3 sm:px-6 lg:px-8 shrink-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              type="button"
              aria-label="Open navigation menu"
              className="lg:hidden p-1.5 -ml-1 text-[#64748b] hover:text-[#0f172a] hover:bg-slate-100 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
              onClick={() => setSidebarOpen(true)}
            >
              <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16"/>
              </svg>
            </button>
            <div className="flex items-center gap-1.5 sm:gap-2 lg:hidden min-w-0">
              <div className="w-6 h-6 sm:w-7 sm:h-7 bg-gradient-to-b from-[#2563eb] to-[#1e40af] rounded-lg flex items-center justify-center shrink-0 shadow-xs">
                <svg width="12" height="12" viewBox="0 0 20 20" fill="none">
                  <path d="M10 2L2 7L10 12L18 7L10 2Z" fill="white" />
                  <path d="M2 13L10 18L18 13" stroke="white" strokeWidth="2" />
                </svg>
              </div>
              <span className="font-bold text-xs sm:text-base text-[#0f172a] truncate">GlobalFlow AI</span>
            </div>
            <OrgBreadcrumb />
          </div>
          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
            <Link
              to="/super-admin/profile"
              aria-label="View Profile"
              className="w-7 h-7 sm:w-9 sm:h-9 lg:w-11 lg:h-11 bg-[#2563eb] hover:bg-[#1d4ed8] rounded-full flex items-center justify-center text-white font-bold text-[11px] sm:text-xs lg:text-sm shadow-xs transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              {getInitials(user?.name)}
            </Link>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto overflow-x-hidden p-2.5 sm:p-5 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
