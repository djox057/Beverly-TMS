import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { supabase } from '@/integrations/supabase/client';

interface OrdersCacheDB extends DBSchema {
  'locked-orders': {
    key: string;
    value: {
      data: any[];
      timestamp: number;
      version: number;
      serverVersion: number; // Track the server version we downloaded
    };
  };
  'pickup-drops': {
    key: string;
    value: {
      data: any[];
      timestamp: number;
      version: number;
      serverVersion: number;
    };
  };
  'order-files': {
    key: string;
    value: {
      data: any[];
      timestamp: number;
      version: number;
      serverVersion: number;
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
const CACHE_VERSION = 3; // Bump version to force schema update

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

// Helper to get server version for an archive type
async function getServerVersion(archiveType: string): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('archive_version')
      .select('version')
      .eq('id', archiveType)
      .single();
    
    if (error || !data) {
      console.log(`📦 No server version found for ${archiveType}`);
      return 0;
    }
    
    return data.version;
  } catch (error) {
    console.error(`Failed to get server version for ${archiveType}:`, error);
    return 0;
  }
}

// Helper to update server version after upload
async function updateServerVersion(archiveType: string): Promise<void> {
  try {
    const newVersion = Date.now();
    const { error } = await supabase
      .from('archive_version')
      .update({ version: newVersion, updated_at: new Date().toISOString() })
      .eq('id', archiveType);
    
    if (error) {
      console.error(`Failed to update server version for ${archiveType}:`, error);
    } else {
      console.log(`✅ Updated server version for ${archiveType} to ${newVersion}`);
    }
  } catch (error) {
    console.error(`Failed to update server version for ${archiveType}:`, error);
  }
}

export async function saveLockedOrders(orders: any[]): Promise<void> {
  try {
    // Save to Supabase Storage for company-wide access
    const csvContent = JSON.stringify(orders);
    const blob = new Blob([csvContent], { type: 'application/json' });
    
    const { error: uploadError } = await supabase.storage
      .from('archived-orders')
      .upload('locked-orders.json', blob, {
        cacheControl: '31536000', // 1 year - CDN can cache forever, we invalidate via version
        upsert: true,
      });

    if (uploadError) throw uploadError;

    // Update server version to invalidate all client caches
    await updateServerVersion('locked-orders');

    // Also cache locally for faster access
    const db = await getDB();
    const serverVersion = Date.now();
    await db.put(ORDERS_STORE, {
      data: orders,
      timestamp: Date.now(),
      version: CACHE_VERSION,
      serverVersion,
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
        cacheControl: '31536000', // 1 year
        upsert: true,
      });

    if (uploadError) throw uploadError;

    // Update server version
    await updateServerVersion('pickup-drops');

    // Also cache locally
    const db = await getDB();
    const serverVersion = Date.now();
    await db.put(PICKUP_DROPS_STORE, {
      data: pickupDrops,
      timestamp: Date.now(),
      version: CACHE_VERSION,
      serverVersion,
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
        cacheControl: '31536000', // 1 year
        upsert: true,
      });

    if (uploadError) throw uploadError;

    // Update server version
    await updateServerVersion('order-files');

    // Also cache locally
    const db = await getDB();
    const serverVersion = Date.now();
    await db.put(ORDER_FILES_STORE, {
      data: orderFiles,
      timestamp: Date.now(),
      version: CACHE_VERSION,
      serverVersion,
    }, ORDER_FILES_CACHE_KEY);
    
    console.log('✅ Uploaded', orderFiles.length, 'order files to company storage');
  } catch (error) {
    console.error('Failed to save order files:', error);
    throw error;
  }
}

export async function getLockedOrders(): Promise<any[] | null> {
  try {
    const db = await getDB();
    const cached = await db.get(ORDERS_STORE, ORDERS_CACHE_KEY);
    
    // Check server version to see if we need to refresh
    const serverVersion = await getServerVersion('locked-orders');
    
    // If we have cached data and server version matches, return cached
    if (cached && Array.isArray(cached.data) && cached.data.length > 0) {
      const localVersion = cached.serverVersion || 0;
      
      if (localVersion >= serverVersion) {
        console.log('✅ Loaded', cached.data.length, 'locked orders from local cache (version matches:', serverVersion, ')');
        return cached.data;
      }
      
      // Version mismatch - need to fetch fresh data
      console.log('🔄 Server version changed:', localVersion, '->', serverVersion, '- fetching fresh data...');
    }

    // No local cache or version mismatch - fetch from company storage
    console.log('📡 Fetching locked orders from company storage...');
    const { data, error } = await supabase.storage
      .from('archived-orders')
      .download('locked-orders.json');

    if (error) {
      console.log('📦 No company archived orders found');
      return null;
    }

    const text = await data.text();
    const orders = JSON.parse(text);

    // Update local cache with server version
    await db.put(ORDERS_STORE, {
      data: orders,
      timestamp: Date.now(),
      version: CACHE_VERSION,
      serverVersion,
    }, ORDERS_CACHE_KEY);

    console.log('✅ Loaded', orders.length, 'locked orders from company storage');
    return orders;
  } catch (error) {
    console.error('Failed to get locked orders:', error);
    return null;
  }
}

export async function getPickupDrops(): Promise<any[] | null> {
  try {
    const db = await getDB();
    const cached = await db.get(PICKUP_DROPS_STORE, PICKUP_DROPS_CACHE_KEY);
    
    // Check server version
    const serverVersion = await getServerVersion('pickup-drops');
    
    if (cached && Array.isArray(cached.data) && cached.data.length > 0) {
      const localVersion = cached.serverVersion || 0;
      
      if (localVersion >= serverVersion) {
        console.log('✅ Loaded', cached.data.length, 'pickup/drops from local cache (version matches:', serverVersion, ')');
        return cached.data;
      }
      
      console.log('🔄 Server version changed for pickup/drops:', localVersion, '->', serverVersion);
    }

    // Fetch from company storage
    console.log('📡 Fetching pickup/drops from company storage...');
    const { data, error } = await supabase.storage
      .from('archived-orders')
      .download('pickup-drops.json');

    if (error) {
      console.log('📦 No company archived pickup/drops found');
      return null;
    }

    const text = await data.text();
    const pickupDrops = JSON.parse(text);

    // Update local cache
    await db.put(PICKUP_DROPS_STORE, {
      data: pickupDrops,
      timestamp: Date.now(),
      version: CACHE_VERSION,
      serverVersion,
    }, PICKUP_DROPS_CACHE_KEY);

    console.log('✅ Loaded', pickupDrops.length, 'pickup/drops from company storage');
    return pickupDrops;
  } catch (error) {
    console.error('Failed to get pickup/drops:', error);
    return null;
  }
}

export async function getOrderFiles(): Promise<any[] | null> {
  try {
    const db = await getDB();
    const cached = await db.get(ORDER_FILES_STORE, ORDER_FILES_CACHE_KEY);
    
    // Check server version
    const serverVersion = await getServerVersion('order-files');
    
    if (cached && Array.isArray(cached.data) && cached.data.length > 0) {
      const localVersion = cached.serverVersion || 0;
      
      if (localVersion >= serverVersion) {
        console.log('✅ Loaded', cached.data.length, 'order files from local cache (version matches:', serverVersion, ')');
        return cached.data;
      }
      
      console.log('🔄 Server version changed for order files:', localVersion, '->', serverVersion);
    }

    // Fetch from company storage
    console.log('📡 Fetching order files from company storage...');
    const { data, error } = await supabase.storage
      .from('archived-orders')
      .download('order-files.json');

    if (error) {
      console.log('📦 No company archived order files found');
      return null;
    }

    const text = await data.text();
    const orderFiles = JSON.parse(text);

    // Update local cache
    await db.put(ORDER_FILES_STORE, {
      data: orderFiles,
      timestamp: Date.now(),
      version: CACHE_VERSION,
      serverVersion,
    }, ORDER_FILES_CACHE_KEY);

    console.log('✅ Loaded', orderFiles.length, 'order files from company storage');
    return orderFiles;
  } catch (error) {
    console.error('Failed to get order files:', error);
    return null;
  }
}

// Get order transfers from storage (if available) - no local caching
export async function getOrderTransfers(): Promise<any[] | null> {
  try {
    const { data, error } = await supabase.storage
      .from('archived-orders')
      .download('order-transfers.json');

    if (error) {
      console.log('📦 No order transfers cache found - will use database data for transfers');
      return null;
    }

    const text = await data.text();
    const orderTransfers = JSON.parse(text);
    console.log('✅ Loaded', orderTransfers.length, 'order transfers from company storage');
    return orderTransfers;
  } catch (error) {
    console.error('Failed to get order transfers:', error);
    return null;
  }
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
    serverVersion: number;
    localVersion: number;
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
    
    // Check server version for orders
    const serverVersion = await getServerVersion('locked-orders');
    const localVersion = ordersCache?.serverVersion || 0;
    const isValid = localVersion >= serverVersion;
    
    return {
      orders: ordersCache ? {
        hasCachedData: true,
        cacheAge: Date.now() - ordersCache.timestamp,
        isValid,
        itemCount: ordersCache.data.length,
        serverVersion,
        localVersion,
      } : {
        hasCachedData: false,
        cacheAge: null,
        isValid: false,
        itemCount: 0,
        serverVersion,
        localVersion: 0,
      },
      pickupDrops: pickupDropsCache ? {
        hasCachedData: true,
        cacheAge: Date.now() - pickupDropsCache.timestamp,
        isValid: true, // Simplified for non-orders
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
        isValid: true,
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

// Add a newly locked order to the cache
export async function addLockedOrderToCache(order: any): Promise<void> {
  try {
    console.log('📦 Adding locked order to cache:', order.id);
    
    // Get current locked orders from storage
    const { data, error } = await supabase.storage
      .from('archived-orders')
      .download('locked-orders.json');

    let existingOrders: any[] = [];
    if (!error && data) {
      const text = await data.text();
      existingOrders = JSON.parse(text);
    }

    // Check if order already exists
    const existingIndex = existingOrders.findIndex((o: any) => o.id === order.id);
    if (existingIndex >= 0) {
      // Update existing order
      existingOrders[existingIndex] = order;
    } else {
      // Add new order
      existingOrders.push(order);
    }

    // Save back to storage
    await saveLockedOrders(existingOrders);
    console.log('✅ Added locked order to cache, total:', existingOrders.length);
  } catch (error) {
    console.error('Failed to add locked order to cache:', error);
    throw error;
  }
}

// Remove an order from the locked cache (when unlocking)
export async function removeLockedOrderFromCache(orderId: string): Promise<void> {
  try {
    console.log('📦 Removing unlocked order from cache:', orderId);
    
    // Get current locked orders from storage
    const { data, error } = await supabase.storage
      .from('archived-orders')
      .download('locked-orders.json');

    if (error || !data) {
      console.log('No locked orders cache to remove from');
      return;
    }

    const text = await data.text();
    let existingOrders: any[] = JSON.parse(text);

    // Remove the order
    const originalLength = existingOrders.length;
    existingOrders = existingOrders.filter((o: any) => o.id !== orderId);

    if (existingOrders.length < originalLength) {
      // Save back to storage
      await saveLockedOrders(existingOrders);
      console.log('✅ Removed order from cache, remaining:', existingOrders.length);
    }
  } catch (error) {
    console.error('Failed to remove order from cache:', error);
    // Don't throw - unlocking should still work even if cache update fails
  }
}
