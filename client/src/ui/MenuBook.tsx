/**
 * Moldura de livro de pergaminho para os menus do jogo: capa marrom, fita com o título no alto, botão de fechar e,
 * na lateral direita, os marcadores de todos os menus (trocar de menu sem fechar o livro). O conteúdo vem nas
 * páginas: uma página larga (`ib-page single`) ou duas (`ib-left` + `ib-right`, como o Inventário).
 * Esc fecha. No celular, os marcadores viram uma faixa rolável no topo.
 */
import { useEffect, type ReactNode } from 'react';
import { Icon } from './icons';
import type { Tab } from '../store';
import './inventory.css';

export interface BookTab { key: Tab; label: string }
export interface BookMenu { tabs: BookTab[]; current: Tab; go: (t: Tab) => void }

export function MenuBook({ title, icon, menu, onClose, className = '', sub, children }: {
  title: string; icon?: ReactNode; menu?: BookMenu; onClose?: () => void; className?: string; sub?: ReactNode; children: ReactNode;
}) {
  useEffect(() => {
    if (!onClose) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="ib-back" onClick={onClose}>
      <div className={'ib-book ' + className} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="ib-ribbon"><span aria-hidden>{icon ?? (menu ? <Icon tab={menu.current} size={18} /> : null)}</span>{title}</div>
        {sub}
        {onClose && <button type="button" className="ib-close" onClick={onClose} aria-label="Fechar">✕</button>}
        {menu && (
          <nav className="ib-tabs" aria-label="Menus">
            {menu.tabs.map((t) => (
              <button key={t.key} type="button" className={menu.current === t.key ? 'on' : ''} aria-current={menu.current === t.key ? 'page' : undefined} onClick={() => menu.go(t.key)} title={t.label}>
                <Icon tab={t.key} size={20} /><small>{t.label}</small>
              </button>
            ))}
          </nav>
        )}
        {children}
      </div>
    </div>
  );
}
