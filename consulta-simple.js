const db = require('./config/db');

async function verificarPositions() {
  try {
    console.log('📊 Conectando a la base de datos...\n');
    await db.connect();
    
    // 1. Ver cuántos registros hay de cada neumático
    console.log('=== CONTEO DE REGISTROS ===');
    
    const count19 = await db.query("SELECT COUNT(*) as total FROM PO_MOVIMIENTO WHERE CODIGO = '3000019'");
    console.log(`3000019: ${count19[0].total} registros total`);
    
    const count21 = await db.query("SELECT COUNT(*) as total FROM PO_MOVIMIENTO WHERE CODIGO = '3000021'");
    console.log(`3000021: ${count21[0].total} registros total\n`);
    
    // 2. Ver el último registro de cada uno
    console.log('=== ÚLTIMO MOVIMIENTO DE CADA NEUMÁTICO ===');
    
    const ultimo19 = await db.query(
      "SELECT TOP 1 CODIGO, POSICION_INICIAL, POSICION_FIN, FECHA_MOVIMIENTO FROM PO_MOVIMIENTO WHERE CODIGO = '3000019' ORDER BY ID_MOVIMIENTO DESC"
    );
    
    if (ultimo19.length > 0) {
      const fecha = new Date(ultimo19[0].FECHA_MOVIMIENTO).toLocaleString();
      console.log(`3000019: ${ultimo19[0].POSICION_INICIAL} → ${ultimo19[0].POSICION_FIN} (${fecha})`);
    } else {
      console.log('3000019: No hay registros');
    }
    
    const ultimo21 = await db.query(
      "SELECT TOP 1 CODIGO, POSICION_INICIAL, POSICION_FIN, FECHA_MOVIMIENTO FROM PO_MOVIMIENTO WHERE CODIGO = '3000021' ORDER BY ID_MOVIMIENTO DESC"
    );
    
    if (ultimo21.length > 0) {
      const fecha = new Date(ultimo21[0].FECHA_MOVIMIENTO).toLocaleString();
      console.log(`3000021: ${ultimo21[0].POSICION_INICIAL} → ${ultimo21[0].POSICION_FIN} (${fecha})`);
    } else {
      console.log('3000021: No hay registros');
    }
    
    console.log('\n=== POSICIONES FINALES ===');
    if (ultimo19.length > 0) {
      console.log(`🔴 3000019 está ahora en: ${ultimo19[0].POSICION_FIN}`);
    }
    if (ultimo21.length > 0) {
      console.log(`🔵 3000021 está ahora en: ${ultimo21[0].POSICION_FIN}`);
    }
    
    await db.close();
    console.log('\n✅ Consulta completada');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
  }
}

// Ejecutar
verificarPositions();