import { useEffect, useState } from 'react';
import { useGame } from '../store';
import { OnlineBackend, supabase } from '../backend/online';
import { LocalBackend } from '../backend/local';

export function Entry() {
  const setBackend = useGame((s) => s.setBackend);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // sessão existente: entra direto
  useEffect(() => {
    supabase().auth.getSession().then(({ data }) => {
      if (data.session) setBackend(new OnlineBackend());
    }).catch(() => undefined);
  }, [setBackend]);

  async function online(kind: 'guest' | 'signin' | 'signup') {
    setBusy(true);
    setMsg(null);
    try {
      const auth = supabase().auth;
      const r = kind === 'guest' ? await auth.signInAnonymously()
        : kind === 'signin' ? await auth.signInWithPassword({ email, password })
        : await auth.signUp({ email, password });
      if (r.error) throw r.error;
      if (!r.data.session) { setMsg('Conta criada. Confirme pelo link enviado ao seu e-mail e depois entre.'); return; }
      setBackend(new OnlineBackend());
    } catch (e) {
      const m = (e as Error).message ?? '';
      setMsg(/anonymous/i.test(m) ? 'Entrada como convidado está desativada no servidor. Use e-mail e senha ou o modo local.'
        : /invalid login/i.test(m) ? 'E-mail ou senha incorretos.'
        : 'Não foi possível entrar agora: ' + m);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="entry">
      <div className="entry-card">
        <h1>Companion Core</h1>
        <p className="lede">No centro do Refúgio, um núcleo de luz acabou de nascer. Ele ainda não tem nome, cor nem forma — vai descobrir tudo conversando com você.</p>
        <button className="primary" disabled={busy} onClick={() => online('guest')}>Entrar como convidado</button>
        <form onSubmit={(e) => { e.preventDefault(); void online('signin'); }}>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" autoComplete="email" aria-label="E-mail" />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="senha" autoComplete="current-password" aria-label="Senha" minLength={6} />
          <div className="row">
            <button type="submit" disabled={busy || !email || password.length < 6}>Entrar</button>
            <button type="button" className="ghost" disabled={busy || !email || password.length < 6} onClick={() => online('signup')}>Criar conta</button>
          </div>
        </form>
        <button className="ghost" onClick={() => setBackend(new LocalBackend())}>Jogar no modo local (sem servidor)</button>
        {msg && <p className="msg">{msg}</p>}
      </div>
    </div>
  );
}
