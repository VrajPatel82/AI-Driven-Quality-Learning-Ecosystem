import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Icons } from '../shared/Icons'
import OrgBreadcrumb from '../shared/OrgBreadcrumb'
import { useAuth } from '../../context/AuthContext'

const navItems = [
  { to: '/dept-admin/overview', label: 'Overview', icon: Icons.Dashboard },
  { to: '/dept-admin/academic-admins', label: 'Academic Admins', icon: Icons.UserCog },
  { to: '/dept-admin/faculty', label: 'Faculty Management', icon: Icons.Users },
  { to: '/dept-admin/storage', label: 'Storage Quota', icon: Icons.HardDrive },
  { to: '/dept-admin/students', label: 'Student Management', icon: Icons.Users },
  { to: '/dept-admin/courses', label: 'Course Management', icon: Icons.Book },
  { to: '/dept-admin/attendance', label: 'Attendance Management', icon: Icons.Calendar },
  { to: '/dept-admin/student-issues', label: 'Student Issues', icon: Icons.AlertCircle },
  { to: '/dept-admin/analytics', label: 'Analytics & Insights', icon: Icons.BarChart },
  { to: '/dept-admin/api-performance', label: 'API Performance', icon: Icons.Activity },
  { to: '/dept-admin/policies', label: 'Policies', icon: Icons.FileText },
  { to: '/dept-admin/profile', label: 'Profile', icon: Icons.UserCog },
]

export default function DepartmentalAdminLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const getInitials = (name) => {
    if (!name) return 'DA'
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  const handleLogout = () => {
    logout()
    navigate('/signin')
  }

  return (
    <div className="flex h-screen w-full bg-gradient-to-b from-[#f2f7ff] to-white">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-[260px] max-w-[85vw] bg-white border-r border-[#e6eaf2] flex flex-col shrink-0 h-full transition-transform duration-200 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
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
              <p className="text-[12px] leading-[18px] text-[#64748b]">Dept. Admin</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto flex flex-col">
          <div className="flex flex-col gap-1 px-4 mt-8">
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
        </nav>

        <div className="mt-auto border-t border-[#e6eaf2] p-4">
          <div className="flex items-center gap-3 p-3">
            <div className="w-10 h-10 bg-[#2563eb] rounded-full flex items-center justify-center text-white font-bold text-sm">
              {getInitials(user?.name)}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-[#0f172a] truncate">{user?.name || 'Dept. Admin'}</p>
              <p className="text-xs text-[#64748b] truncate">{user?.department?.name || user?.department || 'Computer Science'}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-[#64748b] hover:bg-gray-50 hover:text-[#0f172a] transition-colors w-full mt-1">
            <Icons.Logout className="w-[18px] h-[18px]" />
            Logout
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-[80px] bg-white border-b border-[#e6eaf2] flex items-center justify-between px-4 lg:px-8 shrink-0">
          <div className="flex items-center gap-4">
            <button className="lg:hidden p-2 -ml-2 text-[#64748b] hover:text-[#0f172a]" onClick={() => setSidebarOpen(true)}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
            </button>
            <OrgBreadcrumb />
          </div>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-[#2563eb] rounded-full flex items-center justify-center text-white font-bold text-sm">
              {getInitials(user?.name)}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
