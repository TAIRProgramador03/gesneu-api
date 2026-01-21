const db = require('./config/db');

async function consultarBD() {
  try {
    console.log('Conectando a la base de datos...\n');
    await db.connect();
    
    console.log('=== VERIFICACIÓN DE POSICIONES EN BD ===\n');
    
    // Primero, verificar si existen los registros
    const existe3000019 = await db.query("SELECT COUNT(*) as total FROM PO_MOVIMIENTO WHERE CODIGO = '3000019'");
    const existe3000021 = await db.query("SELECT COUNT(*) as total FROM PO_MOVIMIENTO WHERE CODIGO = '3000021'");
    
    console.log(`📍 Movimientos en BD:`);
    console.log(`   3000019: ${existe3000019[0].total} registros`);
    console.log(`   3000021: ${existe3000021[0].total} registros\n`);
    
    // Consultar últimos movimientos de cada uno por separado
    const ultimos3000019 = await db.query("SELECT TOP 3 * FROM PO_MOVIMIENTO WHERE CODIGO = '3000019' ORDER BY ID_MOVIMIENTO DESC");
    const ultimos3000021 = await db.query("SELECT TOP 3 * FROM PO_MOVIMIENTO WHERE CODIGO = '3000021' ORDER BY ID_MOVIMIENTO DESC");
    
    console.log('📋 Últimos movimientos (más recientes primero):');
    console.log('─'.repeat(80));
    ultimosMovimientos.forEach((mov, i) => {
      const fecha = mov.FECHA_MOVIMIENTO.toISOString().slice(0,16).replace('T', ' ');
      console.log(`${i+1}. ${mov.CODIGO}: ${mov.POSICION_INICIAL} → ${mov.POSICION_FIN} (${fecha}) ID:${mov.ID_MOVIMIENTO}`);
    });
    
    // Consultar posiciones actuales de cada neumático
    const posicion3000019 = await db.query(
      "SELECT TOP 1 CODIGO, POSICION_FIN, FECHA_MOVIMIENTO, ID_MOVIMIENTO FROM PO_MOVIMIENTO WHERE CODIGO = '3000019' ORDER BY FECHA_MOVIMIENTO DESC, ID_MOVIMIENTO DESC"
    );
    
    const posicion3000021 = await db.query(
      "SELECT TOP 1 CODIGO, POSICION_FIN, FECHA_MOVIMIENTO, ID_MOVIMIENTO FROM PO_MOVIMIENTO WHERE CODIGO = '3000021' ORDER BY FECHA_MOVIMIENTO DESC, ID_MOVIMIENTO DESC"
    );
    
    const posicionesActuales = [...posicion3000019, ...posicion3000021];
    
    console.log('\n🎯 POSICIONES ACTUALES EN BD:');
    console.log('─'.repeat(40));
    posicionesActuales.forEach(pos => {
      const fecha = pos.FECHA_MOVIMIENTO.toISOString().slice(0,16).replace('T', ' ');
      console.log(`   ${pos.CODIGO}: ${pos.POSICION_ACTUAL} (${fecha})`);
    });
    
    // Contar movimientos de hoy para cada neumático
    const movimientos3000019Hoy = await db.query(
      "SELECT COUNT(*) as total FROM PO_MOVIMIENTO WHERE CODIGO = '3000019' AND CAST(FECHA_MOVIMIENTO AS DATE) = CAST(GETDATE() AS DATE)"
    );
    
    const movimientos3000021Hoy = await db.query(
      "SELECT COUNT(*) as total FROM PO_MOVIMIENTO WHERE CODIGO = '3000021' AND CAST(FECHA_MOVIMIENTO AS DATE) = CAST(GETDATE() AS DATE)"
    );
    
    console.log('\n📊 MOVIMIENTOS DE HOY:');
    console.log('─'.repeat(30));
    console.log(`   3000019: ${movimientos3000019Hoy[0].total} movimientos`);
    console.log(`   3000021: ${movimientos3000021Hoy[0].total} movimientos`);
    
    console.log('\n✅ Consulta completada');
    
  } catch (error) {
    console.error('❌ Error consultando BD:', error.message);
  } finally {
    process.exit(0);
  }
}

consultarBD();