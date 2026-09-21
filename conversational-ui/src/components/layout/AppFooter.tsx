export function AppFooter() {
  return (
    <footer className="border-t border-border bg-surface-muted">
      <div className="px-4 py-4 text-center text-xs text-muted sm:px-6">
        © {new Date().getFullYear()} Under Armour, Inc. This is a demo shopping
        assistant experience.
      </div>
    </footer>
  );
}
