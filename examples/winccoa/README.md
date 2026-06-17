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

> ⚠️ Le format ASCII WinCC OA est **dépendant de la version**. La première ligne
> (`117`) est le numéro de version du format ; ajustez-la si votre installation
> attend une autre valeur, ou utilisez la méthode B. Le type d'élément `25`
> correspond à `string` (`1` = nœud structure).

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
