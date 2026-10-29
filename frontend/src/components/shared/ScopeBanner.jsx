
/**
 * ScopeBanner shows the permanent organizational boundary for University Admin or Academic Administrator.
 * Explains clearly which university or department context the user is operating in.
 */
export default function ScopeBanner({ title, subtitle, level = 'department', badgeText }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-border">
      <div>
        <div className="flex items-center gap-2.5">
          <h1 className="text-2xl font-bold text-heading">{title}</h1>
          {badgeText && (
            <span className="badge badge-info">
              {badgeText}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
