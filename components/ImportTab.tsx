
import React, { useState, useCallback } from 'react';
import type { RawTask, GroupedTask } from '../types';
import { TaskCategory } from '../types';
import { addCategorizedTask } from '../services/dataService';
import { ChevronDownIcon, UploadIcon } from './common/Icons';

declare const XLSX: any;

interface ImportTabProps {
    onTasksUpdated: () => void;
}

const VISIBLE_COLUMNS = [
    'Request ID', 'Sample Name', 'Description', 'Variant', 'Note to planer', 
    'Additional Information', 'Remark (Requester)', 'Testing Condition', 
    'Due finish', 'Priority', 'Purpose', 'SDIDATAID'
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
    
    return (
        <div className="space-y-8 animate-slide-in-up">
            <div>
                <h2 className="text-2xl font-bold text-base-800 dark:text-base-200">1. Import & Process Data</h2>
                <p className="text-base-500 mt-1">Select an Excel file, choose columns to exclude, and process the data.</p>
            </div>
            
            <div className="p-6 border-2 border-dashed border-base-300 dark:border-base-600 rounded-xl text-center bg-base-50 dark:bg-base-800/50 transition-colors hover:border-primary-400 dark:hover:border-primary-500">
                <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center justify-center space-y-2">
                    <UploadIcon className="h-10 w-10 text-primary-500" />
                    <span className="font-semibold text-primary-600 dark:text-primary-400">{fileName ? 'Change File' : 'Click to Upload'}</span>
                    <span className="text-sm text-base-500">or drag and drop an Excel file</span>
                </label>
                <input id="file-upload" type="file" accept=".xlsx, .xls" onChange={handleFileUpload} className="hidden" />
                {fileName && <p className="mt-3 text-sm text-base-500 font-medium">Selected: <span className="text-primary-700 dark:text-primary-300">{fileName}</span></p>}
            </div>

            {headers.length > 0 && (
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Select columns to exclude:</h3>
                    <div className="flex flex-wrap gap-2">
                        {headers.map(header => (
                            <button
                                key={header}
                                onClick={() => toggleColumnExclusion(header)}
                                className={`px-3 py-1.5 text-sm font-medium rounded-full transition-all duration-200 ${
                                    excludedColumns.has(header) ? 'bg-status-urgent text-white shadow-sm' : 'bg-base-200 dark:bg-base-700 text-base-700 dark:text-base-300 hover:bg-base-300 dark:hover:bg-base-600'
                                }`}
                            >
                                {header}
                            </button>
                        ))}
                    </div>
                     {/* FIXED: Changed from secondary-500/600 to primary-600/700 to ensure visibility */}
                     <button onClick={processData} disabled={isProcessing} className="w-full px-4 py-3 bg-gradient-to-r from-primary-600 to-primary-700 text-white font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 shadow-md">
                        {isProcessing ? 'Processing...' : 'Process Data'}
                    </button>
                </div>
            )}
            
            {groupedTasks.length > 0 && (
                <div className="space-y-6">
                    <div>
                        <h2 className="text-2xl font-bold text-base-800 dark:text-base-200 mt-8">2. Categorize Tasks</h2>
                        <p className="text-base-500 mt-1">Click a category button to move a task group to the assignment queue.</p>
                    </div>
                    <div className="space-y-3">
                        {groupedTasks.map((groupedTask) => {
                             const isUrgent = groupedTask.tasks.some(task => String(getTaskValue(task, 'Priority')).toLowerCase() === 'urgent');
                             const isSprint = groupedTask.tasks.some(task => String(getTaskValue(task, 'Purpose')).toLowerCase() === 'sprint');
                             
                             const checkFields = ['Purpose', 'Priority', 'Remark (Requester)', 'Note to planer', 'Additional Information'];
                             
                             // Robust LSP detection
                             const isLSP = groupedTask.tasks.some(task => {
                                return checkFields.some(f => String(getTaskValue(task, f)).toLowerCase().includes('lsp'));
                             });
                             
                             // Robust PoCat detection (ignores spaces/case)
                             const isPoCat = groupedTask.tasks.some(task => {
                                return checkFields.some(f => {
                                    const val = String(getTaskValue(task, f)).toLowerCase().replace(/\s/g, '');
                                    return val.includes('pocat');
                                });
                             });

                            const handleButtonClick = (e: React.MouseEvent, category: TaskCategory) => { e.stopPropagation(); handleCategorize(groupedTask, category); };

                            return (
                            <details key={groupedTask.id} className="bg-white dark:bg-base-700 rounded-lg shadow-sm group border dark:border-base-600 overflow-hidden">
                                <summary className="p-4 font-semibold text-base-800 dark:text-base-200 cursor-pointer list-none flex justify-between items-center transition-colors hover:bg-base-50 dark:hover:bg-base-600">
                                    <div className="flex items-center gap-4">
                                        <ChevronDownIcon className="h-5 w-5 text-base-400 group-open:rotate-180 transition-transform"/>
                                        <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3">
                                            <span className="font-bold">Request ID: {groupedTask.id}</span>
                                            <span className="text-sm text-base-500">({groupedTask.tasks.length} items)</span>
                                        </div>
                                         {isSprint && <span className="px-2 py-1 text-xs font-semibold text-white bg-status-urgent rounded-full animate-pulse-subtle">Sprint</span>}
                                         {isUrgent && !isSprint && <span className="px-2 py-1 text-xs font-semibold text-white bg-status-urgent rounded-full animate-pulse-subtle">Urgent</span>}
                                         {isLSP && <span className="px-2 py-1 text-xs font-semibold text-white bg-status-lsp rounded-full shadow-sm">LSP</span>}
                                         {isPoCat && <span className="px-2 py-1 text-xs font-semibold text-white bg-status-pocat rounded-full shadow-sm">PoCat</span>}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button onClick={(e) => handleButtonClick(e, TaskCategory.Urgent)} className="px-3 py-1.5 text-xs font-semibold bg-status-urgent text-white rounded-md hover:opacity-90 transition-opacity">Urgent</button>
                                        <button onClick={(e) => handleButtonClick(e, TaskCategory.Normal)} className="px-3 py-1.5 text-xs font-semibold bg-status-normal text-white rounded-md hover:opacity-90 transition-opacity">Normal</button>
                                        <button onClick={(e) => handleButtonClick(e, TaskCategory.PoCat)} className="px-3 py-1.5 text-xs font-semibold bg-status-pocat text-white rounded-md hover:opacity-90 transition-opacity">PoCat</button>
                                        <button onClick={(e) => handleButtonClick(e, TaskCategory.Manual)} className="px-3 py-1.5 text-xs font-semibold bg-status-manual text-white rounded-md hover:opacity-90 transition-opacity">Manual</button>
                                    </div>
                                </summary>
                                <div className="p-4 border-t border-base-200 dark:border-base-600">
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full text-sm text-left">
                                            <thead className="bg-base-100 dark:bg-base-600">
                                                <tr>{VISIBLE_COLUMNS.map(h => <th key={h} className="p-3 font-semibold text-base-600 dark:text-base-300 uppercase tracking-wider">{h}</th>)}</tr>
                                            </thead>
                                            <tbody>
                                                {groupedTask.tasks.map((task, index) => (
                                                    <tr key={index} className="border-b dark:border-base-600 last:border-b-0 hover:bg-base-50 dark:hover:bg-base-600/50">
                                                        {VISIBLE_COLUMNS.map(h => (
                                                            <td key={h} className="p-3">{h === 'Due finish' ? formatDate(getTaskValue(task, h)) : String(getTaskValue(task, h) || '')}</td>
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
