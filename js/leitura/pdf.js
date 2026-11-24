/* =====================================================================
   ABRIR PDF
   Lê o PDF escolhido pelo usuário SÓ no navegador (FileReader + pdf.js)
   e devolve as palavras de todas as páginas com a posição de cada uma.
   Nada do arquivo sai do computador.
   A posição segue a mesma régua do pdfplumber (usado no projeto antigo,
   _referencia/brad.py): x = esquerda da palavra, top = topo da caixa da
   letra, em pontos, contando de cima da página. Assim as colunas e as
   linhas dos leitores de banco (js/bancos/) dão os mesmos números.
   Precisa do pdf.js (pdfjsLib e pdfjsWorker) carregado pelo index.html.
   ===================================================================== */

// Lê o arquivo como bytes (Uint8Array), sem enviar para lugar nenhum.
function bytesDoArquivo(arquivo){
  return new Promise((resolve, rejeita) => {
    const leitor = new FileReader();
    leitor.onload = e => resolve(new Uint8Array(e.target.result));
    leitor.onerror = () => rejeita(new Error('Não consegui ler o arquivo.'));
    leitor.readAsArrayBuffer(arquivo);
  });
}

// Abre o PDF e devolve { paginas, palavras }:
//   palavras = [{ pagina (0, 1, ...), top, x, texto }] na ordem em que o pdf.js entrega.
// O pdf.js entrega pedaços de texto (às vezes várias palavras juntas); cada pedaço é
// quebrado nos espaços e o x de cada palavra é estimado pela posição da letra no pedaço.
// top = topo da caixa da letra (linha de base menos o tamanho da letra, descontada a
// parte que desce abaixo da linha), igual ao "top" do pdfplumber.
async function lerPalavrasPdf(arquivo){
  if(!window.pdfjsLib || !window.pdfjsWorker)
    throw new Error('A biblioteca de PDF não carregou. Confira a internet e recarregue a página.');
  const dados = await bytesDoArquivo(arquivo);
  const tarefa = pdfjsLib.getDocument({
    data: dados, disableFontFace: true, isEvalSupported: false,
    verbosity: pdfjsLib.VerbosityLevel ? pdfjsLib.VerbosityLevel.ERRORS : 0,
  });
  const doc = await tarefa.promise;
  const paginas = doc.numPages;
  const palavras = [];
  try{
    for(let p = 1; p <= paginas; p++){
      const pagina = await doc.getPage(p);
      const vista = pagina.getViewport({ scale: 1 });
      const conteudo = await pagina.getTextContent();
      conteudo.items.forEach(item => {
        if(!item.str || !item.str.trim()) return;
        const t = item.transform;
        const [x, base] = vista.convertToViewportPoint(t[4], t[5]);
        const tamanho = Math.hypot(t[2], t[3]);
        const estilo = conteudo.styles[item.fontName] || {};
        const desce = typeof estilo.descent === 'number' ? estilo.descent : 0;
        const top = base - tamanho * (1 + desce);
        const n = item.str.length;
        for(const m of item.str.matchAll(/\S+/g)){
          palavras.push({ pagina: p - 1, top, x: x + (item.width || 0) * (m.index / n), texto: m[0] });
        }
      });
    }
  }finally{
    tarefa.destroy();   // libera a memória do PDF
  }
  return { paginas, palavras };
}
