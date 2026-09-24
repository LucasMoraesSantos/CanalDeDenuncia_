# Ouvidoria Ética

Página inicial de visualização para um canal de denúncias confidencial.

## Executar localmente

Abra `index.html` no navegador ou inicie um servidor estático:

```bash
python3 -m http.server 8000
```

Depois, acesse `http://localhost:8000`.

## Publicar no Netlify

O projeto inclui um `netlify.toml` com a configuração de publicação. Ao conectar
este repositório ao Netlify, use a raiz do repositório como diretório base. O
comando `npm run build` gera os arquivos estáticos em `dist`, que é o diretório de
publicação configurado.

Para visualizar a versão publicada, confirme no painel do Netlify que a branch de
produção contém os arquivos `index.html`, `styles.css` e `script.js`. Depois,
acesse o endereço exibido em **Site overview > Production deploys**.

Se o Netlify exibir **Page not found**, confirme em **Build settings**:

```text
Build command: npm run build
Publish directory: dist
Functions directory: netlify/functions
```

Também confirme que a branch de produção contém este código. Depois, utilize
**Deploys > Trigger deploy > Clear cache and deploy site**.

## Integração com o Google Planilhas

O formulário envia cada denúncia para a aba `Denuncias` da planilha configurada no
projeto. Crie essa aba e adicione, na primeira linha, as colunas nesta ordem:

```text
Protocolo | Data | Pessoa relacionada | Descrição | Evidências
```

Em seguida:

1. No Google Cloud, crie ou selecione um projeto e ative a **Google Sheets API**.
2. Crie uma conta de serviço e gere uma chave JSON.
3. Compartilhe a planilha com o `client_email` da conta de serviço como **Editor**.
4. No Netlify, cadastre as variáveis de ambiente abaixo:
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL`: valor de `client_email` da chave JSON;
   - `GOOGLE_PRIVATE_KEY`: valor completo de `private_key`, começando em
     `-----BEGIN PRIVATE KEY-----` e terminando em `-----END PRIVATE KEY-----`;
   - `GOOGLE_SHEET_NAME`: nome da aba (opcional; o padrão é `Denuncias`).
5. Faça um novo deploy no Netlify para aplicar as variáveis.

Nunca salve a chave JSON ou a chave privada no repositório. Nesta primeira
integração, a planilha recebe os nomes das evidências selecionadas; o conteúdo dos
arquivos ainda precisa de um armazenamento privado, como o Google Drive.

### Erro `DECODER routines::unsupported`

Esse erro indica que `GOOGLE_PRIVATE_KEY` foi colada em formato inválido. Remova
aspas externas e espaços antes de `-----BEGIN PRIVATE KEY-----`. A integração
aceita tanto quebras de linha reais quanto `\n`. Como alternativa, cadastre o JSON
completo da conta de serviço em `GOOGLE_SERVICE_ACCOUNT_JSON`; nesse caso, não é
necessário separar o e-mail e a chave em duas variáveis.

O sistema também corrige automaticamente chaves com quebras de linha duplicadamente
escapadas ou transformadas em espaços pelo painel do provedor. Depois de alterar a
variável, gere um novo deploy para que a Function receba o valor atualizado.

Se `GOOGLE_SHEET_NAME` não estiver definida, a integração procura a aba `Denuncias`
e, se ela não existir, utiliza automaticamente a primeira aba da planilha. Quando
`GOOGLE_SHEET_NAME` estiver definida, seu valor deve ser exatamente igual ao nome
da aba. Erros de permissão, API desativada, planilha ou aba inexistente são exibidos
de forma específica no formulário.

## Painel administrativo

O painel está disponível em `/admin.html`. Cadastre uma senha forte no Netlify com
o nome `ADMIN_PASSWORD`, habilitada para Functions, e faça um novo deploy. O painel
permite consultar denúncias, filtrar por pessoa e período, visualizar evidências e
gerenciar os nomes exibidos no formulário público. Cada denúncia também pode ser
classificada como não aceitável ou aceitável com `-2`/`-3` pontos. O painel mostra
a quantidade de resultados e a soma de pontos negativos conforme os filtros.

Na aba de denúncias, as colunas `F` e `G` são utilizadas respectivamente para
`Status` e `Pontos`; elas são preenchidas automaticamente durante a avaliação.

O botão **Atualizar** do painel busca novamente denúncias, pessoas, avaliações e
pontuações sem precisar recarregar a página inteira com `F5`.

Os novos anexos são armazenados de forma privada no Netlify Blobs. Toda denúncia
deve conter pelo menos uma imagem JPG, PNG ou WEBP; o limite é de cinco imagens de
até 4 MB cada. Registros criados antes desta versão
possuem apenas o nome do arquivo na planilha e, portanto, não têm imagem disponível.
