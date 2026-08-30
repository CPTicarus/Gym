function IconBase({ size = 22, children, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export function DumbbellIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M6.5 6.5v11" />
      <path d="M17.5 6.5v11" />
      <path d="M4 9v6" />
      <path d="M20 9v6" />
      <path d="M6.5 12h11" />
    </IconBase>
  );
}

export function PlusIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </IconBase>
  );
}

export function LogOutIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" />
      <path d="M15 16l4-4-4-4" />
      <path d="M19 12H9" />
    </IconBase>
  );
}

export function SunIcon(props) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="M4.9 4.9l1.4 1.4" />
      <path d="M17.7 17.7l1.4 1.4" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="M4.9 19.1l1.4-1.4" />
      <path d="M17.7 6.3l1.4-1.4" />
    </IconBase>
  );
}

export function MoonIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
    </IconBase>
  );
}

export function UsersIcon(props) {
  return (
    <IconBase {...props}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19c.7-3 3-5 5.5-5s4.8 2 5.5 5" />
      <circle cx="17" cy="8.5" r="2.3" />
      <path d="M15.5 12c2 .3 3.7 1.9 4.3 4.2" />
    </IconBase>
  );
}

export function ClipboardIcon(props) {
  return (
    <IconBase {...props}>
      <rect x="5" y="4.5" width="14" height="16" rx="2" />
      <path d="M9 4.5V3.8A1.8 1.8 0 0 1 10.8 2h2.4A1.8 1.8 0 0 1 15 3.8v.7" />
      <path d="M8.5 11h7" />
      <path d="M8.5 14.5h7" />
      <path d="M8.5 18h4.5" />
    </IconBase>
  );
}

export function UtensilsIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M6 3v7a2 2 0 0 0 2 2v9" />
      <path d="M6 3v5" />
      <path d="M9 3v5" />
      <path d="M18 3c-1.7 0-3 2-3 5s1.3 5 3 5" />
      <path d="M18 3v18" />
    </IconBase>
  );
}

export function WalletIcon(props) {
  return (
    <IconBase {...props}>
      <rect x="3" y="6.5" width="18" height="12" rx="2" />
      <path d="M3 10h18" />
      <circle cx="16.5" cy="14" r="1.1" fill="currentColor" stroke="none" />
    </IconBase>
  );
}

export function SettingsIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M4 6h10" />
      <circle cx="17" cy="6" r="2" />
      <path d="M14 12h6" />
      <circle cx="8" cy="12" r="2" />
      <path d="M4 18h10" />
      <circle cx="17" cy="18" r="2" />
    </IconBase>
  );
}

export function TrashIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M4 7h16" />
      <path d="M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7" />
      <path d="M6.5 7l.8 12a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9l.8-12" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </IconBase>
  );
}

export function MenuIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h16" />
    </IconBase>
  );
}

export function XIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </IconBase>
  );
}
