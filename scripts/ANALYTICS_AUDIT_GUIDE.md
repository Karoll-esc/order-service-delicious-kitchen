# 🔍 Guía de Auditoría de Analytics

## HU-022: Validar y Corregir Datos en Reportes de Analytics

Este documento describe cómo utilizar el sistema de auditoría y validación de analytics implementado para garantizar que los reportes sean precisos y consistentes con la base de datos real.

---

## 📋 Tabla de Contenidos

1. [Script de Auditoría Manual](#script-de-auditoría-manual)
2. [Servicio de Validación Automática](#servicio-de-validación-automática)
3. [Interpretación de Resultados](#interpretación-de-resultados)
4. [Casos de Prueba Cubiertos](#casos-de-prueba-cubiertos)
5. [Integración con CI/CD](#integración-con-cicd)
6. [Troubleshooting](#troubleshooting)

---

## Script de Auditoría Manual

### auditAnalyticsQueries.ts

**Ubicación:** `scripts/auditAnalyticsQueries.ts`

**Propósito:** Comparar reportes de analytics con queries directas a MongoDB para identificar inconsistencias.

### Uso Básico

```bash
# Auditar últimos 30 días (por defecto)
npm run audit:analytics

# Auditar rango específico de fechas
npm run audit:analytics -- --from=2024-01-01 --to=2024-12-31

# Con ts-node directamente
npx ts-node scripts/auditAnalyticsQueries.ts -- --from=2024-11-01 --to=2024-11-30
```

### Configuración

Agregar a `package.json`:

```json
{
  "scripts": {
    "audit:analytics": "ts-node scripts/auditAnalyticsQueries.ts"
  }
}
```

Variables de entorno requeridas:

```bash
MONGO_URI=mongodb://localhost:27017/delicious-kitchen-order
```

### Verificaciones Realizadas

| Verificación | Descripción | Caso de Prueba |
|--------------|-------------|----------------|
| **Total Órdenes Completadas** | Compara conteo de órdenes con status `completed` o `delivered` | TC-022-P02 |
| **Cancelados NO en Completados** | Verifica que pedidos cancelados estén separados | TC-022-N01 |
| **Total Órdenes Canceladas** | Valida conteo de órdenes canceladas | TC-022-P02 |
| **Consistencia OrderCancellation** | Cruza con tabla de cancelaciones | TC-022-B01 |
| **Ingresos Totales** | Valida cálculo de revenue con tolerancia 1% | TC-022-P02 |
| **Ingresos Perdidos** | Valida revenue de pedidos cancelados | TC-022-P02 |
| **Estados Válidos** | Detecta estados inválidos en BD | TC-022-B01 |
| **Precisión Filtros de Fecha** | Verifica que filtros funcionen correctamente | TC-022-P02 |

### Ejemplo de Salida

```
🔍 Iniciando auditoría de analytics...

📅 Rango: 2024-01-01 → 2024-12-31

================================================================================
📊 REPORTE DE AUDITORÍA DE ANALYTICS
================================================================================

✅ Total Órdenes Completadas
   Esperado: 150
   Obtenido: 150

✅ Cancelados NO incluidos en Completados
   Esperado: 170
   Obtenido: 170

✅ Total Órdenes Canceladas
   Esperado: 20
   Obtenido: 20

⚠️ Consistencia con OrderCancellation
   Esperado: 20
   Obtenido: 19
   Discrepancia: Discrepancia de 1 registros (tolerancia: 1)

❌ Ingresos Totales (Revenue)
   Esperado: 125000.50
   Obtenido: 123500.00
   Discrepancia: Diferencia de $1500.50 (tolerancia: $1250.00)

✅ Ingresos Perdidos
   Esperado: 5000.00
   Obtenido: 5000.00

✅ Estados de órdenes válidos
   Esperado: 0
   Obtenido: 0

✅ Filtros de fecha precisos
   Esperado: 170 dentro del rango
   Obtenido: 170 dentro, 45 antes, 23 después

================================================================================
📈 Resumen: 6/8 verificaciones exitosas
❌ Fallos críticos: 1
⚠️ Advertencias: 1
================================================================================

🚨 ALERTA: Se detectaron inconsistencias críticas.
   Acción requerida: Revisar queries de analytics y datos de BD.
```

### Exit Codes

- `0`: Todas las verificaciones pasaron exitosamente
- `1`: Se detectaron fallos críticos

---

## Servicio de Validación Automática

### AnalyticsValidationService

**Ubicación:** `src/services/AnalyticsValidationService.ts`

**Propósito:** Validación programática de consistencia para integrar en flujos automáticos.

### Endpoint API

```
POST /internal/analytics/validate
```

**Request Body:**

```json
{
  "from": "2024-01-01",
  "to": "2024-12-31",
  "groupBy": "month",
  "top": 10
}
```

**Response (Éxito):**

```json
{
  "success": true,
  "message": "Validación exitosa: Los reportes coinciden con la base de datos",
  "validation": {
    "isValid": true,
    "discrepancies": [],
    "timestamp": "2024-12-17T10:30:00.000Z"
  }
}
```

**Response (Con Discrepancias):**

```json
{
  "success": false,
  "message": "Validación completada: Se detectaron discrepancias",
  "validation": {
    "isValid": false,
    "discrepancies": [
      {
        "metric": "Total Órdenes Completadas",
        "reportedValue": 148,
        "actualValue": 150,
        "discrepancyPercentage": 1.33,
        "severity": "HIGH"
      },
      {
        "metric": "Ingresos Totales",
        "reportedValue": 123500.0,
        "actualValue": 125000.5,
        "discrepancyPercentage": 1.2,
        "severity": "HIGH"
      }
    ],
    "timestamp": "2024-12-17T10:30:00.000Z"
  }
}
```

### Uso Programático

```typescript
import { AnalyticsValidationService } from './services/AnalyticsValidationService';
import { Order } from './models/Order';
import { AnalyticsRepository } from './repositories/AnalyticsRepository';

// Configurar servicio
const repository = new AnalyticsRepository(Order);
const validationService = new AnalyticsValidationService(Order, repository);

// Ejecutar validación
const result = await validationService.validateAnalyticsConsistency({
  from: '2024-01-01',
  to: '2024-12-31',
  groupBy: 'month',
  top: 10
});

if (!result.isValid) {
  console.error('Discrepancias detectadas:', result.discrepancies);
  // Enviar alerta, crear ticket, etc.
}
```

### Validación Programada (Cron Job)

```typescript
// En app.ts o en worker separado
import { schedule } from 'node-cron';

// Ejecutar auditoría todos los días a las 2 AM
schedule('0 2 * * *', async () => {
  console.log('Ejecutando auditoría programada de analytics...');
  await validationService.runScheduledValidation();
});
```

---

## Interpretación de Resultados

### Niveles de Severidad

| Severidad | Descripción | Umbral | Acción Requerida |
|-----------|-------------|--------|------------------|
| **LOW** | Discrepancia < 0.5% | Mínima | Monitorear |
| **MEDIUM** | 0.5% ≤ discrepancia < 1% | Baja | Revisar en próxima auditoría |
| **HIGH** | 1% ≤ discrepancia < 5% | Moderada | Investigar y corregir |
| **CRITICAL** | Discrepancia ≥ 5% | Alta | **Acción inmediata requerida** |

### Umbrales de Tolerancia

- **Porcentaje:** 1% (configurable en `AnalyticsValidationService`)
- **Valores absolutos:** Calculados dinámicamente según el valor esperado

**Ejemplo:**
- Si `totalRevenue = $100,000`, tolerancia = $1,000
- Discrepancia de $500 → **PASS** ✅
- Discrepancia de $1,500 → **FAIL** ❌

### Estados de Verificación

| Estado | Icono | Significado |
|--------|-------|-------------|
| PASS | ✅ | Valores coinciden exactamente o están dentro de tolerancia |
| WARNING | ⚠️ | Discrepancia menor detectada, no crítica |
| FAIL | ❌ | Discrepancia crítica que requiere corrección |

---

## Casos de Prueba Cubiertos

### TC-022-P01: Auditoría identifica inconsistencias

✅ **Implementado en:** `auditAnalyticsQueries.ts`

**Pasos:**
1. Ejecutar `npm run audit:analytics`
2. Script compara reportes con BD

**Resultado:** Reporte generado con inconsistencias identificadas

---

### TC-022-P02: Total de órdenes coincide con BD

✅ **Implementado en:** `AnalyticsValidationService.validateCompletedOrdersCount()`

**Validación:**
- Query BD: `Order.countDocuments({ status: { $in: ['completed', 'delivered'] } })`
- Query Analytics: Pipeline con filtro `status: { $in: validStatuses }`
- Comparación: Valores deben coincidir exactamente

---

### TC-022-N01: Detectar inclusión incorrecta de cancelados

✅ **Implementado en:** `auditCancelledNotInCompleted()`

**Validación:**
- Verifica que `conteoCompletados + conteoCancelados = conteoTotal`
- Detecta si cancelados están siendo incluidos en completados

---

### TC-022-B01: Validación automática de consistencia

✅ **Implementado en:** `AnalyticsValidationService`

**Funcionalidades:**
- Comparación automática de métricas
- Detección de discrepancias > 1%
- Envío de alertas (logs, email, Slack)
- Registro en sistema de auditoría

---

### TC-022-B02: Exportación CSV datos exactos

✅ **Implementado en:** `CSVExporter`

**Validación:**
- Log de filas generadas: `series.length × productsSold.length`
- Cada fila corresponde a un registro en BD
- Valores (fecha, monto, estado) coinciden exactamente

---

## Integración con CI/CD

### GitHub Actions

```yaml
# .github/workflows/analytics-audit.yml
name: Analytics Audit

on:
  schedule:
    - cron: '0 2 * * *' # Diariamente a las 2 AM UTC
  workflow_dispatch: # Ejecución manual

jobs:
  audit:
    runs-on: ubuntu-latest
    
    services:
      mongodb:
        image: mongo:6
        ports:
          - 27017:27017
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install Dependencies
        run: npm ci
        working-directory: ./order-service-delicious-kitchen
      
      - name: Run Analytics Audit
        env:
          MONGO_URI: mongodb://localhost:27017/delicious-kitchen-order
        run: npm run audit:analytics
        working-directory: ./order-service-delicious-kitchen
      
      - name: Notify on Failure
        if: failure()
        uses: 8398a7/action-slack@v3
        with:
          status: ${{ job.status }}
          text: '🚨 Analytics audit failed! Check logs for details.'
          webhook_url: ${{ secrets.SLACK_WEBHOOK }}
```

### Jenkins Pipeline

```groovy
pipeline {
    agent any
    
    triggers {
        cron('0 2 * * *') // Diariamente a las 2 AM
    }
    
    stages {
        stage('Analytics Audit') {
            steps {
                script {
                    def exitCode = sh(
                        script: 'npm run audit:analytics',
                        returnStatus: true
                    )
                    
                    if (exitCode != 0) {
                        error('Analytics audit failed with inconsistencies')
                    }
                }
            }
        }
    }
    
    post {
        failure {
            emailext(
                subject: "Analytics Audit Failed - ${env.JOB_NAME}",
                body: "Audit detected critical inconsistencies. Review logs.",
                to: 'admin@deliciouskitchen.com'
            )
        }
    }
}
```

---

## Troubleshooting

### Error: Cannot connect to MongoDB

**Síntoma:**
```
❌ Error ejecutando auditoría: MongoError: connect ECONNREFUSED
```

**Solución:**

```bash
# Verificar que MongoDB esté ejecutándose
docker ps | grep mongo

# Iniciar MongoDB si no está corriendo
docker-compose -f infrastructure-delicious-kitchen/docker-compose.dev.yml up -d mongodb

# Verificar variable de entorno
echo $MONGO_URI
```

---

### Error: Module not found

**Síntoma:**
```
Error: Cannot find module '../src/models/Order'
```

**Solución:**

```bash
# Instalar dependencias
cd order-service-delicious-kitchen
npm install

# Compilar TypeScript
npm run build

# Ejecutar script
npm run audit:analytics
```

---

### Discrepancias Persistentes

**Síntoma:**
```
❌ Ingresos Totales (Revenue)
   Discrepancia: Diferencia de $1500.50
```

**Pasos de Diagnóstico:**

1. **Verificar queries de analytics:**
   ```typescript
   // Revisar AnalyticsRepository.ts líneas 41-45
   // Confirmar que filtro sea: status: { $in: ['completed', 'delivered'] }
   ```

2. **Consultar BD directamente:**
   ```bash
   mongosh delicious-kitchen-order
   
   db.orders.aggregate([
     { $match: { status: { $in: ['completed', 'delivered'] } } },
     { $group: { _id: null, total: { $sum: '$total' } } }
   ])
   ```

3. **Comparar con reporte de analytics:**
   ```bash
   curl -X GET "http://localhost:3002/internal/analytics?from=2024-01-01&to=2024-12-31&groupBy=month"
   ```

4. **Revisar logs del servicio:**
   ```bash
   docker logs order-service | grep "ERROR\|WARN"
   ```

---

### Validación Tarda Mucho

**Síntoma:** Script se ejecuta por más de 5 minutos

**Optimizaciones:**

1. **Reducir rango de fechas:**
   ```bash
   npm run audit:analytics -- --from=2024-12-01 --to=2024-12-17
   ```

2. **Agregar índices en MongoDB:**
   ```javascript
   db.orders.createIndex({ createdAt: 1, status: 1 });
   db.order_cancellations.createIndex({ cancelledAt: 1 });
   ```

3. **Limitar queries agregadas:**
   ```typescript
   // En AnalyticsValidationService, agregar límite
   .limit(1000)
   ```

---

## Mantenimiento

### Actualizar Umbrales de Tolerancia

Modificar en `AnalyticsValidationService.ts`:

```typescript
private readonly TOLERANCE_PERCENTAGE = 1; // Cambiar según necesidad
private readonly CRITICAL_THRESHOLD = 5;
```

### Agregar Nuevas Verificaciones

1. Crear método en `AnalyticsAuditor`:
   ```typescript
   private async auditNuevaMetrica(): Promise<void> {
     // Lógica de auditoría
     this.addCheckResult({ ... });
   }
   ```

2. Llamar en `runAllAudits()`:
   ```typescript
   await this.auditNuevaMetrica();
   ```

3. Documentar en esta guía

---

## Soporte

Para reportar problemas o solicitar mejoras:

- **Issues:** GitHub repository
- **Email:** devops@deliciouskitchen.com
- **Slack:** #analytics-support

---

**Última actualización:** 2024-12-17  
**Versión:** 1.0.0  
**Autor:** DevOps Team - Delicious Kitchen
