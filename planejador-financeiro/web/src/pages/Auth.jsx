import { useState } from 'react';
import { post } from '../api.js';
import { Field, PasswordInput, Seg, useSubmit, Alert } from '../ui.jsx';

export function RecoveryCodes({ codes, username, onDone, doneLabel = 'Continuar' }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const text = `Códigos de recuperação — Órbita (usuário: ${username})\nCada código funciona uma única vez.\n\n${codes.join('\n')}\n`;
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url; a.download = `orbita-codigos-${username}.txt`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="stack">
      <Alert tone="warn">Guarde estes códigos agora. Eles <b>não serão mostrados de novo</b> e são a única forma de recuperar o acesso se você esquecer a senha.</Alert>
      <div className="codes">{codes.map((c) => <div key={c}>{c}</div>)}</div>
      <div className="row wrap">
        <button className="btn" onClick={async () => { try { await navigator.clipboard.writeText(text); setCopied(true); } catch { setCopied(false); } }}>{copied ? 'Copiado ✓' : 'Copiar'}</button>
        <button className="btn" onClick={download}>Baixar .txt</button>
      </div>
      <label className="check"><input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />Guardei os códigos em um lugar seguro (fora deste aparelho, de preferência).</label>
      <button className="btn primary block" disabled={!saved} onClick={onDone}>{doneLabel}</button>
    </div>
  );
}

export default function Auth({ onAuth, error }) {
  const [mode, setMode] = useState('entrar');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState(null);
  const [pending, setPending] = useState(null);
  const s = useSubmit(async () => {
    if (mode === 'entrar') {
      const r = await post('/auth/login', { username, password });
      return onAuth(r);
    }
    if (password !== password2) throw new Error('As senhas não conferem.');
    if (mode === 'criar') {
      const r = await post('/auth/signup', { username, password });
      setCodes(r.recoveryCodes);
      setPending(r);
      return;
    }
    const r = await post('/auth/recover', { username, code, password });
    setPending({ ...r, remaining: r.remainingCodes });
  });

  if (codes) {
    return (
      <div className="auth-wrap">
        <div className="card auth">
          <div className="brand"><img src="/icon.svg" alt="" />Órbita</div>
          <h2 style={{ marginBottom: 10 }}>Conta criada! Seus códigos de recuperação</h2>
          <RecoveryCodes codes={codes} username={pending.user.username} onDone={() => onAuth(pending)} />
        </div>
      </div>
    );
  }
  if (pending && mode === 'recuperar') {
    return (
      <div className="auth-wrap">
        <div className="card auth stack">
          <h2>Senha redefinida</h2>
          <p>Todas as outras sessões foram encerradas. Você tem <b>{pending.remaining}</b> código(s) de recuperação restante(s).</p>
          {pending.remaining <= 2 && <Alert tone="warn">Restam poucos códigos. Gere novos em "Minha conta".</Alert>}
          <button className="btn primary" onClick={() => onAuth(pending)}>Entrar no app</button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-wrap">
      <form className="card auth stack" onSubmit={(e) => { e.preventDefault(); s.run().catch(() => {}); }}>
        <div className="brand"><img src="/icon.svg" alt="" />Órbita</div>
        <p className="tagline">Saiba quanto pode gastar hoje e quanto guardar para chegar nas suas metas.</p>
        <Seg label="Acesso" value={mode} onChange={(m) => { setMode(m); s.setError(null); }} options={[['entrar', 'Entrar'], ['criar', 'Criar conta'], ['recuperar', 'Esqueci a senha']]} />
        <Field label="Nome de usuário" hint={mode === 'criar' ? '3 a 30 caracteres: letras, números, ponto, hífen ou _. Maiúsculas e minúsculas contam como iguais.' : undefined}>
          <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="off" spellCheck="false" required />
        </Field>
        {mode === 'recuperar' && (
          <Field label="Código de recuperação" hint="Um dos códigos que você recebeu ao criar a conta. Cada um vale uma vez.">
            <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXX-XXXX-XXXX-XXXX" autoCapitalize="characters" autoComplete="one-time-code" required />
          </Field>
        )}
        <Field label={mode === 'recuperar' ? 'Nova senha' : 'Senha'} hint={mode !== 'entrar' ? 'Pelo menos 8 caracteres. Uma frase curta é fácil de lembrar e difícil de adivinhar.' : undefined}>
          <PasswordInput value={password} onChange={setPassword} autoComplete={mode === 'entrar' ? 'current-password' : 'new-password'} />
        </Field>
        {mode !== 'entrar' && (
          <Field label="Repita a senha"><PasswordInput value={password2} onChange={setPassword2} autoComplete="new-password" /></Field>
        )}
        {(s.error || error) && <p className="err" role="alert">{s.error || error}</p>}
        <button className="btn primary block" disabled={s.busy}>{s.busy ? 'Aguarde…' : mode === 'entrar' ? 'Entrar' : mode === 'criar' ? 'Criar conta' : 'Redefinir senha'}</button>
        <p className="hint" style={{ textAlign: 'center' }}>Não pedimos e-mail, telefone nem senha de banco. Seus dados ficam guardados no servidor, ligados só à sua conta.</p>
      </form>
    </div>
  );
}
