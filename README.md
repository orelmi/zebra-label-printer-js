# zebra-label-printer-js

Manager **WinCC OA (JavaScript / Node.js)** qui lit ses données depuis des
*datapoints* via `dpConnect` et imprime des étiquettes **Zebra au format ZPL**.

Deux modes d'envoi sont disponibles :

| Mode | Transport | Paquet utilisé |
|------|-----------|----------------|
| `tcp` | Envoi **direct TCP/IP** sur le port raw 9100 | module natif Node `net` (aucune dépendance) |
| `spooler` | Envoi via le **spooler Windows** (impression RAW) | [`@thiagoelg/node-printer`](https://www.npmjs.com/package/@thiagoelg/node-printer) (optionnel) |

Le **mapping entre les DPE et les champs** de l'étiquette est décrit dans un
document **JSON stocké dans un DPE de configuration**. Il peut être modifié à
chaud : le manager surveille ce DPE et recharge le mapping sans redémarrage.

---

## Architecture

```
index.js                       Point d'entrée (manager WinCC OA)
scripts/save-mapping.js        Outil : pousse un fichier JSON dans le DPE de config
examples/mapping.example.json  Exemple de document de mapping
examples/mapping.rfid.example.json  Exemple avec encodage RFID (champ réutilisé)
examples/labels/               Gabarits ZPL prêts à l'emploi (texte, code-barres, QR, RFID, expédition)
src/
  config.js                    Résolution du nom du DPE de config (-configDpe / env / défaut)
  logger.js                    Façade de log (WinccoaManager.logXxx ou console)
  winccoa/WinccoaClient.js     Encapsulation de winccoa-manager (dpGet/dpSet/dpConnect…)
  mapping/MappingStore.js      Lecture/écriture + validation du JSON dans le DPE
  mapping/DataMapper.js        Valeurs DPE -> valeurs de champs (defaults + transforms)
  printer/ZplTemplate.js       Rendu du gabarit ZPL ({{placeholder}})
  printer/TcpPrinter.js        Envoi direct TCP/IP (port 9100)
  printer/SpoolerPrinter.js    Envoi via spooler Windows (RAW)
  printer/PrinterFactory.js    Choix du printer selon printMode
  ZebraLabelManager.js         Orchestrateur (connexions, cache, déclenchement, impression)
test/                          Tests unitaires + intégration (node --test)
```

Flux d'exécution :

1. Chargement du mapping JSON depuis le **DPE de config**.
2. `dpConnect` sur tous les **DPE de champs** (+ le DPE de **déclenchement** éventuel).
3. Mise en cache des dernières valeurs reçues.
4. Au déclenchement : `DataMapper` → `ZplTemplate.render` → envoi au printer.
5. Surveillance du DPE de config pour un **rechargement à chaud** du mapping.

---

## Prérequis et installation

- **Node.js ≥ 18** (fourni par WinCC OA 3.20+ pour le manager JavaScript).
- Le paquet **`winccoa-manager`** n'est **pas** publié sur le registre npm public.
  Il est livré avec l'installation WinCC OA et s'installe depuis un chemin local :

  ```bash
  # Linux
  npm install file:/opt/WinCC_OA/3.21/javascript/winccoa-manager
  # Windows
  npm install file:C:/Siemens/Automation/WinCC_OA/3.21/javascript/winccoa-manager
  ```

  Il est chargé en *lazy require* : le code se charge même sur une machine sans
  WinCC OA (utile en CI / pour les tests).

- Pour le **mode spooler uniquement**, installer la dépendance native optionnelle :

  ```bash
  npm install @thiagoelg/node-printer
  ```

  C'est un module natif (node-gyp) ; il est déclaré dans `optionalDependencies`
  pour ne pas faire échouer l'installation sur les machines sans outils de
  compilation. Il est lui aussi chargé en *lazy require*, seulement quand le mode
  `spooler` est utilisé. Le **mode `tcp` ne nécessite aucune dépendance**.

```bash
npm install
```

---

## Configuration (le DPE de mapping)

Le manager a besoin d'**un seul DPE de type chaîne** (`string`) qui contient le
document JSON de configuration. Son nom est résolu, par ordre de priorité :

1. argument de ligne de commande `-configDpe <nom>` (ou `--config-dpe <nom>`),
2. variable d'environnement `ZEBRA_CONFIG_DPE`,
3. valeur par défaut `_ZebraLabelPrinter.config.mapping`.

### Schéma du document JSON

```jsonc
{
  "printMode": "tcp",                 // "tcp" | "spooler"  (obligatoire)
  "encoding": "latin1",               // encodage des octets envoyés (défaut latin1)
  "sanitizeValues": true,             // retire ^ et ~ des VALEURS (anti-injection ZPL)

  "tcp":     { "host": "192.168.1.50", "port": 9100, "timeoutMs": 5000 },
  "spooler": { "printerName": "ZDesigner GK420t" },

  "trigger": {                        // optionnel
    "dpe": "System1:Label.cmd.print", // DPE qui déclenche une impression
    "mode": "onTrue",                 // "onTrue" | "onChange" | "any"
    "resetAfterPrint": true           // remet le DPE à false après impression
  },

  "status": { "dpe": "System1:Label.status" },  // optionnel : statut écrit ici

  "template": "^XA ... {{champ}} ... ^XZ",       // gabarit ZPL (obligatoire)

  "fields": [                          // mapping DPE -> champ (obligatoire)
    { "name": "product", "dpe": "System1:Label.product", "default": "N/A", "transform": "trim" },
    { "name": "qty",     "dpe": "System1:Label.quantity", "default": "1",  "transform": "int" }
  ]
}
```

- **`fields[].name`** est le nom du *placeholder* `{{name}}` utilisé dans le gabarit.
  Un même champ peut apparaître **plusieurs fois** dans le gabarit : toutes les
  occurrences sont substituées. C'est utile pour, par ex., **imprimer** une donnée
  *et* l'**encoder dans un tag RFID** (`^RFW`) à partir d'une seule valeur source —
  voir `examples/labels/04-rfid-encode.zpl` et `examples/mapping.rfid.example.json`.
- **`fields[].dpe`** est le DPE source dont la valeur alimente le champ.
- **`fields[].default`** est utilisé si la valeur du DPE est vide/absente.
- **`fields[].transform`** (optionnel) : `"trim"`, `"upper"`, `"lower"`, `"int"`,
  ou un objet : `{ "type": "fixed", "decimals": 2 }`,
  `{ "type": "padStart", "length": 6, "pad": "0" }`,
  `{ "type": "slice", "start": 0, "end": 20 }`,
  `{ "type": "date", "format": "date" | "time" | "iso" }`.

### Déclenchement de l'impression

- **Avec `trigger.dpe`** : l'impression a lieu quand ce DPE se déclenche selon
  `mode` (`onTrue` = passage à vrai, `onChange` = changement de valeur,
  `any` = toute notification). Les valeurs des champs prises en compte sont les
  dernières reçues dans le cache.
- **Sans `trigger`** : impression automatique à chaque changement d'un DPE de
  champ (regroupée/débattue via `ZEBRA_DEBOUNCE_MS`, défaut 250 ms).

> ⚠️ Le **gabarit** est écrit par l'intégrateur et contient du vrai ZPL ; il
> n'est jamais filtré. En revanche, les **valeurs** injectées sont nettoyées par
> défaut (suppression de `^` et `~`) pour éviter de casser l'étiquette ou une
> injection ZPL depuis les données. Mettre `"sanitizeValues": false` pour
> désactiver ce comportement.

---

## Utilisation

### Démarrer le manager

Déclarez `index.js` comme **manager JavaScript** dans la console WinCC OA
(ou lancez-le manuellement) :

```bash
node index.js -configDpe System1:ZebraCfg.mapping
# ou
ZEBRA_CONFIG_DPE=System1:ZebraCfg.mapping node index.js
```

### Charger un mapping dans le DPE de config

Créez d'abord le DPE de config (type `string`), puis :

```bash
node scripts/save-mapping.js examples/mapping.example.json -configDpe System1:ZebraCfg.mapping
```

Le fichier est **validé avant écriture** : un document invalide n'est jamais
enregistré dans le DPE.

---

## Tests

```bash
npm test     # node --test
```

Les tests couvrent le mapping/transforms, le rendu ZPL, la validation, la
fabrique de printer, l'envoi RAW spooler (module injecté) et le scénario complet
de l'orchestrateur (déclenchement, débounce, rechargement à chaud) avec un
WinCC OA simulé — sans matériel ni installation WinCC OA.

---

## Licence

MIT
