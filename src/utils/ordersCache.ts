import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { supabase } from '@/integrations/supabase/client';

interface OrdersCacheDB extends DBSchema {
  'locked-orders': {
    key: string;
    value: {
      data: any[];
      timestamp: number;
      version: number;
    };
  };
  'pickup-drops': {
    key: string;
    value: {
      data: any[];
      timestamp: number;
      version: number;
    };
  };
  'order-files': {
    key: string;
    value: {
      data: any[];
      timestamp: number;
      version: number;
    };
  };
}

const DB_NAME = 'orders-cache';
const ORDERS_STORE = 'locked-orders';
const PICKUP_DROPS_STORE = 'pickup-drops';
const ORDER_FILES_STORE = 'order-files';
const ORDERS_CACHE_KEY = 'locked-orders-data';
const PICKUP_DROPS_CACHE_KEY = 'pickup-drops-data';
const ORDER_FILES_CACHE_KEY = 'order-files-data';
const CACHE_VERSION = 2;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

let dbInstance: IDBPDatabase<OrdersCacheDB> | null = null;

async function getDB(): Promise<IDBPDatabase<OrdersCacheDB>> {
  if (dbInstance) return dbInstance;
  
  dbInstance = await openDB<OrdersCacheDB>(DB_NAME, CACHE_VERSION, {
    upgrade(db) {
      // Create all stores if they don't exist
      if (!db.objectStoreNames.contains(ORDERS_STORE)) {
        db.createObjectStore(ORDERS_STORE);
      }
      if (!db.objectStoreNames.contains(PICKUP_DROPS_STORE)) {
        db.createObjectStore(PICKUP_DROPS_STORE);
      }
      if (!db.objectStoreNames.contains(ORDER_FILES_STORE)) {
        db.createObjectStore(ORDER_FILES_STORE);
      }
    },
  });
  
  return dbInstance;
}

export async function saveLockedOrders(orders: any[]): Promise<void> {
  try {
    // Save to Supabase Storage for company-wide access
    const csvContent = JSON.stringify(orders);
    const blob = new Blob([csvContent], { type: 'application/json' });
    
    const { error: uploadError } = await supabase.storage
      .from('archived-orders')
      .upload('locked-orders.json', blob, {
        cacheControl: '3600',
        upsert: true,
      });

    if (uploadError) throw uploadError;

    // Also cache locally for faster access
    const db = await getDB();
    await db.put(ORDERS_STORE, {
      data: orders,
      timestamp: Date.now(),
      version: CACHE_VERSION,
    }, ORDERS_CACHE_KEY);
    
    console.log('✅ Uploaded', orders.length, 'locked orders to company storage');
  } catch (error) {
    console.error('Failed to save locked orders:', error);
    throw error;
  }
}

export async function savePickupDrops(pickupDrops: any[]): Promise<void> {
  try {
    // Save to Supabase Storage for company-wide access
    const csvContent = JSON.stringify(pickupDrops);
    const blob = new Blob([csvContent], { type: 'application/json' });
    
    const { error: uploadError } = await supabase.storage
      .from('archived-orders')
      .upload('pickup-drops.json', blob, {
        cacheControl: '3600',
        upsert: true,
      });

    if (uploadError) throw uploadError;

    // Also cache locally
    const db = await getDB();
    await db.put(PICKUP_DROPS_STORE, {
      data: pickupDrops,
      timestamp: Date.now(),
      version: CACHE_VERSION,
    }, PICKUP_DROPS_CACHE_KEY);
    
    console.log('✅ Uploaded', pickupDrops.length, 'pickup/drops to company storage');
  } catch (error) {
    console.error('Failed to save pickup/drops:', error);
    throw error;
  }
}

export async function saveOrderFiles(orderFiles: any[]): Promise<void> {
  try {
    // Save to Supabase Storage for company-wide access
    const csvContent = JSON.stringify(orderFiles);
    const blob = new Blob([csvContent], { type: 'application/json' });
    
    const { error: uploadError } = await supabase.storage
      .from('archived-orders')
      .upload('order-files.json', blob, {
        cacheControl: '3600',
        upsert: true,
      });

    if (uploadError) throw uploadError;

    // Also cache locally
    const db = await getDB();
    await db.put(ORDER_FILES_STORE, {
      data: orderFiles,
      timestamp: Date.now(),
      version: CACHE_VERSION,
    }, ORDER_FILES_CACHE_KEY);
    
    console.log('✅ Uploaded', orderFiles.length, 'order files to company storage');
  } catch (error) {
    console.error('Failed to save order files:', error);
    throw error;
  }
}

