"use client";

export default function ThemeToggle({ className = "" }: { className?: string }) {
  function toggle() {
    const isDark = document.documentElement.classList.toggle("dark");
    try {
      localStorage.setItem("theme", isDark ? "dark" : "light");
    } catch {}
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle theme"
      className={`group relative flex h-7 w-14 shrink-0 cursor-pointer items-center rounded-full bg-linear-to-br from-sky-300 to-blue-400 p-0.5 shadow-[inset_0_1px_3px_rgba(0,0,0,0.1)] transition-all duration-300 dark:from-indigo-950 dark:to-indigo-800 dark:shadow-[inset_0_1px_3px_rgba(0,0,0,0.4)] ${className}`}
    >
      {/* Stars visible in dark mode */}
      <span className="pointer-events-none absolute right-2 top-1 opacity-0 transition-opacity duration-300 dark:opacity-100">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="3" cy="4" r="0.8" fill="#e2e8f0" opacity="0.9" />
          <circle cx="8" cy="2" r="0.5" fill="#e2e8f0" opacity="0.6" />
          <circle cx="12" cy="6" r="0.6" fill="#e2e8f0" opacity="0.7" />
        </svg>
      </span>

      {/* Thumb */}
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-linear-to-br from-amber-300 to-amber-500 shadow-[0_0_10px_rgba(251,191,36,0.5),0_1px_3px_rgba(0,0,0,0.15)] transition-all duration-300 dark:translate-x-7 dark:from-violet-300 dark:to-violet-400 dark:shadow-[0_0_10px_rgba(167,139,250,0.5),0_1px_3px_rgba(0,0,0,0.3)]">
        {/* Sun icon (light) */}
        <svg
          className="h-3 w-3 text-amber-800 dark:hidden"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="5" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
        {/* Moon icon (dark) */}
        <svg
          className="hidden h-3 w-3 text-indigo-900 dark:block"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      </span>
    </button>
  );
}
