/* =====================================================================
   PERMISSÕES POR TELA E POR EMPRESA
   O cadastro (usuarios/{uid}) ganha o campo
     permissoes: { telas: ['conferencia-dda', ...], empresas: ['crv-matriz', ...] }
   que só o adm grava (tela Administração › Usuários; as regras do
   firestore.rules recusam qualquer outro).
     - adm (papel "adm"): vê TODAS as telas e empresas, sem marcar nada;
     - os outros: só o que está marcado. Sem o campo = NADA (decisão do
       dono do projeto: quem ainda não foi marcado não vê tela nenhuma).
   Início, Ajuda e Perfil não dependem de permissão.
   Os arquivos são lidos só no navegador, então esconder tela e empresa
   aqui é o caminho certo, não a trava do servidor: o que vai para o
   Firebase (histórico) é conferido pelas regras contra estas permissões.
   Este arquivo não fala com o Firebase.
   ===================================================================== */

// Telas que dependem de permissão (as das conferências e dos arquivos do menu).
// Tela nova no MENU do js/app.js que deva ser controlada: acrescente aqui também.
const TELAS_COM_PERMISSAO = [
  { tela: 'conferencia-dda',     titulo: 'Conferência DDA' },
  { tela: 'codigo-barras',       titulo: 'Código de barras' },
  { tela: 'conferencia-boletos', titulo: 'Conferência de boletos' },
  { tela: 'dda-ret',             titulo: 'DDA → .RET' },
];

// Telas que todo usuário liberado vê, sem marcar nada.
const TELAS_SEMPRE = ['inicio', 'ajuda', 'perfil'];

// Cadastro de quem está usando o site agora (a sessão escreve; null = ninguém liberado).
let cadastroComPermissoes = null;

// Guarda o cadastro de quem entrou (chamada pela sessão a cada mudança do cadastro).
function defineCadastroPermissoes(cadastro){
  cadastroComPermissoes = cadastro || null;
}

// É adm liberado? (vê tudo)
function ehAdmCadastro(cadastro){
  return !!cadastro && cadastro.papel === 'adm' && cadastro.status === 'liberado';
}

// Lista gravada no cadastro (telas ou empresas); sem campo ou com valor estranho = [].
function listaPermitida(cadastro, campo){
  const p = cadastro && cadastro.permissoes;
  const lista = p && p[campo];
  return Array.isArray(lista) ? lista.filter(x => typeof x === 'string') : [];
}

// A pessoa pode abrir esta tela? Adm: sim. Telas sempre abertas: sim (se liberado).
// Tela sem controle de permissão (ex.: Usuários): fica a cargo da própria tela e das regras.
function podeVerTela(cadastro, tela){
  if(!cadastro || cadastro.status !== 'liberado') return false;
  if(ehAdmCadastro(cadastro) || TELAS_SEMPRE.includes(tela)) return true;
  if(!TELAS_COM_PERMISSAO.some(t => t.tela === tela)) return true;
  return listaPermitida(cadastro, 'telas').includes(tela);
}

// A pessoa pode usar esta empresa (objeto da tabela EMPRESAS ou o id)?
function podeUsarEmpresa(cadastro, empresa){
  if(!cadastro || cadastro.status !== 'liberado' || !empresa) return false;
  if(ehAdmCadastro(cadastro)) return true;
  const id = typeof empresa === 'string' ? empresa : empresa.id;
  return listaPermitida(cadastro, 'empresas').includes(id);
}

// Atalho para as telas: a empresa pode ser usada por quem está no site agora?
function empresaPermitida(empresa){
  return podeUsarEmpresa(cadastroComPermissoes, empresa);
}

// Atalho para o menu: a tela pode ser aberta por quem está no site agora?
function telaPermitida(tela){
  return podeVerTela(cadastroComPermissoes, tela);
}

// Confere as permissões que o adm marcou e devolve { dados: { permissoes } } ou { erro }.
// Só ids conhecidos (sem repetir, na ordem das listas oficiais); adm não precisa de permissão.
function mudancaPermissoes(cadastro, telas, empresas){
  if(cadastro.papel === 'adm') return { erro: 'O adm vê todas as telas e empresas: não há o que marcar.' };
  const idsTelas = TELAS_COM_PERMISSAO.map(t => t.tela);
  const idsEmpresas = EMPRESAS.map(e => e.id);
  const estranhas = [...telas.filter(t => !idsTelas.includes(t)), ...empresas.filter(e => !idsEmpresas.includes(e))];
  if(estranhas.length) return { erro: 'Permissão desconhecida: ' + estranhas.join(', ') + '.' };
  const permissoes = {
    telas: idsTelas.filter(t => telas.includes(t)),
    empresas: idsEmpresas.filter(e => empresas.includes(e)),
  };
  const antes = { telas: listaPermitida(cadastro, 'telas'), empresas: listaPermitida(cadastro, 'empresas') };
  if(JSON.stringify(antes) === JSON.stringify(permissoes) && cadastro.permissoes) return { erro: 'Nada mudou.' };
  return { dados: { permissoes } };
}

// Resumo para a tabela do adm: "todas (adm)", "nenhuma" ou "2 telas · 1 empresa".
function resumoPermissoes(cadastro){
  if(cadastro.papel === 'adm') return { texto: 'Todas (adm)', classe: 'ok' };
  const t = listaPermitida(cadastro, 'telas').length;
  const e = listaPermitida(cadastro, 'empresas').length;
  if(!t || !e) return { texto: t || e ? `${t} tela(s) · ${e} empresa(s): incompleto` : 'Nenhuma', classe: 'alerta' };
  return { texto: `${t} tela(s) · ${e} empresa(s)`, classe: 'neutro' };
}
