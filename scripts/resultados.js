'use strict';

// Resultados de la prueba para el equipo, desde la terminal. La aplicación no los muestra: es un
// producto para el usuario y no tiene pantallas con datos de otras cuentas (server/equipo.js).
//
//   npm run resultados                                  veredicto, cada probador y sus respuestas
//   npm run resultados -- --piloto                      el piloto de Alpha 0.2: aceptación, satisfacción y uso
//   npm run resultados -- --json                        todo, en JSON (la prueba de Alpha 0.1 y el piloto)
//   npm run resultados -- --encuesta abrir [--email x]  la encuesta de satisfacción aparece a todos (o a uno)
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

const TITULOS_PILOTO = {
  meta_cumplida: 'Se cumplió la meta',
  meta_no_cumplida: 'No se cumplió la meta',
  en_curso: 'Todavía no hay resultado',
};
const CATEGORIAS_PILOTO = {
  cumple: 'cumple',
  en_curso: 'en curso',
  incompleto: 'terminó sin aceptación o sin encuesta',
  no_cumple: 'no cumple',
  sin_pedido: 'sin pedido desde lo sugerido',
};
const pct = (x) => (x === null || x === undefined ? '—' : `${Math.round(x * 100)} %`);

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

function imprimirPiloto({ resumen: r, usuarios, generadoEn }) {
  const g = r.reglas;
  console.log(`Piloto de Alpha 0.2 · ${new Date(generadoEn).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}`);
  console.log(`Meta (provisional): ${g.metaUsuarios} de ${g.total} califican ${g.metaSatisfaccion} o más sobre 5 y aceptan sin cambios el ${pct(g.metaAceptacion)} de las líneas sugeridas, en ${g.dias} días.\n`);
  console.log(`Veredicto: ${TITULOS_PILOTO[r.veredicto]}`);
  console.log(`  Cumplen: ${r.cumplen} de ${r.usuarios} en el piloto · ventana cerrada: ${r.terminaron}`);
  console.log(`  Aceptación de todas las líneas: ${pct(r.aceptacion)} · satisfacción promedio: ${r.satisfaccionPromedio === null ? '—' : r.satisfaccionPromedio.toFixed(1)} · uso promedio: ${pct(r.usoPromedio)} de los días hábiles\n`);
  for (const u of usuarios) {
    const p = u.piloto;
    if (p.categoria === 'sin_pedido' && !u.comentarios.length) continue;
    console.log(`${u.nombre} <${u.email}>${u.empresa ? ` · ${u.empresa}` : ''} · ${CATEGORIAS_PILOTO[p.categoria]}`);
    if (p.inicio) console.log(`  Sus ${g.dias} días: ${dia(p.inicio)} – ${dia(p.fin)} · aceptación ${pct(p.aceptacion)} (${p.sinCambio} de ${p.sugeridas} en ${p.pedidos} pedidos) · satisfacción ${p.satisfaccion ?? '—'} · uso ${pct(p.uso)} (${p.diasConMovimientos} de ${p.diasHabiles} días hábiles)`);
    for (const c of u.comentarios) console.log(`  Encuesta (${c.puntaje}): "${c.comentario.replace(/\s+/g, ' ')}"`);
    for (const x of u.pedidos) {
      const estado = x.borrado ? 'borrado' : x.anulado ? 'anulado' : x.terminadoEn ? `cerrado el ${dia(x.terminadoEn)}` : 'abierto';
      const a = x.aceptacion ? ` · ${x.aceptacion.sinCambio} de ${x.aceptacion.sugeridas} sin cambio, ${x.aceptacion.ajustadas} ajustadas, ${x.aceptacion.quitadas} quitadas, ${x.aceptacion.agregadas} agregadas` : '';
      const o = x.ocurrido && x.ocurrido.estado === 'medido'
        ? ` · lo vendido cayó en el rango en ${x.ocurrido.dentro} de ${x.ocurrido.productos} (debajo ${x.ocurrido.debajo}, encima ${x.ocurrido.encima})`
        : x.ocurrido && x.ocurrido.estado === 'pendiente' ? ' · todavía no pasa el tiempo que cubría' : '';
      console.log(`  #${x.id} ${estado}${a}${o}`);
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
  } else if ((v = opcion('--encuesta'))) {
    if (v[0] !== 'abrir') throw new Error('Uso: npm run resultados -- --encuesta abrir [--email correo]');
    const email = opcion('--email') ? opcion('--email')[0] : null;
    const n = await equipo.abrirEncuesta(email);
    console.log(email ? `La encuesta le aparece a ${email} la próxima vez que entre.` : `La encuesta les aparece a ${n} usuarios la próxima vez que entren.`);
  } else if (opcion('--piloto')) {
    imprimirPiloto(await equipo.piloto());
  } else if (opcion('--errores')) {
    const lista = await equipo.erroresRecientes();
    if (!lista.length) console.log('No hay errores registrados.');
    for (const e of lista) console.log(`${new Date(e.en).toISOString()} · ${e.origen} · ${e.email || 'sin sesión'} · ${e.ruta || ''}\n  ${e.mensaje}`);
  } else {
    const r = await equipo.resultados();
    if (opcion('--json')) console.log(JSON.stringify({ ...r, piloto: await equipo.piloto() }, null, 2));
    else imprimir(r);
  }
  await db.cerrar();
}

main().catch(async (e) => {
  console.error(e.estado ? e.message : e);
  await db.cerrar().catch(() => {});
  process.exit(1);
});
