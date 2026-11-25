/* =====================================================================
   CONFIRMAÇÃO NA TELA (no lugar do confirm() do navegador)
   Uma caixa <dialog id="confirmacao"> do index.html, com o texto e dois
   botões. Serve para os passos que não dá para desfazer sozinho, como o
   adm tirar o próprio acesso de adm.
   ===================================================================== */

// Liga os dois botões da caixa (uma vez). São botões comuns, não <form method="dialog">,
// para não depender do form-action da CSP.
function iniciaConfirmacao(){
  const caixa = document.getElementById('confirmacao');
  document.getElementById('confirmacaoSim').addEventListener('click', () => caixa.close('sim'));
  document.getElementById('confirmacaoNao').addEventListener('click', () => caixa.close('nao'));
}

// Mostra a pergunta e devolve uma Promise: true se a pessoa confirmou, false se cancelou
// (botão Cancelar ou Esc). O texto vai por textContent.
function pedeConfirmacao(texto, textoBotao){
  const caixa = document.getElementById('confirmacao');
  document.getElementById('confirmacaoTexto').textContent = texto;
  document.getElementById('confirmacaoSim').textContent = textoBotao || 'Confirmar';
  return new Promise(resolve => {
    caixa.addEventListener('close', () => resolve(caixa.returnValue === 'sim'), { once: true });
    caixa.returnValue = '';
    caixa.showModal();
    document.getElementById('confirmacaoNao').focus();   // o foco começa no "não"
  });
}
