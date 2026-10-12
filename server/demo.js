'use strict';

// Datos de ejemplo para la demo (sin cuenta): cinco negocios inventados, armados con lo que
// contaron los entrevistados (ver Conversaciones Grupo 1): ferretería con miles de referencias,
// muebles importados que no se deberían volver a traer, mobiliario de oficina vendido por
// proyectos, refrigeración con importados que tardan semanas y papelería con temporada escolar.
//
// Ninguna empresa, producto ni proveedor es real. Las ventas se generan con una semilla fija y
// pasan por el mismo cálculo que el archivo de un usuario (lector → rotación → pronóstico), así
// que la demo muestra exactamente lo que vería un cliente.

const { calcularRotacion } = require('./rotacion');
const { seriesSemanales } = require('./series');
const { construirInventario } = require('./inventario');
const { claveCodigo, textoDia, MS_DIA } = require('./valores');

const SEMANAS_HISTORIA = 82; // un poco más de año y medio: alcanza para ver la temporada

// Temporada por mes (enero a diciembre).
const TEMPORADAS = {
  plana: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  ferreteria: [0.85, 0.9, 1, 1.05, 1.05, 1, 1, 1.05, 1, 1, 1.05, 1.1],
  lluvia: [0.75, 0.75, 1, 1.35, 1.35, 0.9, 0.75, 0.75, 1, 1.35, 1.35, 1],
  seco: [1.3, 1.3, 1.1, 0.7, 0.7, 1, 1.3, 1.3, 1, 0.7, 0.7, 1],
  muebles: [0.7, 0.75, 0.9, 0.9, 1, 1.15, 1, 0.95, 0.95, 1, 1.25, 1.45],
  oficina: [1.15, 1.15, 1.05, 1, 0.95, 0.9, 0.95, 1, 1, 0.95, 0.95, 0.85],
  calor: [1.25, 1.3, 1.15, 0.9, 0.85, 0.95, 1.15, 1.2, 1, 0.8, 0.75, 0.9],
  escolar: [2, 2.3, 1.1, 0.8, 0.8, 0.8, 0.9, 1.4, 0.85, 0.7, 0.7, 0.95],
  navidad: [0.5, 0.5, 0.6, 0.7, 0.8, 0.9, 0.9, 0.9, 1, 1.3, 1.8, 2.6],
};

/*
 * Cada producto: [código, nombre, proveedor (índice), ventas por semana, costo, semanas que
 * alcanza hoy, opciones]. Opciones:
 *   lote: se vende en paquetes de ese tamaño     temporada: la del producto, si no es la del negocio
 *   proyecto: [hace cuántos meses, veces lo normal]  nuevo: empezó a venderse hace estas semanas
 *   baja: la venta cae hasta casi cero (producto en desmonte)   sube: crece en el año
 */
