/* =====================================================================
   CAIXA DE ENVIO DE ARQUIVO
   Liga uma caixa onde o usuário clica para escolher o arquivo OU arrasta
   e solta. O arquivo não é enviado a lugar nenhum: só é entregue para a
   função da tela, que lê no próprio navegador.
   A caixa pode ficar TRAVADA (ex.: antes de escolher banco e empresa):
   aí nem o clique nem o arrastar aceitam arquivo.
   Com { varios: true } a caixa aceita vários arquivos de uma vez (PDFs do
   Bradesco) e entrega a lista; escolher de novo ENTREGA MAIS arquivos (a tela
   decide se junta com os anteriores).
   Marcação esperada (ver index.html):
     <label class="caixa-envio"> <input type="file" class="caixa-envio-input"> ...
       <span class="caixa-envio-arquivo">Nenhum arquivo escolhido</span> </label>
   ===================================================================== */

// Prepara a caixa: ao escolher ou soltar um arquivo, mostra o nome dele
// (com textContent, porque o nome vem do usuário) e chama aoEscolher(arquivo).
// opcoes.varios = true: chama aoEscolher([arquivos]) com todos os escolhidos/soltos.
function ligaCaixaEnvio(caixa, aoEscolher, opcoes){
  const varios = !!(opcoes && opcoes.varios);
  const entrada = caixa.querySelector('input[type=file]');
  const nome = caixa.querySelector('.caixa-envio-arquivo');

  entrada.addEventListener('change', () => {
    if(varios){
      const lista = Array.from(entrada.files);
      entrada.value = '';                   // deixa escolher o mesmo arquivo de novo (vira "repetido")
      if(lista.length) aceitaVarios(lista);
    }else if(entrada.files[0]) aceita(entrada.files[0]);
  });

  // destaca a caixa enquanto o arquivo está sendo arrastado por cima dela
  ['dragover', 'dragenter'].forEach(ev =>
    caixa.addEventListener(ev, e => { e.preventDefault(); if(!entrada.disabled) caixa.classList.add('arrastando'); }));
  ['dragleave', 'drop'].forEach(ev =>
    caixa.addEventListener(ev, e => { e.preventDefault(); caixa.classList.remove('arrastando'); }));
  caixa.addEventListener('drop', e => {
    if(entrada.disabled) return;            // caixa travada: ignora o arquivo solto
    if(varios){ const lista = Array.from(e.dataTransfer.files); if(lista.length) aceitaVarios(lista); return; }
    const arquivo = e.dataTransfer.files[0];
    if(arquivo){ entrada.files = e.dataTransfer.files; aceita(arquivo); }
  });

  // vários arquivos: marca a caixa e entrega a lista (a tela escreve o resumo depois de ler)
  function aceitaVarios(lista){
    caixa.classList.add('escolhido');
    if(nome) nome.textContent = lista.length === 1 ? '✓ ' + lista[0].name : `✓ ${lista.length} arquivos`;
    aoEscolher(lista);
  }

  // marca a caixa como preenchida e entrega o arquivo para a tela
  function aceita(arquivo){
    caixa.classList.add('escolhido');
    if(nome) nome.textContent = '✓ ' + arquivo.name;
    aoEscolher(arquivo);
  }
}

// Esvazia a caixa (sem arquivo) e trava ou destrava. texto = o que aparece no lugar do nome.
function preparaCaixaEnvio(caixa, travada, texto){
  const entrada = caixa.querySelector('input[type=file]');
  entrada.value = '';
  entrada.disabled = travada;
  caixa.classList.toggle('travada', travada);
  caixa.classList.remove('escolhido', 'recusado', 'arrastando');
  caixa.querySelector('.caixa-envio-arquivo').textContent = texto;
}

// Marca o arquivo da caixa como recusado (vermelho), por exemplo de outra empresa.
function recusaCaixaEnvio(caixa){
  caixa.classList.remove('escolhido');
  caixa.classList.add('recusado');
}
