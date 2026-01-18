import type {
    TabInfo, TabContent, ClusterResult, MemoryStatus, Message, MessageResponse
} from '../types/messages';


const API_BASE_URL = 'http://localhost:8000'

chrome.runtime.onInstalled.addListener((details) => {
    console.log('Chronicle Extension installd!', details.reason);

    chrome.storage.local.set({
        settings: {
            autoGroupEnabled: false,
            memoryThreshold: 80,
            inactiveThreshold: 24 * 60,
        },
        tabMetadata: {},
    })
})

chrome.runtime.onMessage.addListener(
    (message: Message, sender, sendResponse) => {
        console.log('[Chronicle] Received message', message.type);

        handleMessage(message, sender).then(sendResponse).catch((error) => {
            console.error('Error', error);
            sendResponse({ success: false, error: error.message });
        })
        return true;
    }
)

async function handleMessage(
    message: Message,
    sender: chrome.runtime.MessageSender
): Promise<MessageResponse> {
    switch (message.type) {
        case 'GET_ALL_TABS':
            return getAllTabs();

        case 'GET_MEMORY_STATUS':
            return getMemoryStatus();

        case 'CLUSTER_TABS':
            return clusterTabs();

        case 'CLOSE_TABS':
            return closeTabs(message.payload.tabIds);

        case 'CREATE_TAB_GROUP':
            return createTabGroup(
                message.payload.tabIds,
                message.payload.title,
                message.payload.color
            );

        default:
            return { success: false, error: 'Unknown message type' };
    }
}

// Tab Operations 
async function getAllTabs(): Promise<MessageResponse<TabInfo[]>> {
    try {
        const tabs = await chrome.tabs.query({});
        // Change this line (around line 66):
        const { tabMetadata = {} } = await chrome.storage.local.get('tabMetadata') as {
            tabMetadata?: Record<number, { lastInteraction?: number }>
        };

        const tabInfos: TabInfo[] = tabs.map((tab) => ({
            id: tab.id!,
            url: tab.url || '',
            title: tab.title || '',
            favIconUrl: tab.favIconUrl,
            pinned: tab.pinned,
            groupId: tab.groupId,
            lastAccessed: tab.lastAccessed || Date.now(),
            active: tab.active,
            importanceScore: calculateImportance(tab, tabMetadata[tab.id!])
        }));

        return { success: true, data: tabInfos };
    } catch (error) {
        return { success: false, error: (error as Error).message };
    }
}

function calculateImportance(
    tab: chrome.tabs.Tab,
    metadata?: { lastInteraction?: number }
): number {
    let score = 50; // Start at middle

    // Pinned tabs are always important
    if (tab.pinned) return 100;

    // Active tab is important
    if (tab.active) score += 25;

    // Recently accessed = more important
    const hoursSinceAccess = (Date.now() - (tab.lastAccessed || 0)) / (1000 * 60 * 60);

    if (hoursSinceAccess < 1) score += 20;       // Last hour
    else if (hoursSinceAccess < 6) score += 10;  // Last 6 hours  
    else if (hoursSinceAccess > 48) score -= 20; // Over 2 days

    // Clamp between 0 and 100
    return Math.max(0, Math.min(100, score));
}

async function getMemoryStatus(): Promise<MessageResponse<MemoryStatus>> {
    try {
        const info = await chrome.system.memory.getInfo();
        const used = info.capacity - info.availableCapacity;
        const usagePercent = (used / info.capacity) * 100;

        return {
            success: true,
            data: {
                total: info.capacity,
                available: info.availableCapacity,
                used,
                usagePercent,
            }
        };
    } catch (error) {
        return { success: false, error: (error as Error).message }
    }
}

// ============================================================================
// TAB GROUPING
// ============================================================================

async function createTabGroup(
    tabIds: number[],
    title: string,
    color?: 'grey' | 'blue' | 'red' | 'yellow' | 'green' | 'pink' | 'purple' | 'cyan' | 'orange'
): Promise<MessageResponse<{ groupId: number }>> {
    try {
        // Guard: Can't create a group with no tabs
        if (tabIds.length === 0) {
            return { success: false, error: 'No tabs provided' };
        }

        // Step 1: Create the group and add tabs to it
        const groupId = await chrome.tabs.group({ tabIds: tabIds as [number, ...number[]] });

        // Step 2: Set the group's title and color
        await chrome.tabGroups.update(groupId, {
            title,
            color: color || 'blue'
        });

        return { success: true, data: { groupId } };
    } catch (error) {
        return { success: false, error: (error as Error).message };
    }
}

// ============================================================================
// CLOSE TABS
// ============================================================================

async function closeTabs(
    tabIds: number[]
): Promise<MessageResponse<{ closed: TabInfo[]; summary: string }>> {
    try {
        // Get tab info BEFORE closing (for the summary)
        const tabsToClose = await Promise.all(
            tabIds.map((id) => chrome.tabs.get(id))
        );

        // Actually close the tabs
        await chrome.tabs.remove(tabIds);

        // Build info about what was closed
        const closedInfo: TabInfo[] = tabsToClose.map((tab) => ({
            id: tab.id!,
            url: tab.url || '',
            title: tab.title || '',
            pinned: tab.pinned,
            groupId: tab.groupId,
            lastAccessed: tab.lastAccessed || 0,
            active: tab.active,
            importanceScore: 0,
        }));

        // Generate a simple summary (we'll make this AI-powered later!)
        const summary = `Closed ${closedInfo.length} tabs: ${closedInfo.map(t => t.title).slice(0, 3).join(', ')
            }${closedInfo.length > 3 ? '...' : ''}`;

        return { success: true, data: { closed: closedInfo, summary } };
    } catch (error) {
        return { success: false, error: (error as Error).message };
    }
}

async function clusterTabs(): Promise<MessageResponse<ClusterResult[]>> {
    try {
        const tabs = await chrome.tabs.query({});
        const tabContents: TabContent[] = [];

        for (const tab of tabs) {
            if (!tab.id || !tab.url) continue;

            if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
                continue;
            }

            tabContents.push({
                tabId: tab.id,
                url: tab.url,
                title: tab.title || '',
                text: tab.title || '',  // We'll enhance this with content script
                keywords: [],
            });


        }
        const response = await fetch(`${API_BASE_URL}/api/cluster`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tabs: tabContents }),
        })

        if (!response.ok) {
            throw new Error(`Backend error: ${response.status}`);
        }
        const clusters: ClusterResult[] = await response.json();
        return { success: true, data: clusters };
    } catch (error) {
        return { success: false, error: (error as Error).message }
    }
}