const SECTORES = {
  ferreteria: {
    empresa: 'Ferrecentro La Escuadra S.A.S.',
    sector: 'Ferretería',
    ciudad: 'Bogotá',
    programa: 'World Office',
    persona: 'Marta Ruiz',
    resumen: 'Distribuidora de ferretería con más de 3.000 referencias. Compra a fabricantes nacionales y a un importador de herramienta.',
    archivos: ['Movimiento de inventario.xls', 'Inventarios por bodega.xls'],
    temporada: 'ferreteria',
    proveedores: [
      { nombre: 'Tornillería Industrial', entrega: 1 },
      { nombre: 'Pinturas Andinas', entrega: 1.5 },
      { nombre: 'Eléctricos Unidos', entrega: 1 },
      { nombre: 'Importadora Herramientas del Pacífico', entrega: 10 },
      { nombre: 'Cementos y Agregados del Centro', entrega: 0.5 },
      { nombre: 'Plásticos y Tubos', entrega: 2 },
    ],
    productos: [
      ['CEM-050', 'Cemento gris 50 kg', 4, 120, 31000, 0.8, { lote: 10, proyecto: [5, 4] }],
      ['TOR-0610', 'Tornillo drywall 6 x 1" (caja x100)', 0, 45, 9800, 1.2, {}],
      ['CHA-1438', 'Chazo plástico 1/4" (bolsa x100)', 0, 30, 6500, 3.5, { lote: 2 }],
      ['PUN-0200', 'Puntilla 2" con cabeza (libra)', 0, 38, 5200, 5, {}],
      ['PIN-VB01', 'Pintura vinilo blanco, galón', 1, 38, 42000, 1.6, {}],
      ['PIN-VB05', 'Pintura vinilo blanco, cuñete 5 galones', 1, 9, 185000, 4, { proyecto: [3, 5] }],
      ['ESM-NEG1', 'Esmalte negro brillante, galón', 1, 7, 58000, 7, {}],
      ['THN-GAL', 'Thinner, galón', 1, 14, 24000, 3, {}],
      ['BRO-0002', 'Brocha 2" mango plástico', 1, 20, 4500, 6, { lote: 3 }],
      ['ROD-0009', 'Rodillo de felpa 9"', 1, 12, 11000, 9, {}],
      ['LIJ-0120', 'Lija de agua #120', 0, 60, 1400, 4, { lote: 10 }],
      ['CIN-AIS1', 'Cinta aislante negra 18 mm x 10 m', 2, 40, 3200, 1.4, { lote: 5 }],
      ['CAB-THH12', 'Cable THHN #12, rollo 100 m', 2, 6, 210000, 3, { proyecto: [2, 6] }],
      ['TOM-DOB', 'Toma doble con polo a tierra', 2, 25, 7800, 5, {}],
      ['INT-SEN', 'Interruptor sencillo', 2, 22, 6200, 6.5, {}],
      ['BOM-LED9', 'Bombillo LED 9 W luz blanca', 2, 55, 4900, 2.6, { lote: 6 }],
      ['BOM-INC60', 'Bombillo incandescente 60 W (descontinuado)', 2, 0.6, 1200, 400, { baja: true }],
      ['TUB-PVC12', 'Tubo PVC presión 1/2" x 6 m', 5, 18, 14500, 2.4, {}],
      ['COD-PVC12', 'Codo PVC presión 1/2"', 5, 50, 700, 8, { lote: 10 }],
      ['SOL-PVC14', 'Soldadura PVC 1/4 de galón', 5, 8, 38000, 10, {}],
      ['MAN-1215', 'Manguera de jardín 1/2" x 15 m', 5, 2.5, 27000, 26, { temporada: 'seco' }],
      ['IMP-TEJ1', 'Impermeabilizante para tejas, galón', 1, 4, 52000, 3, { temporada: 'lluvia' }],
      ['LLA-LAV', 'Llave para lavamanos cromada', 5, 5, 46000, 11, {}],
      ['SIL-TRA', 'Silicona transparente, tubo 280 ml', 0, 16, 9500, 7, {}],
      ['PEG-BAL25', 'Pegante para baldosa, bulto 25 kg', 4, 35, 23000, 2.2, { lote: 4, proyecto: [7, 5] }],
      ['BOQ-BLA2', 'Boquilla blanca, bolsa 2 kg', 4, 15, 8500, 5.5, {}],
      ['CAN-B40', 'Candado de bronce 40 mm', 0, 4, 21000, 14, {}],
      ['GUA-CAR', 'Guantes de carnaza (par)', 0, 10, 6800, 6, { lote: 2 }],
      ['CER-PPAL', 'Cerradura para puerta principal', 0, 3, 68000, 9, {}],
      ['TAL-PER12', 'Taladro percutor 1/2" 750 W', 3, 1.8, 189000, 6, {}],
      ['DIS-COR45', 'Disco de corte para metal 4½"', 3, 30, 3900, 13, { lote: 5 }],
      ['BRO-HSS14', 'Broca HSS 1/4"', 3, 14, 3100, 12, { lote: 2 }],
      ['JGO-LLA12', 'Juego de llaves mixtas 12 piezas', 3, 1.2, 96000, 22, {}],
      ['PUL-4585', 'Pulidora 4½" 850 W', 3, 1.1, 165000, 30, {}],
      ['LAM-SOLAR', 'Lámpara solar LED para exterior', 3, 6, 35000, 4, { nuevo: 10 }],
      ['ESC-TIJ6', 'Escalera tijera de aluminio, 6 pasos', 5, 0.5, 210000, 40, {}],
      ['CAR-BUG', 'Carretilla tipo buggy', 4, 0.4, 230000, 32, {}],
    ],
  },

  muebles: {
    empresa: 'Casa Nogal Muebles',
    sector: 'Muebles para el hogar',
    ciudad: 'Medellín',
    programa: 'Helisa',
    persona: 'Julián Restrepo',
    resumen: 'Almacén de muebles con producción de talleres locales y contenedores importados. Decide qué volver a traer en cada contenedor.',
    archivos: ['Movimiento detalle.xlsx', 'Listado de inventario.xlsx'],
    temporada: 'muebles',
    proveedores: [
      { nombre: 'Contenedor Asia (importado)', entrega: 14 },
      { nombre: 'Taller Madera Fina', entrega: 4 },
      { nombre: 'Tapicería El Roble', entrega: 3 },
      { nombre: 'Colchones Descanso', entrega: 1 },
      { nombre: 'Decoración Importada', entrega: 10 },
    ],
    productos: [
      ['SOF-3P-GR', 'Sofá 3 puestos tela gris', 2, 6, 1150000, 2.5, {}],
      ['SOF-CAMA', 'Sofá cama 2 puestos', 2, 3.5, 980000, 5, {}],
      ['SOF-L-BEI', 'Sofá en L beige', 2, 2, 1890000, 8, {}],
      ['POL-TERC', 'Poltrona tapizada terciopelo verde', 2, 2.2, 520000, 4, { nuevo: 12 }],
      ['COM-4P-RO', 'Comedor 4 puestos roble', 1, 3, 1350000, 3, {}],
      ['COM-6P-NO', 'Comedor 6 puestos nogal', 1, 1.4, 2100000, 6, {}],
      ['SIL-COM-T', 'Silla de comedor tapizada', 1, 14, 145000, 2.6, { lote: 4 }],
      ['CAM-DOB-NO', 'Cama doble nogal con cabecero', 1, 2.6, 890000, 6, {}],
      ['NOC-2C', 'Nochero 2 cajones', 1, 5, 210000, 6, { lote: 2 }],
      ['COL-SD-140', 'Colchón semidoble 140 x 190', 3, 9, 640000, 1.3, {}],
      ['COL-QU-160', 'Colchón queen 160 x 190', 3, 4, 980000, 3, {}],
      ['ALM-VIS', 'Almohada viscoelástica', 3, 18, 58000, 2, { lote: 2 }],
      ['MES-CEN-MA', 'Mesa de centro mármol y metal', 0, 2.5, 380000, 22, {}],
      ['SIL-ERG-NE', 'Silla ergonómica negra', 0, 4, 310000, 10, {}],
      ['ESC-NOR', 'Escritorio nórdico 120 cm', 0, 2.2, 420000, 16, {}],
      ['BIB-5N', 'Biblioteca 5 niveles', 0, 1.5, 360000, 18, {}],
      ['LAM-PIE-DO', 'Lámpara de pie dorada', 4, 2, 190000, 10, {}],
      ['TAP-160', 'Tapete 160 x 230 tonos tierra', 4, 3, 280000, 12, { temporada: 'navidad' }],
      ['ESP-RED80', 'Espejo redondo 80 cm', 4, 2.8, 165000, 8, {}],
      ['COJ-LIN45', 'Cojín decorativo lino 45 x 45', 4, 22, 32000, 9, { lote: 4, temporada: 'navidad' }],
      ['BUT-BAR', 'Butaco de barra metálico', 0, 1.5, 175000, 34, { baja: true }],
      ['CLO-3P-BL', 'Clóset 3 puertas blanco', 1, 1.1, 1250000, 8, {}],
      ['ZAP-MEL', 'Zapatero en melamina', 1, 2.4, 160000, 9, {}],
      ['MES-AUX-RA', 'Mesa auxiliar en ratán', 0, 0.3, 240000, 60, {}],
      ['SIL-COLG', 'Silla colgante tejida', 0, 0, 690000, 0, { stock: 14 }],
      ['REC-PU', 'Sofá reclinable cuero sintético', 0, 0.7, 1650000, 26, { baja: true }],
    ],
  },

  oficina: {
    empresa: 'Espacio Ofis S.A.S.',
    sector: 'Mobiliario de oficina',
    ciudad: 'Bogotá',
    programa: 'Siigo Nube',
    persona: 'Camilo Herrera',
    resumen: 'Vende sillas, superficies y archivo para oficinas. Parte de la venta es mostrador y parte son proyectos grandes que llegan de golpe.',
    archivos: ['Movimiento de productos.xlsx', 'Saldos de productos.xlsx'],
    temporada: 'oficina',
    proveedores: [
      { nombre: 'Ergo Importados', entrega: 10 },
      { nombre: 'Metálicas del Sur', entrega: 3 },
      { nombre: 'Maderas Técnicas', entrega: 2 },
      { nombre: 'Tapicería Industrial Bogotá', entrega: 2 },
    ],
    productos: [
      ['SIL-OPE-NE', 'Silla operativa malla negra', 0, 18, 245000, 3, { proyecto: [4, 7] }],
      ['SIL-GER-CU', 'Silla gerente cuero sintético', 0, 4, 520000, 13, {}],
      ['SIL-INT-AP', 'Silla interlocutora apilable', 0, 12, 128000, 14, { lote: 4, proyecto: [2, 8] }],
      ['SIL-ERG-PR', 'Silla ergonómica premium con apoyo lumbar', 0, 3, 890000, 5, { nuevo: 14 }],
      ['SIL-CAJ', 'Silla cajero alta', 0, 2, 310000, 14, {}],
      ['SUP-120-RO', 'Superficie de trabajo 120 x 60 roble', 2, 10, 290000, 1.6, { proyecto: [4, 6] }],
      ['SUP-150-BL', 'Superficie de trabajo 150 x 70 blanca', 2, 7, 340000, 3.5, {}],
      ['EST-PAR-4', 'Estación de trabajo 4 puestos', 2, 1.5, 2600000, 4, { proyecto: [6, 5] }],
      ['MES-JUN-8', 'Mesa de juntas 8 puestos', 2, 0.8, 1750000, 9, {}],
      ['ESC-ELEV', 'Escritorio eléctrico de altura ajustable', 0, 2, 1450000, 3, { sube: true }],
      ['ARC-4G', 'Archivador metálico 4 gavetas', 1, 3, 610000, 7, {}],
      ['LOC-12P', 'Locker metálico 12 puestos', 1, 1, 980000, 11, { proyecto: [9, 6] }],
      ['BIB-MET', 'Biblioteca metálica 5 entrepaños', 1, 1.8, 420000, 10, {}],
      ['CAJ-RODA', 'Cajonera rodante 3 cajones', 1, 8, 260000, 2.6, {}],
      ['DIV-ACU', 'Divisor acústico 120 cm', 3, 9, 185000, 5, { lote: 4 }],
      ['SOF-REC-2', 'Sofá de recepción 2 puestos', 3, 0.9, 1100000, 16, {}],
      ['POL-ESP', 'Poltrona de espera', 3, 1.4, 480000, 12, {}],
      ['BAN-ESP3', 'Banca de espera 3 puestos', 1, 0.6, 690000, 30, { baja: true }],
      ['BRA-MON', 'Brazo para monitor doble', 0, 6, 145000, 9, { sube: true }],
      ['REP-PIE', 'Reposapiés ergonómico', 0, 5, 68000, 14, { lote: 2 }],
      ['TAB-ACR', 'Tablero acrílico 120 x 90', 1, 2.5, 230000, 8, {}],
      ['PAN-CORCHO', 'Panel de corcho 60 x 90', 1, 1, 75000, 45, {}],
    ],
  },

  refrigeracion: {
    empresa: 'Frío Andino S.A.S.',
    sector: 'Refrigeración y aire acondicionado',
    ciudad: 'Cali',
    programa: 'Siigo Nube',
    persona: 'Ana Gómez',
    resumen: 'Distribuidora de repuestos y equipos de refrigeración. Los gases y compresores se importan y pagan en dólares.',
    archivos: ['Movimiento de productos.xlsx', 'Saldos de productos.xlsx'],
    temporada: 'calor',
    proveedores: [
      { nombre: 'Polar Importaciones', entrega: 9 },
      { nombre: 'Cobres del Valle', entrega: 1.2 },
      { nombre: 'Eléctricos Industriales', entrega: 1 },
      { nombre: 'Termoandina', entrega: 1.7 },
    ],
    productos: [
      ['R410-11', 'Gas refrigerante R-410A, cilindro 11,3 kg', 0, 14, 410000, 0.7, {}],
      ['R32-09', 'Gas refrigerante R-32, cilindro 9 kg', 0, 9, 360000, 6, { sube: true }],
      ['R22-13', 'Gas R-22, cilindro 13,6 kg (en desmonte)', 0, 0.8, 380000, 120, { baja: true }],
      ['COM-12K', 'Compresor rotativo 12.000 BTU', 0, 3.1, 520000, 3.5, {}],
      ['COM-24K', 'Compresor rotativo 24.000 BTU', 0, 1.6, 890000, 7, {}],
      ['MS-12I', 'Mini split 12.000 BTU inverter', 0, 2.4, 1650000, 18, {}],
      ['MS-18I', 'Mini split 18.000 BTU inverter', 0, 1.3, 2150000, 10, { nuevo: 11 }],
      ['CAP-355', 'Capacitor 35+5 µF', 2, 38, 18000, 1.1, { lote: 2 }],
      ['CAP-455', 'Capacitor 45+5 µF', 2, 21, 21000, 4, { lote: 2 }],
      ['CON-30A', 'Contactor 30 A', 2, 9, 42000, 7.8, {}],
      ['TER-DIG', 'Termostato digital', 3, 4, 65000, 9, {}],
      ['TUB-14', 'Tubería de cobre 1/4", rollo 15 m', 1, 22, 96000, 1.8, { proyecto: [5, 6] }],
      ['TUB-38', 'Tubería de cobre 3/8", rollo 15 m', 1, 16, 142000, 3, { proyecto: [5, 5] }],
      ['FIL-38', 'Filtro deshidratador 3/8"', 1, 15, 14000, 4, { lote: 2 }],
      ['SOL-15', 'Soldadura de plata 15 %', 1, 12, 120000, 10, {}],
      ['ACE-POE', 'Aceite POE, galón', 3, 6, 88000, 5, {}],
      ['VEX-TX2', 'Válvula de expansión TX2', 3, 1.1, 210000, 22, {}],
      ['ARM-INS', 'Aislante térmico armaflex 3/8"', 1, 30, 9500, 6, { lote: 6 }],
      ['SOP-COND', 'Soporte para condensadora', 3, 7, 38000, 8, {}],
      ['CIN-PVC', 'Cinta PVC para tubería', 1, 25, 4200, 12, { lote: 5 }],
      ['MOT-VEN', 'Motor ventilador condensadora 1/4 HP', 2, 2.5, 175000, 6, {}],
      ['BOM-VAC', 'Bomba de vacío 5 CFM', 0, 0.4, 780000, 45, {}],
    ],
  },

  papeleria: {
    empresa: 'Papelería Punto Escolar',
    sector: 'Papelería y útiles escolares',
    ciudad: 'Bucaramanga',
    programa: 'Alegra',
    persona: 'Sandra Pinzón',
    resumen: 'Papelería con venta al detal y a colegios. Enero y febrero venden el doble; en agosto llega la temporada de calendario B.',
    archivos: ['Ventas por ítems.xlsx', 'Inventario valorizado.xlsx'],
    temporada: 'escolar',
    proveedores: [
      { nombre: 'Distribuidora Escolar Santander', entrega: 1 },
      { nombre: 'Cuadernos del Oriente', entrega: 2 },
      { nombre: 'Arte y Color Importados', entrega: 8 },
      { nombre: 'Papeles y Oficina', entrega: 1 },
    ],
    productos: [
      ['CUA-100H', 'Cuaderno cosido 100 hojas cuadriculado', 1, 140, 3100, 2.2, { lote: 5, proyecto: [8, 3] }],
      ['CUA-ARG', 'Cuaderno argollado 5 materias', 1, 45, 9800, 3, { lote: 2 }],
      ['LAP-2HB', 'Lápiz negro 2HB', 0, 210, 450, 4, { lote: 12 }],
      ['LAP-COL12', 'Colores x12 largos', 2, 60, 6900, 1.4, { lote: 2 }],
      ['MAR-PER', 'Marcador permanente negro', 0, 55, 1900, 5, { lote: 6 }],
      ['BOR-NAT', 'Borrador de nata', 0, 120, 380, 6, { lote: 12 }],
      ['TAJ-MET', 'Tajalápiz metálico', 0, 70, 520, 7, { lote: 12 }],
      ['PEG-BAR', 'Pegante en barra 21 g', 0, 65, 2300, 3.5, { lote: 6 }],
      ['TIJ-ESC', 'Tijeras escolares punta roma', 0, 25, 2700, 8, { lote: 3 }],
      ['REG-30', 'Regla 30 cm', 0, 30, 800, 12, { lote: 6 }],
      ['RES-CAR', 'Resma papel carta 75 g', 3, 50, 16500, 1.5, { lote: 5 }],
      ['RES-OFI', 'Resma papel oficio 75 g', 3, 14, 18900, 5, { lote: 2, temporada: 'plana' }],
      ['CAR-PAR', 'Cartulina plana pliego', 3, 90, 650, 4, { lote: 10 }],
      ['KIT-GEO', 'Kit de geometría', 2, 18, 4800, 12, {}],
      ['CAL-CIE', 'Calculadora científica', 2, 6, 38000, 11, {}],
      ['MAL-ESC', 'Morral escolar', 2, 9, 42000, 6, { temporada: 'escolar' }],
      ['CAJ-PLU', 'Caja de plumones x10', 2, 20, 7800, 3, { lote: 2 }],
      ['PLA-6', 'Plastilina x6 barras', 0, 35, 2100, 5, { lote: 3 }],
      ['TEM-6', 'Témperas x6', 2, 22, 5600, 10, { lote: 2 }],
      ['AGE-2027', 'Agenda 2027', 3, 6, 15800, 9, { nuevo: 7, temporada: 'navidad' }],
      ['TON-HP', 'Tóner para impresora láser', 3, 3, 145000, 4, { temporada: 'plana' }],
      ['CUA-DIB', 'Cuaderno de dibujo 50 hojas', 1, 6, 4300, 30, { baja: true }],
      ['LAP-TIN', 'Lapicero tinta borrable (descontinuado)', 0, 0, 3200, 0, { stock: 240 }],
    ],
  },
};

