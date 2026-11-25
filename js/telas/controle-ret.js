/* =====================================================================
   TELA CONTROLE DO .RET (Administração › Controle do .RET) — só desenho
   Os .RET baixados (coleção controleRet do Firestore, js/controle-nsa.js),
   do NSA maior para o menor: NSA, quando, quem, empresa, quantos boletos
   (e se era teste) e os SHA-256 do .RET e do DDA. Sem total em R$.
   Tudo vai para a tela por textContent. Só lê enquanto quem entrou é adm.
   ===================================================================== */

const LIMITE_CONTROLE_RET = 200;   // quantos arquivos a tela mostra (os de NSA maior)
let pararDeAcompanharControleRet = null;

// Desenha a tabela com os registros recebidos.
function desenhaControleRet(lista){
  const corpo = document.getElementById('controleRetCorpo');
  corpo.replaceChildren();
  document.getElementById('controleRetResumo').textContent =
    `${lista.length} arquivo(s) baixado(s)` + (lista.length >= LIMITE_CONTROLE_RET ? ` (os ${LIMITE_CONTROLE_RET} de NSA maior)` : '');
  if(!lista.length){
    const tr = elUsuarios('tr');
    const td = elUsuarios('td', 'vazio', 'Nenhum .RET baixado ainda.');
    td.colSpan = 6;
    tr.appendChild(td);
    corpo.appendChild(tr);
    return;
  }
  lista.forEach(r => {
    const tr = elUsuarios('tr');
    tr.appendChild(elUsuarios('td', 'num', idNsa(r.nsa)));
    tr.appendChild(elUsuarios('td', 'num', dataHoraTela(r.quando)));
    const quem = elUsuarios('td');
    quem.append(elUsuarios('span', '', r.nome || ''), elUsuarios('span', 'sub mono', r.login || ''));
    tr.appendChild(quem);
    tr.appendChild(elUsuarios('td', '', nomeEmpresaHistorico(r.empresa)));
    const qtd = elUsuarios('td', 'num', String(r.qtdBoletos));
    if(r.teste) qtd.appendChild(elUsuarios('span', 'sub', 'teste'));
    tr.appendChild(qtd);
    const shas = elUsuarios('td');
    shas.append(elUsuarios('span', 'sha-rotulo', '.RET'), elUsuarios('span', 'sha', r.shaRet || ''),
                elUsuarios('span', 'sha-rotulo', 'DDA'), elUsuarios('span', 'sha', r.shaDda || ''));
    tr.appendChild(shas);
    corpo.appendChild(tr);
  });
}

// Liga ou desliga a tela conforme quem entrou (só o adm vê esta lista).
// Chamada pela sessão a cada mudança do próprio cadastro.
function ajustaTelaControleRet(cadastro){
  const ehAdmAqui = ehAdmCadastro(cadastro);
  document.getElementById('controleRetSemAcesso').hidden = ehAdmAqui;
  document.getElementById('controleRetArea').hidden = !ehAdmAqui;
  if(!ehAdmAqui){
    if(pararDeAcompanharControleRet){ pararDeAcompanharControleRet(); pararDeAcompanharControleRet = null; }
    return;
  }
  if(pararDeAcompanharControleRet) return;   // já está acompanhando
  const msg = document.getElementById('controleRetMensagem');
  pararDeAcompanharControleRet = acompanhaControleRet(LIMITE_CONTROLE_RET, lista => { msg.hidden = true; desenhaControleRet(lista); },
    err => { msg.className = 'mensagem mensagem-alerta'; msg.textContent = mensagemErroConta(err); msg.hidden = false; });
}
