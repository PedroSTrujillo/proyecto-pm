// Cómo sacar los dos archivos desde cada programa contable.
//
// Regla: un paso solo nombra un menú si se confirmó en una fuente, y la guía la muestra con su
// enlace y la fecha en que se consultó. Lo que no se pudo confirmar se dice así, con
// instrucciones generales: es mejor eso que inventar el nombre de un menú.
// Para agregar un programa: copien un bloque, cambien los pasos y pongan la fuente.

export const GENERICA = {
  ventas: [
    'Busca en los informes de ventas o de inventario uno que traiga, por producto, el código y la cantidad vendida.',
    'Elige el último año (o los dos últimos). Si el informe trae la fecha de cada venta, mejor; si solo trae el total vendido en el rango, también sirve: anota de qué fecha a qué fecha lo sacaste.',
    'Exporta el informe a Excel o CSV.',
  ],
  existencias: [
    'Busca el informe de existencias o saldos por producto, con fecha de hoy y todas las bodegas.',
    'Expórtalo a Excel o CSV.',
  ],
};

export const SISTEMAS = [
  {
    id: 'siigo-nube',
    nombre: 'Siigo Nube',
    ventas: [
      'Entra a Reportes › Productos y servicios › Saldos y movimientos › Movimiento de productos.',
      'En "Fecha de elaboración" elige el último año (o los dos últimos). En "Tipo" deja "Producto".',
      'Haz clic en el ícono "Exportar datos", a la derecha de la pantalla.',
    ],
    existencias: [
      'Entra a Reportes › Productos y servicios › Saldos y movimientos › Saldos de productos.',
      'En "Fecha de corte" pon la fecha de hoy. Deja "Bodega" vacío para incluir todas y en "Saldo" elige todos los productos.',
      'Haz clic en "Buscar" y luego en el ícono "Exportar datos".',
    ],
    fuentes: [
      { texto: 'Ayuda de Siigo: informe Movimiento de productos', url: 'https://siigonube.portaldeclientes.siigo.com/informe-movimiento-de-productos/' },
      { texto: 'Ayuda de Siigo: informe Saldos de productos', url: 'https://siigonube.portaldeclientes.siigo.com/informe-saldos-de-productos/' },
    ],
  },
  {
    id: 'alegra',
    nombre: 'Alegra',
    ventas: [
      'Entra al menú Reportes y, en la sección Ventas, abre "Ventas por ítems".',
      'Elige el rango de fechas: el último año. Anótalo, porque te lo vamos a preguntar.',
      'Haz clic en "Generar reporte" y descárgalo en Excel.',
    ],
    ventasNota: 'Este reporte trae el total vendido de cada producto en el rango, sin la fecha de cada venta. Por eso, al subirlo, te preguntamos de qué fecha a qué fecha es.',
    existencias: [
      'En el menú Reportes, abre "Inventario valorizado".',
      'Exporta el reporte a Excel. Si filtras por bodega aparecen también las columnas "Cantidad mínima" y "Cantidad máxima"; no importa, las ignoramos.',
    ],
    fuentes: [
      { texto: 'Ayuda de Alegra: reporte de ventas por ítems', url: 'https://ayuda.alegra.com/int/reporte-de-ventas-por-items-int' },
      { texto: 'Ayuda de Alegra: información de los reportes exportados', url: 'https://ayuda.alegra.com/int/informacion-visible-al-exportar-reportes-en-alegra' },
    ],
  },
  {
    id: 'world-office',
    nombre: 'World Office',
    ventas: null, // sin una ruta confirmada: se usa la guía general
    existencias: [
      'En el panel principal haz clic en "Informes", luego en "Inventarios" y luego en "Inventarios por ubicación".',
      'En "Bodega que incluye el informe" marca todas las bodegas y haz clic en "Vista Previa".',
      'Exporta el informe a Excel. Antes de exportar, cierra los archivos de Excel que tengas abiertos.',
    ],
    fuentes: [
      { texto: 'Guía de un usuario de World Office: informe de existencias por bodega', url: 'http://mhhwoffice.blogspot.com/p/informe-de-existencias-para-vendedores.html' },
      { texto: 'Boletín de World Office sobre exportar informes a Excel', url: 'https://worldoffice.com.co/preguntas/boletines/10.htm' },
    ],
  },
  {
    id: 'helisa',
    nombre: 'Helisa',
    ventas: [
      'En el módulo de Inventario, saca el listado de inventario con la columna de salidas (lo vendido) de un periodo: el último año. Es el mismo listado que muchos usuarios de Helisa ya bajan a Excel para pedir.',
      'Inclúyele también el saldo actual de cada producto: así un solo archivo sirve para las ventas y las existencias.',
      'Expórtalo a Excel (.xlsx) y anota de qué fecha a qué fecha es.',
    ],
    ventasNota: 'Ese listado trae el total de salidas del periodo, sin la fecha de cada venta: al subirlo te preguntamos el periodo. Si en cambio exportas el detalle de facturas renglón por renglón, también lo leemos; en ese caso sube aparte el informe de saldos.',
    existencias: null, // van en el mismo listado
    existenciasNota: 'Las existencias van en el mismo listado (la columna de saldo). Si tu listado no la trae, sube también el informe de saldos de inventario.',
    fuentes: [],
    sinRutaConfirmada: 'No encontramos una guía pública de Helisa con el nombre exacto de este menú. Los pasos describen cómo lo hacen sus usuarios.',
  },
  {
    id: 'sap-b1',
    nombre: 'SAP Business One',
    ventas: null,
    existencias: null,
    notaGeneral: 'Cualquier informe de SAP Business One se puede pasar a Excel con el botón de exportar de la barra de herramientas.',
    fuentes: [{ texto: 'Ayuda de SAP Business One: exportar datos', url: 'https://help.sap.com/doc/saphelp_sbo900/9.0/es-ES/45/05bc1f24a70489e10000000a155369/content.htm' }],
  },
  { id: 'siigo-pyme', nombre: 'Siigo Pyme (escritorio)', ventas: null, existencias: null, fuentes: [] },
  { id: 'siesa', nombre: 'Siesa (Enterprise o CGUNO)', ventas: null, existencias: null, fuentes: [] },
  { id: 'loggro', nombre: 'Loggro', ventas: null, existencias: null, fuentes: [] },
  { id: 'contapyme', nombre: 'ContaPyme', ventas: null, existencias: null, fuentes: [] },
  { id: 'otro', nombre: 'Otro programa', ventas: null, existencias: null, fuentes: [] },
];

export function sistemaPorId(id) {
  return SISTEMAS.find((s) => s.id === id) || null;
}
