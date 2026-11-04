'use strict';

// Formatos de archivo que el producto reconoce.
//
// IMPORTANTE PARA EL EQUIPO: el documento del MVP pide que las plantillas usen los
// mismos nombres de columna y el mismo orden que el export real de cada probador.
// Cuando tengan el export de ejemplo de cada uno:
//   1. Agreguen los nombres de columna que traiga su software a la lista de
//      sinónimos de cada campo (abajo, en CAMPOS). Se escriben en minúscula, sin
//      tildes ni signos; el lector normaliza los encabezados igual.
//   2. Si todos usan el mismo software, cambien PLANTILLA_EXPORT y PLANTILLA_LISTA
//      para que la plantilla descargable sea idéntica a ese export.
// No hace falta tocar nada más: el lector busca la fila de encabezados, reconoce
// las columnas por estos sinónimos y acepta varias hojas o varios archivos.

// Palabras que se ignoran al comparar encabezados ("Código del producto" = "codigo producto").
const PALABRAS_VACIAS = new Set(['a', 'de', 'del', 'la', 'el', 'los', 'las', 'en', 'por', 'y', 'no', 'nro', 'num', 'n']);

// Cada campo tiene sinónimos en orden de preferencia: si un archivo trae dos
// columnas que sirven, gana la que aparece primero en la lista.
const CAMPOS = {
  codigo: {
    nombre: 'código de producto',
    sinonimos: [
      'codigo producto', 'codigo', 'cod producto', 'cod', 'codigo item', 'cod item', 'item',
      'codigo articulo', 'cod articulo', 'articulo', 'referencia', 'ref', 'codigo referencia',
      'sku', 'material', 'codigo material', 'id producto', 'codigo interno', 'plu',
      'producto codigo', 'cod prod', 'codprod', 'codigo prod', 'item code', 'product code', 'code',
      // Siigo Pyme (Balance de inventarios), Loggro (Saldos al día por bodega), SAP Business One y ContaPyme.
      'numero articulo', 'codigo elemento', 'cod elemento',
    ],
  },
  nombre: {
    nombre: 'nombre del producto',
    sinonimos: [
      'nombre producto', 'nombre', 'descripcion', 'descripcion producto', 'producto',
      'nombre item', 'descripcion item', 'nombre articulo', 'descripcion articulo',
      'texto breve material', 'denominacion', 'detalle', 'nombre referencia',
      'descripcion referencia', 'description', 'product name', 'name', 'concepto',
      // Siigo Pyme (Balance de inventarios), Loggro (Saldos al día por bodega), SAP Business One y ContaPyme.
      'nombre elemento', 'descripcion elemento',
    ],
  },
  fecha: {
    nombre: 'fecha',
    sinonimos: [
      'fecha', 'fecha documento', 'fecha factura', 'fecha venta', 'fecha elaboracion',
      'fecha movimiento', 'fecha contabilizacion', 'fecha comprobante', 'fecha emision',
      'fecha transaccion', 'fecha doc', 'fec documento', 'fecha remision', 'dia', 'date',
      'periodo', 'mes', 'ano mes', 'mes ano',
    ],
  },
  cantidad: {
    nombre: 'cantidad vendida',
    sinonimos: [
      'cantidad vendida', 'unidades vendidas', 'cant vendida', 'ventas unidades',
      'ventas cantidad', 'cantidad facturada', 'cant facturada', 'cantidad', 'cant',
      'unidades', 'salidas', 'cantidad salida', 'salida', 'cantidad salidas',
      'qty', 'quantity', 'ctd', 'uds', 'unds', 'und vendidas', 'unidades vendidas periodo',
    ],
  },
  existencias: {
    nombre: 'existencias',
    sinonimos: [
      'existencias', 'existencia', 'existencias actuales', 'existencia actual', 'saldo cantidad',
      'saldo unidades', 'cantidad saldo', 'saldo', 'saldo final', 'saldo actual', 'stock',
      'stock actual', 'inventario', 'inventario actual', 'disponible', 'cantidad disponible',
      'unidades disponibles', 'cant disponible', 'libre utilizacion', 'inv actual',
      'existencia fisica', 'cantidad existencia', 'cant existencia', 'saldo inventario',
      'unidades stock', 'on hand', 'existencias hoy', 'existencia hoy', 'stock hoy', 'inventario hoy',
      'saldo hoy', 'cantidad actual', 'unidades actuales', 'cantidad bodega', 'cantidad en bodega',
      // Siigo Pyme (Balance de inventarios), Loggro (Saldos al día por bodega), SAP Business One y ContaPyme.
      'nuevo saldo', 'saldo nuevo', 'cant fisica', 'cantidad fisica', 'saldo final cantidad', 'existencia fisica', 'cant disp',
      // Siigo Nube, "Movimiento de productos" (kardex con entradas y salidas).
      'saldo cantidades', 'saldo de cantidades',
      // Helisa, listado de inventario con el encabezado en dos filas ("FINAL" sobre "CANTIDAD").
      'final cantidad', 'cantidad final', 'saldo final unidades',
    ],
  },
  // Opcional: el tipo de documento de cada fila. Sirve para los informes que mezclan compras,
  // ventas y ajustes (movimiento de inventario, kardex): el usuario marca cuáles son ventas.
  // Lo que entró en un kardex. Solo se usa en las devoluciones de clientes: la mercancía devuelta
  // entra, no sale, así que su cantidad está aquí y no en la de salidas.
  entrada: {
    nombre: 'cantidad que entró',
    sinonimos: [
      'cantidad entrada', 'cantidad entradas', 'cant entrada', 'cant entradas', 'entrada', 'entradas',
      'unidades entrada', 'unidades entradas',
    ],
  },
  documento: {
    nombre: 'tipo de documento',
    sinonimos: [
      'tipo documento', 'tipo doc', 'tipo comprobante', 'tipo movimiento', 'clase documento',
      'comprobante', 'documento', 'doc', 'prefijo',
    ],
  },
  // Opcionales: con el costo, el panel muestra cuánto dinero hay en cada producto y cuánto está
  // quieto; con el proveedor, el pedido se arma por proveedor con su tiempo de entrega.
  // "Precio" no está a propósito: casi siempre es el de venta.
  costo: {
    nombre: 'costo unitario',
    sinonimos: [
      'costo unitario', 'costo promedio', 'costo unit', 'costo prom', 'costo promedio unitario',
      'vr unitario costo', 'valor unitario costo', 'costo', 'precio costo', 'ultimo costo',
      'costo ultima compra', 'unit cost', 'cost',
      // Helisa, listado de inventario: "FINAL" sobre "UNITARIO" (el costo unitario del saldo).
      'final unitario',
    ],
  },
  costoTotal: {
    nombre: 'costo total del inventario',
    sinonimos: [
      'costo total', 'valor inventario', 'valor total inventario', 'saldo valor', 'valor saldo',
      'total costo', 'costo saldo', 'valor existencias', 'valor total costo', 'total value',
    ],
  },
  proveedor: {
    nombre: 'proveedor',
    sinonimos: [
      'proveedor', 'nombre proveedor', 'proveedor principal', 'razon social proveedor',
      'tercero proveedor', 'supplier', 'vendor',
    ],
  },
  // Opcional: la familia del producto (línea, grupo o categoría del programa contable). Sirve para
  // filtrar en Productos y en el pedido.
  familia: {
    nombre: 'familia o línea',
    sinonimos: [
      'familia', 'linea', 'grupo', 'categoria', 'sublinea', 'linea producto', 'grupo producto',
      'grupo inventario', 'familia producto', 'categoria producto', 'subgrupo', 'nombre linea', 'nombre grupo',
    ],
  },
  // Opcional: de dónde vino cada venta (D12 de docs/PLAN_ALPHA_02.md). Si trae pocos valores, el
  // usuario marca cuáles son de proyecto: esas ventas bajan existencias pero no cuentan en el promedio.
  canal: {
    nombre: 'centro de costo, proyecto o cliente',
    sinonimos: [
      'centro costo', 'centro costos', 'ot', 'orden trabajo', 'numero ot', 'proyecto', 'nombre proyecto',
      'codigo proyecto', 'cotizacion', 'canal', 'canal venta', 'cliente', 'nombre cliente',
    ],
  },
  // Cantidad en la lista de pedido (la hoja con la que arman el pedido).
  pedir: {
    nombre: 'cantidad a pedir',
    sinonimos: [
      'cantidad pedir', 'cant pedir', 'pedir', 'cantidad pedido', 'cantidad pedida',
      'cant pedido', 'pedido', 'pedido final', 'cantidad comprar', 'comprar',
      'cantidad solicitada', 'solicitado', 'cantidad', 'cant', 'unidades',
      'cantidad sugerida', 'sugerido',
    ],
  },
};

