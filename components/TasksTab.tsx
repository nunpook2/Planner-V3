
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import type { Tester, CategorizedTask, DailySchedule, RawTask, AssignedTask, TestMapping } from '../types';
import { TaskCategory, TaskStatus } from '../types';
import { 
    getCategorizedTasks, 
    getDailySchedule, 
    addAssignedTask, 
    deleteCategorizedTask, 
    updateCategorizedTask,
    assignItemsToPrepare,
    getTestMappings,
    addCategorizedTask as saveCategorizedTask
} from '../services/dataService';
import { CheckCircleIcon, ChevronDownIcon, TrashIcon, AlertTriangleIcon, RefreshIcon, PlusIcon, DragHandleIcon, DownloadIcon, ArrowUturnLeftIcon, ChatBubbleLeftEllipsisIcon, SparklesIcon, XCircleIcon, BeakerIcon, ClipboardListIcon } from './common/Icons';

declare const XLSX: any;

// --- HEADER THEMES ---
const HEADER_THEMES = [
    { name: 'Indigo', headerBg: 'bg-indigo-700', headerText: 'text-white', borderColor: 'border-indigo-500', subHeaderBg: 'bg-indigo-100 dark:bg-indigo-900', subHeaderText: 'text-indigo-950 dark:text-indigo-50' },
    { name: 'Emerald', headerBg: 'bg-emerald-700', headerText: 'text-white', borderColor: 'border-emerald-500', subHeaderBg: 'bg-emerald-100 dark:bg-emerald-900', subHeaderText: 'text-emerald-950 dark:text-indigo-50' },
    { name: 'Amber', headerBg: 'bg-amber-600', headerText: 'text-white', borderColor: 'border-amber-400', subHeaderBg: 'bg-amber-100 dark:bg-amber-900', subHeaderText: 'text-amber-950 dark:text-indigo-50' },
    { name: 'Rose', headerBg: 'bg-rose-700', headerText: 'text-white', borderColor: 'border-rose-500', subHeaderBg: 'bg-rose-100 dark:bg-rose-900', subHeaderText: 'text-rose-950 dark:text-indigo-50' },
    { name: 'Cyan', headerBg: 'bg-cyan-700', headerText: 'text-white', borderColor: 'border-cyan-500', subHeaderBg: 'bg-cyan-100 dark:bg-cyan-900', subHeaderText: 'text-cyan-950 dark:text-indigo-50' },
    { name: 'Violet', headerBg: 'bg-violet-700', headerText: 'text-white', borderColor: 'border-violet-500', subHeaderBg: 'bg-violet-100 dark:bg-violet-900', subHeaderText: 'text-violet-950 dark:text-indigo-50' },
];

// --- CONSTANTS FOR LAYOUT ---
const COL_DUE_WIDTH = 80;
const COL_RID_WIDTH = 200; 

// --- UTILITY FUNCTIONS ---

const parseFlexibleDate = (dateValue: any): Date | null => {
    if (dateValue === undefined || dateValue === null || dateValue === '') return null;
    if (dateValue instanceof Date) return dateValue;
    if (typeof dateValue === 'object') {
        if (typeof dateValue.toDate === 'function') return dateValue.toDate();
        if (dateValue.seconds !== undefined) return new Date(dateValue.seconds * 1000);
        if (dateValue._seconds !== undefined) return new Date(dateValue._seconds * 1000);
    }
    if (typeof dateValue === 'number') {
        const excelEpoch = new Date(Date.UTC(1899, 11, 30));
        return new Date(excelEpoch.getTime() + dateValue * 24 * 60 * 60 * 1000);
    }
    const strVal = String(dateValue).trim();
    if (!strVal) return null;
    
    const datePart = strVal.split(/\s+/)[0]; 
    const parts = datePart.split(/[\/\-.]/);
    if (parts.length === 3) {
         let d, m, y;
         if (parts[0].length === 4) { y = parseInt(parts[0], 10); m = parseInt(parts[1], 10); d = parseInt(parts[2], 10); }
         else { d = parseInt(parts[0], 10); m = parseInt(parts[1], 10); y = parseInt(parts[2], 10); }
         if (y < 100) y += 2000;
         if (y > 1900 && m > 0 && m <= 12 && d > 0 && d <= 31) {
            const result = new Date(y, m - 1, d);
            if (!isNaN(result.getTime())) return result;
         }
    }
    let date = new Date(strVal);
    if (!isNaN(date.getTime())) return date;
    return null;
};

const getTaskValue = (task: RawTask, headerType: string): any => {
    if (!task) return '';
    const keys = Object.keys(task);
    const target = headerType.toLowerCase().trim();
    if (target === 'due date' || target === 'due') {
        const priorities = ['due date', 'due finish', 'due', 'deadline', 'requested date', 'target date', 'target'];
        for (const p of priorities) {
            const match = keys.find(k => k.toLowerCase().trim() === p);
            if (match && task[match] !== undefined && task[match] !== null && task[match] !== '') return task[match];
        }
        return '';
    }
    let matchedKey = keys.find(k => k.toLowerCase().trim() === target);
    if (!matchedKey) {
        if (target === 'description') matchedKey = keys.find(k => ['desc', 'test name', 'testname', 'item'].includes(k.toLowerCase().trim()));
        if (target === 'variant') matchedKey = keys.find(k => ['var', 'method', 'condition'].includes(k.toLowerCase().trim()));
        if (target === 'sample name') matchedKey = keys.find(k => ['sample', 'samplename', 'sample_name'].includes(k.toLowerCase().trim()));
        if (target === 'quantity') matchedKey = keys.find(k => ['qty', 'quantity', 'amount'].includes(k.toLowerCase().trim()));
    }
    return matchedKey ? task[matchedKey] : '';
};

const formatDate = (dateValue: any) => {
    const date = parseFlexibleDate(dateValue);
    if (!date) return '';
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
};

const getDueDateTimestamp = (tasks: RawTask[]): number => {
    let minTime = Infinity;
    for (const t of tasks) {
        const val = getTaskValue(t, 'due date');
        const date = parseFlexibleDate(val);
        if (date) {
            const time = date.getTime();
            if (time < minTime) minTime = time;
        }
    }
    return minTime;
};

const getSpecialStatus = (task: RawTask, category: TaskCategory) => {
    const allContent = Object.values(task).map(v => String(v).toLowerCase()).join(' ');
    
    return {
        isSprint: allContent.includes('sprint'),
        isUrgent: category === TaskCategory.Urgent || allContent.includes('urgent'),
        isLSP: allContent.includes('lsp'),
        isPoCat: category === TaskCategory.PoCat || allContent.includes('pocat') || allContent.includes('po cat'),
        isReturned: task.isReturned === true
    };
};

const getTaskGridColumnKey = (task: RawTask, mappings: TestMapping[]): string | null => {
    const taskDesc = String(getTaskValue(task, 'Description')).toLowerCase().normalize('NFC').replace(/\s+/g, '');
    const taskVar = String(getTaskValue(task, 'Variant')).toLowerCase().normalize('NFC').replace(/\s+/g, '');
    const specificMatch = mappings.find(m => m.description.toLowerCase().normalize('NFC').replace(/\s+/g, '') === taskDesc && m.variant.toLowerCase().normalize('NFC').replace(/\s+/g, '') === taskVar);
    if (specificMatch) return `${specificMatch.headerGroup}|${specificMatch.headerSub}`;
    return null;
};

// --- SUB-COMPONENTS ---

