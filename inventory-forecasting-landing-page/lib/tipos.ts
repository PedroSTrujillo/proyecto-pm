// Lo que devuelve la API (server/inventario.js y server/pedidos.js). Si cambias allá, cambia aquí.

export type Estado = 'agota' | 'pide' | 'normal' | 'sobra' | 'sin_ventas'

export type Pronostico = { media: number; bajo: number; alto: number }

export type Producto = {
  codigo: string
  nombre: string
  proveedor: string
  origenProveedor: 'producto' | 'archivo' | 'prefijo' | null
  entrega: number
  costo: number | null
  ventasSemana: number
  existencias: number
  semanas: number | null
  estado: Estado
  riesgo: number | null
  // Todo lo vendido cayó en 1 o 2 semanas (un proyecto): no se sugiere ni se pronostica.
  ventaUnica?: { vendido: number; semanas: number; desde: string } | null
  sugerido: number | null
  lote: number // paquete en que siempre se vende (1 si no hay)
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
  ajustes: { entregaPorDefecto: number; cadaCuanto: number; semanasAgota: number; entregas: Record<string, number>; asignaciones: Record<string, string>; prefijos: { prefijo: string; proveedor: string }[]; nivelServicio: number }
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

export type Usuario = {
  id: number
  email: string
  nombre: string
  rol: 'usuario' | 'equipo'
  sistema: string | null
  perfil: Perfil
  preferencias: { unidad: 'dias' | 'semanas' | 'meses'; horizonte: number }
  boletin: boolean
  empresa: { id: number; nombre: string; vacia: boolean; admin: boolean } | null
}

export type Empresa = {
  id: number
  nombre: string
  nit: string | null
  vacia: boolean
  creadoEn: string
  miembros: { id: number; nombre: string; email: string; perfil: Perfil; admin: boolean; desde: string }[]
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
  nota: string
  registro: string | null
  creadoEn: string
  anulado: boolean
}

export type ProductoCatalogo = { id: number; codigo: string; nombre: string; unidad: string | null; costo: number | null; proveedor: string | null; activo: boolean }

export type Existencias = {
  base: { exportId: number; hasta: string; subidoEn: string } | null
  movimientos: number
  ignorados: number
  negativos: number
  hoy: string
  productos: { codigo: string; nombre: string; unidad: string | null; existencias: number; ultimo: { fecha: string; tipo: TipoMovimiento; cantidad: number } | null }[]
}

export type Sector = { id: string; empresa: string; sector: string; ciudad: string; programa: string; resumen: string; productos: number }