// Plantilla descargable del export de ventas y existencias (nombres y orden de columnas).
const PLANTILLA_EXPORT = {
  archivo: 'plantilla-export-ventas-existencias.xlsx',
  ventas: { hoja: 'Ventas', columnas: ['Código', 'Nombre', 'Fecha', 'Cantidad'] },
  existencias: { hoja: 'Existencias', columnas: ['Código', 'Nombre', 'Existencias'] },
};

// Plantilla para quien lleva el inventario en Excel o a mano: una fila por producto, lo que
// tiene hoy y lo vendido en cada uno de los últimos 12 meses.
const PLANTILLA_INVENTARIO = {
  archivo: 'plantilla-inventario-sinesc.xlsx',
  hoja: 'Productos',
  columnas: ['Código', 'Producto', 'Proveedor', 'Costo unitario', 'Existencias hoy'], // y después, una columna por mes
};

// Plantilla de la lista de pedido: forma de un informe de mínimos para la reunión de compras.
// Solo se leen Código y Cantidad a pedir (Descripción se usa como nombre si viene).
const PLANTILLA_LISTA = {
  archivo: 'plantilla-lista-pedido.xlsx',
  hoja: 'Pedido',
  columnas: ['Código', 'Descripción', 'Proveedor', 'Existencia', 'Mínimo', 'Máximo', 'Cantidad a pedir'],
};