export async function getLockedOrders(): Promise<any[] | null> {
  try {
    // Try local cache first for speed
    const db = await getDB();
    const cached = await db.get(ORDERS_STORE, ORDERS_CACHE_KEY);
    
    // Validate cached data structure
    if (cached) {
      if (cached.version !== CACHE_VERSION) {
        console.warn('⚠️ Cache version mismatch, clearing stale cache');
        await db.delete(ORDERS_STORE, ORDERS_CACHE_KEY);
      } else if (!Array.isArray(cached.data)) {
        console.error('❌ Corrupted cache detected (not an array), clearing');
        await db.delete(ORDERS_STORE, ORDERS_CACHE_KEY);
      } else if (isCacheValid(cached.timestamp)) {
        const age = Date.now() - cached.timestamp;
        const ageHours = Math.floor(age / (1000 * 60 * 60));
        console.log('✅ Loaded', cached.data.length, 'locked orders from local cache (age:', ageHours, 'hours)');
        return cached.data;
      }
    }

    // Fetch from company storage if cache is stale or missing
    console.log('📡 Fetching locked orders from company storage...');
    const { data, error } = await supabase.storage
      .from('archived-orders')
      .download('locked-orders.json');

    if (error) {
      console.log('📦 No company archived orders found');
      return cached?.data || null;
    }

    const text = await data.text();
    const orders = JSON.parse(text);
    
    // Validate fetched data
    if (!Array.isArray(orders)) {
      console.error('❌ Invalid data from storage (not an array)');
      return null;
    }

    // Update local cache
    await db.put(ORDERS_STORE, {
      data: orders,
      timestamp: Date.now(),
      version: CACHE_VERSION,
    }, ORDERS_CACHE_KEY);

    console.log('✅ Loaded', orders.length, 'locked orders from company storage');
    return orders;
  } catch (error) {
    console.error('Failed to get locked orders:', error);
    // Clear corrupted cache on any error
    try {
      const db = await getDB();
      await db.delete(ORDERS_STORE, ORDERS_CACHE_KEY);
      console.log('🗑️ Cleared corrupted locked orders cache');
    } catch (clearError) {
      console.error('Failed to clear cache:', clearError);
    }
    return null;
  }
}

export async function getPickupDrops(): Promise<any[] | null> {
  try {
    // Try local cache first
    const db = await getDB();
    const cached = await db.get(PICKUP_DROPS_STORE, PICKUP_DROPS_CACHE_KEY);
    
    // Validate cached data
    if (cached) {
      if (cached.version !== CACHE_VERSION) {
        console.warn('⚠️ Pickup/drops cache version mismatch, clearing');
        await db.delete(PICKUP_DROPS_STORE, PICKUP_DROPS_CACHE_KEY);
      } else if (!Array.isArray(cached.data)) {
        console.error('❌ Corrupted pickup/drops cache, clearing');
        await db.delete(PICKUP_DROPS_STORE, PICKUP_DROPS_CACHE_KEY);
      } else if (isCacheValid(cached.timestamp)) {
        const age = Date.now() - cached.timestamp;
        const ageHours = Math.floor(age / (1000 * 60 * 60));
        console.log('✅ Loaded', cached.data.length, 'pickup/drops from local cache (age:', ageHours, 'hours)');
        return cached.data;
      }
    }

    // Fetch from company storage
    console.log('📡 Fetching pickup/drops from company storage...');
    const { data, error } = await supabase.storage
      .from('archived-orders')
      .download('pickup-drops.json');

    if (error) {
      console.log('📦 No company archived pickup/drops found');
      return cached?.data || null;
    }

    const text = await data.text();
    const pickupDrops = JSON.parse(text);
    
    if (!Array.isArray(pickupDrops)) {
      console.error('❌ Invalid pickup/drops data from storage');
      return null;
    }

    // Update local cache
    await db.put(PICKUP_DROPS_STORE, {
      data: pickupDrops,
      timestamp: Date.now(),
      version: CACHE_VERSION,
    }, PICKUP_DROPS_CACHE_KEY);

    console.log('✅ Loaded', pickupDrops.length, 'pickup/drops from company storage');
    return pickupDrops;
  } catch (error) {
    console.error('Failed to get pickup/drops:', error);
    try {
      const db = await getDB();
      await db.delete(PICKUP_DROPS_STORE, PICKUP_DROPS_CACHE_KEY);
      console.log('🗑️ Cleared corrupted pickup/drops cache');
    } catch (clearError) {
      console.error('Failed to clear cache:', clearError);
    }
    return null;
  }
}

