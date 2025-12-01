import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { analyzeAndOptimizePrompt, executePrompt } from './services/geminiService';
import { getAllUsers, addUser, getAllHistory, addAnalysisRecord, clearAllData, addExecutionRecord, getAllExecutionHistory } from './services/dbService';
import type { AnalysisResult, FullReport, UserProfile, AnalysisRecord, ExecutionRecord } from './types';
import { MagicWandIcon, SparklesIcon, UserIcon, ChartBarIcon, TrashIcon, CloseIcon, DownloadIcon, PlusIcon, RotateCcwIcon, PlayIcon } from './components/icons';

type Period = 'day' | 'week' | 'month' | 'year' | 'all';

// Using a sample rate for a model like Gemini 1.5 Flash for input tokens.
const COST_PER_MILLION_TOKENS = 0.35; 

// --- Helper Functions ---

function calculateReportData(
  analysisHistory: AnalysisRecord[], 
  executionHistory: ExecutionRecord[],
  period: Period
): FullReport {
  const now = new Date();
  const report: FullReport = {};

  let startDate: Date;

  switch (period) {
    case 'day':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case 'week':
      startDate = new Date(now);
      startDate.setDate(now.getDate() - now.getDay());
      startDate.setHours(0, 0, 0, 0);
      break;
    case 'month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'year':
      startDate = new Date(now.getFullYear(), 0, 1);
      break;
    case 'all':
    default:
      startDate = new Date(0); // The beginning of time
      break;
  }
  
  const startTime = startDate.getTime();

  const filteredAnalysisHistory = analysisHistory.filter(record => record.timestamp >= startTime);
  const filteredExecHistory = executionHistory.filter(record => record.timestamp >= startTime);

  const initializeUserReport = (username: string) => {
    if (!report[username]) {
      report[username] = {
        totalPrompts: 0,
        totalOriginalTokens: 0,
        totalOptimizedTokens: 0,
        totalSavings: 0,
        totalExecutions: 0,
        estimatedCostSavings: 0,
      };
    }
  };

  for (const record of filteredAnalysisHistory) {
    initializeUserReport(record.username);
    const userReport = report[record.username];
    userReport.totalPrompts += 1;
    userReport.totalOriginalTokens += record.originalTokenCount;
    userReport.totalOptimizedTokens += record.optimizedTokenCount;
    userReport.totalSavings += record.savings;
  }
  
  for (const record of filteredExecHistory) {
    initializeUserReport(record.username);
    report[record.username].totalExecutions += 1;
  }
  
  // Calculate cost savings after all tokens are summed up
  for (const username in report) {
      const userReport = report[username];
      userReport.estimatedCostSavings = (userReport.totalSavings / 1_000_000) * COST_PER_MILLION_TOKENS;
  }

  return report;
}


function exportReportToCsv(data: FullReport) {
    if (Object.keys(data).length === 0) {
      alert("No data to export.");
      return;
    }
  
    const headers = ['User', 'Total Prompts', 'Total Executions', 'Total Original Tokens', 'Total Optimized Tokens', 'Total Savings', 'Estimated Cost Savings ($)'];
    const rows = Object.entries(data).map(([user, userData]) => [
      `"${user.replace(/"/g, '""')}"`,
      userData.totalPrompts,
      userData.totalExecutions,
      userData.totalOriginalTokens,
      userData.totalOptimizedTokens,
      userData.totalSavings,
      userData.estimatedCostSavings.toFixed(6),
    ]);
  
    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'prompt-optimizer-report.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function formatTimeAgo(timestamp: number): string {
    const now = Date.now();
    const seconds = Math.floor((now - timestamp) / 1000);
    
    let interval = seconds / 31536000;
    if (interval > 1) {
      return Math.floor(interval) + " years ago";
    }
    interval = seconds / 2592000;
    if (interval > 1) {
      return Math.floor(interval) + " months ago";
    }
    interval = seconds / 86400;
    if (interval > 1) {
      return Math.floor(interval) + " days ago";
    }
    interval = seconds / 3600;
    if (interval > 1) {
      return Math.floor(interval) + " hours ago";
    }
    interval = seconds / 60;
    if (interval > 1) {
      return Math.floor(interval) + " minutes ago";
    }
    if (seconds < 10) return "just now";
    return Math.floor(seconds) + " seconds ago";
  }

