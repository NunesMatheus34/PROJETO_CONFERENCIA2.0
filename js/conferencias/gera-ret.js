/* =====================================================================
   DDA → .RET: GERAÇÃO DO ARQUIVO (sub-etapa 5, layout CNAB 240 DDA Itaú)
   Monta o texto do .RET com os boletos que passaram em TODAS as travas
   da sub-etapa 3. Só copia o que veio do banco (código, CPF/CNPJ, nome,
   vencimento, valor e Nº Doc.), nas posições do layout; o resto são
   valores fixos (ver _referencia/PROMPT_RET.md, ETAPA 5, e a correção do
   segmento H em _referencia/ret_campos.md: H 18-73 é o sacador/avalista,
   e o arquivo NUNCA leva desconto nem sacador).
   Toda linha sai com exatamente 240 caracteres, só ASCII sem minúsculas
   nem acento, terminada em CRLF (inclusive a última). Se qualquer linha
   não fechar, a geração é BLOQUEADA: nada é cortado ou consertado depois.
   Posições contadas a partir de 1, como no manual.
   Só regras: a tela fica em js/telas/dda-ret.js.
   Precisa de js/leitura/ret.js (campoCnab, TAMANHO_LINHA_CNAB),
   js/boleto.js (soDigitos), js/cpf-cnpj.js (documentoSemPontuacao),
   js/leitura/formatos.js (normaliza, formatData) e js/conferencias/dda-ret.js
   (cnpjDaEmpresaNoRet, loteDaEmpresa, somaAteVenc).
   ===================================================================== */

// Quantos boletos vão no "Gerar teste".
const QTD_BOLETOS_TESTE_RET = 3;

// Pode gerar? Só com a contagem fechada (PDF igual ao declarado e todas as páginas, ou
// nenhuma linha do Excel sem leitura) e com pelo menos um boleto aprovado nas travas.
// Devolve { ok, motivo }. A contagem vale mesmo que as travas mostrem boletos "no arquivo":
// um boleto que sumiu na leitura não aparece em lista nenhuma.
function podeGerarRet(leitura, travas){
  if(!leitura || !travas) return { ok:false, motivo:'Envie o modelo .RET e o DDA, e escolha a empresa.' };
  if(!leitura.contagem.ok) return { ok:false, motivo:'A contagem dos boletos não fecha (veja acima): sem ela fechada, nenhum arquivo é gerado.' };
  if(!travas.noArquivo.length) return { ok:false, motivo:'Nenhum boleto passou nas travas: não há o que pôr no arquivo.' };
  return { ok:true, motivo:'' };
}

// Texto para um campo alfanumérico do .RET: sem acento, maiúsculo; o que não for letra,
// número ou espaço vira espaço (pontuação também); cortado ou completado com espaços à
// direita até o tamanho. Usado no nome do beneficiário (o .RET real não tem pontuação no nome).
function textoCnab(texto, tamanho){
  const limpo = normaliza(texto).replace(/[^A-Z0-9 ]/g, ' ');
  return limpo.slice(0, tamanho).padEnd(tamanho, ' ');
}

// Número com zeros à esquerda até o tamanho. Bloqueia (lança erro) se não couber ou se não
// for só dígitos: nunca corta um número.
function numeroCnab(digitos, tamanho){
  const d = String(digitos);
  if(!/^\d+$/.test(d) || d.length > tamanho) throw new Error(`número "${d}" não cabe em ${tamanho} posições`);
  return d.padStart(tamanho, '0');
}

