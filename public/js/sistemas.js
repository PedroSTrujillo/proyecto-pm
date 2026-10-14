// Cómo sacar los dos archivos desde cada programa contable.
//
// Reglas para escribir una guía:
//   - Solo se nombra un menú o un informe si se confirmó en una fuente (y va en `fuentes`) o en un
//     export real. Si no, la guía lo dice y usa los pasos generales. No se inventan menús.
//   - Pasos cortos: dónde está, qué elegir, cómo exportar. Nada más.
// Para agregar un programa: copien un bloque, cambien los pasos y pongan la fuente.

export const GENERICA = {
  ventas: [
    'Abre el informe de ventas por producto. Según el programa se llama "ventas por producto", "movimiento de productos" o "kardex".',
    'Elige el último año y expórtalo a Excel.',
  ],
  existencias: [
    'Abre el informe de existencias o saldos por producto, con fecha de hoy.',
    'Expórtalo a Excel.',
  ],
};

export const SISTEMAS = [
  {
    id: 'siigo-nube',
    nombre: 'Siigo Nube',
    // El Movimiento de productos trae, por producto, las salidas y el saldo: basta con él (probado
    // con un export real de 2026-10). El saldo es el de la fecha final del informe.
    unInforme: [
      'Reportes › Productos y servicios › Saldos y movimientos › Movimiento de productos.',
      'Fecha de elaboración: del último año hasta hoy. Tipo: Producto.',
      'Clic en "Exportar datos". Si lo sacas por partes (por ejemplo, por trimestres), sube todos los archivos juntos.',
    ],
    unInformeNota: 'Trae cada factura y remisión con su fecha y la cantidad que salió, y el saldo de cada producto. Al subirlo te preguntamos qué documentos son ventas.',
    dosInformesTitulo: 'Otra forma: las ventas y los saldos en dos informes',
    ventas: [
      'Reportes › Productos y servicios › Saldos y movimientos › Movimiento de productos.',
      'Fecha de elaboración: el último año. Tipo: Producto.',
      'Clic en "Exportar datos".',
    ],
    existencias: [
      'Reportes › Productos y servicios › Saldos y movimientos › Saldos de productos.',
      'Fecha de corte: hoy. Deja Bodega vacía para incluir todas.',
      'Clic en "Buscar" y luego en "Exportar datos".',
    ],
    fuentes: [
      { texto: 'Ayuda de Siigo: Movimiento de productos', url: 'https://siigonube.portaldeclientes.siigo.com/informe-movimiento-de-productos/' },
      { texto: 'Ayuda de Siigo: Saldos de productos', url: 'https://siigonube.portaldeclientes.siigo.com/informe-saldos-de-productos/' },
    ],
  },
  {
    id: 'siigo-pyme',
    nombre: 'Siigo Pyme (escritorio)',
    unInforme: [
      'Inventarios › Saldos de inventarios › Balance de inventarios.',
      'Rango: los últimos 12 meses y todos los productos.',
      'En presentación elige "Impreso" y como destino, Excel.',
    ],
    unInformeNota: 'Trae, por producto, el saldo anterior, las entradas, las salidas y el nuevo saldo.',
    fuentes: [
      { texto: 'Ayuda de Siigo Pyme: Balance de inventarios', url: 'https://siigopyme2.portaldeclientes.siigo.com/generar-informe-balance-de-inventarios/' },
    ],
  },
  {
    id: 'alegra',
    nombre: 'Alegra',
    ventas: [
      'Reportes › Ventas › Ventas por ítems.',
      'Rango: el último año. Anótalo, te lo preguntamos al subirlo.',
      'Clic en "Generar reporte" y descárgalo en Excel.',
    ],
    existencias: [
      'Reportes › Reportes administrativos › Inventario valorizado.',
      'Fecha de corte: hoy. Clic en "Generar reporte" y expórtalo a Excel.',
    ],
    fuentes: [
      { texto: 'Ayuda de Alegra: Ventas por ítems', url: 'https://ayuda.alegra.com/int/reporte-de-ventas-por-items-int' },
      { texto: 'Ayuda de Alegra: Inventario valorizado', url: 'https://ayuda.alegra.com/es/reporte-de-inventario-valorizado' },
    ],
  },
  {
    id: 'world-office',
    nombre: 'World Office',
    ventas: null, // sin una ruta confirmada: pasos generales
    existencias: [
      'Informes › Inventarios › Inventarios por ubicación.',
      'Marca todas las bodegas y haz clic en "Vista Previa".',
      'Expórtalo a Excel. Antes, cierra los Excel que tengas abiertos.',
    ],
    fuentes: [
      { texto: 'Guía de un usuario: existencias por bodega', url: 'http://mhhwoffice.blogspot.com/p/informe-de-existencias-para-vendedores.html' },
      { texto: 'Boletín de World Office: exportar a Excel', url: 'https://worldoffice.com.co/preguntas/boletines/10.htm' },
    ],
  },
  {
    id: 'helisa',
    nombre: 'Helisa',
    // Sin guía pública: los nombres salen de exports reales (Movimiento detalle y listado de inventario).
    unInforme: [
      'En Inventarios, saca el listado de inventario de todos los productos, con la columna de salidas del periodo.',
      'Periodo: los últimos 12 meses.',
      'Expórtalo a Excel y súbelo tal como sale, con títulos y totales.',
    ],
    unInformeNota: 'Trae, por producto, lo que salió en el periodo y el saldo de hoy. El periodo lo tomamos del título del informe.',
    ventas: [
      'En Inventarios, saca el informe "Movimiento detalle" del último año.',
      'Expórtalo a Excel y súbelo tal como sale, con títulos y totales.',
    ],
    existencias: [
      'Saca el listado de inventario con el saldo de cada producto a hoy.',
      'Expórtalo a Excel.',
    ],
    fuentes: [],
    aviso: 'Los nombres de los informes pueden variar un poco según cómo esté configurado tu Helisa.',
  },
  {
    id: 'sap-b1',
    nombre: 'SAP Business One',
    ventas: [
      'Ventas - Clientes › Informes de ventas › Análisis de ventas.',
      'Pestaña "Artículos", fechas del último año y clic en "OK".',
      'Exporta el resultado con el botón de Excel de la barra de herramientas. Anota las fechas: te las preguntamos al subirlo.',
    ],
    existencias: [
      'Inventario › Informes de inventario › Status de inventario.',
      'Todos los artículos y almacenes, y clic en "OK".',
      'Exporta el resultado con el botón de Excel de la barra de herramientas.',
    ],
    aviso: 'En versiones anteriores, el módulo Inventario se llama "Gestión de stocks".',
    fuentes: [
      { texto: 'Foro de consultores SAP: Análisis de ventas', url: 'https://foros.consultoria-sap.com/t/analisis-de-ventas-en-business-one/46074' },
      { texto: 'Ayuda de SAP Business One: Status de inventario', url: 'https://help.sap.com/saphelp_sbo91/helpdata/en/45/0942e565e16c32e10000000a114a6b/content.htm' },
      { texto: 'Ayuda de SAP Business One: exportar datos', url: 'https://help.sap.com/doc/saphelp_sbo900/9.0/es-ES/45/05bc1f24a70489e10000000a155369/content.htm' },
    ],
  },
  {
    id: 'siesa',
    nombre: 'Siesa (Enterprise o CGUNO)',
    ventas: null,
    existencias: [
      'En Inventarios, abre el reporte "Existencias a la fecha por bodega".',
      'Fecha: hoy, con todas las bodegas.',
      'Expórtalo a Excel.',
    ],
    fuentes: [{ texto: 'Manuales de Siesa', url: 'https://www.siesacustomersupport.com/manuales-2/' }],
  },
  {
    id: 'loggro',
    nombre: 'Loggro',
    ventas: null,
    existencias: [
      'Reportes › Exploradores › Saldos al Día por Bodega.',
      'Deja Bodega e Ítem en blanco para ver todo y haz clic en "Buscar".',
      'Haz clic en "Exportar".',
    ],
    fuentes: [{ texto: 'Universidad Loggro: Saldos al día por bodega', url: 'https://universidad.loggro.com/loggro-pymes/c%C3%B3mo-consultar-los-saldos-al-d%C3%ADa-por-bodega' }],
  },
  {
    id: 'contapyme',
    nombre: 'ContaPyme',
    ventas: [
      'En los informes de inventarios, abre "Movimiento detallado de elementos".',
      'Periodo: el último año. Expórtalo a Excel.',
      'Si mezcla compras y ventas, al subirlo te preguntamos cuáles son ventas.',
    ],
    existencias: [
      'En los informes de inventarios, abre "Saldos de inventario" con fecha de hoy.',
      'Expórtalo a Excel.',
    ],
    fuentes: [{ texto: 'ContaPyme: informes de inventario', url: 'https://www.contapyme.com/programa-contable/informes-contables/' }],
  },
  { id: 'otro', nombre: 'Otro programa', ventas: null, existencias: null, fuentes: [] },
  { id: 'excel', nombre: 'Lo llevo en Excel o a mano', plantilla: true, fuentes: [] },
];

export function sistemaPorId(id) {
  return SISTEMAS.find((s) => s.id === id) || null;
}
