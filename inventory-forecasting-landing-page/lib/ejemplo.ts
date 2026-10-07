import { calcularRotacion, ordenarPorSemanas } from './rotacion'

// Una distribuidora de ferretería con un año de ventas. Son los mismos productos
// de la plantilla de ejemplo que se descarga desde la aplicación (server/plantillas.js).
export const SEMANAS_EJEMPLO = 52

const productos = [
  { codigo: 'CIN-0003', nombre: 'Cinta aislante negra 18 mm x 10 m', vendido: 1316, existencias: 0 },
  { codigo: 'TOR-0610', nombre: 'Tornillo drywall 6 x 1" (caja x100)', vendido: 608, existencias: 18 },
  { codigo: 'LIJ-0120', nombre: 'Lija de agua #120', vendido: 1570, existencias: 150 },
  { codigo: 'PVC-0250', nombre: 'Soldadura PVC 1/4 galón', vendido: 317, existencias: 40 },
  { codigo: 'BRO-0002', nombre: 'Brocha 2" mango plástico', vendido: 213, existencias: 30 },
  { codigo: 'CAN-0040', nombre: 'Candado de bronce 40 mm', vendido: 99, existencias: 20 },
  { codigo: 'MAN-1215', nombre: 'Manguera de jardín 1/2" x 15 m', vendido: 57, existencias: 45 },
  { codigo: 'GUA-0007', nombre: 'Guantes de carnaza (par)', vendido: 0, existencias: 60 },
]

export type ProductoEjemplo = (typeof productos)[number] & ReturnType<typeof calcularRotacion>

export const REPORTE_EJEMPLO: ProductoEjemplo[] = ordenarPorSemanas(
  productos.map((p) => ({ ...p, ...calcularRotacion(p.vendido, SEMANAS_EJEMPLO, p.existencias) })),
)

export function productoEjemplo(codigo: string) {
  const p = REPORTE_EJEMPLO.find((x) => x.codigo === codigo)
  if (!p) throw new Error(`No hay un producto de ejemplo con código ${codigo}`)
  return p
}
