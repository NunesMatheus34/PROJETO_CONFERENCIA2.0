/* =====================================================================
   MENSAGENS NA TELA (ok, aviso, alerta)
   Mostra e esconde a caixa de mensagem de uma tela, por exemplo quando o
   arquivo não pôde ser lido ou é de outra empresa.
   O texto vai sempre com textContent: ele pode conter nome de arquivo ou
   dado de planilha, que nunca deve virar HTML.
   ===================================================================== */

// Ícone de cada tipo de mensagem, para não depender só da cor.
const ICONE_MENSAGEM = { ok:'✓', aviso:'!', alerta:'⚠' };

// Mostra a mensagem no elemento (caixa .mensagem) com o tipo 'ok', 'aviso' ou 'alerta'.
function mostraMensagem(elemento, tipo, texto){
  elemento.className = 'mensagem mensagem-' + tipo;
  elemento.textContent = ICONE_MENSAGEM[tipo] + ' ' + texto;
  elemento.hidden = false;
}

// Mostra um erro (mensagem do tipo alerta), como o mostraErro do projeto antigo.
function mostraErro(elemento, texto){
  mostraMensagem(elemento, 'alerta', texto);
}

// Esconde a mensagem e apaga o texto.
function limpaMensagem(elemento){
  elemento.hidden = true;
  elemento.textContent = '';
}
