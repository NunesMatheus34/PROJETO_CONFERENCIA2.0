/* =====================================================================
   DDA → .RET: EXCEL DE CONFERÊNCIA (sub-etapa 6)
   Monta as 4 abas do Excel que vai junto com o .RET baixado:
     "Boletos no arquivo" (com o total), "Fora do arquivo" (com o motivo),
     "Atenção" (alertas da sub-etapa 4 e vencimento diferente) e
     "Controle" (data/hora, empresa, NSA, quantidade, total e os SHA-256
     do .RET e do DDA de origem).
   Código de barras, linha digitável, CPF/CNPJ, Nº Doc. e SHA-256 vão como
   TEXTO (numFmt '@'), para não perder zero nem dígito.
   Só monta as abas (mesmo formato de escreveAba, js/excel.js); gravar e
   ler de volta fica no js/excel.js.
   Precisa de js/boleto.js (soDigitos, barrasParaLinha), js/conferencias/dda.js
   (FMT_REAL), js/conferencias/dda-ret-alertas.js (TIPOS_ATENCAO_RET, origemBoletoRet)
   e js/leitura/formatos.js (brl).
   ===================================================================== */

// Nomes das abas, na ordem do arquivo (também usados na releitura).
const ABAS_EXCEL_RET = ['Boletos no arquivo', 'Fora do arquivo', 'Atenção', 'Controle'];

// Linha digitável (47, só números) de um código de 44 dígitos que já passou nas travas.
function linhaDigitavelRet(b){
  return barrasParaLinha(soDigitos(b.codigoTexto));
}

// Monta as abas. Entrada: { gerado (de geraRet), travas, alertas, empresa, nsa, agora,
// shaRet, dda: { nome, sha256 }, leitura }. Devolve a lista de abas para montaExcel.
// "Atenção" só traz os alertas dos boletos que estão NESTE arquivo (no teste, os 3).
function abasExcelRet({ gerado, travas, alertas, empresa, nsa, agora, shaRet, dda, leitura }){
  const noArquivo = new Set(gerado.boletos);
  const txt = (cab, w) => ({ cab, w, fmt:'@' });
  const boletos = {
    nome: ABAS_EXCEL_RET[0], titulo: `Boletos no arquivo ${gerado.nomeArquivo} (${gerado.qtdBoletos})`, cor:'ok',
    colunas: [{ cab:'#', w:5 }, { cab:'Beneficiário', w:38 }, txt('CPF/CNPJ', 20), txt('Nº Doc.', 16), txt('Vencimento', 12),
              { cab:'Valor (Até Venc.)', w:16, fmt: FMT_REAL }, txt('Código de barras', 48), txt('Linha digitável', 52)],
    linhas: gerado.boletos.map((b, i) => [i + 1, b.beneficiario, String(b.cnpj), String(b.doc || ''), String(b.venc),
              b.valor, soDigitos(b.codigoTexto), linhaDigitavelRet(b)]),
  };
  boletos.linhas.push(['', `Total · ${gerado.qtdBoletos} boleto(s)`, '', '', '', gerado.total, '', '']);

  const fora = {
    nome: ABAS_EXCEL_RET[1], titulo: `Fora do arquivo (${travas.fora.length}): não vão para o .RET; confira direto no banco`, cor:'alerta',
    colunas: [{ cab:'Origem', w:12 }, { cab:'Beneficiário', w:38 }, txt('CPF/CNPJ', 20), txt('Vencimento', 12),
              { cab:'Valor (Até Venc.)', w:16, fmt: FMT_REAL }, txt('Código de barras (como veio)', 48), { cab:'Motivo', w:70, quebra:true }],
    linhas: travas.fora.map(i => [origemBoletoRet(i.boleto), i.boleto.beneficiario, String(i.boleto.cnpj || ''), String(i.boleto.venc || ''),
              i.boleto.valor, String(i.boleto.codigoTexto || ''), i.motivos.join('\n')]),
  };

  const nomeTipo = Object.fromEntries(TIPOS_ATENCAO_RET.map(t => [t.id, t.nome]));
  const linhasAtencao = alertas.atencao.filter(a => noArquivo.has(a.boleto)).map(a => [nomeTipo[a.tipo], a.boleto, a.texto]);
  travas.comAviso.filter(i => noArquivo.has(i.boleto)).forEach(i =>
    linhasAtencao.push(['Vencimento do código diferente do DDA', i.boleto, i.avisos.join('; ') + '. Confira antes de pagar.']));
  const atencao = {
    nome: ABAS_EXCEL_RET[2], titulo: `Atenção antes de importar (${linhasAtencao.length}): estes boletos estão no arquivo`, cor:'aviso',
    colunas: [{ cab:'Alerta', w:30 }, { cab:'Origem', w:12 }, { cab:'Beneficiário', w:38 }, txt('CPF/CNPJ', 20), txt('Banco', 8),
              txt('Vencimento', 12), { cab:'Valor (Até Venc.)', w:16, fmt: FMT_REAL }, { cab:'O que conferir', w:70, quebra:true }],
    linhas: linhasAtencao.map(([alerta, b, texto]) => [alerta, origemBoletoRet(b), b.beneficiario, String(b.cnpj), String(b.banco || ''),
              String(b.venc), b.valor, texto]),
  };

  const dois = n => String(n).padStart(2, '0');
  const quando = `${dois(agora.getDate())}/${dois(agora.getMonth() + 1)}/${agora.getFullYear()} ${dois(agora.getHours())}:${dois(agora.getMinutes())}:${dois(agora.getSeconds())}`;
  const controle = {
    nome: ABAS_EXCEL_RET[3], titulo: 'Controle do arquivo .RET', cor:'neutro',
    colunas: [{ cab:'Campo', w:30 }, txt('Valor', 80)],
    linhas: [
      ['Data/hora da geração', quando],
      ['Empresa', `${empresa.nome} (${empresa.cnpj})`],
      ['NSA', String(nsa).padStart(6, '0')],
      ['Arquivo .RET', gerado.nomeArquivo],
      ['Quantidade de boletos', String(gerado.qtdBoletos)],
      ['Total "Até Venc."', brl(gerado.total)],
      ['SHA-256 do .RET', shaRet],
      ['DDA de origem', dda.nome],
      ['SHA-256 do DDA de origem', dda.sha256],
      ['Boletos lidos do DDA', `${leitura.boletos.length} · ${brl(leitura.total)}`],
      ['Fora do arquivo', `${travas.fora.length} · ${brl(travas.totalFora)}`],
      ['Alertas de atenção', String(linhasAtencao.length)],
    ],
  };
  return [boletos, fora, atencao, controle];
}
