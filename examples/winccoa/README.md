# Provisionnement WinCC OA (DPType + DP de configuration)

Le manager **ne crée aucune structure** : il lit/écrit uniquement des DP existants.
Avant de démarrer, il faut donc créer le **DPType interne** et le **DP de
configuration** qui contiendra le mapping JSON.

DPE de config par défaut : `_ZebraLabelPrinter.config.mapping`

```
DPType _ZebraLabelPrinter
└── config              (structure)
    └── mapping         (string)   ← document JSON de mapping
DP     _ZebraLabelPrinter          (DP interne, préfixe « _ »)
```

Deux méthodes sont fournies — utilisez celle qui convient à votre environnement.

## Méthode A — Import du fichier DPL (`_ZebraLabelPrinter.dpl`)

Import via l'**ASCII Manager** :

```
WCCOAascii -in _ZebraLabelPrinter.dpl
```

ou depuis GEDI : *System Management → ASCII → Import*.

> Format du fichier : en-tête `# ascii dump of database`, puis la section
> `# DpType` (`TypeName`) où l'arbre est indenté par **tabulations** et chaque
> élément porte `type#id` (`1` = nœud structure, `25` = `string`), enfin la
> section `# Datapoint/DpId` (`DpName  TypeName  ID`). L'`ID` (`713`) est
> l'identifiant de DP ; à l'import, WinCC OA l'attribue ou le réutilise. Si cet
> ID est déjà pris sur votre système, utilisez la méthode B.

## Méthode B — Script CTRL (`create_zebra_config.ctl`) — recommandé

La plus robuste (indépendante du format ASCII). Elle utilise `dpTypeCreate` et
`dpCreate`, et est idempotente (ne recrée rien si déjà présent).

```
WCCOActrl create_zebra_config.ctl
```

ou lancez-la depuis un Ctrl Manager dans GEDI.

> 💡 Astuce : exécutez la méthode B une fois, puis **exportez** le DPType depuis
> PARA / l'ASCII Manager pour obtenir un `.dpl` parfaitement formaté pour *votre*
> version de WinCC OA.

## Ensuite : charger le mapping

Une fois le DP créé, écrivez le document JSON dans le DPE de config :

```bash
node scripts/save-mapping.js examples/mapping.example.json -configDpe _ZebraLabelPrinter.config.mapping
```

## DP de données

Les DPE référencés par le mapping (champs, trigger, status) doivent aussi exister
— voir le tableau dans le README principal (DPType `ZebraLabel` : `product`,
`lot`, `ean`, `quantity`, `cmd.print` (bool), `status`, etc.). Adaptez le script
CTRL ci-dessus pour créer également ce type/instance si besoin.
