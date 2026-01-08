
export enum TaskCategory {
    Urgent = 'urgent',
    Normal = 'normal',
    PoCat = 'pocat',
    Manual = 'manual',
    Other = 'other',
}

export enum TaskStatus {
    Pending = 'Pending',
    Done = 'Done',
    NotOK = 'Not OK',
}

export interface RawTask {
    [key: string]: any; // Allows for dynamic headers from Excel
    _id?: string; // Unique identifier for tracking items across updates
    status?: TaskStatus;
    notOkReason?: string | null;
    preparationStatus?: 'Awaiting Preparation' | 'Ready for Testing' | 'Prepared' | null;
    isReturned?: boolean;
    returnReason?: string | null;
    returnedBy?: string | null;
    plannerNote?: string | null; // Added for custom notes by planner
    analystRemark?: string | null; // New: Remark from the analyst/tester during work
}

export interface Tester {
    id: string;
    name: string;
    team?: 'testers_3_3' | 'assistants_4_2' | null;
}

export interface CategorizedTask {
    id: string; // Request ID or Manual Task ID
    docId?: string; // Firestore document ID
    tasks: RawTask[];
    category: TaskCategory;
    originalDocId?: string; // For prepare tasks, to link back
    originalIndices?: number[]; // For prepare tasks, to link back to specific items
    returnReason?: string | null;
    returnedBy?: string | null;
    isReturnedPool?: boolean; // Flag to identify a dedicated pool for returned tasks
    order?: number; // User-defined sort order
    createdAt?: string; // Timestamp for returned tasks
    shift?: 'day' | 'night'; // Shift context when the task was returned
}

export interface GroupedTask {
    id: string; // Request ID
    tasks: RawTask[];
}

export interface AssignedTask {
    id: string; // Firestore document ID
    requestId: string;
    tasks: RawTask[];
    category: TaskCategory;
    testerId: string;
    testerName: string;
    assignedDate: string;
    shift: 'day' | 'night';
    status: TaskStatus; // This seems to be a default status for the whole group
    analystId?: string; // for backward compatibility
    analystName?: string; // for backward compatibility
}

export interface AssignedPrepareTask {
    id: string; // Firestore document ID
    requestId: string;
    tasks: RawTask[];
    category: TaskCategory; // The original category of the task
    assistantId: string;
    assistantName: string;
    assignedDate: string;
    shift: 'day' | 'night';
    originalDocId: string;
    originalIndices: number[];
}

export interface ShiftPattern {
    id: 'testers_3_3' | 'assistants_4_2';
}

export interface DailySchedule {
    id?: string; // date string 'YYYY-MM-DD'
    dayShiftTesters: string[];
    nightShiftTesters: string[];
    dayShiftAssistants: string[];
    nightShiftAssistants: string[];
}

export interface TaskTemplate {
    id?: string;
    description: string;
    quantity: string;
    remarks: string;
}

export interface TestMapping {
    id: string;
    description: string;
    variant: string;
    headerGroup: string;
    headerSub: string;
    order?: number;
}

export interface ShiftReport {
    id: string; // date_shift e.g., '2023-10-27_day'
    date: string;
    shift: 'day' | 'night';
    instruments: { name: string; status: 'normal' | 'abnormal' }[];
    infrastructureNote?: string; // Note for abnormal status
    wasteLevel: 'low' | 'medium' | 'high';
    cleanliness: 'good' | 'bad';
    cleanlinessNote: string;
    cleanlinessImage?: string; // Base64
}
