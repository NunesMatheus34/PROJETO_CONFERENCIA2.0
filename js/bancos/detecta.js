/* =====================================================================
   RECONHECER O DDA (de que banco e de que conta)
   Descobre pelo CONTEÚDO do arquivo (não pelo nome) de qual banco é o DDA
   e qual CNPJ da conta aparece no topo dele. Serve para avisar quando o
   arquivo é de outro banco ou de outra empresa, antes de conferir.
   Precisa de js/leitura/formatos.js e js/bancos/itau.js (achaCabecalhoItau).
   ===================================================================== */

// Nome de cada banco para mostrar na tela (o mesmo nome usado em EMPRESAS.bancos).
// O Bradesco vem em PDF e é reconhecido pelo próprio leitor (js/bancos/bradesco.js).
const NOMES_BANCO = { santander:'Santander', itau:'Itaú', bradesco:'Bradesco' };

// Descobre o banco do DDA pela matriz do Excel: 'santander', 'itau' ou null se não reconhecer.
// Itaú: tem a linha de cabeçalho com "Beneficiário" e "Código de barras".
// Santander: tem, nas 30 primeiras linhas, as colunas "Nosso Número" e "Beneficiário".
// (Igual ao projeto antigo.)
function detectaBanco(m){
  if(achaCabecalhoItau(m) >= 0) return 'itau';
  for(let i=0; i<Math.min(m.length, 30); i++){
    const cels = (m[i] || []).map(normaliza);
    if(cels.includes('NOSSO NUMERO') && cels.includes('BENEFICIARIO')) return 'santander';
  }
  return null;
}

// Mensagem para quando o DDA enviado é de outro banco que o escolhido no topo da tela.
function avisoBancoErrado(achado, escolhido){
  return `Este arquivo é um DDA do ${NOMES_BANCO[achado]}, mas o banco escolhido é ${NOMES_BANCO[escolhido]}. ` +
         `Troque o banco no topo da tela ou envie o DDA do ${NOMES_BANCO[escolhido]}.`;
}

// CNPJ da conta que o banco escreve no topo do DDA, antes da lista de boletos
// (Santander: linha 2, embaixo de "CPF/CNPJ:"; Itaú: "CPF/CNPJ: 11.222.333/0001-44", CNPJ fictício).
// Procura o primeiro CNPJ escrito (00.000.000/0000-00) nas 10 primeiras linhas e
// devolve só os 14 dígitos, ou '' se não achar.
function cnpjDaContaDda(m){
  for(let i=0; i<Math.min(m.length, 10); i++){
    for(const cel of (m[i] || [])){
      const achou = cel!=null && String(cel).match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
      if(achou) return apenasDigitos(achou[0]);
    }
  }
  return '';
}
