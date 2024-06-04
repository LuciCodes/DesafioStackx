# DesafioStackx
Desafio de código para consultoria Stackx

# Feito com Amplify CLI (Gen1)

A ferramenta escolhida para desenvolver a solução rapidamente foi o Amplify da AWS (Gen1).

Com a linha de comando do Amplify podemos iniciar um projeto rapidamente, adicionar recursos que serão criados e atualizados usando CloudFormation, e desenvolver em ambientes diferentes entre desenvolvimento e produção.

Mais detalhes em [sobre o cli Amplify aqui](https://docs.amplify.aws/cli).

Recursos úteis:
- Documentação Amplify: https://docs.amplify.aws.
- Documentação do Amplify CLI: https://docs.amplify.aws/cli.

# Detalhes Técnicos

## 1. Banco de dados e modelagem:

  - Criada uma tabela stxPessoas no DynamoDB usando o comando "amplify add storage".

  - Essa tabela tem somente um campo de identificação (partition key) "id" de tipo string.

  - O objeto "pessoa" que a tabela espera está restrito a ter as seguintes propriedades:
    - id (string)
    - nome (string)
    - corFavorita (string)
    - dataNascimento (DateTime)
    - dataContratacao (DateTime)

  - Essas propriedades são reforçadas pela função Lambda, para que tenham dados válidos e que POSTs não incluam propriedades a mais.

  - A função Lambda limita no máximo 10 registros na tabela porque a API vai ficar exposta e não desejamos que alguma entidade possa encher a tabela e acarretar custos.

  - **Todo o código realizado para esse desafio está no arquivo /backend/function/stxApiPessoasLambda/src/app.js**

## 2. Endpoint no API Gateway:

  - Criados endpoints stxApiPessoas no API Gateway usando o comando "amplify add api".

  - Nos chamados GET ou DELETE que passam um id, se não houver o item com id informado o retorno será 404.

  - No chamado de POST se for informado um id no objeto json do corpo da mensagem será feita a atualização se o objeto existir, ou retornará 404 se não existir.

  - No chamado de POST sem id no objeto json do corpo da mensagem será incluso um novo item no banco de dados a não ser que a tabela já tenha 10 itens ou mais, nesse caso será retornado erro 500 e uma mensagem explicativa.

## 3. Função Lambda:

  - Criada uma função stxApiPessoasLambda durante a configuracão ao criar a API.

  - Utiliza o servidor node "Express" para integração com API Gateway conforme o Amplify gera.

  - Por simplicidade, **todo o código está somente em um arquivo (novamente: /backend/function/stxApiPessoasLambda/src/app.js)**.

## 4. Outros Detalhes

  - Estrutura do projeto criada a partir do padrão do AWS Amplify.

  - Nenhum tipo de proteção de permissões feito de propósito.

  - Quantidade máxima de itens na tabela do DynamoDB e tamanho máximo das propriedades string colocados como constantes no código mas idealmente deveriam ser configurações no Parameter Store.

# Consumindo a API

A API está aberta e publicada no seguinte endereço:

https://h59t6eg9qf.execute-api.sa-east-1.amazonaws.com/dev

Com os endpoints:

  - GET /pessoas => busca todas as pessoas no banco
  - GET /pessoas/:id => busca a pessoa com id de valor ":id"
  - POST /pessoas => cria uma pessoa se o corpo enviado não tem a propriedade "id" ou atualiza se tiver.
  - DELETE /pessoas/:id => exclui a pessoa com id de valor ":id"

GET da lista com todos os itens:

> curl https://h59t6eg9qf.execute-api.sa-east-1.amazonaws.com/dev/pessoas
>
> Content: 
> 
> [{"id":"2024_06_04_11_20_45_727","nome":"luciana"},{"id":"2024_06_04_09_44_44_350","dataNascimento":392034300000,"nome":"luciano leal"}]

GET de um item:

> curl https://h59t6eg9qf.execute-api.sa-east-1.amazonaws.com/dev/pessoas/2024_06_04_09_44_44_350
>
> Content: 
> 
> {"id":"2024_06_04_09_44_44_350","dataNascimento":392034300000,"nome":"luciano leal"}

POST de um item novo:

> curl -H "Content-Type: Application/json" -X POST -d "{ \"nome\": \"Viviane\" }" https://h59t6eg9qf.execute-api.sa-east-1.amazonaws.com/dev/pessoas
>
> Content: 
> 
> {"mensagem":"Objeto salvado com sucesso.","id":"2024_06_04_15_18_52_911","url":"/pessoas","detalhesAws":{"$metadata":{"httpStatusCode":200,"requestId":"8EHASI16SGOR6RP257K6E1LMB3VV4KQNSO5AEMVJF66Q9ASUAAJG","attempts":1,"totalRetryDelay":0}}}

POST de atualização de um item:

> curl -H "Content-Type: Application/json" -X POST -d "{ \"nome\": \"Viviane Fernandes\", \"id\": \"2024_06_04_15_18_52_911\" }" https://h59t6eg9qf.execute-api.sa-east-1.amazonaws.com/dev/pessoas
>
> Content: 
> 
> {"mensagem":"Objeto salvado com sucesso.","id":"2024_06_04_15_18_52_911","url":"/pessoas","detalhesAws":{"$metadata":{"httpStatusCode":200,"requestId":"MHHV4P2JL3O9V99VH9MJ9VNG9VVV4KQNSO5AEMVJF66Q9ASUAAJG","attempts":1,"totalRetryDelay":0}}}

# Criando o Projeto

Para reproduzir o projeto em máquina local, deve-se utilizar o AWS Amplify.

Confirgurar o [AWS cli](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-configure.html) e o [Amplify cli](https://docs.amplify.aws/gen1/react/start/getting-started/installation/) conforme instruções da Amazon, depois:

- Criar uma pasta para o projeto

- Executar o comando "amplify init"

- Executar o comando "amplify add storage" e utilizar as opcões:

  - Friendly name> stxPessoas
  - Table name> stxPessoas
  - Column name> id
  - Data type> string
  - Add another column?> n
  - Add sort key?> n
  - Add global secondary indexes?> n
  - Add Lambda trigger?> n

- Executar o comando "amplify add api" e utilizar as opcões:

    - Service> REST
    - Friendly name> stxApiPessoas
    - Path> /pessoas
    - AWS Lambda Funcion name> stxApiPessoasLambda
    - Funcion template> CRUD function for DynamoDB
    - Data Source option> Use table already configured
    - Choose table> stxPessoas
    - Advanced settings?> n
    - Edit the local funcion now?> n
    - Restrict API Access? n

- Isso irá criar toda a estrutura do projeto. Entrar na pasta:

  ./amplify/backend/function/stxApiPessoasLambda/src/

- Substituir o arquivo app.js pelo arquivo deste projeto, que se encontra em:

https://github.com/LuciCodes/DesafioStackx/blob/master/amplify/backend/function/stxApiPessoasLambda/src/app.js

- Executar o comando "amplify push"

Isso deve provisionar o DynamoDB, a função Lambda e o API Gateway.

Após terminada essa publicação, entrar no seu console da AWS, ir até o API gateway, e publicar o stage "dev" da API para que seus endpoints tornem-se públicos. A integração com a função Lambda já estará configurada.