const Toast: React.FC<{ message: string; isError?: boolean; onDismiss: () => void }> = ({ message, isError, onDismiss }) => {
    useEffect(() => { const timer = setTimeout(onDismiss, 3000); return () => clearTimeout(timer); }, [onDismiss]);
    return (
        <div className={`fixed top-24 right-8 py-3 px-6 rounded-xl shadow-lg flex items-center gap-3 animate-fade-in z-[60] border ${isError ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
            {isError ? <AlertTriangleIcon className="h-5 w-5" /> : <CheckCircleIcon className="h-5 w-5" />}
            <span className="font-bold text-sm">{message}</span>
        </div>
    );
};

const ManualTaskModal: React.FC<{ isOpen: boolean; onClose: () => void; onSave: (task: { jobId: string; description: string; quantity: string }) => void; isProcessing: boolean }> = ({ isOpen, onClose, onSave, isProcessing }) => {
    const [jobId, setJobId] = useState('');
    const [description, setDescription] = useState('');
    const [quantity, setQuantity] = useState('1');

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-base-900/70 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in" onClick={!isProcessing ? onClose : undefined}>
            <div className="bg-white dark:bg-base-800 rounded-[2rem] shadow-2xl p-8 w-full max-md m-4 space-y-5 animate-slide-in-up border border-base-200 dark:border-base-700" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-4 mb-2">
                    <div className="p-3 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600">
                        <BeakerIcon className="h-6 w-6" />
                    </div>
                    <div className="flex flex-col">
                        <h2 className="text-2xl font-black text-base-900 dark:text-base-100 tracking-tighter">Add Ad-hoc Work</h2>
                        <p className="text-[10px] font-black text-base-400 uppercase tracking-widest">Manual entry for laboratory support tasks</p>
                    </div>
                </div>
                
                <div className="space-y-4">
                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-base-400 mb-1.5 ml-1">Task Title / ชื่องาน</label>
                        <input 
                            type="text" 
                            value={jobId} 
                            onChange={e => setJobId(e.target.value)} 
                            placeholder="e.g. Glassware Washing, ICP Prep..."
                            className="w-full p-4 bg-base-50 dark:bg-base-950 border-2 border-base-100 dark:border-base-800 rounded-2xl focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 outline-none dark:text-white font-bold text-sm transition-all"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-base-400 mb-1.5 ml-1">Details / รายละเอียดงาน</label>
                        <textarea 
                            value={description} 
                            onChange={e => setDescription(e.target.value)} 
                            placeholder="Type specific instructions or context..."
                            rows={3}
                            className="w-full p-4 bg-base-50 dark:bg-base-950 border-2 border-base-100 dark:border-base-800 rounded-2xl focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 outline-none dark:text-white font-bold text-sm transition-all resize-none"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-base-400 mb-1.5 ml-1">Volume / จำนวน</label>
                        <input 
                            type="text" 
                            value={quantity} 
                            onChange={e => setQuantity(e.target.value)} 
                            className="w-full p-4 bg-base-50 dark:bg-base-950 border-2 border-base-100 dark:border-base-800 rounded-2xl focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 outline-none dark:text-white font-bold text-sm transition-all"
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-3 pt-4">
                    <button onClick={onClose} disabled={isProcessing} className="px-6 py-3 text-[11px] font-black text-base-400 hover:text-base-800 dark:hover:text-white uppercase tracking-widest transition-colors">Cancel</button>
                    <button 
                        onClick={() => onSave({ jobId, description, quantity })} 
                        disabled={isProcessing || !jobId.trim()}
                        className="px-8 py-3.5 bg-primary-600 text-white font-black rounded-2xl shadow-xl hover:brightness-110 active:scale-95 transition-all uppercase tracking-widest text-[11px] disabled:opacity-50"
                    >
                        {isProcessing ? 'Saving...' : 'Deploy Task'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const AssignmentModal: React.FC<{ isOpen: boolean; onClose: () => void; onAssign: (person: Tester) => void; personnel: { testers: Tester[]; assistants: Tester[] }; isPreparation: boolean; selectedItemCount: number; isProcessing: boolean; }> = ({ isOpen, onClose, onAssign, personnel, isPreparation, selectedItemCount, isProcessing }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-base-900/70 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in" onClick={!isProcessing ? onClose : undefined}>
            <div className="bg-white dark:bg-base-800 rounded-2xl shadow-2xl p-6 w-full max-w-lg m-4 space-y-4 animate-slide-in-up border border-base-200 dark:border-base-700" onClick={e => e.stopPropagation()}>
                <div className={`h-2 w-20 rounded-full mx-auto mb-2 ${isPreparation ? 'bg-amber-400' : 'bg-primary-50'}`}></div>
                <h2 className="text-xl font-black text-base-900 dark:text-base-100 text-center tracking-tight">{isPreparation ? "Assign for Preparation" : "Assign for Testing"}</h2>
                <p className="text-sm font-bold text-base-600 dark:text-base-400 text-center">Assigning <span className={`font-black ${isPreparation ? 'text-amber-600' : 'text-primary-600'}`}>{selectedItemCount} items</span></p>
                <div className="border-2 border-base-100 dark:border-base-700 rounded-xl bg-base-50 dark:bg-base-900/50 max-h-[60vh] overflow-y-auto custom-scrollbar">
                    <div className="sticky top-0 bg-base-100 dark:bg-base-800 px-4 py-2 font-black text-[10px] uppercase tracking-[0.2em] text-base-500 border-b-2 dark:border-base-700">Assistants</div>
                    <ul className="divide-y-2 divide-base-100 dark:divide-base-700">
                        {personnel.assistants.length > 0 ? personnel.assistants.map(p => (
                            <li key={p.id} className="flex justify-between items-center p-3 hover:bg-white dark:hover:bg-base-700 transition-colors">
                                <span className="font-black text-sm text-base-800 dark:text-base-100">{p.name}</span>
                                <button onClick={() => onAssign(p)} disabled={isProcessing} className="px-5 py-2 text-xs font-black bg-white dark:bg-base-800 border-2 border-base-200 dark:border-base-600 text-base-800 dark:text-white rounded-xl hover:bg-base-50 transition-all disabled:opacity-50 uppercase tracking-widest">Select</button>
                            </li>
                        )) : <li className="p-4 text-center text-xs text-base-400 italic font-bold">No assistants on shift</li>}
                    </ul>
                    <div className="sticky top-0 bg-base-100 dark:bg-base-800 px-4 py-2 font-black text-[10px] uppercase tracking-[0.2em] text-base-500 border-b-2 dark:border-base-700 border-t-2">Testers</div>
                     <ul className="divide-y-2 divide-base-100 dark:divide-base-700">
                        {personnel.testers.length > 0 ? personnel.testers.map(p => (
                            <li key={p.id} className="flex justify-between items-center p-3 hover:bg-white dark:hover:bg-base-700 transition-colors">
                                <span className="font-black text-sm text-base-800 dark:text-base-100">{p.name}</span>
                                <button onClick={() => onAssign(p)} disabled={isProcessing} className="px-5 py-2 text-xs font-black bg-white dark:bg-base-800 border-2 border-base-200 dark:border-base-600 text-base-800 dark:text-white rounded-xl hover:bg-base-50 transition-all disabled:opacity-50 uppercase tracking-widest">Select</button>
                            </li>
                        )) : <li className="p-4 text-center text-xs text-base-400 italic font-bold">No testers on shift</li>}
                    </ul>
                </div>
                <div className="pt-2 flex justify-center"><button onClick={onClose} disabled={isProcessing} className="px-6 py-2.5 text-xs font-black text-base-400 hover:text-base-800 transition-colors uppercase tracking-[0.2em]">Cancel</button></div>
            </div>
        </div>
    );
};

const ExpandableCell: React.FC<{ 
    headerKey: string; 
    items: { task: RawTask; originalIndex: number; sourceDocId: string }[]; 
    isGroupEnd?: boolean;
    expandedCell: { docId: string; headerKey: string } | null;
    setExpandedCell: (val: { docId: string; headerKey: string } | null) => void;
    selectedItems: Record<string, Set<number>>;
    handleSelectItem: (docId: string, taskIndex: number, isChecked: boolean) => void;
    setSelectedItems: React.Dispatch<React.SetStateAction<Record<string, Set<number>>>>;
    isAssigningToPrepare: boolean;
    noteEditor: { docId: string, index: number, text: string } | null;
    setNoteEditor: (val: { docId: string, index: number, text: string } | null) => void;
    handleUpdatePlannerNote: (docId: string, itemIndex: number, note: string) => void;
}> = ({ 
    headerKey, items, isGroupEnd, expandedCell, setExpandedCell, 
    selectedItems, handleSelectItem, setSelectedItems, 
    isAssigningToPrepare, noteEditor, setNoteEditor, handleUpdatePlannerNote 
}) => {
    if (!items || items.length === 0) return <td className={`p-0 align-top border border-base-300 dark:border-base-700 ${isGroupEnd ? 'border-r-2 border-r-base-400 dark:border-r-base-600' : ''}`}></td>;
    
    const primaryDocId = items[0].sourceDocId; 
    const isExpanded = expandedCell?.docId === primaryDocId && expandedCell?.headerKey === headerKey;
    
    const selectedForThisCell = items.filter(item => selectedItems[item.sourceDocId]?.has(item.originalIndex));
    const numSelected = selectedForThisCell.length;
    
    const hasAwaitingPrep = items.some(item => item.task.preparationStatus === 'Awaiting Preparation');
    const hasPrepared = items.some(item => item.task.preparationStatus === 'Prepared' || item.task.preparationStatus === 'Ready for Testing');
    const hasReturned = items.some(item => item.task.isReturned);
    const hasPlannerNote = items.some(item => item.task.plannerNote);

    const areAllSelected = items.length > 0 && numSelected === items.length;
    const itemCount = items.length;

    const totalQuantity = useMemo(() => {
        return items.reduce((sum, item) => {
            const qtyVal = getTaskValue(item.task, 'quantity');
            const num = parseFloat(String(qtyVal));
            return sum + (isNaN(num) ? 1 : num);
        }, 0);
    }, [items]);

    const toggleAll = (checked: boolean) => {
        setSelectedItems(prev => {
            const next = { ...prev };
            items.forEach(item => {
                const currentSet = new Set(next[item.sourceDocId] || []);
                const isLockDisabled = !isAssigningToPrepare && item.task.preparationStatus === 'Awaiting Preparation';
                if (checked && !isLockDisabled) currentSet.add(item.originalIndex); else currentSet.delete(item.originalIndex);
                next[item.sourceDocId] = currentSet;
            });
            return next;
        });
    };

    let cellTextColor = 'text-primary-700 dark:text-primary-400';
    if (hasReturned) cellTextColor = 'text-red-600 dark:text-red-500 font-black';
    else if (hasAwaitingPrep) cellTextColor = 'text-amber-600 dark:text-amber-500';
    else if (hasPrepared) cellTextColor = 'text-emerald-600 dark:text-emerald-500';

    return (
        <td className={`p-0 align-top transition-all relative border border-base-300 dark:border-base-700 ${isGroupEnd ? 'border-r-2 border-r-base-400 dark:border-r-base-600' : ''} ${isExpanded ? 'bg-white dark:bg-base-800 ring-2 ring-primary-500 shadow-xl z-20 rounded-sm' : 'hover:bg-base-100/50 dark:hover:bg-base-700/50'}`}>
            <div className="p-1 text-center cursor-pointer h-full flex flex-col justify-center min-h-[46px] relative" onClick={() => setExpandedCell(isExpanded ? null : { docId: primaryDocId, headerKey })}>
                <span className={`font-black text-[18px] tracking-tighter leading-none ${numSelected > 0 ? 'text-primary-800 dark:text-primary-200 bg-primary-100 dark:bg-primary-900/40 rounded px-1' : cellTextColor}`}>
                    {numSelected > 0 ? numSelected : itemCount}
                </span>
                
                <div className="flex justify-center gap-1 mt-1">
                    {hasReturned && <div className="w-1.5 h-1.5 rounded-full bg-red-600 shadow-sm animate-pulse" title="คืนงาน - รอจัดสรรใหม่"></div>}
                    {hasPlannerNote && <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-sm" title="Has Planner Note"></div>}
                    {hasAwaitingPrep && <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shadow-sm" title="Awaiting Preparation"></div>}
                    {hasPrepared && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-sm" title="Ready for Testing"></div>}
                </div>
            </div>
            {isExpanded && (
                <div className="absolute top-full left-0 min-w-[420px] bg-white dark:bg-base-900 border-2 border-primary-500 dark:border-primary-400 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.4)] rounded-b-[2rem] overflow-hidden z-50 animate-fade-in origin-top-left border-t-0">
                    <div className="p-4 bg-base-50 dark:bg-base-800/80 border-b-2 dark:border-base-700 flex justify-between items-center backdrop-blur-md">
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black text-base-950 dark:text-base-50 uppercase tracking-[0.25em]">Deployment Detail</span>
                            <span className="text-[9px] font-bold text-base-400 uppercase mt-0.5">Total: {itemCount} | Volume: {totalQuantity}</span>
                        </div>
                        <label className="flex items-center gap-2 text-[10px] font-black uppercase cursor-pointer text-primary-700 dark:text-primary-300 bg-white dark:bg-base-900 px-3.5 py-1.5 rounded-xl shadow-sm border border-base-100 dark:border-base-700 transition-all hover:border-primary-400 active:scale-95">
                            <input type="checkbox" className="h-4 w-4 rounded text-primary-600 focus:ring-0" checked={areAllSelected} onChange={e => toggleAll(e.target.checked)}/> Select All
                        </label>
                    </div>
                    <div className="max-h-80 overflow-y-auto custom-scrollbar bg-white dark:bg-base-900">
                        <table className="w-full">
                            <tbody className="divide-y divide-base-50 dark:divide-base-800">
                                {items.map(({ task, originalIndex, sourceDocId }) => {
                                    const sampleName = String(getTaskValue(task, 'Sample Name') || 'N/A').trim();
                                    const variant = String(getTaskValue(task, 'Variant') || '').trim();
                                    const qty = String(getTaskValue(task, 'Quantity') || '1').trim();
                                    const isPrepAwaiting = task.preparationStatus === 'Awaiting Preparation';
                                    const isPrepReady = task.preparationStatus === 'Prepared' || task.preparationStatus === 'Ready for Testing';
                                    const isReturned = task.isReturned;
                                    const isEditingNote = noteEditor?.docId === sourceDocId && noteEditor?.index === originalIndex;
                                    const isSelectionDisabled = !isAssigningToPrepare && isPrepAwaiting;
                                    
                                    let rowBg = 'bg-white dark:bg-base-900';
                                    if (isPrepAwaiting) rowBg = 'bg-amber-50/20 dark:bg-amber-900/5';
                                    else if (isPrepReady) rowBg = 'bg-emerald-50/20 dark:bg-emerald-900/5';
                                    else if (isReturned) rowBg = 'bg-red-50/40 dark:bg-red-900/10';

                                    return (
                                        <tr key={`${sourceDocId}-${originalIndex}`} className={`${rowBg} transition-colors group`}>
                                            <td className="p-4 w-12 text-center align-top">
                                                <input 
                                                    type="checkbox" 
                                                    disabled={isSelectionDisabled}
                                                    className={`h-5 w-5 rounded text-primary-600 focus:ring-0 mt-1 transition-all ${isSelectionDisabled ? 'opacity-20 cursor-not-allowed' : 'cursor-pointer hover:scale-110'}`} 
                                                    checked={selectedItems[sourceDocId]?.has(originalIndex) || false} 
                                                    onChange={e => handleSelectItem(sourceDocId, originalIndex, e.target.checked)}
                                                />
                                            </td>
                                            <td className="p-4">
                                                <div className="flex flex-wrap items-baseline justify-between mb-2">
                                                    <div className="flex items-center gap-2.5">
                                                        <span className={`font-black text-[14px] uppercase tracking-tight leading-none whitespace-normal ${isReturned ? 'text-red-700 dark:text-red-300' : 'text-base-950 dark:text-base-50'}`}>{sampleName}</span>
                                                        <span className="px-2 py-0.5 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-lg text-[10px] font-black border border-primary-100/50">x{qty}</span>
                                                    </div>
                                                    <div className="flex gap-1.5">
                                                        {isPrepAwaiting && <span className="px-2 py-0.5 bg-amber-500 text-white text-[8px] rounded-lg uppercase font-black tracking-widest shadow-sm">In Prep</span>}
                                                        {isPrepReady && <span className="px-2 py-0.5 bg-emerald-600 text-white text-[8px] rounded-lg uppercase font-black tracking-widest shadow-sm">Ready</span>}
                                                        {isReturned && (
                                                            <div className="flex flex-col items-end">
                                                                <span className="px-2.5 py-1 bg-red-600 text-white text-[9px] rounded-lg uppercase font-black tracking-widest shadow-lg animate-pulse border border-red-400">คืนงาน</span>
                                                                <span className="text-[7px] font-black text-red-500 uppercase mt-0.5 tracking-[0.1em]">รอจัดสรรใหม่</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex flex-col gap-2">
                                                    <div className="flex items-center justify-between gap-4">
                                                        <div className="flex flex-wrap items-center gap-3 min-w-0">
                                                            {variant && <span className={`text-[11px] font-black uppercase italic truncate leading-none ${isReturned ? 'text-red-500' : 'text-indigo-500 dark:text-indigo-400'}`}>{variant}</span>}
                                                            <span className="text-[9px] text-base-400 uppercase font-black tracking-widest flex-shrink-0">Due: {formatDate(getTaskValue(task, 'due date')) || 'ASAP'}</span>
                                                        </div>
                                                        <button 
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setNoteEditor({ docId: sourceDocId, index: originalIndex, text: task.plannerNote || '' });
                                                            }}
                                                            className={`p-2 rounded-xl border-2 transition-all active:scale-90 ${task.plannerNote ? 'bg-indigo-600 text-white border-indigo-500 shadow-md ring-4 ring-indigo-500/20' : 'bg-base-50 dark:bg-base-800 text-base-300 border-base-100 dark:border-base-700 hover:text-indigo-500 hover:border-indigo-200'}`}
                                                            title="Instruction to Analyst"
                                                        >
                                                            <ChatBubbleLeftEllipsisIcon className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                    
                                                    {isEditingNote && (
                                                        <div className="p-4 bg-white dark:bg-base-800 border-2 border-indigo-100 dark:border-indigo-900/50 rounded-2xl space-y-3 mt-2 shadow-[0_10px_30px_-5px_rgba(79,70,229,0.15)] animate-fade-in ring-4 ring-indigo-50 dark:ring-indigo-950/20">
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
                                                                <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">New Instruction</span>
                                                            </div>
                                                            <textarea 
                                                                autoFocus
                                                                value={noteEditor.text}
                                                                onChange={e => setNoteEditor({...noteEditor, text: e.target.value})}
                                                                placeholder="Type mission details here..."
                                                                className="w-full p-3 text-[12px] font-bold dark:bg-base-950 dark:text-white border-2 border-base-50 dark:border-base-900 rounded-xl outline-none focus:border-indigo-400 transition-all placeholder:text-base-300 resize-none leading-relaxed"
                                                                rows={3}
                                                            />
                                                            <div className="flex justify-end gap-3 pt-1">
                                                                <button onClick={() => setNoteEditor(null)} className="px-4 py-2 text-[10px] font-black uppercase text-base-400 hover:text-base-700 transition-colors">Discard</button>
                                                                <button onClick={() => handleUpdatePlannerNote(sourceDocId, originalIndex, noteEditor.text)} className="px-6 py-2.5 bg-indigo-600 text-white text-[10px] font-black uppercase rounded-xl shadow-lg shadow-indigo-500/20 active:scale-95 transition-all hover:brightness-110">Apply Note</button>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {task.plannerNote && !isEditingNote && (
                                                        <div className="p-3.5 bg-indigo-50/50 dark:bg-indigo-900/10 border border-indigo-100/50 dark:border-indigo-800/30 rounded-2xl relative overflow-hidden group/note">
                                                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500"></div>
                                                            <div className="flex items-center gap-2 mb-1.5">
                                                                <ChatBubbleLeftEllipsisIcon className="h-3 w-3 text-indigo-500" />
                                                                <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest opacity-70">Mission Instruction</span>
                                                            </div>
                                                            <p className="text-[11px] font-bold text-base-800 dark:text-indigo-100 italic leading-relaxed">{task.plannerNote}</p>
                                                        </div>
                                                    )}

                                                    {/* Analyst Remarks (Observations from the lab) */}
                                                    {task.analystRemark && (
                                                        <div className="p-3.5 bg-emerald-50/50 dark:bg-emerald-900/10 border border-emerald-100/50 dark:border-emerald-800/30 rounded-2xl relative overflow-hidden">
                                                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500"></div>
                                                            <div className="flex items-center gap-2 mb-1.5">
                                                                <ClipboardListIcon className="h-3 w-3 text-emerald-500" />
                                                                <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest opacity-70">Analyst Remark (From Floor)</span>
                                                            </div>
                                                            <p className="text-[11px] font-bold text-base-800 dark:text-emerald-100 italic leading-relaxed">{task.analystRemark}</p>
                                                        </div>
                                                    )}

                                                    {isReturned && task.returnReason && (
                                                        <div className="mt-1 flex items-start gap-3 text-[11px] text-red-700 dark:text-red-400 font-bold bg-red-100/50 dark:bg-red-900/20 p-3 rounded-2xl border border-red-200 shadow-md">
                                                            <div className="p-1.5 bg-red-600 text-white rounded-lg flex-shrink-0 shadow-sm">
                                                                <ArrowUturnLeftIcon className="h-3.5 w-3.5" />
                                                            </div>
                                                            <div className="flex flex-col">
                                                                <span className="text-[9px] uppercase tracking-wider text-red-500 font-black mb-0.5">Return Reason (From {task.returnedBy || 'Personnel'})</span>
                                                                <p className="italic leading-relaxed">"{task.returnReason}"</p>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </td>
    );
};

const TasksTab: React.FC<{ 
    testers: Tester[]; 
    refreshKey: number; 
    selectedDate: string;
    onDateChange: (date: string) => void;
    selectedShift: 'day' | 'night';
    onShiftChange: (shift: 'day' | 'night') => void;
}> = ({ testers, refreshKey, selectedDate, onDateChange, selectedShift, onShiftChange }) => {
    const [categorizedTasks, setCategorizedTasks] = useState<CategorizedTask[]>([]);
    const [testMappings, setTestMappings] = useState<TestMapping[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [schedule, setSchedule] = useState<DailySchedule | null>(null);
    const [activeCategory, setActiveCategory] = useState<string>('all');
    const [filterRequestId, setFilterRequestId] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isManualModalOpen, setIsManualModalOpen] = useState(false);
    const [isAssigningToPrepare, setIsAssigningToPrepare] = useState(false); 
    const [notification, setNotification] = useState<{message: string, isError?: boolean} | null>(null);
    const [selectedItems, setSelectedItems] = useState<Record<string, Set<number>>>({});
    const [expandedCell, setExpandedCell] = useState<{ docId: string; headerKey: string } | null>(null);
    const [hideEmptyColumns, setHideEmptyColumns] = useState(false);
    const [isAssigning, setIsAssigning] = useState(false);
    const [isSavingManual, setIsSavingManual] = useState(false);
    const [noteEditor, setNoteEditor] = useState<{ docId: string, index: number, text: string } | null>(null);
    
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [isAIGenerating, setIsAIGenerating] = useState(false);
    const [aiRecommendation, setAIRecommendation] = useState<{
        reasoning: string;
        plan: Array<{ personName: string; requestId: string; taskDescription: string }>;
    } | null>(null);
    const [isAISidebarOpen, setIsAISidebarOpen] = useState(false);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [tasks, dailySchedule, mappings] = await Promise.all([
                getCategorizedTasks(),
                getDailySchedule(selectedDate),
                getTestMappings(),
            ]);
            setCategorizedTasks(tasks.sort((a,b) => (a.order ?? Infinity) - (b.order ?? Infinity)));
            setSchedule(dailySchedule);
            setTestMappings(mappings);
        } catch (error: any) {
            console.error("Error fetching data:", error);
        } finally {
            setIsLoading(false);
        }
    }, [selectedDate]);

    useEffect(() => { fetchData(); }, [fetchData, refreshKey]);

    const gridHeaders = useMemo(() => {
        const groupMinOrders: Record<string, number> = {};
        testMappings.forEach(m => {
            if (!m.headerGroup) return;
            const currentMin = groupMinOrders[m.headerGroup] ?? Infinity;
            if ((m.order ?? Infinity) < currentMin) groupMinOrders[m.headerGroup] = m.order ?? Infinity;
        });
        const groupsContent: Record<string, { key: string; order: number }[]> = {};
        testMappings.forEach(m => {
            if (!m.headerGroup || !m.headerSub) return;
            if (!groupsContent[m.headerGroup]) groupsContent[m.headerGroup] = [];
            const compositeKey = `${m.headerGroup}|${m.headerSub}`;
            const existingSub = groupsContent[m.headerGroup].find(x => x.key === compositeKey);
            const mappingOrder = m.order ?? Infinity;
            if (!existingSub) groupsContent[m.headerGroup].push({ key: compositeKey, order: mappingOrder });
            else if (mappingOrder < existingSub.order) existingSub.order = mappingOrder;
        });
        const sortedGroupNames = Object.keys(groupsContent).sort((a, b) => (groupMinOrders[a] ?? Infinity) - (groupMinOrders[b] ?? Infinity));
        return sortedGroupNames.map(groupName => {
            const sortedSubs = groupsContent[groupName].sort((a, b) => a.order - b.order).map(x => x.key);
            return [groupName, sortedSubs] as [string, string[]];
        });
    }, [testMappings]);

    const filteredTasks = useMemo(() => {
        return categorizedTasks.filter(task => {
            if (task.category === TaskCategory.Manual) return activeCategory === 'all' || activeCategory === TaskCategory.Manual;
            const categoryMatch = activeCategory === 'all' || task.category === activeCategory;
            const idMatch = filterRequestId === '' || task.id.toLowerCase().includes(filterRequestId.toLowerCase());
            return categoryMatch && idMatch; 
        });
    }, [categorizedTasks, activeCategory, filterRequestId]);

    const gridData = useMemo(() => {
        const mergedRows: Record<string, {
            requestId: string; 
            cells: Record<string, { task: RawTask; originalIndex: number; sourceDocId: string }[]>;
            unmappedItems: { task: RawTask; originalIndex: number; sourceDocId: string }[]; 
            minDueDate: number;
            isSprint: boolean; isUrgent: boolean; isLSP: boolean; isPoCat: boolean; isReturned: boolean;
            seenIds: Record<string, { task: RawTask; originalIndex: number; sourceDocId: string }>;
        }> = {};
        
        filteredTasks.forEach(taskGroup => {
            if (taskGroup.category === TaskCategory.Manual) return; 

            const rid = taskGroup.id;
            if (!mergedRows[rid]) {
                mergedRows[rid] = { 
                    requestId: rid, cells: {}, unmappedItems: [], minDueDate: Infinity,
                    isSprint: false, isUrgent: false, isLSP: false, isPoCat: false, isReturned: false,
                    seenIds: {}
                };
            }
            const row = mergedRows[rid];
            const groupDate = getDueDateTimestamp(taskGroup.tasks);
            if (groupDate < row.minDueDate) row.minDueDate = groupDate;

            taskGroup.tasks.forEach((task, index) => {
                const spec = getSpecialStatus(task, taskGroup.category);
                if (spec.isSprint) row.isSprint = true;
                if (spec.isUrgent) row.isUrgent = true;
                if (spec.isLSP) row.isLSP = true;
                if (spec.isPoCat) row.isPoCat = true;
                if (spec.isReturned) row.isReturned = true;

                const taskId = task._id || `${task['Sample Name']}-${task['Description']}-${task['Variant']}`;
                const item = { task, originalIndex: index, sourceDocId: taskGroup.docId! };

                // Dedup & Merge Logic: Prefer tasks with 'Returned' status
                if (row.seenIds[taskId]) {
                    const existing = row.seenIds[taskId];
                    if (task.isReturned && !existing.task.isReturned) {
                        // Current task is returned, previous wasn't. Swap it.
                        // We need to find where it was stored and update it.
                        // For simplicity, we just won't 'return' yet and instead overwrite the data later if needed.
                        // But we must remove from wherever it was.
                        const oldColKey = getTaskGridColumnKey(existing.task, testMappings) || 'unmapped';
                        if (oldColKey === 'unmapped') {
                            row.unmappedItems = row.unmappedItems.filter(i => i !== existing);
                        } else {
                            if (row.cells[oldColKey]) row.cells[oldColKey] = row.cells[oldColKey].filter(i => i !== existing);
                        }
                    } else {
                        // Previous task was either returned or we are not returned. Skip.
                        return;
                    }
                }
                
                row.seenIds[taskId] = item;

                const columnKey = getTaskGridColumnKey(task, testMappings);
                if (columnKey) {
                    if (!row.cells[columnKey]) row.cells[columnKey] = [];
                    row.cells[columnKey].push(item);
                } else {
                    row.unmappedItems.push(item);
                }
            });
        });
        return Object.values(mergedRows).sort((a, b) => a.minDueDate - b.minDueDate);
    }, [filteredTasks, testMappings]);

    const manualTasks = useMemo(() => {
        return filteredTasks.filter(t => t.category === TaskCategory.Manual);
    }, [filteredTasks]);

    const activeColumnKeys = useMemo(() => {
        if (!hideEmptyColumns) return gridHeaders.flatMap(([, subKeys]) => subKeys);
        const activeKeys = new Set<string>();
        gridData.forEach(row => Object.keys(row.cells).forEach(key => { if (row.cells[key].length > 0) activeKeys.add(key); }));
        return gridHeaders.flatMap(([, subKeys]) => subKeys).filter(k => activeKeys.has(k));
    }, [gridHeaders, gridData, hideEmptyColumns]);

    const activeGridHeaders = useMemo(() => {
        if (!hideEmptyColumns) return gridHeaders;
        return gridHeaders.map(([group, subKeys]) => {
            const activeSubs = subKeys.filter(k => activeColumnKeys.includes(k));
            return [group, activeSubs] as [string, string[]];
        }).filter(([, subKeys]) => subKeys.length > 0);
    }, [gridHeaders, activeColumnKeys, hideEmptyColumns]);

    const lastKeysOfGroups = useMemo(() => new Set(activeGridHeaders.map(([_, subKeys]) => subKeys[subKeys.length - 1])), [activeGridHeaders]);

    const onShiftPersonnel = useMemo(() => {
        const findByIds = (ids: string[]) => ids.map(id => testers.find(t => t.id === id)).filter((t): t is Tester => !!t);
        if (!schedule) return { testers: [], assistants: [] };
        const shiftTesters = selectedShift === 'day' ? schedule.dayShiftTesters : schedule.nightShiftTesters;
        const shiftAssistants = selectedShift === 'day' ? schedule.dayShiftAssistants : schedule.nightShiftAssistants;
        return { testers: findByIds(shiftTesters), assistants: findByIds(shiftAssistants) };
    }, [schedule, testers, selectedShift]);

    // --- AI LOGIC ---
    const generateAIPlan = async () => {
        if (isAIGenerating) return;
        setIsAIGenerating(true);
        setAIRecommendation(null);
        setIsAISidebarOpen(true);

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const taskSummary = categorizedTasks.map(group => ({
                id: group.id,
                category: group.category,
                tasks: group.tasks.map(t => ({
                    desc: getTaskValue(t, 'description'),
                    qty: getTaskValue(t, 'quantity'),
                    urgent: getSpecialStatus(t, group.category).isUrgent,
                    sprint: getSpecialStatus(t, group.category).isSprint
                }))
            }));
            const staffList = onShiftPersonnel.testers.map(p => p.name);
            const prompt = `Lab Operations Manager AI... Create optimal assignment... 
Tasks: ${JSON.stringify(taskSummary)} 
Staff: ${staffList.join(', ')}`;

            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            reasoning: { type: Type.STRING },
                            plan: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        personName: { type: Type.STRING },
                                        requestId: { type: Type.STRING },
                                        taskDescription: { type: Type.STRING }
                                    },
                                    required: ["personName", "requestId", "taskDescription"]
                                }
                            }
                        },
                        required: ["reasoning", "plan"]
                    }
                }
            });
            if (response.text) setAIRecommendation(JSON.parse(response.text));
        } catch (error) { setNotification({ message: "AI Assistant failed.", isError: true }); } finally { setIsAIGenerating(false); }
    };

    const applyAIPlan = () => {
        if (!aiRecommendation) return;
        const nextSelected: Record<string, Set<number>> = {};
        aiRecommendation.plan.forEach(item => {
            const group = categorizedTasks.find(g => g.id === item.requestId);
            if (group) {
                const docId = group.docId!;
                if (!nextSelected[docId]) nextSelected[docId] = new Set();
                const idx = group.tasks.findIndex(t => getTaskValue(t, 'description') === item.taskDescription);
                if (idx !== -1) nextSelected[docId].add(idx);
                else if (group.tasks.length > 0) nextSelected[docId].add(0);
            }
        });
        setSelectedItems(nextSelected);
        setIsAISidebarOpen(false);
    };

    const handleConfirmAssignment = async (selectedPerson: Tester) => {
        if (isAssigning) return;
        const assignmentsByDocId: Record<string, number[]> = {};
        for (const docId in selectedItems) if (selectedItems[docId].size > 0) assignmentsByDocId[docId] = [...selectedItems[docId]];
        if (Object.keys(assignmentsByDocId).length === 0) return;
        setIsAssigning(true);
        try {
            for (const docId in assignmentsByDocId) {
                const originalTask = categorizedTasks.find(t => t.docId === docId);
                const selectedIndices = assignmentsByDocId[docId];
                if (!originalTask) continue;
                if (isAssigningToPrepare) await assignItemsToPrepare(originalTask, selectedIndices, selectedPerson, selectedDate, selectedShift);
                else {
                    const itemsToAssign = selectedIndices.map(index => {
                        const t = { ...originalTask.tasks[index] };
                        delete t.isReturned;
                        return t;
                    });
                    await addAssignedTask({ requestId: originalTask.id, tasks: itemsToAssign, category: originalTask.category, testerId: selectedPerson.id, testerName: selectedPerson.name, assignedDate: selectedDate, shift: selectedShift, status: TaskStatus.Pending });
                    const remainingItems = originalTask.tasks.filter((_, index) => !selectedIndices.includes(index));
                    if (remainingItems.length > 0) await updateCategorizedTask(docId, { tasks: remainingItems }); else await deleteCategorizedTask(docId);
                }
            }
            setNotification({ message: "Task Assigned." });
            setSelectedItems({});
        } catch (err) { setNotification({ message: "Failed to assign.", isError: true }); } finally { setIsAssigning(false); setIsModalOpen(false); fetchData(); }
    };

    const handleSaveManualTask = async (data: { jobId: string; description: string; quantity: string }) => {
        setIsSavingManual(true);
        try {
            const manualTask: RawTask = {
                _id: Math.random().toString(36).substring(2) + Date.now().toString(36),
                'Request ID': data.jobId,
                'Description': data.description,
                'Quantity': data.quantity,
                'Sample Name': data.jobId, 
                'Priority': 'Normal',
                'Purpose': 'Manual Work',
                'ManualEntry': true
            };
            await saveCategorizedTask({ id: data.jobId, category: TaskCategory.Manual, tasks: [manualTask] });
            setNotification({ message: "Manual task created." });
            setIsManualModalOpen(false);
            fetchData();
        } catch (err) { setNotification({ message: "Failed.", isError: true }); } finally { setIsSavingManual(false); }
    };

    const handleSelectItem = useCallback((docId: string, taskIndex: number, isChecked: boolean) => {
        setSelectedItems(prev => {
            const newSelection = { ...prev };
            const currentSet = new Set(newSelection[docId] || []);
            if (isChecked) currentSet.add(taskIndex); else currentSet.delete(taskIndex);
            newSelection[docId] = currentSet;
            return newSelection;
        });
    }, []);

    const totalSelectedCount = useMemo(() => Object.values(selectedItems).reduce((acc: number, set: Set<number>) => acc + set.size, 0), [selectedItems]);

    const handleUpdatePlannerNote = async (docId: string, itemIndex: number, note: string) => {
        const group = categorizedTasks.find(t => t.docId === docId);
        if (!group) return;
        const updatedTasks = [...group.tasks];
        updatedTasks[itemIndex] = { ...updatedTasks[itemIndex], plannerNote: note.trim() || null };
        await updateCategorizedTask(docId, { tasks: updatedTasks });
        setNoteEditor(null);
        fetchData();
    };

    const renderDueDateCell = (timestamp: number) => {
        if (timestamp === Infinity) return <div className="flex flex-col items-center justify-center text-[11px] font-black italic text-base-300">---</div>;
        const date = new Date(timestamp);
        const today = new Date(); today.setHours(0,0,0,0);
        const diff = new Date(timestamp).getTime() - today.getTime();
        const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
        let style = "text-base-800 dark:text-base-100";
        if (days <= 0) style = "text-rose-700 dark:text-rose-400 font-black animate-pulse-subtle";
        else if (days <= 3) style = "text-amber-700 dark:text-amber-400 font-black";
        return (
            <div className={`flex flex-col items-center justify-center leading-none ${style}`}>
                <span className="text-[14px] font-black tracking-tighter">{date.getDate().toString().padStart(2, '0')}/{(date.getMonth()+1).toString().padStart(2,'0')}</span>
                <span className="text-[8px] uppercase tracking-widest mt-1 opacity-80 font-black">{days === 0 ? 'Today' : days < 0 ? 'Late' : `${days}d`}</span>
            </div>
        );
    };

    return (
        <div className="flex flex-col h-[calc(100vh-140px)] space-y-4 animate-slide-in-up relative overflow-hidden">
            {notification && <Toast message={notification.message} isError={notification.isError} onDismiss={() => setNotification(null)} />}
            
            <AssignmentModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onAssign={handleConfirmAssignment} personnel={onShiftPersonnel} isPreparation={isAssigningToPrepare} selectedItemCount={totalSelectedCount} isProcessing={isAssigning}/>
            <ManualTaskModal isOpen={isManualModalOpen} onClose={() => setIsManualModalOpen(false)} onSave={handleSaveManualTask} isProcessing={isSavingManual} />

            <div className={`fixed inset-y-0 right-0 w-80 bg-white dark:bg-base-900 shadow-[-20px_0_50px_rgba(0,0,0,0.2)] border-l-2 border-primary-500/20 z-[60] transition-transform duration-500 transform ${isAISidebarOpen ? 'translate-x-0' : 'translate-x-full'} backdrop-blur-xl bg-opacity-95 dark:bg-opacity-95 flex flex-col`}>
                <div className="p-6 border-b border-base-100 dark:border-base-800 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary-600 rounded-xl text-white"><SparklesIcon className="h-5 w-5" /></div>
                        <h3 className="font-black text-sm uppercase tracking-widest text-base-900 dark:text-white">Smart Planner</h3>
                    </div>
                    <button onClick={() => setIsAISidebarOpen(false)} className="text-base-400 hover:text-base-900 dark:hover:text-white transition-colors"><XCircleIcon className="h-6 w-6" /></button>
                </div>
                <div className="flex-grow overflow-y-auto p-6 custom-scrollbar">
                    {isAIGenerating ? <div className="h-full flex flex-col items-center justify-center text-center space-y-4"><RefreshIcon className="h-12 w-12 animate-spin"/><p className="text-xs font-black uppercase tracking-[0.3em] text-base-400">Analyzing...</p></div> : 
                    aiRecommendation ? <div className="space-y-6"><button onClick={applyAIPlan} className="w-full py-4 bg-primary-600 text-white font-black rounded-2xl">Apply AI Selection</button></div> : 
                    <div className="h-full flex flex-col items-center justify-center text-center opacity-30"><SparklesIcon className="h-12 w-12" /></div>}
                </div>
            </div>

            <div className="flex-shrink-0 space-y-3 px-4 pt-2">
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <h2 className="text-3xl font-black text-base-950 dark:text-base-50 tracking-tighter">Queue Deployment</h2>
                        <div className="flex gap-2">
                            {activeCategory === TaskCategory.Manual && (
                                <button onClick={() => setIsManualModalOpen(true)} className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-xl active:scale-95 border-b-4 border-indigo-800"><PlusIcon className="h-4 w-4" /> Add Manual Task</button>
                            )}
                            <button onClick={generateAIPlan} className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-primary-600 to-indigo-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest active:scale-95 border-b-4 border-indigo-900"><SparklesIcon className="h-4 w-4" /> AI Optimize Plan</button>
                        </div>
                    </div>
                </div>
                <div className="p-5 bg-white/80 dark:bg-base-800/80 rounded-3xl border-2 border-white dark:border-base-700 shadow-xl space-y-5 backdrop-blur-md">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex flex-wrap gap-2.5">
                            {['all', TaskCategory.Urgent, TaskCategory.Normal, TaskCategory.PoCat, TaskCategory.Manual].map(c => (
                                <button key={c} onClick={() => setActiveCategory(c)} className={`px-5 py-2 text-xs font-black rounded-xl transition-all border-2 uppercase tracking-[0.1em] shadow-md active:scale-95 ${activeCategory === c ? 'bg-primary-700 text-white border-primary-600' : 'bg-white dark:bg-base-800 text-base-800 dark:text-base-100 border-base-200 dark:border-base-700'}`}>
                                    {c === 'all' ? 'Show All' : c} <span className={`ml-2 px-2 py-0.5 rounded-lg text-[10px] ${activeCategory === c ? 'bg-white/20' : 'bg-base-100 dark:bg-base-900 text-primary-600'}`}>{filteredTasks.filter(t => c === 'all' ? true : t.category === c).length}</span>
                                </button>
                            ))}
                        </div>
                        {/* Clean View Checkbox */}
                        <label className="flex items-center gap-3 bg-base-100 dark:bg-base-900/50 p-2.5 px-4 rounded-2xl border border-base-200 dark:border-base-700 cursor-pointer hover:bg-white dark:hover:bg-base-800 transition-all group">
                             <span className="text-[10px] font-black uppercase tracking-widest text-base-500 group-hover:text-primary-600 transition-colors">Clean View</span>
                             <input 
                                type="checkbox" 
                                checked={hideEmptyColumns}
                                onChange={e => setHideEmptyColumns(e.target.checked)}
                                className="h-5 w-5 rounded border-2 border-base-300 text-primary-600 focus:ring-0 cursor-pointer transition-all"
                             />
                        </label>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 border-t-2 border-base-100 dark:border-base-700 pt-5">
                        <input type="text" placeholder="Search by Request ID..." value={filterRequestId} onChange={e => setFilterRequestId(e.target.value)} className="md:col-span-2 p-4 rounded-2xl bg-base-50 dark:bg-base-950 border-2 border-base-200 dark:border-base-700 text-[15px] font-black tracking-tight outline-none"/>
                        <input type="date" value={selectedDate} onChange={e => onDateChange(e.target.value)} className="w-full p-4 rounded-2xl bg-base-50 dark:bg-base-950 border-2 border-base-100 dark:border-base-800 rounded-2xl font-black text-[15px] outline-none"/>
                        <select value={selectedShift} onChange={e => onShiftChange(e.target.value as any)} className="w-full p-4 rounded-2xl bg-base-50 dark:bg-base-950 border-2 border-base-100 dark:border-base-800 rounded-2xl font-black text-[15px] uppercase tracking-widest outline-none"><option value="day">Day Shift (08:00)</option><option value="night">Night Shift (20:00)</option></select>
                    </div>
                </div>
                <div className="p-4 bg-primary-800 rounded-3xl flex justify-between items-center shadow-2xl sticky top-0 z-30 ring-4 ring-primary-500/20">
                    <div className="flex items-center gap-5 px-4"><span className="text-[11px] font-black text-white/60 uppercase tracking-[0.3em]">Selection Controller</span><span className="text-4xl font-black text-white leading-none tracking-tighter">{totalSelectedCount}</span><span className="text-white/40 font-black uppercase text-[10px] tracking-widest">items ready</span></div>
                    <div className="flex gap-3">
                        <button onClick={() => { setIsAssigningToPrepare(true); setIsModalOpen(true); }} disabled={totalSelectedCount === 0} className="px-8 py-3.5 text-[11px] font-black bg-amber-400 text-amber-950 rounded-2xl hover:bg-amber-300 uppercase tracking-[0.2em] disabled:opacity-30 transition-all shadow-xl active:scale-95 border-b-4 border-amber-600">Move To Preparation</button>
                        <button onClick={() => { setIsAssigningToPrepare(false); setIsModalOpen(true); }} disabled={totalSelectedCount === 0} className="px-8 py-3.5 text-[11px] font-black bg-white text-primary-900 rounded-2xl hover:bg-base-100 uppercase tracking-[0.2em] disabled:opacity-30 transition-all shadow-xl active:scale-95 border-b-4 border-base-300">Assign Missions</button>
                    </div>
                </div>
            </div>

            <div className="flex-grow min-h-0 overflow-hidden border-2 border-base-200 dark:border-base-700 rounded-3xl bg-white dark:bg-base-900 shadow-2xl relative flex flex-col mx-4 mb-4">
                 {isLoading ? (
                    <div className="flex flex-col items-center justify-center h-full text-base-500 font-black gap-4 uppercase tracking-[0.4em] bg-base-50 dark:bg-base-950">
                        <RefreshIcon className="animate-spin h-14 w-14 text-primary-500"/>Syncing Deployment Grid...
                    </div>
                 ) : (
                    <div className="overflow-auto flex-grow custom-scrollbar">
                        <table className="min-w-full text-xs text-left border-collapse border-spacing-0 table-fixed">
                            <thead className="bg-slate-900 text-white sticky top-0 z-40">
                                <tr>
                                    <th rowSpan={2} style={{ width: `${COL_DUE_WIDTH}px`, minWidth: `${COL_DUE_WIDTH}px` }} className="px-5 py-4 font-black text-[11px] uppercase tracking-widest border-r border-white/10 bg-slate-900 sticky left-0 z-[60] text-center text-slate-300">Due</th>
                                    <th rowSpan={2} style={{ width: `${COL_RID_WIDTH}px`, minWidth: `${COL_RID_WIDTH}px` }} className="px-5 py-4 font-black text-[11px] uppercase tracking-widest border-r border-white/10 bg-slate-900 sticky left-[80px] z-[60] text-center text-slate-300">Request ID & Status</th>
                                    {activeGridHeaders.map(([group, subKeys], i) => {
                                        const theme = HEADER_THEMES[i % HEADER_THEMES.length];
                                        return <th key={group} colSpan={subKeys.length} className={`px-4 py-3.5 font-black text-[13px] text-center border-b border-r border-white/10 uppercase tracking-[0.25em] ${theme.headerBg} ${theme.headerText} shadow-inner`}>{group}</th>;
                                    })}
                                    <th rowSpan={2} className="px-6 py-4 font-black text-[13px] uppercase tracking-[0.2em] bg-slate-800 dark:bg-base-950 w-48 text-center border-l border-white/10 text-slate-300">Unmapped</th>
                                </tr>
                                <tr>
                                    {activeGridHeaders.flatMap(([group, subKeys], i) => {
                                        const theme = HEADER_THEMES[i % HEADER_THEMES.length];
                                        return subKeys.map(key => <th key={key} className={`p-3 font-black text-[11px] text-center border-b border-r border-white/5 uppercase tracking-tighter w-24 ${theme.subHeaderBg} ${theme.subHeaderText} opacity-90`}>{key.split('|')[1]}</th>);
                                    })}
                                </tr>
                            </thead>
                            <tbody className="divide-y-2 divide-base-100 dark:divide-base-800 bg-white dark:bg-base-900">
                                {gridData.map(row => (
                                    <tr key={row.requestId} className="hover:bg-primary-50/30 dark:hover:bg-primary-900/10 transition-colors group">
                                        <td style={{ width: `${COL_DUE_WIDTH}px`, minWidth: `${COL_DUE_WIDTH}px` }} className="p-1 border-r border-base-200 dark:border-base-800 bg-base-50/95 dark:bg-base-900 sticky left-0 z-30 shadow-sm">{renderDueDateCell(row.minDueDate)}</td>
                                        <td style={{ width: `${COL_RID_WIDTH}px`, minWidth: `${COL_RID_WIDTH}px` }} className="px-4 py-3 font-black text-[15px] text-base-950 dark:text-base-50 border-r border-base-200 dark:border-base-800 bg-base-50/95 dark:bg-base-900 sticky left-[80px] z-30 shadow-sm">
                                            <div className="flex flex-col gap-2 w-full">
                                                <span className="tracking-tight shrink-0 font-black text-[16px] text-slate-900 dark:text-slate-100">{row.requestId.replace(/^RS1-/, '')}</span>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {row.isSprint && <span className="px-2 py-0.5 bg-rose-500 text-white text-[7px] rounded-md uppercase font-black tracking-widest shadow-sm ring-1 ring-rose-400">Sprint</span>}
                                                    {row.isUrgent && <span className="px-2 py-0.5 bg-orange-500 text-white text-[7px] rounded-md uppercase font-black tracking-widest shadow-sm ring-1 ring-orange-400">Urgent</span>}
                                                    {row.isLSP && <span className="px-2 py-0.5 bg-cyan-500 text-white text-[7px] rounded-md uppercase font-black tracking-widest shadow-sm ring-1 ring-cyan-400">LSP</span>}
                                                    {row.isPoCat && <span className="px-2 py-0.5 bg-violet-600 text-white text-[7px] rounded-md uppercase font-black tracking-widest shadow-sm ring-1 ring-violet-500">PoCat</span>}
                                                </div>
                                            </div>
                                        </td>
                                        {activeColumnKeys.map(header => (
                                            <ExpandableCell 
                                                key={header} headerKey={header} 
                                                items={row.cells[header] || []} 
                                                isGroupEnd={lastKeysOfGroups.has(header)}
                                                expandedCell={expandedCell} setExpandedCell={setExpandedCell}
                                                selectedItems={selectedItems} handleSelectItem={handleSelectItem} setSelectedItems={setSelectedItems}
                                                isAssigningToPrepare={isAssigningToPrepare} noteEditor={noteEditor} setNoteEditor={setNoteEditor} handleUpdatePlannerNote={handleUpdatePlannerNote}
                                            />
                                        ))}
                                        <ExpandableCell 
                                            headerKey="unmapped" items={row.unmappedItems}
                                            expandedCell={expandedCell} setExpandedCell={setExpandedCell}
                                            selectedItems={selectedItems} handleSelectItem={handleSelectItem} setSelectedItems={setSelectedItems}
                                            isAssigningToPrepare={isAssigningToPrepare} noteEditor={noteEditor} setNoteEditor={setNoteEditor} handleUpdatePlannerNote={handleUpdatePlannerNote}
                                        />
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                 )}
            </div>
        </div>
    );
};

export default TasksTab;
