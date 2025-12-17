
import { firestore } from './firebase';
import type { Tester, CategorizedTask, AssignedTask, DailySchedule, RawTask, AssignedPrepareTask, TestMapping } from '../types';
import { TaskCategory } from '../types';

const getCollection = (collectionName: string) => firestore.collection(collectionName);

// --- Tester Management ---
export const getTesters = async (): Promise<Tester[]> => {
    if (!firestore) throw new Error("Database not initialized");
    const snapshot = await getCollection('analysts').get();
    return snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }) as Tester);
};

export const addTester = async (name: string): Promise<Tester> => {
    const docRef = await getCollection('analysts').add({ name });
    return { id: docRef.id, name };
};

export const updateTester = async (id: string, updates: Partial<Tester>): Promise<void> => {
    await getCollection('analysts').doc(id).update(updates);
};

export const deleteTester = async (id: string): Promise<void> => {
    await getCollection('analysts').doc(id).delete();
};

// --- Test Mapping Management ---
export const getTestMappings = async (): Promise<TestMapping[]> => {
    if (!firestore) return [];
    const snapshot = await getCollection('testMappings').get();
    const mappings = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }) as TestMapping);
    return mappings.sort((a, b) => {
        const orderA = a.order ?? Infinity;
        const orderB = b.order ?? Infinity;
        if (orderA !== orderB) return orderA - orderB;
        const groupCompare = a.headerGroup.localeCompare(b.headerGroup);
        if (groupCompare !== 0) return groupCompare;
        return a.headerSub.localeCompare(b.headerSub);
    });
};

export const addTestMapping = async (mapping: Omit<TestMapping, 'id'>): Promise<TestMapping> => {
    const docRef = await getCollection('testMappings').add(mapping);
    return { id: docRef.id, ...mapping };
};

export const updateTestMapping = async (id: string, updates: Partial<TestMapping>): Promise<void> => {
    await getCollection('testMappings').doc(id).update(updates);
};

export const deleteTestMapping = async (id: string): Promise<void> => {
    await getCollection('testMappings').doc(id).delete();
};

// --- Categorized Task Management ---
export const getCategorizedTasks = async (): Promise<CategorizedTask[]> => {
    if (!firestore) throw new Error("Database not initialized");
    const snapshot = await getCollection('categorizedTasks').get();
    return snapshot.docs.map((doc: any) => ({ docId: doc.id, ...doc.data() }) as CategorizedTask);
};

export const addCategorizedTask = async (task: Omit<CategorizedTask, 'docId'>): Promise<void> => {
    await getCollection('categorizedTasks').add(task);
};

export const updateCategorizedTask = async (docId: string, updates: Partial<CategorizedTask>): Promise<void> => {
    await getCollection('categorizedTasks').doc(docId).update(updates);
};

export const deleteCategorizedTask = async (docId: string): Promise<void> => {
    await getCollection('categorizedTasks').doc(docId).delete();
};

// --- Daily Schedule Management ---
export const getDailySchedule = async (date: string): Promise<DailySchedule | null> => {
    if (!firestore) return null;
    const doc = await getCollection('dailySchedules').doc(date).get();
    return doc.exists ? ({ id: doc.id, ...doc.data() } as DailySchedule) : null;
};

export const saveDailySchedule = async (date: string, schedule: Omit<DailySchedule, 'id'>): Promise<void> => {
    await getCollection('dailySchedules').doc(date).set(schedule);
};

export const getExistingScheduleDates = async (): Promise<string[]> => {
    if (!firestore) return [];
    try {
        const snapshot = await getCollection('dailySchedules').get();
        return snapshot.docs.map((doc: any) => doc.id);
    } catch (e) {
        console.error("Error fetching schedule dates:", e);
        return [];
    }
};

// --- Assigned Task Management ---
export const getAssignedTasks = async (): Promise<AssignedTask[]> => {
    if (!firestore) throw new Error("Database not initialized");
    const snapshot = await getCollection('assignedTasks').get();
    return snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }) as AssignedTask);
};

export const addAssignedTask = async (task: Omit<AssignedTask, 'id'>): Promise<void> => {
    await getCollection('assignedTasks').add(task);
};

export const updateAssignedTask = async (id: string, updates: Partial<AssignedTask>): Promise<void> => {
    await getCollection('assignedTasks').doc(id).update(updates);
};

export const deleteAssignedTask = async (id: string): Promise<void> => {
    await getCollection('assignedTasks').doc(id).delete();
};

// --- Prepare Task Management ---
export const getAssignedPrepareTasks = async (): Promise<AssignedPrepareTask[]> => {
    if (!firestore) throw new Error("Database not initialized");
    const snapshot = await getCollection('assignedPrepareTasks').get();
    return snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }) as AssignedPrepareTask);
};

export const updateAssignedPrepareTask = async (id: string, updates: Partial<AssignedPrepareTask>): Promise<void> => {
    await getCollection('assignedPrepareTasks').doc(id).update(updates);
};

