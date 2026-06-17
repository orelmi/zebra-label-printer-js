^XA
^CI28
^PW812
^LL1218
^LH0,0

^FX --- En-tete expediteur / destinataire ---
^CF0,28
^FO30,30^FDDE : {{shipper}}^FS
^FO30,70^FDA  : {{consignee}}^FS
^FO30,110^FD{{address}}^FS

^FO30,160^GB752,3,3^FS

^FX --- Bloc references ---
^CF0,30
^FO30,190^FDCommande : {{order}}^FS
^FO30,240^FDColis    : {{parcel}} / {{parcelCount}}^FS
^FO30,290^FDPoids    : {{weight}} kg^FS

^FX --- Code-barres SSCC (reutilise en clair en dessous) ---
^FO30,360^BY3
^BCN,180,N,N,N^FD{{sscc}}^FS
^CF0,34
^FO30,560^FD{{sscc}}^FS

^PQ1
^XZ
