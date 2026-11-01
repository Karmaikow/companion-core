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

/* ---------- diálogo da Oficina: substitui o confirm cinza do navegador ---------- */

export type AskOpts = { title: string; body?: string; lines?: string[]; confirm: string; cancel?: string; danger?: boolean };
let opener: ((o: AskOpts) => Promise<boolean>) | null = null;

/** pergunta antes de algo que muda o jogo ou perde trabalho; sem o painel montado, cai no confirm do navegador */
export function ask(o: AskOpts): Promise<boolean> {
  if (opener) return opener(o);
  return Promise.resolve(window.confirm([o.title, o.body, ...(o.lines ?? [])].filter(Boolean).join('\n\n')));
}

export function AdminDialogHost() {
  const [cur, setCur] = useState<AskOpts | null>(null);
  const box = useRef<HTMLDialogElement>(null);
  const resolve = useRef<((v: boolean) => void) | null>(null);
  useEffect(() => {
    opener = (o) => new Promise<boolean>((done) => { resolve.current?.(false); resolve.current = done; setCur(o); });
    return () => { opener = null; };
  }, []);
  useEffect(() => { const d = box.current; if (cur && d && !d.open) d.showModal(); }, [cur]);
  const close = (v: boolean) => {
    const done = resolve.current; resolve.current = null;
    box.current?.close(); setCur(null); done?.(v);
  };
  return (
    <dialog ref={box} className={'admin-dialog' + (cur?.danger ? ' danger' : '')} aria-labelledby="admin-dialog-title"
      onCancel={(e) => { e.preventDefault(); close(false); }} onClose={() => { if (resolve.current) close(false); }}
      onClick={(e) => { if (e.target === e.currentTarget) close(false); }}>
      {cur && (
        <form onSubmit={(e) => { e.preventDefault(); close(true); }}>
          <h2 id="admin-dialog-title">{cur.title}</h2>
          {cur.body && <p>{cur.body}</p>}
          {!!cur.lines?.length && <ul className="dialog-diff" aria-label="O que muda">{cur.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>}
          <div className="dialog-act">
            <button type="button" className="ghost" onClick={() => close(false)} autoFocus>{cur.cancel ?? 'Cancelar'}</button>
            <button type="submit" className={'primary' + (cur.danger ? ' danger-fill' : '')}>{cur.confirm}</button>
          </div>
        </form>
      )}
    </dialog>
  );
}

/** Ctrl+S (⌘S) salva enquanto houver alteração; publicar continua só pelo botão, com confirmação */
function useCtrlS(on: boolean, save: () => void) {
  const ref = useRef(save); ref.current = save;
  useEffect(() => {
    if (!on) return;
    const key = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); ref.current(); } };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [on]);
}

