import { useState } from 'react'
import { NavLink, Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { Icons } from '../shared/Icons'
import OrgBreadcrumb from '../shared/OrgBreadcrumb'
import { useAuth } from '../../context/AuthContext'

const navItems = [
  { to: '/professor/dashboard', icon: Icons.Dashboard, label: 'Dashboard' },
  { to: '/professor/upload', icon: Icons.Upload, label: 'Upload' },
  { to: '/professor/storage', icon: Icons.HardDrive, label: 'My Storage' },
  { to: '/professor/my-lectures', icon: Icons.Book, label: 'My Lectures' },
  { to: '/professor/my-labs', icon: Icons.Building, label: 'My Labs' },
  { to: '/professor/quiz-builder', icon: Icons.FileText, label: 'Quiz' },
  { to: '/professor/assignments', icon: Icons.FileText, label: 'Assignments' },
  { to: '/professor/attendance', icon: Icons.Check, label: 'Attendance' },
  { to: '/professor/gradebook', icon: Icons.BarChart, label: 'Gradebook' },
  { to: '/professor/students', icon: Icons.Users, label: 'Students' },
  { to: '/professor/analytics', icon: Icons.Activity, label: 'Analytics' },
  { to: '/professor/settings', icon: Icons.Settings, label: 'Settings' },
]

export default function ProfessorLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const getInitials = (name) => {
    if (!name) return 'PR'
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  const handleLogout = () => {
    logout()
    navigate('/signin')
  }

  return (
    <div className="flex h-screen w-full bg-gradient-to-b from-[#f2f7ff] to-white">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 lg:hidden backdrop-blur-xs transition-opacity" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-[260px] bg-white border-r border-[#e6eaf2] flex flex-col shrink-0 h-full transition-transform duration-200 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        {/* Logo & Header */}
        <div className="h-16 lg:h-[80px] flex items-center justify-between px-6 border-b border-[#e6eaf2]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 lg:w-10 lg:h-10 bg-gradient-to-b from-[#2563eb] to-[#1e40af] rounded-[14px] flex items-center justify-center shrink-0">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M10 2L2 7L10 12L18 7L10 2Z" fill="white" />
                <path d="M2 13L10 18L18 13" stroke="white" strokeWidth="2" />
              </svg>
            </div>
            <div>
              <p className="font-bold text-[17px] lg:text-[18px] leading-tight text-[#0f172a]">GlobalFlow AI</p>
              <p className="text-[12px] leading-tight text-[#64748b]">Professor Portal</p>
            </div>
          </div>
          {/* Close button for mobile drawer */}
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1.5 text-[#64748b] hover:text-[#0f172a] hover:bg-slate-100 rounded-lg transition-colors focus:outline-none"
            aria-label="Close menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto flex flex-col">
          <div className="flex flex-col gap-1 px-4 mt-6 lg:mt-8">
            {navItems.map((item) => {
              const isActive = location.pathname === item.to || location.pathname.startsWith(item.to + '/')
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-4 h-12 rounded-[14px] text-[15px] transition-colors ${
                    isActive
                      ? 'bg-[#eff6ff] text-[#2563eb]'
                      : 'text-[#64748b] hover:bg-gray-50'
                  }`}
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  <span>{item.label}</span>
                  {isActive && (
                    <div className="ml-auto w-1 h-6 bg-[#2563eb] rounded-full" />
                  )}
                </NavLink>
              )
            })}
          </div>

          {/* Quick Upload CTA */}
          <div className="px-4 mt-4 pb-4">
            <Link to="/professor/upload" onClick={() => setSidebarOpen(false)} className="block bg-[#2563eb] rounded-[14px] p-4 text-white no-underline hover:bg-[#1e40af] transition-colors">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center mb-2">
                <Icons.Upload className="w-4 h-4" />
              </div>
              <p className="text-[14px] font-bold">Quick Upload</p>
              <p className="text-[11px] text-white/70">Upload material in seconds</p>
            </Link>
          </div>
        </nav>

        {/* User Profile at bottom */}
        <div className="mt-auto border-t border-[#e6eaf2] p-4">
          <div className="flex items-center gap-3 p-3">
            <div className="w-10 h-10 bg-[#2563eb] rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0">
              {getInitials(user?.name)}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-[#0f172a] truncate">{user?.name || 'Professor'}</p>
              <p className="text-xs text-[#64748b] truncate">{user?.department?.name || user?.department || 'Computer Science'}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-[#64748b] hover:bg-gray-50 hover:text-[#0f172a] transition-colors w-full mt-1">
            <Icons.Logout className="w-[18px] h-[18px]" />
            Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Header */}
        <header className="h-16 lg:h-[80px] bg-white border-b border-[#e6eaf2] flex items-center justify-between px-3 sm:px-6 lg:px-8 shrink-0">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            {/* Hamburger Button (Mobile / Tablet) */}
            <button
              className="lg:hidden p-1.5 -ml-1 text-[#64748b] hover:text-[#0f172a] hover:bg-slate-100 rounded-lg transition-colors focus:outline-none"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open Navigation Menu"
            >
              <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16"/>
              </svg>
            </button>

            {/* Mobile Branding (hidden on desktop where sidebar is visible) */}
            <div className="flex items-center gap-2 lg:hidden min-w-0">
              <div className="w-7 h-7 sm:w-8 sm:h-8 bg-gradient-to-b from-[#2563eb] to-[#1e40af] rounded-[10px] flex items-center justify-center shrink-0 shadow-xs">
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                  <path d="M10 2L2 7L10 12L18 7L10 2Z" fill="white" />
                  <path d="M2 13L10 18L18 13" stroke="white" strokeWidth="2" />
                </svg>
              </div>
              <span className="font-bold text-sm sm:text-base text-[#0f172a] truncate">GlobalFlow AI</span>
            </div>

            {/* Desktop Breadcrumb */}
            <div className="hidden lg:block min-w-0">
              <OrgBreadcrumb />
            </div>
          </div>

          {/* Right Profile / Avatar */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <Link
              to="/professor/settings"
              aria-label="Professor Profile"
              className="w-8 h-8 sm:w-10 sm:h-10 lg:w-11 lg:h-11 bg-[#2563eb] hover:bg-[#1d4ed8] rounded-full flex items-center justify-center text-white font-bold text-xs sm:text-sm shadow-xs transition-colors shrink-0 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              {getInitials(user?.name)}
            </Link>
          </div>
        </header>

        {/* Breadcrumb strip for Mobile / Tablet (< lg) */}
        <div className="lg:hidden px-3 sm:px-6 py-1.5 bg-white/70 border-b border-[#e6eaf2] flex items-center min-w-0 overflow-hidden">
          <OrgBreadcrumb />
        </div>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-5 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
