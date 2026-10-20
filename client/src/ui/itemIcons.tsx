/**
 * Ícones dos itens do inventário — desenhos vetoriais originais, leves e nítidos
 * em qualquer tamanho. `tint` é a cor do Companion (quando o item tem cor própria).
 */
import type { ReactElement } from 'react';

const INK = '#2a1b10';
const GOLD = '#e8c27a';
const GOLD_D = '#a8803e';

type Draw = (tint: string) => ReactElement;

const ICONS: Record<string, Draw> = {
  // --- quests fundamentais ---
  placa_do_nome: () => (
    <>
      <path d="M24 6v8" stroke={INK} strokeWidth="2.5" />
      <path d="M17 14l7-6 7 6" fill="none" stroke={GOLD_D} strokeWidth="2" />
      <rect x="7" y="14" width="34" height="20" rx="4" fill="#9a6338" stroke={INK} strokeWidth="2.5" />
      <path d="M11 20h26M11 28h26" stroke="#7a4a28" strokeWidth="1.5" />
      <path d="M15 24h18" stroke="#fff3c4" strokeWidth="3" strokeLinecap="round" />
      <path d="M24 34v8" stroke={INK} strokeWidth="2.5" />
    </>
  ),
  pigmento_da_alma: (t) => (
    <>
      <rect x="19" y="5" width="10" height="7" rx="2" fill="#8a5a3a" stroke={INK} strokeWidth="2" />
      <path d="M20 12v6c-7 3-11 8-11 14a15 15 0 0 0 30 0c0-6-4-11-11-14v-6z" fill="#dfe9f5" fillOpacity=".35" stroke={INK} strokeWidth="2.5" />
      <path d="M11.5 30a12.5 12.5 0 0 0 25 0c0-1.5-.3-2.8-.8-4H12.3c-.5 1.2-.8 2.5-.8 4z" fill={t} />
      <circle cx="18" cy="31" r="2.5" fill="#fff" fillOpacity=".8" />
    </>
  ),
  espelho_interior: () => (
    <>
      <path d="M24 33v10" stroke={INK} strokeWidth="5" strokeLinecap="round" />
      <path d="M24 33v10" stroke="#9a6338" strokeWidth="2.5" strokeLinecap="round" />
      <ellipse cx="24" cy="19" rx="13" ry="15" fill={GOLD} stroke={INK} strokeWidth="2.5" />
      <ellipse cx="24" cy="19" rx="9" ry="11" fill="#b9d6f2" />
      <path d="M19 13l4-3M18 18l9-7" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  molde_de_forma: (t) => (
    <>
      <rect x="6" y="8" width="36" height="32" rx="5" fill="#3a2a4a" stroke={INK} strokeWidth="2.5" />
      <path d="M15 34c0-6 4-9 9-9s9 3 9 9M24 25a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM18 15l-2-5M30 15l2-5" fill="none" stroke={t} strokeWidth="2.5" strokeDasharray="3 2.5" strokeLinecap="round" />
    </>
  ),
  cristal_elemental: (t) => (
    <>
      <path d="M24 4l11 13-11 27L13 17z" fill={t} stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M13 17h22M24 4v40" stroke={INK} strokeOpacity=".35" strokeWidth="1.5" />
      <path d="M19 12l5-6" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
    </>
  ),
  fio_do_laco: () => (
    <>
      <path d="M24 40C10 31 6 23 9 16c3-6 11-6 15 1 4-7 12-7 15-1 3 7-1 15-15 24z" fill="none" stroke={GOLD} strokeWidth="3.5" strokeLinejoin="round" />
      <path d="M24 40C10 31 6 23 9 16c3-6 11-6 15 1" fill="none" stroke={GOLD_D} strokeWidth="1.2" />
      <path d="M24 17c-3 6-2 12 8 20" fill="none" stroke={GOLD} strokeWidth="2" strokeDasharray="2 3" />
    </>
  ),
  semente_do_sonho: () => (
    <>
      <path d="M24 26c0-6 3-10 9-12-1 6-4 10-9 12z" fill="#7bc46b" stroke={INK} strokeWidth="2" />
      <path d="M24 28c0-5-3-8-8-9 1 5 3 8 8 9z" fill="#5aa35a" stroke={INK} strokeWidth="2" />
      <ellipse cx="24" cy="36" rx="9" ry="7" fill="#b07a4a" stroke={INK} strokeWidth="2.5" />
      <path d="M24 29v4" stroke={INK} strokeWidth="2" />
      <circle cx="20" cy="34" r="1.5" fill="#fff3c4" />
    </>
  ),
  // --- segredos (raros) ---
  lanterna_lunar: () => (
    <>
      <path d="M24 4v5" stroke={INK} strokeWidth="2.5" />
      <path d="M16 12h16l-2-3H18z" fill="#4a3a5a" stroke={INK} strokeWidth="2" />
      <rect x="15" y="12" width="18" height="24" rx="3" fill="#20294a" stroke={INK} strokeWidth="2.5" />
      <path d="M27 18a7 7 0 1 0 0 12 6 6 0 1 1 0-12z" fill="#dfe8ff" />
      <path d="M14 38h20l-2 4H16z" fill="#4a3a5a" stroke={INK} strokeWidth="2" />
    </>
  ),
  colher_de_estrela: () => (
    <>
      <path d="M17 41l13-21" stroke={INK} strokeWidth="5" strokeLinecap="round" />
      <path d="M17 41l13-21" stroke={GOLD} strokeWidth="2.5" strokeLinecap="round" />
      <ellipse cx="33" cy="14" rx="7" ry="9" transform="rotate(32 33 14)" fill={GOLD} stroke={INK} strokeWidth="2.5" />
      <path d="M11 9l1.5 3 3 1.5-3 1.5-1.5 3-1.5-3-3-1.5 3-1.5zM40 30l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" fill="#fff3c4" />
    </>
  ),
  pena_de_tinta_viva: () => (
    <>
      <path d="M38 6C22 10 14 22 12 38l4-2c3-12 10-22 22-30z" fill="#e9e2ff" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M16 36L36 9" stroke="#8a7ab8" strokeWidth="1.5" />
      <path d="M12 38l-3 5" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="9" cy="44" r="2" fill="#5a3ad0" />
    </>
  ),
  eco_do_nome: () => (
    <>
      <path d="M24 6v4" stroke={INK} strokeWidth="2.5" />
      <path d="M13 34c2-3 2-8 2-12a9 9 0 0 1 18 0c0 4 0 9 2 12z" fill={GOLD} stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M11 34h26" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="24" cy="38" r="3" fill={GOLD_D} stroke={INK} strokeWidth="2" />
      <path d="M40 18c2 3 2 7 0 10M8 18c-2 3-2 7 0 10" fill="none" stroke="#fff3c4" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  marcador_de_sonhos: () => (
    <>
      <path d="M15 4h18v38l-9-7-9 7z" fill="#6a4ab0" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M24 13l1.8 3.6 4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4-2.9-2.8 4-.6z" fill="#fff3c4" />
    </>
  ),
  flor_da_gratidao: () => (
    <>
      <path d="M24 26v16" stroke="#3f7a3f" strokeWidth="3" />
      <path d="M24 36c-4-1-7-4-8-8 4 0 7 3 8 8z" fill="#5aa35a" stroke={INK} strokeWidth="1.5" />
      {[0, 72, 144, 216, 288].map((a) => <ellipse key={a} cx="24" cy="12" rx="5" ry="8" transform={`rotate(${a} 24 19)`} fill="#ff9ec4" stroke={INK} strokeWidth="2" />)}
      <circle cx="24" cy="19" r="4.5" fill="#ffd95a" stroke={INK} strokeWidth="2" />
    </>
  ),
  lupa_de_cristal: () => (
    <>
      <path d="M29 29l11 11" stroke={INK} strokeWidth="6" strokeLinecap="round" />
      <path d="M29 29l11 11" stroke="#9a6338" strokeWidth="3" strokeLinecap="round" />
      <circle cx="20" cy="20" r="13" fill="#bfe9ff" fillOpacity=".45" stroke={GOLD} strokeWidth="4" />
      <circle cx="20" cy="20" r="13" fill="none" stroke={INK} strokeWidth="1.5" />
      <path d="M13 16a8 8 0 0 1 6-6" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" fill="none" />
    </>
  ),
};

export function ItemIcon({ item, tint = '#9fc9ff', size = 48, locked = false }: { item: string; tint?: string; size?: number; locked?: boolean }) {
  const draw = ICONS[item];
  return (
    <svg className={'item-icon' + (locked ? ' locked' : '')} width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      {locked || !draw ? <text x="24" y="31" textAnchor="middle" fontSize="20" fill="#56627e" fontFamily="serif">?</text> : draw(tint)}
    </svg>
  );
}
