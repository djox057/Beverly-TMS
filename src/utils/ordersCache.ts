import { openDB, DBSchema, IDBPDatabase } from 'idb';

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
    const db = await getDB();
    await db.put(ORDERS_STORE, {
      data: orders,
      timestamp: Date.now(),
      version: CACHE_VERSION,
    }, ORDERS_CACHE_KEY);
    console.log('✅ Cached', orders.length, 'locked orders to IndexedDB');
  } catch (error) {
    console.error('Failed to save locked orders to cache:', error);
  }
}

export async function savePickupDrops(pickupDrops: any[]): Promise<void> {
  try {
    const db = await getDB();
    await db.put(PICKUP_DROPS_STORE, {
      data: pickupDrops,
      timestamp: Date.now(),
      version: CACHE_VERSION,
    }, PICKUP_DROPS_CACHE_KEY);
    console.log('✅ Cached', pickupDrops.length, 'pickup/drops to IndexedDB');
  } catch (error) {
    console.error('Failed to save pickup/drops to cache:', error);
  }
}

export async function saveOrderFiles(orderFiles: any[]): Promise<void> {
  try {
    const db = await getDB();
    await db.put(ORDER_FILES_STORE, {
      data: orderFiles,
      timestamp: Date.now(),
      version: CACHE_VERSION,
    }, ORDER_FILES_CACHE_KEY);
    console.log('✅ Cached', orderFiles.length, 'order files to IndexedDB');
  } catch (error) {
    console.error('Failed to save order files to cache:', error);
  }
}

export async function getLockedOrders(): Promise<any[] | null> {
  try {
    const db = await getDB();
    const cached = await db.get(ORDERS_STORE, ORDERS_CACHE_KEY);
    
    if (!cached) {
      console.log('📦 No cached locked orders found');
      return null;
    }
    
    const age = Date.now() - cached.timestamp;
    const ageHours = Math.floor(age / (1000 * 60 * 60));
    
    console.log('✅ Loaded', cached.data.length, 'locked orders from cache (age:', ageHours, 'hours)');
    return cached.data;
  } catch (error) {
    console.error('Failed to get locked orders from cache:', error);
    return null;
  }
}

export async function getPickupDrops(): Promise<any[] | null> {
  try {
    const db = await getDB();
    const cached = await db.get(PICKUP_DROPS_STORE, PICKUP_DROPS_CACHE_KEY);
    
    if (!cached) {
      console.log('📦 No cached pickup/drops found');
      return null;
    }
    
    const age = Date.now() - cached.timestamp;
    const ageHours = Math.floor(age / (1000 * 60 * 60));
    
    console.log('✅ Loaded', cached.data.length, 'pickup/drops from cache (age:', ageHours, 'hours)');
    return cached.data;
  } catch (error) {
    console.error('Failed to get pickup/drops from cache:', error);
    return null;
  }
}

export async function getOrderFiles(): Promise<any[] | null> {
  try {
    const db = await getDB();
    const cached = await db.get(ORDER_FILES_STORE, ORDER_FILES_CACHE_KEY);
    
    if (!cached) {
      console.log('📦 No cached order files found');
      return null;
    }
    
    const age = Date.now() - cached.timestamp;
    const ageHours = Math.floor(age / (1000 * 60 * 60));
    
    console.log('✅ Loaded', cached.data.length, 'order files from cache (age:', ageHours, 'hours)');
    return cached.data;
  } catch (error) {
    console.error('Failed to get order files from cache:', error);
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
