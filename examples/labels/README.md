# Exemples d'étiquettes ZPL

Gabarits ZPL prêts à l'emploi pour ce manager. Les jetons `{{champ}}` sont
remplacés à l'exécution par `ZplTemplate` à partir des valeurs des DPE (voir
`src/mapping/DataMapper.js`).

> **Un champ peut être utilisé plusieurs fois dans la même étiquette.** Chaque
> occurrence de `{{champ}}` est substituée, ce qui permet typiquement d'**imprimer**
> une donnée *et* de l'**encoder dans un tag RFID** (et/ou un code-barres) avec une
> seule valeur source. Voir `04-rfid-encode.zpl`.

| Fichier | Description | Champs utilisés |
|---------|-------------|-----------------|
| `01-simple-text.zpl` | Étiquette texte simple, quantité via `^PQ` | `product`, `lot`, `date`, `qty` |
| `02-barcode-code128.zpl` | Texte + code-barres Code 128 | `product`, `barcode`, `lot`, `qty` |
| `03-qrcode.zpl` | Texte + QR code | `product`, `serial` (×2) |
| `04-rfid-encode.zpl` | **Encodage RFID + impression** de la même donnée | `serial` (×3), `product` |
| `05-shipping-label.zpl` | Étiquette d'expédition (4×6"), SSCC réutilisé | `shipper`, `consignee`, `address`, `order`, `parcel`, `parcelCount`, `weight`, `sscc` (×2) |

## Utilisation

Le gabarit est stocké (inline, échappé) dans le champ `template` du document de
mapping JSON, lui-même enregistré dans le DPE de config. Exemple complet pour le
cas RFID : `examples/mapping.rfid.example.json` (le champ `serial` y apparaît
trois fois dans le gabarit : encodage `^RFW`, texte et code-barres).

### Tester un gabarit sans imprimante

Collez le contenu d'un fichier `.zpl` (après substitution des `{{champ}}`) dans
un visualiseur ZPL en ligne (ex. Labelary) pour prévisualiser le rendu.

## Note sur l'encodage RFID

`04-rfid-encode.zpl` écrit le numéro de série dans la mémoire EPC du tag :

```zpl
^RS8                     ; type de tag
^RFW,H^FD{{serial}}^FS   ; écriture en hexadécimal dans la mémoire EPC
^RMD,0,3,V               ; en cas d'échec : 3 tentatives puis tag annulé (void)
```

Adaptez `^RS`, `^RFW` (mode `H` hex / `A` ASCII) et la mémoire visée à votre
modèle d'imprimante RFID et à votre format de données (EPC, etc.).
