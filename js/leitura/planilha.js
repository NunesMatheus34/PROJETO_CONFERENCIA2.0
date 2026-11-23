/* =====================================================================
   ABRIR PLANILHA (Excel)
   Lê o arquivo escolhido pelo usuário SÓ no navegador (FileReader +
   SheetJS). Nada do arquivo sai do computador.
   O código de barras é sempre lido como TEXTO: uma célula numérica vira
   Number no JavaScript, que arredonda depois do 15º dígito sem avisar.
   Precisa do SheetJS (XLSX) carregado antes, pelo index.html.
   ===================================================================== */

// Abre o Excel e devolve a primeira aba (objeto do SheetJS).
// cellDates: datas do Excel chegam como Date, como no projeto antigo.
function lerPrimeiraAba(arquivo){
  return new Promise((resolve, rejeita) => {
    const leitor = new FileReader();
    leitor.onload = e => {
      try{
        const wb = XLSX.read(new Uint8Array(e.target.result), {type:'array', cellDates:true});
        resolve(wb.Sheets[wb.SheetNames[0]]);
      }catch(err){ rejeita(err); }
    };
    leitor.onerror = () => rejeita(new Error('Não consegui ler o arquivo.'));
    leitor.readAsArrayBuffer(arquivo);
  });
}

// Matriz de uma aba: lista de linhas, cada linha uma lista de células (célula vazia = null).
// Os valores vêm crus (número, texto, data); para código de barras use textoDe.
function matrizDaAba(aba){
  return XLSX.utils.sheet_to_json(aba, {header:1, raw:true, defval:null});
}

// Abre um Excel e devolve { matriz, textoDe, linhaExcel }.
// - matriz: as células como em matrizDaAba;
// - textoDe(i, j): o TEXTO da célula na linha i e coluna j (mesmos índices da matriz):
//   o valor original quando a célula já é texto; senão o texto formatado (cell.w), nunca Number.
//   eraTexto = false quando o Excel não gravou a célula como texto (número, data...):
//   número no Excel só guarda 15 dígitos, então um código de barras ali pode já estar alterado.
//   Célula vazia conta como texto (vazio);
// - linhaExcel(i): o número da linha no Excel (1, 2, 3...), para mostrar ao usuário.
async function lerMatrizComTexto(arquivo){
  const aba = await lerPrimeiraAba(arquivo);
  const matriz = matrizDaAba(aba);
  const ini = XLSX.utils.decode_range(aba['!ref'] || 'A1');
  const textoDe = (i, j) => {
    const cel = aba[XLSX.utils.encode_cell({ r: ini.s.r + i, c: ini.s.c + j })];
    if(!cel || cel.v === null || cel.v === undefined) return { texto:'', eraTexto:true };
    if(typeof cel.v === 'string') return { texto:cel.v, eraTexto:true };
    return { texto: cel.w !== undefined ? String(cel.w) : '', eraTexto:false };
  };
  return { matriz, textoDe, linhaExcel: i => ini.s.r + i + 1 };
}

// Código de barras de uma célula lida por lerMatrizComTexto: só os dígitos do texto,
// e suspeito = true quando a célula não era texto (num número o Excel pode ter trocado
// os últimos dígitos por zero ou gravado em notação científica, ex.: 2,38E+43).
// Quem chama deve BLOQUEAR o código suspeito, nunca tentar consertar.
function codigoBarrasDaCelula(leitura, i, j){
  const { texto, eraTexto } = leitura.textoDe(i, j);
  return { digitos: apenasDigitos(texto), suspeito: !eraTexto };
}
