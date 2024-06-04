
// Bibliotecas AWS
//
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

// Express e middlewares
const bodyParser = require('body-parser');
const express = require('express');

const awsServerlessExpressMiddleware = require('aws-serverless-express/middleware');

// Clientes do DynamoDB
//
const ddbClient = new DynamoDBClient({ region: process.env.TABLE_REGION });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

// Nome da tabela utilizada, criado com o Amplify para suportar ambientes diferentes.
//
let tableName = "stxPessoas";

// Atualiza o nome da tabela se houver ambiente (o padrão é 'dev')
//
if (process.env.ENV && process.env.ENV !== "NONE") {
  tableName = tableName + '-' + process.env.ENV;
}

// Máximo de itens que vamos deixar incluir na tabela do DynamoDB
//
const CONST_MAX_ITENS_NA_TABELA = 10;

// Máximo tamanho de strings nas propriedades que são string (a validação trunca os valores)
const CONST_MAX_TAMANHO_STRING = 200;

// Caminho raiz desse 'controller' de pessoas.
//
const caminhoRaiz = "/pessoas";

// Nome do campo configurado na tabela como chave (partition key)
// Nessa tabela não foi criado nada de sort key para deixar as coisas mais simples.
//
const campoId = 'id';
const caminhoId = '/:' + campoId;

// Lista de propriedades que vamos permitir que os objetos tenham;
// se isso não for feito, os POSTs podem incluir quaisquer propriedades 
// no DynamoDB e não queremos que isso aconteça.
//
const propriedadesPermitidas = [
  { nome: 'id' },
  { nome: 'nome'},
  { nome: 'dataNascimento', tipo: 'data' },
  { nome: 'dataContratacao', tipo: 'data' },
  { nome: 'corFavorita' }
];

// Cria o Express
//
const app = express();

// Middlewares de parse de json do body e também de integração com API Gateway/Lambda
//
app.use(bodyParser.json());
app.use(awsServerlessExpressMiddleware.eventContext());

// Habilita CORS para todos métodos
//
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*")
  res.header("Access-Control-Allow-Headers", "*")
  next()
});

// Função que valida um objeto enviado para que não deixe 
// objetos com quaisquer propriedades serem incluídos no 
// DynamoDB; também verifica tipagem das datas e trunca strings.
//
const validarEntrada = (objetoDeEntrada) => {

  console.log('Validando objeto de entrada:', objetoDeEntrada);

  // objeto de retorno, a princípio vazio
  let resultado = {};

  propriedadesPermitidas.forEach((propriedade) => {

    // loop somente das propriedades permitidas...
    
    let prop = propriedade.nome;
    let tipo = propriedade.tipo;

    if (objetoDeEntrada[prop]) {

      // se a propriedade existia no objeto de entrada...

      if (tipo == 'data') {

        // para tipo data, tentamos fazer o parse e falhamos silenciosamente se não der.

        let valorData = Date.parse(objetoDeEntrada[prop]);

        if (!isNaN(valorData))
          resultado[prop] = valorData;  // guardando como valor numérico propositalmente para ficar assim no DynamoDB

      } else {

        // propriedades texto, converte pra string com interpolação (caso venha como número ou boolean)
        // e trunca para não encher o DynamoDB.
        //
        resultado[prop] = `${ objetoDeEntrada[prop] }`.substring(0, CONST_MAX_TAMANHO_STRING);
      }
    }
  });

  if (!resultado[campoId]) {

    // objeto sem ID consideramos como insert; 
    // criamos um id baseado na data para ficar relativamente ordenado.

    let hoje = new Date();

    // transforma "2024-06-04T08:52:22.060Z"
    // em "2024_06_04_08_52_22"
    resultado[campoId] = hoje.toISOString().substring(0, 19).replaceAll('-', '_').replaceAll(':', '_').replace('T', '_');

    // em casos de aplicativos com expectativa de muitos acessos simultâneos,
    // e para diminuir a possibilidade de se "adivinhar" IDs via parâmetros já que o ID tem um formato,
    // é interessante adicionar um valor aleatório a mais (tamanho controlado pelo segundo parâmetro da substring abaixo)
    //
    // aqui valor 5 adiciona 3 números aleatórios no final; precisamos começar do 2 para remover '0.' da frente.
    //
    resultado[campoId] += '_' + `${ Math.random() }`.substring(2, 5);  

    // marca para verificação posterior (a função de POST precisa disso para realizar mais validações)
    resultado['itemNovo'] = true;
  }

  console.log('Resultado da validação:', resultado);

  return resultado;
}

// Função de buscar um item por id, para /pessoas/:id e também 
// verificação se o item existe ao deletar, para retornar 404 se não existir.
//
const buscarPessoaPorId = async(id) => {

  let getParams = { TableName: tableName, Key: { } }

  getParams.Key[campoId] = id;

  const dados = await ddbDocClient.send(new GetCommand(getParams));

  // retorna null fixo se não houver (previne undefined)
  return dados.Item ? dados.Item : null;
}

