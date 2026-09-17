# Ouvidoria Ética

Página inicial de visualização para um canal de denúncias confidencial.

## Executar localmente

Abra `index.html` no navegador ou inicie um servidor estático:

```bash
python3 -m http.server 8000
```

Depois, acesse `http://localhost:8000`.

## Publicar no Netlify

O projeto inclui um `netlify.toml` e não exige comando de build. Ao conectar este
repositório ao Netlify, use a raiz do repositório como diretório base e deixe o
campo **Build command** vazio. O diretório de publicação já está definido como `.`.

Para visualizar a versão publicada, confirme no painel do Netlify que a branch de
produção contém os arquivos `index.html`, `styles.css` e `script.js`. Depois,
acesse o endereço exibido em **Site overview > Production deploys**.
