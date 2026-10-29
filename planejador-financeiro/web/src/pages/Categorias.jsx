import { useState } from 'react';
import { useApp } from '../App.jsx';
import { post, put } from '../api.js';
import { Modal, Field, MoneyInput, inputToCents, centsToInput, Seg, brl, useSubmit, useToast, EmptyCta } from '../ui.jsx';

export const ICONS = ['💞', '🌹', '🛴', '🚗', '🚌', '🍽️', '🍔', '☕', '🛒', '🤖', '📱', '🎮', '🎬', '🎉', '🛍️', '👕', '📚', '🎓', '🩺', '💊', '🏋️', '✂️', '🎁', '🐶', '🏠', '💡', '✈️', '⚽', '🎵', '•'];
export const COLORS = ['#22d3ee', '#34d399', '#60a5fa', '#818cf8', '#a78bfa', '#f472b6', '#f87171', '#fb923c', '#fbbf24', '#a3e635', '#94a3b8'];

// Formulário de categoria. Usado no perfil e direto no registro de um gasto.
export function CategoryForm({ category, onClose, onSaved }) {
  const { data, reload } = useApp();
  const toast = useToast();
  const [name, setName] = useState(category?.name || '');
  const [icon, setIcon] = useState(category?.icon || '•');
  const [color, setColor] = useState(category?.color || COLORS[0]);
  const [limit, setLimit] = useState(centsToInput(category?.monthly_limit_cents));
  const [essential, setEssential] = useState(category?.essential ?? false);
  const s = useSubmit(async () => {
    if (!name.trim()) throw new Error('Dê um nome para a categoria.');
    const lim = limit.trim() === '' ? null : inputToCents(limit);
    if (lim != null && lim < 0) throw new Error('Limite inválido.');
    const body = { name: name.trim(), icon, color, monthly_limit_cents: lim, essential };
    let id = category?.id;
    if (id) await put(`/categories/${id}`, body);
    else id = (await post('/categories', { ...body, sort: data.categories.length })).id;
    await reload();
    toast({ text: category ? 'Categoria atualizada.' : `Categoria “${body.name}” criada.`, ok: true });
    onSaved?.(id);
    onClose();
  });
  return (
    <Modal title={category ? 'Editar categoria' : 'Nova categoria'} onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); s.run().catch(() => {}); }}>
        <Field label="Nome"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Namorada, Patinete, Lazer" autoFocus /></Field>
        <Field label="Tipo">
          <Seg value={essential} onChange={setEssential} options={[[true, 'Essencial'], [false, 'Flexível']]} />
        </Field>
        <p className="hint" style={{ marginTop: -6 }}>{essential ? 'Essencial: necessidade (comida, transporte, saúde). O plano reserva dinheiro para ela primeiro e nunca sugere cortá-la.' : 'Flexível: dá para ajustar quando o dinheiro aperta (passeios, compras). Não é errado gastar com ela.'}</p>
        <Field label="Ícone">
          <div className="icons" role="radiogroup" aria-label="Ícone">
            {ICONS.map((i) => <button type="button" key={i} role="radio" aria-pressed={icon === i} aria-checked={icon === i} onClick={() => setIcon(i)}>{i}</button>)}
          </div>
        </Field>
        <Field label="Cor">
          <div className="swatches" role="radiogroup" aria-label="Cor">
            {COLORS.map((c) => <button type="button" key={c} role="radio" aria-label={c} aria-pressed={color === c} aria-checked={color === c} style={{ background: c }} onClick={() => setColor(c)} />)}
          </div>
        </Field>
        <Field label="Limite por mês (opcional)" hint="Deixe em branco para não ter limite. Serve para alertas; não separa dinheiro.">
          <MoneyInput value={limit} onChange={setLimit} />
        </Field>
        {s.error && <p className="err">{s.error}</p>}
        <div className="form-actions"><button className="btn primary" disabled={s.busy}>{s.busy ? 'Salvando…' : 'Salvar categoria'}</button></div>
      </form>
    </Modal>
  );
}

export default function Categorias() {
  const { data, reload } = useApp();
  const toast = useToast();
  const [edit, setEdit] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const active = data.categories.filter((c) => !c.archived);
  const archived = data.categories.filter((c) => c.archived);
  const move = async (i, dir) => {
    const list = [...active];
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    await put('/categories/order', { ids: [...list, ...archived].map((c) => c.id) });
    await reload();
  };
  const archive = async (c, value) => {
    await put(`/categories/${c.id}`, { archived: value });
    await reload();
    toast({ text: value ? `“${c.name}” arquivada. O histórico continua salvo.` : `“${c.name}” reativada.`, ok: true, action: value ? { label: 'Desfazer', run: async () => { await put(`/categories/${c.id}`, { archived: false }); await reload(); } } : undefined });
  };
  return (
    <div className="stack">
      <div className="row between wrap">
        <p className="muted" style={{ flex: 1 }}>Crie quantas precisar. A ordem aqui é a ordem nos formulários.</p>
        <button className="btn primary" onClick={() => setEdit({})}>+ Nova categoria</button>
      </div>
      {!active.length && <EmptyCta icon="🗂️" title="Nenhuma categoria ativa" action={<button className="btn primary" onClick={() => setEdit({})}>Criar categoria</button>} />}
      <div className="card">
        {active.map((c, i) => (
          <div className="item wrap-actions" key={c.id}>
            <div className="dot" style={{ background: `${c.color}22`, border: `1px solid ${c.color}` }} aria-hidden="true">{c.icon || '•'}</div>
            <div className="grow">
              <div className="t">{c.name}</div>
              <div className="s">{c.essential ? 'Essencial' : 'Flexível'}{c.monthly_limit_cents != null ? ` · limite ${brl(c.monthly_limit_cents)}/mês` : ''}</div>
            </div>
            <div className="actions">
              <button className="btn small ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Subir ${c.name}`}>↑</button>
              <button className="btn small ghost" onClick={() => move(i, 1)} disabled={i === active.length - 1} aria-label={`Descer ${c.name}`}>↓</button>
              <button className="btn small" onClick={() => setEdit(c)}>Editar</button>
              <button className="btn small ghost" onClick={() => archive(c, true)}>Arquivar</button>
            </div>
          </div>
        ))}
      </div>
      {archived.length > 0 && (
        <>
          <button className="btn ghost" onClick={() => setShowArchived(!showArchived)} aria-expanded={showArchived}>{showArchived ? 'Esconder' : 'Mostrar'} arquivadas ({archived.length})</button>
          {showArchived && (
            <div className="card">
              {archived.map((c) => (
                <div className="item" key={c.id}>
                  <div className="dot" aria-hidden="true">{c.icon || '•'}</div>
                  <div className="grow"><div className="t">{c.name}</div><div className="s">Arquivada — lançamentos antigos mantêm esta categoria</div></div>
                  <button className="btn small" onClick={() => archive(c, false)}>Reativar</button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {edit && <CategoryForm category={edit.id ? edit : null} onClose={() => setEdit(null)} />}
    </div>
  );
}
