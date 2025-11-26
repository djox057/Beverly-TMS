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
}

const DB_NAME = 'orders-cache';
const STORE_NAME = 'locked-orders';
const CACHE_KEY = 'locked-orders-data';
const CACHE_VERSION = 1;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

let dbInstance: IDBPDatabase<OrdersCacheDB> | null = null;

async function getDB(): Promise<IDBPDatabase<OrdersCacheDB>> {
  if (dbInstance) return dbInstance;
  
  dbInstance = await openDB<OrdersCacheDB>(DB_NAME, CACHE_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    },
  });
  
  return dbInstance;
}

export async function saveLockedOrders(orders: any[]): Promise<void> {
  try {
    const db = await getDB();
    await db.put(STORE_NAME, {
      data: orders,
      timestamp: Date.now(),
      version: CACHE_VERSION,
    }, CACHE_KEY);
    console.log('✅ Cached', orders.length, 'locked orders to IndexedDB');
  } catch (error) {
    console.error('Failed to save locked orders to cache:', error);
  }
}

export async function getLockedOrders(): Promise<any[] | null> {
  try {
    const db = await getDB();
    const cached = await db.get(STORE_NAME, CACHE_KEY);
    
    if (!cached) {
      console.log('📦 No cached locked orders found');
      return null;
    }
    
    const age = Date.now() - cached.timestamp;
    const ageHours = Math.floor(age / (1000 * 60 * 60));
    
    if (!isCacheValid(cached.timestamp)) {
      console.log('⏰ Cache expired (age:', ageHours, 'hours)');
      return null;
    }
    
    console.log('✅ Loaded', cached.data.length, 'locked orders from cache (age:', ageHours, 'hours)');
    return cached.data;
  } catch (error) {
    console.error('Failed to get locked orders from cache:', error);
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
    const cached = await db.get(STORE_NAME, CACHE_KEY);
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
    await db.delete(STORE_NAME, CACHE_KEY);
    console.log('🗑️ Cleared locked orders cache');
  } catch (error) {
    console.error('Failed to clear cache:', error);
  }
}

// Force clear cache on module load to fix any stale data
clearCache().catch(console.error);

export async function getCacheStats(): Promise<{
  hasCachedData: boolean;
  cacheAge: number | null;
  isValid: boolean;
  itemCount: number;
} | null> {
  try {
    const db = await getDB();
    const cached = await db.get(STORE_NAME, CACHE_KEY);
    
    if (!cached) {
      return {
        hasCachedData: false,
        cacheAge: null,
        isValid: false,
        itemCount: 0,
      };
    }
    
    const cacheAge = Date.now() - cached.timestamp;
    return {
      hasCachedData: true,
      cacheAge,
      isValid: isCacheValid(cached.timestamp),
      itemCount: cached.data.length,
    };
  } catch (error) {
    console.error('Failed to get cache stats:', error);
    return null;
  }
}
