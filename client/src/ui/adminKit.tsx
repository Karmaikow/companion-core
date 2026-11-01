/**
 * Peças comuns do Administrador: o rodapé de ações de todo estúdio (mesmas palavras e confirmações em toda aba),
 * a busca das listas, o registro de "alterações não salvas" (que segura a troca de aba e o fechamento da página)
 * e os ícones desenhados do menu.
 */
import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';

/* ---------- alterações não salvas: cada estúdio avisa; o painel pergunta antes de trocar de aba ---------- */

export const AdminDirty = createContext<((id: string, dirty: boolean) => void) | null>(null);

/** o estúdio chama com o próprio `dirty`; ao desmontar, conta como salvo */
export function useAdminDirty(dirty: boolean) {
  const report = useContext(AdminDirty), id = useId();
  useEffect(() => { report?.(id, dirty); }, [report, id, dirty]);
  useEffect(() => () => report?.(id, false), [report, id]);
}

/* ---------- busca: ignora acentos e maiúsculas ---------- */

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const matches = (q: string, ...texts: (string | null | undefined)[]) => {
  const t = fold(q.trim());
  return !t || texts.some((x) => x && fold(x).includes(t));
};

export function ListSearch({ value, onChange, label, count }: { value: string; onChange: (v: string) => void; label: string; count?: number }) {
  return (
    <label className="studio-search">
      <Icon name="search" />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={label} aria-label={label} onKeyDown={(e) => { if (e.key === 'Escape') onChange(''); }} />
      {count !== undefined && value.trim() && <small aria-live="polite">{count}</small>}
    </label>
  );
}

/* ---------- rodapé de ações ---------- */

export type Msg = { text: string; ok?: boolean } | null;

/**
 * Rascunho: [Salvar rascunho] [Publicar]. Publicado: [Salvar] [Despublicar].
 * Publicar, Despublicar e Apagar pedem confirmação dizendo o que muda no jogo. "Apagar" e extras ficam no menu ⋯.
 */
export function StudioActions({ name, status, dirty, busy, msg, onSave, onPublish, onUnpublish, onDelete, menu, note }: {
  name: string; status: 'draft' | 'published'; dirty: boolean; busy?: boolean; msg?: Msg;
  onSave: () => void; onPublish?: () => void; onUnpublish?: () => void; onDelete?: () => void;
  menu?: { label: string; onClick: () => void; title?: string }[]; note?: ReactNode;
}) {
  const live = status === 'published';
  const ask = (text: string, go?: () => void) => { if (go && window.confirm(text)) go(); };
  // Ctrl+S (⌘S) salva como o botão Salvar; publicar continua só pelo botão, com confirmação
  const saveRef = useRef(onSave); saveRef.current = onSave;
  useEffect(() => {
    if (!dirty || busy) return;
    const key = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveRef.current(); } };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [dirty, busy]);
  return (
    <div className="studio-foot" data-dirty={dirty || undefined}>
      <div className="studio-foot-state">
        <span className={'pill ' + status}>{live ? 'No jogo' : 'Rascunho'}</span>
        {dirty ? <small className="dirty-note">Alterações não salvas</small> : note}
        {msg && <p className={'msg' + (msg.ok ? ' ok' : ' err')} role="status">{msg.text}</p>}
      </div>
      <div className="studio-foot-act">
        {live ? <>
          {onUnpublish && <button className="ghost" disabled={busy} onClick={() => ask(`Despublicar "${name}"?\n\nSome do jogo para todos agora. Continua salvo aqui como rascunho.`, onUnpublish)}>Despublicar</button>}
          <button className="primary" disabled={busy || !dirty} onClick={onSave} title="Vale na hora no jogo (Ctrl+S)">Salvar</button>
        </> : <>
          <button className="ghost" disabled={busy || !dirty} onClick={onSave} title="Ctrl+S">Salvar rascunho</button>
          {onPublish && <button className="primary" disabled={busy} onClick={() => ask(`Publicar "${name}"?\n\nPassa a valer no jogo para todos os jogadores.`, onPublish)}>Publicar</button>}
        </>}
        {(onDelete || menu?.length) && <MoreMenu busy={busy} items={[
          ...(menu ?? []),
          ...(onDelete ? [{ label: 'Apagar…', danger: true, onClick: () => ask(`Apagar "${name}" de vez?\n\nNão dá para desfazer.`, onDelete) }] : []),
        ]} />}
      </div>
    </div>
  );
}