// --- Generación ------------------------------------------------------------------------

// Generador pseudoaleatorio con semilla (mulberry32): la demo sale igual cada vez.
function azar(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function poisson(lambda, r) {
  if (lambda <= 0) return 0;
  if (lambda > 40) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * normal(r)));
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do { k++; p *= r(); } while (p > L);
  return k - 1;
}

function normal(r) {
  return Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
}

function semillaDe(texto) {
  let h = 2166136261;
  for (const c of texto) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

function hoyBogota() {
  const t = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  const [a, m, d] = t.split('-').map(Number);
  return Math.round(Date.UTC(a, m - 1, d) / MS_DIA);
}

function mesDe(dia) {
  return new Date(dia * MS_DIA).getUTCMonth();
}

function ventasDelProducto(def, sector, hasta, r) {
  const [codigo, nombre, , porSemana, , , op] = def;
  const desde = hasta - SEMANAS_HISTORIA * 7 + 1;
  const temporada = TEMPORADAS[op.temporada || sector.temporada];
  const inicio = op.nuevo ? hasta - op.nuevo * 7 + 1 : desde;
  const proyecto = op.proyecto ? (() => {
    const d = new Date(hasta * MS_DIA);
    return { mes: d.getUTCFullYear() * 12 + d.getUTCMonth() - op.proyecto[0], veces: op.proyecto[1] };
  })() : null;
  const lote = op.lote || 1;
  const ventas = [];
  for (let dia = inicio; dia <= hasta; dia++) {
    const semana = new Date(dia * MS_DIA).getUTCDay();
    if (semana === 0) continue; // domingo cerrado
    const t = (dia - desde) / (hasta - desde); // 0 al comienzo del archivo, 1 hoy
    let tasa = (porSemana / 6) * temporada[mesDe(dia)];
    if (op.baja) tasa *= Math.max(0.08, 1.9 - 1.8 * t);
    if (op.sube) tasa *= 0.6 + 0.6 * t;
    let cantidad = poisson(tasa / lote, r) * lote;
    if (proyecto) {
      const d = new Date(dia * MS_DIA);
      if (d.getUTCFullYear() * 12 + d.getUTCMonth() === proyecto.mes && d.getUTCDate() === 12) {
        cantidad += Math.round(porSemana * 4.3 * (proyecto.veces - 1));
      }
    }
    if (cantidad > 0) ventas.push({ codigo, nombre, dia, cantidad });
  }
  return ventas;
}

const cache = new Map();

// Ventas, existencias y catálogo del sector (lo caro de generar), una vez por día.
function datosDelSector(id) {
  const sector = SECTORES[id];
  const hasta = hoyBogota() - 1;
  const llave = `${id}:${hasta}`;
  if (cache.has(llave)) return cache.get(llave);

  const r = azar(semillaDe(id));
  const ventas = [];
  for (const def of sector.productos) ventas.push(...ventasDelProducto(def, sector, hasta, r));
  // Ventas por semana de cada producto (para fijar las existencias en las semanas que se quieren).
  const base = calcularRotacion({ ventas, existencias: sector.productos.map(([codigo, nombre]) => ({ codigo, nombre, existencias: 0 })) });
  const tasa = new Map(base.filas.map((f) => [claveCodigo(f.codigo), f.promedioSemanal]));
  const existencias = sector.productos.map(([codigo, nombre, , , , cobertura, op]) => ({
    codigo,
    nombre,
    existencias: op.stock ?? Math.round((tasa.get(claveCodigo(codigo)) || 0) * cobertura),
  }));
  const datos = {
    rotacion: calcularRotacion({ ventas, existencias }),
    series: seriesSemanales(ventas),
    catalogo: Object.fromEntries(sector.productos.map(([codigo, , prov, , costo]) => [claveCodigo(codigo), { costo, proveedor: sector.proveedores[prov].nombre }])),
    entregas: Object.fromEntries(sector.proveedores.map((p) => [p.nombre, p.entrega])),
    filasVenta: ventas.length,
    hasta,
  };
  for (const k of cache.keys()) if (!k.endsWith(`:${hasta}`)) cache.delete(k); // las de ayer ya no sirven
  cache.set(llave, datos);
  return datos;
}

/**
 * El inventario de ejemplo de un sector, con la misma forma que el de un usuario.
 * Las ventas llegan hasta ayer y las existencias son las de hoy. ajustes (opcional): los
 * tiempos de entrega que el visitante cambió en "Datos", para ver cómo cambia el pedido.
 */
function inventarioDemo(id, ajustes = null) {
  const sector = SECTORES[id];
  if (!sector) return null;
  const d = datosDelSector(id);
  const propios = ajustes && typeof ajustes === 'object' ? ajustes : {};
  return construirInventario({
    reporte: { ...d.rotacion, hojasUsadas: [] },
    series: d.series,
    catalogo: d.catalogo,
    ajustes: {
      entregas: { ...d.entregas, ...(propios.entregas || {}) },
      entregaPorDefecto: propios.entregaPorDefecto ?? 1,
      cadaCuanto: propios.cadaCuanto ?? 4,
    },
    fuente: {
      demo: id,
      empresa: sector.empresa,
      sector: sector.sector,
      ciudad: sector.ciudad,
      persona: sector.persona,
      resumen: sector.resumen,
      programa: sector.programa,
      archivos: sector.archivos,
      fecha: textoDia(d.hasta + 1),
      filasVenta: d.filasVenta,
    },
    sugerencias: true,
  });
}

function sectores() {
  return Object.entries(SECTORES).map(([id, s]) => ({ id, empresa: s.empresa, sector: s.sector, ciudad: s.ciudad, programa: s.programa, resumen: s.resumen, productos: s.productos.length }));
}

module.exports = { inventarioDemo, sectores, SECTORES };
