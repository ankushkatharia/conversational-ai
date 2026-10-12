export function TypingIndicator({ label = "Assistant is typing" }: { label?: string }) {
  return (
    <div className="flex items-center gap-1" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          aria-hidden="true"
          className="h-2 w-2 rounded-full bg-muted"
          style={{ animation: "ua-bounce 1.2s infinite", animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}
