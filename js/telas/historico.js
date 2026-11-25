/* =====================================================================
   TELA HISTÓRICO (Administração › Histórico) — só desenho
   Os últimos registros de uso, do mais novo para o mais velho: quando,
   quem (nome e login), tela, banco, empresa e as quantidades por aba.
   Os registros já chegam sem fornecedor, código ou valor (js/login/historico.js
   e as regras do firestore.rules). Tudo vai para a tela por textContent.
   Só lê enquanto quem entrou é adm (a sessão liga e desliga).
   ===================================================================== */

const LIMITE_HISTORICO = 200;   // quantos registros a tela mostra (os mais novos)
let pararDeAcompanharHistorico = null;

// Nome da tela e da empresa para a tabela (id desconhecido aparece como veio).
function nomeTelaHistorico(id){
  const t = TELAS_COM_PERMISSAO.find(x => x.tela === id);
  return t ? t.titulo : String(id || '');
}
function nomeEmpresaHistorico(id){
  const e = EMPRESAS.find(x => x.id === id);
  return e ? e.nome : String(id || '');
}

// Desenha a tabela com os registros recebidos.
function desenhaHistorico(lista){
  const corpo = document.getElementById('historicoCorpo');
  corpo.replaceChildren();
  document.getElementById('historicoResumo').textContent =
    `${lista.length} registro(s)` + (lista.length >= LIMITE_HISTORICO ? ` (os ${LIMITE_HISTORICO} mais novos)` : '');
  if(!lista.length){
    const tr = elUsuarios('tr');
    const td = elUsuarios('td', 'vazio', 'Nenhum uso registrado ainda.');
    td.colSpan = 6;
    tr.appendChild(td);
    corpo.appendChild(tr);
    return;
  }
  lista.forEach(h => {
    const tr = elUsuarios('tr');
    tr.appendChild(elUsuarios('td', 'num', dataHoraTela(h.quando)));
    const quem = elUsuarios('td');
    quem.append(elUsuarios('span', '', h.nome || ''), elUsuarios('span', 'sub mono', h.login || ''));
    tr.appendChild(quem);
    tr.appendChild(elUsuarios('td', '', nomeTelaHistorico(h.tela)));
    tr.appendChild(elUsuarios('td', '', NOMES_BANCO_HISTORICO[h.banco] || String(h.banco || '')));
    const emp = nomeEmpresaHistorico(h.empresa) + (h.empresa2 ? ' × ' + nomeEmpresaHistorico(h.empresa2) : '');
    tr.appendChild(elUsuarios('td', '', emp));
    tr.appendChild(elUsuarios('td', 'historico-abas', textoAbasHistorico(h.abas) || '—'));
    corpo.appendChild(tr);
  });
}

// Liga ou desliga a tela conforme quem entrou (só o adm lê o histórico).
// Chamada pela sessão a cada mudança do próprio cadastro.
function ajustaTelaHistorico(cadastro){
  const ehAdmAqui = ehAdmCadastro(cadastro);
  document.getElementById('historicoSemAcesso').hidden = ehAdmAqui;
  document.getElementById('historicoArea').hidden = !ehAdmAqui;
  if(!ehAdmAqui){
    if(pararDeAcompanharHistorico){ pararDeAcompanharHistorico(); pararDeAcompanharHistorico = null; }
    return;
  }
  if(pararDeAcompanharHistorico) return;   // já está acompanhando
  const msg = document.getElementById('historicoMensagem');
  pararDeAcompanharHistorico = acompanhaHistorico(LIMITE_HISTORICO, lista => { msg.hidden = true; desenhaHistorico(lista); },
    err => { msg.className = 'mensagem mensagem-alerta'; msg.textContent = mensagemErroConta(err); msg.hidden = false; });
}
