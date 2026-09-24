import {
  AppleIcon,
  ClipboardIcon,
  DumbbellIcon,
  FlaskIcon,
  HeartPulseIcon,
  NewspaperIcon,
  SettingsIcon,
  UsersIcon,
  UtensilsIcon,
  WalletIcon,
} from "../components/common/icons.jsx";

// Single source of truth for the sidebar/drawer nav — both the layout and
// the router read from this so a role's visible links and its reachable
// routes never drift apart.
export const NAV_ITEMS = [
  { to: "/dashboard", label: "داشبورد", Icon: UsersIcon, roles: ["trainer", "admin", "accounting"] },

  // Members get read-only views of what's been assigned to them; staff get
  // the builders. Different routes, so both can sit in one nav list.
  { to: "/my-plans", label: "برنامه من", Icon: ClipboardIcon, roles: ["member"] },
  { to: "/my-diet", label: "تغذیه من", Icon: UtensilsIcon, roles: ["member"] },
  // Shown to every member even though most have no protocol — the page
  // explains that having none is normal, which is better than a link that
  // silently appears only for the few who do.
  { to: "/my-supplements", label: "مکمل من", Icon: FlaskIcon, roles: ["member"] },
  { to: "/my-body", label: "بدن من", Icon: HeartPulseIcon, roles: ["member"] },

  { to: "/moves", label: "حرکات", Icon: DumbbellIcon, roles: ["member", "trainer", "admin"] },
  { to: "/plans", label: "برنامه‌ها", Icon: ClipboardIcon, roles: ["trainer", "admin"] },
  // The food library sits in front of the diet builder the way moves sit in
  // front of plans: build the library, then build plans from it. Staff
  // only — members see each food's numbers inside their own plan.
  { to: "/foods", label: "خوراکی‌ها", Icon: AppleIcon, roles: ["trainer", "admin"] },
  { to: "/diet", label: "تغذیه", Icon: UtensilsIcon, roles: ["trainer", "admin"] },
  { to: "/supplements", label: "مکمل‌ها", Icon: FlaskIcon, roles: ["trainer", "admin"] },
  { to: "/accounting", label: "حسابداری", Icon: WalletIcon, roles: ["admin", "accounting"] },

  // The blog is the one section every role shares — staff write, everyone reads.
  {
    to: "/blog",
    label: "بلاگ",
    Icon: NewspaperIcon,
    roles: ["member", "trainer", "admin", "accounting"],
  },
  {
    to: "/settings",
    label: "تنظیمات",
    Icon: SettingsIcon,
    roles: ["member", "trainer", "admin", "accounting"],
  },
];

// Staff roles land on the user dashboard; members land on their own plan.
export function getRoleHome(role) {
  return role === "member" ? "/my-plans" : "/dashboard";
}
