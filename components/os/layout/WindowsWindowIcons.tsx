/** Windows-style caption icons — single square = maximize, stacked squares = restore. */

type IconProps = {
  size?: number;
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
};

/** Hollow square — maximize (window not maximized). */
export function WindowsMaximizeIcon({ size = 15, className, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.35"
      className={className}
      {...rest}
    >
      <rect x="3" y="3" width="10" height="10" rx="1" />
    </svg>
  );
}

/** Two overlapping squares — restore down (window maximized). */
export function WindowsRestoreIcon({ size = 15, className, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.35"
      className={className}
      {...rest}
    >
      {/* Back window: top + right edges only (Windows caption style) */}
      <path d="M5.5 3.25h6.25a1 1 0 0 1 1 1V10.5" />
      {/* Front window */}
      <rect x="2.75" y="5.5" width="8.5" height="8.5" rx="1" />
    </svg>
  );
}