// Função de buscar todas as pessoas, utilizada em GET /pessoas 
// e para contagem do limite de POSTs.
//
const buscarPessoas = async() => {

  var params = {
    TableName: tableName,
    Select: 'ALL_ATTRIBUTES',
  };

  const dados = await ddbDocClient.send(new ScanCommand(params));

  return dados.Items;
}

/***************************************************
* Método GET de todos os objetos, caminho /pessoas *
****************************************************/

app.get(caminhoRaiz, async function(req, res) {

  try {

    const dados = await buscarPessoas();

    res.json(dados);

  } catch (err) {

    res.statusCode = 500;
    res.json({ erro: err.message });
  }
});

/***************************************************
 * Método GET de um objeto, caminho /pessoas/:id   *
 ***************************************************/

app.get(caminhoRaiz + caminhoId, async function(req, res) {

  try {

    const dados = await buscarPessoaPorId(req.params[campoId]);

    if (dados) {

      res.json(dados);

    } else {

      res.statusCode = 404;
      res.json({erro: `Item com ID [${ req.params[campoId] }] não encontrado.`});
    }

  } catch (err) {

    res.statusCode = 500;
    res.json({ erro: err.message });
  }
});


/**************************************
* Método POST, caminho '/pessoas'     *
***************************************/

app.post(caminhoRaiz, async function(req, res) {
  
  let itemEntrada = validarEntrada(req.body);

  // Busca a lista de todas as pessoas para validar os limites 
  // ou retornar 404 quando for uma atualização com id inválido.
  //
  // Isso não é um bom método para tabelas grandes, estou fazendo dessa forma
  // porque a tabela é muito pequena, e como a API vai ficar exposta não quero
  // deixar aberta a possibilidade dessa tabela ser expandida sem limites.
  //
  const dadosNaTabela = await buscarPessoas();

  // a flag itemNovo é incluida no objeto na função validarEntrada, 
  // quando ela gera o id em um objeto enviado sem propriedade 'id'.
  if (itemEntrada.itemNovo) {

    // valida se estamos no limite 
    // (o uso de '>=' é só por precaução, poderia ser == mas dessa maneira 
    // previnimos o caso de alguém incluir itens manualmente de outras formas 
    // e passar a contagem da tabela de 10)
    if (dadosNaTabela.length >= CONST_MAX_ITENS_NA_TABELA) {

      res.statusCode = 500;

      // retornando o array de ids disponíveis com nomes das pessoas só para facilitar,
      // em produção seria melhor não fazer isso.
      res.json({ 
        erro: 'Limite de 10 itens para incluir na tabela, exclua um item antes de adicionar um novo', 
        url: req.url,
        idsDisponiveis: dadosNaTabela.map(item => `${ item.id }: ${ item.nome || '(sem nome)' }`)
      });

      return;
    }

  } else {

    // se foi passado um id porém o objeto não existe na lista, 
    // vamos retornar 404 ao invés de deixar o cliente incluir itens
    // com ids arbitrários
    //
    if (!dadosNaTabela.find(item => item.id == itemEntrada.id)) {
        
      res.statusCode = 404;

      res.json({erro: `Item com ID [${ req.params[campoId] }] não encontrado para atualizar; para incluir um novo objeto envie um json sem a propriedade 'id'.`});

      return;
    }
  }

  // passadas as validações, podemos prosseguir.

  // removemos a propriedade 'itemNovo' do objeto para não salvar no banco;
  delete itemEntrada['itemNovo'];

  let putParams = { TableName: tableName, Item: itemEntrada };

  try {

    // put no Dynamo
    let obj = await ddbDocClient.send(new PutCommand(putParams));

    // retorno ok
    res.json({ 
      mensagem: 'Objeto salvado com sucesso.', 
      id: putParams.Item[campoId],
      url: req.url, 
      detalhesAws: obj 
    });

  } catch (err) {

    res.statusCode = 500;
    res.json({ erro: err, url: req.url, body: req.body });
  }
});

/*****************************************
* Método DELETE, caminho '/pessoas/:id'  *
******************************************/

app.delete(caminhoRaiz + caminhoId, async function(req, res) {

  const id = req.params[campoId];

  // Verifica se a pessoa existe no banco antes de deletar;
  // aqui poderia ser colocada uma camada de permissões, se não forem utilizadas
  // permissões nativas do IAM no DynamoDB
  //
  const temObjeto = await buscarPessoaPorId(id);

  if (temObjeto) {

    let delParams = { TableName: tableName, Key: { } }
  
    delParams.Key[campoId] = id;

    try {
  
      let obj = await ddbDocClient.send(new DeleteCommand(delParams));
  
      res.json({
        mensagem: 'Item excluído com sucesso.',
        url: req.url, 
        detalhesAws: obj
      });
  
    } catch (err) {
  
      res.statusCode = 500;
      res.json({erro: err, url: req.url});
    }

  } else {

    res.statusCode = 404;
    res.json({erro: `Item com ID [${ id }] não encontrado para excluir.`});
  }

});

// Inicia o Express para funcionar com API Gateway e em formato local com Amplify
app.listen(3000, function() {
  console.log('Servidor iniciado.');
});

// Exporta o objeto 'app' para itegração com AWS Lambda
module.exports = app