// --- Helper Components ---

const Loader = () => (
  <div className="flex items-center justify-center space-x-2">
    <div className="w-4 h-4 rounded-full animate-pulse bg-blue-400"></div>
    <div className="w-4 h-4 rounded-full animate-pulse bg-blue-400 delay-200"></div>
    <div className="w-4 h-4 rounded-full animate-pulse bg-blue-400 delay-400"></div>
    <span className="text-gray-300">Optimizing...</span>
  </div>
);

const StatCard: React.FC<{ label: string; value: string | number; color: 'green' | 'blue' | 'purple' }> = ({ label, value, color }) => {
  const colorClasses = {
    green: 'bg-green-500/10 border-green-500/30 text-green-400',
    blue: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
    purple: 'bg-purple-500/10 border-purple-500/30 text-purple-400',
  };
  return (
    <div className={`p-4 rounded-lg border ${colorClasses[color]}`}>
      <p className="text-sm text-gray-400">{label}</p>
      <p className="text-3xl font-bold">{value}</p>
    </div>
  );
};

const PromptDisplay: React.FC<{ title: string; prompt: string; tokenCount: number }> = ({ title, prompt, tokenCount }) => (
  <div className="w-full bg-gray-800/50 border border-gray-700 rounded-lg p-4 space-y-3">
    <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-200">{title}</h3>
        <span className="text-sm font-medium text-blue-400 bg-blue-900/50 px-2 py-1 rounded">{tokenCount} tokens</span>
    </div>
    <p className="text-gray-300 whitespace-pre-wrap font-mono text-sm leading-relaxed">{prompt}</p>
  </div>
);

// --- User Management Component ---
interface UserManagementProps {
    users: UserProfile[];
    currentUser: string;
    onUserChange: (username: string) => void;
    onAddUser: (username: string) => Promise<void>;
    isLoading: boolean;
}

