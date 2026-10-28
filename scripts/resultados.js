'use strict';

// Resultados de la prueba para el equipo, desde la terminal. La aplicación no los muestra: es un
// producto para el usuario y no tiene pantallas con datos de otras cuentas (server/equipo.js).
//
//   npm run resultados                                  veredicto, cada probador y sus respuestas
//   npm run resultados -- --json                        todo, en JSON (para guardarlo o analizarlo)
//   npm run resultados -- --errores                     los últimos errores que vio alguien
//   npm run resultados -- --clasificar 12 dato          el "¿por qué?" del pedido 12: dato | probar | ninguna
//   npm run resultados -- --anular 12 "No era un pedido"
//   npm run resultados -- --reactivar 12
//   npm run resultados -- --equipo correo@x.co          esa cuenta pasa a ser del equipo
//   npm run resultados -- --restablecer correo@x.co     enlace para poner una contraseña nueva (24 horas)
//
// Con DATABASE_URL lee la base de Neon; sin ella, la local (PGlite en data/pglite/).

const db = require('../server/db');
const equipo = require('../server/equipo');

const TITULOS = {
  meta_cumplida: 'Se cumplió la meta',
  pivotar: 'Pivotar',
  meta_no_cumplida: 'No se cumplió la meta',
  en_curso: 'Todavía no hay resultado',
};
const CATEGORIAS = {
  cumple: 'cumple',
  intermedio: 'intermedio',
  no_cambia: 'no cambia (pivote)',
  por_probar: 'por probar (pivote)',
  sin_pedido: 'sin lista final en sus 14 días',
};

const dia = (f) => (f ? new Date(f).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short' }) : '—');

function imprimir({ resumen: r, usuarios, generadoEn }) {
  const g = r.reglas;
  console.log(`Resultados de la prueba · ${new Date(generadoEn).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}`);
  console.log(`Meta: ${g.metaUsuarios} de ${r.usuariosEsperados} cambian ${g.metaLineas} o más líneas en ${g.diasPrueba} días. Pivote: ${g.pivoteUsuarios} o más cambian ${g.pivoteLineas} o menos, o cambian por probar.\n`);
  console.log(`Veredicto: ${TITULOS[r.veredicto]}`);
  console.log(`  Cumplen: ${r.cumplen} de ${r.usuarios} (reales ${r.cumplenReal}, simulados ${r.cumplenSimulado}; en la dirección del reporte ${r.cumplenCoherentes})`);
  console.log(`  No cambian: ${r.noCambian} · por probar: ${r.porProbar} · intermedios: ${r.intermedios} · sin pedido: ${r.sinPedido}`);
  if (r.cumplenSinClasificar) console.log(`  Falta clasificar el "¿por qué?" de ${r.cumplenSinClasificar} que cumplen.`);
  console.log(`  Recordatorio: lo pidieron ${r.aceptaronRecordatorio}, ya les llegó a ${r.conRecordatorioVencido}, volvieron ${r.volvieronTrasRecordatorio}.\n`);

  for (const u of usuarios) {
    const e = u.evaluacion;
    console.log(`${u.nombre} <${u.email}>${u.empresa.nombre ? ` · ${u.empresa.nombre}` : ''} · ${CATEGORIAS[e.categoria]}`);
    if (e.inicio) console.log(`  Sus 14 días: ${dia(e.inicio)} – ${dia(e.fin)} · ingresos ${u.ingresos} · días con actividad ${u.diasConActividad}`);
    for (const p of u.pedidos) {
      const estado = p.borrado ? 'borrado sin terminar' : p.anulado ? `anulado (${p.anulado.motivo || 'sin motivo'})` : `paso ${p.paso}`;
      const lineas = p.conteo ? `${p.conteo.total} líneas cambiadas` : 'sin lista final';
      const marca = e.mejor && e.mejor.id === p.id ? ' ← cuenta' : '';
      console.log(`  #${p.id} ${p.tipo} · ${estado} · ${lineas}${p.coherencia && p.coherencia.porcentaje !== null ? ` · ${Math.round(p.coherencia.porcentaje * 100)}% en la dirección del reporte` : ''}${marca}`);
      if (p.porQue) console.log(`      ¿Por qué?: "${p.porQue.replace(/\s+/g, ' ')}"${p.clasificacion ? ` [${p.clasificacion}]` : ' [sin clasificar]'}`);
    }
    console.log('');
  }
}

async function main() {
  const args = process.argv.slice(2);
  const opcion = (nombre) => {
    const i = args.indexOf(nombre);
    return i === -1 ? undefined : args.slice(i + 1);
  };
  await db.iniciar();
  console.error(`Base de datos: ${db.nombreMotor()}`);

  let v;
  if ((v = opcion('--clasificar'))) {
    const valor = v[1] === 'ninguna' ? null : v[1];
    const r = await equipo.clasificar(v[0], valor);
    console.log(`Pedido #${r.id}: ${r.valor || 'sin clasificar'}.`);
  } else if ((v = opcion('--anular'))) {
    await equipo.anular(v[0], v[1]);
    console.log(`Pedido #${v[0]} anulado: deja de contar en el veredicto.`);
  } else if ((v = opcion('--reactivar'))) {
    await equipo.reactivar(v[0]);
    console.log(`Pedido #${v[0]} reactivado.`);
  } else if ((v = opcion('--equipo'))) {
    const u = await equipo.marcarEquipo(v[0]);
    console.log(`${u.email} ahora es del equipo y no cuenta como probador.`);
  } else if ((v = opcion('--restablecer'))) {
    const r = await equipo.enlaceRestablecer(v[0]);
    console.log(`Enlace para ${v[0]} (sirve una vez, ${r.horas} horas):\n${r.enlace}`);
  } else if (opcion('--errores')) {
    const lista = await equipo.erroresRecientes();
    if (!lista.length) console.log('No hay errores registrados.');
    for (const e of lista) console.log(`${new Date(e.en).toISOString()} · ${e.origen} · ${e.email || 'sin sesión'} · ${e.ruta || ''}\n  ${e.mensaje}`);
  } else {
    const r = await equipo.resultados();
    if (opcion('--json')) console.log(JSON.stringify(r, null, 2));
    else imprimir(r);
  }
  await db.cerrar();
}

main().catch(async (e) => {
  console.error(e.estado ? e.message : e);
  await db.cerrar().catch(() => {});
  process.exit(1);
});
