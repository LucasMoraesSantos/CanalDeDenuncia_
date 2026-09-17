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
   - `GOOGLE_PRIVATE_KEY`: valor de `private_key` da chave JSON;
   - `GOOGLE_SHEET_NAME`: nome da aba (opcional; o padrão é `Denuncias`).
5. Faça um novo deploy no Netlify para aplicar as variáveis.

Nunca salve a chave JSON ou a chave privada no repositório. Nesta primeira
integração, a planilha recebe os nomes das evidências selecionadas; o conteúdo dos
arquivos ainda precisa de um armazenamento privado, como o Google Drive.
