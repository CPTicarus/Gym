import {
  ClipboardIcon,
  DumbbellIcon,
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

  { to: "/moves", label: "حرکات", Icon: DumbbellIcon, roles: ["member", "trainer", "admin"] },
  { to: "/plans", label: "برنامه‌ها", Icon: ClipboardIcon, roles: ["trainer", "admin"] },
  { to: "/diet", label: "تغذیه", Icon: UtensilsIcon, roles: ["trainer", "admin"] },
  { to: "/accounting", label: "حسابداری", Icon: WalletIcon, roles: ["admin", "accounting"] },
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
