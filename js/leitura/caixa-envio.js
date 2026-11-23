/* =====================================================================
   CAIXA DE ENVIO DE ARQUIVO
   Liga uma caixa onde o usuário clica para escolher o arquivo OU arrasta
   e solta. O arquivo não é enviado a lugar nenhum: só é entregue para a
   função da tela, que lê no próprio navegador.
   Marcação esperada (ver index.html):
     <label class="caixa-envio"> <input type="file" class="caixa-envio-input"> ...
       <span class="caixa-envio-arquivo">Nenhum arquivo escolhido</span> </label>
   ===================================================================== */

// Prepara a caixa: ao escolher ou soltar um arquivo, mostra o nome dele
// (com textContent, porque o nome vem do usuário) e chama aoEscolher(arquivo).
function ligaCaixaEnvio(caixa, aoEscolher){
  const entrada = caixa.querySelector('input[type=file]');
  const nome = caixa.querySelector('.caixa-envio-arquivo');

  entrada.addEventListener('change', () => { if(entrada.files[0]) aceita(entrada.files[0]); });

  // destaca a caixa enquanto o arquivo está sendo arrastado por cima dela
  ['dragover', 'dragenter'].forEach(ev =>
    caixa.addEventListener(ev, e => { e.preventDefault(); caixa.classList.add('arrastando'); }));
  ['dragleave', 'drop'].forEach(ev =>
    caixa.addEventListener(ev, e => { e.preventDefault(); caixa.classList.remove('arrastando'); }));
  caixa.addEventListener('drop', e => {
    const arquivo = e.dataTransfer.files[0];
    if(arquivo){ entrada.files = e.dataTransfer.files; aceita(arquivo); }
  });

  // marca a caixa como preenchida e entrega o arquivo para a tela
  function aceita(arquivo){
    caixa.classList.add('escolhido');
    if(nome) nome.textContent = '✓ ' + arquivo.name;
    aoEscolher(arquivo);
  }
}
