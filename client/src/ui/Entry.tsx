import { useEffect, useState } from 'react';
import { useGame } from '../store';
import { OnlineBackend, supabase } from '../backend/online';
import { LocalBackend } from '../backend/local';

type Mode = 'start' | 'signin' | 'signup' | 'forgot' | 'recover';

/** Mensagens do Supabase Auth em português, sem expor detalhes técnicos. */
function authMessage(e: unknown): string {
  const m = String((e as Error)?.message ?? e ?? '');
  if (/invalid login/i.test(m)) return 'E-mail ou senha incorretos. Se esqueceu a senha, use "Esqueci minha senha".';
  if (/email not confirmed/i.test(m)) return 'Seu e-mail ainda não foi confirmado. Abra o link que enviamos e tente de novo.';
  if (/anonymous/i.test(m)) return 'A entrada sem conta está desativada no servidor. Crie uma conta com e-mail.';
  if (/rate limit|too many|security purposes/i.test(m)) return 'Muitas tentativas seguidas. Espere um minuto e tente de novo.';
  if (/password.*(at least|short|weak)/i.test(m)) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (/same.*password|different from the old/i.test(m)) return 'A nova senha precisa ser diferente da anterior.';
  if (/already registered|already been registered/i.test(m)) return 'Este e-mail já tem conta. Entre com sua senha ou use "Esqueci minha senha".';
  if (/fetch|network/i.test(m)) return 'Sem conexão com o servidor. Verifique a internet.';
  return 'Não foi possível concluir agora: ' + m;
}

const isRecoveryUrl = () => /type=recovery/.test(location.hash) || new URLSearchParams(location.search).get('type') === 'recovery';

