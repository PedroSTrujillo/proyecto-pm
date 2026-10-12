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
  sugerido: number | null
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
  }
  umbrales: { seAgota: number; sobra: number }
  ajustes: { entregaPorDefecto: number; cadaCuanto: number; entregas: Record<string, number>; asignaciones: Record<string, string>; prefijos: { prefijo: string; proveedor: string }[]; nivelServicio: number }
  sugerencias: boolean
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
    tieneCostos: boolean
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
  finPrueba: string | null
  recordatorio?: { activo: boolean; pedidoId: number | null; fechaReporte: string; primerAviso: string | null } | null
}

export type Usuario = { id: number; email: string; nombre: string; rol: 'usuario' | 'equipo'; sistema: string | null }

export type Sector = { id: string; empresa: string; sector: string; ciudad: string; programa: string; resumen: string; productos: number }
