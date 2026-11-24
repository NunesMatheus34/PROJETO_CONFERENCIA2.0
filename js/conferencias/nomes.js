/* =====================================================================
   NOME DO FORNECEDOR: AS PALAVRAS QUE DIZEM QUEM ELE É
   Regra de nome da Conferência de Boletos do projeto antigo
   (_referencia/app.js, palavrasDoNome), trazida SEM mudança para ser
   usada por mais de uma conferência (hoje: Relatório contra relatório).
   Dois nomes são do mesmo fornecedor quando têm uma palavra "forte" em
   comum: palavras de 4 letras ou mais, comparadas pelas 5 primeiras,
   fora as que não dizem quem é o fornecedor (LTDA, SA, ME, COMERCIO...).
   Precisa de js/leitura/formatos.js (normaliza).
   ===================================================================== */

// Palavras que não ajudam a dizer quem é o fornecedor. Comparadas pelas 5 primeiras
// letras, então pegam também singular/plural (ALIMENTO/ALIMENTOS, TRANSPORTE/TRANSPORTES).
// As da primeira linha são as da regra original; as outras são genéricas de ramo,
// que apareciam em fornecedores diferentes e faziam casar o nome errado.
const PALAVRAS_IGNORADAS = new Set(['LTDA', 'S/A', 'SA', 'DE', 'DO', 'DA', 'E', 'ME', 'EPP', 'EIRELI', 'IND', 'COM',
  'COMERCIO', 'INDUSTRIA', 'INDUSTRIAL', 'BRASIL', 'PECAS', 'DISTRIBUIDORA', 'LIMITADA', 'SERVICOS', 'AUTO',
  'MAQUINAS', 'EQUIPAMENTOS', 'COMERCIAL', 'PRODUTOS',
  'ALIMENTOS', 'TRANSPORTES', 'TRANSPORTADORA', 'LOGISTICA', 'MOTORES', 'TINTAS', 'TECIDOS', 'QUIMICA',
  'METAIS', 'METALURGICA', 'EMBALAGENS', 'FERRAGENS', 'FERRAMENTAS', 'MATERIAIS', 'CONSTRUCAO', 'CONSTRUTORA',
  'ENGENHARIA', 'TECNOLOGIA', 'SOLUCOES', 'SISTEMAS', 'ATACADO', 'ATACADISTA', 'IMPORTADORA', 'EXPORTADORA',
  'IMPORTACAO', 'EXPORTACAO', 'NACIONAL', 'GRUPO', 'EMPRESA', 'EMPREENDIMENTOS', 'PARTICIPACOES',
  'REPRESENTACOES', 'ELETRICA', 'ELETRICOS', 'HIDRAULICA', 'AGRICOLA', 'AGROPECUARIA', 'VEICULOS',
  'ROLAMENTOS', 'PNEUS', 'COMBUSTIVEIS', 'INSUMOS', 'SUPRIMENTOS', 'MINERACAO', 'CENTRO', 'MINAS', 'GERAIS',
  'FORNECEDOR', 'FILIAL', 'MATRIZ', 'UNIDADE', 'BANCO', 'FOMENTO', 'MERCANTIL', 'SECURITIZADORA']
  .map(p => p.slice(0, 5)));

// As 5 primeiras letras de cada palavra relevante do nome (4 letras ou mais, fora as
// ignoradas e, se vier, as "genéricas" da conferência). Devolve um Set.
function palavrasDoNome(nome, genericas){
  const out = new Set();
  for(const p of normaliza(nome).match(/[A-Z]+/g) || []){
    const ini = p.slice(0, 5);
    if(p.length >= 4 && !PALAVRAS_IGNORADAS.has(ini) && !(genericas && genericas.has(ini))) out.add(ini);
  }
  return out;
}

// true quando os dois conjuntos de palavras (de palavrasDoNome) têm alguma em comum.
function temPalavraEmComum(a, b){
  for(const p of a) if(b.has(p)) return true;
  return false;
}