export const assignItemsToPrepare = async (
    originalTask: CategorizedTask,
    indicesToAssign: number[],
    assistant: Tester,
    date: string,
    shift: 'day' | 'night'
) => {
    const itemsToAssign = indicesToAssign.map(index => {
         let item = { ...originalTask.tasks[index] } as RawTask;
         // Manual Tasks Logic: Clone with new ID, act as instance
         if (originalTask.category === TaskCategory.Manual) {
             item._id = Math.random().toString(36).substring(2) + Date.now().toString(36);
         }
         item.preparationStatus = 'Awaiting Preparation';
         return item;
    });
    
    const prepareTaskPayload: Omit<AssignedPrepareTask, 'id'> = {
        requestId: originalTask.id,
        tasks: itemsToAssign,
        category: originalTask.category,
        assistantId: assistant.id,
        assistantName: assistant.name,
        assignedDate: date,
        shift: shift,
        originalDocId: originalTask.docId!,
        originalIndices: indicesToAssign
    };
    await getCollection('assignedPrepareTasks').add(prepareTaskPayload);

    // Sync back status only if NOT manual
    if (originalTask.category !== TaskCategory.Manual) {
        const updatedTasks = originalTask.tasks.map((task, index) => {
            if (indicesToAssign.includes(index)) {
                return { ...task, preparationStatus: 'Awaiting Preparation' } as RawTask;
            }
            return task;
        });
        await updateCategorizedTask(originalTask.docId!, { tasks: updatedTasks });
    }
};

export const markItemAsPrepared = async (prepTask: AssignedPrepareTask, itemIndex: number) => {
    const updatedPrepTasks = [...prepTask.tasks];
    const targetItem = updatedPrepTasks[itemIndex];
    if (!targetItem) return;
    
    targetItem.preparationStatus = 'Prepared';
    await getCollection('assignedPrepareTasks').doc(prepTask.id).update({ tasks: updatedPrepTasks });

    // Sync back only if NOT manual
    if (prepTask.category !== TaskCategory.Manual) {
        try {
            const originalDoc = await getCollection('categorizedTasks').doc(prepTask.originalDocId).get();
            if (originalDoc.exists) {
                const data = originalDoc.data() as CategorizedTask;
                const originalTasks = [...data.tasks];
                let foundIndex = -1;
                
                if (targetItem._id) {
                    foundIndex = originalTasks.findIndex(t => t._id === targetItem._id);
                } 
                if (foundIndex === -1 && prepTask.originalIndices && prepTask.originalIndices[itemIndex] !== undefined) {
                    const idx = prepTask.originalIndices[itemIndex];
                    if (originalTasks[idx]) foundIndex = idx;
                }

                if (foundIndex !== -1) {
                    originalTasks[foundIndex] = { 
                        ...originalTasks[foundIndex], 
                        preparationStatus: 'Ready for Testing' 
                    } as RawTask;
                    await getCollection('categorizedTasks').doc(prepTask.originalDocId).update({ tasks: originalTasks });
                }
            }
        } catch (e) {
            console.error("Error syncing preparation status to original task:", e);
        }
    }
};

export const returnTaskToPool = async (categorizedTask: CategorizedTask): Promise<void> => {
    const tasksWithFlags = categorizedTask.tasks.map(t => ({
        ...t,
        isReturned: true,
        returnReason: categorizedTask.returnReason,
        returnedBy: categorizedTask.returnedBy
    }));

    const payload = {
        ...categorizedTask,
        tasks: tasksWithFlags,
        isReturnedPool: true,
        createdAt: new Date().toISOString()
    };
    await getCollection('categorizedTasks').add(payload);
};

// New function: Planner Unassign (Returns to pool WITHOUT 'returned' flag)
export const unassignTaskToPool = async (categorizedTask: CategorizedTask): Promise<void> => {
    // Reset status fields to make it look like a fresh task
    const cleanTasks = categorizedTask.tasks.map(t => {
        const { status, notOkReason, returnReason, returnedBy, isReturned, preparationStatus, ...rest } = t;
        return rest as RawTask;
    });

    const payload = {
        ...categorizedTask,
        tasks: cleanTasks,
        // Ensure NO returned flags on the group
        returnReason: null,
        returnedBy: null,
        isReturnedPool: false
    };
    
    await getCollection('categorizedTasks').add(payload);
};

// --- BATCH HELPERS ---
const deleteInBatches = async (refs: any[]) => {
    if (!firestore) throw new Error("Database not initialized");
    const BATCH_SIZE = 400;
    const total = refs.length;
    console.log(`[Batch Delete] Starting deletion of ${total} documents...`);

    for (let i = 0; i < total; i += BATCH_SIZE) {
        const chunk = refs.slice(i, i + BATCH_SIZE);
        const batch = firestore.batch();
        chunk.forEach((ref: any) => batch.delete(ref));
        await batch.commit();
    }
};

export const runCleanup = async () => {
    if (!firestore) throw new Error("Database not initialized");
    const catSnapshot = await getCollection('categorizedTasks').get();
    const refsToDelete: any[] = [];
    catSnapshot.forEach((doc: any) => {
        const data = doc.data() as CategorizedTask;
        if (!data.tasks || !Array.isArray(data.tasks) || data.tasks.length === 0) refsToDelete.push(doc.ref);
    });
    if (refsToDelete.length > 0) await deleteInBatches(refsToDelete);
    return { deleted: refsToDelete.length };
};

export const clearAllTaskData = async () => {
    if (!firestore) throw new Error("Database not initialized");
    const collections = ['categorizedTasks', 'assignedTasks', 'assignedPrepareTasks'];
    const refsToDelete: any[] = [];
    for (const colName of collections) {
        const snapshot = await getCollection(colName).get();
        snapshot.forEach((doc: any) => refsToDelete.push(doc.ref));
    }
    if (refsToDelete.length > 0) await deleteInBatches(refsToDelete);
};

// Helper
const getTaskValue = (task: RawTask, header: string): string | number => {
    const lowerCaseHeader = header.toLowerCase().trim();
    const key = Object.keys(task).find(k => k.toLowerCase().trim() === lowerCaseHeader);
    return key ? task[key] : '';
};
