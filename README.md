# metadati-dadastickers

Dà a ogni sottopagina titolo, descrizione e anteprima di condivisione propri, unendo i fatti della pagina a un enunciato Dadastickers citato alla lettera. Parte solo quando la chiami per nome.

Fa parte della [Prompt Library di CH Labs](https://www.cryptohelvetia.com/ch-labs/prompt-library), dove la pagina di riferimento è [Write share metadata with Dadastickers statements](https://www.cryptohelvetia.com/ch-labs/prompt-library/skills/metadati-dadastickers). Il repo contiene una copia della skill, rigenerata a ogni aggiornamento della libreria.

## Installare

In Claude Code aggiungi una volta il marketplace e installa il plugin.

```
/plugin marketplace add MicheDada21/ch-labs-skills
/plugin install metadati-dadastickers@ch-labs-skills
```

Da shell i comandi sono `claude plugin marketplace add MicheDada21/ch-labs-skills` e `claude plugin install metadati-dadastickers@ch-labs-skills`. Nell'app desktop premi + accanto al campo del prompt, apri Plugins, aggiungi il marketplace `MicheDada21/ch-labs-skills` con Add marketplace e poi il plugin con Add plugin.

Per avere tutte le skill della libreria installa `tutte-le-skill@ch-labs-skills`. Con altri agenti copia la cartella `skills/metadati-dadastickers` tra le skill dell'agente, per esempio in `~/.codex/skills/metadati-dadastickers`.

## Requisiti

Serve [Bun](https://bun.sh). La skill porta con sé la collezione di 13.935 enunciati Dadastickers.

## Licenza

MIT, testo completo in [LICENSE](LICENSE). Fa eccezione la collezione di enunciati Dadastickers in `skills/metadati-dadastickers/data/enunciati.csv`, che resta di Tiziano Boccaccini con tutti i diritti riservati. La skill la cita alla lettera; ripubblicarla, per intero o in buona parte, richiede un permesso scritto.