function FootState({ pill, pillClass, dirty, dirtyText, note, msg }: { pill: string; pillClass: string; dirty: boolean; dirtyText?: string; note?: ReactNode; msg?: Msg }) {
  return (
    <div className="studio-foot-state">
      <span className={'pill ' + pillClass}>{pill}</span>
      <span role="status" className="foot-live">{dirty ? <small className="dirty-note">{dirtyText ?? 'Alterações não salvas'}</small> : note}</span>
      {msg && <p className={'msg' + (msg.ok ? ' ok' : ' err')} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
    </div>
  );
}

/**
 * Rascunho: [Salvar rascunho] [Publicar]. Publicado: [Salvar] [Despublicar].
 * Publicar, Despublicar e Apagar pedem confirmação dizendo o que muda no jogo. "Apagar" e extras ficam no menu ⋯.
 */
export function StudioActions({ name, status, dirty, busy, msg, onSave, onPublish, onUnpublish, onDelete, menu, note, what = 'no jogo' }: {
  name: string; status: 'draft' | 'published'; dirty: boolean; busy?: boolean; msg?: Msg;
  onSave: () => void; onPublish?: () => void; onUnpublish?: () => void; onDelete?: () => void;
  menu?: { label: string; onClick: () => void; title?: string; danger?: boolean }[]; note?: ReactNode; what?: string;
}) {
  const live = status === 'published';
  const go = (o: AskOpts, f?: () => void) => { if (f) void ask(o).then((ok) => { if (ok) f(); }); };
  useCtrlS(dirty && !busy, onSave);
  return (
    <div className="studio-foot" data-dirty={dirty || undefined}>
      <FootState pill={live ? 'No jogo' : 'Rascunho'} pillClass={status} dirty={dirty} note={note} msg={msg} />
      <div className="studio-foot-act">
        {live ? <>
          {onUnpublish && <button className="ghost" disabled={busy} onClick={() => go({ title: `Despublicar "${name}"?`, body: `Some ${what} para todos agora. Continua salvo aqui como rascunho.`, confirm: 'Despublicar' }, onUnpublish)}>Despublicar</button>}
          <button className="primary" disabled={busy || !dirty} onClick={onSave} title="Vale na hora (Ctrl+S)">Salvar</button>
        </> : <>
          <button className="ghost" disabled={busy || !dirty} onClick={onSave} title="Ctrl+S">Salvar rascunho</button>
          {onPublish && <button className="primary" disabled={busy} onClick={() => go({ title: `Publicar "${name}"?`, body: `Passa a valer ${what} para todos os jogadores${dirty ? ', já com as alterações desta tela' : ''}.`, confirm: 'Publicar' }, onPublish)}>Publicar</button>}
        </>}
        {(onDelete || menu?.length) && <MoreMenu busy={busy} items={[
          ...(menu ?? []),
          ...(onDelete ? [{ label: 'Apagar…', danger: true, onClick: () => go({ title: `Apagar "${name}" de vez?`, body: 'Não dá para desfazer.', confirm: 'Apagar', danger: true }, onDelete) }] : []),
        ]} />}
      </div>
    </div>
  );
}

/**
 * Configuração que vale na hora (Lojas, Servidor, IA, Animações): [Desfazer] [Salvar…].
 * `confirm` monta a pergunta (com o antes/depois); `section` é a versão sem fixar embaixo, para várias numa página.
 */
export function LiveActions({ dirty, busy, msg, onUndo, onSave, saveLabel = 'Salvar', note, confirm, section, extra, dirtyText }: {
  dirty: boolean; busy?: boolean; msg?: Msg; onUndo?: () => void; onSave: () => void; saveLabel?: string; note?: ReactNode;
  confirm?: () => AskOpts | null; section?: boolean; extra?: ReactNode; dirtyText?: string;
}) {
  const save = () => { const o = confirm?.(); if (!o) { onSave(); return; } void ask(o).then((ok) => { if (ok) onSave(); }); };
  useCtrlS(!section && dirty && !busy, save);
  return (
    <div className={section ? 'studio-foot section' : 'studio-foot'} data-dirty={dirty || undefined}>
      <FootState pill="Ao vivo" pillClass="published" dirty={dirty} dirtyText={dirtyText} note={note} msg={msg} />
      <div className="studio-foot-act">
        {extra}
        {onUndo && <button className="ghost" disabled={busy || !dirty} onClick={onUndo}>Desfazer</button>}
        <button className="primary" disabled={busy || !dirty} onClick={save} title={section ? undefined : 'Ctrl+S'}>{saveLabel}</button>
      </div>
    </div>
  );
}

/* ---------- abas internas de um editor (setas ←/→ trocam) ---------- */

export function Tabs({ label, items, value, onChange, idPrefix = '' }: { label: string; items: { key: string; label: ReactNode; done?: boolean; hidden?: boolean }[]; value: string; onChange: (k: string) => void; idPrefix?: string }) {
  const shown = items.filter((i) => !i.hidden);
  const move = (d: number) => { const i = shown.findIndex((x) => x.key === value); const n = shown[(i + d + shown.length) % shown.length]; onChange(n.key); document.getElementById('tab-' + idPrefix + n.key)?.focus(); };
  return (
    <div className="studio-tabs" role="tablist" aria-label={label} onKeyDown={(e) => { if (e.key === 'ArrowRight') { e.preventDefault(); move(1); } if (e.key === 'ArrowLeft') { e.preventDefault(); move(-1); } }}>
      {shown.map((i) => (
        <button key={i.key} id={'tab-' + idPrefix + i.key} role="tab" type="button" aria-selected={value === i.key} tabIndex={value === i.key ? 0 : -1} className={(value === i.key ? 'on' : '') + (i.done ? ' done' : '')} onClick={() => onChange(i.key)}>
          {i.done && <Icon name="check" size={14} />}{i.label}
        </button>
      ))}
    </div>
  );
}

/** topo do editor: o que está aberto, sempre visível ao rolar */
export function EditorHead({ name, sub, color, status, dirty }: { name: string; sub?: ReactNode; color?: string; status: 'draft' | 'published'; dirty?: boolean }) {
  return (
    <div className="editor-head">
      {color && <i className="editor-dot" style={{ background: color }} aria-hidden />}
      <div className="editor-head-name"><b>{name || 'Sem nome'}</b>{sub && <small>{sub}</small>}</div>
      {dirty && <small className="dirty-note">não salvo</small>}
      <span className={'pill ' + status}>{status === 'published' ? 'No jogo' : 'Rascunho'}</span>
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
  missoes: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="m9 9.5 2 2 4-4M9 15.5h6" /></>,
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