export async function getOrderFiles(): Promise<any[] | null> {
  try {
    // Try local cache first
    const db = await getDB();
    const cached = await db.get(ORDER_FILES_STORE, ORDER_FILES_CACHE_KEY);
    
    // Validate cached data
    if (cached) {
      if (cached.version !== CACHE_VERSION) {
        console.warn('⚠️ Order files cache version mismatch, clearing');
        await db.delete(ORDER_FILES_STORE, ORDER_FILES_CACHE_KEY);
      } else if (!Array.isArray(cached.data)) {
        console.error('❌ Corrupted order files cache, clearing');
        await db.delete(ORDER_FILES_STORE, ORDER_FILES_CACHE_KEY);
      } else if (isCacheValid(cached.timestamp)) {
        const age = Date.now() - cached.timestamp;
        const ageHours = Math.floor(age / (1000 * 60 * 60));
        console.log('✅ Loaded', cached.data.length, 'order files from local cache (age:', ageHours, 'hours)');
        return cached.data;
      }
    }

    // Fetch from company storage
    console.log('📡 Fetching order files from company storage...');
    const { data, error } = await supabase.storage
      .from('archived-orders')
      .download('order-files.json');

    if (error) {
      console.log('📦 No company archived order files found');
      return cached?.data || null;
    }

    const text = await data.text();
    const orderFiles = JSON.parse(text);
    
    if (!Array.isArray(orderFiles)) {
      console.error('❌ Invalid order files data from storage');
      return null;
    }

    // Update local cache
    await db.put(ORDER_FILES_STORE, {
      data: orderFiles,
      timestamp: Date.now(),
      version: CACHE_VERSION,
    }, ORDER_FILES_CACHE_KEY);

    console.log('✅ Loaded', orderFiles.length, 'order files from company storage');
    return orderFiles;
  } catch (error) {
    console.error('Failed to get order files:', error);
    try {
      const db = await getDB();
      await db.delete(ORDER_FILES_STORE, ORDER_FILES_CACHE_KEY);
      console.log('🗑️ Cleared corrupted order files cache');
    } catch (clearError) {
      console.error('Failed to clear cache:', clearError);
    }
    return null;
  }
}

export function isCacheValid(timestamp?: number): boolean {
  if (!timestamp) return false;
  const age = Date.now() - timestamp;
  return age < CACHE_DURATION;
}

export async function getCacheAge(): Promise<number | null> {
  try {
    const db = await getDB();
    const cached = await db.get(ORDERS_STORE, ORDERS_CACHE_KEY);
    if (!cached) return null;
    return Date.now() - cached.timestamp;
  } catch (error) {
    console.error('Failed to get cache age:', error);
    return null;
  }
}

export async function clearCache(): Promise<void> {
  try {
    const db = await getDB();
    await db.delete(ORDERS_STORE, ORDERS_CACHE_KEY);
    await db.delete(PICKUP_DROPS_STORE, PICKUP_DROPS_CACHE_KEY);
    await db.delete(ORDER_FILES_STORE, ORDER_FILES_CACHE_KEY);
    console.log('🗑️ Cleared all cached data');
  } catch (error) {
    console.error('Failed to clear cache:', error);
  }
}

export async function getCacheStats(): Promise<{
  orders: {
    hasCachedData: boolean;
    cacheAge: number | null;
    isValid: boolean;
    itemCount: number;
  };
  pickupDrops: {
    hasCachedData: boolean;
    cacheAge: number | null;
    isValid: boolean;
    itemCount: number;
  };
  orderFiles: {
    hasCachedData: boolean;
    cacheAge: number | null;
    isValid: boolean;
    itemCount: number;
  };
} | null> {
  try {
    const db = await getDB();
    const ordersCache = await db.get(ORDERS_STORE, ORDERS_CACHE_KEY);
    const pickupDropsCache = await db.get(PICKUP_DROPS_STORE, PICKUP_DROPS_CACHE_KEY);
    const orderFilesCache = await db.get(ORDER_FILES_STORE, ORDER_FILES_CACHE_KEY);
    
    return {
      orders: ordersCache ? {
        hasCachedData: true,
        cacheAge: Date.now() - ordersCache.timestamp,
        isValid: isCacheValid(ordersCache.timestamp),
        itemCount: ordersCache.data.length,
      } : {
        hasCachedData: false,
        cacheAge: null,
        isValid: false,
        itemCount: 0,
      },
      pickupDrops: pickupDropsCache ? {
        hasCachedData: true,
        cacheAge: Date.now() - pickupDropsCache.timestamp,
        isValid: isCacheValid(pickupDropsCache.timestamp),
        itemCount: pickupDropsCache.data.length,
      } : {
        hasCachedData: false,
        cacheAge: null,
        isValid: false,
        itemCount: 0,
      },
      orderFiles: orderFilesCache ? {
        hasCachedData: true,
        cacheAge: Date.now() - orderFilesCache.timestamp,
        isValid: isCacheValid(orderFilesCache.timestamp),
        itemCount: orderFilesCache.data.length,
      } : {
        hasCachedData: false,
        cacheAge: null,
        isValid: false,
        itemCount: 0,
      },
    };
  } catch (error) {
    console.error('Failed to get cache stats:', error);
    return null;
  }
}
