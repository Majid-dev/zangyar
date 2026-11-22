import type { NavIconName } from "./nav-items";

const iconPaths: Record<NavIconName, React.ReactNode> = {
  dashboard: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>,
  students: <><path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20" /><circle cx="10" cy="8" r="3" /><path d="M16 11a3 3 0 0 0 0-6" /><path d="M18 15a3.5 3.5 0 0 1 2 3.5V20" /></>,
  classrooms: <><path d="M4 20V7l8-4 8 4v13" /><path d="M2 20h20" /><path d="M8 20v-5h8v5" /><path d="M8 9h.01M12 9h.01M16 9h.01M8 12h.01M12 12h.01M16 12h.01" /></>,
  academics: <><path d="M4 5h6a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H4z" /><path d="M20 5h-6a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h6z" /><path d="M7 9h2M15 9h2M7 13h2M15 13h2" /></>,
  attendance: <><path d="M4 12.5 9 17l11-11" /><circle cx="12" cy="12" r="9" /></>,
  activities: <><path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7z" /><path d="m19 16 .6 1.9L21.5 18l-1.9.6L19 20.5l-.6-1.9-1.9-.6 1.9-.6z" /></>,
  notifications: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
};

export function NavIcon({ name }: { name: NavIconName }) {
  return <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{iconPaths[name]}</svg>;
}
