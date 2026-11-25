/* =====================================================================
   TELA USUÁRIOS (Administração › Usuários) — só desenho
   Tabela com todos os cadastros: nome (editável) com o login embaixo
   (só leitura), papel, situação, último acesso e os botões Liberar,
   Bloquear, Editar nome e Resetar acesso (com o passo a passo do console
   do Firebase e a marca "pedido de reset" no cadastro novo). As conferências e a gravação ficam no
   js/login/usuarios.js; quem trava de verdade são as regras do Firestore.
   Tudo que vem do cadastro vai para a tela por textContent.
   A lista só é lida enquanto quem entrou é adm (a sessão liga e desliga).
   ===================================================================== */

let pararDeAcompanharUsuarios = null;
let uidDoAdm = '';
let usuarioEditando = '';    // uid da linha com o nome aberto para edição ('' = nenhuma)
let ultimaListaUsuarios = [];
let paresReset = {};         // { uidNovo: cadastroAntigo } dos resets em andamento

// Formata a data do Firestore (Timestamp) como dd/mm/aaaa hh:mm; sem data, "—".
function dataHoraTela(ts){
  if(!ts || typeof ts.toDate !== 'function') return '—';
  const d = ts.toDate();
  const dois = n => String(n).padStart(2, '0');
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()} ${dois(d.getHours())}:${dois(d.getMinutes())}`;
}

// Cria um elemento com classe e texto (atalho para o desenho da tabela).
function elUsuarios(tag, classe, texto){
  const el = document.createElement(tag);
  if(classe) el.className = classe;
  if(texto != null) el.textContent = texto;
  return el;
}

// Escreve a mensagem do topo da tela (ok ou alerta); texto vazio esconde.
function mensagemUsuarios(texto, tipo){
  const msg = document.getElementById('usuariosMensagem');
  msg.className = 'mensagem mensagem-' + (tipo || 'ok');
  msg.textContent = texto || '';
  msg.hidden = !texto;
}

// Pede a mudança, confirma se o adm vai tirar o próprio acesso, grava e avisa.
async function mudaUsuario(u, pedido, botao){
  const r = mudancaUsuario(u, pedido);
  if(r.erro){ mensagemUsuarios(r.erro, 'alerta'); return false; }
  if(tiraProprioAdm(u.uid, uidDoAdm, r.dados)){
    const ok = await pedeConfirmacao('Você vai tirar seu próprio acesso de adm. Tem certeza?', 'Sim, tirar meu acesso');
    if(!ok) return false;
  }
  if(botao) botao.disabled = true;
  try{
    await gravaMudancaUsuario(u.uid, r.dados);
    mensagemUsuarios('Alteração gravada: ' + (r.dados.nome || u.nome) + '.', 'ok');
    return true;
  }catch(err){
    mensagemUsuarios(mensagemErroConta(err), 'alerta');
    if(botao) botao.disabled = false;
    return false;
  }
}

// Pede confirmação, grava o pedido de reset e abre o passo a passo do console.
async function resetaUsuario(u, botao){
  const r = pedidoDeReset(u, uidDoAdm);
  if(r.erro){ mensagemUsuarios(r.erro, 'alerta'); return; }
  const ok = await pedeConfirmacao(`Resetar o acesso de ${u.nome || u.login}? A pessoa fica bloqueada até criar a conta de novo.`, 'Resetar acesso');
  if(!ok) return;
  botao.disabled = true;
  try{
    await gravaPedidoDeReset(u.uid, r.dados);
    mensagemUsuarios('', 'ok');
    mostraPassoAPasso({ ...u, ...r.dados });
  }catch(err){
    mensagemUsuarios(mensagemErroConta(err), 'alerta');
    botao.disabled = false;
  }
}

// Libera o cadastro novo de um reset: libera com o papel antigo e apaga o antigo (num lote só).
async function concluiReset(novo, botao){
  const r = conclusaoDeReset(novo, paresReset[novo.uid]);
  if(r.erro){ mensagemUsuarios(r.erro, 'alerta'); return; }
  botao.disabled = true;
  try{
    await gravaConclusaoDeReset(novo.uid, r);
    escondePassoAPasso();
    mensagemUsuarios(`Reset concluído: ${novo.nome || novo.login} liberado de novo.`, 'ok');
  }catch(err){
    mensagemUsuarios(mensagemErroConta(err), 'alerta');
    botao.disabled = false;
  }
}

// Mostra o passo a passo para o adm excluir a conta no console do Firebase.
function mostraPassoAPasso(u){
  const area = document.getElementById('usuariosReset');
  document.getElementById('resetNome').textContent = u.nome || '';
  document.getElementById('resetLogin').textContent = u.login || '';
  const link = document.getElementById('resetLink');
  link.href = linkConsoleContas(CONFIG_FIREBASE.projectId);
  link.textContent = 'Abra Authentication › Usuários no console do Firebase';
  document.getElementById('resetCopiado').textContent = '';
  area.dataset.login = u.login || '';
  area.hidden = false;
  area.scrollIntoView({ block: 'nearest' });
}

// Fecha o passo a passo.
function escondePassoAPasso(){
  document.getElementById('usuariosReset').hidden = true;
}

// Copia o login do passo a passo (para colar na busca do console).
async function copiaLoginReset(){
  const aviso = document.getElementById('resetCopiado');
  try{
    if(!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('sem acesso');
    await navigator.clipboard.writeText(document.getElementById('usuariosReset').dataset.login || '');
    aviso.textContent = 'Login copiado.';
  }catch(e){ aviso.textContent = 'Não deu para copiar: selecione o login e copie à mão.'; }
}

// Célula do nome: o nome (ou a caixa de edição) e o login embaixo, sempre só leitura.
function celulaNome(u){
  const td = elUsuarios('td', 'usuario-celula');
  if(usuarioEditando === u.uid){
    const form = elUsuarios('form', 'usuario-editar');
    form.noValidate = true;
    const input = elUsuarios('input');
    input.type = 'text';
    input.maxLength = NOME_MAXIMO;
    input.value = u.nome || '';
    input.setAttribute('aria-label', 'Nome de ' + (u.nome || ''));
    const salvar = elUsuarios('button', 'botao botao-principal', 'Salvar');
    salvar.type = 'submit';
    const cancelar = elUsuarios('button', 'botao', 'Cancelar');
    cancelar.type = 'button';
    cancelar.addEventListener('click', () => { usuarioEditando = ''; desenhaUsuarios(); });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if(await mudaUsuario(u, { nome: input.value }, salvar)){ usuarioEditando = ''; desenhaUsuarios(); }
    });
    form.append(input, salvar, cancelar);
    td.appendChild(form);
    setTimeout(() => input.focus());
  } else {
    td.appendChild(elUsuarios('span', 'usuario-nome-celula', u.nome || '(sem nome)'));
  }
  // o login (e-mail interno) é a prova de quem é: mostrado, nunca editável
  td.appendChild(elUsuarios('span', 'sub mono', u.login || 'sem login gravado (entra uma vez para gravar)'));
  if(u.uid === uidDoAdm) td.appendChild(elUsuarios('span', 'sub', 'você'));
  if(u.resetPedido === true) td.appendChild(elUsuarios('span', 'etiqueta st-aviso usuario-marca', 'reset pedido: excluir a conta no console'));
  if(paresReset[u.uid]) td.appendChild(elUsuarios('span', 'etiqueta st-aviso usuario-marca', 'pedido de reset'));
  return td;
}

// Botões da linha: Liberar (se não está liberado), Bloquear (se não está bloqueado) e Editar nome.
function celulaAcoes(u){
  const td = elUsuarios('td', 'usuario-acoes');
  const botao = (texto, classe, acao) => {
    const b = elUsuarios('button', 'botao ' + (classe || ''), texto);
    b.type = 'button';
    b.addEventListener('click', () => acao(b));
    td.appendChild(b);
  };
  if(paresReset[u.uid]) botao('Liberar', 'botao-principal', b => concluiReset(u, b));   // cadastro novo de um reset
  else if(u.resetPedido === true) botao('Cancelar reset', '', b => mudaUsuario(u, { status: 'liberado' }, b));
  else if(u.status !== 'liberado') botao('Liberar', 'botao-principal', b => mudaUsuario(u, { status: 'liberado' }, b));
  if(u.status !== 'bloqueado') botao('Bloquear', '', b => mudaUsuario(u, { status: 'bloqueado' }, b));
  if(usuarioEditando !== u.uid) botao('Editar nome', '', () => { usuarioEditando = u.uid; desenhaUsuarios(); });
  if(u.resetPedido === true) botao('Ver passo a passo', '', () => mostraPassoAPasso(u));
  else if(u.uid !== uidDoAdm && u.login && !paresReset[u.uid]) botao('Resetar acesso', '', b => resetaUsuario(u, b));
  return td;
}

// Desenha a tabela inteira com a última lista recebida.
function desenhaUsuarios(){
  const corpo = document.getElementById('usuariosCorpo');
  corpo.replaceChildren();
  paresReset = paresDeReset(ultimaListaUsuarios);
  if(!ultimaListaUsuarios.length){
    const tr = elUsuarios('tr');
    const td = elUsuarios('td', 'vazio', 'Nenhum usuário cadastrado.');
    td.colSpan = 5;
    tr.appendChild(td);
    corpo.appendChild(tr);
    return;
  }
  ultimaListaUsuarios.forEach(u => {
    const tr = elUsuarios('tr', u.status === 'aguardando' ? 'linha-aviso' : '');
    tr.appendChild(celulaNome(u));
    tr.appendChild(elUsuarios('td', '', PAPEIS[u.papel] || String(u.papel || '')));
    const tdSt = elUsuarios('td');
    const st = STATUS_CADASTRO[u.status];
    tdSt.appendChild(elUsuarios('span', 'etiqueta st-' + (st ? st.classe : 'neutro'), st ? st.nome : String(u.status || '')));
    tr.appendChild(tdSt);
    tr.appendChild(elUsuarios('td', 'num', dataHoraTela(u.ultimoAcesso)));
    tr.appendChild(celulaAcoes(u));
    corpo.appendChild(tr);
  });
  const espera = ultimaListaUsuarios.filter(u => u.status === 'aguardando').length;
  document.getElementById('usuariosResumo').textContent =
    `${ultimaListaUsuarios.length} usuário(s) · ${espera} aguardando liberação`;
}

// Liga ou desliga a tela conforme quem entrou: adm passa a acompanhar a lista;
// qualquer outro só vê o aviso (e as regras recusariam a leitura de qualquer jeito).
// Chamada pela sessão a cada mudança do próprio cadastro.
function ajustaTelaUsuarios(cadastro, uid){
  const ehAdmAqui = !!cadastro && cadastro.papel === 'adm' && cadastro.status === 'liberado';
  document.body.classList.toggle('eh-adm', ehAdmAqui);
  document.getElementById('usuariosSemAcesso').hidden = ehAdmAqui;
  document.getElementById('usuariosArea').hidden = !ehAdmAqui;
  if(!ehAdmAqui){
    if(pararDeAcompanharUsuarios){ pararDeAcompanharUsuarios(); pararDeAcompanharUsuarios = null; }
    ultimaListaUsuarios = [];
    return;
  }
  uidDoAdm = uid;
  if(pararDeAcompanharUsuarios) return;   // já está acompanhando
  pararDeAcompanharUsuarios = acompanhaUsuarios(
    lista => { ultimaListaUsuarios = lista; desenhaUsuarios(); },
    err => mensagemUsuarios(mensagemErroConta(err), 'alerta'));
}

// Liga a caixa de confirmação e os botões do passo a passo. Chamada uma vez pela sessão.
function iniciaTelaUsuarios(){
  iniciaConfirmacao();
  document.getElementById('resetCopiar').addEventListener('click', copiaLoginReset);
  document.getElementById('resetFechar').addEventListener('click', escondePassoAPasso);
}
