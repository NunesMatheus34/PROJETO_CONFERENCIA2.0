/* =====================================================================
   LER UM ARQUIVO .RET (CNAB 240 de DDA do Itaú)
   Abre o .RET escolhido SÓ no navegador e separa as linhas e os
   registros. Serve para o "modelo .RET" da tela DDA → .RET: dele o site
   copia o header de arquivo e o header de lote da empresa pagadora.
   Nada deste arquivo é guardado (nem no navegador, nem no código):
   o modelo fica só na memória da tela enquanto ela está aberta.
   Posições como no manual do banco, contadas a partir de 1:
     1-3 banco · 4-7 lote · 8 tipo de registro (0 header de arquivo,
     1 header de lote, 3 detalhe, 5 trailer de lote, 9 trailer de arquivo)
     · 14 segmento (no detalhe; G = boleto do DDA).
   Precisa de js/leitura/pdf.js (bytesDoArquivo) e js/leitura/formatos.js.
   ===================================================================== */

// Tamanho de toda linha de um CNAB 240.
const TAMANHO_LINHA_CNAB = 240;

// Pedaço da linha pelas posições do manual (de 1 a 240, as duas pontas incluídas).
function campoCnab(linha, ini, fim){
  return linha.slice(ini - 1, fim);
}

// true se o texto só tem caracteres ASCII visíveis (espaço até "~").
// O .RET do banco é ASCII puro; acento ou caractere de controle indica arquivo estranho.
function soAscii(texto){
  return /^[\x20-\x7E]*$/.test(texto);
}

// Separa o texto do .RET em linhas. Aceita CRLF ou LF; a linha vazia do fim (depois
// da última quebra) não conta. Os bytes viram caracteres um a um (latin1), para que
// o tamanho da linha seja o número de bytes, como o sistema conta.
function linhasDoRet(bytes){
  const texto = new TextDecoder('latin1').decode(bytes);
  const linhas = texto.split(/\r?\n/);
  if(linhas.length && linhas[linhas.length - 1] === '') linhas.pop();
  return linhas;
}

// CNPJ de 15 dígitos (como no .RET) mostrado como 00.000.000/0000-00.
// O 1º dígito do campo de 15 é zero à esquerda; se não for, mostra os 15 como vieram.
function cnpjDoRetFormatado(cnpj15){
  if(!/^0\d{14}$/.test(cnpj15)) return cnpj15;
  const c = cnpj15.slice(1);
  return `${c.slice(0,2)}.${c.slice(2,5)}.${c.slice(5,8)}/${c.slice(8,12)}-${c.slice(12)}`;
}

// Data DDMMAAAA do .RET como dd/mm/aaaa ('' se não for uma data de 8 dígitos).
function dataDoRet(ddmmaaaa){
  return /^\d{8}$/.test(ddmmaaaa) ? `${ddmmaaaa.slice(0,2)}/${ddmmaaaa.slice(2,4)}/${ddmmaaaa.slice(4)}` : '';
}

// Hora HHMMSS do .RET como hh:mm:ss ('' se não for uma hora de 6 dígitos).
function horaDoRet(hhmmss){
  return /^\d{6}$/.test(hhmmss) ? `${hhmmss.slice(0,2)}:${hhmmss.slice(2,4)}:${hhmmss.slice(4)}` : '';
}

// Lê o modelo .RET (bytes) e devolve o que a tela precisa, ou { erro } dizendo por que
// o arquivo não serve de modelo. Não conserta nada: qualquer coisa fora do layout bloqueia.
// Devolve { headerArquivo, lotes: [{ cnpj, linha }], data, hora, nsa, qtdLinhas, qtdBoletos }:
//   headerArquivo = a linha 0 inteira (240), lotes = cada header de lote com o CNPJ de 15
//   dígitos (posições 19-33), data (144-151), hora (152-157) e nsa (158-163) do header de
//   arquivo, só para mostrar. Posições conferidas com um .RET real do Itaú (2 lotes, matriz e filial).
function leModeloRet(bytes){
  const linhas = linhasDoRet(bytes);
  if(!linhas.length) return { erro:'O arquivo está vazio.' };

  const torta = linhas.findIndex(l => l.length !== TAMANHO_LINHA_CNAB);
  if(torta >= 0) return { erro:`Não é um .RET CNAB 240: a linha ${torta + 1} tem ${linhas[torta].length} caracteres (o certo é 240).` };

  const tipo = l => campoCnab(l, 8, 8);
  const header = linhas[0];
  if(campoCnab(header, 1, 3) !== '341' || tipo(header) !== '0')
    return { erro:'Não é um .RET do Itaú: a 1ª linha não é o header de arquivo do banco 341.' };
  if(tipo(linhas[linhas.length - 1]) !== '9')
    return { erro:'O .RET está incompleto: a última linha não é o trailer de arquivo.' };
  if(!linhas.some(l => tipo(l) === '3' && campoCnab(l, 14, 14) === 'G'))
    return { erro:'Não parece um .RET de DDA: não tem nenhum boleto (segmento G). Use o último .RET de DDA que o Itaú mandou.' };

  // header de arquivo e headers de lote vão ser copiados para o arquivo novo: têm que ser ASCII
  const lotes = [];
  for(let i = 0; i < linhas.length; i++){
    const l = linhas[i];
    if(tipo(l) !== '0' && tipo(l) !== '1') continue;
    if(!soAscii(l)) return { erro:`A linha ${i + 1} do .RET (header) tem caractere fora do padrão (acento ou controle).` };
    if(tipo(l) === '1') lotes.push({ cnpj: campoCnab(l, 19, 33), linha: l, numero: i + 1 });
  }
  if(!lotes.length) return { erro:'O .RET não tem nenhum header de lote.' };

  // o mesmo CNPJ em dois headers de lote DIFERENTES deixaria em dúvida qual copiar
  for(const lote of lotes){
    const outro = lotes.find(o => o.cnpj === lote.cnpj && o.linha !== lote.linha);
    if(outro) return { erro:`O .RET tem dois headers de lote diferentes do CNPJ ${cnpjDoRetFormatado(lote.cnpj)} (linhas ${lote.numero} e ${outro.numero}). Use outro .RET de modelo.` };
  }
  const unicos = lotes.filter((l, i) => lotes.findIndex(o => o.cnpj === l.cnpj) === i);

  return {
    headerArquivo: header,
    lotes: unicos.map(({ cnpj, linha }) => ({ cnpj, linha })),
    data: dataDoRet(campoCnab(header, 144, 151)),
    hora: horaDoRet(campoCnab(header, 152, 157)),
    nsa: campoCnab(header, 158, 163),
    qtdLinhas: linhas.length,
    qtdBoletos: linhas.filter(l => tipo(l) === '3' && campoCnab(l, 14, 14) === 'G').length,
  };
}

// Abre o arquivo .RET escolhido (só no navegador) e lê como modelo (leModeloRet).
async function lerModeloRet(arquivo){
  return leModeloRet(await bytesDoArquivo(arquivo));
}
