export interface AnalysisResult {
  originalTokenCount: number;
  optimizedPrompt: string;
  optimizedTokenCount: number;
  explanation: string;
}

export interface ReportData {
  totalPrompts: number;
  totalOriginalTokens: number;
  totalOptimizedTokens: number;
  totalSavings: number;
  totalExecutions: number;
  estimatedCostSavings: number;
}

export interface FullReport {
  [username: string]: ReportData;
}

// Represents a user profile in the 'users' object store
export interface UserProfile {
    id?: number; // Auto-incrementing primary key
    name: string;
    createdAt: number; // Store as timestamp for simplicity
}

// Represents a single analysis event in the 'analysisHistory' object store
export interface AnalysisRecord {
    id?: number; // Auto-incrementing primary key
    username: string;
    timestamp: number;
    originalTokenCount: number;
    optimizedTokenCount: number;
    savings: number;
}

// Represents a single prompt execution event
export interface ExecutionRecord {
    id?: number; // Auto-incrementing primary key
    username: string;
    timestamp: number;
    promptType: 'original' | 'optimized';
    promptText: string;
    resultText: string;
}