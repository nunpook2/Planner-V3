
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
import { CheckCircleIcon, ChevronDownIcon, TrashIcon, AlertTriangleIcon } from './common/Icons';

declare const XLSX: any;

// --- HELPER COMPONENTS ---

const Toast: React.FC<{ message: string; isError?: boolean; onDismiss: () => void }> = ({ message, isError, onDismiss }) => {
    useEffect(() => {
        const timer = setTimeout(onDismiss, 3000);
        return () => clearTimeout(timer);
    }, [onDismiss]);

    return (
        <div className={`fixed top-24 right-8 py-3 px-6 rounded-xl shadow-lg flex items-center gap-3 animate-fade-in z-[60] border ${isError ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
            {isError ? <AlertTriangleIcon className="h-5 w-5" /> : <CheckCircleIcon className="h-5 w-5" />}
            <span className="font-semibold text-sm">{message}</span>
        </div>
    );
};

const ConfirmationModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText?: string;
    confirmColor?: string;
}> = ({ isOpen, onClose, onConfirm, title, message, confirmText = "Confirm", confirmColor = "bg-primary-600" }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-base-900/60 backdrop-blur-sm flex items-center justify-center z-[70] animate-fade-in" onClick={onClose}>
            <div className="bg-white dark:bg-base-800 rounded-2xl shadow-2xl p-6 w-full max-w-md m-4 space-y-4 animate-slide-in-up border border-base-200 dark:border-base-700" onClick={e => e.stopPropagation()}>
                <h3 className="text-xl font-bold text-base-900 dark:text-base-100">{title}</h3>
                <p className="text-base-600 dark:text-base-300">{message}</p>
                <div className="flex justify-end gap-3 pt-4">
                    <button onClick={onClose} className="px-5 py-2 text-sm font-semibold text-base-600 hover:bg-base-100 rounded-lg transition-colors">Cancel</button>
                    <button onClick={onConfirm} className={`px-5 py-2 text-sm font-bold text-white rounded-lg shadow-md hover:shadow-lg hover:opacity-90 transition-all ${confirmColor}`}>{confirmText}</button>
                </div>
            </div>
        </div>
    );
};

const AssignmentModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onAssign: (person: Tester) => void;
    personnel: { testers: Tester[]; assistants: Tester[] };
    isPreparation: boolean;
    selectedItemCount: number;
    isProcessing: boolean;
}> = ({ isOpen, onClose, onAssign, personnel, isPreparation, selectedItemCount, isProcessing }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-base-900/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in" onClick={!isProcessing ? onClose : undefined}>
            <div className="bg-white dark:bg-base-800 rounded-2xl shadow-2xl p-6 w-full max-w-lg m-4 space-y-4 animate-slide-in-up border border-base-200 dark:border-base-700" onClick={e => e.stopPropagation()}>
                <div className={`h-2 w-20 rounded-full mx-auto mb-2 ${isPreparation ? 'bg-amber-400' : 'bg-primary-500'}`}></div>
                <h2 className="text-xl font-bold text-base-800 dark:text-base-200 text-center">
                    {isPreparation ? "Assign for Preparation" : "Assign for Testing"}
                </h2>
                <p className="text-sm text-base-500 text-center">
                    Assigning <span className={`font-bold ${isPreparation ? 'text-amber-600' : 'text-primary-600'}`}>{selectedItemCount} items</span>
                </p>
                
                <div className="border dark:border-base-700 rounded-xl bg-base-50 dark:bg-base-900/50 max-h-[60vh] overflow-y-auto custom-scrollbar">
                    {/* Assistants Section */}
                    <div className="sticky top-0 bg-base-100 dark:bg-base-800 px-4 py-2 font-bold text-xs uppercase tracking-wider text-base-500 border-b dark:border-base-700">Assistants</div>
                    <ul className="divide-y divide-base-200 dark:divide-base-700">
                        {personnel.assistants.length > 0 ? personnel.assistants.map(p => (
                            <li key={p.id} className="flex justify-between items-center p-3 hover:bg-white dark:hover:bg-base-700 transition-colors">
                                <span className="font-medium text-base-700 dark:text-base-200">{p.name}</span>
                                <button 
                                    onClick={() => onAssign(p)} 
                                    disabled={isProcessing}
                                    className="px-4 py-1.5 text-xs font-bold bg-white border border-base-200 text-base-700 rounded-lg hover:bg-base-50 hover:border-base-300 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isProcessing ? '...' : 'Select'}
                                </button>
                            </li>
                        )) : <li className="p-4 text-center text-xs text-base-400 italic">No assistants on shift</li>}
                    </ul>

                    {/* Testers Section */}
                    <div className="sticky top-0 bg-base-100 dark:bg-base-800 px-4 py-2 font-bold text-xs uppercase tracking-wider text-base-500 border-b dark:border-base-700 border-t">Testers</div>
                     <ul className="divide-y divide-base-200 dark:divide-base-700">
                        {personnel.testers.length > 0 ? personnel.testers.map(p => (
                            <li key={p.id} className="flex justify-between items-center p-3 hover:bg-white dark:hover:bg-base-700 transition-colors">
                                <span className="font-medium text-base-700 dark:text-base-200">{p.name}</span>
                                <button 
                                    onClick={() => onAssign(p)} 
                                    disabled={isProcessing}
                                    className="px-4 py-1.5 text-xs font-bold bg-white border border-base-200 text-base-700 rounded-lg hover:bg-base-50 hover:border-base-300 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isProcessing ? '...' : 'Select'}
                                </button>
                            </li>
                        )) : <li className="p-4 text-center text-xs text-base-400 italic">No testers on shift</li>}
                    </ul>
                </div>

                <div className="pt-2 flex justify-center">
                    <button onClick={onClose} disabled={isProcessing} className="px-6 py-2.5 text-sm font-bold text-base-500 hover:text-base-800 transition-colors disabled:opacity-50">Cancel Assignment</button>
                </div>
            </div>
        </div>
    );
};


// --- UTILITY FUNCTIONS ---

const getTaskValue = (task: RawTask, headerType: string): string | number => {
    // Robust header matching: try exact match, then aliases
    const keys = Object.keys(task);
    const target = headerType.toLowerCase().trim();
    
    // 1. Direct match (normalized)
    let matchedKey = keys.find(k => k.toLowerCase().trim() === target);
    
    // 2. Common Aliases if not found
    if (!matchedKey) {
        if (target === 'description') matchedKey = keys.find(k => ['desc', 'test name', 'testname', 'item'].includes(k.toLowerCase().trim()));
        if (target === 'variant') matchedKey = keys.find(k => ['var', 'method', 'condition'].includes(k.toLowerCase().trim()));
        if (target === 'sample name') matchedKey = keys.find(k => ['sample', 'samplename', 'sample_name'].includes(k.toLowerCase().trim()));
    }

    return matchedKey ? task[matchedKey] : '';
};

// --- ROBUST NORMALIZATION FOR MAPPING ---
// This handles:
// 1. Unicode Normalization (NFC) - Fixes Thai vowel issues
// 2. Whitespace Stripping - Removes ALL spaces (including non-breaking) to ignore formatting diffs
// 3. Lowercasing - Case insensitive
const normalizeKey = (str: string | number | null | undefined): string => {
    if (str === null || str === undefined) return '';
    return String(str)
        .toLowerCase()
        .normalize('NFC')
        .replace(/\s+/g, ''); // Strip ALL whitespace
};

const isValidTask = (task: RawTask): boolean => {
    const isManual = task.ManualEntry === true;
    if (isManual) return true;

    const desc = String(getTaskValue(task, 'Description') || '').trim();
    const variant = String(getTaskValue(task, 'Variant') || '').trim();
    const sampleName = String(getTaskValue(task, 'Sample Name') || '').trim();
    
    const garbageValues = ['0', '-', 'n/a', 'nil', 'none', 'nan', 'null'];
    if (garbageValues.includes(desc.toLowerCase())) return false;
    // Note: Variant can be garbage (e.g. '-') if Description is valid, so we don't strictly filter variant garbage unless Desc is also bad.
    
    if (!desc && !variant) return false;
    
    const reqId = String(getTaskValue(task, 'Request ID') || '');
    if (sampleName === reqId && reqId !== '') return false;

    return true;
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

const getDueDateTimestamp = (tasks: RawTask[]): number => {
    // Find any task in the group that has a Due finish date
    const taskWithDate = tasks.find(t => getTaskValue(t, 'Due finish'));
    const dateVal = taskWithDate ? getTaskValue(taskWithDate, 'Due finish') : null;

    if (!dateVal) return Infinity; 

    if (typeof dateVal === 'number') {
        const excelEpoch = new Date(Date.UTC(1899, 11, 30));
        return excelEpoch.getTime() + dateVal * 24 * 60 * 60 * 1000;
    }

    const strVal = String(dateVal).trim();
    let date = new Date(strVal);
    if (!isNaN(date.getTime())) return date.getTime();

    const parts = strVal.split(/[\/\-]/);
    if (parts.length === 3 && parts[2].length === 4) {
         const day = parseInt(parts[0], 10);
         const month = parseInt(parts[1], 10);
         const year = parseInt(parts[2], 10);
         date = new Date(year, month - 1, day);
         if (!isNaN(date.getTime())) return date.getTime();
    }
    return Infinity;
};

// COMPOSITE KEY MATCHER (Group|Sub)
const getTaskGridColumnKey = (task: RawTask, mappings: TestMapping[]): string | null => {
    const taskDesc = normalizeKey(getTaskValue(task, 'Description'));
    const taskVar = normalizeKey(getTaskValue(task, 'Variant'));

    // 1. Exact Match
    const specificMatch = mappings.find(m => 
        normalizeKey(m.description) === taskDesc && 
        normalizeKey(m.variant) === taskVar
    );
    if (specificMatch) return `${specificMatch.headerGroup}|${specificMatch.headerSub}`;

    // 2. Description Only
    const descriptionMatch = mappings.find(m => 
        normalizeKey(m.description) === taskDesc && 
        normalizeKey(m.variant) === ''
    );
    if (descriptionMatch) return `${descriptionMatch.headerGroup}|${descriptionMatch.headerSub}`;
    
    // 3. Variant Only
    const variantMatch = mappings.find(m => 
        normalizeKey(m.description) === '' && 
        normalizeKey(m.variant) === taskVar &&
        taskVar !== '' // Prevent matching empty task variant to empty mapping
    );
    if (variantMatch) return `${variantMatch.headerGroup}|${variantMatch.headerSub}`;

    return null;
};

// --- MAIN COMPONENT ---

const TasksTab: React.FC<{ testers: Tester[]; refreshKey: number; }> = ({ testers, refreshKey }) => {
    const [categorizedTasks, setCategorizedTasks] = useState<CategorizedTask[]>([]);
    const [testMappings, setTestMappings] = useState<TestMapping[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
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
    const [isAssigning, setIsAssigning] = useState(false); // Locking state

    // Manual Task States
    const [manualDesc, setManualDesc] = useState('');
    const [manualQty, setManualQty] = useState('');
    const [manualVariant, setManualVariant] = useState(''); 
    const [confirmDeleteManual, setConfirmDeleteManual] = useState<{docId: string, index: number} | null>(null);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
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
             if (error.code === 'permission-denied') {
                setError("Failed to fetch task data. Please check your Firestore security rules.");
            } else {
                setError("An unexpected error occurred.");
            }
        } finally {
            setIsLoading(false);
        }
    }, [selectedDate]);

    useEffect(() => {
        fetchData();
    }, [fetchData, refreshKey]);
    
    // --- Data processing for Grid ---
    const gridHeaders = useMemo(() => {
        const groupMinOrders: Record<string, number> = {};
        
        testMappings.forEach(m => {
            if (!m.headerGroup) return;
            const currentMin = groupMinOrders[m.headerGroup] ?? Infinity;
            if ((m.order ?? Infinity) < currentMin) {
                groupMinOrders[m.headerGroup] = m.order ?? Infinity;
            }
        });

        const groupsContent: Record<string, { key: string; order: number }[]> = {};

        testMappings.forEach(m => {
            if (!m.headerGroup || !m.headerSub) return;
            
            if (!groupsContent[m.headerGroup]) groupsContent[m.headerGroup] = [];
            
            const compositeKey = `${m.headerGroup}|${m.headerSub}`;
            const existingSub = groupsContent[m.headerGroup].find(x => x.key === compositeKey);
            const mappingOrder = m.order ?? Infinity;

            if (!existingSub) {
                groupsContent[m.headerGroup].push({ key: compositeKey, order: mappingOrder });
            } else {
                if (mappingOrder < existingSub.order) {
                    existingSub.order = mappingOrder;
                }
            }
        });

        const sortedGroupNames = Object.keys(groupsContent).sort((a, b) => {
            return (groupMinOrders[a] ?? Infinity) - (groupMinOrders[b] ?? Infinity);
        });

        return sortedGroupNames.map(groupName => {
            const sortedSubs = groupsContent[groupName]
                .sort((a, b) => a.order - b.order)
                .map(x => x.key);
            return [groupName, sortedSubs] as [string, string[]];
        });
    }, [testMappings]);

    // Filtered Tasks logic
    const filteredTasks = useMemo(() => {
        return categorizedTasks.filter(task => {
            if (activeCategory === TaskCategory.Manual) {
                return task.category === TaskCategory.Manual;
            }
            if (task.category === TaskCategory.Manual) {
                return false;
            }

            const categoryMatch = activeCategory === 'all' || task.category === activeCategory;
            const idMatch = filterRequestId === '' || task.id.toLowerCase().includes(filterRequestId.toLowerCase());
            
            return categoryMatch && idMatch; 
        });
    }, [categorizedTasks, activeCategory, filterRequestId]);

    // Grid Data Construction (Row Merging by Request ID + Sorting)
    const gridData = useMemo(() => {
        const mergedRows: Record<string, {
            requestId: string;
            originalTasks: CategorizedTask[];
            cells: Record<string, { task: RawTask; originalIndex: number; sourceDocId: string }[]>;
            unmappedItems: { task: RawTask; originalIndex: number; sourceDocId: string }[];
            minDueDate: number; // For sorting
        }> = {};

        filteredTasks.forEach(taskGroup => {
            if (!mergedRows[taskGroup.id]) {
                mergedRows[taskGroup.id] = {
                    requestId: taskGroup.id,
                    originalTasks: [],
                    cells: {},
                    unmappedItems: [],
                    minDueDate: Infinity
                };
            }
            mergedRows[taskGroup.id].originalTasks.push(taskGroup);

            const groupDate = getDueDateTimestamp(taskGroup.tasks);
            if (groupDate < mergedRows[taskGroup.id].minDueDate) {
                mergedRows[taskGroup.id].minDueDate = groupDate;
            }

            taskGroup.tasks.forEach((task, index) => {
                if (!isValidTask(task)) return;

                const item = { task, originalIndex: index, sourceDocId: taskGroup.docId! };
                const columnKey = getTaskGridColumnKey(task, testMappings);
                
                if (columnKey) {
                    if (!mergedRows[taskGroup.id].cells[columnKey]) mergedRows[taskGroup.id].cells[columnKey] = [];
                    mergedRows[taskGroup.id].cells[columnKey].push(item);
                } else {
                    mergedRows[taskGroup.id].unmappedItems.push(item);
                }
            });
        });

        // Sort by Due Date (Ascending)
        return Object.values(mergedRows).sort((a, b) => a.minDueDate - b.minDueDate);
    }, [filteredTasks, testMappings]);

    const activeColumnKeys = useMemo(() => {
        if (!hideEmptyColumns) return gridHeaders.flatMap(([, subKeys]) => subKeys);
        
        const activeKeys = new Set<string>();
        gridData.forEach(row => {
            Object.keys(row.cells).forEach(key => {
                if (row.cells[key].length > 0) activeKeys.add(key);
            });
        });
        return gridHeaders.flatMap(([, subKeys]) => subKeys).filter(k => activeKeys.has(k));
    }, [gridHeaders, gridData, hideEmptyColumns]);

    const activeGridHeaders = useMemo(() => {
        if (!hideEmptyColumns) return gridHeaders;
        return gridHeaders.map(([group, subKeys]) => {
            const activeSubs = subKeys.filter(k => activeColumnKeys.includes(k));
            return [group, activeSubs] as [string, string[]];
        }).filter(([, subKeys]) => subKeys.length > 0);
    }, [gridHeaders, activeColumnKeys, hideEmptyColumns]);

    // Calculate last keys of each group for dividers
    const lastKeysOfGroups = useMemo(() => {
        return new Set(activeGridHeaders.map(([_, subKeys]) => subKeys[subKeys.length - 1]));
    }, [activeGridHeaders]);


    // --- Interaction Handlers ---
    const onShiftPersonnel = useMemo(() => {
        const findByIds = (ids: string[]) => ids.map(id => testers.find(t => t.id === id)).filter((t): t is Tester => !!t);
        if (!schedule) return { testers: [], assistants: [] };
        const shiftTesters = selectedShift === 'day' ? schedule.dayShiftTesters : schedule.nightShiftTesters;
        const shiftAssistants = selectedShift === 'day' ? schedule.dayShiftAssistants : schedule.nightShiftAssistants;
        return { testers: findByIds(shiftTesters), assistants: findByIds(shiftAssistants) };
    }, [schedule, testers, selectedShift]);

    const handleSelectItem = useCallback((docId: string, taskIndex: number, isChecked: boolean) => {
        setSelectedItems(prev => {
            const newSelection = { ...prev };
            const currentSet = new Set(newSelection[docId] || []);
            if (isChecked) currentSet.add(taskIndex);
            else currentSet.delete(taskIndex);
            newSelection[docId] = currentSet;
            return newSelection;
        });
    }, []);
    
    const totalSelectedCount = useMemo(() => Object.values(selectedItems).reduce((acc: number, set: Set<number>) => acc + set.size, 0), [selectedItems]);

    const openAssignModal = () => {
        let hasPreparingItems = false;
        for (const docId in selectedItems) {
            const taskGroup = categorizedTasks.find(t => t.docId === docId);
            if (!taskGroup) continue;
            const indices = Array.from(selectedItems[docId]);
            if (taskGroup.tasks.some((t, idx) => indices.includes(idx) && t.preparationStatus === 'Awaiting Preparation')) {
                hasPreparingItems = true;
                break;
            }
        }

        if (hasPreparingItems) {
            setNotification({ message: "Cannot assign items that are waiting for preparation (Yellow status).", isError: true });
            return;
        }

        setIsAssigningToPrepare(false);
        setIsModalOpen(true);
    };

    const openPrepareModal = () => {
        setIsAssigningToPrepare(true);
        setIsModalOpen(true);
    };

    const handleConfirmAssignment = async (selectedPerson: Tester) => {
        if (isAssigning) return; // Prevent double clicks
        
        const assignmentsByDocId: Record<string, number[]> = {};
        for (const docId in selectedItems) {
            if (selectedItems[docId].size > 0) assignmentsByDocId[docId] = [...selectedItems[docId]];
        }
        
        if (Object.keys(assignmentsByDocId).length === 0) return;

        setIsAssigning(true);
        try {
            for (const docId in assignmentsByDocId) {
                const originalTask = categorizedTasks.find(t => t.docId === docId);
                const selectedIndices = assignmentsByDocId[docId];
                if (!originalTask) continue;

                if (isAssigningToPrepare) {
                    await assignItemsToPrepare(originalTask, selectedIndices, selectedPerson, selectedDate, selectedShift);
                } else {
                    const itemsToAssign = selectedIndices.map(index => {
                        const item = originalTask.tasks[index];
                        // If it's a Manual task, CLONE it with a new ID so the original stays as a template
                        if (originalTask.category === TaskCategory.Manual) {
                            return { 
                                ...item, 
                                _id: Math.random().toString(36).substring(2) + Date.now().toString(36) 
                            };
                        }
                        return item;
                    });

                    await addAssignedTask({
                        requestId: originalTask.id, 
                        tasks: itemsToAssign, 
                        category: originalTask.category,
                        testerId: selectedPerson.id, 
                        testerName: selectedPerson.name,
                        assignedDate: selectedDate, 
                        shift: selectedShift, 
                        status: TaskStatus.Pending,
                    });

                    // Only remove items from the pool if it's NOT a Manual task
                    if (originalTask.category !== TaskCategory.Manual) {
                        const remainingItems = originalTask.tasks.filter((_, index) => !selectedIndices.includes(index));
                        if (remainingItems.length > 0) await updateCategorizedTask(docId, { tasks: remainingItems });
                        else await deleteCategorizedTask(docId);
                    }
                }
            }
            const actionType = isAssigningToPrepare ? "sent to prepare" : "assigned";
            setNotification({ message: `Items ${actionType} to ${selectedPerson.name}.` });
            setSelectedItems({});
        } catch (err) {
            console.error("Failed to assign task:", err);
            setNotification({ message: "Failed to assign tasks.", isError: true });
        } finally {
            setIsAssigning(false);
            setIsModalOpen(false);
            fetchData();
        }
    };
    
    // --- EXPORT FUNCTION ---
    const handleExport = () => {
        try {
            const exportData = gridData.map(row => {
                const rowObj: any = { 'Request ID': row.requestId.replace(/^RS1-/, '') };
                
                // Add counts per column
                activeGridHeaders.forEach(([group, subKeys]) => {
                    subKeys.forEach(key => {
                        const items = row.cells[key];
                        const displayKey = key.split('|')[1];
                        const fullKey = `${group} - ${displayKey}`;
                        rowObj[fullKey] = items ? items.length : '';
                    });
                });
                
                rowObj['Unmapped'] = row.unmappedItems.length || '';
                return rowObj;
            });

            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(exportData);
            XLSX.utils.book_append_sheet(wb, ws, "Tasks Summary");
            XLSX.writeFile(wb, `Tasks_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
        } catch (e) {
            console.error("Export failed", e);
            setNotification({ message: "Failed to export Excel.", isError: true });
        }
    };

    // Manual Task Handlers
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

            setManualDesc('');
            setManualQty('');
            setManualVariant('');
            setNotification({ message: "Manual task added successfully" });
            fetchData();
        } catch (e) {
            setNotification({ message: "Failed to add manual task", isError: true });
        }
    };

    const handleDeleteManualTask = async () => {
        if (!confirmDeleteManual) return;
        const { docId } = confirmDeleteManual;
        
        try {
            await deleteCategorizedTask(docId);
            setNotification({ message: "Manual task deleted" });
            fetchData();
        } catch (e) {
            setNotification({ message: "Failed to delete task", isError: true });
        } finally {
            setConfirmDeleteManual(null);
        }
    };

    // --- RENDER COMPONENTS ---
    const CategoryButton: React.FC<{ name: string; value: string; count: number }> = ({ name, value, count }) => (
        <button
            onClick={() => setActiveCategory(value)}
            className={`px-3 py-1.5 text-sm font-semibold rounded-md transition-all flex items-center gap-2 border ${activeCategory === value ? 'bg-primary-600 text-white border-primary-600 shadow-md transform scale-105' : 'bg-white dark:bg-base-800 text-base-600 border-base-200 dark:border-base-700 hover:border-primary-300'}`}
        >
            {name} <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeCategory === value ? 'bg-white/20 text-white' : 'bg-base-100 text-base-500'}`}>{count}</span>
        </button>
    );

    const getCategoryCount = (category: string) => {
        if (category === 'all') return categorizedTasks.filter(t => t.category !== TaskCategory.Manual).length;
        return categorizedTasks.filter(t => t.category === category).length;
    };
    
    const ExpandableCell: React.FC<{ headerKey: string; items: { task: RawTask; originalIndex: number; sourceDocId: string }[]; isGroupEnd?: boolean }> = ({ headerKey, items, isGroupEnd }) => {
        if (!items || items.length === 0) return <td className={`p-0 align-top ${isGroupEnd ? 'border-r-2 border-base-300 dark:border-base-600' : 'border-r dark:border-base-700'}`}></td>;

        const primaryDocId = items[0].sourceDocId; 
        const isExpanded = expandedCell?.docId === primaryDocId && expandedCell?.headerKey === headerKey;

        const numSelected = items.reduce((count, item) => {
            return count + (selectedItems[item.sourceDocId]?.has(item.originalIndex) ? 1 : 0);
        }, 0);
        
        const areAllSelected = items.length > 0 && numSelected === items.length;

        const toggleAll = (checked: boolean) => {
            setSelectedItems(prev => {
                const next = { ...prev };
                items.forEach(item => {
                    const currentSet = new Set(next[item.sourceDocId] || []);
                    if (checked) currentSet.add(item.originalIndex);
                    else currentSet.delete(item.originalIndex);
                    next[item.sourceDocId] = currentSet;
                });
                return next;
            });
        };

        return (
            <td className={`p-0 align-top transition-all relative ${isGroupEnd ? 'border-r-2 border-base-300 dark:border-base-600' : 'border-r dark:border-base-700'} ${isExpanded ? 'bg-white dark:bg-base-800 ring-2 ring-primary-500 shadow-lg z-20 rounded-sm' : 'hover:bg-base-50 dark:hover:bg-base-700'}`}>
                <div className="p-1.5 text-center cursor-pointer h-full flex flex-col justify-center min-h-[38px]" onClick={() => setExpandedCell(isExpanded ? null : { docId: primaryDocId, headerKey })}>
                    <div className="flex items-center justify-center gap-1">
                        <span className={`font-bold text-sm ${numSelected > 0 ? 'text-primary-600 dark:text-primary-400' : 'text-base-700 dark:text-base-300'}`}>{numSelected > 0 ? numSelected : items.length}</span>
                    </div>
                    {/* Visual Indicators */}
                    <div className="flex justify-center gap-1 mt-0.5">
                        {items.some(i => i.task.isReturned) && <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>}
                        {items.some(i => i.task.preparationStatus === 'Awaiting Preparation') && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>}
                        {items.some(i => i.task.preparationStatus === 'Prepared' || i.task.preparationStatus === 'Ready for Testing') && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>}
                    </div>
                </div>
                
                {isExpanded && (
                    <div className="absolute top-full left-0 min-w-[300px] w-max max-w-[400px] bg-white dark:bg-base-800 border dark:border-base-600 shadow-2xl rounded-b-xl overflow-hidden z-50 animate-fade-in origin-top-left">
                        <div className="p-2 bg-base-50 dark:bg-base-700 border-b dark:border-base-600 flex justify-between items-center">
                            <span className="text-xs font-bold text-base-500 uppercase tracking-wider">Items</span>
                            <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                                <input type="checkbox" className="rounded text-primary-600 focus:ring-primary-500" checked={areAllSelected} onChange={e => toggleAll(e.target.checked)}/>
                                Select All
                            </label>
                        </div>
                        <div className="max-h-60 overflow-y-auto custom-scrollbar">
                            <table className="w-full text-xs text-left">
                                <tbody className="divide-y divide-base-100 dark:divide-base-700">
                                    {items.map(({ task, originalIndex, sourceDocId }, idx) => {
                                        const isSelected = selectedItems[sourceDocId]?.has(originalIndex) || false;
                                        const isReturned = task.isReturned;
                                        const prepStatus = task.preparationStatus;
                                        
                                        return (
                                            <tr key={`${sourceDocId}-${originalIndex}`} className={`hover:bg-base-50 dark:hover:bg-base-700/50 transition-colors ${isReturned ? 'bg-red-50/50 dark:bg-red-900/10' : ''}`}>
                                                <td className="p-3 w-8 text-center">
                                                    <input 
                                                        type="checkbox" 
                                                        className="rounded text-primary-600 focus:ring-primary-500 cursor-pointer" 
                                                        checked={isSelected} 
                                                        onChange={e => handleSelectItem(sourceDocId, originalIndex, e.target.checked)}
                                                    />
                                                </td>
                                                <td className="p-3">
                                                    <div className="font-medium text-base-800 dark:text-base-200">{getTaskValue(task, 'Sample Name')}</div>
                                                    <div className="text-base-400 mt-0.5">{getTaskValue(task, 'Variant')}</div>
                                                    <div className="flex flex-wrap gap-1 mt-1.5">
                                                        {isReturned && (
                                                            <div className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded border border-red-200 flex items-center gap-1 w-fit" title={task.returnReason || ''}>
                                                                <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span> Returned: {task.returnedBy || 'Unknown'}
                                                            </div>
                                                        )}
                                                        {prepStatus === 'Awaiting Preparation' && (
                                                            <div className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200 flex items-center gap-1 w-fit">
                                                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span> Preparing
                                                            </div>
                                                        )}
                                                        {(prepStatus === 'Prepared' || prepStatus === 'Ready for Testing') && (
                                                            <div className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-200 flex items-center gap-1 w-fit">
                                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Ready
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

    return (
        <div className="flex flex-col h-[calc(100vh-140px)] space-y-4 animate-slide-in-up">
            {notification && <Toast message={notification.message} isError={notification.isError} onDismiss={() => setNotification(null)} />}
            
            <AssignmentModal 
                isOpen={isModalOpen} 
                onClose={() => setIsModalOpen(false)} 
                onAssign={handleConfirmAssignment} 
                personnel={onShiftPersonnel} 
                isPreparation={isAssigningToPrepare} 
                selectedItemCount={totalSelectedCount}
                isProcessing={isAssigning}
            />
            
            <ConfirmationModal
                isOpen={!!confirmDeleteManual}
                onClose={() => setConfirmDeleteManual(null)}
                onConfirm={handleDeleteManualTask}
                title="Delete Manual Task"
                message="Are you sure you want to delete this task?"
                confirmText="Delete"
                confirmColor="bg-red-600"
            />

            {/* HEADER AREA */}
            <div className="flex-shrink-0 space-y-4">
                <div className="flex justify-between items-end">
                    <div>
                         <h2 className="text-2xl font-bold text-base-900 dark:text-base-100">Tasks Queue</h2>
                         <p className="text-sm text-base-500">Manage and assign laboratory requests</p>
                    </div>
                    {/* EXPORT BUTTON */}
                    {activeCategory !== TaskCategory.Manual && (
                        <button 
                            onClick={handleExport}
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-sm flex items-center gap-2 text-sm transition-colors"
                        >
                            <span>Export Excel</span>
                        </button>
                    )}
                </div>

                <div className="p-4 bg-white dark:bg-base-800 rounded-xl border border-base-200 dark:border-base-700 shadow-sm space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex flex-wrap gap-2">
                            <CategoryButton name="All" value="all" count={getCategoryCount('all')}/>
                            <CategoryButton name="Urgent" value={TaskCategory.Urgent} count={getCategoryCount(TaskCategory.Urgent)}/>
                            <CategoryButton name="Normal" value={TaskCategory.Normal} count={getCategoryCount(TaskCategory.Normal)}/>
                            <CategoryButton name="PoCat" value={TaskCategory.PoCat} count={getCategoryCount(TaskCategory.PoCat)}/>
                            <div className="w-px h-8 bg-base-200 dark:bg-base-700 mx-2"></div>
                            <CategoryButton name="Manual" value={TaskCategory.Manual} count={getCategoryCount(TaskCategory.Manual)}/>
                        </div>
                        
                        {activeCategory !== TaskCategory.Manual && (
                            <label className="flex items-center gap-2 text-sm text-base-600 dark:text-base-400 cursor-pointer select-none bg-base-50 dark:bg-base-700 px-3 py-1.5 rounded-lg border border-base-200 dark:border-base-600">
                                <input type="checkbox" checked={hideEmptyColumns} onChange={e => setHideEmptyColumns(e.target.checked)} className="rounded text-primary-600 focus:ring-primary-500" />
                                Hide Empty Columns
                            </label>
                        )}
                    </div>
                    
                    {activeCategory !== TaskCategory.Manual && (
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 border-t border-base-100 dark:border-base-700 pt-4">
                            <input type="text" placeholder="Filter by Request ID..." value={filterRequestId} onChange={e => setFilterRequestId(e.target.value)} className="md:col-span-2 p-2.5 rounded-xl bg-base-50 dark:bg-base-900 border border-base-200 dark:border-base-700 focus:bg-white focus:ring-2 focus:ring-primary-100 transition-all"/>
                            <div><label className="text-xs font-bold text-base-400 uppercase ml-1">Assigned Date</label><input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="w-full mt-1 p-2.5 rounded-xl bg-base-50 dark:bg-base-900 border border-base-200 dark:border-base-700 focus:bg-white focus:ring-2 focus:ring-primary-100 transition-all cursor-pointer"/></div>
                            <div><label className="text-xs font-bold text-base-400 uppercase ml-1">Current Shift</label><select value={selectedShift} onChange={e => setSelectedShift(e.target.value as 'day'|'night')} className="w-full mt-1 p-2.5 rounded-xl bg-base-50 dark:bg-base-900 border border-base-200 dark:border-base-700 focus:bg-white focus:ring-2 focus:ring-primary-100 transition-all cursor-pointer"><option value="day">Day Shift</option><option value="night">Night Shift</option></select></div>
                        </div>
                    )}
                </div>
                
                {activeCategory !== TaskCategory.Manual && (
                    <div className="p-3 bg-primary-50 dark:bg-primary-900/10 rounded-xl border border-primary-100 dark:border-primary-900/20 flex justify-between items-center sticky top-0 z-30 backdrop-blur-md bg-opacity-80">
                        <div className="flex items-center gap-3">
                            <h3 className="font-bold text-primary-800 dark:text-primary-300 flex items-center gap-2">
                                <CheckCircleIcon className="h-5 w-5"/>
                                Selected: <span className="text-xl">{totalSelectedCount}</span>
                            </h3>
                        </div>
                        <div className="flex gap-2">
                            <button 
                                onClick={openPrepareModal} 
                                disabled={totalSelectedCount === 0} 
                                className="px-5 py-2 text-sm font-bold bg-amber-400 text-amber-900 rounded-lg hover:bg-amber-500 hover:text-white transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                Send to Prepare
                            </button>
                            <button 
                                onClick={openAssignModal} 
                                disabled={totalSelectedCount === 0} 
                                className="px-5 py-2 text-sm font-bold bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-all shadow-md shadow-primary-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                            >
                                Assign Selected
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* CONTENT AREA */}
            <div className="flex-grow min-h-0 overflow-hidden border border-base-200 dark:border-base-700 rounded-2xl bg-white dark:bg-base-800 shadow-sm relative flex flex-col">
                {isLoading ? (<div className="flex flex-col items-center justify-center h-full text-base-400 gap-3"><div className="animate-spin h-8 w-8 border-4 border-primary-200 border-t-primary-600 rounded-full"></div>Loading tasks...</div>) :
                 error ? (<div className="flex items-center justify-center h-full text-red-500 font-medium">{error}</div>) : 
                 
                 activeCategory === TaskCategory.Manual ? (
                    // --- MANUAL TASK LIST VIEW ---
                    <div className="h-full flex flex-col">
                        <div className="p-4 bg-base-50 dark:bg-base-900/50 border-b border-base-200 dark:border-base-700 flex-shrink-0">
                             <h3 className="font-bold text-base-700 dark:text-base-200 mb-3 flex items-center gap-2">
                                 <span>⚡ Quick Add Manual Task</span>
                             </h3>
                             <div className="flex flex-col md:flex-row gap-3">
                                 <input type="text" placeholder="Task Description (e.g., Prepare Reagents)" value={manualDesc} onChange={e => setManualDesc(e.target.value)} className="flex-grow p-2.5 rounded-lg border border-base-300 dark:border-base-600 dark:bg-base-800 focus:ring-2 focus:ring-primary-500 outline-none"/>
                                 <input type="text" placeholder="Qty (Default: 1)" value={manualQty} onChange={e => setManualQty(e.target.value)} className="w-24 p-2.5 rounded-lg border border-base-300 dark:border-base-600 dark:bg-base-800 focus:ring-2 focus:ring-primary-500 outline-none"/>
                                 <input type="text" placeholder="Variant (Optional)" value={manualVariant} onChange={e => setManualVariant(e.target.value)} className="md:w-64 p-2.5 rounded-lg border border-base-300 dark:border-base-600 dark:bg-base-800 focus:ring-2 focus:ring-primary-500 outline-none"/>
                                 <button onClick={handleQuickAddManual} disabled={!manualDesc.trim()} className="px-6 py-2.5 bg-primary-600 text-white font-bold rounded-lg hover:bg-primary-700 disabled:opacity-50 shadow-md">Add Task</button>
                             </div>
                        </div>
                        
                        <div className="p-3 bg-white dark:bg-base-800 border-b border-base-200 dark:border-base-700 flex justify-between items-center flex-shrink-0">
                             <span className="text-sm font-semibold text-base-500">Selected: <b className="text-primary-600">{totalSelectedCount}</b></span>
                             <div className="flex gap-2">
                                 <button onClick={openPrepareModal} disabled={totalSelectedCount === 0} className="px-4 py-1.5 text-xs font-bold bg-amber-400 text-amber-900 rounded-md hover:bg-amber-500 hover:text-white disabled:opacity-50">Send to Prepare</button>
                                 <button onClick={openAssignModal} disabled={totalSelectedCount === 0} className="px-4 py-1.5 text-xs font-bold bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50">Assign Selected</button>
                             </div>
                        </div>

                        <div className="overflow-y-auto flex-grow custom-scrollbar min-h-0">
                            <table className="min-w-full text-sm text-left">
                                <thead className="bg-base-50 dark:bg-base-800 text-base-500 sticky top-0 z-10">
                                    <tr>
                                        <th className="p-4 w-12 text-center">Select</th>
                                        <th className="p-4">Description</th>
                                        <th className="p-4 w-24">Qty</th>
                                        <th className="p-4">Variant</th>
                                        <th className="p-4 w-20 text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-base-100 dark:divide-base-700">
                                    {categorizedTasks.filter(t => t.category === TaskCategory.Manual).map((group, idx) => {
                                        const task = group.tasks[0];
                                        if (!task) return null;
                                        const isSelected = selectedItems[group.docId!]?.has(0);
                                        return (
                                            <tr key={group.docId} className="hover:bg-base-50 dark:hover:bg-base-700/30 transition-colors">
                                                <td className="p-4 text-center">
                                                    <input type="checkbox" checked={isSelected} onChange={e => handleSelectItem(group.docId!, 0, e.target.checked)} className="rounded text-primary-600 focus:ring-primary-500 cursor-pointer h-4 w-4"/>
                                                </td>
                                                <td className="p-4 font-medium text-base-800 dark:text-base-200">{getTaskValue(task, 'Description')}</td>
                                                <td className="p-4 text-base-600">{getTaskValue(task, 'Quantity')}</td>
                                                <td className="p-4 text-base-500 italic">{getTaskValue(task, 'Variant') || '-'}</td>
                                                <td className="p-4 text-right">
                                                    <button onClick={() => setConfirmDeleteManual({docId: group.docId!, index: 0})} className="text-base-300 hover:text-red-500 transition-colors p-2 rounded-full hover:bg-red-50"><TrashIcon className="h-4 w-4"/></button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {categorizedTasks.filter(t => t.category === TaskCategory.Manual).length === 0 && (
                                        <tr><td colSpan={5} className="p-8 text-center text-base-400 italic">No manual tasks created yet.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                 ) : (
                    // --- EXCEL GRID VIEW ---
                    gridData.length === 0 ? (<div className="flex items-center justify-center h-full text-base-400 italic">No tasks match the current filters.</div>) : (
                    <div className="flex-grow overflow-auto min-h-0 custom-scrollbar relative">
                        <table className="min-w-full text-sm text-left border-collapse relative">
                            <thead className="bg-white/90 dark:bg-base-800/90 backdrop-blur-md sticky top-0 z-40 shadow-sm">
                                <tr>
                                    <th rowSpan={2} className="p-2 font-bold border-b border-r border-base-200 dark:border-base-700 w-52 sticky left-0 z-50 bg-white/95 dark:bg-base-800/95 shadow-[4px_0_10px_-4px_rgba(0,0,0,0.05)] text-base-700 dark:text-base-200">
                                        Request ID
                                    </th>
                                    {activeGridHeaders.map(([group, subKeys]) => (
                                        <th key={group} colSpan={subKeys.length} className="p-2 font-bold text-center border-b border-r-2 border-base-300 dark:border-base-600 text-primary-700 dark:text-primary-400 uppercase tracking-wide text-xs">
                                            {group}
                                        </th>
                                    ))}
                                    <th rowSpan={2} className="p-2 font-bold border-b border-base-200 dark:border-base-700 w-40 text-center text-base-500">Unmapped</th>
                                </tr>
                                <tr>
                                    {activeColumnKeys.map(key => {
                                        const display = key.split('|')[1];
                                        const isGroupEnd = lastKeysOfGroups.has(key);
                                        return <th key={key} className={`p-2 font-semibold text-center border-b ${isGroupEnd ? 'border-r-2 border-base-300 dark:border-base-600' : 'border-r border-base-200 dark:border-base-700'} w-32 text-xs text-base-500 truncate`}>{display}</th>
                                    })}
                                </tr>
                            </thead>
                            <tbody>
                                {gridData.map((row, idx) => {
                                    const isUrgentPriority = row.originalTasks.some(ot => ot.tasks.some(t => String(getTaskValue(t, 'Priority')).toLowerCase() === 'urgent'));
                                    const isSprint = row.originalTasks.some(ot => ot.tasks.some(t => String(getTaskValue(t, 'Purpose')).toLowerCase() === 'sprint'));
                                    
                                    const checkFields = ['Purpose', 'Priority', 'Remark (Requester)', 'Note to planer', 'Additional Information'];

                                    // Robust LSP check
                                    const isLSP = row.originalTasks.some(ot => ot.tasks.some(t => {
                                         return checkFields.some(f => String(getTaskValue(t, f)).toLowerCase().includes('lsp'));
                                    }));
                                    
                                    // Robust PoCat detection
                                    const isPoCatText = row.originalTasks.some(ot => ot.tasks.some(t => {
                                         return checkFields.some(f => {
                                            const val = String(getTaskValue(t, f)).toLowerCase().replace(/\s/g, '');
                                            return val.includes('pocat');
                                         });
                                    }));
                                    
                                    const isPoCatCategory = row.originalTasks.some(ot => ot.category === TaskCategory.PoCat);
                                    const isPoCat = isPoCatText || isPoCatCategory;
                                    
                                    const isUrgent = isUrgentPriority; 

                                    const dueDate = row.originalTasks.flatMap(t => t.tasks).find(t => getTaskValue(t, 'Due finish')) ? formatDate(getTaskValue(row.originalTasks.flatMap(t => t.tasks).find(t => getTaskValue(t, 'Due finish'))!, 'Due finish')) : '';

                                    // Zebra striping
                                    const rowClass = idx % 2 === 0 ? 'bg-white dark:bg-base-800' : 'bg-base-50/50 dark:bg-base-800/50';

                                    return (
                                        <tr key={row.requestId} className={`border-b border-base-100 dark:border-base-700 last:border-b-0 hover:bg-primary-50/30 dark:hover:bg-primary-900/10 transition-colors group ${rowClass}`}>
                                            <td className={`p-1 border-r border-base-200 dark:border-base-700 sticky left-0 z-30 ${rowClass} group-hover:bg-primary-50/30 dark:group-hover:bg-primary-900/10 shadow-[4px_0_10px_-4px_rgba(0,0,0,0.05)] align-top w-52`}>
                                                <div className="flex flex-col justify-center h-full relative pl-3 py-1">
                                                    {/* Status Line Indicator */}
                                                    <div className={`absolute left-0 top-1 bottom-1 w-1 rounded-full ${isUrgent || isSprint ? 'bg-status-urgent' : isLSP ? 'bg-status-lsp' : isPoCat ? 'bg-status-pocat' : 'bg-status-normal'}`}></div>
                                                    
                                                    {/* Row 1: ID + Badges */}
                                                    <div className="flex items-center gap-2 mb-0.5">
                                                        <span className="font-bold text-sm text-base-900 dark:text-base-100 whitespace-nowrap">
                                                            {row.requestId.replace(/^RS1-/, '')}
                                                        </span>
                                                        <div className="flex gap-1 flex-shrink-0">
                                                            {isSprint && <span className="px-1 py-px text-[9px] font-black text-white bg-status-urgent rounded uppercase">Sprint</span>}
                                                            {isUrgent && !isSprint && <span className="px-1 py-px text-[9px] font-black text-white bg-status-urgent rounded uppercase">Urgent</span>}
                                                            {isLSP && <span className="px-1 py-px text-[9px] font-black text-white bg-status-lsp rounded uppercase">LSP</span>}
                                                            {isPoCat && <span className="px-1 py-px text-[9px] font-black text-white bg-status-pocat rounded uppercase">PoCat</span>}
                                                        </div>
                                                    </div>

                                                    {/* Row 2: Due Date */}
                                                    <div className="text-[10px] text-base-500 dark:text-base-400 font-medium truncate">
                                                        {dueDate ? `Due ${dueDate}` : '-'}
                                                    </div>
                                                </div>
                                            </td>
                                            
                                            {activeColumnKeys.map(key => (
                                                <ExpandableCell key={key} headerKey={key} items={row.cells[key] || []} isGroupEnd={lastKeysOfGroups.has(key)} />
                                            ))}
                                            <ExpandableCell headerKey="unmapped" items={row.unmappedItems || []} />
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    )
                 )}
            </div>
        </div>
    );
};

export default TasksTab;
