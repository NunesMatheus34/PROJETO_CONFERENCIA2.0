/* =====================================================================
   EMPRESAS
   As 4 empresas que usam o site e como reconhecer cada uma pelo relatório
   do sistema. Serve para avisar quando o relatório é de outra empresa
   (no projeto antigo qualquer relatório era aceito).
   A 1ª linha do relatório vem em dois formatos:
     - tudo em A1, como texto: "5 CRV INDUSTRIAL LTDA   Empresa(s): 1 / 5 /   Data/Hora : ..."
     - número em A1 e nome em B1: A1 = 5, B1 = "CRV INDUSTRIAL LTDA".
   CRV ou Rubi pelo nome; matriz ou filial pelo número do começo da linha.
   Na Rubi, o campo "Empresa(s): 1 / 4 /" com outra empresa além da escolhida
   indica relatório consolidado (alertaRelatorioConsolidado): não confere.
   Precisa de js/leitura/formatos.js (normaliza).
   ===================================================================== */

// Tabela das empresas. numero = o número que o sistema põe no começo da 1ª linha (A1);
// nomeNaLinha = como o nome aparece na 1ª linha, já normalizado (maiúsculo, sem acento).
const EMPRESAS = [
  { id:'crv-matriz',  nome:'CRV Matriz',  grupo:'CRV',  numero:'1', nomeNaLinha:'CRV INDUSTRIAL LTDA',
    cnpj:'03.937.452/0001-92', bancos:['Santander', 'Itaú'] },
  { id:'crv-filial',  nome:'CRV Filial',  grupo:'CRV',  numero:'5', nomeNaLinha:'CRV INDUSTRIAL LTDA',
    cnpj:'03.937.452/0004-35', bancos:['Santander', 'Itaú'] },
  { id:'rubi-matriz', nome:'Rubi Matriz', grupo:'RUBI', numero:'1', nomeNaLinha:'RUBIATABA INDUSTRIAL S A',
    cnpj:'03.347.747/0001-09', bancos:['Santander', 'Bradesco'] },
  { id:'rubi-filial', nome:'Rubi Filial', grupo:'RUBI', numero:'4', nomeNaLinha:'RUBIATABA',
    cnpj:'03.347.747/0003-70', bancos:['Santander', 'Bradesco'] },
];

// Lê a 1ª linha de um relatório do sistema (matriz = lista de linhas, como em
// lerMatrizComTexto) e devolve a empresa da tabela EMPRESAS, ou null se não reconhecer.
// Junta as células da 1ª linha num texto só, para os dois formatos darem o mesmo:
// "<número> <nome> ...". O número tem que ser o PRIMEIRO da linha (o "Empresa(s): 1 / 5"
// do meio não conta). Nome e número têm que fechar com a mesma empresa; senão, null.
function identificaEmpresa(matriz){
  const primeira = (matriz && matriz[0]) || [];
  const texto = normaliza(primeira.filter(c => c !== null && c !== undefined && c !== '').map(String).join(' '))
                  .replace(/\s+/g, ' ');
  const partes = texto.match(/^(\d+) (.+)$/);
  if(!partes) return null;
  const [, numero, resto] = partes;
  return EMPRESAS.find(e => e.numero === numero && resto.startsWith(e.nomeNaLinha)) || null;
}

// Números do campo "Empresa(s): 1 / 4 /" da 1ª linha do relatório, na ordem (ex.: ['1', '4']).
// Lista vazia quando a linha não tem esse campo (ex.: relatório com o número em A1 e o nome em B1).
function empresasDoRelatorio(matriz){
  const primeira = (matriz && matriz[0]) || [];
  const texto = primeira.filter(c => c !== null && c !== undefined && c !== '').map(String).join(' ');
  const campo = texto.match(/Empresa\(s\)\s*:\s*((?:\d+\s*\/?\s*)+)/i);
  return campo ? campo[1].match(/\d+/g) : [];
}

// Relatório "consolidado" da Rubi: tirado no sistema com mais de uma empresa
// ("Empresa(s): 1 / 4 /"), as linhas das duas empresas vêm misturadas e a conferência
// sairia errada. Se a lista tiver mais de uma empresa e alguma além da escolhida, devolve o texto do
// alerta (e a conferência não roda); senão ''. Vale SÓ para a Rubi: nos relatórios da
// CRV o campo diz "1 / 5" mesmo quando a empresa foi tirada separada, então lá não é usado.
// empresa = a escolhida (da tabela EMPRESAS); só olha relatório cuja 1ª linha é da Rubi.
function alertaRelatorioConsolidado(empresa, matriz){
  if(!empresa || empresa.grupo !== 'RUBI') return '';
  const primeira = (matriz && matriz[0]) || [];
  const texto = normaliza(primeira.filter(c => c !== null && c !== undefined && c !== '').map(String).join(' ')).replace(/\s+/g, ' ');
  if(!/^\d+ RUBIATABA/.test(texto)) return '';
  const lista = empresasDoRelatorio(matriz);
  // só uma empresa na lista: não é consolidado (se for a outra, o alerta é o de "outra empresa")
  if(lista.length < 2 || !lista.some(n => n !== empresa.numero)) return '';
  return `Este relatório tem mais de uma empresa (${lista.join(' / ')}). Tire no sistema só a empresa ${empresa.nome} e envie de novo.`;
}
