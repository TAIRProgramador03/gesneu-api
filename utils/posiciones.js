/**
 * Reglas sobre los códigos de posición de un vehículo (POS01..POSnn, RES01, RES02).
 *
 * Existe para que "¿esta posición es un repuesto?" se conteste en un solo lugar.
 * Antes estaba escrito como `posicion === 'RES01'` repartido por los servicios y los
 * modales: ese literal quería decir "es repuesto", no "es el repuesto número uno".
 * Al aparecer el RES02 (camioneta de 6, segundo repuesto opcional) la diferencia pasó
 * a importar — con el literal, el segundo repuesto sumaba kilometraje y se le exigía
 * gastarse entre inspecciones, como si rodara.
 *
 * El equivalente del frontend está en src/utils/configuraciones-neumaticos.ts; los dos
 * tienen que aplicar la misma regla.
 */

/** Si una posición es de repuesto, mirando sólo su código. */
function esPosicionRepuesto(posicion) {
  if (!posicion) return false;
  return /^RES\d+$/i.test(String(posicion).trim());
}

module.exports = { esPosicionRepuesto };
