# Syntax Highlighting (No Fallback)

`open-ide` usa Tree-sitter em modo estrito:

- cada extensão resolve para um único `filetype`;
- se o parser desse `filetype` não existir, não aplica highlight;
- não há tokenizador regex de fallback.

## Parsers Padrão (OpenTUI)

- `javascript`
- `typescript`
- `markdown`
- `zig`

## Adicionar Linguagens Extras

Crie o arquivo `.open-ide/parsers.json` na raiz do workspace (ou use `OPEN_IDE_PARSERS_FILE`).
Ao trocar de projeto no `Open Project`, o editor recarrega automaticamente o manifesto do novo workspace.
Este repositório já inclui um manifesto base em `.open-ide/parsers.json` com Rust, Go e Python.
As queries de highlight dessas linguagens estão versionadas localmente em `.open-ide/parsers/*/highlights.scm`.

Exemplo:

```json
{
  "parsers": [
    {
      "filetype": "python",
      "extensions": [".py"],
      "wasm": "./parsers/python/tree-sitter-python.wasm",
      "queries": {
        "highlights": ["./parsers/python/highlights.scm"]
      }
    },
    {
      "filetype": "go",
      "extensions": [".go"],
      "wasm": "./parsers/go/tree-sitter-go.wasm",
      "queries": {
        "highlights": ["./parsers/go/highlights.scm"]
      }
    },
    {
      "filetype": "rust",
      "extensions": [".rs"],
      "wasm": "./parsers/rust/tree-sitter-rust.wasm",
      "queries": {
        "highlights": ["./parsers/rust/highlights.scm"]
      }
    }
  ]
}
```

Observações:

- caminhos relativos são resolvidos a partir da pasta do manifesto;
- `queries.highlights` é obrigatório;
- `queries.injections` e `injectionMapping` são opcionais.
- para URLs remotas, o download ocorre no primeiro uso do parser (cache em `.opentui-data/`).
