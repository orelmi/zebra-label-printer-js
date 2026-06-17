^XA
^CI28
^PW600
^LL400

^FX --- Encodage RFID -------------------------------------------------
^FX Le numero de serie est ecrit dans la memoire EPC du tag (hex).
^FX En cas d'echec d'encodage, le tag est marque void (annule).
^RS8
^RFW,H^FD{{serial}}^FS
^RMD,0,3,V

^FX --- Impression visible (meme donnee reutilisee) --------------------
^CF0,30
^FO40,40^FDProduit : {{product}}^FS
^FO40,90^FDS/N RFID : {{serial}}^FS
^FO40,150^BY3
^BCN,120,Y,N,N^FD{{serial}}^FS

^PQ1
^XZ
