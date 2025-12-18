import { Request, Response } from 'express';
import { IAnalyticsService } from '../interfaces/IAnalyticsService';
import { AnalyticsService } from '../services/analyticsService';
import { AnalyticsRepository } from '../repositories/AnalyticsRepository';
import { AnalyticsValidationService } from '../services/AnalyticsValidationService';
import { Order } from '../models/Order';

/**
 * Controller de analíticas refactorizado
 * Cumple con Dependency Inversion Principle: Usa interfaces
 * Cumple con Single Responsibility: Solo orquestación HTTP
 * HU-022: Incluye validación automática de consistencia
 */

// Configuración de inyección de dependencias
const repository = new AnalyticsRepository(Order);
const service: IAnalyticsService = new AnalyticsService(repository);
const validationService = new AnalyticsValidationService(Order, repository); // HU-022

export async function getInternalAnalytics(req: Request, res: Response) {
  try {
    const { from, to, groupBy, top } = req.query as any;
    
    // Validación
    if (!from || !to || !groupBy) {
      return res.status(400).json({ 
        error: 'VALIDATION_ERROR', 
        details: [
          !from ? { field: 'from', message: 'Formato inválido (YYYY-MM-DD)' } : null,
          !to ? { field: 'to', message: 'Formato inválido (YYYY-MM-DD)' } : null,
          !groupBy ? { field: 'groupBy', message: 'Debe ser uno de: day, week, month, year' } : null
        ].filter(Boolean) 
      });
    }
    
    // Llamada al servicio
    const analytics = await service.getAnalytics({ 
      from, 
      to, 
      groupBy, 
      top: top ? Number(top) : undefined 
    });
    
    // Respuesta
    if (!analytics) {
      return res.status(204).json({ 
        message: 'No hay datos disponibles para el período seleccionado' 
      });
    }
    
    return res.status(200).json(analytics);
  } catch (err: any) {
    if (err?.code === 'RANGE_EXCEEDED') {
      return res.status(400).json({ 
        error: 'VALIDATION_ERROR', 
        message: 'El rango de fechas excede el máximo permitido' 
      });
    }
    return res.status(500).json({ 
      error: 'INTERNAL_ERROR', 
      message: 'Error interno procesando la solicitud' 
    });
  }
}

export async function postInternalAnalyticsExport(req: Request, res: Response) {
  try {
    const { from, to, groupBy, top, columns } = req.body || {};
    
    // Validación
    if (!from || !to || !groupBy) {
      return res.status(400).json({ 
        error: 'VALIDATION_ERROR', 
        details: [
          !from ? { field: 'from', message: 'Formato inválido (YYYY-MM-DD)' } : null,
          !to ? { field: 'to', message: 'Formato inválido (YYYY-MM-DD)' } : null,
          !groupBy ? { field: 'groupBy', message: 'Debe ser uno de: day, week, month, year' } : null
        ].filter(Boolean) 
      });
    }
    
    // Stream CSV
    const stream = service.streamCsv({ from, to, groupBy, top, columns });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="analytics_${from.replace(/-/g,'')}-${to.replace(/-/g,'')}.csv"`);
    stream.pipe(res);
  } catch (err) {
    return res.status(500).json({ 
      error: 'INTERNAL_ERROR', 
      message: 'Error interno procesando la solicitud' 
    });
  }
}

/**
 * HU-022 TC-022-B01: Endpoint para validar consistencia de analytics
 * Permite ejecutar validación on-demand desde panel de administración
 * 
 * @route POST /internal/analytics/validate
 * @access Admin only
 */
export async function postInternalAnalyticsValidate(req: Request, res: Response) {
  try {
    const { from, to, groupBy, top } = req.body || {};
    
    // Validación de parámetros
    if (!from || !to || !groupBy) {
      return res.status(400).json({ 
        error: 'VALIDATION_ERROR', 
        message: 'Parámetros requeridos: from, to, groupBy' 
      });
    }

    // Ejecutar validación
    const validationResult = await validationService.validateAnalyticsConsistency({
      from,
      to,
      groupBy,
      top: top || 10
    });

    // Responder con resultado
    return res.status(200).json({
      success: validationResult.isValid,
      message: validationResult.isValid 
        ? 'Validación exitosa: Los reportes coinciden con la base de datos' 
        : 'Validación completada: Se detectaron discrepancias',
      validation: validationResult
    });

  } catch (err: any) {
    console.error('[Analytics Validation] Error:', err);
    return res.status(500).json({ 
      error: 'INTERNAL_ERROR', 
      message: 'Error ejecutando validación de consistencia' 
    });
  }
}