^XA
^CI28
^PW609
^LL406

^FX --------------------------------------------------------------------
^FX  GS1-128 (ex UCC/EAN-128)
^FX  AI utilises : (01) GTIN-14, (17) peremption AAMMJJ, (10) lot
^FX  >8 = FNC1, obligatoire en tete pour designer une donnee GS1.
^FX  Regle : placer les AI a longueur FIXE d'abord (01 puis 17), puis
^FX  l'AI a longueur VARIABLE (10) en dernier => aucun separateur FNC1
^FX  interne necessaire. Le subset Code128 est choisi automatiquement
^FX  (numerique pour le GTIN, alphanumerique pour le lot).
^FX --------------------------------------------------------------------
^BY2,2,140
^FO40,50^BCN,140,N,N,N^FD>801{{gtin}}17{{expiry}}10{{lot}}^FS

^FX --- Ligne lisible avec AI entre parentheses (norme GS1) ---
^CF0,28
^FO40,210^FD(01){{gtin}}  (17){{expiry}}  (10){{lot}}^FS

^FX --- Infos produit ---
^FO40,260^FD{{product}}^FS

^PQ{{qty}}
^XZ
