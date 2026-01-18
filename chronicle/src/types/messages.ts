export interface TabInfo {
    id: number;
    url: string;
    title: string;
    favIconUrl?: string;
    pinned: boolean;
    groupId: number;
    lastAccessed: number;
    active: boolean;
    importanceScore: number;
}

export interface TabContent {
    tabId: number;
    url: string;
    title: string;
    text: string;
    keywords: string[];
}

export interface ClusterResult {
    id: string;
    name: string;
    color: ChromeGroupColor;
    tabIds: number[];
    confidence: number
}

export type ChromeGroupColor =
    | 'grey' | 'blue' | 'red' | 'yellow'
    | 'green' | 'pink' | 'purple' | 'cyan' | 'orange';

export interface MemoryStatus {
    total: number;
    available: number;
    used: number;
    usagePercent: number;
}

export type Message =
    | { type: 'GET_ALL_TABS' }
    | { type: 'GET_MEMORY_STATUS' }
    | { type: 'CLUSTER_TABS' }
    | { type: 'CLOSE_TABS'; payload: { tabIds: number[] } }
    | { type: 'CREATE_TAB_GROUP'; payload: { tabIds: number[]; title: string; color?: ChromeGroupColor } }

export interface MessageResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
}