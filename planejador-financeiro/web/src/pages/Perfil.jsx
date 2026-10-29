import { useApp, TopBar } from '../App.jsx';
import Conta from './Conta.jsx';
import Dinheiro from './Dinheiro.jsx';
import Aprender from './Aprender.jsx';
import Categorias from './Categorias.jsx';
import Fixos from './Fixos.jsx';
import { Icon } from '../ui.jsx';

const SECTIONS = [
  ['contas', 'contas', 'Contas e saldos', 'Onde está seu dinheiro, saldos e transferências', Dinheiro],
  ['categorias', 'categorias', 'Categorias', 'Criar, editar, ordenar e arquivar', Categorias],
  ['fixos', 'fixos', 'Rendas e despesas fixas', 'O que entra e sai todo mês', Fixos],
  ['dados', 'dados', 'Meus dados e segurança', 'Nome, nascimento, senha, tema, exportar', Conta],
  ['aprender', 'aprender', 'Onde guardar e investir', 'Conteúdo educativo', Aprender],
];

export default function Perfil() {
  const { route, go, logout, data } = useApp();
  const sec = SECTIONS.find((s) => s[0] === route.sub);
  if (sec) {
    const [, , title, , Comp] = sec;
    return (
      <>
        <TopBar title={title}><button className="btn small" onClick={() => go('perfil')}>‹ Perfil</button></TopBar>
        <Comp embedded />
      </>
    );
  }
  return (
    <>
      <TopBar title="Perfil" subtitle={`Usuário: ${data.user.username}`} />
      <div className="menu">
        {SECTIONS.map(([k, ico, l, d]) => (
          <button key={k} onClick={() => go(`perfil/${k}`)}>
            <span className="ico" aria-hidden="true"><Icon name={ico} /></span>
            <span className="grow"><b>{l}</b><small>{d}</small></span>
            <span className="faint" aria-hidden="true"><Icon name="seta" size={18} /></span>
          </button>
        ))}
        <button onClick={logout}><span className="ico" aria-hidden="true"><Icon name="sair" /></span><span className="grow"><b>Sair</b><small>Encerrar a sessão neste aparelho</small></span></button>
      </div>
    </>
  );
}
