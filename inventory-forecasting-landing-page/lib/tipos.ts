// Lo que devuelve la API (server/inventario.js y server/pedidos.js). Si cambias allá, cambia aquí.

export type Estado = 'agota' | 'pide' | 'normal' | 'sobra' | 'sin_ventas'

export type Pronostico = { media: number; bajo: number; alto: number }

// frecuente: vende en la mitad de sus semanas o más; esporadico: en menos; proyecto: más de la mitad
// de lo vendido fue para proyectos; unica: todo cayó en 1 o 2 semanas (server/inventario.js, clasificar).
export type Clase = 'frecuente' | 'esporadico' | 'proyecto' | 'unica'

// Por qué esa cantidad sugerida: las semanas que cubre, el rango del pronóstico y el redondeo.
export type DetalleSugerido = {
  semanasCubrir: number
  media: number
  bajo?: number
  alto: number
  ventaSemana: number
  falta?: number // lo que faltaba antes de redondear al paquete
  lote?: number
  loteOrigen?: 'catalogo' | 'ventas' | null
  minimoPedido?: number | null // si subió al mínimo de pedido
  enCamino?: number // lo pedido que no ha llegado y se descontó
}

export type Producto = {
  codigo: string
  nombre: string
  proveedor: string
  origenProveedor: 'producto' | 'archivo' | 'prefijo' | null
  entrega: number
  entregaDias?: number | null // si el tiempo de entrega se escribió en días hábiles
  familia?: string | null
  multiplo?: number | null // múltiplo de empaque escrito en el catálogo
  minimoPedido?: number | null
  sobraSemanas?: number | null // desde cuántas semanas sobra, si la empresa lo escribió (si no, umbrales.sobra)
  clase?: Clase | null
  ventaAlta?: boolean // el 20 % de productos que más vende
  // Lo pedido en las últimas 2 semanas por alguien de la empresa.
  pedidoReciente?: { fecha: string; cantidad: number; numero: number; por: string | null } | null
  // Lo pedido en pedidos cerrados que todavía no ha llegado (server/recepcion.js): el sugerido lo descuenta.
  enCamino?: { cantidad: number; fecha: string } | null
  costo: number | null
  ventasSemana: number
  existencias: number
  semanas: number | null
  estado: Estado
  riesgo: number | null
  // Todo lo vendido cayó en 1 o 2 semanas (un proyecto): no se sugiere ni se pronostica.
  ventaUnica?: { vendido: number; semanas: number; desde: string } | null
  sugerido: number | null
  detalleSugerido?: DetalleSugerido | null
  lote: number // paquete en que se pide: el múltiplo del catálogo o el que se deduce de las ventas (1 si no hay)
  minimo: number | null
  maximo: number | null
  valor: number | null
  quieto: number | null
  unidadesQuietas: number
  tendencia: number | null
  senales: string[]
  pico: { mes: string; vendido: number; contado: number } | null
  explicacion: {
    vendido: number
    vendidoProyecto?: number
    vendidoAjustado: number
    vendidoReciente: number
    semanasProducto: number
    semanasRecientes: number
    promedioSimple: number
  }
  serie: number[] | null
  semanasPico: number[]
  pronostico: Pronostico[] | null
  // Lo que se va a vender en el horizonte que eligió el usuario (null para el operador).
  ventaHorizonte?: Pronostico | null
}

export type Proveedor = { nombre: string; entrega: number; productos: number; pideYa: number; seAgotan: number }

export type Inventario = {
  fuente: {
    demo?: string
    empresa?: string
    sector?: string
    ciudad?: string
    persona?: string
    resumen?: string
    programa?: string | null
    archivos?: string[]
    fecha: string
    exportId?: number
    pedidoId?: number | null
    filasVenta?: number
    desde: string
    hasta: string
    semanas: number
    totales: boolean
    mensual: boolean
    // 'movimientos': el último archivo más lo registrado después (server/movimientos.js).
    origen?: 'archivo' | 'movimientos'
    movimientos?: number
  }
  umbrales: { seAgota: number; sobra: number }
  // Semanas del pronóstico que eligió el usuario.
  horizonte?: number
  // 'operador': las métricas gruesas, con los detalles en null (server/inventario.js, resumirParaOperador).
  vista?: Perfil
  ajustes: { entregaPorDefecto: number; entregaPorDefectoDias?: number | null; entregasDias?: Record<string, number>; cadaCuanto: number; semanasAgota: number; entregas: Record<string, number>; asignaciones: Record<string, string>; prefijos: { prefijo: string; proveedor: string }[]; nivelServicio: number }
  sugerencias: boolean
  alcance: 'completo' | 'prueba'
  temporada: number[] | null
  proveedores: Proveedor[]
  resumen: {
    productos: number
    seAgotan: number
    enCero: number
    pideYa: number
    sobran: number
    sinVentas: number
    cobertura: number | null
    sinProveedor: number
    enCamino?: number
    tieneCostos: boolean | null
    valorInventario: number | null
    dineroQuieto: number | null
    tendencia4: number | null
    picosRecortados: number
    productosNuevos: number
    acierto: { productos: number; aciertos: number; semanas: number; errorTipico: number | null } | null
    avisos: { productos: number; primero: { codigo: string; nombre: string; fechaUmbral: string; fechaAviso: string } | null } | null
  }
  grafico: {
    semanas: { inicio: string; total: number; proyectos: number }[]
    pronostico: { inicio: string; media: number; bajo: number; alto: number }[]
  } | null
  productos: Producto[]
  ejemplo: unknown
  avisos: string[]
  hojasUsadas: { archivo: string; hoja: string | null; uso: string; columnas: Record<string, string>; porMes: boolean }[]
}

