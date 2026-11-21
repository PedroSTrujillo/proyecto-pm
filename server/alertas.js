'use strict';

// Qué secciones lleva el boletín diario de cada persona y con qué frecuencia (SP7 de
// docs/PLAN_ALPHA_02.md, Hito 6). Sin base de datos: lo usan server/cuentas.js (Mi cuenta) y
// server/boletin.js (el envío), y se prueba en test/alertas.test.js.
//
// El único canal es el boletín diario por correo: no hay avisos inmediatos ni otra tarea
// programada. usuarios.boletin sigue siendo el interruptor general; esto solo afina qué secciones
// lleva el correo. Lo que la persona no cambió sigue los valores de su perfil, así que si cambia de
// analista a operador, cambia también lo que no tocó.

const TIPOS = ['pideYa', 'seAgota', 'enCero', 'porAprobar', 'dineroQuieto', 'sobran', 'sinDatos'];
const FRECUENCIAS = ['diario', 'semanal', 'mensual', 'nunca'];

// Decisión del equipo (2026-10-29). El operador recibe a diario lo que tiene que hacer en la bodega
// y nada de dinero; el analista recibe lo urgente a diario y el resto como resumen.
const POR_PERFIL = {
  analista: { pideYa: 'diario', seAgota: 'diario', enCero: 'semanal', porAprobar: 'diario', dineroQuieto: 'semanal', sobran: 'mensual', sinDatos: 'semanal' },
  operador: { pideYa: 'diario', seAgota: 'diario', enCero: 'diario', porAprobar: 'diario', dineroQuieto: 'nunca', sobran: 'nunca', sinDatos: 'diario' },
};

// Hace más de esto (en días hábiles) que no entra ningún movimiento ni archivo: sección sinDatos.
const DIAS_SIN_DATOS = 3;

const MS_DIA = 86400000;
const aDia = (fecha) => Math.floor(Date.parse(`${fecha}T12:00:00Z`) / MS_DIA);
const deDia = (n) => new Date(n * MS_DIA).toISOString().slice(0, 10);
const diaSemana = (fecha) => new Date(`${fecha}T12:00:00Z`).getUTCDay();
const esHabil = (fecha) => diaSemana(fecha) !== 0 && diaSemana(fecha) !== 6;

// Lo que la persona eligió, sin lo que no es un tipo o una frecuencia conocidos.
function limpiarAlertas(a) {
  const out = {};
  if (!a || typeof a !== 'object') return out;
  for (const t of TIPOS) if (FRECUENCIAS.includes(a[t])) out[t] = a[t];
  return out;
}

// La tabla completa: lo elegido encima de los valores del perfil.
function alertasDe(preferencias, perfil) {
  const propias = limpiarAlertas(preferencias && preferencias.alertas);
  const tabla = { ...(POR_PERFIL[perfil] || POR_PERFIL.analista), ...propias };
  // El operador no recibe dinero ni sobrestock, aunque lo haya pedido (T4).
  if (perfil === 'operador') tabla.dineroQuieto = tabla.sobran = 'nunca';
  return tabla;
}

// El primer día de lunes a viernes del mes. Los festivos no cuentan (decisión del equipo).
function primerHabilDelMes(fecha) {
  let d = aDia(`${fecha.slice(0, 7)}-01`);
  while (!esHabil(deDia(d))) d++;
  return deDia(d);
}

// ¿Esta frecuencia sale hoy? Semanal: los lunes. Mensual: el primer día hábil del mes. Si el Cron
// falla ese día, la alerta espera a su siguiente turno (no se recupera al día siguiente).
function tocaHoy(frecuencia, hoy) {
  if (frecuencia === 'diario') return true;
  if (frecuencia === 'semanal') return diaSemana(hoy) === 1;
  if (frecuencia === 'mensual') return primerHabilDelMes(hoy) === hoy;
  return false;
}

// Días de lunes a viernes después de `desde` y hasta `hasta` (incluido): de un viernes al lunes, 1.
function habilesEntre(desde, hasta) {
  let n = 0;
  for (let d = aDia(desde) + 1; d <= aDia(hasta); d++) if (esHabil(deDia(d))) n++;
  return n;
}

/**
 * Los tipos que van hoy en el boletín de esta persona.
 * usuario: { perfil, preferencias, aprueba, admin }.
 * porAprobar solo a quien aprueba (y nunca a un operador, que no abre los pedidos). sinDatos le llega
 * a todos los roles: el administrador mantiene los datos y el operador registra los movimientos.
 */
function tiposDeHoy(usuario, hoy) {
  const alertas = alertasDe(usuario.preferencias, usuario.perfil);
  return TIPOS.filter((t) => {
    if (t === 'porAprobar' && (!usuario.aprueba || usuario.perfil === 'operador')) return false;
    return tocaHoy(alertas[t], hoy);
  });
}

module.exports = { TIPOS, FRECUENCIAS, POR_PERFIL, DIAS_SIN_DATOS, limpiarAlertas, alertasDe, tocaHoy, primerHabilDelMes, habilesEntre, tiposDeHoy };
