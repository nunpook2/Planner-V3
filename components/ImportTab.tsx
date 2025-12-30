
import React, { useState, useCallback, useMemo } from 'react';
import type { RawTask, GroupedTask } from '../types';
import { TaskCategory } from '../types';
import { addCategorizedTask } from '../services/dataService';
import { ChevronDownIcon, UploadIcon, DownloadIcon, RefreshIcon, SparklesIcon } from './common/Icons';

declare const XLSX: any;

interface ImportTabProps {
    onTasksUpdated: () => void;
}

const VISIBLE_COLUMNS = [
    'Request ID', 'Sample Name', 'Description', 'Variant', 'Note to planer', 
    'Additional Information', 'Remark (Requester)', 'Testing Condition', 
    'Due date', 'Priority', 'Purpose', 'SDIDATAID'
];

const formatDate = (dateString: string | number) => {
    if (!dateString) return '';
    if (typeof dateString === 'number') {
        const excelEpoch = new Date(1899, 11, 30);
        const date = new Date(excelEpoch.getTime() + dateString * 86400000);
        if (isNaN(date.getTime())) return dateString.toString();
        return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    }
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
};

const getTaskValue = (task: RawTask, header: string): string | number => {
    const lowerCaseHeader = header.toLowerCase().trim();
    const key = Object.keys(task).find(k => k.toLowerCase().trim() === lowerCaseHeader);
    return key ? task[key] : '';
};

const isValidTask = (task: RawTask): boolean => {
    const desc = String(getTaskValue(task, 'Description') || '').trim();
    const variant = String(getTaskValue(task, 'Variant') || '').trim();
    const sampleName = String(getTaskValue(task, 'Sample Name') || '').trim();
    
    const garbageValues = ['0', '-', 'n/a', 'nil', 'none', 'nan', 'null'];
    if (garbageValues.includes(desc.toLowerCase())) return false;
    if (garbageValues.includes(variant.toLowerCase())) return false;

    if (!desc && !variant) return false;
    
    const reqId = String(getTaskValue(task, 'Request ID') || '');
    if (sampleName === reqId) return false;

    return true;
};

const generateId = () => Math.random().toString(36).substring(2) + Date.now().toString(36);

