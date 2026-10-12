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
    ventas: [
      'En Inventarios, saca el informe "Movimiento detalle" del último año.',
      'Expórtalo a Excel y súbelo tal como sale, con títulos y totales.',
    ],
    ventasNota: 'También sirve el listado de inventario con la columna de salidas del periodo.',
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
    ventas: null,
    existencias: null,
    aviso: 'Cualquier informe se pasa a Excel con el botón de exportar de la barra de herramientas.',
    fuentes: [{ texto: 'Ayuda de SAP Business One: exportar datos', url: 'https://help.sap.com/doc/saphelp_sbo900/9.0/es-ES/45/05bc1f24a70489e10000000a155369/content.htm' }],
  },
  { id: 'siigo-pyme', nombre: 'Siigo Pyme (escritorio)', ventas: null, existencias: null, fuentes: [] },
  { id: 'siesa', nombre: 'Siesa (Enterprise o CGUNO)', ventas: null, existencias: null, fuentes: [] },
  { id: 'loggro', nombre: 'Loggro', ventas: null, existencias: null, fuentes: [] },
  { id: 'contapyme', nombre: 'ContaPyme', ventas: null, existencias: null, fuentes: [] },
  { id: 'otro', nombre: 'Otro programa', ventas: null, existencias: null, fuentes: [] },
  { id: 'excel', nombre: 'Lo llevo en Excel o a mano', plantilla: true, fuentes: [] },
];

export function sistemaPorId(id) {
  return SISTEMAS.find((s) => s.id === id) || null;
}
