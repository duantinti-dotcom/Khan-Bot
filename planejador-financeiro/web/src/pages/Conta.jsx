import { useEffect, useState } from 'react';
import { useApp } from '../App.jsx';
import { get, post, put } from '../api.js';
import { ageOn } from '@shared/dates.js';
import { Field, MoneyInput, inputToCents, centsToInput, PasswordInput, Seg, Alert, useSubmit, useToast, Modal } from '../ui.jsx';
import { RecoveryCodes } from './Auth.jsx';

export default function Conta() {
  const { data, today, reload, logout, setMe } = useApp();
  const toast = useToast();
  const pf = data.profile;
  const [f, setF] = useState({
    name: pf.display_name || '', birth: pf.birth_date || '', mode: pf.budget_mode, variable: pf.has_variable_income === null ? 'nao_sei' : pf.has_variable_income ? 'sim' : 'nao',
    est: centsToInput(pf.variable_income_estimate_cents), theme: pf.theme,
  });
  const [codesLeft, setCodesLeft] = useState(null);
  useEffect(() => { get('/auth/me').then((r) => setCodesLeft(r.recoveryCodesLeft)).catch(() => {}); }, []);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v?.target ? v.target.value : v }));

  const profile = useSubmit(async () => {
    if (f.birth && f.birth > today) throw new Error('Data de nascimento no futuro.');
    await put('/profile', {
      display_name: f.name.trim() || null, birth_date: f.birth || null, budget_mode: f.mode, theme: f.theme,
      has_variable_income: f.variable === 'nao_sei' ? null : f.variable === 'sim',
      variable_income_estimate_cents: f.variable === 'sim' ? inputToCents(f.est) : null,
    });
    await reload(); toast('Dados salvos.');
  });

  const [pw, setPw] = useState({ current: '', next: '', next2: '' });
  const password = useSubmit(async () => {
    if (pw.next !== pw.next2) throw new Error('As novas senhas não conferem.');
    await post('/auth/password', { current: pw.current, next: pw.next });
    setPw({ current: '', next: '', next2: '' });
    toast('Senha alterada. Outras sessões foram encerradas.');
  });

  const [regen, setRegen] = useState(null);
  const [regenPw, setRegenPw] = useState('');
  const codes = useSubmit(async () => {
    const r = await post('/auth/recovery-codes', { password: regenPw });
    setRegen(r.recoveryCodes); setRegenPw(''); setCodesLeft(8);
  });

  const [del, setDel] = useState(false);
  const [delU, setDelU] = useState('');
  const [delP, setDelP] = useState('');
  const remove = useSubmit(async () => {
    await post('/account/delete', { confirm_username: delU, password: delP });
    setMe(null);
    location.hash = '';
    location.reload();
  });

  const logoutAll = async () => {
    if (!window.confirm('Sair de todos os aparelhos, inclusive este?')) return;
    await post('/auth/logout-all');
    logout();
  };

  return (
    <>
      <div className="grid two">
        <section className="card">
          <h2>Seus dados</h2>
          <form className="stack" style={{ marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); profile.run().catch(() => {}); }}>
            <div className="form-grid">
              <Field label="Nome ou apelido"><input className="input" value={f.name} onChange={set('name')} /></Field>
              <Field label="Data de nascimento" hint={f.birth ? `${ageOn(f.birth, today)} anos` : 'Não informada'}><input className="input" type="date" value={f.birth} max={today} onChange={set('birth')} /></Field>
              <Field label="O orçamento “quanto posso gastar” vai até" full>
                <Seg value={f.mode} onChange={set('mode')} options={[['proxima_renda', 'A próxima renda fixa'], ['fim_do_mes', 'O fim do mês']]} />
              </Field>
              <Field label="Recebe renda variável?" full><Seg value={f.variable} onChange={set('variable')} options={[['sim', 'Sim'], ['nao', 'Não'], ['nao_sei', 'Não sei']]} /></Field>
              {f.variable === 'sim' && <Field label="Estimativa mensal (opcional)" full hint="Usada só enquanto houver pouco histórico."><MoneyInput value={f.est} onChange={set('est')} /></Field>}
              <Field label="Tema" full><Seg value={f.theme} onChange={set('theme')} options={[['claro', 'Claro (marfim)'], ['escuro', 'Escuro'], ['sistema', 'Do sistema']]} /></Field>
            </div>
            <p className="hint">Renda fixa e contas fixas são editadas em Lançamentos → Recorrentes. Saldos, em Meu dinheiro. Metas, em Minhas metas. Categorias e limites, em Lançamentos → Orçamento.</p>
            {profile.error && <p className="err">{profile.error}</p>}
            <button className="btn primary" disabled={profile.busy}>Salvar</button>
          </form>
        </section>

        <div className="stack">
          <section className="card">
            <h2>Alterar senha</h2>
            <form className="stack" style={{ marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); password.run().catch(() => {}); }}>
              <Field label="Senha atual"><PasswordInput value={pw.current} onChange={(v) => setPw((x) => ({ ...x, current: v }))} /></Field>
              <Field label="Nova senha"><PasswordInput value={pw.next} onChange={(v) => setPw((x) => ({ ...x, next: v }))} autoComplete="new-password" /></Field>
              <Field label="Repita a nova senha"><PasswordInput value={pw.next2} onChange={(v) => setPw((x) => ({ ...x, next2: v }))} autoComplete="new-password" /></Field>
              {password.error && <p className="err">{password.error}</p>}
              <button className="btn" disabled={password.busy}>Alterar senha</button>
            </form>
          </section>
          <section className="card">
            <h2>Códigos de recuperação</h2>
            <p className="muted">{codesLeft == null ? '…' : `${codesLeft} código(s) ainda não usado(s).`} Gerar novos invalida os antigos.</p>
            {codesLeft != null && codesLeft <= 2 && <Alert tone="warn">Restam poucos códigos.</Alert>}
            <form className="row" style={{ marginTop: 8 }} onSubmit={(e) => { e.preventDefault(); codes.run().catch(() => {}); }}>
              <div style={{ flex: 1 }}><PasswordInput value={regenPw} onChange={setRegenPw} placeholder="Sua senha" /></div>
              <button className="btn" disabled={codes.busy || !regenPw}>Gerar novos</button>
            </form>
            {codes.error && <p className="err">{codes.error}</p>}
          </section>
          <section className="card">
            <h2>Seus dados e sessões</h2>
            <div className="row wrap" style={{ marginTop: 10 }}>
              <a className="btn" href="/api/export" download>Exportar tudo (JSON)</a>
              <a className="btn" href="/api/export?format=csv" download>Movimentações (CSV)</a>
            </div>
            <div className="row wrap" style={{ marginTop: 10 }}>
              <button className="btn" onClick={logoutAll}>Sair de todos os aparelhos</button>
              <button className="btn danger" onClick={() => setDel(true)}>Excluir minha conta</button>
            </div>
            <p className="hint">Seus dados ficam num banco de dados no servidor, ligados só à sua conta: entrando em outro aparelho, tudo aparece igual. Nenhum dado é vendido ou compartilhado.</p>
          </section>
        </div>
      </div>
      {regen && <Modal title="Novos códigos de recuperação" onClose={() => setRegen(null)}><RecoveryCodes codes={regen} username={data.user.username} onDone={() => setRegen(null)} doneLabel="Pronto" /></Modal>}
      {del && (
        <Modal title="Excluir conta" onClose={() => setDel(false)}>
          <form className="stack" onSubmit={(e) => { e.preventDefault(); remove.run().catch(() => {}); }}>
            <Alert tone="bad">Isto apaga <b>permanentemente</b> sua conta e todos os seus dados (contas, lançamentos, metas). Não há como desfazer. Se quiser, exporte seus dados antes.</Alert>
            <Field label={`Digite seu usuário (${data.user.username}) para confirmar`}><input className="input" value={delU} onChange={(e) => setDelU(e.target.value)} autoCapitalize="off" /></Field>
            <Field label="Sua senha"><PasswordInput value={delP} onChange={setDelP} /></Field>
            {remove.error && <p className="err">{remove.error}</p>}
            <button className="btn danger block" disabled={remove.busy || delU.toLowerCase() !== data.user.username.toLowerCase() || !delP}>Excluir definitivamente</button>
          </form>
        </Modal>
      )}
    </>
  );
}
