/* =====================================================================
   FORMATOS DOS VALORES LIDOS
   Funções pequenas que transformam o que veio de uma célula de planilha
   em algo comparável: texto sem acento, só dígitos, número com 2 casas,
   data dd/mm/aaaa e dinheiro em reais para mostrar.
   Vieram do projeto antigo sem mudar a regra: as conferências novas têm
   que dar os mesmos números da versão antiga.
   Nada aqui completa ou corrige código de barras, valor ou vencimento:
   só lê e formata o que já veio do arquivo.
   ===================================================================== */

// Maiúsculo, sem acento e sem espaço nas pontas.
// Serve para comparar cabeçalhos e nomes sem se importar com acento ou caixa.
function normaliza(s){
  if(s===null || s===undefined) return '';
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().trim();
}

// Deixa só os dígitos de um texto (tira ponto, espaço, traço...).
// Recebe sempre o TEXTO da célula; nunca use com um código de barras que já virou Number.
function apenasDigitos(v){
  if(v===null || v===undefined) return '';
  return String(v).replace(/\D+/g,'');
}

// Transforma um valor de dinheiro (número ou texto "1.234,56") num número com 2 casas.
// Devolve null quando não há valor, para a conferência saber que falta o dado.
function paraNumero(v){
  if(v===null || v===undefined || v==='') return null;
  if(typeof v==='number') return Math.round(v*100)/100;
  const s = String(v).replace(/[R$\s]/g,'')
                     .replace(/\./g,'')
                     .replace(',','.');
  const n = parseFloat(s);
  return isNaN(n) ? null : Math.round(n*100)/100;
}

// Data como dd/mm/aaaa, venha ela como Date (planilha) ou como texto.
// Texto é devolvido como veio (sem espaços nas pontas), sem tentar adivinhar o formato.
function formatData(v){
  if(v===null || v===undefined || v==='') return '';
  if(v instanceof Date){
    const d = String(v.getDate()).padStart(2,'0');
    const m = String(v.getMonth()+1).padStart(2,'0');
    return `${d}/${m}/${v.getFullYear()}`;
  }
  return String(v).trim();
}

// Número como dinheiro brasileiro, só para mostrar: 1234.5 -> "R$ 1.234,50".
// Sem valor vira "—", para não parecer que é zero.
function brl(n){
  return (n===null || n===undefined || isNaN(n)) ? '—' : n.toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
}
