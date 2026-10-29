import { useMemo, useState } from 'react';
import { useApp } from '../App.jsx';
import { put } from '../api.js';
import * as C from '@shared/calc.js';
import { ageOn } from '@shared/dates.js';
import { Field, Seg, Alert, brl } from '../ui.jsx';

const CONSULTA = '29/10/2026';

// Comparação educativa: características gerais, sem taxas atuais e sem ranking.
const PRODUTOS = [
  { nome: 'Conta remunerada / caixinha', liq: 'Geralmente diária (confira no banco)', risco: 'Baixo', ir: 'Sim, tabela regressiva (quando é CDB/RDB por trás)', garantia: 'FGC, se for produto bancário coberto', bom: 'Reserva e metas curtas' },
  { nome: 'Poupança', liq: 'Diária (rende no “aniversário” mensal)', risco: 'Baixo', ir: 'Isenta para pessoa física', garantia: 'FGC', bom: 'Reserva; simplicidade' },
  { nome: 'Tesouro Selic', liq: 'Resgate em D+0/D+1 em dias úteis', risco: 'Baixo (título do governo; pequena oscilação possível)', ir: 'Sim, regressiva; pode haver taxa de custódia B3', garantia: 'Tesouro Nacional (não é FGC)', bom: 'Reserva e metas de qualquer prazo' },
  { nome: 'CDB com liquidez diária', liq: 'Diária', risco: 'Baixo a médio (depende do banco emissor)', ir: 'Sim, regressiva', garantia: 'FGC até o limite', bom: 'Reserva e metas curtas' },
  { nome: 'CDB / LCI / LCA com vencimento', liq: 'Só no vencimento (às vezes com carência)', risco: 'Baixo a médio (depende do emissor)', ir: 'CDB: regressiva · LCI/LCA: isentas para PF (regra vigente)', garantia: 'FGC até o limite', bom: 'Metas com data certa, se o vencimento bater com o prazo' },
  { nome: 'Tesouro Prefixado / IPCA+', liq: 'Diária, mas o preço oscila antes do vencimento', risco: 'Médio se vender antes (marcação a mercado)', ir: 'Sim, regressiva', garantia: 'Tesouro Nacional', bom: 'Metas longas com vencimento compatível' },
  { nome: 'Ações, ETFs, criptomoedas', liq: 'Alta, mas o valor pode cair muito', risco: 'Alto', ir: 'Regras próprias', garantia: 'Nenhuma', bom: 'Só objetivos de longo prazo, com parte pequena e tolerância a perdas. Não serve para metas curtas.' },
];

function suggestions({ months, needsLiquidity, tolerance, hasReserve, reserveLow, debts, tight, minor }) {
  const out = [];
  if (debts) out.push({ tone: 'bad', text: 'Antes de investir: dívidas com juros altos (cartão rotativo, cheque especial) costumam custar muito mais do que qualquer aplicação rende. Priorizar quitá-las tende a ser o melhor “investimento”.' });
  if (tight) out.push({ tone: 'warn', text: 'Seu orçamento até a próxima renda está apertado ou negativo. Garanta as contas próximas antes de aplicar dinheiro com prazo.' });
  if (!hasReserve || reserveLow) out.push({ tone: 'warn', text: 'Reserva para imprevistos primeiro: ela deve ficar em algo com resgate rápido e baixo risco (caixinha com liquidez diária, Tesouro Selic, CDB de liquidez diária ou poupança).' });
  if (minor) out.push({ tone: 'info', text: 'Como você é menor de idade, contas em corretoras (para Tesouro Direto, CDB etc.) precisam ser vinculadas a um responsável legal; muitos bancos digitais também pedem autorização do responsável. Operações com derivativos são proibidas para menores.' });
  let fit;
  if (months == null) fit = 'Defina um prazo para a meta para ver opções compatíveis.';
  else if (months < 12 || needsLiquidity) fit = 'Prazo curto ou necessidade de resgate: combinam opções de baixo risco e liquidez diária — caixinha/conta remunerada, CDB com liquidez diária, Tesouro Selic ou poupança. Evite ações, criptomoedas e aplicações que travam o dinheiro além do prazo.';
  else if (months <= 36) fit = 'Prazo de 1 a 3 anos: além das opções de liquidez diária, podem combinar CDB/LCI/LCA com vencimento antes do prazo (se você não precisar resgatar antes) e Tesouro com vencimento compatível. Renda variável não é indicada para esse prazo.';
  else fit = tolerance === 'baixa'
    ? 'Prazo longo e baixa tolerância a perdas: renda fixa (Tesouro Selic, Tesouro IPCA+ com vencimento próximo do prazo, CDBs de bancos sólidos) mantém o risco baixo.'
    : 'Prazo longo: renda fixa continua sendo a base. Com tolerância a perdas e reserva completa, uma parte pequena em renda variável diversificada (ex.: ETFs) é algo que algumas pessoas consideram — entendendo que o valor pode cair bastante e demorar a recuperar.';
  out.push({ tone: 'ok', text: fit });
  return out;
}

