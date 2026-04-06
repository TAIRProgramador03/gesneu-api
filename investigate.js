const db = require("./config/db");
require('dotenv').config();
const BD_SCHEMA = process.env.DB_SCHEMA ?? 'SPEED400AT'

async function investigarProblema() {
    try {
        console.log('🔍 INVESTIGANDO PROBLEMA DE VISUALIZACIÓN - TDQ-854');
        console.log('='.repeat(60));

        // 1. Consultar tabla NEU_ASIGNADO (lo que ve el frontend)
        console.log('\n1️⃣ TABLA NEU_ASIGNADO (Frontend):');
        const consultaAsignado = `
            SELECT CODIGO, POSICION_NEU, TIPO_MOVIMIENTO, FECHA_MOVIMIENTO, FECHA_ASIGNACION
            FROM ${BD_SCHEMA}.NEU_ASIGNADO 
            WHERE PLACA = 'TDQ-854'
            ORDER BY POSICION_NEU
        `;
        const asignados = await db.query(consultaAsignado);
        asignados.forEach(neu => {
            console.log(`   ${neu.POSICION_NEU}: ${neu.CODIGO} | ${neu.TIPO_MOVIMIENTO} | ${neu.FECHA_MOVIMIENTO}`);
        });

        // 2. Consultar tabla NEU_MOVIMIENTO (último estado real)
        console.log('\n2️⃣ TABLA NEU_MOVIMIENTO (Últimos movimientos):');
        const consultaMovimientos = `
            SELECT CODIGO, POSICION_NEU, TIPO_MOVIMIENTO, FECHA_MOVIMIENTO
            FROM ${BD_SCHEMA}.NEU_MOVIMIENTO 
            WHERE PLACA = 'TDQ-854'
            AND ID_MOVIMIENTO IN (
                SELECT MAX(ID_MOVIMIENTO) 
                FROM ${BD_SCHEMA}.NEU_MOVIMIENTO 
                WHERE PLACA = 'TDQ-854' 
                GROUP BY CODIGO
            )
            ORDER BY CODIGO
        `;
        const movimientos = await db.query(consultaMovimientos);
        movimientos.forEach(mov => {
            console.log(`   ${mov.CODIGO}: ${mov.POSICION_NEU} | ${mov.TIPO_MOVIMIENTO} | ${mov.FECHA_MOVIMIENTO}`);
        });

        // 3. Comparar discrepancias
        console.log('\n3️⃣ ANÁLISIS DE DISCREPANCIAS:');

        // Crear mapas para comparar
        const mapaAsignados = {};
        asignados.forEach(neu => {
            mapaAsignados[neu.CODIGO] = {
                posicion: neu.POSICION_NEU,
                tipo: neu.TIPO_MOVIMIENTO,
                fecha: neu.FECHA_MOVIMIENTO
            };
        });

        const mapaMovimientos = {};
        movimientos.forEach(mov => {
            mapaMovimientos[mov.CODIGO] = {
                posicion: mov.POSICION_NEU,
                tipo: mov.TIPO_MOVIMIENTO,
                fecha: mov.FECHA_MOVIMIENTO
            };
        });

        // Encontrar discrepancias
        let discrepancias = 0;

        Object.keys(mapaMovimientos).forEach(codigo => {
            const movReal = mapaMovimientos[codigo];
            const asignado = mapaAsignados[codigo];

            if (!asignado) {
                console.log(`   ❌ FALTA EN NEU_ASIGNADO: ${codigo} debería estar en ${movReal.posicion} (${movReal.tipo})`);
                discrepancias++;
            } else if (asignado.posicion !== movReal.posicion) {
                console.log(`   ❌ POSICIÓN INCORRECTA: ${codigo}`);
                console.log(`      - NEU_ASIGNADO: ${asignado.posicion}`);
                console.log(`      - NEU_MOVIMIENTO: ${movReal.posicion}`);
                discrepancias++;
            }
        });

        // Buscar registros huérfanos en NEU_ASIGNADO
        Object.keys(mapaAsignados).forEach(codigo => {
            if (!mapaMovimientos[codigo]) {
                const asignado = mapaAsignados[codigo];
                console.log(`   ⚠️  HUÉRFANO EN NEU_ASIGNADO: ${codigo} en ${asignado.posicion} (sin movimiento reciente)`);
            }
        });

        if (discrepancias === 0) {
            console.log('   ✅ No se encontraron discrepancias obvias');
        } else {
            console.log(`   🚨 Se encontraron ${discrepancias} discrepancias`);
        }

        // 4. Verificar específicamente POS02
        console.log('\n4️⃣ ANÁLISIS ESPECÍFICO DE POS02:');

        const enPOS02Asignado = asignados.find(n => n.POSICION_NEU === 'POS02');
        const paraPos02Movimiento = movimientos.find(m => m.POSICION_NEU === 'POS02');

        if (enPOS02Asignado) {
            console.log(`   NEU_ASIGNADO en POS02: ${enPOS02Asignado.CODIGO} (${enPOS02Asignado.TIPO_MOVIMIENTO})`);
        } else {
            console.log('   NEU_ASIGNADO en POS02: VACÍA');
        }

        if (paraPos02Movimiento) {
            console.log(`   NEU_MOVIMIENTO para POS02: ${paraPos02Movimiento.CODIGO} (${paraPos02Movimiento.TIPO_MOVIMIENTO})`);
        } else {
            console.log('   NEU_MOVIMIENTO para POS02: VACÍA');
        }

        console.log('\n' + '='.repeat(60));
        console.log('✅ INVESTIGACIÓN COMPLETADA');

    } catch (error) {
        console.error('❌ Error durante la investigación:', error);
    } finally {
        process.exit(0);
    }
}

// Conectar y ejecutar
db.connect().then(() => {
    console.log('✅ Conectado a la base de datos');
    investigarProblema();
}).catch((error) => {
    console.error('❌ Error de conexión:', error);
    process.exit(1);
});