export function Entry() {
  const setBackend = useGame((s) => s.setBackend);
  const [mode, setMode] = useState<Mode>(isRecoveryUrl() ? 'recover' : 'start');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<{ text: string; tone: 'ok' | 'err' } | null>(null);
  const [busy, setBusy] = useState(false);
  /** conta guardada neste aparelho quando a pessoa foi trazida de volta para cá (e-mail, ou "convidado") */
  const [saved, setSaved] = useState<string | null>(null);
  const notice = useGame((s) => s.notice);

  useEffect(() => {
    const auth = supabase().auth;
    const { data: sub } = auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') { setMode('recover'); setMsg(null); }
    });
    // Sessão existente: entra direto (exceto quando veio do link de redefinição). Se a pessoa acabou de sair do jogo
    // (voltou ao início, a sessão caiu, a conta abriu em outra aba), NÃO entra sozinho: mostra as opções. Entrar
    // sozinho aqui devolvia a pessoa para o mesmo erro, num laço sem saída.
    if (!isRecoveryUrl()) {
      auth.getSession().then(({ data }) => {
        if (!data.session) return;
        if (useGame.getState().stayOut) setSaved(data.session.user.is_anonymous ? 'convidado' : data.session.user.email ?? 'sua conta');
        else setBackend(new OnlineBackend());
      }).catch(() => undefined);
    }
    return () => sub.subscription.unsubscribe();
  }, [setBackend]);

  /** Sai da conta guardada neste aparelho (sem depender do servidor responder). */
  const signOutSaved = () => act(async () => {
    if (saved === 'convidado' && !confirm('Você está jogando como convidado. Se sair, não será possível voltar a este Companion. Sair mesmo assim?')) return;
    await supabase().auth.signOut({ scope: 'local' });
    setSaved(null);
    useGame.setState({ notice: null });
    setMsg({ text: 'Você saiu da conta neste aparelho.', tone: 'ok' });
  });

  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setMsg(null);
    try { await fn(); } catch (e) { setMsg({ text: authMessage(e), tone: 'err' }); } finally { setBusy(false); }
  }

  const guest = () => act(async () => {
    const r = await supabase().auth.signInAnonymously();
    if (r.error) throw r.error;
    setBackend(new OnlineBackend());
  });

  const signin = () => act(async () => {
    const r = await supabase().auth.signInWithPassword({ email: email.trim(), password });
    if (r.error) throw r.error;
    setBackend(new OnlineBackend());
  });

  const signup = () => act(async () => {
    const r = await supabase().auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: location.origin } });
    if (r.error) throw r.error;
    // O Supabase responde "ok" para e-mail já cadastrado, mas sem identidades (proteção contra enumeração).
    if (r.data.user && (r.data.user.identities?.length ?? 0) === 0) {
      setMsg({ text: 'Este e-mail já tem conta. Entre com sua senha ou use "Esqueci minha senha".', tone: 'err' });
      setMode('signin');
      return;
    }
    if (!r.data.session) { setMsg({ text: 'Conta criada! Enviamos um link de confirmação para o seu e-mail. Depois de confirmar, é só entrar.', tone: 'ok' }); setMode('signin'); return; }
    setBackend(new OnlineBackend());
  });

  const forgot = () => act(async () => {
    const r = await supabase().auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin + location.pathname });
    if (r.error) throw r.error;
    setMsg({ text: 'Se existir uma conta com esse e-mail, chegará um link para criar uma nova senha. Confira também o spam.', tone: 'ok' });
  });

  const recover = () => act(async () => {
    const r = await supabase().auth.updateUser({ password });
    if (r.error) throw r.error;
    history.replaceState(null, '', location.pathname);
    setMsg({ text: 'Senha alterada!', tone: 'ok' });
    setBackend(new OnlineBackend());
  });

  const validEmail = /^\S+@\S+\.\S+$/.test(email.trim());
  const validPass = password.length >= 6;

  return (
    <div className="entry">
      <div className="entry-card">
        <h1>Companion Core</h1>
        {notice && <p className="msg err" role="status">{notice}</p>}
        {mode === 'start' && saved && (
          <>
            <p className="lede">{saved === 'convidado' ? 'Há um Companion de convidado guardado neste aparelho.' : <>Você está com a conta <b>{saved}</b> neste aparelho.</>}</p>
            <button className="primary" disabled={busy} onClick={() => setBackend(new OnlineBackend())}>Voltar ao meu Refúgio</button>
            <button className="ghost" disabled={busy} onClick={signOutSaved}>Sair desta conta</button>
          </>
        )}
        {mode === 'start' && !saved && (
          <>
            <p className="lede">No centro do Refúgio, um núcleo de luz acabou de nascer. Ele vai descobrir quem é conversando com você.</p>
            <button className="primary" onClick={() => { setMode('signup'); setMsg(null); }}>Criar conta e começar</button>
            <small className="note">Com conta, o seu Companion fica salvo e você entra de qualquer aparelho.</small>
            <button className="ghost" onClick={() => { setMode('signin'); setMsg(null); }}>Já tenho conta · Entrar</button>
            <div className="entry-alt">
              <button className="link" disabled={busy} onClick={guest}>Experimentar sem conta (o progresso fica só neste aparelho)</button>
              <button className="link" onClick={() => setBackend(new LocalBackend())}>Jogar offline (respostas simples, sem IA)</button>
            </div>
          </>
        )}

        {(mode === 'signin' || mode === 'signup') && (
          <form onSubmit={(e) => { e.preventDefault(); void (mode === 'signin' ? signin() : signup()); }}>
            <h2>{mode === 'signin' ? 'Entrar' : 'Criar conta'}</h2>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" autoComplete="email" aria-label="E-mail" required />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === 'signup' ? 'crie uma senha (mín. 6)' : 'senha'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} aria-label="Senha" minLength={6} required />
            <button type="submit" className="primary" disabled={busy || !validEmail || !validPass}>{busy ? 'Aguarde…' : mode === 'signin' ? 'Entrar' : 'Criar conta'}</button>
            {mode === 'signin'
              ? <button type="button" className="link" onClick={() => { setMode('forgot'); setMsg(null); }}>Esqueci minha senha</button>
              : <button type="button" className="link" onClick={() => { setMode('signin'); setMsg(null); }}>Já tenho conta</button>}
            <button type="button" className="link" onClick={() => { setMode('start'); setMsg(null); }}>← Voltar</button>
          </form>
        )}

        {mode === 'forgot' && (
          <form onSubmit={(e) => { e.preventDefault(); void forgot(); }}>
            <h2>Redefinir senha</h2>
            <p className="note">Digite o e-mail da sua conta. Vamos enviar um link para você criar uma senha nova.</p>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" autoComplete="email" aria-label="E-mail" required />
            <button type="submit" className="primary" disabled={busy || !validEmail}>{busy ? 'Enviando…' : 'Enviar link'}</button>
            <button type="button" className="link" onClick={() => { setMode('signin'); setMsg(null); }}>← Voltar para entrar</button>
          </form>
        )}

        {mode === 'recover' && (
          <form onSubmit={(e) => { e.preventDefault(); void recover(); }}>
            <h2>Nova senha</h2>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="nova senha (mín. 6)" autoComplete="new-password" aria-label="Nova senha" minLength={6} required autoFocus />
            <button type="submit" className="primary" disabled={busy || !validPass}>{busy ? 'Salvando…' : 'Salvar e entrar'}</button>
          </form>
        )}

        {msg && <p className={'msg ' + msg.tone} role="status">{msg.text}</p>}
      </div>
    </div>
  );
}
