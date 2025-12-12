
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { Tester, AssignedTask, AssignedPrepareTask, LabReport, CategorizedTask, RawTask } from '../types';
import { TaskStatus, TaskCategory } from '../types';
import { 
    getAssignedTasks, getAssignedPrepareTasks, getLabReport, updateAssignedTask, 
    deleteAssignedTask, unassignTaskToPool, markItemAsPrepared, returnTaskToPool, 
    saveLabReport 
} from '../services/dataService';
import { 
    XCircleIcon, UploadIcon, ClipboardListIcon, CogIcon, TrashIcon, UserGroupIcon, 
    AlertTriangleIcon, CheckCircleIcon, ChevronDownIcon 
} from './common/Icons';

declare const XLSX: any;

interface ScheduleTabProps {
    testers: Tester[];
    onTasksUpdated: () => void;
}

const ALL_COLUMNS = [
    'Request ID', 'Sample Name', 'Description', 'Variant', 'SDIDATAID', 'Note to planer', 
    'Additional Information', 'Remark (Requester)', 'Testing Condition', 
    'Due finish', 'Priority', 'Purpose'
];

const DEFAULT_VISIBLE_COLUMNS = ['Request ID', 'Sample Name', 'Description', 'Variant'];

const getTaskValue = (task: RawTask, header: string): string | number => {
    const lowerCaseHeader = header.toLowerCase().trim();
    const key = Object.keys(task).find(k => k.toLowerCase().trim() === lowerCaseHeader);
    return key ? task[key] : '';
};

const formatDate = (dateValue: string | number | undefined) => {
    if (!dateValue) return '';
    let date: Date;
    if (typeof dateValue === 'number') {
        const excelEpoch = new Date(Date.UTC(1899, 11, 30));
        date = new Date(excelEpoch.getTime() + dateValue * 24 * 60 * 60 * 1000);
    } else {
        date = new Date(dateValue);
    }
    if (isNaN(date.getTime())) return String(dateValue);
    const day = date.getUTCDate().toString().padStart(2, '0');
    const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
    return `${day}/${month}/${date.getUTCFullYear()}`;
};

// Formatting helper for Excel Export (DD/MM/YYYY)
const formatDateForExcel = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
};

const CircularProgress: React.FC<{ percentage: number; size: number; strokeWidth: number; color: string }> = ({ percentage, size, strokeWidth, color }) => {
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const offset = circumference - (percentage / 100) * circumference;

    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="transform -rotate-90">
            <circle cx={size / 2} cy={size / 2} r={radius} stroke="currentColor" strokeWidth={strokeWidth} fill="transparent" className="text-base-200 dark:text-base-700" />
            <circle cx={size / 2} cy={size / 2} r={radius} stroke="currentColor" strokeWidth={strokeWidth} fill="transparent" strokeDasharray={circumference} strokeDashoffset={offset} className={`transition-all duration-1000 ease-out ${color}`} strokeLinecap="round" />
        </svg>
    );
};

// --- MODALS AND VIEWS ---

const ReasonPromptModal: React.FC<{
    prompt: { action: 'notOk' | 'return'; docId: string; index: number; taskName: string; } | null;
    onClose: () => void;
    onSubmit: (reason: string) => void;
}> = ({ prompt, onClose, onSubmit }) => {
    const [reason, setReason] = useState('');
    if (!prompt) return null;

    return (
        <div className="fixed inset-0 bg-base-900/60 backdrop-blur-sm flex items-center justify-center z-[80] animate-fade-in" onClick={onClose}>
            <div className="bg-white dark:bg-base-800 rounded-2xl shadow-2xl p-6 w-full max-w-md m-4 space-y-4 animate-slide-in-up" onClick={e => e.stopPropagation()}>
                <h3 className="text-xl font-bold text-base-900 dark:text-base-100">{prompt.action === 'notOk' ? 'Report Issue' : 'Return Task'}</h3>
                <p className="text-sm text-base-500">
                    {prompt.action === 'notOk' ? `Describe the issue with "${prompt.taskName}".` : `Why are you returning "${prompt.taskName}"?`}
                </p>
                <textarea 
                    value={reason} 
                    onChange={e => setReason(e.target.value)} 
                    className="w-full p-3 rounded-xl border border-base-300 dark:border-base-600 dark:bg-base-900 focus:ring-2 focus:ring-primary-500 outline-none h-32 resize-none"
                    placeholder="Enter reason..."
                    autoFocus
                />
                <div className="flex justify-end gap-3 pt-2">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-base-600 hover:bg-base-100 rounded-lg">Cancel</button>
                    <button onClick={() => onSubmit(reason)} disabled={!reason.trim()} className="px-6 py-2 text-sm font-bold text-white bg-primary-600 rounded-lg shadow-md hover:bg-primary-700 disabled:opacity-50">Submit</button>
                </div>
            </div>
        </div>
    );
};

// Helper to determine tags for a task
const getTaskTags = (task: RawTask, category: TaskCategory) => {
    const tags = [];
    const prio = String(getTaskValue(task, 'Priority')).toLowerCase();
    const purp = String(getTaskValue(task, 'Purpose')).toLowerCase();
    const checkFields = ['Purpose', 'Priority', 'Remark (Requester)', 'Note to planer', 'Additional Information'];

    const isUrgent = category === TaskCategory.Urgent || prio === 'urgent';
    const isSprint = purp === 'sprint';
    const isPoCat = category === TaskCategory.PoCat || checkFields.some(f => String(getTaskValue(task, f)).toLowerCase().replace(/\s/g, '').includes('pocat'));
    const isLSP = checkFields.some(f => String(getTaskValue(task, f)).toLowerCase().includes('lsp'));

    if (isSprint) tags.push({ label: 'Sprint', className: 'bg-violet-100 text-violet-700 border-violet-200' });
    else if (isUrgent) tags.push({ label: 'Urgent', className: 'bg-red-100 text-red-700 border-red-200' });
    
    if (isLSP) tags.push({ label: 'LSP', className: 'bg-cyan-100 text-cyan-700 border-cyan-200' });
    if (isPoCat) tags.push({ label: 'PoCat', className: 'bg-orange-100 text-orange-700 border-orange-200' });

    return tags;
};

