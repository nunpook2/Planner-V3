import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
    addCategorizedTask
} from '../services/dataService';
import { CheckCircleIcon, ChevronDownIcon, TrashIcon, AlertTriangleIcon, RefreshIcon, PlusIcon, DragHandleIcon, DownloadIcon } from './common/Icons';

declare const XLSX: any;

// --- HEADER THEMES ---
const HEADER_THEMES = [
    { name: 'Indigo', headerBg: 'bg-indigo-600', headerText: 'text-white', borderColor: 'border-indigo-500', subHeaderBg: 'bg-indigo-100 dark:bg-indigo-900/40', subHeaderText: 'text-indigo-900 dark:text-indigo-100' },
    { name: 'Emerald', headerBg: 'bg-emerald-600', headerText: 'text-white', borderColor: 'border-emerald-500', subHeaderBg: 'bg-emerald-100 dark:bg-indigo-900/40', subHeaderText: 'text-emerald-900 dark:text-emerald-100' },
    { name: 'Amber', headerBg: 'bg-amber-500', headerText: 'text-white', borderColor: 'border-amber-400', subHeaderBg: 'bg-amber-100 dark:bg-indigo-900/40', subHeaderText: 'text-amber-900 dark:text-amber-100' },
    { name: 'Rose', headerBg: 'bg-rose-600', headerText: 'text-white', borderColor: 'border-rose-500', subHeaderBg: 'bg-rose-100 dark:bg-indigo-900/40', subHeaderText: 'text-rose-900 dark:text-rose-100' },
    { name: 'Cyan', headerBg: 'bg-cyan-600', headerText: 'text-white', borderColor: 'border-cyan-500', subHeaderBg: 'bg-cyan-100 dark:bg-indigo-900/40', subHeaderText: 'text-cyan-900 dark:text-cyan-100' },
    { name: 'Violet', headerBg: 'bg-violet-600', headerText: 'text-white', borderColor: 'border-violet-500', subHeaderBg: 'bg-violet-100 dark:bg-indigo-900/40', subHeaderText: 'text-violet-900 dark:text-violet-100' },
];

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
        const priorities = ['due date', 'due', 'deadline', 'requested date', 'target date'];
        for (const p of priorities) {
            const match = keys.find(k => k.toLowerCase().trim() === p);
            if (match && task[match] !== undefined) return task[match];
        }
        const fuzzyDate = keys.find(k => {
            const kl = k.toLowerCase();
            return kl.includes('due') && kl.includes('date') && !kl.includes('finish');
        });
        if (fuzzyDate) return task[fuzzyDate];
        const lastResort = keys.find(k => k.toLowerCase().includes('due') || k.toLowerCase().includes('deadline'));
        if (lastResort) return task[lastResort];
        return '';
    }
    let matchedKey = keys.find(k => k.toLowerCase().trim() === target);
    if (!matchedKey) {
        if (target === 'description') matchedKey = keys.find(k => ['desc', 'test name', 'testname', 'item'].includes(k.toLowerCase().trim()));
        if (target === 'variant') matchedKey = keys.find(k => ['var', 'method', 'condition'].includes(k.toLowerCase().trim()));
        if (target === 'sample name') matchedKey = keys.find(k => ['sample', 'samplename', 'sample_name'].includes(k.toLowerCase().trim()));
        if (target === 'purpose') matchedKey = keys.find(k => k.toLowerCase().includes('purpose'));
        if (target === 'priority') matchedKey = keys.find(k => k.toLowerCase().includes('priority'));
    }
    return matchedKey ? task[matchedKey] : '';
};

const formatDate = (dateValue: any) => {
    const date = parseFlexibleDate(dateValue);
    if (!date) return '';
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    return `${day}/${month}`;
};

const getDueDateTimestamp = (tasks: RawTask[]): number => {
    for (const t of tasks) {
        const val = getTaskValue(t, 'due date');
        const date = parseFlexibleDate(val);
        if (date) return date.getTime();
    }
    return Infinity;
};

