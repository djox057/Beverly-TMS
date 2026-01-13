/**
 * Penalty Fee Calculation Utilities
 * 
 * IMPORTANT: These penalty fees should ALWAYS be SUBTRACTED from totals:
 * - late_fee / late_fee_driver
 * - no_tracking_fee / no_tracking_fee_driver
 * - wrong_address_fee / wrong_address_fee_driver
 * - other_charges (freight only, NOT driver pay)
 * 
 * These fields ADD to totals:
 * - freight_amount / driver_price (base)
 * - detention / detention_driver
 * - layover / layover_driver
 * - tonu / tonu_driver
 * - extra_stop / extra_stop_driver
 * - lumper / lumper_driver
 * - escort_fee (freight only)
 * - other_additionals (freight only)
 * - other_charges_driver (driver pay - this one ADDS, unlike other_charges)
 */

// Helper to safely convert values to numbers
export const toNum = (val: any): number => {
  if (val === null || val === undefined || val === "null" || val === "") return 0;
  const num = Number(val);
  return Number.isFinite(num) ? num : 0;
};

// Penalty fees that should be SUBTRACTED from freight amount
export const FREIGHT_PENALTY_FIELDS = [
  'late_fee',
  'no_tracking_fee', 
  'wrong_address_fee',
  'other_charges',
] as const;

// Penalty fees that should be SUBTRACTED from driver pay
export const DRIVER_PENALTY_FIELDS = [
  'late_fee_driver',
  'no_tracking_fee_driver',
  'wrong_address_fee_driver',
  // NOTE: other_charges_driver ADDS to driver pay, not subtracts
] as const;

// Fields that ADD to freight amount
export const FREIGHT_ADDITION_FIELDS = [
  'freight_amount',
  'detention',
  'layover',
  'tonu',
  'extra_stop',
  'lumper',
  'escort_fee',
  'other_additionals',
] as const;

// Fields that ADD to driver pay
export const DRIVER_ADDITION_FIELDS = [
  'driver_price',
  'detention_driver',
  'layover_driver',
  'tonu_driver',
  'extra_stop_driver',
  'lumper_driver',
  'other_charges_driver', // This one ADDS to driver pay
] as const;

interface OrderData {
  [key: string]: any;
}

/**
 * Calculate total freight amount with proper penalty subtraction
 */
export function calculateTotalFreightAmount(order: OrderData): number {
  // Sum all addition fields
  const additions = FREIGHT_ADDITION_FIELDS.reduce((sum, field) => {
    const snakeCase = field;
    const camelCase = snakeToCamel(field);
    return sum + toNum(order[snakeCase] || order[camelCase]);
  }, 0);

  // Sum all penalty fields (to be subtracted)
  const penalties = FREIGHT_PENALTY_FIELDS.reduce((sum, field) => {
    const snakeCase = field;
    const camelCase = snakeToCamel(field);
    return sum + toNum(order[snakeCase] || order[camelCase]);
  }, 0);

  return additions - penalties;
}

/**
 * Calculate total driver pay with proper penalty subtraction
 */
export function calculateTotalDriverPay(order: OrderData): number {
  // Sum all addition fields
  const additions = DRIVER_ADDITION_FIELDS.reduce((sum, field) => {
    const snakeCase = field;
    const camelCase = snakeToCamel(field);
    return sum + toNum(order[snakeCase] || order[camelCase]);
  }, 0);

  // Sum all penalty fields (to be subtracted)
  const penalties = DRIVER_PENALTY_FIELDS.reduce((sum, field) => {
    const snakeCase = field;
    const camelCase = snakeToCamel(field);
    return sum + toNum(order[snakeCase] || order[camelCase]);
  }, 0);

  return additions - penalties;
}

/**
 * Convert snake_case to camelCase
 */
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Validate that an order's calculated totals match expected penalty subtraction
 * Returns validation result with details
 */
export function validatePenaltyCalculations(order: OrderData): {
  isValid: boolean;
  freightValid: boolean;
  driverPayValid: boolean;
  expectedFreight: number;
  expectedDriverPay: number;
  actualFreight?: number;
  actualDriverPay?: number;
  errors: string[];
} {
  const expectedFreight = calculateTotalFreightAmount(order);
  const expectedDriverPay = calculateTotalDriverPay(order);
  
  const actualFreight = toNum(order.totalFreightAmount || order.total_freight_amount);
  const actualDriverPay = toNum(order.totalDriverPay || order.total_driver_pay);
  
  const errors: string[] = [];
  
  // Check if penalty fees are being added instead of subtracted
  const freightWithWrongSign = FREIGHT_ADDITION_FIELDS.reduce((sum, field) => {
    return sum + toNum(order[field] || order[snakeToCamel(field)]);
  }, 0) + FREIGHT_PENALTY_FIELDS.reduce((sum, field) => {
    return sum + toNum(order[field] || order[snakeToCamel(field)]);
  }, 0);
  
  if (actualFreight && Math.abs(actualFreight - freightWithWrongSign) < 0.01) {
    errors.push('CRITICAL: Penalty fees appear to be ADDED to freight instead of SUBTRACTED');
  }
  
  const driverPayWithWrongSign = DRIVER_ADDITION_FIELDS.reduce((sum, field) => {
    return sum + toNum(order[field] || order[snakeToCamel(field)]);
  }, 0) + DRIVER_PENALTY_FIELDS.reduce((sum, field) => {
    return sum + toNum(order[field] || order[snakeToCamel(field)]);
  }, 0);
  
  if (actualDriverPay && Math.abs(actualDriverPay - driverPayWithWrongSign) < 0.01) {
    errors.push('CRITICAL: Penalty fees appear to be ADDED to driver pay instead of SUBTRACTED');
  }
  
  const freightValid = !actualFreight || Math.abs(actualFreight - expectedFreight) < 0.01;
  const driverPayValid = !actualDriverPay || Math.abs(actualDriverPay - expectedDriverPay) < 0.01;
  
  if (!freightValid) {
    errors.push(`Freight mismatch: expected ${expectedFreight}, got ${actualFreight}`);
  }
  if (!driverPayValid) {
    errors.push(`Driver pay mismatch: expected ${expectedDriverPay}, got ${actualDriverPay}`);
  }
  
  return {
    isValid: freightValid && driverPayValid && errors.length === 0,
    freightValid,
    driverPayValid,
    expectedFreight,
    expectedDriverPay,
    actualFreight,
    actualDriverPay,
    errors,
  };
}

/**
 * Run validation on multiple orders and return summary
 */
export function validateOrdersCalculations(orders: OrderData[]): {
  totalChecked: number;
  passed: number;
  failed: number;
  criticalErrors: string[];
  failedOrders: { orderId: string; errors: string[] }[];
} {
  const results = {
    totalChecked: orders.length,
    passed: 0,
    failed: 0,
    criticalErrors: [] as string[],
    failedOrders: [] as { orderId: string; errors: string[] }[],
  };
  
  for (const order of orders) {
    const validation = validatePenaltyCalculations(order);
    
    if (validation.isValid) {
      results.passed++;
    } else {
      results.failed++;
      results.failedOrders.push({
        orderId: order.id || 'unknown',
        errors: validation.errors,
      });
      
      // Collect critical errors
      validation.errors
        .filter(e => e.startsWith('CRITICAL'))
        .forEach(e => {
          if (!results.criticalErrors.includes(e)) {
            results.criticalErrors.push(e);
          }
        });
    }
  }
  
  return results;
}