/** menu ⋯: fecha com Esc, clique fora ou ao escolher */
export function MoreMenu({ items, busy, label = 'Mais ações' }: { items: { label: string; onClick: () => void; danger?: boolean; title?: string }[]; busy?: boolean; label?: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', off); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', off); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div className="more-menu" ref={box}>
      <button className="ghost icon-btn" aria-label={label} aria-haspopup="menu" aria-expanded={open} disabled={busy} onClick={() => setOpen((v) => !v)}><Icon name="more" /></button>
      {open && (
        <ul role="menu">
          {items.map((it) => <li key={it.label} role="none"><button role="menuitem" className={it.danger ? 'danger' : ''} title={it.title} onClick={() => { setOpen(false); it.onClick(); }}>{it.label}</button></li>)}
        </ul>
      )}
    </div>
  );
}

/* ---------- ícones (traço único de 1,6 px, 24×24) ---------- */

const PATHS: Record<string, ReactNode> = {
  companions: <><circle cx="12" cy="9" r="3.6" /><path d="M5.5 19.5c1.2-3.3 3.6-5 6.5-5s5.3 1.7 6.5 5" /><path d="M12 2.5v1.6M18.4 5.2l-1.1 1.1M5.6 5.2l1.1 1.1" /></>,
  animacoes: <><rect x="3.5" y="5" width="17" height="14" rx="2" /><path d="M3.5 9h17M3.5 15h17M8 5v4M12 5v4M16 5v4M8 15v4M12 15v4M16 15v4" /></>,
  biomas: <><path d="M3 19.5h18" /><path d="M6.5 19.5v-4M6.5 15.5c-2 0-3-1.4-3-3 0-2.4 3-6 3-6s3 3.6 3 6c0 1.6-1 3-3 3Z" /><path d="M13 19.5l3.5-9 4 9" /><path d="M14.6 15.4h3.4" /></>,
  cidade: <><path d="M12 2.8 13.6 7h-3.2L12 2.8Z" /><path d="M10.4 7h3.2v12.5h-3.2z" /><path d="M3.5 19.5v-7l3-2 3 2v7M14.5 19.5v-9l3-2 3 2v9M2.5 19.5h19" /></>,
  lojas: <><path d="M4 9.5h16l-1.2 10H5.2L4 9.5Z" /><path d="M8.5 9.5V7.2a3.5 3.5 0 0 1 7 0v2.3" /><path d="M9.5 13.5h5" /></>,
  forja: <><path d="M4 19.5h16M7 19.5l1.5-4h7l1.5 4" /><path d="M5 11.5h14l-2 4H7l-2-4Z" /><path d="M14.5 4.5 18 8M15.8 3.2l3 3-1.6 1.6-3-3z" /></>,
  invocador: <><path d="M12 20c-3.6 0-6.5-2.6-6.5-5.8 0-2.6 2-4.2 4-4.2 1 0 1.8.4 2.5 1 .7-.6 1.5-1 2.5-1 2 0 4 1.6 4 4.2C18.5 17.4 15.6 20 12 20Z" /><circle cx="5" cy="7" r="1.8" /><circle cx="9.5" cy="4.2" r="1.8" /><circle cx="14.5" cy="4.2" r="1.8" /><circle cx="19" cy="7" r="1.8" /></>,
  arsenal: <><path d="M14.5 3.5h6v6L9 21l-6-6L14.5 3.5Z" /><path d="M6 12l6 6M3 21l2.5-2.5" /></>,
  servidor: <><circle cx="12" cy="12" r="3" /><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6" /><path d="m15 15 5.5 5.5" /></>,
  more: <><circle cx="5.5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="18.5" cy="12" r="1.2" /></>,
  back: <path d="M14.5 5.5 8 12l6.5 6.5" />,
  refresh: <><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" /><path d="M19.8 4.2v4.6h-4.6" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
};

export function Icon({ name, size = 18 }: { name: keyof typeof PATHS | string; size?: number }) {
  return <svg className="ico" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">{PATHS[name]}</svg>;
}
