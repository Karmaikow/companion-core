import type { Tab } from '../store';

const P: Record<Tab, string> = {
  chat: 'M4 5h16v10H9l-5 4z',
  memories: 'M12 3l2.5 5 5.5.8-4 3.9.9 5.5L12 15.6 7.1 18.2l.9-5.5-4-3.9 5.5-.8z',
  diary: 'M6 3h11a2 2 0 012 2v16H8a2 2 0 01-2-2zM6 19a2 2 0 012-2h11M10 7h6M10 10h5',
  quests: 'M7 3h10v4a5 5 0 01-10 0zM12 12v5M8 21h8M9 17h6M7 5H4a3 3 0 003 4M17 5h3a3 3 0 01-3 4',
  inventory: 'M5 8h14l-1 12H6zM9 8V6a3 3 0 016 0v2',
  recipes: 'M5 11h14v2a7 7 0 01-14 0zM3 11h18M9 8c0-1.5 1.2-2 1.2-3.5M14 8c0-1.5 1.2-2 1.2-3.5',
  skills: 'M12 21V10M12 10L6 5M12 10l6-5M12 15l-5-3M12 15l5-3M6 5a1.5 1.5 0 100-.1M18 5a1.5 1.5 0 100-.1',
  bond: 'M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z',
  settings: 'M12 8.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7zM12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1',
};

export function Icon({ tab, size = 22 }: { tab: Tab; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={P[tab]} />
    </svg>
  );
}