export default function Aprender() {
  const { data, today, reload } = useApp();
  const goals = data.goals.filter((g) => !g.archived);
  const [goalId, setGoalId] = useState(goals[0]?.id || '');
  const [liq, setLiq] = useState(false);
  const [debts, setDebts] = useState(false);
  const tolerance = data.profile.risk_tolerance;
  const age = data.profile.birth_date ? ageOn(data.profile.birth_date, today) : null;
  const m = useMemo(() => { const g = goals.find((x) => x.id === goalId); return g ? C.goalMetrics(g, data, today) : null; }, [goalId, data, today]);
  const reserve = goals.find((g) => g.kind === 'reserva');
  const rm = reserve ? C.goalMetrics(reserve, data, today) : null;
  const sp = useMemo(() => C.spendable(data, today), [data, today]);
  const list = suggestions({
    months: m?.monthsLeft ?? (m?.status === 'vencida' ? 0 : null), needsLiquidity: liq || m?.goal.kind === 'reserva', tolerance,
    hasReserve: !!reserve, reserveLow: rm ? rm.progress < 0.5 : true, debts, tight: sp.hasAccounts && (sp.livreFinal < 0 || sp.tight || sp.overdue.length > 0), minor: age != null && age < 18,
  });
  return (
    <>
      <Alert tone="info">Conteúdo educativo, não é recomendação de investimento. O app não mostra rentabilidades atuais e não garante ganhos. Confira as condições de cada produto na instituição antes de decidir.</Alert>

      <section className="card section">
        <h2>O que combina com o seu objetivo</h2>
        <div className="form-grid" style={{ marginTop: 12 }}>
          <Field label="Meta"><select className="input" value={goalId} onChange={(e) => setGoalId(e.target.value)}><option value="">— nenhuma —</option>{goals.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></Field>
          <Field label="Tolerância a perdas">
            <Seg value={tolerance} onChange={async (v) => { await put('/profile', { risk_tolerance: v }); await reload(); }} options={[['baixa', 'Baixa'], ['media', 'Média'], ['alta', 'Alta']]} />
          </Field>
          <label className="check"><input type="checkbox" checked={liq} onChange={(e) => setLiq(e.target.checked)} />Posso precisar desse dinheiro antes do prazo</label>
          <label className="check"><input type="checkbox" checked={debts} onChange={(e) => setDebts(e.target.checked)} />Tenho dívidas com juros (cartão, cheque especial, empréstimo)</label>
        </div>
        <div className="kpis">
          <div className="kpi"><div className="l">Idade</div><div className="v">{age ?? 'não informada'}</div></div>
          <div className="kpi"><div className="l">Prazo da meta</div><div className="v">{m?.monthsLeft != null ? `${Math.floor(m.monthsLeft)} meses` : m ? (m.status === 'vencida' ? 'vencido' : '—') : '—'}</div></div>
          <div className="kpi"><div className="l">Reserva</div><div className="v">{rm ? `${Math.round(rm.progress * 100)}% (${brl(rm.current)})` : 'não criada'}</div></div>
          <div className="kpi"><div className="l">Contas próximas</div><div className="v num">{brl(sp.compromissos)}</div></div>
        </div>
        <div className="stack" style={{ marginTop: 14 }}>{list.map((s, i) => <Alert key={i} tone={s.tone}>{s.text}</Alert>)}</div>
      </section>

      <section className="card section">
        <h2>Comparação educativa</h2>
        <p className="hint">Características gerais, em ordem sem significado (não é ranking). Taxas e condições variam por instituição e mudam com o tempo.</p>
        <div className="scroll-x">
          <table className="table">
            <thead><tr><th>Tipo</th><th>Liquidez</th><th>Risco</th><th>Imposto de Renda</th><th>Garantia</th><th>Costuma servir para</th></tr></thead>
            <tbody>{PRODUTOS.map((p) => <tr key={p.nome}><td><b>{p.nome}</b></td><td>{p.liq}</td><td>{p.risco}</td><td>{p.ir}</td><td>{p.garantia}</td><td>{p.bom}</td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className="card section prose">
        <h2>Conceitos em linguagem simples</h2>
        <h3>Liquidez</h3>
        <p>É a rapidez para transformar a aplicação em dinheiro de volta, sem perder valor. Reserva de emergência precisa de liquidez diária.</p>
        <h3>Risco</h3>
        <p>É a chance de o valor oscilar ou de você receber menos do que esperava. Para metas curtas, o risco precisa ser baixo, porque não dá tempo de esperar uma recuperação.</p>
        <h3>Imposto de Renda na renda fixa</h3>
        <ul>
          <li>Tabela regressiva sobre o <b>rendimento</b> (não sobre o valor aplicado): 22,5% até 180 dias; 20% de 181 a 360; 17,5% de 361 a 720; 15% acima de 720 dias.</li>
          <li>IOF regressivo sobre o rendimento em resgates com menos de 30 dias.</li>
          <li>Poupança, LCI e LCA são isentas de IR para pessoa física pelas regras vigentes na data da consulta (houve propostas de mudança em 2025; confira se algo mudou).</li>
        </ul>
        <h3>Garantias</h3>
        <ul>
          <li><b>FGC</b> (Fundo Garantidor de Créditos): cobre depósitos e aplicações como conta, poupança, CDB, RDB, LCI e LCA até R$ 250 mil por CPF por instituição/conglomerado, com teto de R$ 1 milhão a cada 4 anos. Não cobre Tesouro Direto, ações ou fundos.</li>
          <li><b>Tesouro Direto</b>: títulos emitidos pelo governo federal; o risco de crédito é do Tesouro Nacional.</li>
        </ul>
        <h3>Poupança</h3>
        <p>Quando a Selic está acima de 8,5% ao ano, rende 0,5% ao mês + TR; quando está em 8,5% ou menos, rende 70% da Selic + TR. Rende só no “aniversário” mensal do depósito.</p>
        <h3>Menores de idade</h3>
        <p>Não há idade mínima para Tesouro Direto e bolsa, mas a conta do menor fica vinculada a um responsável legal, que participa da abertura (no Tesouro há o “TD Família”). Derivativos (opções, futuros, minicontratos) exigem 18 anos.</p>
        <h3>Fontes (consultadas em {CONSULTA})</h3>
        <ul>
          <li><a href="https://www.fgc.org.br/garantia-fgc/sobre-a-garantia-fgc" target="_blank" rel="noreferrer">FGC — Sobre a garantia</a></li>
          <li><a href="https://www.tesourodireto.com.br/b/td-familia-ensine-seus-filhos-a-investir" target="_blank" rel="noreferrer">Tesouro Direto — TD Família</a></li>
          <li><a href="https://borainvestir.b3.com.br/objetivos-financeiros/investir-melhor/tenho-menos-de-18-anos-como-posso-comecar-a-investir/" target="_blank" rel="noreferrer">B3 Bora Investir — Tenho menos de 18 anos, como posso começar a investir?</a></li>
          <li><a href="https://www.bcb.gov.br/estabilidadefinanceira/remuneradepositospoupanca" target="_blank" rel="noreferrer">Banco Central — Remuneração dos depósitos de poupança</a></li>
          <li><a href="https://www.gov.br/receitafederal/pt-br" target="_blank" rel="noreferrer">Receita Federal — tributação de aplicações financeiras</a></li>
          <li><a href="https://borainvestir.b3.com.br/noticias/lcis-e-lcas-tributacao-da-renda-fixa-jcp-como-a-mp-1303-afeta-seus-investimentos/" target="_blank" rel="noreferrer">B3 Bora Investir — MP 1303 e tributação de LCI/LCA</a></li>
        </ul>
        <p className="hint">Regras podem mudar depois da data de consulta. Na dúvida, confirme nas fontes oficiais.</p>
      </section>
    </>
  );
}
