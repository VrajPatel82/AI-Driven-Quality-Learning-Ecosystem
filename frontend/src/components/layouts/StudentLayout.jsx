import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Icons } from '../shared/Icons'
import OrgBreadcrumb from '../shared/OrgBreadcrumb'
import { useAuth } from '../../context/AuthContext'

const navItems = [
  { to: '/student/dashboard', label: 'Dashboard', icon: Icons.Dashboard },
  { to: '/student/study-assistant', label: 'Study Assistant', icon: Icons.MessageSquare },
  { to: '/student/lectures', label: 'My Lectures', icon: Icons.Book },
  { to: '/student/labs', label: 'My Labs', icon: Icons.Building },
  { to: '/student/quiz', label: 'Quizzes', icon: Icons.Quiz },
  { to: '/student/assignments', label: 'Assignments', icon: Icons.FileText },
  { to: '/student/attendance', label: 'Attendance', icon: Icons.Check },
  { to: '/student/notifications', label: 'Notifications', icon: Icons.Bell },
  { to: '/student/progress', label: 'Progress', icon: Icons.TrendingUp },
  { to: '/student/profile', label: 'Profile', icon: Icons.User },
]

export default function StudentLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const getInitials = (name) => {
    if (!name) return 'ST'
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
        <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-[260px] bg-white border-r border-[#e6eaf2] flex flex-col shrink-0 h-full transition-transform duration-200 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        {/* Logo */}
        <div className="h-[80px] flex items-center px-6 border-b border-[#e6eaf2]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-b from-[#2563eb] to-[#1e40af] rounded-[14px] flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M10 2L2 7L10 12L18 7L10 2Z" fill="white" />
                <path d="M2 13L10 18L18 13" stroke="white" strokeWidth="2" />
              </svg>
            </div>
            <div>
              <p className="font-bold text-[18px] leading-[27px] text-[#0f172a]">GlobalFlow AI</p>
              <p className="text-[12px] leading-[18px] text-[#64748b]">Student Portal</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex flex-col gap-1 px-4 mt-8">
          {navItems.map((item) => {
            const isActive = location.pathname === item.to ||
              (item.to === '/student/study-assistant' && location.pathname.startsWith('/student/study-assistant')) ||
              (item.to === '/student/lectures' && location.pathname.startsWith('/student/lectures')) ||
              (item.to === '/student/labs' && location.pathname.startsWith('/student/labs')) ||
              (item.to === '/student/quiz' && location.pathname.startsWith('/student/quiz'))
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
        </nav>

        {/* User Profile at bottom */}
        <div className="mt-auto border-t border-[#e6eaf2] p-4">
          <div className="flex items-center gap-3 p-3">
            <div className="w-10 h-10 bg-[#2563eb] rounded-full flex items-center justify-center text-white font-bold text-sm">
              {getInitials(user?.name)}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-[#0f172a] truncate">{user?.name || 'Student'}</p>
              <p className="text-xs text-[#64748b] truncate">{user?.email || ''}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-[#64748b] hover:bg-gray-50 hover:text-[#0f172a] transition-colors w-full mt-1">
            <Icons.Logout className="w-[18px] h-[18px]" />
            Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-[60px] sm:h-[72px] lg:h-[80px] bg-white border-b border-[#e6eaf2] flex items-center justify-between px-3 sm:px-6 lg:px-8 shrink-0">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1 mr-2">
            <button 
              className="lg:hidden p-2 -ml-1 text-[#64748b] hover:text-[#0f172a] focus:outline-none min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0" 
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation menu"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
            </button>
            <div className="min-w-0 overflow-hidden">
              <OrgBreadcrumb />
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-9 h-9 sm:w-11 sm:h-11 bg-[#2563eb] rounded-full flex items-center justify-center text-white font-bold text-xs sm:text-sm shrink-0">
              {getInitials(user?.name)}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto p-3.5 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
