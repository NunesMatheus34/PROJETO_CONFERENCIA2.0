/* =====================================================================
   LEITOR DO DDA DO ITAÚ ("Consulta Boletos Recebidos" do internet banking)
   Recebe a leitura do Excel (de lerMatrizComTexto) e devolve a lista de
   boletos no formato comum que a conferência usa:
     { venc, beneficiario, cnpj, doc, valor, valorAPagar, codigoBarras,
       pagador, banco, comDesconto, codigoTexto, codigoSuspeito, linhaExcel }
   Trazido do projeto antigo sem mudar a regra. Única diferença: o código
   de barras vem SEMPRE do texto da célula (no antigo, nesta tela, vinha do
   número e podia perder dígitos). Ele só aparece na tela e no Excel; não
   entra na conta da conferência.
   Também tem o filtro por unidade do pagador e a data/hora da consulta.
   Precisa de js/leitura/formatos.js e js/leitura/planilha.js.
   ===================================================================== */

// Linha do cabeçalho: a que tem "Beneficiário" e "Código de barras" (achada pelo
// conteúdo, porque antes dela vêm linhas com os dados da conta). -1 se não achar.
function achaCabecalhoItau(m){
  for(let i=0; i<m.length; i++){
    const cels = (m[i] || []).map(normaliza);
    if(cels.some(c => c.includes('BENEFICIARIO')) &&
       cels.some(c => c.includes('CODIGO') && c.includes('BARRA'))) return i;
  }
  return -1;
}

// Acha cada coluna pelo texto do cabeçalho; se não achar, usa a posição padrão:
// A=Pagador/Agregado B=Beneficiário C=CPF/CNPJ D=Venc. E=Nº Doc. F=Até Venc.
// G=A Pagar H=Tipo de Boleto I=Banco J=Observações K=Código de barras
function colunasItau(linhaCab){
  const cab = (linhaCab || []).map(normaliza);
  const acha = (teste, padrao) => { const i = cab.findIndex(teste); return i>=0 ? i : padrao; };
  return {
    pagador: acha(c => c.startsWith('PAGADOR'), 0),
    benef:   acha(c => c.includes('BENEFICIARIO'), 1),
    cnpj:    acha(c => c.includes('CNPJ'), 2),
    venc:    acha(c => c.startsWith('VENC'), 3),
    doc:     acha(c => c.includes('DOC'), 4),
    ateVenc: acha(c => c.startsWith('ATE VENC'), 5),
    aPagar:  acha(c => c === 'A PAGAR', 6),
    banco:   acha(c => c === 'BANCO', 8),
    codigo:  acha(c => c.includes('CODIGO') && c.includes('BARRA'), 10),
  };
}

// Lê os boletos (leitura = resultado de lerMatrizComTexto).
// "Até Venc." é o valor comparado com o sistema; "A Pagar" fica em valorAPagar.
// Quando os dois são diferentes, o boleto é marcado "com desconto".
// Linha sem "Até Venc." é ignorada.
function leitorItau(leitura){
  const m = leitura.matriz;
  const cab = achaCabecalhoItau(m);
  if(cab<0) return [];
  const c = colunasItau(m[cab]);
  const texto = v => v!=null ? String(v).trim() : '';
  const out = [];
  for(let i=cab+1; i<m.length; i++){
    const linha = m[i] || [];
    const valor = paraNumero(linha[c.ateVenc]);
    if(valor===null) continue;
    const valorAPagar = paraNumero(linha[c.aPagar]);
    const cod = codigoBarrasDaCelula(leitura, i, c.codigo);
    out.push({
      venc: formatData(linha[c.venc]),
      beneficiario: texto(linha[c.benef]),
      cnpj: texto(linha[c.cnpj]),
      doc: texto(linha[c.doc]),
      valor,
      valorAPagar,
      codigoBarras: cod.digitos,
      pagador: texto(linha[c.pagador]),
      banco: texto(linha[c.banco]),
      comDesconto: valorAPagar!==null && valorAPagar!==valor,
      codigoTexto: leitura.textoDe(i, c.codigo).texto,
      codigoSuspeito: cod.suspeito,
      linhaExcel: leitura.linhaExcel(i),
    });
  }
  return out;
}

// Data e hora da consulta, que o Itaú escreve antes do cabeçalho:
// "Data/Hora: 15/10/2026 às 10:39:21" -> "15/10/2026 às 10:39:21" ('' se não achar).
function dataHoraConsultaItau(m){
  const cab = achaCabecalhoItau(m);
  const fim = cab>=0 ? cab : m.length;
  for(let i=0; i<fim; i++){
    for(const cel of (m[i] || [])){
      const achou = cel!=null && String(cel).match(/data\s*\/\s*hora\s*:?\s*(.+)/i);
      if(achou) return achou[1].trim();
    }
  }
  return '';
}

// Unidades do pagador dentro do mesmo DDA. O Pagador vem escrito de vários jeitos
// (CRV INDUSTRIAL LTDA, Crv Industrial..., CRV IND LTDA/MG): quem tem "CAPINOPOLIS"
// (com ou sem acento/espaço) é a Unidade Capinópolis; o resto é "CRV Industrial (sem Capinópolis)".
// No projeto antigo este grupo se chamava "Matriz"; o nome mudou para não confundir com a
// empresa CRV Matriz: nos exemplos, as duas unidades são da conta da CRV Filial.
const NOMES_UNIDADE = { 'sem-capinopolis':'CRV Industrial (sem Capinópolis)', capinopolis:'Unidade Capinópolis' };

// Unidade de um boleto pelo texto do Pagador: 'capinopolis' ou 'sem-capinopolis'.
function unidadeDoPagador(p){
  return normaliza(p).replace(/\s+/g,'').includes('CAPINOPOLIS') ? 'capinopolis' : 'sem-capinopolis';
}