const DetailedView: React.FC<{
    data: { testerName: string; testingTasks: AssignedTask[]; prepareTasks: AssignedPrepareTask[] }[];
    onStatusChange: (docId: string, index: number, status: TaskStatus) => void;
    onReturn: (docId: string, index: number) => void;
    onPlannerUnassign: (docId: string, index: number) => void;
    onMarkPrepared: (prepTask: AssignedPrepareTask, itemIndex: number) => void;
    onNoteChange: (docId: string, index: number, note: string) => void;
    visibleColumns: Set<string>;
    expandedSections: Set<string>;
    toggleSection: (name: string) => void;
}> = ({ data, onStatusChange, onReturn, onPlannerUnassign, onMarkPrepared, onNoteChange, visibleColumns, expandedSections, toggleSection }) => {
    // Determine the column order based on ALL_COLUMNS, filtering by what's visible
    const sortedColumns = ALL_COLUMNS.filter(col => visibleColumns.has(col));

    return (
        <div className="space-y-6">
            {data.length === 0 && <div className="text-center text-base-400 italic py-12">No detailed records found.</div>}
            {data.map((person, idx) => (
                <div key={idx} className="bg-base-50 dark:bg-base-900/30 rounded-2xl border border-base-200 dark:border-base-700 overflow-hidden">
                    <div 
                        className="p-4 bg-white dark:bg-base-800 flex justify-between items-center cursor-pointer hover:bg-base-50 transition-colors"
                        onClick={() => toggleSection(person.testerName)}
                    >
                        <h3 className="font-bold text-lg text-base-800 dark:text-base-200 flex items-center gap-2">
                            <ChevronDownIcon className={`h-5 w-5 transition-transform ${expandedSections.has(person.testerName) ? 'rotate-180' : ''}`}/>
                            {person.testerName}
                        </h3>
                        <div className="flex gap-2 text-xs font-bold uppercase tracking-wider">
                            <span className="bg-primary-100 text-primary-700 px-2 py-1 rounded">Tests: {person.testingTasks.reduce((acc, t) => acc + t.tasks.length, 0)}</span>
                            <span className="bg-amber-100 text-amber-700 px-2 py-1 rounded">Prep: {person.prepareTasks.reduce((acc, t) => acc + t.tasks.length, 0)}</span>
                        </div>
                    </div>

                    {expandedSections.has(person.testerName) && (
                        <div className="p-4 overflow-x-auto">
                            <table className="min-w-full text-xs text-left whitespace-nowrap">
                                <thead className="bg-base-100 dark:bg-base-700 text-base-500 uppercase tracking-wider font-semibold">
                                    <tr>
                                        <th className="p-3">Type</th>
                                        <th className="p-3">Status</th>
                                        {/* Dynamic Headers based strictly on selection */}
                                        {sortedColumns.map(col => <th key={col} className="p-3">{col}</th>)}
                                        <th className="p-3">Notes</th>
                                        <th className="p-3 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-base-200 dark:divide-base-700">
                                    {/* Testing Tasks */}
                                    {person.testingTasks.map(at => at.tasks.map((task, i) => {
                                        const tags = getTaskTags(task, at.category);
                                        return (
                                        <tr key={`${at.id}-${i}`} className="bg-white dark:bg-base-800 hover:bg-base-50 dark:hover:bg-base-700/50">
                                            <td className="p-3 align-top">
                                                <div className="flex flex-col gap-1 items-start">
                                                    <span className="px-2 py-0.5 rounded bg-primary-100 text-primary-800 font-bold text-[10px]">TEST</span>
                                                    <div className="flex flex-wrap gap-1">
                                                        {tags.map((tag, idx) => (
                                                            <span key={idx} className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${tag.className}`}>
                                                                {tag.label}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-3">
                                                <select 
                                                    value={task.status || TaskStatus.Pending} 
                                                    onChange={e => onStatusChange(at.id, i, e.target.value as TaskStatus)}
                                                    className={`p-1.5 rounded text-xs font-bold border-none ring-1 ring-inset focus:ring-2 ${
                                                        task.status === TaskStatus.Done ? 'bg-emerald-100 text-emerald-700 ring-emerald-200' :
                                                        task.status === TaskStatus.NotOK ? 'bg-red-100 text-red-700 ring-red-200' :
                                                        'bg-base-100 text-base-700 ring-base-300'
                                                    }`}
                                                >
                                                    <option value={TaskStatus.Pending}>Pending</option>
                                                    <option value={TaskStatus.Done}>Done</option>
                                                    <option value={TaskStatus.NotOK}>Not OK</option>
                                                </select>
                                            </td>
                                            
                                            {/* Dynamic Columns */}
                                            {sortedColumns.map(col => {
                                                let val = getTaskValue(task, col);
                                                // Fallback for ID if not in item
                                                if (col === 'Request ID' && !val) val = at.requestId;
                                                if (col === 'Due finish') val = formatDate(val);
                                                return <td key={col} className="p-3 max-w-xs truncate" title={String(val)}>{String(val)}</td>;
                                            })}

                                            <td className="p-3"><input type="text" className="bg-transparent border-b border-dashed border-base-300 focus:border-primary-500 outline-none w-32 text-xs" placeholder="Add note..." value={task.plannerNote || ''} onChange={e => onNoteChange(at.id, i, e.target.value)}/></td>
                                            <td className="p-3 text-right flex justify-end gap-2">
                                                <button onClick={() => onReturn(at.id, i)} className="text-amber-500 hover:text-amber-700 font-bold">Return</button>
                                                <button onClick={() => onPlannerUnassign(at.id, i)} className="text-base-400 hover:text-red-500"><TrashIcon className="h-4 w-4"/></button>
                                            </td>
                                        </tr>
                                    );}))}
                                    {/* Prepare Tasks */}
                                    {person.prepareTasks.map(pt => pt.tasks.map((task, i) => {
                                        const tags = getTaskTags(task, pt.category);
                                        return (
                                        <tr key={`${pt.id}-${i}`} className="bg-amber-50/30 dark:bg-amber-900/10 hover:bg-amber-50 dark:hover:bg-amber-900/20">
                                            <td className="p-3 align-top">
                                                <div className="flex flex-col gap-1 items-start">
                                                    <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-bold text-[10px]">PREP</span>
                                                    <div className="flex flex-wrap gap-1">
                                                        {tags.map((tag, idx) => (
                                                            <span key={idx} className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${tag.className}`}>
                                                                {tag.label}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-3">
                                                {task.preparationStatus === 'Prepared' ? 
                                                    <span className="text-emerald-600 font-bold flex items-center gap-1"><CheckCircleIcon className="h-4 w-4"/> Ready</span> : 
                                                    <button onClick={() => onMarkPrepared(pt, i)} className="px-2 py-1 bg-amber-200 text-amber-800 rounded font-bold hover:bg-amber-300">Mark Done</button>
                                                }
                                            </td>
                                            
                                            {/* Dynamic Columns */}
                                            {sortedColumns.map(col => {
                                                let val = getTaskValue(task, col);
                                                if (col === 'Request ID' && !val) val = pt.requestId;
                                                if (col === 'Due finish') val = formatDate(val);
                                                return <td key={col} className="p-3 max-w-xs truncate" title={String(val)}>{String(val)}</td>;
                                            })}

                                            <td className="p-3 text-base-400 italic">Prep task</td>
                                            <td className="p-3 text-right"></td>
                                        </tr>
                                    );}))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};

const LabReportModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (report: LabReport) => void;
    date: string;
    shift: 'day' | 'night';
    initialData?: LabReport | null;
    testers: Tester[];
    reporterName?: string;
}> = ({ isOpen, onClose, onSubmit, date, shift, initialData }) => {
    const [toolsStatus, setToolsStatus] = useState<'Normal' | 'Abnormal'>('Normal');
    const [toolsIssue, setToolsIssue] = useState('');
    const [cleanlinessStatus, setCleanlinessStatus] = useState<'Clean' | 'Not Clean'>('Clean');
    const [cleanlinessArea, setCleanlinessArea] = useState('');
    const [cleanlinessImage, setCleanlinessImage] = useState<string>('');
    const [wasteLevel, setWasteLevel] = useState<'Green' | 'Yellow' | 'Red'>('Green');

    useEffect(() => {
        if (isOpen && initialData) {
            setToolsStatus(initialData.toolsStatus);
            setToolsIssue(initialData.toolsIssue || '');
            setCleanlinessStatus(initialData.cleanlinessStatus);
            setCleanlinessArea(initialData.cleanlinessArea || '');
            setCleanlinessImage(initialData.cleanlinessImage || '');
            setWasteLevel(initialData.wasteLevel);
        } else if (isOpen) {
            setToolsStatus('Normal');
            setToolsIssue('');
            setCleanlinessStatus('Clean');
            setCleanlinessArea('');
            setCleanlinessImage('');
            setWasteLevel('Green');
        }
    }, [isOpen, initialData]);

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onloadend = () => {
            setCleanlinessImage(reader.result as string);
        };
        reader.readAsDataURL(file);
    };

    const handleSubmit = () => {
        const report: LabReport = {
            id: initialData?.id,
            date, shift,
            toolsStatus,
            toolsIssue: toolsStatus === 'Abnormal' ? toolsIssue : undefined,
            cleanlinessStatus,
            cleanlinessArea: cleanlinessStatus === 'Not Clean' ? cleanlinessArea : undefined,
            cleanlinessImage: cleanlinessStatus === 'Not Clean' ? cleanlinessImage : undefined,
            wasteLevel,
            reporter: '', 
            timestamp: Date.now()
        };
        onSubmit(report);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-base-900/60 backdrop-blur-sm flex justify-center items-center z-[60] animate-fade-in">
            <div className="bg-white dark:bg-base-800 rounded-3xl shadow-2xl p-6 w-full max-w-lg space-y-6 animate-slide-in-up border border-base-200 overflow-y-auto max-h-[90vh] custom-scrollbar">
                <div className="flex justify-between items-center pb-2 border-b border-base-100">
                    <div>
                        <h3 className="text-xl font-black text-base-800 dark:text-base-100">Lab Shift Report</h3>
                        <p className="text-xs text-base-500 font-medium uppercase tracking-wide">{date} • {shift} Shift</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-base-100 rounded-full"><XCircleIcon className="h-6 w-6 text-base-400"/></button>
                </div>

                <div className="space-y-5">
                    {/* Tools */}
                    <div className="bg-base-50 p-4 rounded-xl border border-base-200">
                        <label className="block text-sm font-bold text-base-800 mb-2 flex items-center gap-2">
                            <span>🔧 Equipment Status</span>
                        </label>
                        <div className="flex gap-2 mb-3">
                            {['Normal', 'Abnormal'].map((status) => (
                                <button key={status} onClick={() => setToolsStatus(status as any)} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${toolsStatus === status ? (status === 'Normal' ? 'bg-emerald-500 text-white shadow-emerald-200 shadow-md' : 'bg-red-500 text-white shadow-red-200 shadow-md') : 'bg-white text-base-500 border border-base-200'}`}>
                                    {status}
                                </button>
                            ))}
                        </div>
                        {toolsStatus === 'Abnormal' && (
                            <textarea placeholder="Describe the issue..." value={toolsIssue} onChange={e => setToolsIssue(e.target.value)} className="w-full p-3 text-sm rounded-lg border border-red-200 bg-red-50 focus:ring-2 focus:ring-red-200 outline-none" rows={2}/>
                        )}
                    </div>

                    {/* 5S */}
                    <div className="bg-base-50 p-4 rounded-xl border border-base-200">
                        <label className="block text-sm font-bold text-base-800 mb-2 flex items-center gap-2">
                            <span>✨ 5S Condition</span>
                        </label>
                        <div className="flex gap-2 mb-3">
                            {['Clean', 'Not Clean'].map((status) => (
                                <button key={status} onClick={() => setCleanlinessStatus(status as any)} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${cleanlinessStatus === status ? (status === 'Clean' ? 'bg-emerald-500 text-white shadow-emerald-200 shadow-md' : 'bg-amber-500 text-white shadow-amber-200 shadow-md') : 'bg-white text-base-500 border border-base-200'}`}>
                                    {status}
                                </button>
                            ))}
                        </div>
                        {cleanlinessStatus === 'Not Clean' && (
                            <div className="space-y-2">
                                <input type="text" placeholder="Which area is dirty?" value={cleanlinessArea} onChange={e => setCleanlinessArea(e.target.value)} className="w-full p-3 text-sm rounded-lg border border-amber-200 bg-amber-50 focus:ring-2 focus:ring-amber-200 outline-none"/>
                                <div className="flex items-center gap-2">
                                    <label className="flex-1 cursor-pointer bg-white border border-dashed border-base-300 rounded-lg p-3 text-center hover:bg-base-50 transition-colors">
                                        <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                                        <div className="flex flex-col items-center justify-center gap-1">
                                            <UploadIcon className="h-5 w-5 text-base-400"/>
                                            <span className="text-xs text-base-500 font-medium">Upload Photo</span>
                                        </div>
                                    </label>
                                    {cleanlinessImage && <div className="h-16 w-16 rounded-lg bg-cover bg-center border border-base-200" style={{backgroundImage: `url(${cleanlinessImage})`}}></div>}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Waste */}
                    <div className="bg-base-50 p-4 rounded-xl border border-base-200">
                        <label className="block text-sm font-bold text-base-800 mb-2 flex items-center gap-2">
                            <span>🗑️ Waste Level</span>
                        </label>
                        <div className="grid grid-cols-3 gap-3">
                            {[
                                { val: 'Green', color: 'bg-emerald-500', label: 'Low' },
                                { val: 'Yellow', color: 'bg-yellow-400', label: 'Medium' },
                                { val: 'Red', color: 'bg-red-500', label: 'Full' }
                            ].map((opt) => (
                                <button key={opt.val} onClick={() => setWasteLevel(opt.val as any)} className={`py-4 rounded-xl font-bold text-white transition-transform active:scale-95 shadow-md flex flex-col items-center justify-center gap-1 ${wasteLevel === opt.val ? opt.color + ' ring-4 ring-offset-2 ring-base-100' : 'bg-base-300 text-base-500'}`}>
                                    <span className="text-lg uppercase">{opt.val}</span>
                                    <span className="text-[10px] opacity-80 font-medium">{opt.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <button onClick={handleSubmit} className="w-full py-4 bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-xl shadow-lg shadow-primary-200 transition-all text-lg">
                    {initialData ? 'Update Report' : 'Submit Report'}
                </button>
            </div>
        </div>
    );
};

const LabStatusDashboard: React.FC<{ report: LabReport | null; onOpenImage: (img: string) => void; isCompact?: boolean }> = ({ report, onOpenImage, isCompact }) => {
    if (!report) return (
        <div className="p-6 rounded-2xl border-2 border-dashed border-base-200 bg-base-50/50 flex flex-col items-center justify-center text-base-400 gap-2 mb-6">
            <ClipboardListIcon className="h-8 w-8 opacity-20"/>
            <span className="text-sm font-semibold">No lab report submitted for this shift yet.</span>
        </div>
    );

    const layoutClass = isCompact ? "grid grid-cols-1 gap-3" : "grid grid-cols-1 md:grid-cols-3 gap-4 mb-6";

    return (
        <div className={layoutClass}>
            <div className={`p-4 rounded-2xl border shadow-sm flex items-start gap-4 transition-all ${report.toolsStatus === 'Normal' ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
                <div className={`p-3 rounded-xl ${report.toolsStatus === 'Normal' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                    <CogIcon className="h-6 w-6"/>
                </div>
                <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider opacity-60 mb-1">Equipment</h4>
                    <div className={`text-lg font-black ${report.toolsStatus === 'Normal' ? 'text-emerald-700' : 'text-red-700'}`}>{report.toolsStatus}</div>
                    {report.toolsIssue && <p className="text-xs mt-1 font-medium text-red-600 leading-tight">{report.toolsIssue}</p>}
                </div>
            </div>

            <div className={`p-4 rounded-2xl border shadow-sm flex items-start gap-4 transition-all ${report.cleanlinessStatus === 'Clean' ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100'}`}>
                <div className={`p-3 rounded-xl ${report.cleanlinessStatus === 'Clean' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                    <span className="text-xl">✨</span>
                </div>
                <div className="flex-1">
                    <h4 className="text-xs font-bold uppercase tracking-wider opacity-60 mb-1">5S Condition</h4>
                    <div className={`text-lg font-black ${report.cleanlinessStatus === 'Clean' ? 'text-emerald-700' : 'text-amber-700'}`}>{report.cleanlinessStatus}</div>
                    {report.cleanlinessArea && <p className="text-xs mt-1 font-medium text-amber-800">Area: {report.cleanlinessArea}</p>}
                </div>
                {report.cleanlinessImage && (
                    <button onClick={() => onOpenImage(report.cleanlinessImage!)} className="p-2 bg-white rounded-lg shadow-sm text-xs font-bold text-amber-600 hover:bg-amber-50 border border-amber-200">
                        Photo
                    </button>
                )}
            </div>

            <div className={`p-4 rounded-2xl border shadow-sm flex items-center gap-4 transition-all relative overflow-hidden text-white
                ${report.wasteLevel === 'Green' ? 'bg-emerald-500 border-emerald-600' : 
                  report.wasteLevel === 'Yellow' ? 'bg-yellow-400 border-yellow-500' : 'bg-red-500 border-red-600'}
            `}>
                <div className="relative z-10 p-3 rounded-xl bg-white/20 backdrop-blur-sm">
                    <TrashIcon className="h-6 w-6"/>
                </div>
                <div className="relative z-10">
                    <h4 className="text-xs font-bold uppercase tracking-wider opacity-80 mb-1">Waste Level</h4>
                    <div className="text-2xl font-black">{report.wasteLevel}</div>
                </div>
                <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-white/10 rounded-full"></div>
            </div>
        </div>
    );
};

interface TaskItemDetail { sampleName: string; description: string; status: TaskStatus | 'Returned' | 'Prepared' | 'Pending'; remark?: string; requestId: string; category?: TaskCategory; }
interface TaskGroupSummary { description: string; total: number; done: number; items: TaskItemDetail[]; }
interface SummaryPersonData { 
    testerName: string; 
    total: number; 
    done: number; 
    notOk: number; 
    returned: number; 
    urgent: number;
    sprint: number;
    lsp: number;
    pocat: number;
    taskGroups: TaskGroupSummary[]; 
}

const SummaryView: React.FC<{ data: SummaryPersonData[]; labReport: LabReport | null }> = ({ data, labReport }) => {
    const totalTasks = data.reduce((acc, p) => acc + p.total, 0);
    const totalDone = data.reduce((acc, p) => acc + p.done, 0);
    const totalIssues = data.reduce((acc, p) => acc + p.notOk + p.returned, 0);
    const globalProgress = totalTasks > 0 ? (totalDone / totalTasks) * 100 : 0;

    const totalUrgent = data.reduce((acc, p) => acc + p.urgent, 0);
    const totalSprint = data.reduce((acc, p) => acc + p.sprint, 0);
    const totalLsp = data.reduce((acc, p) => acc + p.lsp, 0);
    const totalPoCat = data.reduce((acc, p) => acc + p.pocat, 0);

    const [imageModal, setImageModal] = useState<string | null>(null);

    return (
        <div className="space-y-6 animate-fade-in flex flex-col lg:flex-row gap-6 items-start h-full">
            {imageModal && (
                <div className="fixed inset-0 z-[70] bg-black/90 flex items-center justify-center p-4 animate-fade-in" onClick={() => setImageModal(null)}>
                    <img src={imageModal} alt="5S Issue" className="max-w-full max-h-full rounded-xl shadow-2xl"/>
                    <button className="absolute top-4 right-4 text-white hover:text-base-300"><XCircleIcon className="h-8 w-8"/></button>
                </div>
            )}

            {/* MAIN CONTENT COLUMN */}
            <div className="flex-1 min-w-0 space-y-6">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white dark:bg-base-800 rounded-2xl p-4 border border-base-200 dark:border-base-700 shadow-sm flex items-center justify-between">
                        <div><p className="text-base-400 text-[10px] font-bold uppercase tracking-wider mb-1">Active Personnel</p><h3 className="text-2xl font-black text-base-800 dark:text-base-100">{data.length}</h3></div>
                        <div className="bg-base-100 dark:bg-base-700 p-2.5 rounded-xl"><UserGroupIcon className="h-5 w-5 text-base-500"/></div>
                    </div>
                    <div className="bg-white dark:bg-base-800 rounded-2xl p-4 border border-base-200 dark:border-base-700 shadow-sm flex items-center justify-between">
                        <div><p className="text-base-400 text-[10px] font-bold uppercase tracking-wider mb-1">Total Tasks</p><h3 className="text-2xl font-black text-base-800 dark:text-base-100">{totalTasks}</h3></div>
                        <div className="bg-base-100 dark:bg-base-700 p-2.5 rounded-xl"><ClipboardListIcon className="h-5 w-5 text-base-500"/></div>
                    </div>
                    <div className="bg-white dark:bg-base-800 rounded-2xl p-4 border border-base-200 dark:border-base-700 shadow-sm flex items-center justify-between">
                        <div><p className="text-base-400 text-[10px] font-bold uppercase tracking-wider mb-1">Completion Rate</p><h3 className="text-2xl font-black text-emerald-600">{Math.round(globalProgress)}%</h3></div>
                        <CircularProgress percentage={globalProgress} size={42} strokeWidth={4} color="text-emerald-500" />
                    </div>
                     <div className="bg-white dark:bg-base-800 rounded-2xl p-4 border border-base-200 dark:border-base-700 shadow-sm flex items-center justify-between">
                        <div><p className="text-base-400 text-[10px] font-bold uppercase tracking-wider mb-1">Issues / Returns</p><h3 className={`text-2xl font-black ${totalIssues > 0 ? 'text-red-500' : 'text-base-300'}`}>{totalIssues}</h3></div>
                        <div className={`p-2.5 rounded-xl ${totalIssues > 0 ? 'bg-red-50 text-red-500' : 'bg-base-100 text-base-300'}`}><AlertTriangleIcon className="h-5 w-5"/></div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {data.map((person) => {
                        const progressPercent = person.total > 0 ? (person.done / person.total) * 100 : 0;
                        const initials = person.testerName.split(' ').map(n=>n[0]).join('').substring(0,2).toUpperCase();
                        const hasIssues = person.notOk > 0 || person.returned > 0;

                        return (
                            <div key={person.testerName} className="flex flex-col bg-white dark:bg-base-800 rounded-2xl border border-base-200 dark:border-base-700 shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden group">
                                {/* Enhanced Header with Pop/Gradient */}
                                <div className="p-4 border-b border-base-100 dark:border-base-700 bg-gradient-to-r from-base-50 to-white dark:from-base-800 dark:to-base-900 relative overflow-hidden">
                                    <div className="flex justify-between items-center relative z-10">
                                        <div className="flex gap-4 items-center">
                                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary-500 to-indigo-600 text-white shadow-lg shadow-primary-200/50 flex items-center justify-center font-black text-lg border-2 border-white dark:border-base-700">
                                                {initials}
                                            </div>
                                            <div className="min-w-0">
                                                <h3 className="font-black text-xl text-base-900 dark:text-base-100 leading-tight truncate tracking-tight">{person.testerName}</h3>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="px-2 py-0.5 rounded-md bg-base-100 dark:bg-base-700 text-[11px] font-bold text-base-500 uppercase tracking-wide border border-base-200 dark:border-base-600">{person.total} Tasks</span>
                                                    {hasIssues && <span className="px-2 py-0.5 rounded-md bg-red-50 text-red-600 text-[11px] font-bold uppercase tracking-wide flex items-center gap-1 border border-red-100"><AlertTriangleIcon className="h-3 w-3"/> Check</span>}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-center justify-center pl-2">
                                            <div className={`text-2xl font-black ${progressPercent === 100 ? 'text-emerald-500' : 'text-primary-600'}`}>{Math.round(progressPercent)}%</div>
                                            <div className="text-[10px] text-base-400 font-bold uppercase tracking-wide">Done</div>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex divide-x divide-base-100 dark:divide-base-700 bg-base-50/50 dark:bg-base-900/30">
                                    <div className="flex-1 py-2 text-center"><span className="block text-[10px] text-base-400 font-bold uppercase">Pending</span><span className="block text-sm font-bold text-base-700 dark:text-base-300">{person.total - person.done}</span></div>
                                    <div className="flex-1 py-2 text-center"><span className="block text-[10px] text-base-400 font-bold uppercase">Done</span><span className="block text-sm font-bold text-emerald-600">{person.done}</span></div>
                                    <div className="flex-1 py-2 text-center"><span className="block text-[10px] text-base-400 font-bold uppercase">Issues</span><span className={`block text-sm font-bold ${person.notOk > 0 ? 'text-red-500' : 'text-base-300'}`}>{person.notOk}</span></div>
                                </div>
                                <div className="flex-grow overflow-y-auto custom-scrollbar max-h-[280px] p-2 bg-base-50/30 dark:bg-base-900/10">
                                    {person.taskGroups.map((group, idx) => (
                                        <details key={idx} className="group/item bg-white dark:bg-base-800 rounded-lg shadow-sm border border-base-200 dark:border-base-700 overflow-hidden mb-2">
                                            <summary className="p-3 cursor-pointer list-none flex justify-between items-center hover:bg-base-50 dark:hover:bg-base-700 transition-colors">
                                                <div className="flex items-center gap-2 overflow-hidden"><ChevronDownIcon className="h-4 w-4 text-base-400 group-open/item:rotate-180 transition-transform flex-shrink-0" /><span className="text-sm font-bold text-base-800 dark:text-base-200 truncate">{group.description}</span></div>
                                                <div className="flex items-center gap-2 flex-shrink-0"><span className="text-[10px] font-bold bg-base-100 dark:bg-base-700 px-2 py-1 rounded text-base-500">{group.done}/{group.total}</span></div>
                                            </summary>
                                            <div className="px-2 pb-2 pt-1 space-y-1">
                                                {group.items.map((item, i) => {
                                                    const isDone = item.status === TaskStatus.Done || item.status === 'Prepared';
                                                    const isNotOk = item.status === TaskStatus.NotOK;
                                                    const isReturned = item.status === 'Returned';
                                                    
                                                    return (
                                                        <div key={i} className="flex items-center gap-3 pl-3 py-2 border-l-2 border-transparent hover:border-primary-500 hover:bg-base-50 dark:hover:bg-base-700/50 transition-all duration-200 group/row rounded-r-md">
                                                            {/* Status Icon */}
                                                            <div className={`
                                                                flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center border shadow-sm transition-all duration-300
                                                                ${isDone ? 'bg-emerald-100 border-emerald-200 text-emerald-600 scale-100' : 
                                                                  isNotOk ? 'bg-red-100 border-red-200 text-red-600' :
                                                                  isReturned ? 'bg-amber-100 border-amber-200 text-amber-600' :
                                                                  'bg-base-50 border-base-200 text-base-300'}
                                                            `}>
                                                                {isDone ? <CheckCircleIcon className="w-4 h-4" /> : 
                                                                 isNotOk ? <XCircleIcon className="w-4 h-4" /> :
                                                                 isReturned ? <AlertTriangleIcon className="w-4 h-4" /> :
                                                                 <div className="w-2 h-2 rounded-full bg-current opacity-50" />}
                                                            </div>

                                                            <div className="flex-1 min-w-0 flex flex-col justify-center">
                                                                {/* Task Text: Larger, No Strikethrough for Done */}
                                                                <div className={`text-sm font-semibold truncate transition-colors ${isDone ? 'text-emerald-700/80 dark:text-emerald-400' : 'text-base-700 dark:text-base-200'}`} title={item.description || item.sampleName}>
                                                                    {item.description || item.sampleName}
                                                                </div>
                                                                {item.remark && <div className="text-[11px] text-red-500 truncate italic mt-0.5">{item.remark}</div>}
                                                            </div>

                                                            {/* Status Pill Badge */}
                                                            {item.status !== 'Pending' && (
                                                                <div className={`
                                                                    px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider shadow-sm border flex-shrink-0
                                                                    ${isDone ? 'bg-emerald-500 text-white border-emerald-600' : 
                                                                      isNotOk ? 'bg-red-500 text-white border-red-600 animate-pulse' :
                                                                      isReturned ? 'bg-amber-500 text-white border-amber-600' : 'hidden'}
                                                                `}>
                                                                    {item.status}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </details>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* SIDEBAR COLUMN */}
            <div className="w-full lg:w-72 flex-shrink-0 space-y-6 lg:sticky lg:top-0">
                <div>
                    <h3 className="text-xs font-bold text-base-400 uppercase tracking-widest mb-3 pl-1">Lab Status</h3>
                    <LabStatusDashboard report={labReport} onOpenImage={setImageModal} isCompact={true} />
                </div>

                <div>
                    <h3 className="text-xs font-bold text-base-400 uppercase tracking-widest mb-3 pl-1">Priorities</h3>
                    <div className="grid grid-cols-2 gap-3">
                        {[
                            { label: 'Sprint', count: totalSprint, icon: '⚡', color: 'from-violet-500 to-purple-600', shadow: 'shadow-violet-200' },
                            { label: 'Urgent', count: totalUrgent, icon: '🔥', color: 'from-red-500 to-rose-600', shadow: 'shadow-red-200' },
                            { label: 'LSP', count: totalLsp, icon: '🧬', color: 'from-cyan-500 to-blue-600', shadow: 'shadow-cyan-200' },
                            { label: 'PoCat', count: totalPoCat, icon: '🧪', color: 'from-orange-400 to-amber-500', shadow: 'shadow-orange-200' },
                        ].map((item, i) => (
                             <div key={i} className={`bg-gradient-to-br ${item.color} rounded-xl p-3 text-white shadow-sm dark:shadow-none flex flex-col justify-between relative overflow-hidden group min-h-[90px]`}>
                                <div className="relative z-10 flex justify-between items-start">
                                    <p className="text-white/80 text-[10px] font-bold uppercase tracking-wider mb-1">{item.label}</p>
                                    <span className="text-base opacity-50">{item.icon}</span>
                                </div>
                                <h3 className="text-2xl font-black relative z-10">{item.count}</h3>
                                <div className="absolute -bottom-4 -right-4 w-16 h-16 bg-white/10 rounded-full group-hover:scale-150 transition-transform duration-500"></div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

const ScheduleTab: React.FC<ScheduleTabProps> = ({ testers, onTasksUpdated }) => {
    const [assignedTasks, setAssignedTasks] = useState<AssignedTask[]>([]);
    const [prepareTasks, setPrepareTasks] = useState<AssignedPrepareTask[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'summary' | 'detailed'>('summary');
    const [filters, setFilters] = useState({ startDate: new Date().toISOString().split('T')[0], endDate: new Date().toISOString().split('T')[0], testerId: 'all', shift: 'all' as 'all' | 'day' | 'night' });
    const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set(DEFAULT_VISIBLE_COLUMNS));
    const [isColSelectorOpen, setIsColSelectorOpen] = useState(false);
    const [reasonPrompt, setReasonPrompt] = useState<{ action: 'notOk' | 'return'; docId: string; index: number; taskName: string; } | null>(null);
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
    const [labReportModalOpen, setLabReportModalOpen] = useState(false);
    const [currentLabReport, setCurrentLabReport] = useState<LabReport | null>(null);

    const fetchData = useCallback(async () => {
        setIsLoading(true); setError(null);
        try {
            const [assigned, prepared] = await Promise.all([getAssignedTasks(), getAssignedPrepareTasks()]);
            setAssignedTasks(assigned); setPrepareTasks(prepared);
            const shiftToFetch = filters.shift === 'all' ? 'day' : filters.shift;
            const report = await getLabReport(filters.startDate, shiftToFetch);
            setCurrentLabReport(report);
        } catch (e) { console.error(e); setError("Failed to load schedule data."); } finally { setIsLoading(false); }
    }, [filters.startDate, filters.shift]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const { filteredAssigned, filteredPrepare } = useMemo(() => {
        const start = new Date(filters.startDate).setHours(0,0,0,0);
        const end = new Date(filters.endDate).setHours(23,59,59,999);
        const filterItem = (dateStr: string, tId: string, shift: string) => {
            const date = new Date(dateStr).getTime();
            return date >= start && date <= end && (filters.testerId === 'all' || tId === filters.testerId) && (filters.shift === 'all' || shift === filters.shift);
        };
        return { filteredAssigned: assignedTasks.filter(t => filterItem(t.assignedDate, t.testerId, t.shift)), filteredPrepare: prepareTasks.filter(t => filterItem(t.assignedDate, t.assistantId, t.shift)) };
    }, [assignedTasks, prepareTasks, filters]);

    const summaryData = useMemo(() => {
         const personMap: Record<string, SummaryPersonData> = {};
         const getPerson = (id: string, name: string) => { if (!personMap[id]) personMap[id] = { testerName: name, total: 0, done: 0, notOk: 0, returned: 0, urgent: 0, sprint: 0, lsp: 0, pocat: 0, taskGroups: [] }; return personMap[id]; }

         filteredAssigned.forEach(at => {
             const p = getPerson(at.testerId, at.testerName);
             const groupDetails: TaskItemDetail[] = [];
             at.tasks.forEach((t: RawTask) => {
                 p.total++; if (t.status === TaskStatus.Done) p.done++; if (t.status === TaskStatus.NotOK) p.notOk++;
                 const prio = String(getTaskValue(t, 'Priority')).toLowerCase(); const purp = String(getTaskValue(t, 'Purpose')).toLowerCase();
                 if (prio === 'urgent') p.urgent++; if (purp === 'sprint') p.sprint++; if (at.category === TaskCategory.PoCat) p.pocat++;
                 if (['Purpose', 'Priority', 'Remark (Requester)', 'Note to planer', 'Additional Information'].some(f => String(getTaskValue(t, f)).toLowerCase().includes('lsp'))) p.lsp++;
                 
                 let finalStatus: string = t.status || TaskStatus.Pending;
                 if (t.isReturned) finalStatus = 'Returned';

                 groupDetails.push({ 
                     sampleName: String(getTaskValue(t, 'Sample Name')), 
                     description: String(getTaskValue(t, 'Description')),
                     status: finalStatus as any, 
                     remark: t.notOkReason || t.returnReason || undefined, 
                     requestId: at.requestId, 
                     category: at.category 
                 });
             });
             if (groupDetails.length > 0) p.taskGroups.push({ description: `Request ${at.requestId} (${at.tasks.length})`, total: groupDetails.length, done: groupDetails.filter(d => d.status === TaskStatus.Done).length, items: groupDetails });
         });

         filteredPrepare.forEach(pt => {
             const p = getPerson(pt.assistantId, pt.assistantName);
             const groupDetails: TaskItemDetail[] = [];
             pt.tasks.forEach((t: RawTask) => { 
                 p.total++; if (t.preparationStatus === 'Prepared') p.done++; 
                 groupDetails.push({ 
                     sampleName: String(getTaskValue(t, 'Sample Name')), 
                     description: String(getTaskValue(t, 'Description')),
                     status: t.preparationStatus === 'Prepared' ? 'Prepared' : 'Pending', 
                     requestId: pt.requestId 
                 }); 
             });
             if (groupDetails.length > 0) p.taskGroups.push({ description: `Prep: ${pt.requestId}`, total: groupDetails.length, done: groupDetails.filter(d => d.status === 'Prepared').length, items: groupDetails });
         });
         return Object.values(personMap);
    }, [filteredAssigned, filteredPrepare]);

    const detailedData = useMemo(() => {
        const personMap: Record<string, { testerName: string; testingTasks: AssignedTask[]; prepareTasks: AssignedPrepareTask[] }> = {};
        filteredAssigned.forEach(t => { if (!personMap[t.testerId]) personMap[t.testerId] = { testerName: t.testerName, testingTasks: [], prepareTasks: [] }; personMap[t.testerId].testingTasks.push(t); });
        filteredPrepare.forEach(t => { if (!personMap[t.assistantId]) personMap[t.assistantId] = { testerName: t.assistantName, testingTasks: [], prepareTasks: [] }; personMap[t.assistantId].prepareTasks.push(t); });
        return Object.values(personMap);
    }, [filteredAssigned, filteredPrepare]);

    const handleStatusChange = async (docId: string, index: number, status: TaskStatus) => {
        const taskGroup = assignedTasks.find(t => t.id === docId); if (!taskGroup) return;
        if (status === TaskStatus.NotOK) { setReasonPrompt({ action: 'notOk', docId, index, taskName: String(getTaskValue(taskGroup.tasks[index], 'Sample Name')) }); return; }
        const newTasks = [...taskGroup.tasks]; newTasks[index] = { ...newTasks[index], status };
        try { await updateAssignedTask(docId, { tasks: newTasks }); setAssignedTasks(prev => prev.map(t => t.id === docId ? { ...t, tasks: newTasks } : t)); } catch(e) { console.error(e); }
    };
    const handleReturnTask = (docId: string, index: number) => { const taskGroup = assignedTasks.find(t => t.id === docId); if (taskGroup) setReasonPrompt({ action: 'return', docId, index, taskName: String(getTaskValue(taskGroup.tasks[index], 'Sample Name')) }); };
    const handlePlannerUnassign = async (docId: string, index: number) => {
        const taskGroup = assignedTasks.find(t => t.id === docId); if (!taskGroup) return;
        const taskItem = taskGroup.tasks[index]; const newTasks = taskGroup.tasks.filter((_, i) => i !== index);
        try { if (newTasks.length === 0) await deleteAssignedTask(docId); else await updateAssignedTask(docId, { tasks: newTasks }); await unassignTaskToPool({ id: taskGroup.requestId, tasks: [taskItem], category: taskGroup.category }); onTasksUpdated(); fetchData(); } catch(e) { console.error(e); }
    };
    const handleMarkItemAsPrepared = async (prepTask: AssignedPrepareTask, itemIndex: number) => { try { await markItemAsPrepared(prepTask, itemIndex); fetchData(); } catch(e) { console.error(e); } };
    const handleNoteChange = async (docId: string, index: number, note: string) => { const taskGroup = assignedTasks.find(t => t.id === docId); if (!taskGroup) return; const newTasks = [...taskGroup.tasks]; newTasks[index] = { ...newTasks[index], plannerNote: note }; try { await updateAssignedTask(docId, { tasks: newTasks }); setAssignedTasks(prev => prev.map(t => t.id === docId ? { ...t, tasks: newTasks } : t)); } catch(e) { console.error(e); } };
    const handleReasonSubmit = async (reason: string) => {
        if (!reasonPrompt) return; const { action, docId, index } = reasonPrompt; const taskGroup = assignedTasks.find(t => t.id === docId);
        if (taskGroup) {
            const taskItem = taskGroup.tasks[index];
            if (action === 'notOk') { const newTasks = [...taskGroup.tasks]; newTasks[index] = { ...taskItem, status: TaskStatus.NotOK, notOkReason: reason }; await updateAssignedTask(docId, { tasks: newTasks }); }
            else if (action === 'return') { const newTasks = taskGroup.tasks.filter((_, i) => i !== index); if (newTasks.length === 0) await deleteAssignedTask(docId); else await updateAssignedTask(docId, { tasks: newTasks }); await returnTaskToPool({ id: taskGroup.requestId, tasks: [taskItem], category: taskGroup.category, returnReason: reason, returnedBy: taskGroup.testerName }); onTasksUpdated(); }
            fetchData();
        }
        setReasonPrompt(null);
    };
    const handleLabReportSubmit = async (report: LabReport) => { try { await saveLabReport(report); setCurrentLabReport(report); } catch(e) { console.error("Failed to save report", e); alert("Failed to submit report"); } };
    
    const exportToExcel = () => {
         const detailedRows: any[] = [];
         
         // 1. Detailed Data
         filteredAssigned.forEach(at => { 
             at.tasks.forEach(t => { 
                 const row: any = { 
                     'Tester': at.testerName, 
                     'Date': at.assignedDate, 
                     'Shift': at.shift, 
                     'Request ID': at.requestId, 
                     'Status': t.status || 'Pending', 
                     'Note': t.plannerNote || '', 
                     'Issue/Return Reason': t.notOkReason || t.returnReason || '' 
                 }; 
                 ALL_COLUMNS.forEach(col => { 
                     row[col] = getTaskValue(t, col); 
                 }); 
                 detailedRows.push(row); 
             }); 
         });

         // 2. Sheet 2 Data (Specific Layout: Title on Row 1, Headers Row 2)
         const sheet2Data: any[][] = [];
         // Row 1: Title
         sheet2Data.push(["Count of Variant"]);
         // Row 2: Headers
         sheet2Data.push(["SDIDATAID", "Assign Analyst", "Assign Start date"]);

         // Data Rows
         filteredAssigned.forEach(at => {
             at.tasks.forEach(t => {
                 sheet2Data.push([
                     getTaskValue(t, 'SDIDATAID'),
                     at.testerName,
                     formatDateForExcel(at.assignedDate)
                 ]);
             });
         });

         const wb = XLSX.utils.book_new(); 
         
         // Sheet 1: Detailed
         const wsDetailed = XLSX.utils.json_to_sheet(detailedRows); 
         XLSX.utils.book_append_sheet(wb, wsDetailed, "Detailed Schedule");
         
         // Sheet 2: Count of Variant
         const wsSheet2 = XLSX.utils.aoa_to_sheet(sheet2Data);
         XLSX.utils.book_append_sheet(wb, wsSheet2, "Count of Variant");

         XLSX.writeFile(wb, `Schedule_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    return (
        <div className="flex flex-col h-[calc(100vh-140px)] animate-slide-in-up">
            <LabReportModal isOpen={labReportModalOpen} onClose={() => setLabReportModalOpen(false)} onSubmit={handleLabReportSubmit} date={filters.startDate} shift={filters.shift === 'all' ? 'day' : filters.shift} testers={testers} initialData={currentLabReport} />
            <div className="flex-shrink-0 mb-4 space-y-4">
                <div className="flex justify-between items-end">
                    <div><h2 className="text-2xl font-bold text-base-900 dark:text-base-100">Track Schedule</h2><p className="text-sm text-base-500">Monitor assignments, status, and reporting</p></div>
                    <div className="flex gap-3"><button onClick={() => setLabReportModalOpen(true)} className="px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-xl shadow-lg transition-all flex items-center gap-2"><span>Submit Shift Report</span></button><button onClick={exportToExcel} className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg transition-all flex items-center gap-2"><span>Export Excel</span></button></div>
                </div>
                <div className="bg-white dark:bg-base-800 p-4 rounded-2xl border border-base-200 dark:border-base-700 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="md:col-span-1"><label className="text-xs font-bold text-base-400 uppercase ml-1">Date Range</label><div className="flex gap-2 mt-1"><input type="date" value={filters.startDate} onChange={e => setFilters({ ...filters, startDate: e.target.value })} className="w-full p-2.5 rounded-xl bg-base-50 dark:bg-base-900 border text-sm" /><input type="date" value={filters.endDate} onChange={e => setFilters({ ...filters, endDate: e.target.value })} className="w-full p-2.5 rounded-xl bg-base-50 dark:bg-base-900 border text-sm" /></div></div>
                    <div><label className="text-xs font-bold text-base-400 uppercase ml-1">Filter by Person</label><select value={filters.testerId} onChange={e => setFilters({ ...filters, testerId: e.target.value })} className="w-full mt-1 p-2.5 rounded-xl bg-base-50 dark:bg-base-900 border text-sm"><option value="all">All Personnel</option>{testers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
                    <div><label className="text-xs font-bold text-base-400 uppercase ml-1">Shift</label><select value={filters.shift} onChange={e => setFilters({ ...filters, shift: e.target.value as any })} className="w-full mt-1 p-2.5 rounded-xl bg-base-50 dark:bg-base-900 border text-sm"><option value="all">All Shifts</option><option value="day">Day Shift</option><option value="night">Night Shift</option></select></div>
                </div>
                <div className="flex justify-between items-center px-1">
                    <div className="flex p-1 bg-base-100 dark:bg-base-800 rounded-xl border border-base-200 dark:border-base-700"><button onClick={() => setViewMode('summary')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${viewMode === 'summary' ? 'bg-white dark:bg-base-700 shadow-sm' : 'text-base-500'}`}>Summary View</button><button onClick={() => setViewMode('detailed')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${viewMode === 'detailed' ? 'bg-white dark:bg-base-700 shadow-sm' : 'text-base-500'}`}>Detailed List</button></div>
                    {viewMode === 'detailed' && (<div className="relative"><button onClick={() => setIsColSelectorOpen(!isColSelectorOpen)} className="px-4 py-2 bg-white dark:bg-base-800 border rounded-xl text-sm font-bold text-base-600 flex items-center gap-2"><span>Columns</span> <ChevronDownIcon className={`h-4 w-4 ${isColSelectorOpen ? 'rotate-180' : ''}`}/></button>{isColSelectorOpen && (<div className="absolute right-0 mt-2 w-56 bg-white dark:bg-base-800 border rounded-xl shadow-xl z-50 p-2 max-h-60 overflow-y-auto custom-scrollbar">{ALL_COLUMNS.map(col => (<label key={col} className="flex items-center gap-3 p-2 hover:bg-base-50 rounded-lg cursor-pointer"><input type="checkbox" checked={visibleColumns.has(col)} onChange={e => { const newSet = new Set(visibleColumns); if (e.target.checked) newSet.add(col); else newSet.delete(col); setVisibleColumns(newSet); }} className="rounded text-primary-600" /><span className="text-sm font-medium">{col}</span></label>))}</div>)}</div>)}
                </div>
            </div>
            <div className="flex-grow min-h-0 overflow-y-auto custom-scrollbar rounded-2xl border border-base-200 dark:border-base-700 bg-white dark:bg-base-800 p-4">
                {isLoading ? <div className="text-center p-8">Loading...</div> : error ? <div className="text-center text-red-500">{error}</div> : viewMode === 'summary' ? <SummaryView data={summaryData} labReport={currentLabReport} /> : <DetailedView data={detailedData} onStatusChange={handleStatusChange} onReturn={handleReturnTask} onPlannerUnassign={handlePlannerUnassign} onMarkPrepared={handleMarkItemAsPrepared} onNoteChange={handleNoteChange} visibleColumns={visibleColumns} expandedSections={expandedSections} toggleSection={(name) => setExpandedSections(p => { const n = new Set(p); if (n.has(name)) n.delete(name); else n.add(name); return n; })} />}
            </div>
            <ReasonPromptModal prompt={reasonPrompt} onClose={() => setReasonPrompt(null)} onSubmit={handleReasonSubmit} />
        </div>
    );
};

export default ScheduleTab;