// World Office escribe "Detalle: Cantidad" o "Encab: Tipo Documento": el prefijo no cuenta.
const PREFIJO_DE_SECCION = /^\s*(detalle|encab|encabezado)\s*:\s*/i;

function normalizarEncabezado(texto) {
  if (texto === null || texto === undefined) return '';
  return String(texto)
    .replace(PREFIJO_DE_SECCION, '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((p) => p && !PALABRAS_VACIAS.has(p))
    .join(' ');
}

// Índice: encabezado normalizado -> [{campo, prioridad}]
const INDICE = new Map();
for (const [campo, def] of Object.entries(CAMPOS)) {
  def.sinonimos.forEach((s, i) => {
    const k = normalizarEncabezado(s);
    if (!INDICE.has(k)) INDICE.set(k, []);
    INDICE.get(k).push({ campo, prioridad: i });
  });
}

// Encabezados que cambian de significado según las otras columnas de la misma tabla.
// En el detalle de facturas de Helisa, "Cantidad Disponible" es lo facturado menos las
// "Unidades Devueltas" de esa línea: la venta neta, no lo que hay en bodega. Leída como
// existencias, el reporte salía con el inventario de cada producto inventado.
const SEGUN_CONTEXTO = [
  { encabezado: 'cantidad disponible', siHay: 'unidades devueltas', campo: 'cantidad' },
];

// vecinos (opcional): encabezados normalizados de la misma fila.
function camposDeEncabezado(texto, vecinos = null) {
  const k = normalizarEncabezado(texto);
  if (vecinos) {
    for (const r of SEGUN_CONTEXTO) {
      if (k === normalizarEncabezado(r.encabezado) && vecinos.has(normalizarEncabezado(r.siHay))) return [{ campo: r.campo, prioridad: -1 }];
    }
  }
  return INDICE.get(k) || [];
}

module.exports = {
  CAMPOS,
  PLANTILLA_EXPORT,
  PLANTILLA_LISTA,
  PLANTILLA_INVENTARIO,
  normalizarEncabezado,
  camposDeEncabezado,
};
