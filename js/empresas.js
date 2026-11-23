/* =====================================================================
   EMPRESAS
   As 4 empresas que usam o site e como reconhecer cada uma pelo relatório
   do sistema. Serve para avisar quando o relatório é de outra empresa
   (no projeto antigo qualquer relatório era aceito).
   A 1ª linha do relatório vem em dois formatos:
     - tudo em A1, como texto: "5 CRV INDUSTRIAL LTDA   Empresa(s): 1 / 5 /   Data/Hora : ..."
     - número em A1 e nome em B1: A1 = 5, B1 = "CRV INDUSTRIAL LTDA".
   CRV ou Rubi pelo nome; matriz ou filial pelo número do começo da linha.
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