const ImportTab: React.FC<ImportTabProps> = ({ onTasksUpdated }) => {
    const [rawTasks, setRawTasks] = useState<RawTask[]>([]);
    const [headers, setHeaders] = useState<string[]>([]);
    const [excludedColumns, setExcludedColumns] = useState<Set<string>>(new Set());
    const [isProcessing, setIsProcessing] = useState(false);
    const [groupedTasks, setGroupedTasks] = useState<GroupedTask[]>([]);
    const [fileName, setFileName] = useState('');
    const [globalFilter, setGlobalFilter] = useState('');

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setFileName(file.name);
        const reader = new FileReader();
        reader.onload = (e) => {
            const data = e.target?.result;
            const workbook = XLSX.read(data, { type: 'binary' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const json: RawTask[] = XLSX.utils.sheet_to_json(worksheet);

            if (json.length > 0) {
                setRawTasks(json);
                const firstRowHeaders = Object.keys(json[0]);
                setHeaders(firstRowHeaders);
                
                const normalizedVisibleColumns = new Set(VISIBLE_COLUMNS.map(h => h.toLowerCase().trim()));
                const initialExclusions = new Set<string>();
                firstRowHeaders.forEach(header => {
                    if (!normalizedVisibleColumns.has(header.toLowerCase().trim())) {
                        initialExclusions.add(header);
                    }
                });
                setExcludedColumns(initialExclusions);
            }
        };
        reader.readAsBinaryString(file);
    };

    const toggleColumnExclusion = (header: string) => {
        setExcludedColumns(prev => {
            const newSet = new Set(prev);
            if (newSet.has(header)) newSet.delete(header);
            else newSet.add(header);
            return newSet;
        });
    };

    const processData = useCallback(() => {
        setIsProcessing(true);
        const processedTasks: RawTask[] = [];

        rawTasks.forEach(task => {
            const baseTask: RawTask = {};
            for (const key in task) {
                if (!excludedColumns.has(key)) baseTask[key] = task[key];
            }

            if (!isValidTask(baseTask)) return;

            const desc = String(getTaskValue(baseTask, 'Description') || '').trim();
            const SPECIAL_KEYWORD = "การสกัด EbP,hPP ใน ICP";

            if (desc === SPECIAL_KEYWORD) {
                const task1 = { ...baseTask, _id: generateId() };
                const variantKey = Object.keys(baseTask).find(k => k.toLowerCase() === 'variant') || 'Variant';
                task1[variantKey] = "ICP-PER";
                processedTasks.push(task1);

                const task2 = { ...baseTask, _id: generateId() };
                task2[variantKey] = "ICP-HppEbp";
                processedTasks.push(task2);
            } else {
                processedTasks.push({ ...baseTask, _id: generateId() });
            }
        });

        const grouped: Record<string, RawTask[]> = {};
        for (const task of processedTasks) {
            const requestId = String(getTaskValue(task, 'Request ID') || `no-id-${Math.random()}`);
            if (!grouped[requestId]) grouped[requestId] = [];
            grouped[requestId].push(task);
        }

        const result: GroupedTask[] = Object.entries(grouped).map(([id, tasks]) => ({ id, tasks }));
        setGroupedTasks(result);
        setIsProcessing(false);
    }, [rawTasks, excludedColumns]);

    const filteredGroupedTasks = useMemo(() => {
        if (!globalFilter.trim()) return groupedTasks;
        const search = globalFilter.toLowerCase();
        return groupedTasks.filter(gt => {
            // Check ID
            if (gt.id.toLowerCase().includes(search)) return true;
            // Check any column in any task
            return gt.tasks.some(task => 
                Object.values(task).some(val => String(val).toLowerCase().includes(search))
            );
        });
    }, [groupedTasks, globalFilter]);

    const handleCategorize = async (groupedTask: GroupedTask, category: TaskCategory) => {
        try {
            const taskToSave = { tasks: groupedTask.tasks, category, id: groupedTask.id };
            await addCategorizedTask(taskToSave);
            setGroupedTasks(prev => prev.filter(t => t.id !== groupedTask.id));
            onTasksUpdated();
        } catch (error) {
            console.error(`Error moving task to ${category}:`, error);
        }
    };

    const handleExport = () => {
        if (groupedTasks.length === 0) return;
        const data = groupedTasks.flatMap(gt => gt.tasks);
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Processed Data");
        XLSX.writeFile(wb, `ProcessedImport_${new Date().toISOString().split('T')[0]}.xlsx`);
    };
    
    return (
        <div className="space-y-8 animate-slide-in-up p-4">
            <div className="flex justify-between items-start">
                <div>
                    <h2 className="text-3xl font-black text-base-950 dark:text-base-50 tracking-tighter">Mission Intake</h2>
                    <p className="text-base-500 mt-1 font-medium">Import new laboratory requests and triage them into deployment categories.</p>
                </div>
                {groupedTasks.length > 0 && (
                    <button onClick={handleExport} className="flex items-center gap-2 px-6 py-3 bg-white dark:bg-base-800 border-2 border-base-200 dark:border-base-700 rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-base-50 transition-all shadow-md active:scale-95">
                        <DownloadIcon className="h-4 w-4" /> Export Pre-Triaged
                    </button>
                )}
            </div>
            
            <div className="p-10 border-2 border-dashed border-base-300 dark:border-base-700 rounded-[2.5rem] text-center bg-white/40 dark:bg-base-900/40 backdrop-blur-md transition-all hover:border-primary-400 group relative">
                <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center justify-center space-y-4">
                    <div className="p-5 bg-primary-50 dark:bg-primary-900/30 rounded-3xl text-primary-600 group-hover:scale-110 transition-transform">
                        <UploadIcon className="h-12 w-12" />
                    </div>
                    <div className="space-y-1">
                        <span className="text-lg font-black text-primary-700 dark:text-primary-400 block">{fileName ? 'File Ready' : 'Load Mission Data'}</span>
                        <span className="text-sm text-base-400 font-bold uppercase tracking-widest block">Drop Excel file or click to browse</span>
                    </div>
                </label>
                <input id="file-upload" type="file" accept=".xlsx, .xls" onChange={handleFileUpload} className="hidden" />
                {fileName && <p className="mt-4 text-xs text-base-500 font-black bg-base-100 dark:bg-base-800 inline-block px-4 py-2 rounded-full border border-base-200 dark:border-base-700">TARGET: <span className="text-primary-600">{fileName}</span></p>}
            </div>

            {headers.length > 0 && (
                <div className="bg-white dark:bg-base-900 rounded-[2rem] p-8 border border-base-200 dark:border-base-800 shadow-xl space-y-6">
                    <div className="flex items-center gap-4 border-l-4 border-primary-500 pl-4">
                        <h3 className="text-[10px] font-black text-base-400 uppercase tracking-[0.3em]">Data Sanitization</h3>
                        <span className="text-xs font-bold text-base-600">Select columns to exclude from processing</span>
                    </div>
                    <div className="flex flex-wrap gap-2.5">
                        {headers.map(header => (
                            <button
                                key={header}
                                onClick={() => toggleColumnExclusion(header)}
                                className={`px-4 py-2 text-xs font-black rounded-xl transition-all border-2 uppercase tracking-widest active:scale-95 ${
                                    excludedColumns.has(header) 
                                        ? 'bg-red-50 border-red-200 text-red-600' 
                                        : 'bg-white dark:bg-base-800 text-base-700 dark:text-base-300 border-base-200 dark:border-base-700 hover:border-primary-400'
                                }`}
                            >
                                {header}
                            </button>
                        ))}
                    </div>
                     <button onClick={processData} disabled={isProcessing} className="w-full px-8 py-5 bg-primary-600 text-white font-black rounded-2xl shadow-xl hover:bg-primary-700 transition-all disabled:opacity-50 text-sm uppercase tracking-[0.2em] active:scale-[0.98] border-b-4 border-primary-800">
                        {isProcessing ? (
                            <div className="flex items-center justify-center gap-3"><RefreshIcon className="h-5 w-5 animate-spin" /> Analyzing Structure...</div>
                        ) : 'Process & Generate Queue'}
                    </button>
                </div>
            )}
            
            {groupedTasks.length > 0 && (
                <div className="space-y-6 animate-fade-in">
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                        <div className="space-y-1">
                            <h2 className="text-2xl font-black text-base-950 dark:text-base-50 tracking-tighter">Queue Triage</h2>
                            <p className="text-base-400 font-bold uppercase tracking-widest text-[10px]">Triage requests into priority deployment boxes.</p>
                        </div>
                        <div className="relative w-full md:w-80 group">
                            <input 
                                type="text" 
                                placeholder="Search all columns..." 
                                value={globalFilter}
                                onChange={e => setGlobalFilter(e.target.value)}
                                className="w-full pl-11 pr-4 py-3.5 bg-white dark:bg-base-900 border-2 border-base-200 dark:border-base-700 rounded-2xl text-sm font-black focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 outline-none transition-all placeholder:text-base-300"
                            />
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-base-300 group-focus-within:text-primary-500 transition-colors">
                                <SparklesIcon className="h-5 w-5" />
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                        {filteredGroupedTasks.length === 0 ? (
                            <div className="py-20 text-center bg-base-50 dark:bg-base-900/50 rounded-[3rem] border-2 border-dashed border-base-200 dark:border-base-800">
                                <p className="text-base-400 font-black uppercase tracking-widest">No matches found in intake queue</p>
                            </div>
                        ) : filteredGroupedTasks.map((groupedTask) => {
                             // Global content scan for keywords
                             const allRawContent = groupedTask.tasks.map(task => 
                                Object.values(task).map(val => String(val).toLowerCase()).join(' ')
                             ).join(' ');

                             const isUrgent = allRawContent.includes('urgent');
                             const isSprint = allRawContent.includes('sprint');
                             const isLSP = allRawContent.includes('lsp');
                             const isPoCat = allRawContent.includes('pocat') || allRawContent.includes('po cat');

                            const handleButtonClick = (e: React.MouseEvent, category: TaskCategory) => { e.stopPropagation(); handleCategorize(groupedTask, category); };

                            return (
                            <details key={groupedTask.id} className="bg-white dark:bg-base-800 rounded-[2.5rem] shadow-lg group border-2 border-transparent hover:border-primary-500/20 overflow-hidden transition-all duration-300">
                                <summary className="p-6 cursor-pointer list-none flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-colors hover:bg-base-50 dark:hover:bg-base-700/50">
                                    <div className="flex items-center gap-5 w-full md:w-auto">
                                        <div className="p-2.5 bg-base-100 dark:bg-base-700 rounded-xl group-open:rotate-180 transition-transform shadow-inner">
                                            <ChevronDownIcon className="h-5 w-5 text-base-400"/>
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-3">
                                                <span className="text-[17px] font-black text-base-950 dark:text-base-50 tracking-tighter leading-none">{groupedTask.id}</span>
                                                <span className="text-[10px] font-black text-base-400 uppercase tracking-widest">({groupedTask.tasks.length} items)</span>
                                            </div>
                                            <div className="flex flex-wrap gap-2 mt-2">
                                                {isSprint && <span className="px-2.5 py-1 text-[9px] font-black text-white bg-rose-600 rounded-lg issue-badge-premium uppercase tracking-[0.15em] shadow-lg shadow-rose-500/20">Sprint</span>}
                                                {isUrgent && <span className="px-2.5 py-1 text-[9px] font-black text-white bg-orange-600 rounded-lg uppercase tracking-[0.15em] shadow-lg shadow-orange-500/20">Urgent</span>}
                                                {isLSP && <span className="px-2.5 py-1 text-[9px] font-black text-white bg-cyan-600 rounded-lg uppercase tracking-[0.15em] shadow-lg shadow-cyan-500/20">LSP</span>}
                                                {isPoCat && <span className="px-2.5 py-1 text-[9px] font-black text-white bg-violet-600 rounded-lg uppercase tracking-[0.15em] shadow-lg shadow-violet-500/20">PoCat</span>}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
                                        <button onClick={(e) => handleButtonClick(e, TaskCategory.Urgent)} className="flex-1 md:flex-none px-5 py-2.5 text-[10px] font-black bg-status-urgent text-white rounded-xl shadow-xl hover:brightness-110 active:scale-95 transition-all uppercase tracking-widest border-b-4 border-red-700">Urgent</button>
                                        <button onClick={(e) => handleButtonClick(e, TaskCategory.Normal)} className="flex-1 md:flex-none px-5 py-2.5 text-[10px] font-black bg-status-normal text-white rounded-xl shadow-xl hover:brightness-110 active:scale-95 transition-all uppercase tracking-widest border-b-4 border-blue-700">Normal</button>
                                        <button onClick={(e) => handleButtonClick(e, TaskCategory.PoCat)} className="flex-1 md:flex-none px-5 py-2.5 text-[10px] font-black bg-status-pocat text-white rounded-xl shadow-xl hover:brightness-110 active:scale-95 transition-all uppercase tracking-widest border-b-4 border-orange-700">PoCat</button>
                                        <button onClick={(e) => handleButtonClick(e, TaskCategory.Manual)} className="flex-1 md:flex-none px-5 py-2.5 text-[10px] font-black bg-status-manual text-white rounded-xl shadow-xl hover:brightness-110 active:scale-95 transition-all uppercase tracking-widest border-b-4 border-purple-700">Manual</button>
                                    </div>
                                </summary>
                                <div className="p-2 border-t-2 border-base-50 dark:border-base-700 bg-base-50/30">
                                    <div className="overflow-x-auto rounded-3xl border border-base-100 dark:border-base-800 bg-white dark:bg-base-900 custom-scrollbar">
                                        <table className="min-w-full text-[11px] text-left border-collapse">
                                            <thead>
                                                <tr className="bg-base-100/50 dark:bg-base-800/50">
                                                    {VISIBLE_COLUMNS.map(h => <th key={h} className="p-4 font-black text-base-400 uppercase tracking-widest border-b border-base-200 dark:border-base-700">{h}</th>)}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-base-50 dark:divide-base-800">
                                                {groupedTask.tasks.map((task, index) => (
                                                    <tr key={index} className="hover:bg-base-50/50 dark:hover:bg-base-800/50 transition-colors">
                                                        {VISIBLE_COLUMNS.map(h => (
                                                            <td key={h} className="p-4 font-bold text-base-800 dark:text-base-200 max-w-[200px] truncate">
                                                                {h === 'Due date' ? formatDate(getTaskValue(task, h)) : String(getTaskValue(task, h) || '-')}
                                                            </td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </details>
                        )})}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ImportTab;