// dd/mm/aaaa -> DDMMAAAA (bloqueia se a data não estiver completa).
function dataCnab(ddmmaaaa){
  const d = formatData(ddmmaaaa);
  if(!/^\d{2}\/\d{2}\/\d{4}$/.test(d)) throw new Error(`vencimento "${ddmmaaaa}" não é uma data dd/mm/aaaa`);
  return d.replace(/\//g, '');
}

// Nº Doc. do G 148-157: o documento como veio, só sem acento e em maiúsculas, cortado ou
// completado com espaços até 10; vazio se ele for só "0". A pontuação FICA (o .RET real do
// banco tem "88790/1" e "00001714-6" nesse campo): só o que não é ASCII visível vira espaço.
function numeroDocCnab(doc){
  if(String(doc || '').trim() === '0') return ' '.repeat(10);
  return normaliza(doc).replace(/[^\x20-\x7E]/g, ' ').slice(0, 10).padEnd(10, ' ');
}

// Início comum do G e do H: 1-3 banco, 4-7 lote "0001", 8 tipo "3", 9-13 sequencial, 14 segmento, 15 espaço.
function inicioDetalheRet(sequencial, segmento){
  return '341' + '0001' + '3' + numeroCnab(sequencial, 5) + segmento + ' ';
}

// Segmento G de um boleto (posições do PROMPT_RET.md, ETAPA 5).
function segmentoGRet(b, sequencial){
  const doc = documentoSemPontuacao(b.cnpj);
  const tipoDoc = doc.length === 11 ? '1' : '2';                 // 62: 1 = CPF, 2 = CNPJ
  return inicioDetalheRet(sequencial, 'G') +
    '01' +                                                       // 16-17 código de movimento
    soDigitos(b.codigoTexto) +                                   // 18-61 código de barras, como veio
    tipoDoc +                                                    // 62
    doc.padStart(15, '0') +                                      // 63-77 CPF/CNPJ com 15 posições
    textoCnab(b.beneficiario, 30) +                              // 78-107 nome
    dataCnab(b.venc) +                                           // 108-115 vencimento
    numeroCnab(Math.round(b.valor * 100), 15) +                  // 116-130 "Até Venc." em centavos
    '00' +                                                       // 131-132
    '000000000000009' +                                          // 133-147
    numeroDocCnab(b.doc) +                                       // 148-157 Nº Doc.
    '     ' +                                                    // 158-162
    '000000' + ' '.repeat(9) +                                   // 163-177
    ' 102' + '00000000' + '000' +                                // 178-192
    '00' + '0' + '00000000' +                                    // 193-203
    '0 00000000000000' +                                         // 204-219
    '0'.repeat(11) +                                             // 220-230
    '0'.repeat(10);                                              // 231-240
}

// Segmento H de um boleto, sempre SEM desconto e SEM sacador/avalista: 18 "0", 19-33 zeros,
// 34-73 espaços (como o banco grava quando não há sacador); o resto zeros e espaços fixos.
function segmentoHRet(sequencial){
  return inicioDetalheRet(sequencial, 'H') +
    '01' +                                                       // 16-17
    '0' + '0'.repeat(15) + ' '.repeat(40) +                      // 18-73 sacador/avalista: nenhum
    ' ' + '0'.repeat(8) + '0'.repeat(15) +                       // 74-97
    ' ' + '0'.repeat(8) + '0'.repeat(15) +                       // 98-121
    '0' + '0'.repeat(8) + '0'.repeat(15) +                       // 122-145
    '0'.repeat(15) +                                             // 146-160
    ' '.repeat(80);                                              // 161-240
}

// Header de arquivo: a linha do modelo, trocando só 144-151 data, 152-157 hora e 158-163 NSA.
function headerArquivoRet(modelo, agora, nsa){
  const h = modelo.headerArquivo;
  const dois = n => String(n).padStart(2, '0');
  const data = dois(agora.getDate()) + dois(agora.getMonth() + 1) + agora.getFullYear();
  const hora = dois(agora.getHours()) + dois(agora.getMinutes()) + dois(agora.getSeconds());
  return h.slice(0, 143) + data + hora + numeroCnab(nsa, 6) + h.slice(163);
}

// Header de lote: a linha do modelo cujo 19-33 é o CNPJ da empresa, com 4-7 trocado por "0001".
function headerLoteRet(modelo, empresa){
  const r = loteDaEmpresa(modelo, empresa);
  if(r.bloqueio) throw new Error(r.bloqueio);
  return r.lote.linha.slice(0, 3) + '0001' + r.lote.linha.slice(7);
}

// Trailer de lote: 18-23 registros do lote (2 por boleto + header e trailer), 24-41 soma em centavos.
function trailerLoteRet(qtdBoletos, somaCentavos){
  return '341' + '0001' + '5' + ' '.repeat(9) + numeroCnab(2 * qtdBoletos + 2, 6) +
    numeroCnab(somaCentavos, 18) + '0'.repeat(18) + ' '.repeat(181);
}

// Trailer de arquivo: 18-23 "000001" lote, 24-29 total de linhas do arquivo.
function trailerArquivoRet(totalLinhas){
  return '341' + '9999' + '9' + ' '.repeat(9) + '000001' + numeroCnab(totalLinhas, 6) + ' '.repeat(211);
}

// Nome do arquivo: DDA_<MATRIZ ou FILIAL>_<menor vencimento dos boletos, DDMMAAAA>_<TESTE ou COMPLETO>.RET.
function nomeArquivoRet(empresa, boletos, teste){
  const chave = v => v.split('/').reverse().join('');
  const menor = boletos.map(b => formatData(b.venc)).sort((a, b) => chave(a).localeCompare(chave(b)))[0] || '';
  return `DDA_${/filial/i.test(empresa.id) ? 'FILIAL' : 'MATRIZ'}_${menor.replace(/\//g, '')}_${teste ? 'TESTE' : 'COMPLETO'}.RET`;
}

// Monta o .RET. Entrada: { modelo, empresa, leitura, travas, nsa, agora, teste }.
// Entram SÓ os boletos de travas.noArquivo (no "teste", os 3 primeiros, na ordem do DDA).
// Devolve { texto, linhas, boletos, qtdBoletos, total, nomeArquivo } ou { bloqueio } com o motivo.
function geraRet({ modelo, empresa, leitura, travas, nsa, agora, teste }){
  const pode = podeGerarRet(leitura, travas);
  if(!pode.ok) return { bloqueio: pode.motivo };
  const boletos = travas.noArquivo.map(i => i.boleto).slice(0, teste ? QTD_BOLETOS_TESTE_RET : undefined);
  let linhas;
  try{
    const detalhes = boletos.flatMap((b, i) => [segmentoGRet(b, 2 * i + 1), segmentoHRet(2 * i + 2)]);
    const somaCentavos = boletos.reduce((s, b) => s + Math.round(b.valor * 100), 0);
    linhas = [headerArquivoRet(modelo, agora, nsa), headerLoteRet(modelo, empresa), ...detalhes, trailerLoteRet(boletos.length, somaCentavos)];
    linhas.push(trailerArquivoRet(linhas.length + 1));
  }catch(err){
    return { bloqueio: 'Não deu para montar o arquivo: ' + err.message + '. Nada foi gerado.' };
  }
  const torta = linhas.findIndex(l => l.length !== TAMANHO_LINHA_CNAB || !/^[\x20-\x7E]*$/.test(l) || /[a-z]/.test(l));
  if(torta >= 0) return { bloqueio:`A linha ${torta + 1} do arquivo não ficou com 240 caracteres ASCII maiúsculos. Nada foi gerado.` };
  return { texto: linhas.join('\r\n') + '\r\n', linhas, boletos, qtdBoletos: boletos.length,
           total: somaAteVenc(boletos), nomeArquivo: nomeArquivoRet(empresa, boletos, teste) };
}
