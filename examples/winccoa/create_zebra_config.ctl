// create_zebra_config.ctl
//
// Cree le DPType interne et le DP de configuration utilises par le manager
// Zebra (DPE de config par defaut : _ZebraLabelPrinter.config.mapping).
//
// Lancer depuis GEDI (Ctrl Manager) ou via :  WCCOActrl create_zebra_config.ctl
//
// Methode la plus fiable, independante de la version du format ASCII : prefere
// ce script au .dpl si l'import ASCII echoue. Apres execution, vous pouvez
// exporter un .dpl parfaitement formate depuis PARA / ASCII Manager.

main()
{
  string typeName = "_ZebraLabelPrinter";

  // --- DPType : _ZebraLabelPrinter { config { mapping : string } } ---
  // dpTypeCreate utilise une matrice ou la COLONNE = profondeur dans l'arbre.
  dyn_dyn_string names;
  dyn_dyn_int    types;

  names[1][1] = typeName;   types[1][1] = DPEL_STRUCT;   // racine (= nom du type)
  names[2][2] = "config";   types[2][2] = DPEL_STRUCT;   // noeud
  names[3][3] = "mapping";  types[3][3] = DPEL_STRING;   // contient le JSON

  if (!dpTypeExists(typeName))
  {
    int rc = dpTypeCreate(names, types);
    if (rc != 0)
    {
      DebugN("dpTypeCreate a echoue", rc);
      return;
    }
    DebugN("DPType cree :", typeName);
  }
  else
  {
    DebugN("DPType deja present :", typeName);
  }

  // --- DP interne : _ZebraLabelPrinter ---
  if (!dpExists(typeName + ".config.mapping"))
  {
    int rc = dpCreate(typeName, typeName);
    if (rc != 0)
    {
      DebugN("dpCreate a echoue", rc);
      return;
    }
    DebugN("DP cree :", typeName);
  }
  else
  {
    DebugN("DP deja present :", typeName);
  }

  // --- (optionnel) valeur de mapping initiale ---
  // Decommentez pour ecrire un mapping minimal directement dans le DPE :
  // string json = "{\"printMode\":\"tcp\",\"tcp\":{\"host\":\"192.168.1.50\"},"
  //   + "\"template\":\"^XA^FO40,40^FD{{product}}^FS^XZ\","
  //   + "\"fields\":[{\"name\":\"product\",\"dpe\":\"System1:Label.product\"}]}";
  // dpSet(typeName + ".config.mapping", json);

  DebugN("Termine. DPE de config :", typeName + ".config.mapping");
}