const getSpecialStatus = (task: RawTask, category: TaskCategory) => {
    const checkFields = ['Purpose', 'Priority', 'Remark (Requester)', 'Note to planer', 'Additional Information', 'Description'];
    const allText = checkFields.map(f => String(getTaskValue(task, f)).toLowerCase()).join(' ');
    const normalized = allText.replace(/\s/g, '');
    const purpose = String(getTaskValue(task, 'Purpose')).toLowerCase();
    const priority = String(getTaskValue(task, 'Priority')).toLowerCase();
    return {
        isSprint: normalized.includes('sprint') || purpose.includes('sprint'),
        isUrgent: category === TaskCategory.Urgent || normalized.includes('urgent') || priority.includes('urgent'),
        isLSP: normalized.includes('lsp') || purpose.includes('lsp'),
        isPoCat: category === TaskCategory.PoCat || normalized.includes('pocat') || purpose.includes('pocat')
    };
};

const getTaskGridColumnKey = (task: RawTask, mappings: TestMapping[]): string | null => {
    const taskDesc = String(getTaskValue(task, 'Description')).toLowerCase().normalize('NFC').replace(/\s+/g, '');
    const taskVar = String(getTaskValue(task, 'Variant')).toLowerCase().normalize('NFC').replace(/\s+/g, '');
    const specificMatch = mappings.find(m => m.description.toLowerCase().normalize('NFC').replace(/\s+/g, '') === taskDesc && m.variant.toLowerCase().normalize('NFC').replace(/\s+/g, '') === taskVar);
    if (specificMatch) return `${specificMatch.headerGroup}|${specificMatch.headerSub}`;
    return null;
};

// --- HELPER COMPONENTS ---

