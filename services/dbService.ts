import type { AnalysisResult, UserProfile, AnalysisRecord, ExecutionRecord } from '../types';

const DB_NAME = 'PromptOptimizerDB';
const USER_STORE = 'users';
const HISTORY_STORE = 'analysisHistory';
const EXECUTION_STORE = 'executionHistory';
const DB_VERSION = 3; // Increment version to trigger onupgradeneeded

let db: IDBDatabase;

/**
 * Initializes the IndexedDB database.
 * Creates the object stores if they don't exist.
 */
function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (db) {
      return resolve(db);
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('Database error:', request.error);
      reject('Error opening database');
    };

    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    // This event is only fired when the version changes.
    request.onupgradeneeded = (event) => {
      const dbInstance = (event.target as IDBOpenDBRequest).result;
      
      // Create users store
      if (!dbInstance.objectStoreNames.contains(USER_STORE)) {
        const userStore = dbInstance.createObjectStore(USER_STORE, { keyPath: 'id', autoIncrement: true });
        userStore.createIndex('name', 'name', { unique: true });
      }

      // Create history store
      if (!dbInstance.objectStoreNames.contains(HISTORY_STORE)) {
        const historyStore = dbInstance.createObjectStore(HISTORY_STORE, { keyPath: 'id', autoIncrement: true });
        historyStore.createIndex('username', 'username', { unique: false });
        historyStore.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // Create execution history store
      if (!dbInstance.objectStoreNames.contains(EXECUTION_STORE)) {
          const executionStore = dbInstance.createObjectStore(EXECUTION_STORE, { keyPath: 'id', autoIncrement: true });
          executionStore.createIndex('username', 'username', { unique: false });
          executionStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
      
      // Clean up old object store from previous version
      if (dbInstance.objectStoreNames.contains('usageReports')) {
        dbInstance.deleteObjectStore('usageReports');
      }
    };
  });
}

// --- User Management ---

export async function addUser(name: string): Promise<UserProfile> {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(USER_STORE, 'readwrite');
        const store = transaction.objectStore(USER_STORE);
        const newUser: Omit<UserProfile, 'id' | 'createdAt'> & { createdAt: number } = { name, createdAt: Date.now() };
        const request = store.add(newUser);
        
        request.onerror = () => reject(new Error(`User "${name}" might already exist.`));
        request.onsuccess = () => {
            const addedUser: UserProfile = { ...newUser, id: request.result as number };
            resolve(addedUser);
        };
    });
}

export async function getAllUsers(): Promise<UserProfile[]> {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(USER_STORE, 'readonly');
        const store = transaction.objectStore(USER_STORE);
        const request = store.getAll();

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result.sort((a, b) => a.name.localeCompare(b.name)));
    });
}

// --- Analysis History Management ---

export async function addAnalysisRecord(username: string, analysisResult: AnalysisResult): Promise<AnalysisRecord> {
    const db = await initDB();
    const savings = analysisResult.originalTokenCount - analysisResult.optimizedTokenCount;
    const record: Omit<AnalysisRecord, 'id'> = {
        username,
        timestamp: Date.now(),
        originalTokenCount: analysisResult.originalTokenCount,
        optimizedTokenCount: analysisResult.optimizedTokenCount,
        savings,
    };

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(HISTORY_STORE, 'readwrite');
        const store = transaction.objectStore(HISTORY_STORE);
        const request = store.add(record);

        request.onerror = () => reject('Failed to save analysis record.');
        request.onsuccess = () => resolve({ ...record, id: request.result as number });
    });
}


export async function getAllHistory(): Promise<AnalysisRecord[]> {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(HISTORY_STORE, 'readonly');
        const store = transaction.objectStore(HISTORY_STORE);
        const request = store.getAll();

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
}

// --- Execution History Management ---

export async function addExecutionRecord(
    username: string, 
    promptType: 'original' | 'optimized', 
    promptText: string, 
    resultText: string
): Promise<ExecutionRecord> {
    const db = await initDB();
    const record: Omit<ExecutionRecord, 'id'> = {
        username,
        timestamp: Date.now(),
        promptType,
        promptText,
        resultText,
    };
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(EXECUTION_STORE, 'readwrite');
        const store = transaction.objectStore(EXECUTION_STORE);
        const request = store.add(record);

        request.onerror = () => reject('Failed to save execution record.');
        request.onsuccess = () => resolve({ ...record, id: request.result as number });
    });
}

export async function getAllExecutionHistory(): Promise<ExecutionRecord[]> {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(EXECUTION_STORE, 'readonly');
        const store = transaction.objectStore(EXECUTION_STORE);
        const request = store.getAll();

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
}

/**
 * Clears all data from all stores.
 */
export async function clearAllData(): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([USER_STORE, HISTORY_STORE, EXECUTION_STORE], 'readwrite');
    const userStore = transaction.objectStore(USER_STORE);
    const historyStore = transaction.objectStore(HISTORY_STORE);
    const executionStore = transaction.objectStore(EXECUTION_STORE);
    
    userStore.clear();
    historyStore.clear();
    executionStore.clear();

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}