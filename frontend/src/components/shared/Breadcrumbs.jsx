import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

/**
 * Reusable Breadcrumbs component that displays organizational hierarchy
 * e.g. ABC University / Engineering / Computer Engineering / Students
 */
export default function Breadcrumbs({ items = [] }) {
  const { user } = useAuth();

  // Extract names safely
  const universityName = user?.university?.name || user?.universityName || 'University';
  const institutionName = user?.institution?.name || user?.institutionName || 'Institution';
  const departmentName = user?.department?.name || user?.departmentName || 'Department';

  return (
    <nav className="flex items-center text-xs md:text-sm text-slate-500 mb-3 sm:mb-4 py-1">
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Scope Context Pills if available */}
        {user?.role === 'academic_administrator' && (
          <>
            <span className="font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-xs">
              {departmentName}
            </span>
            <span className="text-slate-400">/</span>
          </>
        )}
        {user?.role === 'university_admin' && (
          <>
            <span className="font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded text-xs">
              {universityName}
            </span>
            <span className="text-slate-400">/</span>
          </>
        )}

        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <div key={index} className="flex items-center gap-1.5 shrink-0">
              {item.to && !isLast ? (
                <Link to={item.to} className="hover:text-blue-600 transition-colors">
                  {item.label}
                </Link>
              ) : (
                <span className={isLast ? 'font-medium text-slate-800' : ''}>
                  {item.label}
                </span>
              )}
              {!isLast && <span className="text-slate-400">/</span>}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
