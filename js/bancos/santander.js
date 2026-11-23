/* =====================================================================
   LEITOR DO DDA DO SANTANDER ("Pagador Eletrônico")
   Recebe a matriz do Excel e devolve a lista de boletos no formato comum
   que a conferência usa:
     { venc, beneficiario, cnpj, doc, valor, valorAPagar, codigoBarras,
       pagador, banco, comDesconto }
   O que o Santander não traz fica vazio ('' nos textos, null nos valores).
   Trazido do projeto antigo sem mudar a regra.
   Precisa de js/leitura/formatos.js.
   ===================================================================== */

// Cabeçalho na linha 5; boletos a partir da linha 6 (índice 5).
// Colunas: A=Vencimento(0) B=Beneficiário(1) C=Nosso Número(2) D=Pagador(3) E=Valor(4).
// Linha sem valor na coluna E é ignorada. Não traz CNPJ, valor a pagar, banco
// emissor nem código de barras.
function leitorSantander(m){
  const out = [];
  for(let i=5; i<m.length; i++){
    const linha = m[i] || [];
    const venc  = linha[0];
    const nome  = linha[1];
    const doc   = linha[2];
    const pagador = linha[3];
    const valor = paraNumero(linha[4]);
    if(valor===null) continue;
    out.push({
      venc: formatData(venc),
      beneficiario: nome ? String(nome).trim() : '',
      cnpj: '',
      doc: doc!=null ? String(doc).trim() : '',
      valor,
      valorAPagar: null,
      codigoBarras: '',
      pagador: pagador!=null ? String(pagador).trim() : '',
      banco: '',
      comDesconto: false,
    });
  }
  return out;
}
