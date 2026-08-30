/**
 * Reusable placeholder for nav destinations that exist in routing/the
 * side menu but aren't built yet (workout-plan builder, diet-plan
 * builder). Keeps every menu item a real, working link instead of a
 * dead end, without pretending the feature exists.
 */
export default function ComingSoonPage({ title, description }) {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{title}</h1>
          <p className="page-subtitle">{description}</p>
        </div>
      </div>
      <div className="empty-state">
        <p>این بخش هنوز آماده نشده — به‌زودی اضافه می‌شود.</p>
      </div>
    </div>
  );
}