export type RespuestaInventario = {
  inventario: Inventario | null
  puedeSubir: boolean
  sugerencias: boolean
  alcance?: 'completo' | 'prueba'
  finPrueba: string | null
  perfil?: Perfil
  // Sin archivo todavía, igual vienen sus ajustes (proveedores y tiempos de entrega).
  ajustes?: { entregas: Record<string, number>; entregaPorDefecto: number; cadaCuanto: number }
  recordatorio?: { activo: boolean; pedidoId: number | null; fechaReporte: string; primerAviso: string | null } | null
}

export type Perfil = 'analista' | 'operador'
// El rol en la empresa (server/cuentas.js, rolEmpresa): el servidor lo hace cumplir y nadie se lo cambia a sí mismo.
export type RolEmpresa = 'gerente' | 'administrador' | 'operador'

export type TipoAlerta = 'pideYa' | 'seAgota' | 'enCero' | 'porRecibir' | 'porAprobar' | 'dineroQuieto' | 'sobran' | 'sinDatos'
export type Frecuencia = 'diario' | 'semanal' | 'mensual' | 'nunca'

export type Usuario = {
  id: number
  email: string
  nombre: string
  rol: 'usuario' | 'equipo'
  sistema: string | null
  perfil: Perfil
  rolEmpresa: RolEmpresa
  // alertas: la tabla completa del boletín (lo que eligió encima de lo de su perfil, server/alertas.js).
  preferencias: { unidad: 'dias' | 'semanas' | 'meses'; horizonte: number; alertas: Record<TipoAlerta, Frecuencia>; alertasPropias: boolean }
  boletin: boolean
  cargo: string
  aprueba: boolean // aprueba los pedidos de su empresa (lo marca quien administra)
  empresa: { id: number; nombre: string; vacia: boolean; admin: boolean } | null
}

export type Empresa = {
  id: number
  nombre: string
  nit: string | null
  vacia: boolean
  creadoEn: string
  logo: boolean
  miembros: { id: number; nombre: string; email: string; perfil: Perfil; rol: RolEmpresa; admin: boolean; aprueba: boolean; cargo: string; desde: string }[]
  invitacionesAbiertas: { email: string | null; creadaEn: string; expiraEn: string }[]
}

export type TipoMovimiento = 'entrada' | 'venta' | 'devolucion' | 'salida' | 'conteo'

export type Movimiento = {
  id: number
  codigo: string
  nombre: string
  tipo: TipoMovimiento
  cantidad: number
  fecha: string
  desde?: string | null // venta de un periodo: desde → fecha, repartida entre sus días
  nota: string
  proyecto?: boolean // venta para un proyecto: baja existencias, no cuenta en el promedio
  pedidoId?: number | null // entrada registrada al recibir un pedido
  registro: string | null
  creadoEn: string
  anulado: boolean
}

export type ProductoCatalogo = { id: number; codigo: string; nombre: string; unidad: string | null; costo: number | null; proveedor: string | null; familia: string | null; multiplo: number | null; minimoPedido: number | null; sobraSemanas: number | null; activo: boolean }

export type Existencias = {
  base: { exportId: number; hasta: string; subidoEn: string } | null
  movimientos: number
  ignorados: number
  negativos: number
  hoy: string
  productos: { codigo: string; nombre: string; unidad: string | null; existencias: number; ultimo: { fecha: string; tipo: TipoMovimiento; cantidad: number } | null }[]
}

export type Sector = { id: string; empresa: string; sector: string; ciudad: string; programa: string; resumen: string; productos: number }

// Lo que llegó de un pedido cerrado, por proveedor (server/recepcion.js, vistaRecepcion).
export type Recepcion = {
  pedidoId: number
  numero: number | null
  por: string | null
  terminadoEn: string
  espera: boolean
  pendientes: number
  proveedores: { proveedor: string; lineas: { codigo: string; nombre: string; cantidad: number; recibido: { cantidad: number; fecha: string; por: string | null } | null }[] }[]
}

// Códigos que no coinciden entre ventas y existencias (server/rotacion.js, revisarCodigos).
export type RevisionCodigos = {
  ventas: number
  existencias: number
  coinciden: number
  alerta: boolean
  soloVentas: { codigo: string; nombre: string; vendido: number }[]
  soloExistencias: { codigo: string; nombre: string; existencias: number }[]
  totalSoloVentas: number
  totalSoloExistencias: number
  parejas: { ventas: string; existencias: string; nombre: string }[]
}

// Aprobación de un pedido desde lo sugerido (server/pedidos.js, vistaAprobacion).
export type EstadoAprobacion = 'preparando' | 'por_aprobar' | 'devuelto' | 'cerrado'
export type Aprobacion = {
  estado: EstadoAprobacion
  preparadoPor: { nombre: string; cargo: string } | null
  enviadoEn: string | null
  devuelto: { en: string; motivo: string } | null
  aprobado: { en: string; nombre: string; cargo: string } | null
  aprobadores: string[]
  esMio: boolean
  puedoAprobar: boolean
  puedoCerrar: boolean
  puedoEnviar: boolean
}

// Una entrada del historial de un pedido (server/trazas.js).
export type EntradaHistorial =
  | { tipo: 'cambio'; en: string; quien: string; codigo: string; nombre: string; antes: number | null; despues: number | null; nota: string }
  | { tipo: 'estado'; en: string; quien: string; texto: string; motivo: string }
