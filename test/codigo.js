'use strict';

// Ayudante de las pruebas: crear una cuenta pide un código de acceso de un solo uso (T10).
const { crearCodigos } = require('../server/cuentas-equipo');

async function conCodigo(cuerpo) {
  const [codigo] = await crearCodigos(1, 'prueba', null);
  return { ...cuerpo, codigo };
}

module.exports = { conCodigo };
