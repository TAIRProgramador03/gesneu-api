const db = require('./config/db');
require('dotenv').config();
const BD_SCHEMA = process.env.DB_SCHEMA ?? 'SPEED400AT'

async function verificarNeuMovimiento() {
  try {
    console.log('📊 Verificando tabla NEU_MOVIMIENTO...\n');
    await db.connect();

    // 1. Ver cuántos registros hay de cada neumático en NEU_MOVIMIENTO
    console.log('=== CONTEO EN NEU_MOVIMIENTO ===');

    const count19 = await db.query(`SELECT COUNT(*) as total FROM ${BD_SCHEMA}.NEU_MOVIMIENTO WHERE CODIGO = '3000019'`);
    console.log(`3000019: ${count19[0].total} registros total`);

    const count21 = await db.query(`SELECT COUNT(*) as total FROM ${BD_SCHEMA}.NEU_MOVIMIENTO WHERE CODIGO = '3000021'`);
    console.log(`3000021: ${count21[0].total} registros total\n`);

    // 2. Ver el último registro de cada uno
    console.log('=== ÚLTIMO MOVIMIENTO DE CADA NEUMÁTICO ===');

    const ultimo19 = await db.query(
      `SELECT TOP 1 CODIGO, POSICION_NEU, TIPO_MOVIMIENTO, FECHA_MOVIMIENTO FROM ${BD_SCHEMA}.NEU_MOVIMIENTO WHERE CODIGO = '3000019' ORDER BY ID_MOVIMIENTO DESC`
    );

    if (ultimo19.length > 0) {
      const fecha = new Date(ultimo19[0].FECHA_MOVIMIENTO).toLocaleString();
      console.log(`3000019: Posición ${ultimo19[0].POSICION_NEU} (${ultimo19[0].TIPO_MOVIMIENTO}) - ${fecha}`);
    } else {
      console.log('3000019: No hay registros');
    }

    const ultimo21 = await db.query(
      `SELECT TOP 1 CODIGO, POSICION_NEU, TIPO_MOVIMIENTO, FECHA_MOVIMIENTO FROM ${BD_SCHEMA}.NEU_MOVIMIENTO WHERE CODIGO = '3000021' ORDER BY ID_MOVIMIENTO DESC`
    );

    if (ultimo21.length > 0) {
      const fecha = new Date(ultimo21[0].FECHA_MOVIMIENTO).toLocaleString();
      console.log(`3000021: Posición ${ultimo21[0].POSICION_NEU} (${ultimo21[0].TIPO_MOVIMIENTO}) - ${fecha}`);
    } else {
      console.log('3000021: No hay registros');
    }

    // 3. Ver movimientos recientes de hoy
    console.log('\n=== MOVIMIENTOS DE HOY ===');
    const movimientosHoy = await db.query(`
      SELECT CODIGO, POSICION_NEU, TIPO_MOVIMIENTO, FECHA_MOVIMIENTO 
      FROM ${BD_SCHEMA}.NEU_MOVIMIENTO 
      WHERE CODIGO IN ('3000019', '3000021') 
      AND CAST(FECHA_MOVIMIENTO AS DATE) = CAST(GETDATE() AS DATE)
      ORDER BY FECHA_MOVIMIENTO DESC
    `);

    if (movimientosHoy.length > 0) {
      movimientosHoy.forEach((mov, i) => {
        const fecha = new Date(mov.FECHA_MOVIMIENTO).toLocaleString();
        console.log(`${i + 1}. ${mov.CODIGO}: ${mov.POSICION_NEU} (${mov.TIPO_MOVIMIENTO}) - ${fecha}`);
      });
    } else {
      console.log('No hay movimientos de hoy para estos neumáticos');
    }

    console.log('\n=== RESUMEN FINAL ===');
    if (ultimo19.length > 0) {
      console.log(`🔴 3000019 está ahora en: ${ultimo19[0].POSICION_NEU}`);
    }
    if (ultimo21.length > 0) {
      console.log(`🔵 3000021 está ahora en: ${ultimo21[0].POSICION_NEU}`);
    }

    await db.close();
    console.log('\n✅ Verificación completada');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Ejecutar
verificarNeuMovimiento();