const Toast: React.FC<{ message: string; isError?: boolean; onDismiss: () => void }> = ({ message, isError, onDismiss }) => {
    useEffect(() => { const timer = setTimeout(onDismiss, 3000); return () => clearTimeout(timer); }, [onDismiss]);
    return (
        <div className={`fixed top-24 right-8 py-3 px-6 rounded-xl shadow-lg flex items-center gap-3 animate-fade-in z-[60] border ${isError ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
            {isError ? <AlertTriangleIcon className="h-5 w-5" /> : <CheckCircleIcon className="h-5 w-5" />}
            <span className="font-semibold text-sm">{message}</span>
        </div>
    );
};

const AssignmentModal: React.FC<{ isOpen: boolean; onClose: () => void; onAssign: (person: Tester) => void; personnel: { testers: Tester[]; assistants: Tester[] }; isPreparation: boolean; selectedItemCount: number; isProcessing: boolean; }> = ({ isOpen, onClose, onAssign, personnel, isPreparation, selectedItemCount, isProcessing }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-base-900/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in" onClick={!isProcessing ? onClose : undefined}>
            <div className="bg-white dark:bg-base-800 rounded-2xl shadow-2xl p-6 w-full max-w-lg m-4 space-y-4 animate-slide-in-up border border-base-200 dark:border-base-700" onClick={e => e.stopPropagation()}>
                <div className={`h-2 w-20 rounded-full mx-auto mb-2 ${isPreparation ? 'bg-amber-400' : 'bg-primary-500'}`}></div>
                <h2 className="text-xl font-bold text-base-800 dark:text-base-200 text-center">{isPreparation ? "Assign for Preparation" : "Assign for Testing"}</h2>
                <p className="text-sm text-base-500 text-center">Assigning <span className={`font-bold ${isPreparation ? 'text-amber-600' : 'text-primary-600'}`}>{selectedItemCount} items</span></p>
                <div className="border dark:border-base-700 rounded-xl bg-base-50 dark:bg-base-900/50 max-h-[60vh] overflow-y-auto custom-scrollbar">
                    <div className="sticky top-0 bg-base-100 dark:bg-base-800 px-4 py-2 font-bold text-xs uppercase tracking-wider text-base-500 border-b dark:border-base-700">Assistants</div>
                    <ul className="divide-y divide-base-200 dark:divide-base-700">
                        {personnel.assistants.length > 0 ? personnel.assistants.map(p => (
                            <li key={p.id} className="flex justify-between items-center p-3 hover:bg-white dark:hover:bg-base-700 transition-colors">
                                <span className="font-medium text-base-700 dark:text-base-200">{p.name}</span>
                                <button onClick={() => onAssign(p)} disabled={isProcessing} className="px-4 py-1.5 text-xs font-bold bg-white border border-base-200 text-base-700 rounded-lg hover:bg-base-50 transition-all disabled:opacity-50">Select</button>
                            </li>
                        )) : <li className="p-4 text-center text-xs text-base-400 italic">No assistants on shift</li>}
                    </ul>
                    <div className="sticky top-0 bg-base-100 dark:bg-base-800 px-4 py-2 font-bold text-xs uppercase tracking-wider text-base-500 border-b dark:border-base-700 border-t">Testers</div>
                     <ul className="divide-y divide-base-200 dark:divide-base-700">
                        {personnel.testers.length > 0 ? personnel.testers.map(p => (
                            <li key={p.id} className="flex justify-between items-center p-3 hover:bg-white dark:hover:bg-base-700 transition-colors">
                                <span className="font-medium text-base-700 dark:text-base-200">{p.name}</span>
                                <button onClick={() => onAssign(p)} disabled={isProcessing} className="px-4 py-1.5 text-xs font-bold bg-white border border-base-200 text-base-700 rounded-lg hover:bg-base-50 transition-all disabled:opacity-50">Select</button>
                            </li>
                        )) : <li className="p-4 text-center text-xs text-base-400 italic">No testers on shift</li>}
                    </ul>
                </div>
                <div className="pt-2 flex justify-center"><button onClick={onClose} disabled={isProcessing} className="px-6 py-2.5 text-sm font-bold text-base-500 hover:text-base-800 transition-colors">Cancel</button></div>
            </div>
        </div>
    );
};

// --- MAIN COMPONENT ---

const TasksTab: React.FC<{ testers: Tester[]; refreshKey: number; }> = ({ testers, refreshKey }) => {
    const [categorizedTasks, setCategorizedTasks] = useState<CategorizedTask[]>([]);
    const [testMappings, setTestMappings] = useState<TestMapping[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [schedule, setSchedule] = useState<DailySchedule | null>(null);
    const [activeCategory, setActiveCategory] = useState<string>('all');
    const [filterRequestId, setFilterRequestId] = useState('');
    const [selectedShift, setSelectedShift] = useState<'day' | 'night'>('day');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isAssigningToPrepare, setIsAssigningToPrepare] = useState(false); 
    const [notification, setNotification] = useState<{message: string, isError?: boolean} | null>(null);
    const [selectedItems, setSelectedItems] = useState<Record<string, Set<number>>>({});
    const [expandedCell, setExpandedCell] = useState<{ docId: string; headerKey: string } | null>(null);
    const [hideEmptyColumns, setHideEmptyColumns] = useState(false);
    const [isAssigning, setIsAssigning] = useState(false);
    const [manualDesc, setManualDesc] = useState('');
    const [manualQty, setManualQty] = useState('');
    const [manualVariant, setManualVariant] = useState(''); 
    const [confirmDeleteManual, setConfirmDeleteManual] = useState<{docId: string, index: number} | null>(null);

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
            if (task.category === TaskCategory.Manual) return activeCategory === TaskCategory.Manual;
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
            isSprint: boolean;
            isUrgent: boolean;
            isLSP: boolean;
            isPoCat: boolean;
        }> = {};
        
        filteredTasks.forEach(taskGroup => {
            if (!mergedRows[taskGroup.id]) {
                mergedRows[taskGroup.id] = { 
                    requestId: taskGroup.id, cells: {}, unmappedItems: [], minDueDate: Infinity,
                    isSprint: false, isUrgent: false, isLSP: false, isPoCat: false
                };
            }
            const row = mergedRows[taskGroup.id];
            const groupDate = getDueDateTimestamp(taskGroup.tasks);
            if (groupDate < row.minDueDate) row.minDueDate = groupDate;

            taskGroup.tasks.forEach((task, index) => {
                const spec = getSpecialStatus(task, taskGroup.category);
                if (spec.isSprint) row.isSprint = true;
                if (spec.isUrgent) row.isUrgent = true;
                if (spec.isLSP) row.isLSP = true;
                if (spec.isPoCat) row.isPoCat = true;

                const item = { task, originalIndex: index, sourceDocId: taskGroup.docId! };
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
                    const itemsToAssign = selectedIndices.map(index => originalTask.tasks[index]);
                    await addAssignedTask({ requestId: originalTask.id, tasks: itemsToAssign, category: originalTask.category, testerId: selectedPerson.id, testerName: selectedPerson.name, assignedDate: selectedDate, shift: selectedShift, status: TaskStatus.Pending });
                    if (originalTask.category !== TaskCategory.Manual) {
                        const remainingItems = originalTask.tasks.filter((_, index) => !selectedIndices.includes(index));
                        if (remainingItems.length > 0) await updateCategorizedTask(docId, { tasks: remainingItems }); else await deleteCategorizedTask(docId);
                    }
                }
            }
            setNotification({ message: "Task Assigned." });
            setSelectedItems({});
        } catch (err) { setNotification({ message: "Failed to assign.", isError: true }); } finally { setIsAssigning(false); setIsModalOpen(false); fetchData(); }
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

    const handleQuickAddManual = async () => {
        if (!manualDesc.trim()) return; 
        try {
            const newTaskItem: RawTask = { 
                'Description': manualDesc, 
                'Quantity': manualQty || '1', 
                'Variant': manualVariant, 
                'ManualEntry': true, 
                _id: Math.random().toString(36).substring(2) + Date.now().toString(36) 
            };
            await addCategorizedTask({ 
                id: `MAN-${Date.now().toString().slice(-6)}`, 
                category: TaskCategory.Manual, 
                tasks: [newTaskItem], 
                createdAt: new Date().toISOString() 
            });
            setManualDesc(''); setManualQty(''); setManualVariant(''); fetchData();
        } catch (e) { setNotification({ message: "Failed to add manual task", isError: true }); }
    };

    const handleExport = () => {
        const dataToExport = categorizedTasks.flatMap(group => 
            group.tasks.map(task => ({
                'Request ID': group.id,
                'Category': group.category,
                'Sample Name': getTaskValue(task, 'Sample Name'),
                'Description': getTaskValue(task, 'Description'),
                'Variant': getTaskValue(task, 'Variant'),
                'Quantity': getTaskValue(task, 'Quantity'),
                'Due Date': formatDate(getTaskValue(task, 'due date'))
            }))
        );
        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Task Queue");
        XLSX.writeFile(wb, `TaskQueue_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const ExpandableCell: React.FC<{ headerKey: string; items: { task: RawTask; originalIndex: number; sourceDocId: string }[]; isGroupEnd?: boolean }> = ({ headerKey, items, isGroupEnd }) => {
        if (!items || items.length === 0) return <td className={`p-0 align-top border border-base-400 dark:border-base-500 ${isGroupEnd ? 'border-r-2 border-r-base-400 dark:border-r-base-600' : ''}`}></td>;
        const primaryDocId = items[0].sourceDocId; 
        const isExpanded = expandedCell?.docId === primaryDocId && expandedCell?.headerKey === headerKey;
        const numSelected = items.reduce((count, item) => count + (selectedItems[item.sourceDocId]?.has(item.originalIndex) ? 1 : 0), 0);
        const areAllSelected = items.length > 0 && numSelected === items.length;
        const toggleAll = (checked: boolean) => {
            setSelectedItems(prev => {
                const next = { ...prev };
                items.forEach(item => {
                    const currentSet = new Set(next[item.sourceDocId] || []);
                    if (checked) currentSet.add(item.originalIndex); else currentSet.delete(item.originalIndex);
                    next[item.sourceDocId] = currentSet;
                });
                return next;
            });
        };
        return (
            <td className={`p-0 align-top transition-all relative border border-base-400 dark:border-base-500 ${isGroupEnd ? 'border-r-2 border-r-base-400 dark:border-r-base-600' : ''} ${isExpanded ? 'bg-white dark:bg-base-800 ring-2 ring-primary-500 shadow-xl z-20 rounded-sm' : 'hover:bg-base-50 dark:hover:bg-base-700'}`}>
                <div className="p-1.5 text-center cursor-pointer h-full flex flex-col justify-center min-h-[38px]" onClick={() => setExpandedCell(isExpanded ? null : { docId: primaryDocId, headerKey })}>
                    <span className={`font-black text-sm ${numSelected > 0 ? 'text-primary-600 dark:text-primary-400' : 'text-base-900 dark:text-base-100'}`}>{numSelected > 0 ? numSelected : items.length}</span>
                </div>
                {isExpanded && (
                    <div className="absolute top-full left-0 min-w-[340px] bg-white dark:bg-base-800 border-2 dark:border-base-500 shadow-2xl rounded-b-2xl overflow-hidden z-50 animate-fade-in origin-top-left">
                        <div className="p-2 bg-base-50 dark:bg-base-700/50 border-b dark:border-base-600 flex justify-between items-center">
                            <span className="text-[10px] font-black text-base-400 uppercase tracking-widest">Detail View</span>
                            <label className="flex items-center gap-2 text-[10px] font-black uppercase cursor-pointer text-primary-600">
                                <input type="checkbox" className="rounded text-primary-600 focus:ring-primary-500" checked={areAllSelected} onChange={e => toggleAll(e.target.checked)}/> All
                            </label>
                        </div>
                        <div className="max-h-64 overflow-y-auto custom-scrollbar">
                            <table className="w-full text-xs">
                                <tbody className="divide-y divide-base-100 dark:divide-base-700">
                                    {items.map(({ task, originalIndex, sourceDocId }) => (
                                        <tr key={`${sourceDocId}-${originalIndex}`} className="hover:bg-base-50 dark:hover:bg-base-700/50 transition-colors">
                                            <td className="p-3 w-8 text-center"><input type="checkbox" className="rounded text-primary-600 focus:ring-primary-500" checked={selectedItems[sourceDocId]?.has(originalIndex) || false} onChange={e => handleSelectItem(sourceDocId, originalIndex, e.target.checked)}/></td>
                                            <td className="p-3">
                                                <div className="font-black text-base-900 dark:text-base-100">{getTaskValue(task, 'Sample Name')}</div>
                                                <div className="text-[9px] text-base-400 uppercase font-bold tracking-tighter">Due: {formatDate(getTaskValue(task, 'due date')) || 'ASAP'}</div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </td>
        );
    };

    const renderDueDateCell = (timestamp: number) => {
        if (timestamp === Infinity) return <div className="flex flex-col items-center justify-center opacity-30 text-[11px] font-black italic">---</div>;
        const date = new Date(timestamp);
        const today = new Date(); today.setHours(0,0,0,0);
        const target = new Date(timestamp); target.setHours(0,0,0,0);
        const diff = target.getTime() - today.getTime();
        const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
        
        let style = "text-base-500";
        if (days <= 0) style = "text-rose-600 dark:text-rose-400 font-black animate-pulse-subtle";
        else if (days <= 3) style = "text-amber-600 dark:text-amber-400 font-black";
        
        return (
            <div className={`flex flex-col items-center justify-center leading-none ${style}`}>
                <span className="text-[11px] font-black">{date.getDate().toString().padStart(2, '0')}/{(date.getMonth()+1).toString().padStart(2,'0')}</span>
                <span className="text-[7px] uppercase tracking-tighter mt-0.5 opacity-70">{days === 0 ? 'Today' : days < 0 ? 'Late' : `${days}d`}</span>
            </div>
        );
    };

    const CategoryButton: React.FC<{ name: string; value: string; count: number }> = ({ name, value, count }) => (
        <button onClick={() => setActiveCategory(value)} className={`px-3 py-1.5 text-xs font-black rounded-xl transition-all border uppercase tracking-widest shadow-sm ${activeCategory === value ? 'bg-primary-600 text-white border-primary-600' : 'bg-white dark:bg-base-800 text-base-600 border-base-200 dark:border-base-700'}`}>{name} <span className="px-1.5 py-0.5 rounded-lg bg-base-100/20">{count}</span></button>
    );

    return (
        <div className="flex flex-col h-[calc(100vh-140px)] space-y-4 animate-slide-in-up">
            {notification && <Toast message={notification.message} isError={notification.isError} onDismiss={() => setNotification(null)} />}
            <AssignmentModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onAssign={handleConfirmAssignment} personnel={onShiftPersonnel} isPreparation={isAssigningToPrepare} selectedItemCount={totalSelectedCount} isProcessing={isAssigning}/>

            <div className="flex-shrink-0 space-y-3 px-4 pt-2">
                <div className="flex justify-between items-center">
                    <div>
                        <h2 className="text-2xl font-black text-base-900 dark:text-base-100 tracking-tighter">Queue Deployment</h2>
                    </div>
                    <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-base-800 border border-base-200 dark:border-base-700 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-base-50 transition-all shadow-sm">
                        <DownloadIcon className="h-4 w-4" /> Export Excel
                    </button>
                </div>
                <div className="p-4 bg-white/60 dark:bg-base-800/60 rounded-3xl border border-white dark:border-base-700 shadow-xl space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex flex-wrap gap-2">
                            {['all', TaskCategory.Urgent, TaskCategory.Normal, TaskCategory.PoCat, TaskCategory.Manual].map(c => (
                                <CategoryButton key={c} name={c === 'all' ? 'All' : c} value={c} count={categorizedTasks.filter(t => c === 'all' ? t.category !== TaskCategory.Manual : t.category === c).length}/>
                            ))}
                        </div>
                        <div className="flex items-center gap-3">
                            <label className="flex items-center gap-2 text-[10px] font-black text-base-500 uppercase cursor-pointer bg-white dark:bg-base-700 px-3 py-2 rounded-xl border border-base-200 shadow-sm"><input type="checkbox" checked={hideEmptyColumns} onChange={e => setHideEmptyColumns(e.target.checked)} className="rounded text-primary-600" /> Hide Empty</label>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 border-t border-base-100 dark:border-base-700 pt-4">
                        <input type="text" placeholder="Search Request ID..." value={filterRequestId} onChange={e => setFilterRequestId(e.target.value)} className="md:col-span-2 p-3 rounded-2xl bg-base-50 dark:bg-base-900 border border-base-200 dark:border-base-700 focus:bg-white transition-all text-sm font-bold"/>
                        <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="w-full p-3 rounded-2xl bg-base-50 dark:bg-base-900 border border-base-200 dark:border-base-700 focus:bg-white font-bold text-sm"/>
                        <select value={selectedShift} onChange={e => setSelectedShift(e.target.value as any)} className="w-full p-3 rounded-2xl bg-base-50 dark:bg-base-900 border border-base-200 dark:border-base-700 font-bold text-sm"><option value="day">Day Shift</option><option value="night">Night Shift</option></select>
                    </div>
                </div>
                <div className="p-3 bg-primary-600 rounded-2xl flex justify-between items-center shadow-xl sticky top-0 z-30">
                    <div className="flex items-center gap-3 px-3"><span className="text-[10px] font-black text-white/60 uppercase tracking-widest">Active Payload</span><span className="text-xl font-black text-white">{totalSelectedCount}</span></div>
                    <div className="flex gap-2">
                        <button onClick={() => { setIsAssigningToPrepare(true); setIsModalOpen(true); }} disabled={totalSelectedCount === 0} className="px-5 py-2 text-[10px] font-black bg-amber-400 text-amber-900 rounded-xl hover:bg-amber-500 uppercase tracking-widest disabled:opacity-50 transition-all">To Prep</button>
                        <button onClick={() => { setIsAssigningToPrepare(false); setIsModalOpen(true); }} disabled={totalSelectedCount === 0} className="px-5 py-2 text-[10px] font-black bg-white text-primary-600 rounded-xl hover:bg-base-50 uppercase tracking-widest disabled:opacity-50 transition-all">Assign Mission</button>
                    </div>
                </div>
            </div>

            <div className="flex-grow min-h-0 overflow-hidden border border-base-200 dark:border-base-700 rounded-3xl bg-white dark:bg-base-800 shadow-sm relative flex flex-col mx-4 mb-4">
                 {isLoading ? (<div className="flex flex-col items-center justify-center h-full text-base-400 gap-3"><RefreshIcon className="animate-spin h-8 w-8 text-primary-500"/>Syncing Grid...</div>) :
                 activeCategory === TaskCategory.Manual ? (
                    <div className="h-full flex flex-col">
                        <div className="p-6 bg-base-50 dark:bg-base-900/50 border-b border-base-200 dark:border-base-700">
                             <h3 className="text-[10px] font-black text-base-500 uppercase tracking-[0.3em] mb-4">Ad-Hoc Generator</h3>
                             <div className="flex flex-col md:flex-row gap-3">
                                 <input type="text" placeholder="Mission / Task Name..." value={manualDesc} onChange={e => setManualDesc(e.target.value)} className="flex-grow p-3 rounded-2xl border dark:border-base-600 dark:bg-base-800 focus:ring-4 focus:ring-primary-500/10 outline-none font-bold text-sm"/>
                                 <input type="text" placeholder="Qty" value={manualQty} onChange={e => setManualQty(e.target.value)} className="w-24 p-3 rounded-2xl border dark:border-base-600 dark:bg-base-800 focus:ring-4 focus:ring-primary-500/10 outline-none font-bold text-sm"/>
                                 <input type="text" placeholder="Sample / Detail..." value={manualVariant} onChange={e => setManualVariant(e.target.value)} className="md:w-64 p-3 rounded-2xl border dark:border-base-600 dark:bg-base-800 focus:ring-4 focus:ring-primary-500/10 outline-none font-bold text-sm"/>
                                 <button onClick={handleQuickAddManual} disabled={!manualDesc.trim()} className="px-8 py-3 bg-primary-600 text-white font-black rounded-2xl hover:bg-primary-700 disabled:opacity-50 shadow-lg text-xs uppercase tracking-widest transition-all">Add</button>
                             </div>
                        </div>
                        <div className="overflow-y-auto flex-grow custom-scrollbar">
                            <table className="min-w-full text-sm text-left">
                                <thead className="bg-base-50 dark:bg-base-800/50 sticky top-0 border-b dark:border-base-700">
                                    <tr><th className="p-4 w-12"></th><th className="p-4 text-[10px] font-black text-base-400 uppercase tracking-widest">Description</th><th className="p-4 w-24 text-[10px] font-black text-base-400 uppercase tracking-widest">Qty</th><th className="p-4 text-[10px] font-black text-base-400 uppercase tracking-widest">Details</th><th className="p-4 w-20"></th></tr>
                                </thead>
                                <tbody className="divide-y divide-base-100 dark:divide-base-700">
                                    {categorizedTasks.filter(t => t.category === TaskCategory.Manual).map((group) => {
                                        const task = group.tasks[0]; if (!task) return null;
                                        const isSelected = selectedItems[group.docId!]?.has(0);
                                        return (
                                            <tr key={group.docId} className="hover:bg-base-50 dark:hover:bg-base-700/30 transition-colors group">
                                                <td className="p-4 text-center"><input type="checkbox" checked={isSelected} onChange={e => handleSelectItem(group.docId!, 0, e.target.checked)} className="rounded text-primary-600 focus:ring-primary-500 h-4 w-4"/></td>
                                                <td className="p-4 font-black text-base-900 dark:text-base-100">{getTaskValue(task, 'Description')}</td>
                                                <td className="p-4 font-bold text-base-600">{getTaskValue(task, 'Quantity')}</td>
                                                <td className="p-4 text-base-400 italic font-medium">{getTaskValue(task, 'Variant') || 'Standard'}</td>
                                                <td className="p-4 text-right"><button onClick={() => setConfirmDeleteManual({docId: group.docId!, index: 0})} className="p-2 text-base-300 hover:text-red-500 transition-colors"><TrashIcon className="h-4 w-4"/></button></td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                 ) : (
                    <div className="overflow-auto flex-grow custom-scrollbar">
                        <table className="min-w-full text-xs text-left border-collapse border-spacing-0">
                            <thead className="bg-base-900 dark:bg-base-950 text-white sticky top-0 z-40">
                                <tr>
                                    <th rowSpan={2} className="px-3 py-2 font-black text-[10px] uppercase tracking-widest border-r border-base-700/50 w-16 bg-base-900 sticky left-0 z-50 text-center">Due</th>
                                    <th rowSpan={2} className="px-3 py-2 font-black text-[10px] uppercase tracking-widest border-r border-base-700/50 w-32 bg-base-900 sticky left-16 z-50 text-center">Request ID</th>
                                    {activeGridHeaders.map(([group, subKeys], i) => {
                                        const theme = HEADER_THEMES[i % HEADER_THEMES.length];
                                        return <th key={group} colSpan={subKeys.length} className={`p-2 font-black text-[10px] text-center border-b border-r border-white/10 uppercase tracking-widest ${theme.headerBg} ${theme.headerText}`}>{group}</th>;
                                    })}
                                    <th rowSpan={2} className="p-4 font-black text-[11px] uppercase tracking-widest bg-base-800 dark:bg-base-900 w-40 text-center border-l border-base-700">Unmapped</th>
                                </tr>
                                <tr>
                                    {activeGridHeaders.flatMap(([group, subKeys], i) => {
                                        const theme = HEADER_THEMES[i % HEADER_THEMES.length];
                                        return subKeys.map(key => <th key={key} className={`p-2 font-bold text-[9px] text-center border-b border-r border-white/10 uppercase tracking-tighter w-24 ${theme.subHeaderBg} ${theme.subHeaderText}`}>{key.split('|')[1]}</th>);
                                    })}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-base-200 dark:divide-base-700">
                                {gridData.map(row => (
                                    <tr key={row.requestId} className="hover:bg-primary-50/10 transition-colors">
                                        <td className="px-1 py-1 border-r border-base-200 dark:border-base-700 bg-base-50 dark:bg-base-900 sticky left-0 z-30">{renderDueDateCell(row.minDueDate)}</td>
                                        <td className="px-2 py-1 font-black text-[11px] text-base-900 dark:text-white border-r border-base-200 dark:border-base-700 bg-base-50/50 dark:bg-base-900/50 sticky left-16 z-30 truncate">
                                            <div className="flex items-center gap-1.5 whitespace-nowrap overflow-hidden">
                                                <span>{row.requestId.replace(/^RS1-/, '')}</span>
                                                <div className="flex flex-wrap gap-1">
                                                    {row.isSprint && <span className="px-2 py-0.5 bg-red-600 text-white text-[9px] rounded-md uppercase font-black" title="Sprint">SPRINT</span>}
                                                    {row.isUrgent && <span className="px-2 py-0.5 bg-rose-500 text-white text-[9px] rounded-md uppercase font-black" title="Urgent">URGENT</span>}
                                                    {row.isLSP && <span className="px-2 py-0.5 bg-cyan-600 text-white text-[9px] rounded-md uppercase font-black" title="LSP">LSP</span>}
                                                    {row.isPoCat && <span className="px-2 py-0.5 bg-orange-500 text-white text-[9px] rounded-md uppercase font-black" title="Po Cat">PO CAT</span>}
                                                </div>
                                            </div>
                                        </td>
                                        {activeColumnKeys.map(header => <ExpandableCell key={header} headerKey={header} items={row.cells[header] || []} isGroupEnd={lastKeysOfGroups.has(header)} />)}
                                        <ExpandableCell headerKey="unmapped" items={row.unmappedItems} />
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
