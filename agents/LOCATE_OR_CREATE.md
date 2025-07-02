# Funcionalidad Locate-or-Create

## Descripción

La funcionalidad **Locate-or-Create** permite que el sistema de agentes backend busque archivos existentes para parchearlos o genere nuevos archivos automáticamente si no existen. Esta característica hace que el sistema sea mucho más flexible y capaz de trabajar tanto en proyectos existentes como en la creación de nuevas funcionalidades desde cero.

## Cómo Funciona

### 1. Contrato de la User Story

Para activar esta funcionalidad, añade un campo `target` en tu user story:

```json
{
  "apiImpact": true,
  "target": {
    "file": "src/controllers/order.controller.ts",
    "function": "calculateTotal",
    "createIfMissing": true
  },
  "goal": "Añadir descuento por cupones y envío gratuito…"
}
```

#### Campos del Target

- **`file`**: Ruta relativa del archivo objetivo desde la raíz del proyecto
- **`function`**: Nombre exacto de la función o expresión RegExp (ej: `"^get.*ById$"`)
- **`createIfMissing`**: Flag booleano que activa el modo scaffold cuando es `true`

### 2. Flujo de Trabajo

| Agente | Archivo Existe (Patch Mode) | Archivo No Existe (Scaffold Mode) |
|--------|----------------------------|------------------------------------|
| **BE-Manager** | Envía story a BE-Draft | Envía story a BE-Draft |
| **BE-Draft** | Abre AST, localiza función, genera diff | Crea carpeta, genera archivo con firma |
| **BE-Logic** | Inserta código en función existente | Rellena nueva función con lógica |
| **BE-Test** | Actualiza tests existentes | Genera archivo de test desde cero |
| **BE-Typefix** | Ajusta tipos en zona modificada | Corrige tipos en todo el archivo nuevo |

### 3. Modos de Operación

#### Patch Mode (Archivo Existe)

Cuando el archivo objetivo existe:
- Lee el contenido existente
- Localiza la función especificada
- Añade comentarios de patch para BE-Logic
- Preserva el código existente

#### Scaffold Mode (Archivo No Existe)

Cuando `createIfMissing: true` y el archivo no existe:
- Crea el directorio padre si es necesario
- Genera archivo con estructura base
- Incluye imports mínimos según framework
- Añade función con respuesta 501 temporal
- Incluye bloque TODO para BE-Logic

## Ejemplo de Scaffold Generado

### TypeScript
```typescript
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * calculateTotal
 * Añadir descuento por cupones y envío gratuito…
 */
export async function calculateTotal(req: Request, res: Response, next?: NextFunction): Promise<void> {
  try {
    // TODO: Implement logic - will be completed by BE-Logic agent
    logger.info('calculateTotal called', { params: req.params, query: req.query });
    
    res.status(501).json({
      success: false,
      message: 'Not implemented yet - pending BE-Logic implementation'
    });
  } catch (error) {
    logger.error('Error in calculateTotal', { error: error.message });
    if (next) {
      next(error);
    } else {
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
}

export default { calculateTotal };
```

### JavaScript
```javascript
const { logger } = require('../utils/logger');

/**
 * calculateTotal
 * Añadir descuento por cupones y envío gratuito…
 */
async function calculateTotal(req, res, next) {
  try {
    // TODO: Implement logic - will be completed by BE-Logic agent
    logger.info('calculateTotal called', { params: req.params, query: req.query });
    
    res.status(501).json({
      success: false,
      message: 'Not implemented yet - pending BE-Logic implementation'
    });
  } catch (error) {
    logger.error('Error in calculateTotal', { error: error.message });
    if (next) {
      next(error);
    } else {
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
}

module.exports = { calculateTotal };
```

## Salvaguardas y Seguridad

### Idempotencia
- Re-ejecutar la misma story detecta archivo existente → Patch Mode
- No crea duplicados si la función ya existe

### Creación Selectiva
- `createIfMissing: false` falla explícitamente si archivo no existe
- Evita sorpresas y creación accidental de archivos

### Prevención de Conflictos
- Si función existe con misma firma, actualiza la original
- No sobrescribe código existente sin confirmación
- Todo se hace en branch temporal para revisión

## Ejemplos de Uso

### Ejemplo 1: Crear Nueva Función
```json
{
  "apiImpact": true,
  "framework": "express",
  "target": {
    "file": "src/controllers/order.controller.ts",
    "function": "calculateTotal",
    "createIfMissing": true
  },
  "goal": "Aplicar cupón de descuento y envío gratis si subtotal > 50 €",
  "tests": {
    "happyPath": true,
    "edgeCases": ["subtotal exactamente 50", "cupón expirado"]
  }
}
```

### Ejemplo 2: Parchear Función Existente
```json
{
  "apiImpact": true,
  "target": {
    "file": "src/controllers/user.controller.ts",
    "function": "updateProfile",
    "createIfMissing": false
  },
  "goal": "Añadir validación de email único"
}
```

### Ejemplo 3: Scaffoldear Servicio Completo
```json
{
  "apiImpact": true,
  "target": {
    "file": "src/services/notification.service.ts",
    "function": "sendEmail",
    "createIfMissing": true
  },
  "goal": "Crear servicio de notificaciones por email"
}
```

## Integración con Agentes

### BE-Draft
- Detecta campo `target` en user story
- Ejecuta lógica locate-or-create
- Genera scaffold o prepara patch

### BE-Logic
- Recibe archivo con función base
- Implementa lógica de negocio real
- Reemplaza TODO con código funcional

### BE-Test
- Genera tests apropiados para nueva función
- Actualiza tests existentes si es patch

### BE-Typefix
- Corrige tipos en archivos nuevos
- Ajusta imports y exports
- Asegura compilación sin errores

## Ventajas

✅ **Flexibilidad**: Maneja tanto archivos existentes como nuevos  
✅ **Seguridad**: Salvaguardas contra sobrescritura accidental  
✅ **Eficiencia**: Evita trabajo manual de scaffolding  
✅ **Consistencia**: Mantiene patrones de código uniformes  
✅ **Trazabilidad**: Todo cambio queda registrado en el sistema de colas  
✅ **Escalabilidad**: Funciona con múltiples frameworks y bases de datos  

## Limitaciones Actuales

- El modo patch usa comentarios simples en lugar de AST parsing completo
- Requiere estructura de proyecto consistente
- Funciona mejor con convenciones de naming estándar

## Próximas Mejoras

- [ ] Implementar AST parsing real para patches más precisos
- [ ] Soporte para múltiples funciones en un target
- [ ] Detección automática de framework y configuración
- [ ] Integración con sistemas de control de versiones
- [ ] Validación de sintaxis antes de escribir archivos

## Ver También

- [Ejemplos de User Stories](./examples/locate-or-create-example.json)
- [Documentación de Agentes Backend](./README.md)
- [Tipos de Queue](./types/queues.d.ts)