const UserManagement: React.FC<UserManagementProps> = ({ users, currentUser, onUserChange, onAddUser, isLoading }) => {
    const [newUsername, setNewUsername] = useState('');
    const [isAdding, setIsAdding] = useState(false);

    const handleAddUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newUsername.trim()) return;
        setIsAdding(true);
        try {
            await onAddUser(newUsername.trim());
            setNewUsername('');
        } catch (error) {
            alert(error instanceof Error ? error.message : "Failed to add user.");
        } finally {
            setIsAdding(false);
        }
    };

    return (
        <div className="space-y-2">
            <label htmlFor="user-select" className="block text-sm font-medium text-gray-300">
                User Profile
            </label>
            <div className="flex flex-col sm:flex-row gap-2 items-center">
                <div className="relative w-full sm:flex-1">
                     <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 pointer-events-none" />
                     <select
                        id="user-select"
                        value={currentUser}
                        onChange={(e) => onUserChange(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-gray-900 border border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none transition-shadow text-gray-200 appearance-none"
                        disabled={isLoading || users.length === 0}
                        aria-label="Select user"
                    >
                        {users.length === 0 ? <option>Add a user to begin</option> : users.map(user => (
                            <option key={user.id} value={user.name}>{user.name}</option>
                        ))}
                     </select>
                </div>
                <form onSubmit={handleAddUser} className="flex w-full sm:w-auto sm:flex-1 gap-2">
                     <input 
                        type="text"
                        value={newUsername}
                        onChange={(e) => setNewUsername(e.target.value)}
                        placeholder="Create new user..."
                        className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none transition-shadow text-gray-200 placeholder-gray-500"
                        disabled={isLoading || isAdding}
                     />
                     <button
                        type="submit"
                        disabled={isLoading || isAdding || !newUsername.trim()}
                        className="p-2.5 bg-blue-600 hover:bg-blue-500 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                        aria-label="Add new user"
                     >
                        {isAdding ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <PlusIcon className="w-5 h-5 text-white" />}
                     </button>
                </form>
            </div>
        </div>
    );
};

// --- Report Modal Component ---

const UsageReport: React.FC<{ 
    history: AnalysisRecord[]; 
    executionHistory: ExecutionRecord[];
    onClose: () => void; 
    onClear: () => void; 
}> = ({ history, executionHistory, onClose, onClear }) => {
    const [period, setPeriod] = useState<Period>('all');
    const data = useMemo(() => calculateReportData(history, executionHistory, period), [history, executionHistory, period]);
    const users = Object.keys(data).sort();

    const periodOptions: { key: Period, label: string }[] = [
        { key: 'day', label: 'Day' },
        { key: 'week', label: 'Week' },
        { key: 'month', label: 'Month' },
        { key: 'year', label: 'Year' },
        { key: 'all', label: 'All Time' },
    ];

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in" onClick={onClose} role="dialog" aria-modal="true">
            <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-full max-w-4xl m-4 animate-slide-up" onClick={(e) => e.stopPropagation()}>
                <header className="flex justify-between items-center p-4 border-b border-gray-700">
                    <h2 className="text-xl font-bold text-white">Usage Report</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors" aria-label="Close report"><CloseIcon className="w-6 h-6" /></button>
                </header>

                <div className="p-4 border-b border-gray-700">
                    <div className="flex items-center gap-2">
                        {periodOptions.map(opt => (
                            <button key={opt.key} onClick={() => setPeriod(opt.key)} className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${period === opt.key ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}>
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="p-6 max-h-[60vh] overflow-y-auto">
                    {users.length > 0 ? (
                        <table className="w-full text-left table-auto">
                            <thead className="text-xs text-gray-400 uppercase bg-gray-700/50">
                                <tr>
                                    <th className="px-4 py-3">User</th>
                                    <th className="px-4 py-3 text-center">Prompts</th>
                                    <th className="px-4 py-3 text-center">Executions</th>
                                    <th className="px-4 py-3 text-right">Original Tokens</th>
                                    <th className="px-4 py-3 text-right">Optimized Tokens</th>
                                    <th className="px-4 py-3 text-right">Total Savings</th>
                                    <th className="px-4 py-3 text-right">Est. Cost Savings</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700">
                                {users.map(user => (
                                    <tr key={user} className="hover:bg-gray-700/30">
                                        <td className="px-4 py-3 font-medium text-gray-200">{user}</td>
                                        <td className="px-4 py-3 text-center text-gray-300">{data[user].totalPrompts.toLocaleString()}</td>
                                        <td className="px-4 py-3 text-center text-gray-300">{data[user].totalExecutions.toLocaleString()}</td>
                                        <td className="px-4 py-3 text-right text-blue-400">{data[user].totalOriginalTokens.toLocaleString()}</td>
                                        <td className="px-4 py-3 text-right text-purple-400">{data[user].totalOptimizedTokens.toLocaleString()}</td>
                                        <td className="px-4 py-3 text-right font-bold text-green-400">{data[user].totalSavings.toLocaleString()}</td>
                                        <td className="px-4 py-3 text-right font-bold text-teal-400">{data[user].estimatedCostSavings.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 4 })}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : <p className="text-center text-gray-400 py-8">No usage data for the selected period.</p>}
                </div>
                
                {history.length > 0 && (
                    <footer className="p-4 border-t border-gray-700 flex justify-end gap-3">
                        <button onClick={() => exportReportToCsv(data)} className="flex items-center gap-2 bg-green-600/80 hover:bg-green-600 text-white font-semibold py-2 px-4 rounded-md transition-all text-sm focus:outline-none focus:ring-4 focus:ring-green-500/50"><DownloadIcon className="w-4 h-4" />Export to CSV</button>
                        <button onClick={onClear} className="flex items-center gap-2 bg-red-600/80 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-md transition-all text-sm focus:outline-none focus:ring-4 focus:ring-red-500/50"><TrashIcon className="w-4 h-4" />Clear All Data</button>
                    </footer>
                )}
            </div>
        </div>
    );
};

// --- Execution History Component ---
const ExecutionHistoryDisplay: React.FC<{ history: ExecutionRecord[]; currentUser: string }> = ({ history, currentUser }) => {
    const [filterByUser, setFilterByUser] = useState(true);

    const filteredHistory = useMemo(() => {
        const sortedHistory = [...history].sort((a, b) => b.timestamp - a.timestamp);
        if (filterByUser) {
            return sortedHistory.filter(record => record.username === currentUser);
        }
        return sortedHistory;
    }, [history, currentUser, filterByUser]);

    if (history.length === 0) {
        return null;
    }

    return (
        <div className="mt-6 w-full animate-fade-in space-y-4 pt-6 border-t border-gray-700/50">
            <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-gray-200">Execution History</h3>
                {currentUser && (
                    <div className="flex items-center space-x-2">
                        <label htmlFor="filter-toggle" className="text-sm text-gray-400 whitespace-nowrap">
                            Current user only
                        </label>
                        <button 
                            id="filter-toggle"
                            onClick={() => setFilterByUser(!filterByUser)}
                            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800 ${filterByUser ? 'bg-blue-600' : 'bg-gray-600'}`}
                            role="switch"
                            aria-checked={filterByUser}
                            aria-label={`Filter execution history for current user ${currentUser}`}
                        >
                            <span
                                aria-hidden="true"
                                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${filterByUser ? 'translate-x-5' : 'translate-x-0'}`}
                            />
                        </button>
                    </div>
                )}
            </div>
            
            {filteredHistory.length > 0 ? (
                <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                    {filteredHistory.map(record => (
                        <div key={record.id} className="bg-gray-800/50 border border-gray-700 rounded-lg p-3 text-left">
                            <div className="flex justify-between items-center mb-2">
                                <div className="flex items-center gap-2">
                                    <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                                        record.promptType === 'original'
                                            ? 'bg-blue-900 text-blue-300'
                                            : 'bg-purple-900 text-purple-300'
                                    }`}>
                                        {record.promptType.charAt(0).toUpperCase() + record.promptType.slice(1)}
                                    </span>
                                    {!filterByUser && (
                                        <div className="flex items-center text-xs text-gray-500" title={`Executed by ${record.username}`}>
                                            <UserIcon className="w-3 h-3 mr-1" />
                                            <span>{record.username}</span>
                                        </div>
                                    )}
                                </div>
                                <span className="text-xs text-gray-500">{formatTimeAgo(record.timestamp)}</span>
                            </div>
                            <p className="text-sm text-gray-400 truncate" title={record.resultText}>
                               <span className="font-semibold text-gray-300">Result:</span> "{record.resultText}"
                            </p>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-center text-gray-500 py-4">No execution history for the current filter.</div>
            )}
        </div>
    );
};


// --- Main App Component ---

export default function App() {
  const [prompt, setPrompt] = useState('');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [currentUser, setCurrentUser] = useState<string>('');
  const [analysisHistory, setAnalysisHistory] = useState<AnalysisRecord[]>([]);
  const [executionHistory, setExecutionHistory] = useState<ExecutionRecord[]>([]);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isReportVisible, setIsReportVisible] = useState(false);

  // State for executing prompts
  const [isExecuting, setIsExecuting] = useState<'original' | 'optimized' | null>(null);
  const [executionResult, setExecutionResult] = useState<string | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);


  useEffect(() => {
    async function loadInitialData() {
        setIsLoading(true);
        try {
            const [loadedUsers, loadedHistory, loadedExecHistory] = await Promise.all([
                getAllUsers(), 
                getAllHistory(), 
                getAllExecutionHistory()
            ]);
            setUsers(loadedUsers);
            setAnalysisHistory(loadedHistory);
            setExecutionHistory(loadedExecHistory);
            if (loadedUsers.length > 0) {
                setCurrentUser(loadedUsers[0].name);
            }
        } catch (err) {
            setError(err instanceof Error ? `Could not load data: ${err.message}` : "An unknown error occurred while loading data.");
        } finally {
            setIsLoading(false);
        }
    }
    loadInitialData();
  }, []);

  const handleAddUser = useCallback(async (name: string) => {
    const newUser = await addUser(name);
    setUsers(prev => [...prev, newUser].sort((a,b) => a.name.localeCompare(b.name)));
    setCurrentUser(newUser.name);
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!currentUser) {
      setError('Please select or create a user profile first.');
      return;
    }
    if (!prompt.trim()) {
      setError('Please enter a prompt to analyze.');
      return;
    }
    setIsLoading(true);
    setError(null);
    setResult(null);
    setExecutionResult(null);
    setExecutionError(null);

    try {
      const analysisResult = await analyzeAndOptimizePrompt(prompt);
      setResult(analysisResult);
      const newRecord = await addAnalysisRecord(currentUser, analysisResult);
      setAnalysisHistory(prev => [...prev, newRecord]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  }, [prompt, currentUser]);

  const handleExecutePrompt = useCallback(async (promptToExecute: string, type: 'original' | 'optimized') => {
    if (!promptToExecute.trim()) {
        setExecutionError('Prompt is empty.');
        return;
    }
    setIsExecuting(type);
    setExecutionResult(null);
    setExecutionError(null);

    try {
        const resultText = await executePrompt(promptToExecute);
        setExecutionResult(resultText);
        // Add to execution history
        const newRecord = await addExecutionRecord(currentUser, type, promptToExecute, resultText);
        setExecutionHistory(prev => [newRecord, ...prev]);
    } catch (err) {
        setExecutionError(err instanceof Error ? err.message : 'An unexpected error occurred during execution.');
    } finally {
        setIsExecuting(null);
    }
}, [currentUser]);

  const handleClearReport = async () => {
    if (!window.confirm("Are you sure you want to delete ALL users and report data? This action cannot be undone.")) return;
    try {
        await clearAllData();
        setUsers([]);
        setAnalysisHistory([]);
        setExecutionHistory([]);
        setCurrentUser('');
        setIsReportVisible(false);
    } catch (err) {
        setError(err instanceof Error ? `Could not clear data: ${err.message}` : "An unknown error occurred.");
    }
  };

  const handleClearPrompt = useCallback(() => {
    setPrompt('');
    setResult(null);
    setError(null);
    setExecutionResult(null);
    setExecutionError(null);
    setIsExecuting(null);
  }, []);

  const tokenSavings = result ? result.originalTokenCount - result.optimizedTokenCount : 0;
  const percentageSavings = result && result.originalTokenCount > 0
    ? ((tokenSavings / result.originalTokenCount) * 100).toFixed(1)
    : 0;

  return (
    <>
      <main className="min-h-screen bg-gray-900 text-white font-sans p-4 sm:p-6 lg:p-8">
        <div className="max-w-4xl mx-auto flex flex-col items-center">
          
          <header className="w-full flex justify-between items-center my-8 text-center">
            <div className="w-24"></div> {/* Spacer */}
            <div className="flex flex-col items-center">
              <div className="inline-flex items-center gap-3 mb-3">
                <SparklesIcon className="w-8 h-8 text-purple-400"/>
                <h1 className="text-4xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-500">Prompt Optimizer</h1>
              </div>
              <p className="text-lg text-gray-400 max-w-2xl">Refine your Gemini prompts for maximum efficiency. Reduce token usage and get clearer results.</p>
            </div>
            <div className="w-24 flex justify-end">
                <button onClick={() => setIsReportVisible(true)} className="flex items-center gap-2 bg-gray-700/50 hover:bg-gray-700 text-gray-300 font-semibold py-2 px-4 rounded-lg transition-all" aria-label="View usage report">
                    <ChartBarIcon className="w-5 h-5" /><span>Report</span>
                </button>
            </div>
          </header>

          <div className="w-full bg-gray-800 border border-gray-700 rounded-xl shadow-2xl shadow-blue-900/20 p-6 space-y-4">
            <UserManagement users={users} currentUser={currentUser} onUserChange={setCurrentUser} onAddUser={handleAddUser} isLoading={isLoading} />
            <div>
              <div className="flex justify-between items-center mb-2">
                <label htmlFor="prompt-input" className="block text-sm font-medium text-gray-300">Enter your prompt</label>
                {(prompt || result) && (
                    <button
                        onClick={handleClearPrompt}
                        className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors font-medium rounded-md px-2 py-1 hover:bg-gray-700/50"
                        aria-label="Clear prompt and start new"
                    >
                        <RotateCcwIcon className="w-4 h-4" />
                        <span>New Prompt</span>
                    </button>
                )}
              </div>
              <textarea id="prompt-input" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="e.g., Explain the theory of relativity to me like I'm five..." className="w-full h-40 p-4 bg-gray-900 border border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none transition-shadow text-gray-200 placeholder-gray-500 resize-none" disabled={isLoading} />
            </div>
            <button onClick={handleAnalyze} disabled={isLoading || !currentUser} className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-bold py-3 px-4 rounded-md transition-all duration-300 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-4 focus:ring-blue-500/50 transform hover:scale-105">
              {isLoading && !result ? <Loader /> : <><MagicWandIcon className="w-5 h-5" /><span>Analyze & Optimize</span></>}
            </button>
          </div>

          {error && <div className="mt-6 w-full bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg text-center"><p><strong>Error:</strong> {error}</p></div>}
          
          {isLoading && !result && <div className="mt-8"><Loader /></div>}

          {result && (
            <div className="mt-8 w-full animate-fade-in space-y-6">
              <h2 className="text-2xl font-bold text-center text-gray-200">Analysis Results for <span className="text-purple-400">{currentUser}</span></h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard label="Original Tokens" value={result.originalTokenCount} color="blue" />
                <StatCard label="Optimized Tokens" value={result.optimizedTokenCount} color="purple" />
                <StatCard label="Tokens Saved" value={`${tokenSavings} (${percentageSavings}%)`} color="green" />
              </div>
              <div className="space-y-4">
                  <PromptDisplay title="Original Prompt" prompt={prompt} tokenCount={result.originalTokenCount} />
                  <PromptDisplay title="✨ Optimized Prompt" prompt={result.optimizedPrompt} tokenCount={result.optimizedTokenCount} />
              </div>
              <div className="w-full bg-gray-800/50 border border-gray-700 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-gray-200 mb-2">Explanation</h3>
                  <div className="prose prose-invert prose-sm text-gray-300" dangerouslySetInnerHTML={{ __html: result.explanation.replace(/\n/g, '<br />') }} />
              </div>
              
              {/* --- EXECUTION SECTION --- */}
              <div className="mt-6 w-full animate-fade-in space-y-4 pt-6 border-t border-gray-700/50">
                  <h3 className="text-xl font-bold text-center text-gray-200">Execute Prompt</h3>
                  <div className="flex flex-col sm:flex-row gap-4">
                      <button
                          onClick={() => handleExecutePrompt(prompt, 'original')}
                          disabled={!!isExecuting}
                          className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 px-4 rounded-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                          {isExecuting === 'original' ? (
                              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          ) : (
                              <PlayIcon className="w-5 h-5" />
                          )}
                          <span>Execute Original</span>
                      </button>
                      <button
                          onClick={() => handleExecutePrompt(result.optimizedPrompt, 'optimized')}
                          disabled={!!isExecuting}
                          className="flex-1 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold py-2 px-4 rounded-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                          {isExecuting === 'optimized' ? (
                              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          ) : (
                              <PlayIcon className="w-5 h-5" />
                          )}
                          <span>Execute Optimized</span>
                      </button>
                  </div>

                  {executionError && (
                      <div className="mt-4 w-full bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg text-center">
                          <p><strong>Execution Error:</strong> {executionError}</p>
                      </div>
                  )}

                  {(isExecuting || executionResult) && (
                      <div className="mt-4 w-full bg-gray-800/50 border border-gray-700 rounded-lg p-4">
                          <h4 className="text-lg font-semibold text-gray-200 mb-2">Execution Result</h4>
                          {isExecuting && !executionResult && (
                              <div className="flex items-center justify-center space-x-2 py-4">
                                  <div className="w-2 h-2 rounded-full animate-pulse bg-gray-400"></div>
                                  <div className="w-2 h-2 rounded-full animate-pulse bg-gray-400 delay-100"></div>
                                  <div className="w-2 h-2 rounded-full animate-pulse bg-gray-400 delay-200"></div>
                                  <span className="text-gray-400 text-sm">Waiting for response...</span>
                              </div>
                          )}
                          {executionResult && (
                              <div className="prose prose-invert prose-sm text-gray-300 whitespace-pre-wrap">{executionResult}</div>
                          )}
                      </div>
                  )}
              </div>
              
              {/* --- EXECUTION HISTORY --- */}
              <ExecutionHistoryDisplay history={executionHistory} currentUser={currentUser} />
            </div>
          )}
        </div>
      </main>
      
      {isReportVisible && <UsageReport history={analysisHistory} executionHistory={executionHistory} onClose={() => setIsReportVisible(false)} onClear={handleClearReport} />}
    </>
  );
}